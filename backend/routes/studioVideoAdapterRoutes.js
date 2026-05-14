import express from "express";
import {
  enqueueVideoJob,
  getVideoJob
} from "../services/video/videoService.js";
import { getVideoModelRegistry } from "../services/video/videoModelRegistry.js";
import { listWanPresets } from "../runtimes/wan/presets/wanPresets.js";
import studioVideoAdapter from "../skills/studio/studioVideoAdapter.js";

const {
  enqueueStudioVideoJob,
  getStudioVideoJobStatus
} = studioVideoAdapter;

function toPublicVideoStatus(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "queued" || normalized === "preparing" || normalized === "preparing_resources") return normalized || "pending";
  if (normalized === "generating") return "sampling";
  if (normalized === "combining") return "saving";
  if (normalized === "decoding" || normalized === "encoding" || normalized === "loading_model" || normalized === "sampling" || normalized === "saving") return normalized;
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

export default function createStudioVideoAdapterRoutes(context = {}) {
  const router = express.Router();

  router.post("/media/generate-video", async (req, res) => {
    try {
      console.log("[VideoAPI] request recebido", {
        route: "studio",
        projectId: req.body?.projectId || "",
        sceneId: req.body?.sceneId || "",
        mode: req.body?.mode || ""
      });
      const job = await enqueueStudioVideoJob(req.body || {}, {
        enqueueVideoJob: (payload) => enqueueVideoJob(payload, context)
      });
      if (!job?.id) {
        throw new Error("VideoAPI Studio nao registrou jobId apos chamar o motor de video.");
      }
      console.log("[VideoAPI] job criado", {
        route: "studio",
        jobId: job.id,
        status: job.status
      });
      return res.json({
        success: true,
        job: decorateVideoJobForApi(job)
      });
    } catch (err) {
      console.error("[VideoAPI] erro", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao criar job de video via adaptador do Studio."
      });
    }
  });

  router.get("/media/video-status", async (req, res) => {
    try {
      const jobId = String(req.query?.jobId || "").trim();
      if (!jobId) {
        return res.status(400).json({
          success: false,
          error: "jobId obrigatorio."
        });
      }

      const job = await getStudioVideoJobStatus(jobId, {
        getVideoJob
      });
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
        error: err.message || "Falha ao consultar job de video via adaptador do Studio."
      });
    }
  });

  router.get("/media/video-models", async (req, res) => {
    try {
      return res.json({
        success: true,
        ...getVideoModelRegistry(),
        wanPresets: listWanPresets()
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao listar registry de modelos de video.",
        roots: [],
        models: []
      });
    }
  });

  return router;
}
