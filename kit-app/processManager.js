const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const LOG_LIMIT = 400;
const HEALTH_CHECK_INTERVAL_MS = 3000;
const HEALTH_CHECK_TIMEOUT_MS = 1500;

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
  const nodeCommand = process.env.KIT_NODE_COMMAND || "node";

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
    }
  };

  const expectedStops = new Set();
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
        if (service.health !== "online") {
          service.health = "online";
          if (service.status === "starting") {
            service.status = "running";
          }
          emitStatus(key);
        }
        return;
      }

      if (response.status === 503) {
        if (service.health !== "loading") {
          service.health = "loading";
          emitStatus(key);
        }
        return;
      }

      if (service.health !== "offline") {
        service.health = "offline";
        emitStatus(key);
      }
    } catch {
      probe.clear();
      if (service.health !== "offline") {
        service.health = "offline";
        if (service.status === "running") {
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
        if (service.status === "starting" || service.status === "running") {
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
    const service = getService(key);

    if (service.child) {
      return snapshotService(service);
    }

    pushLog(key, "system", `[host] iniciando ${service.name}`);

    service.lastStartedAt = Date.now();
    service.lastExitCode = null;
    service.status = "starting";
    service.health = key === "xtts" ? "loading" : "offline";
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
    const service = getService(key);
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

  async function startDefaults() {
    await startService("backend");
    await startService("stt");

    if (process.env.KIT_AUTOSTART_XTTS !== "false") {
      await startService("xtts");
    } else {
      pushLog("xtts", "system", "[host] XTTS configurado para nao iniciar automaticamente");
    }
  }

  async function shutdownAll() {
    stopHealthPolling();

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
