import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fetch from "node-fetch";
import { loadComfyConfig } from "./comfyConfig.js";
import { buildParameterizedWorkflow, getWorkflowUiFields, listComfyWorkflowFiles } from "./comfyWorkflowService.js";

let comfyProcess = null;
let status = "offline";
let lastActivityAt = 0;
let idleTimer = null;
const runningPromptByJob = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir = "") {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeUrl(url = "") {
  return String(url || "").replace(/\/+$/, "");
}

function isProcessAlive(child) {
  return Boolean(child && child.exitCode == null && child.signalCode == null);
}

function getFileAgeMs(filePath = "") {
  try {
    return Date.now() - fs.statSync(filePath).mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function walkFiles(dir = "", items = []) {
  if (!fs.existsSync(dir)) return items;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, items);
    } else {
      items.push(fullPath);
    }
  }
  return items;
}

function translateProgressMessage(event = {}) {
  if (event.type === "progress" || event.value != null) {
    const value = Number(event.value ?? 0);
    const max = Number(event.max ?? 0);
    if (max > 1) {
      const percent = Math.round((value / max) * 100);
      return {
        status: "sampling",
        progress: Math.max(10, Math.min(95, percent)),
        message: `Sampling ${value}/${max} · ${percent}%`
      };
    }
  }
  const node = event.node || event.data?.node || event.data?.node_id || "";
  if (node) {
    return {
      status: "generating",
      progress: 30,
      message: `Executando no ${node}`
    };
  }
  return null;
}

function scheduleIdleStop(config = loadComfyConfig(), logger = () => {}) {
  clearTimeout(idleTimer);
  if (!config.idleStopMs || config.idleStopMs <= 0) return;
  idleTimer = setTimeout(async () => {
    if (Date.now() - lastActivityAt < config.idleStopMs) {
      scheduleIdleStop(config, logger);
      return;
    }
    await stopComfyUI(logger);
  }, config.idleStopMs + 1000);
}

export function getComfyStatus() {
  return {
    name: "comfyui",
    status,
    pid: comfyProcess?.pid || null,
    running: isProcessAlive(comfyProcess),
    lastActivityAt
  };
}

export async function healthCheck(config = loadComfyConfig()) {
  const baseUrl = normalizeUrl(config.url);
  const response = await fetch(`${baseUrl}/system_stats`, { timeout: 5000 });
  if (!response.ok) {
    throw new Error(`ComfyUI HTTP ${response.status}`);
  }
  return response.json();
}

export async function startComfyUI(logger = () => {}) {
  const config = loadComfyConfig();
  if (!config.enabled) {
    throw new Error("ComfyUI desabilitado em backend/config/comfyui.json.");
  }
  try {
    await healthCheck(config);
    status = "online";
    lastActivityAt = Date.now();
    scheduleIdleStop(config, logger);
    return getComfyStatus();
  } catch {
    // offline, start below
  }

  if (isProcessAlive(comfyProcess)) {
    status = "starting";
    return waitUntilReady(logger);
  }

  status = "starting";
  logger("[COMFYUI] starting");
  comfyProcess = spawn(config.pythonExe, [config.mainScript, "--listen", "127.0.0.1", "--port", "8188"], {
    cwd: config.root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1"
    }
  });

  comfyProcess.stdout?.on("data", (chunk) => {
    String(chunk || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => logger(`[COMFYUI] ${line}`));
  });
  comfyProcess.stderr?.on("data", (chunk) => {
    String(chunk || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => logger(`[COMFYUI][stderr] ${line}`));
  });
  comfyProcess.once("exit", (code, signal) => {
    logger(`[COMFYUI] exited code=${code ?? "null"} signal=${signal || "none"}`);
    comfyProcess = null;
    status = "offline";
  });

  return waitUntilReady(logger);
}

export async function waitUntilReady(logger = () => {}, timeoutMs = 180000) {
  const config = loadComfyConfig();
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await healthCheck(config);
      status = "online";
      lastActivityAt = Date.now();
      scheduleIdleStop(config, logger);
      logger("[COMFYUI] online");
      return getComfyStatus();
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(`ComfyUI nao ficou pronto em ${timeoutMs}ms.`);
}

export async function stopComfyUI(logger = () => {}) {
  status = "stopping";
  if (isProcessAlive(comfyProcess)) {
    logger("[COMFYUI] stopping idle process");
    comfyProcess.kill();
    await sleep(1500);
    if (isProcessAlive(comfyProcess)) {
      comfyProcess.kill("SIGKILL");
    }
  }
  comfyProcess = null;
  status = "offline";
  return getComfyStatus();
}

export async function interruptComfy(jobId = "") {
  const config = loadComfyConfig();
  const baseUrl = normalizeUrl(config.url);
  const promptId = runningPromptByJob.get(jobId);
  await fetch(`${baseUrl}/interrupt`, { method: "POST" }).catch(() => null);
  if (promptId) runningPromptByJob.delete(jobId);
}

export function uploadImageToComfyInput(imagePath = "") {
  const config = loadComfyConfig();
  if (!imagePath || !fs.existsSync(imagePath)) {
    throw new Error("Imagem de entrada I2V nao encontrada.");
  }
  ensureDir(config.inputDir);
  const extension = path.extname(imagePath) || ".png";
  const fileName = `kit-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
  const destPath = path.join(config.inputDir, fileName);
  fs.copyFileSync(imagePath, destPath);
  return { fileName, path: destPath };
}

async function queuePrompt(apiPrompt = {}, jobId = "") {
  const config = loadComfyConfig();
  const baseUrl = normalizeUrl(config.url);
  const response = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: `kit-${jobId || randomUUID()}`,
      prompt: apiPrompt
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || data.error || `ComfyUI /prompt HTTP ${response.status}`);
  }
  return data.prompt_id;
}

async function getHistory(promptId = "") {
  const config = loadComfyConfig();
  const baseUrl = normalizeUrl(config.url);
  const response = await fetch(`${baseUrl}/history/${promptId}`);
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function monitorPromptWebSocket(promptId = "", jobId = "", onProgress = () => {}) {
  if (typeof WebSocket !== "function") {
    return false;
  }
  const config = loadComfyConfig();
  const wsUrl = normalizeUrl(config.url).replace(/^http/i, "ws");
  const clientId = `kit-${jobId || randomUUID()}`;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(true);
    };
    const timer = setTimeout(finish, 1000 * 60 * 60 * 4);
    const socket = new WebSocket(`${wsUrl}/ws?clientId=${encodeURIComponent(clientId)}`);
    socket.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(String(message.data || "{}"));
        const data = event.data || {};
        if (event.type === "progress") {
          const translated = translateProgressMessage(data);
          if (translated) onProgress(translated);
        }
        if (event.type === "executing" && data.prompt_id === promptId) {
          if (!data.node) {
            clearTimeout(timer);
            socket.close();
            finish();
            return;
          }
          onProgress({
            status: "generating",
            progress: 35,
            message: `Executando no ${data.node}`
          });
        }
      } catch {
        // ignore malformed websocket messages
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      finish();
    });
    socket.addEventListener("close", () => {
      clearTimeout(timer);
      finish();
    });
  });
  return true;
}

function findGeneratedFiles(history = {}, promptId = "", startedAt = Date.now()) {
  const config = loadComfyConfig();
  const record = history?.[promptId] || {};
  const outputs = Object.values(record.outputs || {});
  const files = [];
  for (const output of outputs) {
    for (const key of ["gifs", "videos", "images"]) {
      for (const item of output?.[key] || []) {
        const filePath = path.join(config.outputDir, item.subfolder || "", item.filename || "");
        if (item.filename && fs.existsSync(filePath)) files.push(filePath);
      }
    }
  }
  if (!files.length) {
    files.push(...walkFiles(config.outputDir).filter((filePath) => getFileAgeMs(filePath) <= Math.max(60000, Date.now() - startedAt + 60000)));
  }
  return files;
}

function copyResultFiles(files = [], jobId = "") {
  const config = loadComfyConfig();
  ensureDir(config.kitOutputDir);
  const video = files.find((file) => /\.(mp4|webm|mov|mkv)$/i.test(file));
  const lastFrame = files.find((file) => /\.(png|jpe?g|webp)$/i.test(file) && /last|frame/i.test(path.basename(file)));
  const result = {};
  if (video) {
    const dest = path.join(config.kitOutputDir, `wan-${jobId}.mp4`);
    fs.copyFileSync(video, dest);
    result.videoPath = dest;
  }
  if (lastFrame) {
    const dest = path.join(config.kitOutputDir, `wan-${jobId}-last-frame${path.extname(lastFrame)}`);
    fs.copyFileSync(lastFrame, dest);
    result.lastFramePath = dest;
  }
  return result;
}

export async function runComfyWorkflowJob({ jobId = randomUUID(), workflowId = "wan2.2", values = {}, onProgress = () => {}, logger = () => {} } = {}) {
  const startedAt = Date.now();
  onProgress({ status: "preparing_resources", progress: 3, message: "Carregando ComfyUI" });
  await startComfyUI(logger);

  const mode = String(values.mode || "").toLowerCase() === "i2v" || values.startImage ? "i2v" : "t2v";
  const patchedValues = {
    ...values,
    mode: mode === "i2v" ? 2 : 1,
    filenamePrefix: values.filenamePrefix || `Kit/wan-${jobId}`,
    videoFps: values.videoFps || values.fps
  };
  if (mode === "i2v") {
    const uploaded = uploadImageToComfyInput(values.startImage || values.inputImage || values.imagePath || "");
    patchedValues.inputImage = uploaded.fileName;
  }

  onProgress({ status: "preparing", progress: 8, message: "Enviando workflow Wan" });
  const parameterized = buildParameterizedWorkflow({ workflowId, values: patchedValues, jobId });
  const promptId = await queuePrompt(parameterized.apiPrompt, jobId);
  runningPromptByJob.set(jobId, promptId);
  onProgress({ status: "loading_model", progress: 12, message: "Carregando modelos" });
  void monitorPromptWebSocket(promptId, jobId, onProgress);

  let history = null;
  while (!history?.[promptId]) {
    await sleep(1500);
    history = await getHistory(promptId);
    onProgress(translateProgressMessage({ node: "" }) || { status: "generating", progress: 35, message: "Executando workflow Wan" });
  }

  runningPromptByJob.delete(jobId);
  onProgress({ status: "saving", progress: 96, message: "Salvando video" });
  const files = findGeneratedFiles(history, promptId, startedAt);
  const copied = copyResultFiles(files, jobId);
  if (!copied.videoPath) {
    throw new Error("ComfyUI concluiu, mas nenhum MP4 foi localizado no output.");
  }
  lastActivityAt = Date.now();
  scheduleIdleStop(loadComfyConfig(), logger);
  return {
    success: true,
    engine: "comfyui",
    workflow: workflowId,
    videoPath: copied.videoPath,
    lastFramePath: copied.lastFramePath || "",
    durationSeconds: Math.round((Date.now() - startedAt) / 1000),
    sourcePromptId: promptId,
    tempWorkflowPath: parameterized.tempPath,
    apiWorkflowPath: parameterized.apiPath
  };
}

export { getWorkflowUiFields, listComfyWorkflowFiles };
