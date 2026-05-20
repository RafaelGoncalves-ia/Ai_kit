import express from "express";

function withModels(registry, selector = async () => ({})) {
  return async (req, res) => {
    try {
      const data = await selector(req);
      res.json(data);
    } catch (err) {
      console.error("[MODEL_REGISTRY][WARN] route failed", err);
      res.status(500).json({
        success: false,
        error: err.message || "Falha ao consultar registry de modelos.",
        models: []
      });
    }
  };
}

export default function createModelRoutes(context) {
  const router = express.Router();
  const registry = context.services?.modelRegistry || context.core?.modelRegistry;

  router.get("/", withModels(registry, (req) => registry.list({
    engine: req.query.engine,
    type: req.query.type,
    category: req.query.category,
    compatibleWith: req.query.compatibleWith,
    context: req.query.context
  }, { refresh: req.query.refresh === "true", reason: "api.models" })));

  router.get("/refresh", withModels(registry, () => registry.getRegistry({
    refresh: true,
    reason: "api.models.refresh"
  })));

  router.get("/image", withModels(registry, () => registry.list({
    context: "image"
  }, { reason: "api.models.image" })));

  router.get("/video", withModels(registry, () => registry.list({
    context: "video"
  }, { reason: "api.models.video" })));

  router.get("/gif", withModels(registry, () => registry.list({
    context: "gif"
  }, { reason: "api.models.gif" })));

  router.get("/loras", withModels(registry, (req) => registry.list({
    type: "lora",
    compatibleWith: req.query.engine || req.query.compatibleWith
  }, { reason: "api.models.loras" })));

  router.get("/vae", withModels(registry, (req) => registry.list({
    type: "vae",
    compatibleWith: req.query.engine || req.query.compatibleWith
  }, { reason: "api.models.vae" })));

  router.get("/by-engine/:engine", withModels(registry, (req) => registry.findByEngine(
    String(req.params.engine || "").toLowerCase(),
    { reason: "api.models.by-engine" }
  )));

  router.get("/compatible/:engine", withModels(registry, (req) => registry.compatible(
    String(req.params.engine || "").toLowerCase(),
    { reason: "api.models.compatible" }
  )));

  return router;
}
