import fs from "fs";
import path from "path";

const ROOT_DIR = path.resolve(process.cwd());
const CONFIG_PATH = path.join(ROOT_DIR, "backend", "config", "comfyui.json");

const DEFAULT_CONFIG = {
  enabled: true,
  root: "C:/GitHub/ComfyUI",
  pythonExe: "C:/GitHub/ComfyUI/venv/Scripts/python.exe",
  mainScript: "C:/GitHub/ComfyUI/main.py",
  url: "http://127.0.0.1:8188",
  autoStart: false,
  lazyStart: true,
  idleStopMs: 900000,
  workflowsDir: "F:/AI/Ai_kit/backend/workflows/comfy",
  outputDir: "C:/GitHub/ComfyUI/output",
  inputDir: "C:/GitHub/ComfyUI/input",
  kitOutputDir: "F:/AI/Ai_kit/output/canvas-video",
  tempDir: "F:/AI/Ai_kit/temp/comfy-workflows"
};

function readJson(filePath = "") {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function envBool(name, fallback) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function normalizePath(value = "") {
  return path.normalize(String(value || ""));
}

export function loadComfyConfig() {
  const local = readJson(CONFIG_PATH) || {};
  const merged = { ...DEFAULT_CONFIG, ...local };
  return {
    ...merged,
    enabled: envBool("COMFYUI_ENABLED", merged.enabled !== false),
    root: normalizePath(process.env.COMFYUI_ROOT || merged.root),
    pythonExe: normalizePath(process.env.COMFYUI_PYTHON || merged.pythonExe),
    mainScript: normalizePath(process.env.COMFYUI_MAIN_SCRIPT || merged.mainScript),
    url: String(process.env.COMFYUI_URL || merged.url).replace(/\/+$/, ""),
    autoStart: envBool("COMFYUI_AUTO_START", merged.autoStart === true),
    lazyStart: envBool("COMFYUI_LAZY_START", merged.lazyStart !== false),
    idleStopMs: envNumber("COMFYUI_IDLE_STOP_MS", Number(merged.idleStopMs || 900000)),
    workflowsDir: normalizePath(process.env.COMFYUI_WORKFLOWS_DIR || merged.workflowsDir),
    outputDir: normalizePath(process.env.COMFYUI_OUTPUT_DIR || merged.outputDir),
    inputDir: normalizePath(process.env.COMFYUI_INPUT_DIR || merged.inputDir || path.join(merged.root, "input")),
    kitOutputDir: normalizePath(process.env.COMFYUI_KIT_OUTPUT_DIR || merged.kitOutputDir),
    tempDir: normalizePath(process.env.COMFYUI_TEMP_DIR || merged.tempDir),
    source: fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : "defaults"
  };
}

export { CONFIG_PATH as COMFY_CONFIG_PATH, DEFAULT_CONFIG as DEFAULT_COMFY_CONFIG };
