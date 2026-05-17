import express from "express";

const SUPPORTED_TASK_TYPES = new Set(["wan", "sd", "xtts", "studio", "canvas", "general"]);
const SUPPORTED_CLEAN_MODES = new Set(["startup", "idle", "manual", "project"]);

function getCacheManager(context = {}) {
  const manager = context.core?.cacheManager || context.services?.cacheManager;
  if (!manager) {
    throw new Error("Cache Manager nao inicializado.");
  }
  return manager;
}

function normalizeTaskType(value = "general") {
  const normalized = String(value || "general").trim().toLowerCase();
  return SUPPORTED_TASK_TYPES.has(normalized) ? normalized : "general";
}

export default function createCacheRoutes(context) {
  const router = express.Router();

  router.get("/report", async (req, res) => {
    try {
      const report = await getCacheManager(context).getCacheReport();
      res.json({
        success: true,
        data: report
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || "Falha ao gerar relatorio de cache."
      });
    }
  });

  router.post("/clean", async (req, res) => {
    try {
      const mode = String(req.body?.mode || "manual").trim().toLowerCase();
      if (!SUPPORTED_CLEAN_MODES.has(mode)) {
        return res.status(400).json({
          success: false,
          error: "Modo invalido. Use startup, idle, manual ou project."
        });
      }

      const manager = getCacheManager(context);
      const data = mode === "startup"
        ? await manager.runStartupCleanup()
        : mode === "idle"
          ? await manager.runIdleCleanup()
          : await manager.runManualCleanup({
            ...(req.body || {}),
            mode
          });

      res.json({
        success: true,
        data
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || "Falha ao limpar cache."
      });
    }
  });

  router.post("/before-heavy-task", async (req, res) => {
    try {
      const taskType = normalizeTaskType(req.body?.taskType);
      const data = await getCacheManager(context).runBeforeHeavyTask(taskType);
      res.json({
        success: true,
        data
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || "Falha ao preparar tarefa pesada."
      });
    }
  });

  router.post("/after-heavy-task", async (req, res) => {
    try {
      const taskType = normalizeTaskType(req.body?.taskType);
      const data = await getCacheManager(context).runAfterHeavyTask(taskType);
      res.json({
        success: true,
        data
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message || "Falha ao finalizar tarefa pesada."
      });
    }
  });

  return router;
}
