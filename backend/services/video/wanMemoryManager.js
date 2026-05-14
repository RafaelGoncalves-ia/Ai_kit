import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_WAN_PYTHON = path.join(process.cwd(), "venv", "Scripts", "python.exe");

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(name, fallback = false) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

export const WAN_CONFIG = {
  minFreeVramMb: numberEnv("VIDEO_WAN_MIN_FREE_VRAM_MB", 8500),
  loadTimeoutMs: numberEnv("WAN_LOAD_TIMEOUT_MS", numberEnv("VIDEO_WAN_LOAD_TIMEOUT_MS", 7200000)),
  generateTimeoutMs: numberEnv("WAN_GENERATE_TIMEOUT_MS", numberEnv("VIDEO_WAN_GENERATE_TIMEOUT_MS", 7200000)),
  jobTimeoutMs: numberEnv("VIDEO_WAN_JOB_TIMEOUT_MS", numberEnv("WAN_GENERATE_TIMEOUT_MS", 7200000)),
  idleUnloadMs: numberEnv("VIDEO_WAN_IDLE_UNLOAD_MS", 120000),
  allowCpuFallback: boolEnv("VIDEO_WAN_ALLOW_CPU_FALLBACK", false),
  runtime: String(process.env.VIDEO_WAN_RUNTIME || "comfy_gguf").trim().toLowerCase() || "comfy_gguf"
};

let activeWanJobId = "";
const WAN_LOCK_PATH = path.resolve(process.cwd(), "temp", "wan_generation.lock");

export function resolveWanPython() {
  return DEFAULT_WAN_PYTHON;
}

function runPythonProbe(pythonPath = resolveWanPython()) {
  const probe = [
    "import json, importlib.util as u",
    "out={'python':__import__('sys').executable}",
    "out['pythonpath']=__import__('os').environ.get('PYTHONPATH','')",
    "try:",
    "    import torch",
    "    out['torch']=getattr(torch,'__version__','')",
    "    out['torch_file']=getattr(torch,'__file__','')",
    "    out['cuda_available']=bool(torch.cuda.is_available())",
    "    out['gpu']=torch.cuda.get_device_name(0) if torch.cuda.is_available() else ''",
    "    out['vram_total_mb']=int(torch.cuda.get_device_properties(0).total_memory/1024/1024) if torch.cuda.is_available() else 0",
    "    out['vram_free_mb']=int(torch.cuda.mem_get_info()[0]/1024/1024) if torch.cuda.is_available() else 0",
    "except Exception as e:",
    "    out['cuda_available']=False",
    "    out['error']=str(e)",
    "out['gguf']=bool(u.find_spec('gguf'))",
    "out['gguf_file']=getattr(u.find_spec('gguf'), 'origin', '') if u.find_spec('gguf') else ''",
    "out['diffusers']=bool(u.find_spec('diffusers'))",
    "print(json.dumps(out))"
  ].join("\n");
  const result = spawnSync(pythonPath, ["-c", probe], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true
  });
  if (result.error) {
    throw new Error(`WAN_PYTHON_PROBE_FAILED: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`WAN_PYTHON_PROBE_FAILED: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(String(result.stdout || "{}"));
}

export function getWanDiagnostics() {
  const python = resolveWanPython();
  const probe = runPythonProbe(python);
  return {
    ...probe,
    runtime: WAN_CONFIG.runtime,
    python,
    minFreeVramMb: WAN_CONFIG.minFreeVramMb,
    allowCpuFallback: WAN_CONFIG.allowCpuFallback
  };
}

export function assertWanCanStart(jobId = "") {
  if (activeWanJobId) {
    throw new Error(`WAN_JOB_ALREADY_RUNNING: job Wan em execucao (${activeWanJobId}).`);
  }
  const diagnostics = getWanDiagnostics();
  if (!diagnostics.cuda_available && !WAN_CONFIG.allowCpuFallback) {
    throw new Error("WAN_CUDA_NOT_AVAILABLE: geração Wan2.2 requer CUDA. Runtime atual está em CPU.");
  }
  if (!diagnostics.gpu && !WAN_CONFIG.allowCpuFallback) {
    throw new Error("WAN_CUDA_NOT_AVAILABLE: GPU CUDA nao detectada pelo runtime Wan.");
  }
  if (diagnostics.vram_free_mb < WAN_CONFIG.minFreeVramMb) {
    throw new Error(`WAN_INSUFFICIENT_VRAM: livre=${diagnostics.vram_free_mb}MB minimo=${WAN_CONFIG.minFreeVramMb}MB.`);
  }
  activeWanJobId = jobId || "pending";
  return diagnostics;
}

export function releaseWanJob(jobId = "") {
  if (!jobId || activeWanJobId === jobId || activeWanJobId === "pending") {
    activeWanJobId = "";
  }
  clearWanGenerationLock(jobId);
}

export function setWanGenerationLock(jobId = "wan_generation") {
  fs.mkdirSync(path.dirname(WAN_LOCK_PATH), { recursive: true });
  fs.writeFileSync(WAN_LOCK_PATH, `${JSON.stringify({
    owner: "wan_generation",
    jobId,
    createdAt: new Date().toISOString()
  }, null, 2)}\n`, "utf8");
}

export function clearWanGenerationLock(jobId = "") {
  try {
    if (!fs.existsSync(WAN_LOCK_PATH)) return;
    const current = JSON.parse(fs.readFileSync(WAN_LOCK_PATH, "utf8"));
    if (!jobId || !current?.jobId || current.jobId === jobId) {
      fs.unlinkSync(WAN_LOCK_PATH);
    }
  } catch {
    try {
      fs.unlinkSync(WAN_LOCK_PATH);
    } catch {
      // ignore
    }
  }
}

export function isWanGenerationLocked() {
  try {
    return fs.existsSync(WAN_LOCK_PATH);
  } catch {
    return false;
  }
}

export function buildWanWorkerEnv(extra = {}) {
  return {
    ...process.env,
    ...extra,
    VIDEO_WAN_RUNTIME: WAN_CONFIG.runtime === "comfy_gguf" ? "kit_wan_legacy" : WAN_CONFIG.runtime,
    VIDEO_WAN_ALLOW_CPU_FALLBACK: String(WAN_CONFIG.allowCpuFallback),
    VIDEO_WAN_MIN_FREE_VRAM_MB: String(WAN_CONFIG.minFreeVramMb),
    VIDEO_WAN_LOAD_TIMEOUT_MS: String(WAN_CONFIG.loadTimeoutMs),
    WAN_LOAD_TIMEOUT_MS: String(WAN_CONFIG.loadTimeoutMs),
    VIDEO_WAN_GENERATE_TIMEOUT_MS: String(WAN_CONFIG.generateTimeoutMs),
    WAN_GENERATE_TIMEOUT_MS: String(WAN_CONFIG.generateTimeoutMs),
    VIDEO_WAN_JOB_TIMEOUT_MS: String(WAN_CONFIG.jobTimeoutMs),
    VIDEO_WAN_IDLE_UNLOAD_MS: String(WAN_CONFIG.idleUnloadMs),
    KIT_WAN_GPU_EXCLUSIVE_MODE: "1",
    KIT_WAN_VRAM_MODE: process.env.KIT_WAN_VRAM_MODE || "highvram",
    KIT_WAN_VRAM_TARGET_MB: process.env.KIT_WAN_VRAM_TARGET_MB || "0",
    CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES || "0",
    NVIDIA_VISIBLE_DEVICES: process.env.NVIDIA_VISIBLE_DEVICES || "0",
    CUDA_DEVICE_ORDER: process.env.CUDA_DEVICE_ORDER || "PCI_BUS_ID",
    TORCH_FORCE_CUDA: process.env.TORCH_FORCE_CUDA || "1",
    PYTORCH_CUDA_ALLOC_CONF: process.env.PYTORCH_CUDA_ALLOC_CONF || "max_split_size_mb:128",
    PYTHONPATH: process.env.PYTHONPATH || process.cwd(),
    HF_HOME: process.env.HF_HOME || "F:\\AI\\cache\\huggingface",
    HF_HUB_CACHE: process.env.HF_HUB_CACHE || "F:\\AI\\cache\\huggingface\\hub",
    TRANSFORMERS_CACHE: process.env.TRANSFORMERS_CACHE || "F:\\AI\\cache\\huggingface\\transformers"
  };
}

function readStatus(statusPath = "") {
  try {
    return JSON.parse(fs.readFileSync(statusPath, "utf8"));
  } catch {
    return null;
  }
}

export function attachWanTimeouts({ child, jobId, statusPath = "", onTimeout }) {
  const loadTimer = setTimeout(() => {
    const current = readStatus(statusPath);
    const status = String(current?.status || "").toLowerCase();
    if (status && !["queued", "preparing", "loading_model"].includes(status)) {
      return;
    }
    try {
      child?.kill?.("SIGKILL");
    } catch {
      // ignore
    }
    onTimeout?.(`WAN_LOAD_TIMEOUT: excedeu ${WAN_CONFIG.loadTimeoutMs}ms em loading_model.`);
  }, WAN_CONFIG.loadTimeoutMs);

  const jobTimer = setTimeout(() => {
    try {
      child?.kill?.("SIGKILL");
    } catch {
      // ignore
    }
    onTimeout?.(`WAN_GENERATE_TIMEOUT: excedeu ${WAN_CONFIG.generateTimeoutMs}ms.`);
  }, WAN_CONFIG.generateTimeoutMs);

  child?.once?.("exit", () => {
    clearTimeout(loadTimer);
    clearTimeout(jobTimer);
    releaseWanJob(jobId);
  });

  return { loadTimer, jobTimer };
}
