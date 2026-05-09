const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  buildStableDiffusionWorkerEnv,
  loadStableDiffusionConfig
} = require("../backend/config/stableDiffusionConfig.cjs");

const LOG_LIMIT = 400;
const HEALTH_CHECK_INTERVAL_MS = 3000;
const HEALTH_CHECK_TIMEOUT_MS = 1500;
const DEFAULT_XTTS_IDLE_STOP_MS = Math.max(60000, Number(process.env.KIT_IDLE_XTTS_TIMEOUT_MS || 10 * 60 * 1000));
const DEFAULT_STT_IDLE_STOP_MS = Math.max(30000, Number(process.env.KIT_IDLE_STT_TIMEOUT_MS || 5 * 60 * 1000));

const SERVICE_POLICIES = {
  backend: {
    enabled: true,
    autoStart: true,
    lazyStart: false,
    startTriggers: ["boot"],
    idleStopMs: 0,
    warmupOnFirstUse: false
  },
  ollama: {
    enabled: true,
    autoStart: false,
    lazyStart: true,
    startTriggers: ["chat_open", "widget_open", "llm_request"],
    idleStopMs: Number(process.env.KIT_IDLE_OLLAMA_TIMEOUT_MS || 0),
    warmupOnFirstUse: true
  },
  xtts: {
    enabled: true,
    autoStart: false,
    lazyStart: true,
    startTriggers: ["chat_open", "widget_open", "tts_request"],
    idleStopMs: DEFAULT_XTTS_IDLE_STOP_MS,
    warmupOnFirstUse: false
  },
  stt: {
    enabled: true,
    autoStart: false,
    lazyStart: true,
    startTriggers: ["widget_open", "mic_request", "stt_request"],
    idleStopMs: DEFAULT_STT_IDLE_STOP_MS,
    warmupOnFirstUse: false
  },
  sd: {
    enabled: true,
    autoStart: process.env.KIT_AUTOSTART_SD === "true",
    lazyStart: true,
    startTriggers: ["sd_request"],
    idleStopMs: Number(process.env.KIT_IDLE_SD_TIMEOUT_MS || 0),
    warmupOnFirstUse: false
  }
};

function parseEnvFile(filePath) {
  const data = {};

  if (!fs.existsSync(filePath)) {
    return data;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = String(rawLine || "").trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      data[key] = value;
    }
  }

  return data;
}

function normalizeLogLines(chunk) {
  return String(chunk || "")
    .replace(/\0/g, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function shouldIgnoreLogLine(line) {
  const text = String(line || "").trim();
  if (!text) return true;

  return /"GET \/health HTTP\/1\.[01]" 200 -$/i.test(text);
}

function withTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  return {
    options: {
      method: "GET",
      signal: controller.signal
    },
    clear() {
      clearTimeout(timeout);
    },
    url
  };
}

function createProcessManager({ rootDir, onLog, onStatus }) {
  const xttsConfigPath = path.join(rootDir, "reades", "xtts-config.txt");
  const xttsConfig = parseEnvFile(xttsConfigPath);
  const xttsVenv = xttsConfig.XTTS_VENV || "C:\\GitHub\\XTTS\\venv";
  const pythonFromVenv = path.join(xttsVenv, "Scripts", "python.exe");
  const defaultPython =
    process.env.KIT_PYTHON ||
    (fs.existsSync(pythonFromVenv) ? pythonFromVenv : null) ||
    xttsConfig.XTTS_PYTHON ||
    "python";
  const xttsPort = String(process.env.XTTS_PORT || xttsConfig.XTTS_PORT || "5005");
  const sttPort = String(process.env.STT_PORT || "5006");
  const sdPort = String(process.env.SD_PORT || "5010");
  const sdConfig = loadStableDiffusionConfig();
  const sdEnv = buildStableDiffusionWorkerEnv(sdConfig);
  const nodeCommand = process.env.KIT_NODE_COMMAND || "node";
  const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  const ollamaCommand = process.env.KIT_OLLAMA_COMMAND || process.env.OLLAMA_COMMAND || "ollama";

  const services = {
    backend: {
      key: "backend",
      name: "Backend",
      command: nodeCommand,
      args: [path.join(rootDir, "backend", "server.js")],
      cwd: rootDir,
      env: {},
      healthUrl: "http://127.0.0.1:3001/status",
      child: null,
      pid: null,
      status: "stopped",
      health: "offline",
      logs: [],
      lastStartedAt: null,
      lastExitedAt: null,
      lastExitCode: null
    },
    ollama: {
      key: "ollama",
      name: "Ollama",
      command: ollamaCommand,
      args: ["serve"],
      cwd: rootDir,
      env: {},
      healthUrl: `${ollamaUrl}/api/tags`,
      child: null,
      pid: null,
      status: "stopped",
      health: "offline",
      logs: [],
      lastStartedAt: null,
      lastExitedAt: null,
      lastExitCode: null,
      warmed: false
    },
    stt: {
      key: "stt",
      name: "STT",
      command: defaultPython,
      args: ["-u", path.join(rootDir, "backend", "services", "stt_server.py")],
      cwd: rootDir,
      env: {
        STT_PORT: sttPort,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8"
      },
      healthUrl: `http://127.0.0.1:${sttPort}/health`,
      child: null,
      pid: null,
      status: "stopped",
      health: "offline",
      logs: [],
      lastStartedAt: null,
      lastExitedAt: null,
      lastExitCode: null
    },
    xtts: {
      key: "xtts",
      name: "XTTS",
      command: defaultPython,
      args: ["-u", path.join(rootDir, "backend", "services", "xtts_server.py")],
      cwd: rootDir,
      env: {
        XTTS_PORT: xttsPort,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8"
      },
      healthUrl: `http://127.0.0.1:${xttsPort}/health`,
      child: null,
      pid: null,
      status: "stopped",
      health: "offline",
      logs: [],
      lastStartedAt: null,
      lastExitedAt: null,
      lastExitCode: null
    },
    sd: {
      key: "sd",
      name: "Stable Diffusion",
      command: sdConfig.pythonPath,
      args: ["-u", path.join(rootDir, "backend", "services", "sd_worker.py")],
      cwd: rootDir,
      env: {
        ...sdEnv,
        SD_PORT: sdPort,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8"
      },
      healthUrl: `http://127.0.0.1:${sdPort}/health`,
      child: null,
      pid: null,
      status: "stopped",
      health: "offline",
      logs: [],
      lastStartedAt: null,
      lastExitedAt: null,
      lastExitCode: null
    }
  };

  const expectedStops = new Set();
  const startPromises = new Map();
  const idleTimers = new Map();
  let healthTimer = null;

  function getService(key) {
    const service = services[key];
    if (!service) {
      throw new Error(`Servico desconhecido: ${key}`);
    }
    return service;
  }

  function snapshotService(service) {
    return {
      key: service.key,
      name: service.name,
      pid: service.pid,
      status: service.status,
      health: service.health,
      command: service.command,
      args: service.args.slice(),
      policy: SERVICE_POLICIES[service.key] || null,
      lastStartedAt: service.lastStartedAt,
      lastExitedAt: service.lastExitedAt,
      lastExitCode: service.lastExitCode,
      logs: service.logs.slice()
    };
  }

  function emitStatus(key) {
    const payload = snapshotService(getService(key));
    onStatus?.(payload);
    return payload;
  }

  function pushLog(key, stream, chunk) {
    const service = getService(key);
    const lines = normalizeLogLines(chunk).filter((line) => !shouldIgnoreLogLine(line));
    if (!lines.length) return;

    for (const line of lines) {
      const entry = {
        ts: Date.now(),
        service: key,
        stream,
        line
      };
      service.logs.push(entry);
      if (service.logs.length > LOG_LIMIT) {
        service.logs.splice(0, service.logs.length - LOG_LIMIT);
      }
      onLog?.({
        service: key,
        entry
      });
    }
  }

  function markServiceState(key, nextState) {
    const service = getService(key);
    Object.assign(service, nextState);
    emitStatus(key);
  }

  function normalizeServiceName(key) {
    const normalized = String(key || "").trim().toLowerCase();
    if (normalized === "llm") return "ollama";
    if (normalized === "tts") return "xtts";
    return normalized;
  }

  function getPolicy(key) {
    return SERVICE_POLICIES[normalizeServiceName(key)] || {
      enabled: true,
      autoStart: false,
      lazyStart: true,
      startTriggers: [],
      idleStopMs: 0,
      warmupOnFirstUse: false
    };
  }

  function getServiceState(key) {
    return snapshotService(getService(normalizeServiceName(key)));
  }

  function scheduleIdleStop(key) {
    const serviceKey = normalizeServiceName(key);
    const policy = getPolicy(serviceKey);
    const idleStopMs = Number(policy.idleStopMs || 0);
    if (!idleStopMs) return;

    const current = idleTimers.get(serviceKey);
    if (current) {
      clearTimeout(current);
    }

    const timer = setTimeout(() => {
      pushLog(serviceKey, "system", `[host] encerrando por inatividade (${idleStopMs}ms)`);
      void ensureStopped(serviceKey);
    }, idleStopMs);
    timer.unref?.();
    idleTimers.set(serviceKey, timer);
  }

  function clearIdleStop(key) {
    const serviceKey = normalizeServiceName(key);
    const timer = idleTimers.get(serviceKey);
    if (!timer) return;
    clearTimeout(timer);
    idleTimers.delete(serviceKey);
  }

  async function waitUntilReady(key, timeoutMs = 90000) {
    const serviceKey = normalizeServiceName(key);
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const service = getService(serviceKey);
      if (service.status === "ready") {
        return snapshotService(service);
      }
      if (service.status === "error" || service.status === "stopped") {
        return snapshotService(service);
      }
      await checkHealth(serviceKey);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return snapshotService(getService(serviceKey));
  }

  async function warmupOllama() {
    const service = getService("ollama");
    if (service.warmed) {
      return snapshotService(service);
    }

    pushLog("ollama", "system", "[host] aquecendo LLM sob demanda");
    try {
      const response = await fetch("http://127.0.0.1:3001/llm/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      service.warmed = response.ok;
      pushLog("ollama", response.ok ? "system" : "stderr", `[host] warmup LLM HTTP ${response.status}`);
    } catch (err) {
      pushLog("ollama", "stderr", `[host] warmup LLM falhou: ${err.message}`);
    }
    emitStatus("ollama");
    return snapshotService(service);
  }

  async function stopProcessTree(pid) {
    if (!pid) return;

    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
          windowsHide: true
        });

        killer.on("error", resolve);
        killer.on("exit", resolve);
      });
      return;
    }

    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }

  async function checkHealth(key) {
    const service = getService(key);
    if (!service.healthUrl) return;

    const probe = withTimeout(service.healthUrl);

    try {
      const response = await fetch(probe.url, probe.options);
      probe.clear();

      if (response.ok) {
        if (service.health !== "online" || service.status !== "ready") {
          service.health = "online";
          if (service.status === "starting" || service.status === "stopped") {
            service.status = "ready";
          }
          emitStatus(key);
        }
        return;
      }

      if (response.status === 503) {
        if (service.health !== "loading") {
          service.health = "loading";
          if (service.status !== "error") {
            service.status = "starting";
          }
          emitStatus(key);
        }
        return;
      }

      if (service.health !== "offline" || service.status === "starting") {
        service.health = "offline";
        if (service.logical && service.status === "starting") {
          service.status = "stopped";
        }
        if (service.status === "ready") {
          service.status = "starting";
        }
        emitStatus(key);
      }
    } catch {
      probe.clear();
      if (service.health !== "offline" || service.status === "starting") {
        service.health = "offline";
        if (service.logical && service.status === "starting") {
          service.status = "stopped";
        }
        if (service.status === "ready") {
          service.status = "starting";
        }
        emitStatus(key);
      }
    }
  }

  function startHealthPolling() {
    if (healthTimer) return;

    healthTimer = setInterval(() => {
      Object.keys(services).forEach((key) => {
        const service = getService(key);
        if (service.status === "starting" || service.status === "ready") {
          void checkHealth(key);
        }
      });
    }, HEALTH_CHECK_INTERVAL_MS);

    healthTimer.unref?.();
  }

  function stopHealthPolling() {
    if (!healthTimer) return;
    clearInterval(healthTimer);
    healthTimer = null;
  }

  async function startService(key) {
    key = normalizeServiceName(key);
    const service = getService(key);

    if (service.logical) {
      service.lastStartedAt = service.lastStartedAt || Date.now();
      service.status = "starting";
      emitStatus(key);
      await checkHealth(key);
      return snapshotService(service);
    }

    if (service.child) {
      return snapshotService(service);
    }

    pushLog(key, "system", `[host] iniciando ${service.name}`);

    service.lastStartedAt = Date.now();
    service.lastExitCode = null;
    service.status = "starting";
    service.health = "offline";
    emitStatus(key);

    const child = spawn(service.command, service.args, {
      cwd: service.cwd,
      env: {
        ...process.env,
        ...service.env
      },
      windowsHide: true,
      shell: false
    });

    service.child = child;
    service.pid = child.pid || null;
    pushLog(key, "system", `[host] ${service.name} iniciado pid=${service.pid || "desconhecido"}`);
    emitStatus(key);

    child.stdout?.on("data", (chunk) => {
      pushLog(key, "stdout", chunk);
    });

    child.stderr?.on("data", (chunk) => {
      pushLog(key, "stderr", chunk);
    });

    child.on("error", (err) => {
      pushLog(key, "stderr", `[host] erro ao iniciar ${service.name}: ${err.message}`);
      service.status = "error";
      service.health = "offline";
      service.child = null;
      service.pid = null;
      service.lastExitedAt = Date.now();
      service.lastExitCode = null;
      emitStatus(key);
    });

    child.on("exit", (code, signal) => {
      const expected = expectedStops.has(key);
      expectedStops.delete(key);

      pushLog(
        key,
        "system",
        `[host] ${service.name} finalizado${signal ? ` por sinal ${signal}` : ""}${code !== null ? ` com codigo ${code}` : ""}`
      );

      service.child = null;
      service.pid = null;
      service.lastExitedAt = Date.now();
      service.lastExitCode = code;
      service.health = "offline";
      service.status = expected || code === 0 ? "stopped" : "error";
      emitStatus(key);
    });

    child.on("close", (code, signal) => {
      pushLog(
        key,
        "system",
        `[host] ${service.name} close${signal ? ` signal=${signal}` : ""}${code !== null ? ` code=${code}` : ""}`
      );
    });

    void checkHealth(key);

    return snapshotService(service);
  }

  async function stopService(key) {
    key = normalizeServiceName(key);
    const service = getService(key);
    clearIdleStop(key);

    if (service.logical) {
      service.status = "stopped";
      service.health = "offline";
      service.warmed = false;
      service.lastExitedAt = Date.now();
      emitStatus(key);
      return snapshotService(service);
    }

    if (!service.child || !service.pid) {
      if (service.status !== "stopped") {
        service.status = "stopped";
        service.health = "offline";
        emitStatus(key);
      }
      return snapshotService(service);
    }

    expectedStops.add(key);
    service.status = "stopping";
    emitStatus(key);
    pushLog(key, "system", `[host] encerrando ${service.name}`);

    await stopProcessTree(service.pid);
    await new Promise((resolve) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (!service.child || Date.now() - startedAt > 8000) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
      timer.unref?.();
    });
    return snapshotService(service);
  }

  async function restartService(key) {
    await stopService(key);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return startService(key);
  }

  async function ensureStarted(key, options = {}) {
    const serviceKey = normalizeServiceName(key);
    const policy = getPolicy(serviceKey);
    if (!policy.enabled) {
      pushLog(serviceKey, "system", "[host] servico desabilitado por politica");
      return getServiceState(serviceKey);
    }

    const trigger = String(options.trigger || "manual");
    if (
      trigger !== "manual" &&
      Array.isArray(policy.startTriggers) &&
      policy.startTriggers.length &&
      !policy.startTriggers.includes(trigger)
    ) {
      return getServiceState(serviceKey);
    }

    const service = getService(serviceKey);
    scheduleIdleStop(serviceKey);

    if (!service.child && service.healthUrl) {
      await checkHealth(serviceKey);
    }

    if (service.status === "ready") {
      if (policy.warmupOnFirstUse && options.warmup !== false) {
        void warmupOllama();
      }
      return snapshotService(service);
    }

    if (startPromises.has(serviceKey)) {
      return startPromises.get(serviceKey);
    }

    const promise = (async () => {
      try {
        pushLog(serviceKey, "system", `[host] ensureStarted trigger=${trigger}`);
        await startService(serviceKey);
        const ready = await waitUntilReady(serviceKey, options.timeoutMs || 90000);
        if (policy.warmupOnFirstUse && options.warmup !== false) {
          void warmupOllama();
        }
        return ready;
      } finally {
        startPromises.delete(serviceKey);
      }
    })();

    startPromises.set(serviceKey, promise);
    return promise;
  }

  async function ensureStopped(key) {
    return stopService(normalizeServiceName(key));
  }

  function activateByTrigger(trigger, options = {}) {
    const triggerName = String(trigger || "").trim();
    const targets = Object.keys(SERVICE_POLICIES).filter((key) => {
      const policy = getPolicy(key);
      return policy.enabled && policy.lazyStart && policy.startTriggers.includes(triggerName);
    });

    const promises = targets.map((key) => ensureStarted(key, {
      ...options,
      trigger: triggerName
    }));
    return Promise.allSettled(promises);
  }

  async function startDefaults() {
    await startService("backend");
    Object.keys(SERVICE_POLICIES).forEach((key) => {
      if (key === "backend") return;
      const policy = getPolicy(key);
      if (policy.autoStart) {
        void ensureStarted(key, { trigger: "manual" });
        return;
      }
      pushLog(key, "system", "[host] lazy start ativo; aguardando contexto de uso");
      emitStatus(key);
    });
  }

  async function startForIntent(intent, options = {}) {
    const triggerMap = {
      "chat-open": "chat_open",
      "widget-open": "widget_open",
      "chat-send": "llm_request",
      "widget-send": "llm_request",
      "widget-voice": "mic_request",
      "mic-request": "mic_request",
      "stt-request": "stt_request",
      "tts-request": "tts_request",
      "llm-request": "llm_request",
      "sd-request": "sd_request"
    };
    const trigger = triggerMap[String(intent || "").trim()] || String(intent || "").trim();
    if (!trigger) {
      return [];
    }
    return activateByTrigger(trigger, options);
  }

  async function shutdownAll() {
    stopHealthPolling();

    await stopService("sd");
    await stopService("xtts");
    await stopService("stt");
    await stopService("backend");
  }

  function getSnapshot() {
    return {
      rootDir,
      services: Object.fromEntries(
        Object.entries(services).map(([key, service]) => [key, snapshotService(service)])
      )
    };
  }

  startHealthPolling();

  return {
    getSnapshot,
    getServiceState,
    ensureStarted,
    ensureStopped,
    activateByTrigger,
    startForIntent,
    startDefaults,
    startService,
    stopService,
    restartService,
    shutdownAll
  };
}

module.exports = {
  createProcessManager
};
