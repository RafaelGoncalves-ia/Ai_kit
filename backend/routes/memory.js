import express from "express";
import db from "../database/sqlite.js";

const router = express.Router();

// LISTAR
router.get("/", (req, res) => {
  const data = db.prepare("SELECT * FROM memory").all();
  res.json(data);
});

// DELETE
router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM memory WHERE id=?")
    .run(req.params.id);

  res.json({ success: true });
});

export default router;