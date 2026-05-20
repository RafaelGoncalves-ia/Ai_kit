import express from "express";

export default function createAnimateDiffRoutes(context) {
  const router = express.Router();

  router.post("/generate", async (req, res) => {
    try {
      const result = await context.services?.animatediff?.generate?.(req.body || {});
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(err.code === "ANIMATEDIFF_NOT_IMPLEMENTED" ? 501 : 500).json({
        success: false,
        error: err.message || "Falha ao executar AnimateDiff.",
        code: err.code || "ANIMATEDIFF_ERROR",
        details: err.details || null
      });
    }
  });

  return router;
}
