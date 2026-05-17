import { spawnSync } from "child_process";
import dotenv from "dotenv";
import { createStableDiffusionClient } from "../services/sdClient.js";
import { isWanGenerationLocked } from "../services/video/wanMemoryManager.js";

dotenv.config();

const GPU_LOCK_STATE = {
  active: null,
  queue: []
};

const PROFILE_POLICIES = {
  gpu_video_exclusive: {
    mode: "gpu_exclusive",
    requires: ["video", "wan"],
    stopBeforeRun: ["ollama", "sd"],
    releaseAfterRun: true,
    maxVramMb: 11000,
    maxRamMb: 14000
  },
  gpu_image_exclusive: {
    mode: "gpu_exclusive",
    requires: ["image"],
    stopBeforeRun: ["video", "wan", "ollama", "xtts", "stt"],
    releaseAfterRun: true,
    maxVramMb: 9000,
    maxRamMb: 12000
  },
  voice_runtime: {
    mode: "voice_runtime",
    requires: ["audio"],
    stopBeforeRun: ["video", "wan", "sd"],
    releaseAfterRun: false,
    maxVramMb: 4000,
    maxRamMb: 6000
  },
  chat_runtime: {
    mode: "chat_runtime",
    requires: ["llm"],
    stopBeforeRun: [],
    releaseAfterRun: false,
    maxVramMb: 0,
    maxRamMb: 0
  },
  release_all: {
    mode: "release_all",
    requires: [],
    stopBeforeRun: ["ollama", "sd", "video", "wan"],
    releaseAfterRun: true,
    maxVramMb: 0,
    maxRamMb: 0
  }
};

function mergePolicies(base = {}, override = {}) {
  return {
    ...base,
    ...override,
    requires: [...new Set([...(base.requires || []), ...(override.requires || [])])],
    stopBeforeRun: [...new Set([...(base.stopBeforeRun || []), ...(override.stopBeforeRun || [])])]
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePortPids(output = "", port = "") {
  const pids = new Set();
  const portPattern = new RegExp(`[:.]${String(port).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s`);
  for (const line of String(output || "").split(/\r?\n/)) {
    if (!/LISTENING/i.test(line) || !portPattern.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[parts.length - 1]);
    if (Number.isInteger(pid) && pid > 0) {
      pids.add(pid);
    }
  }
  return Array.from(pids);
}

function findListeningPids(port = "") {
  if (!port) return [];
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], {
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true
  });
  if (result.status !== 0) return [];
  return parsePortPids(result.stdout, port);
}

function killPidTree(pid) {
  if (!pid) return false;
  const result = process.platform === "win32"
    ? spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true
    })
    : spawnSync("kill", ["-TERM", String(pid)], {
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true
    });
  return result.status === 0;
}

async function waitPortOffline(port = "", timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!findListeningPids(port).length) {
      return true;
    }
    await sleep(300);
  }
  return !findListeningPids(port).length;
}

export class ResourceManager {
  constructor(context = {}) {
    this.context = context;
  }

  getProfile(name = "") {
    const profile = PROFILE_POLICIES[name];
    if (!profile) {
      throw new Error(`Perfil de recurso desconhecido: ${name}`);
    }
    return { ...profile };
  }

  async applyProfile(profileName, logger = () => {}) {
    const policy = this.getProfile(profileName);
    logger(`resource policy aplicada: ${profileName}`);
    await this.applyPolicy(policy, logger);
    return policy;
  }

  async applyPolicy(policy = {}, logger = () => {}) {
    const normalized = mergePolicies({}, policy);
    logger(`resource policy aplicada: ${normalized.mode || "default"}`);

    for (const service of normalized.stopBeforeRun || []) {
      await this.stopService(service, logger);
    }

    this.cleanupMemory(logger);
    return normalized;
  }

  async prepareWanExclusiveMode(logger = () => {}) {
    logger("[COMFYUI][EXCLUSIVE] stopping xtts");
    logger("[COMFYUI][EXCLUSIVE] stopping sd");
    logger("[COMFYUI][EXCLUSIVE] blocking ollama");
    const activeServices = await this.collectActiveServices();
    logger(`[COMFYUI][EXCLUSIVE] active_services=${activeServices.join(",") || "none"}`);

    const killed = [];
    for (const service of ["xtts", "stt", "sd", "ollama"]) {
      await this.stopService(service, logger);
      killed.push(service);
    }

    logger(`[COMFYUI][EXCLUSIVE] killed=${killed.join(",")}`);
    logger("[COMFYUI][EXCLUSIVE] services stopped");
    this.cleanupMemory(logger);
    logger("[COMFYUI][EXCLUSIVE] cuda cache cleared");
    return { activeServices, killed };
  }

  async collectActiveServices() {
    const checks = [
      ["xtts", process.env.XTTS_PORT || "5005"],
      ["stt", process.env.STT_PORT || "5006"],
      ["sd", process.env.SD_PORT || "5010"],
      ["ollama", String(process.env.OLLAMA_URL || "http://127.0.0.1:11434").match(/:(\d+)/)?.[1] || "11434"]
    ];
    return checks
      .filter(([, port]) => findListeningPids(port).length > 0)
      .map(([name]) => name);
  }

  getPythonForGpu() {
    return "F:\\AI\\Ai_kit\\venv\\Scripts\\python.exe";
  }

  getVramInfo() {
    const python = this.getPythonForGpu();
    const probe = [
      "import json",
      "out={'cuda':False,'gpu':'','total_mb':0,'free_mb':0,'used_mb':0}",
      "try:",
      " import torch",
      " out['cuda']=bool(torch.cuda.is_available())",
      " if torch.cuda.is_available():",
      "  free,total=torch.cuda.mem_get_info()",
      "  out['gpu']=torch.cuda.get_device_name(0)",
      "  out['total_mb']=int(total/1024/1024)",
      "  out['free_mb']=int(free/1024/1024)",
      "  out['used_mb']=int((total-free)/1024/1024)",
      "except Exception as e:",
      " out['error']=str(e)",
      "print(json.dumps(out))"
    ].join("\n");
    const result = spawnSync(python, ["-c", probe], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONPATH: process.env.PYTHONPATH || process.cwd()
      },
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true
    });
    if (result.status !== 0) {
      return {
        cuda: false,
        gpu: "",
        total_mb: 0,
        free_mb: 0,
        used_mb: 0,
        error: String(result.stderr || result.error?.message || "probe falhou").trim()
      };
    }
    try {
      return JSON.parse(String(result.stdout || "{}"));
    } catch {
      return {
        cuda: false,
        gpu: "",
        total_mb: 0,
        free_mb: 0,
        used_mb: 0,
        error: "probe retornou JSON invalido"
      };
    }
  }

  getRamInfo() {
    const python = this.getPythonForGpu();
    const probe = [
      "import json",
      "out={'total_mb':0,'available_mb':0,'used_mb':0,'percent':0}",
      "try:",
      " import psutil",
      " m=psutil.virtual_memory()",
      " out={'total_mb':int(m.total/1024/1024),'available_mb':int(m.available/1024/1024),'used_mb':int(m.used/1024/1024),'percent':float(m.percent)}",
      "except Exception as e:",
      " out['error']=str(e)",
      "print(json.dumps(out))"
    ].join("\n");
    const result = spawnSync(python, ["-c", probe], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONPATH: process.env.PYTHONPATH || process.cwd()
      },
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true
    });
    if (result.status !== 0) {
      return {
        total_mb: 0,
        available_mb: 0,
        used_mb: 0,
        percent: 0,
        error: String(result.stderr || result.error?.message || "probe falhou").trim()
      };
    }
    try {
      return JSON.parse(String(result.stdout || "{}"));
    } catch {
      return {
        total_mb: 0,
        available_mb: 0,
        used_mb: 0,
        percent: 0,
        error: "probe retornou JSON invalido"
      };
    }
  }

  logVram(label = "vram", logger = () => {}) {
    const info = this.getVramInfo();
    logger(`[GPU][VRAM] ${label} used=${info.used_mb}MB free=${info.free_mb}MB total=${info.total_mb}MB gpu=${info.gpu || "-"}`);
    return info;
  }

  logRam(label = "ram", logger = () => {}) {
    const info = this.getRamInfo();
    logger(`[GPU][RAM] ${label} used=${info.used_mb}MB available=${info.available_mb}MB total=${info.total_mb}MB percent=${info.percent}%`);
    if (Number(info.percent) >= 95) {
      logger(`[GPU][RAM][WARN] ${label} RAM alta detectada como telemetria; nao bloqueando execucao.`);
    }
    return info;
  }

  async acquireGpuLock({ owner = "gpu-job", timeoutMs = 900000 } = {}, logger = () => {}) {
    const request = {
      owner,
      requestedAt: Date.now(),
      logger,
      resolve: null,
      reject: null,
      timer: null
    };

    const waitPromise = new Promise((resolve, reject) => {
      request.resolve = resolve;
      request.reject = reject;
      request.timer = setTimeout(() => {
        const index = GPU_LOCK_STATE.queue.indexOf(request);
        if (index >= 0) {
          GPU_LOCK_STATE.queue.splice(index, 1);
        }
        reject(new Error(`GPU_LOCK_TIMEOUT: ${owner} aguardou ${timeoutMs}ms.`));
      }, timeoutMs);
    });

    const grant = (item) => {
      clearTimeout(item.timer);
      GPU_LOCK_STATE.active = {
        owner: item.owner,
        acquiredAt: Date.now()
      };
      item.logger(`[GPU][LOCK] adquirido por ${item.owner}`);
      item.resolve(this.createGpuRelease(item.owner, item.logger));
    };

    if (!GPU_LOCK_STATE.active) {
      grant(request);
    } else {
      GPU_LOCK_STATE.queue.push(request);
      logger(`[GPU][LOCK] aguardando ${owner}; ativo=${GPU_LOCK_STATE.active.owner}; fila=${GPU_LOCK_STATE.queue.length}`);
    }

    return waitPromise;
  }

  createGpuRelease(owner = "gpu-job", logger = () => {}) {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      if (GPU_LOCK_STATE.active?.owner === owner) {
        GPU_LOCK_STATE.active = null;
      }
      logger(`[GPU][LOCK] liberado por ${owner}`);
      const next = GPU_LOCK_STATE.queue.shift();
      if (next) {
        clearTimeout(next.timer);
        GPU_LOCK_STATE.active = {
          owner: next.owner,
        acquiredAt: Date.now()
      };
      next.logger(`[GPU][LOCK] adquirido por ${next.owner}`);
      next.resolve(this.createGpuRelease(next.owner, next.logger));
      }
    };
  }

  async stopService(service = "", logger = () => {}) {
    const name = String(service || "").toLowerCase();
    if (!name) {
      return;
    }

    try {
      if (name === "ollama" || name === "llm") {
        const result = await this.context.services?.ai?.unload?.();
        if (!this.context.services?.ai?.unload) {
          await this.unloadOllamaDirect(logger);
        }
        logger(result?.ok === false
          ? `servico ollama nao descarregado: ${result.error || "sem detalhe"}`
          : "servico ollama descarregado");
        return;
      }

      if (name === "sd" || name === "stable_diffusion" || name === "image") {
        try {
          await createStableDiffusionClient().unload();
          logger("servico stable_diffusion descarregado");
        } catch (err) {
          logger(`servico stable_diffusion nao descarregado: ${err.message}`);
        }
        await this.stopGenericPortService("sd", process.env.SD_PORT || "5010", logger);
        return;
      }

      if (name === "wan" || name === "video") {
        logger("runtime Wan marcado para liberar recursos; jobs ativos continuam sob controle do videoEngine");
        return;
      }

      if (name === "xtts" || name === "stt") {
        await this.stopPortService(name, logger);
        return;
      }

      logger(`servico ${name} sem adaptador de resource manager`);
    } catch (err) {
      logger(`erro ao preparar servico ${name}: ${err.message}`);
    }
  }

  async unloadOllamaDirect(logger = () => {}) {
    const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
    try {
      const response = await fetch(`${ollamaUrl}/api/ps`);
      if (!response.ok) return;
      const data = await response.json();
      const models = Array.isArray(data?.models) ? data.models : [];
      for (const model of models) {
        const name = String(model?.name || model?.model || "").trim();
        if (!name) continue;
        await fetch(`${ollamaUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: name, prompt: "", stream: false, keep_alive: 0 })
        }).catch(() => null);
      }
    } catch (err) {
      logger(`servico ollama unload direto falhou: ${err.message}`);
    }
  }

  async stopPortService(name = "", logger = () => {}) {
    const port = name === "xtts"
      ? String(process.env.XTTS_PORT || "5005")
      : String(process.env.STT_PORT || "5006");
    let pids = findListeningPids(port);
    if (!pids.length) {
      logger(`servico ${name} offline`);
      return;
    }
    logger(`servico ${name} encerrando porta=${port} pids=${pids.join(",")}`);
    for (const pid of pids) {
      killPidTree(pid);
    }
    const stopped = await waitPortOffline(port, 15000);
    if (!stopped) {
      pids = findListeningPids(port);
      for (const pid of pids) {
        killPidTree(pid);
      }
    }
    logger(`servico ${name} ${findListeningPids(port).length ? "ainda ativo apos kill" : "stopped/offline"}`);
  }

  async stopGenericPortService(name = "", port = "", logger = () => {}) {
    let pids = findListeningPids(port);
    if (!pids.length) {
      logger(`servico ${name} offline`);
      return;
    }
    logger(`servico ${name} encerrando porta=${port} pids=${pids.join(",")}`);
    for (const pid of pids) {
      killPidTree(pid);
    }
    await waitPortOffline(port, 15000);
    logger(`servico ${name} ${findListeningPids(port).length ? "ainda ativo apos kill" : "stopped/offline"}`);
  }

  cleanupMemory(logger = () => {}) {
    if (isWanGenerationLocked()) {
      logger("[COMFYUI][EXCLUSIVE] memory.consolidation skipped");
      return;
    }
    if (global.gc) {
      global.gc();
      logger("cache Node.js limpo via global.gc");
    }

    const python = this.getPythonForGpu();
    const probe = [
      "import gc",
      "gc.collect()",
      "try:",
      " import torch",
      " torch.cuda.empty_cache() if torch.cuda.is_available() else None",
      " torch.cuda.ipc_collect() if torch.cuda.is_available() else None",
      " print('cuda_cache_cleaned=' + str(torch.cuda.is_available()).lower())",
      "except Exception as e:",
      " print('cuda_cache_cleaned=false error=' + str(e))"
    ].join("\n");
    const result = spawnSync(python, ["-c", probe], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONPATH: process.env.PYTHONPATH || process.cwd()
      },
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true
    });
    if (result.status === 0) {
      logger(`cache limpo: ${String(result.stdout || "").trim()}`);
    } else {
      logger(`cache CUDA nao limpo: ${String(result.stderr || result.error?.message || "python indisponivel").trim()}`);
    }
  }
}

export { PROFILE_POLICIES };
