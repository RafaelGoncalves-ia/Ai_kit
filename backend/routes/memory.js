import express from "express";
import MemoryRepository, { loadMemoryConfig } from "../core/memory/memoryRepository.js";

const router = express.Router();

router.get("/", (req, res) => {
  const repository = new MemoryRepository({
    config: loadMemoryConfig()
  });
  const limit = Number(req.query.limit || 50);
  res.json(repository.listRecentMemories(limit));
});

export default router;
