import express from "express";
import {
  enqueueVideoJob,
  getVideoJob,
  listVideoJobs,
  cancelVideoJob
} from "../services/video/videoService.js";
import { getVideoModelRegistry } from "../services/video/videoModelRegistry.js";
import { listWanPresets, resolveWanPreset } from "../runtimes/wan/presets/wanPresets.js";

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

function normalizeVideoMode(value = "", hasStartImage = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["i2v", "image_to_video", "image-to-video", "standard-i2v"].includes(normalized)) {
    return "i2v";
  }
  if (["t2v", "text_to_video", "text-to-video", "standard-t2v"].includes(normalized)) {
    return "t2v";
  }
  return hasStartImage ? "i2v" : "t2v";
}

function resolveCanvasWanSize(input = {}, artboard = {}) {
  const visualWidth = Number(artboard?.width || input.artboard?.width || input.canvasWidth || 0);
  const visualHeight = Number(artboard?.height || input.artboard?.height || input.canvasHeight || 0);
  const width = visualWidth > 0 ? visualWidth : Number(input.width || 0);
  const height = visualHeight > 0 ? visualHeight : Number(input.height || 0);
  const ratio = width > 0 && height > 0 ? width / height : 1;
  if (ratio > 1.2) {
    return { width: 832, height: 480, ratio: "16:9" };
  }
  if (ratio < 0.8) {
    return { width: 480, height: 832, ratio: "9:16" };
  }
  return { width: 512, height: 512, ratio: "1:1" };
}

function normalizeWanLoras(loras = []) {
  return (Array.isArray(loras) ? loras : [])
    .filter((item) => item && (typeof item === "string" || item.enabled !== false))
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          id: `wan-lora-${index + 1}`,
          name: item,
          path: item,
          enabled: true,
          strength_model: 1,
          strength_clip: 1,
          weight: 1
        };
      }
      const strengthModel = Number(item.strength_model ?? item.strengthModel ?? item.weight ?? 1);
      const strengthClip = Number(item.strength_clip ?? item.strengthClip ?? item.weight ?? strengthModel);
      return {
        id: item.id || `wan-lora-${index + 1}`,
        name: item.name || item.label || item.path || `LoRA ${index + 1}`,
        path: item.path || "",
        enabled: item.enabled !== false,
        strength_model: Number.isFinite(strengthModel) ? strengthModel : 1,
        strength_clip: Number.isFinite(strengthClip) ? strengthClip : 1,
        weight: Number.isFinite(strengthModel) ? strengthModel : 1
      };
    })
    .filter((item) => item.path)
    .slice(0, 3);
}

function shouldResolveWanPreset(input = {}) {
  const runtime = String(input.runtime || input.videoRuntime || input.wanRuntime || process.env.VIDEO_WAN_RUNTIME || "").toLowerCase();
  return Boolean(input.presetId || input.durationSeconds || String(input.source || "").toLowerCase() === "canvas" || runtime.includes("wan"));
}

function normalizeVideoRequestPayload(input = {}, artboard = {}) {
  const startImage = input.inputImagePath || input.startImage || input.imagePath || input.image_path || "";
  const mode = normalizeVideoMode(input.mode || "", Boolean(startImage));
  const canvasWanSize = resolveCanvasWanSize(input, artboard);
  const useWanPreset = shouldResolveWanPreset(input);
  const requestedPresetId = String(input.presetId || input.preset_id || input.preset || "wan_wide_5s").trim() || "wan_wide_5s";
  const durationSeconds = input.durationSeconds ?? input.duration_seconds ?? input.duration;
  const resolvedWanPreset = useWanPreset
    ? resolveWanPreset(requestedPresetId, {
      seconds: durationSeconds ?? 5,
      width: canvasWanSize.width,
      height: canvasWanSize.height,
      ratio: canvasWanSize.ratio
    })
    : null;
  const ratio = resolvedWanPreset?.ratio || String(input.ratio || "").trim() || (
    Number(artboard?.width || 0) > 0 && Number(artboard?.height || 0) > 0
      ? `${artboard.width}:${artboard.height}`
      : "9:16"
  );

  return {
    sessionId: String(input.sessionId || "").trim(),
    source: String(input.source || "api").trim() || "api",
    prompt: input.prompt || "",
    negativePrompt: input.negativePrompt || input.negative_prompt || "",
    motionPrompt: input.motionPrompt || input.motion_prompt || "",
    startImage,
    endImage: input.endImage || input.end_image || "",
    duration: resolvedWanPreset?.seconds ?? input.duration,
    fps: resolvedWanPreset?.fps ?? input.fps,
    frames: resolvedWanPreset?.frames ?? input.frames,
    sequenceLength: resolvedWanPreset?.sequenceLength ?? input.sequenceLength,
    width: resolvedWanPreset?.width ?? input.width ?? artboard?.width ?? undefined,
    height: resolvedWanPreset?.height ?? input.height ?? artboard?.height ?? undefined,
    ratio,
    model: input.model || "",
    mode,
    loras: normalizeWanLoras(input.loras),
    seed: input.seed,
    steps: resolvedWanPreset?.steps ?? input.steps,
    cfg: resolvedWanPreset?.cfg ?? input.cfg ?? input.cfgScale ?? input.cfg_scale,
    sampler: resolvedWanPreset?.sampler ?? input.sampler ?? "",
    scheduler: resolvedWanPreset?.scheduler ?? input.scheduler ?? "",
    shift: resolvedWanPreset?.shift ?? input.shift ?? input.modelShift,
    denoise: resolvedWanPreset?.denoise ?? input.denoise,
    motionStrength: input.motionStrength,
    imageStrength: input.imageStrength,
    presetId: resolvedWanPreset ? requestedPresetId : input.presetId,
    preset: resolvedWanPreset ? requestedPresetId : (input.preset || input.quality || "standard"),
    quality: resolvedWanPreset ? requestedPresetId : (input.quality || input.preset || "standard"),
    references: Array.isArray(input.references) ? input.references : [],
    outputDir: input.outputDir || input.saveDir || "",
    saveToCanvasContext: Boolean(input.saveToCanvasContext),
    attachToCanvas: Boolean(input.attachToCanvas),
    fileName: input.fileName || input.name || ""
  };
}

function toPublicVideoStatus(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "queued" || normalized === "preparing" || normalized === "preparing_resources") return normalized || "pending";
  if (normalized === "generating") return "sampling";
  if (normalized === "combining") return "saving";
  if (normalized === "decoding" || normalized === "encoding" || normalized === "sampling" || normalized === "loading_model" || normalized === "saving") return normalized;
  if (normalized === "completed") return "done";
  if (normalized === "timeout") return "timeout";
  if (normalized === "failed" || normalized === "cancelled") return "error";
  return normalized || "pending";
}

function decorateVideoJobForApi(job = null) {
  if (!job) return null;
  return {
    ...job,
    internalStatus: job.status || "",
    status: toPublicVideoStatus(job.status),
    updatedAt: job.updatedAt || job.finishedAt || job.startedAt || job.createdAt || new Date().toISOString()
  };
}

export default function createMediaVideoRoutes(context) {
  const router = express.Router();

  router.post("/generate-video", async (req, res) => {
    try {
      console.log("[VideoAPI] request recebido", {
        source: req.body?.source || "api",
        mode: req.body?.mode || "",
        hasPrompt: Boolean(String(req.body?.prompt || "").trim()),
        hasStartImage: Boolean(req.body?.inputImagePath || req.body?.startImage || req.body?.imagePath)
      });
      const requestedSource = String(req.body?.source || "").trim().toLowerCase();
      const activeArtboard = requestedSource === "canvas" || req.body?.saveToCanvasContext
        ? await getActiveCanvasArtboard(context)
        : null;
      const payload = normalizeVideoRequestPayload(req.body || {}, activeArtboard || {});
      const job = await enqueueVideoJob(payload, context);
      if (!job?.id) {
        throw new Error("VideoAPI nao registrou jobId apos chamar o motor de video.");
      }
      console.log("[VideoAPI] job criado", {
        jobId: job.id,
        status: job.status,
        mode: job.mode || payload.mode || "",
        model: job.model?.id || payload.model || ""
      });

      return res.json({
        success: true,
        job: decorateVideoJobForApi(job)
      });
    } catch (err) {
      console.error("[VideoAPI] erro", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao criar job global de video."
      });
    }
  });

  router.post("/generate", async (req, res) => {
    try {
      const requestedSource = String(req.body?.source || "").trim().toLowerCase();
      const activeArtboard = requestedSource === "canvas" || req.body?.saveToCanvasContext
        ? await getActiveCanvasArtboard(context)
        : null;
      const payload = normalizeVideoRequestPayload(req.body || {}, activeArtboard || {});
      const job = await enqueueVideoJob(payload, context);
      if (!job?.id) {
        throw new Error("VideoAPI nao registrou jobId apos chamar o motor de video.");
      }
      return res.json({
        success: true,
        jobId: job.id,
        job: decorateVideoJobForApi(job)
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao criar job global de video."
      });
    }
  });

  router.get("/video-status", async (req, res) => {
    try {
      const jobId = String(req.query?.jobId || "").trim();
      if (!jobId) {
        return res.status(400).json({
          success: false,
          error: "jobId obrigatorio."
        });
      }

      const job = getVideoJob(jobId);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: "Job de video nao encontrado."
        });
      }

      return res.json({
        success: true,
        job: decorateVideoJobForApi(job)
      });
    } catch (err) {
      console.error("[VideoAPI] erro", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao consultar job global de video."
      });
    }
  });

  router.get("/jobs/:id", async (req, res) => {
    try {
      const jobId = String(req.params?.id || "").trim();
      const job = getVideoJob(jobId);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: "Job de video nao encontrado."
        });
      }
      return res.json({
        success: true,
        job: decorateVideoJobForApi(job)
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao consultar job global de video."
      });
    }
  });

  router.post("/cancel-video", async (req, res) => {
    try {
      const jobId = String(req.body?.jobId || "").trim();
      if (!jobId) {
        return res.status(400).json({
          success: false,
          error: "jobId obrigatorio."
        });
      }

      const job = cancelVideoJob(jobId);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: "Job de video nao encontrado para cancelamento."
        });
      }

      return res.json({
        success: true,
        job: decorateVideoJobForApi(job)
      });
    } catch (err) {
      console.error("[VideoAPI] erro", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao cancelar job global de video."
      });
    }
  });

  router.get("/list-video-jobs", async (req, res) => {
    try {
      const source = String(req.query?.source || "").trim();
      const sessionId = String(req.query?.sessionId || "").trim();

      return res.json({
        success: true,
        jobs: listVideoJobs({
          ...(source ? { source } : {}),
          ...(sessionId ? { sessionId } : {})
        }).map(decorateVideoJobForApi)
      });
    } catch (err) {
      console.error("[VideoAPI] erro", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao listar jobs globais de video.",
        jobs: []
      });
    }
  });

  router.get("/video-models", async (req, res) => {
    try {
      return res.json({
        success: true,
        ...getVideoModelRegistry(),
        wanPresets: listWanPresets()
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao listar modelos globais de video.",
        roots: [],
        loraRoots: [],
        models: [],
        loras: []
      });
    }
  });

  return router;
}
