import express from "express";
import {
  getComfyStatus,
  healthCheck,
  startComfyUI,
  stopComfyUI,
  listComfyWorkflowFiles,
  getWorkflowUiFields
} from "../services/comfy/comfyService.js";
import { loadComfyConfig } from "../services/comfy/comfyConfig.js";

export default function createComfyRoutes() {
  const router = express.Router();

  router.get("/status", async (req, res) => {
    const config = loadComfyConfig();
    try {
      await healthCheck(config);
      return res.json({
        success: true,
        config,
        comfyui: {
          ...getComfyStatus(),
          status: "online"
        }
      });
    } catch (err) {
      return res.json({
        success: true,
        config,
        comfyui: {
          ...getComfyStatus(),
          status: getComfyStatus().status === "starting" ? "starting" : "offline",
          error: err.message || String(err)
        }
      });
    }
  });

  router.post("/start", async (req, res) => {
    try {
      const status = await startComfyUI((message) => console.log(message));
      return res.json({ success: true, comfyui: status });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "Falha ao iniciar ComfyUI." });
    }
  });

  router.post("/stop", async (req, res) => {
    try {
      const status = await stopComfyUI((message) => console.log(message));
      return res.json({ success: true, comfyui: status });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "Falha ao parar ComfyUI." });
    }
  });

  router.get("/workflows", (req, res) => {
    try {
      return res.json({
        success: true,
        defaultWorkflow: process.env.WAN_WORKFLOW || "wan2.2",
        workflows: listComfyWorkflowFiles()
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "Falha ao listar workflows." });
    }
  });

  router.get("/workflows/:id/fields", (req, res) => {
    try {
      return res.json({
        success: true,
        workflow: getWorkflowUiFields(req.params.id)
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "Falha ao ler mapa do workflow." });
    }
  });

  return router;
}
