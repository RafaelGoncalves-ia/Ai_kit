import express from "express";
import ProductionDemandService, { STATUS_VALUES, TYPE_VALUES } from "../services/productionDemandService.js";

const service = new ProductionDemandService();

function sendDemandOr404(res, demand) {
  if (!demand) {
    res.status(404).json({ success: false, error: "Demanda nao encontrada." });
    return;
  }

  res.json({ success: true, data: demand });
}

export default function createProductionRoutes() {
  const router = express.Router();

  router.get("/meta", (req, res) => {
    res.json({
      success: true,
      data: {
        statuses: STATUS_VALUES,
        types: TYPE_VALUES,
        clients: service.listClients()
      }
    });
  });

  router.get("/clients", (req, res) => {
    res.json({ success: true, data: service.listClients() });
  });

  router.get("/demands", (req, res) => {
    res.json({ success: true, data: service.list(req.query || {}) });
  });

  router.post("/demands", (req, res) => {
    try {
      const demand = service.create(req.body || {});
      res.status(201).json({ success: true, data: demand });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message || "Falha ao criar demanda." });
    }
  });

  router.patch("/demands/:id", (req, res) => {
    try {
      sendDemandOr404(res, service.update(req.params.id, req.body || {}));
    } catch (err) {
      res.status(400).json({ success: false, error: err.message || "Falha ao editar demanda." });
    }
  });

  router.delete("/demands/:id", (req, res) => {
    res.json({ success: true, deleted: service.delete(req.params.id) });
  });

  router.patch("/demands/:id/status", (req, res) => {
    try {
      sendDemandOr404(res, service.moveStatus(req.params.id, req.body?.status));
    } catch (err) {
      res.status(400).json({ success: false, error: err.message || "Falha ao mover demanda." });
    }
  });

  router.post("/demands/:id/publish", (req, res) => {
    try {
      sendDemandOr404(res, service.markPublished(req.params.id));
    } catch (err) {
      res.status(400).json({ success: false, error: err.message || "Falha ao publicar demanda." });
    }
  });

  return router;
}
