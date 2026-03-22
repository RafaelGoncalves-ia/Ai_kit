import express from "express";
import multer from "multer";
import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

const router = express.Router();
const upload = multer({ dest: "temp/" });

router.post("/", upload.single("audio"), async (req, res) => {
  const inputPath = req.file.path;

  try {
    const formData = new FormData();
    formData.append("audio", fs.createReadStream(inputPath));

    const response = await fetch("http://localhost:5006/transcribe", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    res.json({ text: data.text });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "STT falhou" });

  } finally {
    fs.unlinkSync(inputPath);
  }
});

export default router;