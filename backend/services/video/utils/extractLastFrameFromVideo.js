import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

export function extractLastFrameFromVideo({ inputPath = "", outputPath = "" } = {}) {
  if (!inputPath || !outputPath || !fs.existsSync(inputPath)) {
    return {
      success: false,
      outputPath: "",
      error: "Video de entrada nao encontrado para extrair ultimo frame."
    };
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const result = spawnSync("ffmpeg", [
    "-y",
    "-sseof",
    "-0.1",
    "-i",
    inputPath,
    "-update",
    "1",
    "-frames:v",
    "1",
    outputPath
  ], {
    windowsHide: true,
    encoding: "utf8"
  });

  if (result.status !== 0 || !fs.existsSync(outputPath)) {
    return {
      success: false,
      outputPath: "",
      error: (result.stderr || result.stdout || "Falha ao extrair ultimo frame.").trim()
    };
  }

  return {
    success: true,
    outputPath,
    error: ""
  };
}

