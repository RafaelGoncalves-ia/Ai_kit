import express from "express";
import WorkflowEngine from "../workflow/engine.js";

export default function createWorkflowRoutes(context) {
  const router = express.Router();
  const engine = new WorkflowEngine(context);

  router.post("/run", async (req, res) => {
    try {
      const workflowId = req.body?.workflow_id || req.body?.workflowId || "";
      if (!workflowId) {
        return res.status(400).json({
          ok: false,
          error: "workflow_id obrigatorio."
        });
      }
      const result = await engine.run(workflowId, req.body?.inputs || {});
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        workflow_id: req.body?.workflow_id || req.body?.workflowId || "",
        status: "failed",
        error: err.message,
        outputs: {},
        logs: []
      });
    }
  });

  return router;
}
