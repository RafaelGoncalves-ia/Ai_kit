import express from "express";
import { getRecentMemory } from "../skills/memory/memory.repository.js";
import { initDB } from "../skills/memory/sqlite.js";

const router = express.Router();

router.get("/", (req, res) => {
  initDB();
  const limit = Number(req.query.limit || 50);
  res.json(getRecentMemory(limit));
});

export default router;
