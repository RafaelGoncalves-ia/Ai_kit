import express from "express";
import { getVocabularySkill } from "../skills/vocabulary/VocabularySkill.js";

const router = express.Router();

router.get("/search", (req, res) => {
  try {
    const skill = getVocabularySkill();
    const query = String(req.query.q || "");
    const limit = Number(req.query.limit || 20);
    const results = skill.search(query, limit);
    res.json({
      success: true,
      items: results
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || "Falha ao buscar vocabulario."
    });
  }
});

router.get("/meta", (req, res) => {
  try {
    const skill = getVocabularySkill();
    res.json({
      success: true,
      ...skill.getMeta()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || "Falha ao carregar metadados do vocabulario."
    });
  }
});

router.post("/import", (req, res) => {
  try {
    const skill = getVocabularySkill();
    const filePath = String(req.body?.filePath || "").trim();

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: "filePath e obrigatorio."
      });
    }

    const result = skill.importFromExcel(filePath);
    return res.json({
      success: true,
      ...result,
      meta: skill.getMeta()
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || "Falha ao importar vocabulario."
    });
  }
});

export default router;
