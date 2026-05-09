import express from "express";
import fs from "fs";
import path from "path";
import { createStableDiffusionClient } from "../services/sdClient.js";
import stableDiffusionConfigModule from "../config/stableDiffusionConfig.cjs";
import sdModelScannerModule from "../services/sdModelScanner.cjs";

const { loadStableDiffusionConfig } = stableDiffusionConfigModule;
const { scanStableDiffusionModels } = sdModelScannerModule;
const SD_TEMP_DIR = path.resolve(process.cwd(), "temp", "stable-diffusion");

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
    steps: Number(input.steps || input.sampling_steps || input.samplingSteps || 24),
    cfg_scale: Number(input.cfg_scale || input.cfgScale || 7),
    seed: Number(input.seed ?? -1),
    denoising_strength: Number(input.denoising_strength || input.denoisingStrength || 0.55),
    width: size?.width,
    height: size?.height,
    image_path: input.image_path || input.imagePath || null,
    mask_path: input.mask_path || input.maskPath || null,
    artboard
  };
}

function writeImageDataUrl(dataUrl = "", prefix = "sd-image") {
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
  const imagePath = input.image_path || input.imagePath || writeImageDataUrl(
    input.base_image_data_url || input.baseImageDataUrl || input.image_data_url || input.imageDataUrl,
    "inpaint-base"
  );
  const maskPath = input.mask_path || input.maskPath || writeImageDataUrl(
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

  async function handleGenerateRequest(req, res, modeOverride = null) {
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
        schedulers: client.schedulers
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

  router.post("/generate", async (req, res) => handleGenerateRequest(req, res));
  router.post("/txt2img", async (req, res) => handleGenerateRequest(req, res, "txt2img"));
  router.post("/img2img", async (req, res) => handleGenerateRequest(req, res, "img2img"));

  router.post("/inpaint", async (req, res) => {
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
    }
  });

  router.post("/outpaint", async (req, res) => {
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
    }
  });

  return router;
}
