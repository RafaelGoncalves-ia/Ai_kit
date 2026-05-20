import express from "express";
import fs from "fs";
import path from "path";
import { createStableDiffusionClient } from "../services/sdClient.js";
import stableDiffusionConfigModule from "../config/stableDiffusionConfig.cjs";
import sdModelScannerModule from "../services/sdModelScanner.cjs";

const { loadStableDiffusionConfig } = stableDiffusionConfigModule;
const { scanStableDiffusionModels } = sdModelScannerModule;
const SD_TEMP_DIR = path.resolve(process.cwd(), "temp", "stable-diffusion");
const I2I_TEMP_DIR = path.resolve(process.cwd(), "output", "temp", "i2i");
const BATCH_I2I_OUTPUT_DIR = path.resolve(process.cwd(), "output", "batch-img2img");
const ALLOWED_IMAGE_DIRS = [
  I2I_TEMP_DIR,
  SD_TEMP_DIR,
  path.resolve(process.cwd(), "output")
];
const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MAX_LEGACY_DATA_URL_BYTES = 2 * 1024 * 1024;

function ensureI2ITempDir() {
  fs.mkdirSync(I2I_TEMP_DIR, { recursive: true });
}

function cleanupOldI2IFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    ensureI2ITempDir();
    const now = Date.now();
    for (const entry of fs.readdirSync(I2I_TEMP_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || !ALLOWED_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }
      const filePath = path.join(I2I_TEMP_DIR, entry.name);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.rmSync(filePath, { force: true });
      }
    }
  } catch (err) {
    console.warn(`[SD][I2I] Falha ao limpar temporarios antigos: ${err.message}`);
  }
}

function isPathInside(childPath = "", parentPath = "") {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateImagePath(filePath = "", label = "imagem") {
  const resolvedPath = path.resolve(String(filePath || "").trim());
  if (!resolvedPath) {
    return null;
  }
  const extension = path.extname(resolvedPath).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error(`Extensao invalida para ${label}. Use png, jpg, jpeg ou webp.`);
  }
  if (!ALLOWED_IMAGE_DIRS.some((allowedDir) => isPathInside(resolvedPath, allowedDir))) {
    throw new Error(`Caminho de ${label} fora das pastas permitidas.`);
  }
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo de ${label} nao encontrado.`);
  }
  return resolvedPath;
}

function validateBatchImagePath(filePath = "", label = "imagem") {
  const resolvedPath = path.resolve(String(filePath || "").trim());
  if (!resolvedPath) return null;
  const extension = path.extname(resolvedPath).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error(`Extensao invalida para ${label}. Use png, jpg, jpeg ou webp.`);
  }
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo de ${label} nao encontrado.`);
  }
  return resolvedPath;
}

function normalizeBatchImageInputs(input = {}) {
  const raw = [
    ...(Array.isArray(input.imagePaths) ? input.imagePaths : []),
    ...(Array.isArray(input.images) ? input.images : []),
    ...(Array.isArray(input.files) ? input.files : [])
  ];
  return raw
    .map((item) => typeof item === "string" ? item : (item?.path || item?.filePath || item?.imagePath || ""))
    .map((item, index) => validateBatchImagePath(item, `imagem ${index + 1}`))
    .filter(Boolean);
}

function unwrapCanvasToolResult(result = {}) {
  if (result?.status !== "ok") {
    return null;
  }
  return result.data || null;
}

async function getActiveCanvasArtboard(context) {
  try {
    const result = await context.invokeTool?.("canvas_control", {
      action: "list-artboard",
      timeoutMs: 5000
    });
    return unwrapCanvasToolResult(result)?.artboard || null;
  } catch {
    return null;
  }
}

function normalizeGenerationPayload(input = {}, artboard = {}) {
  const architecture = input.architecture || input.model_type || input.modelType || "sd15";
  const size = input.width && input.height
    ? { width: Number(input.width), height: Number(input.height), ratio: null }
    : null;
  return {
    prompt: input.prompt || input.positive_prompt || input.positivePrompt || "",
    negative_prompt: input.negative_prompt || input.negativePrompt || "",
    checkpoint: input.checkpoint || input.model || "",
    lora: input.lora || null,
    architecture,
    scheduler: input.scheduler || input.schedule_type || input.scheduleType || "DPMSolverMultistepScheduler",
    sampler: input.sampler || input.sampler_name || input.samplerName || "",
    steps: Number(input.steps || input.sampling_steps || input.samplingSteps || 24),
    cfg_scale: Number(input.cfg_scale || input.cfgScale || 7),
    seed: Number(input.seed ?? -1),
    denoising_strength: Number(input.denoising_strength || input.denoisingStrength || 0.55),
    width: size?.width,
    height: size?.height,
    image_path: input.initImagePath || input.image_path || input.imagePath || null,
    mask_path: input.mask_path || input.maskPath || null,
    artboard
  };
}

function writeImageDataUrl(dataUrl = "", prefix = "sd-image") {
  if (String(dataUrl || "").length > MAX_LEGACY_DATA_URL_BYTES) {
    throw new Error("Imagem base64 grande demais. Rasterize para arquivo temporario e envie initImagePath.");
  }
  const match = String(dataUrl || "").match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!match?.[1] || !match?.[2]) {
    return null;
  }

  const extension = match[1] === "jpeg" ? "jpg" : match[1];
  fs.mkdirSync(SD_TEMP_DIR, { recursive: true });
  const filePath = path.join(
    SD_TEMP_DIR,
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
  );
  fs.writeFileSync(filePath, Buffer.from(match[2], "base64"));
  return filePath;
}

function prepareImageInputs(input = {}) {
  cleanupOldI2IFiles();
  const rawImagePath = input.initImagePath || input.image_path || input.imagePath;
  const rawMaskPath = input.mask_path || input.maskPath;
  const imagePath = rawImagePath
    ? validateImagePath(rawImagePath, "imagem inicial")
    : writeImageDataUrl(
    input.base_image_data_url || input.baseImageDataUrl || input.image_data_url || input.imageDataUrl,
    "inpaint-base"
  );
  const maskPath = rawMaskPath
    ? validateImagePath(rawMaskPath, "mascara")
    : writeImageDataUrl(
    input.mask_image_data_url || input.maskImageDataUrl || input.mask_data_url || input.maskDataUrl,
    "inpaint-mask"
  );

  return {
    imagePath,
    maskPath
  };
}

export default function createStableDiffusionRoutes(context) {
  const router = express.Router();
  const client = createStableDiffusionClient();
  const batchJobs = new Map();

  async function handleGenerateRequest(req, res, modeOverride = null) {
    await context.core?.cacheManager?.runBeforeHeavyTask?.("sd").catch((err) => {
      console.warn(`[RESOURCE][SD] before cleanup failed: ${err.message}`);
    });
    try {
      const mode = String(modeOverride || req.body?.mode || "txt2img").trim();
      const activeArtboard = await getActiveCanvasArtboard(context);
      const artboard = activeArtboard || req.body?.artboard || {};
      const imageInputs = mode === "inpaint" || mode === "img2img" ? prepareImageInputs(req.body || {}) : {};
      const payload = {
        ...normalizeGenerationPayload(req.body || {}, artboard),
        image_path: imageInputs.imagePath || req.body?.image_path || req.body?.imagePath || null,
        mask_path: imageInputs.maskPath || req.body?.mask_path || req.body?.maskPath || null
      };
      if (mode === "img2img" || mode === "inpaint") {
        console.info("[SD][I2I] endpoint chamado", {
          mode,
          layer: req.body?.sourceLayerId || null,
          imagePath: payload.image_path || null,
          maskPath: payload.mask_path || null,
          width: payload.width || null,
          height: payload.height || null
        });
      }
      const resolvedSize = client.resolveGenerationSize({
        artboard,
        architecture: payload.architecture,
        width: payload.width,
        height: payload.height
      });
      const result = await client.generate(mode, {
        ...payload,
        width: resolvedSize.width,
        height: resolvedSize.height
      });
      const metadata = {
        ...(result.metadata || {}),
        width: resolvedSize.width,
        height: resolvedSize.height,
        ratio: resolvedSize.ratio,
        artboard,
        image_path: payload.image_path || null,
        mask_path: payload.mask_path || null,
        output_file: result.file || null
      };

      res.json({
        success: true,
        mode,
        file: result.file,
        metadata
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || "Falha ao gerar imagem com Stable Diffusion."
      });
    } finally {
      await context.core?.cacheManager?.runAfterHeavyTask?.("sd").catch((err) => {
        console.warn(`[RESOURCE][SD] after cleanup failed: ${err.message}`);
      });
    }
  }

  router.get("/health", async (req, res) => {
    const config = loadStableDiffusionConfig();
    const scanned = scanStableDiffusionModels(config);

    try {
      const worker = await client.health();
      res.json({
        success: true,
        ready: worker?.ready === true,
        config: {
          source: config.source,
          pythonPath: config.pythonPath,
          forgeVenv: config.forgeVenv,
          modelsRoot: config.modelsRoot,
          checkpointsPath: config.checkpointsPath,
          lorasPath: config.lorasPath,
          diffusionModelsPath: config.diffusionModelsPath,
          originalConfigsPath: config.originalConfigsPath,
          outputPath: config.outputPath,
          hfHome: config.hfHome,
          hfHubCache: config.hfHubCache,
          transformersCache: config.transformersCache,
          warnings: config.warnings,
          errors: config.errors,
          writable: config.writable
        },
        counts: {
          checkpoints: scanned.checkpoints.length,
          loras: scanned.loras.length,
          diffusionModels: scanned.diffusionModels.length
        },
        worker
      });
    } catch (err) {
      res.status(503).json({
        success: false,
        error: err.message || "Stable Diffusion worker indisponivel.",
        ready: false,
        workerUrl: client.baseUrl,
        config: {
          source: config.source,
          pythonPath: config.pythonPath,
          forgeVenv: config.forgeVenv,
          modelsRoot: config.modelsRoot,
          checkpointsPath: config.checkpointsPath,
          lorasPath: config.lorasPath,
          diffusionModelsPath: config.diffusionModelsPath,
          originalConfigsPath: config.originalConfigsPath,
          outputPath: config.outputPath,
          hfHome: config.hfHome,
          hfHubCache: config.hfHubCache,
          transformersCache: config.transformersCache,
          warnings: config.warnings,
          errors: config.errors,
          writable: config.writable
        },
        counts: {
          checkpoints: scanned.checkpoints.length,
          loras: scanned.loras.length,
          diffusionModels: scanned.diffusionModels.length
        }
      });
    }
  });

  router.get("/models", async (req, res) => {
    try {
      const config = loadStableDiffusionConfig();
      const scanned = scanStableDiffusionModels(config);
      res.json({
        success: true,
        ...scanned,
        counts: {
          checkpoints: scanned.checkpoints.length,
          loras: scanned.loras.length,
          diffusionModels: scanned.diffusionModels.length
        },
        selectableModels: scanned.checkpoints,
        config: {
          source: config.source,
          modelsRoot: config.modelsRoot,
          checkpointsPath: config.checkpointsPath,
          lorasPath: config.lorasPath,
          diffusionModelsPath: config.diffusionModelsPath,
          originalConfigsPath: config.originalConfigsPath,
          outputPath: config.outputPath,
          hfHome: config.hfHome,
          hfHubCache: config.hfHubCache,
          transformersCache: config.transformersCache,
          warnings: config.warnings,
          errors: config.errors,
          writable: config.writable
        },
        schedulers: client.schedulers,
        samplers: client.samplers,
        schedulerModes: client.schedulerModes
      });
    } catch (err) {
      res.status(503).json({
        success: false,
        error: err.message || "Falha ao listar modelos do worker SD.",
        checkpoints: [],
        loras: [],
        diffusionModels: []
      });
    }
  });

  router.get("/progress", async (req, res) => {
    try {
      const progress = await client.progress();
      res.json({
        success: true,
        ...progress
      });
    } catch (err) {
      res.status(503).json({
        success: false,
        error: err.message || "Falha ao consultar progresso do SD.",
        active: false,
        phase: "idle",
        percent: 0
      });
    }
  });

  router.post("/generate", async (req, res) => handleGenerateRequest(req, res));
  router.post("/txt2img", async (req, res) => handleGenerateRequest(req, res, "txt2img"));
  router.post("/img2img", async (req, res) => handleGenerateRequest(req, res, "img2img"));

  router.post("/batch-img2img", async (req, res) => {
    try {
      const imagePaths = normalizeBatchImageInputs(req.body || {});
      if (!imagePaths.length) {
        throw new Error("Envie ao menos uma imagem para o img2img em lote.");
      }

      fs.mkdirSync(BATCH_I2I_OUTPUT_DIR, { recursive: true });
      const jobId = `batch-img2img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const job = {
        id: jobId,
        status: "queued",
        total: imagePaths.length,
        completed: 0,
        failed: 0,
        outputs: [],
        errors: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        outputDir: BATCH_I2I_OUTPUT_DIR
      };
      batchJobs.set(jobId, job);
      console.log(`[BATCH_IMG2IMG] queued ${jobId} total=${imagePaths.length}`);
      context.core?.eventBus?.emit("batch-img2img:queued", { jobId, total: imagePaths.length, outputDir: BATCH_I2I_OUTPUT_DIR });

      res.json({
        success: true,
        queued: true,
        jobId,
        total: imagePaths.length,
        outputDir: BATCH_I2I_OUTPUT_DIR
      });

      void (async () => {
        await context.core?.cacheManager?.runBeforeHeavyTask?.("sd").catch((err) => {
          console.warn(`[RESOURCE][SD] before batch cleanup failed: ${err.message}`);
        });
        job.status = "running";
        for (let index = 0; index < imagePaths.length; index += 1) {
          const imagePath = imagePaths[index];
          try {
            context.core?.eventBus?.emit("batch-img2img:progress", {
              jobId,
              index,
              total: imagePaths.length,
              completed: job.completed,
              status: "processing",
              imagePath
            });
            const payload = {
              ...normalizeGenerationPayload(req.body || {}, req.body?.artboard || {}),
              image_path: imagePath,
              output_dir: BATCH_I2I_OUTPUT_DIR,
              denoising_strength: Number(req.body?.denoising_strength || req.body?.denoisingStrength || req.body?.strength || 0.55)
            };
            const result = await client.generate("img2img", payload);
            job.completed += 1;
            job.outputs.push({
              input: imagePath,
              file: result.file || "",
              metadata: result.metadata || {}
            });
          } catch (err) {
            job.failed += 1;
            job.errors.push({ input: imagePath, error: err.message || String(err) });
          } finally {
            job.updatedAt = new Date().toISOString();
            context.core?.eventBus?.emit("batch-img2img:progress", {
              jobId,
              index: index + 1,
              total: imagePaths.length,
              completed: job.completed,
              failed: job.failed,
              status: "running"
            });
          }
        }
        job.status = job.failed === imagePaths.length ? "error" : "completed";
        job.updatedAt = new Date().toISOString();
        context.core?.eventBus?.emit("batch-img2img:completed", { jobId, job });
        await context.core?.cacheManager?.runAfterHeavyTask?.("sd").catch((err) => {
          console.warn(`[RESOURCE][SD] after batch cleanup failed: ${err.message}`);
        });
      })();
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || "Falha ao enfileirar img2img em lote."
      });
    }
  });

  router.get("/batch-img2img/:jobId", (req, res) => {
    const job = batchJobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: "Job batch-img2img nao encontrado." });
    }
    return res.json({ success: true, job });
  });

  router.post("/inpaint", async (req, res) => {
    await context.core?.cacheManager?.runBeforeHeavyTask?.("sd").catch((err) => {
      console.warn(`[RESOURCE][SD] before cleanup failed: ${err.message}`);
    });
    try {
      const activeArtboard = await getActiveCanvasArtboard(context);
      const artboard = activeArtboard || req.body?.artboard || {};
      const imageInputs = prepareImageInputs(req.body || {});

      if (!imageInputs.imagePath) {
        throw new Error("Imagem base obrigatoria para inpaint.");
      }

      if (!imageInputs.maskPath) {
        throw new Error("Mascara obrigatoria para inpaint.");
      }

      const payload = {
        ...normalizeGenerationPayload(req.body || {}, artboard),
        image_path: imageInputs.imagePath,
        mask_path: imageInputs.maskPath
      };
      const resolvedSize = client.resolveGenerationSize({
        artboard,
        architecture: payload.architecture,
        width: payload.width,
        height: payload.height
      });
      const result = await client.generate("inpaint", {
        ...payload,
        width: resolvedSize.width,
        height: resolvedSize.height
      });
      const metadata = {
        ...(result.metadata || {}),
        width: resolvedSize.width,
        height: resolvedSize.height,
        ratio: resolvedSize.ratio,
        artboard,
        image_path: imageInputs.imagePath,
        mask_path: imageInputs.maskPath,
        output_file: result.file || null
      };

      res.json({
        success: true,
        mode: "inpaint",
        file: result.file,
        metadata
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || "Falha ao executar inpaint com Stable Diffusion."
      });
    } finally {
      await context.core?.cacheManager?.runAfterHeavyTask?.("sd").catch((err) => {
        console.warn(`[RESOURCE][SD] after cleanup failed: ${err.message}`);
      });
    }
  });

  router.post("/outpaint", async (req, res) => {
    await context.core?.cacheManager?.runBeforeHeavyTask?.("sd").catch((err) => {
      console.warn(`[RESOURCE][SD] before cleanup failed: ${err.message}`);
    });
    try {
      const activeArtboard = await getActiveCanvasArtboard(context);
      const artboard = req.body?.artboard || activeArtboard || {};
      const imageInputs = prepareImageInputs(req.body || {});

      if (!imageInputs.imagePath) {
        throw new Error("Imagem expandida obrigatoria para outpaint.");
      }

      if (!imageInputs.maskPath) {
        throw new Error("Mascara das areas novas obrigatoria para outpaint.");
      }

      const payload = {
        ...normalizeGenerationPayload(req.body || {}, artboard),
        image_path: imageInputs.imagePath,
        mask_path: imageInputs.maskPath
      };
      const resolvedSize = client.resolveGenerationSize({
        artboard,
        architecture: payload.architecture,
        width: payload.width,
        height: payload.height
      });
      const result = await client.generate("inpaint", {
        ...payload,
        width: resolvedSize.width,
        height: resolvedSize.height
      });
      const metadata = {
        ...(result.metadata || {}),
        mode: "outpaint",
        width: resolvedSize.width,
        height: resolvedSize.height,
        ratio: resolvedSize.ratio,
        artboard,
        image_path: imageInputs.imagePath,
        mask_path: imageInputs.maskPath,
        output_file: result.file || null,
        outpaint: req.body?.outpaint || null
      };

      res.json({
        success: true,
        mode: "outpaint",
        file: result.file,
        metadata
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || "Falha ao executar outpaint com Stable Diffusion."
      });
    } finally {
      await context.core?.cacheManager?.runAfterHeavyTask?.("sd").catch((err) => {
        console.warn(`[RESOURCE][SD] after cleanup failed: ${err.message}`);
      });
    }
  });

  return router;
}
