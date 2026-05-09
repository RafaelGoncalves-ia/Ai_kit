import express from "express";
import {
  enqueueVideoJob,
  getVideoJob
} from "../services/video/videoService.js";
import { getVideoModelRegistry } from "../services/video/videoModelRegistry.js";
import studioVideoAdapter from "../skills/studio/studioVideoAdapter.js";

const {
  enqueueStudioVideoJob,
  getStudioVideoJobStatus
} = studioVideoAdapter;

export default function createStudioVideoAdapterRoutes() {
  const router = express.Router();

  router.post("/media/generate-video", async (req, res) => {
    try {
      const job = await enqueueStudioVideoJob(req.body || {}, {
        enqueueVideoJob
      });
      return res.json({
        success: true,
        job
      });
    } catch (err) {
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
        job
      });
    } catch (err) {
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
        ...getVideoModelRegistry()
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
