import express from "express";
import {
  enqueueVideoJob,
  getVideoJob,
  listVideoJobs,
  cancelVideoJob
} from "../services/video/videoService.js";

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

function normalizeVideoRequestPayload(input = {}, artboard = {}) {
  const ratio = String(input.ratio || "").trim() || (
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
    startImage: input.startImage || input.imagePath || input.image_path || "",
    endImage: input.endImage || input.end_image || "",
    duration: input.duration,
    fps: input.fps,
    width: input.width || artboard?.width || undefined,
    height: input.height || artboard?.height || undefined,
    ratio,
    model: input.model || "",
    preset: input.preset || input.quality || "standard",
    quality: input.quality || input.preset || "standard",
    references: Array.isArray(input.references) ? input.references : [],
    outputDir: input.outputDir || input.saveDir || "",
    saveToCanvasContext: Boolean(input.saveToCanvasContext),
    attachToCanvas: Boolean(input.attachToCanvas),
    fileName: input.fileName || input.name || ""
  };
}

export default function createMediaVideoRoutes(context) {
  const router = express.Router();

  router.post("/generate-video", async (req, res) => {
    try {
      const requestedSource = String(req.body?.source || "").trim().toLowerCase();
      const activeArtboard = requestedSource === "canvas" || req.body?.saveToCanvasContext
        ? await getActiveCanvasArtboard(context)
        : null;
      const payload = normalizeVideoRequestPayload(req.body || {}, activeArtboard || {});
      const job = await enqueueVideoJob(payload);

      return res.json({
        success: true,
        job
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
        job
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
        job
      });
    } catch (err) {
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
        })
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao listar jobs globais de video.",
        jobs: []
      });
    }
  });

  return router;
}
