import fs from "fs";
import path from "path";

export function loadConfig(file) {
  try {
    const fullPath = path.resolve("backend/config", file);

    if (!fs.existsSync(fullPath)) return {};

    return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
  } catch (err) {
    console.error("Erro ao carregar config:", file, err);
    return {};
  }
}