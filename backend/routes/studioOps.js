import express from "express";
import fs from "fs";
import path from "path";
import { loadOps, saveOps } from "../services/studioMarketingOpsService.js";

const CLIENTS_ROOT = path.join(process.cwd(), "workspace", "clients");

function listClients() {
  if (!fs.existsSync(CLIENTS_ROOT)) return [];
  return fs.readdirSync(CLIENTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const clientDir = path.join(CLIENTS_ROOT, entry.name);
      const kitPath = path.join(clientDir, "client.kit");
      let kit = null;
      try {
        kit = JSON.parse(fs.readFileSync(kitPath, "utf8"));
      } catch {}
      return {
        id: entry.name,
        name: kit?.name || kit?.raw?.name || entry.name,
        accountType: kit?.accountType || kit?.raw?.accountType || (String(kit?.name || entry.name).toLowerCase().includes("adsune") ? "internal" : "client"),
        businessModel: kit?.businessModel || kit?.raw?.businessModel || "",
        segment: kit?.segment || kit?.raw?.segment || "",
        kitPath,
        updatedAt: kit?.updatedAt || null
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

export default function createStudioOpsRoutes() {
  const router = express.Router();

  router.get("/clients", (req, res) => {
    try {
      res.json({ success: true, data: listClients() });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message || "Falha ao listar clientes." });
    }
  });

  router.get("/load", (req, res) => {
    try {
      const data = loadOps({
        clientName: req.query?.clientName,
        month: req.query?.month
      });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message || "Falha ao carregar Studio Ops." });
    }
  });

  router.post("/save", (req, res) => {
    try {
      const data = saveOps(req.body || {});
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message || "Falha ao salvar Studio Ops." });
    }
  });

  return router;
}
