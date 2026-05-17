const refreshBtn = document.getElementById("refreshBtn");
const clearBtn = document.getElementById("clearBtn");
const autoScrollToggle = document.getElementById("autoScrollToggle");
const statusLine = document.getElementById("statusLine");
const logOutput = document.getElementById("logOutput");

const MAX_LINES = 1500;
const serviceOrder = ["backend", "ollama", "stt", "xtts", "sd", "comfyui"];
const serviceState = {};
let renderedLines = [];

function resolveKitAPI() {
  if (window.kitAPI) {
    return window.kitAPI;
  }

  try {
    const { ipcRenderer } = require("electron");
    return {
      getProcessState: () => ipcRenderer.invoke("monitor:get-state"),
      controlService: (service, action) => ipcRenderer.invoke("service:control", service, action),
      onProcessLog: (callback) => {
        const subscription = (event, payload) => callback(payload);
        ipcRenderer.on("process-log", subscription);
        return () => ipcRenderer.removeListener("process-log", subscription);
      },
      onProcessStatus: (callback) => {
        const subscription = (event, payload) => callback(payload);
        ipcRenderer.on("process-status", subscription);
        return () => ipcRenderer.removeListener("process-status", subscription);
      }
    };
  } catch (err) {
    statusLine.textContent = `API indisponivel: ${err.message}`;
    throw err;
  }
}

const kitAPI = resolveKitAPI();
const serviceMenu = document.createElement("div");
serviceMenu.className = "service-context-menu";
serviceMenu.hidden = true;
document.body.appendChild(serviceMenu);

function formatTime(timestamp) {
  if (!timestamp) return "--:--:--";
  return new Date(timestamp).toLocaleTimeString("pt-BR");
}

function serviceLabel(value) {
  const key = String(value || "").toLowerCase();
  if (key === "backend") return "backend";
  if (key === "ollama") return "ollama";
  if (key === "stt") return "stt";
  if (key === "xtts") return "xtts";
  if (key === "sd") return "sd";
  if (key === "comfyui") return "ConfyUi";
  return key || "host";
}

function toConsoleLine(entry, fallbackService = "") {
  const service = serviceLabel(entry.service || fallbackService);
  const stream = String(entry.stream || "stdout").toLowerCase();
  return `[${formatTime(entry.ts)}] [${service}] [${stream}] ${String(entry.line || "")}`;
}

function trimLines() {
  if (renderedLines.length > MAX_LINES) {
    renderedLines = renderedLines.slice(renderedLines.length - MAX_LINES);
  }
}

function renderOutput() {
  trimLines();
  logOutput.textContent = renderedLines.length ? renderedLines.join("\n") : "Sem logs ainda.";

  if (autoScrollToggle.checked) {
    logOutput.scrollTop = logOutput.scrollHeight;
  }
}

function updateStatusLine() {
  const services = serviceOrder.map((key) => ({
    key,
    service: serviceState[key] || {
      status: "stopped",
      health: "offline",
      pid: "-"
    }
  }));

  statusLine.replaceChildren();

  services.forEach(({ key, service }) => {
    const status = service.status || "desconhecido";
    const health = service.health || "offline";
    const pid = service.pid || "-";
    const hasPid = Boolean(service.pid) && String(service.pid) !== "-";
    const isActive =
      hasPid ||
      health === "online" ||
      ["ready", "running", "starting"].includes(String(status).toLowerCase());
    const block = document.createElement("span");
    block.className = `service-block ${isActive ? "is-active" : "is-offline"}`;
    block.textContent = `${serviceLabel(key)}: ${status} / ${health} / PID ${pid}`;
    block.dataset.service = key;
    block.dataset.active = String(isActive);
    block.title = "Clique direito para controlar o servico";
    block.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showServiceMenu(event.clientX, event.clientY, key, isActive);
    });
    statusLine.appendChild(block);
  });
}

function hideServiceMenu() {
  serviceMenu.hidden = true;
  serviceMenu.replaceChildren();
}

function showServiceMenu(x, y, serviceKey, isActive) {
  hideServiceMenu();

  const action = isActive ? "stop" : "start";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = isActive ? "Desligar" : "Ativação";
  button.addEventListener("click", async () => {
    hideServiceMenu();
    statusLine.dataset.busy = "true";
    try {
      await kitAPI.controlService(serviceKey, action);
      const snapshot = await kitAPI.getProcessState();
      buildHistoryFromSnapshot(snapshot);
    } catch (err) {
      renderedLines.push(`[${formatTime(Date.now())}] [monitor] [stderr] controle de ${serviceLabel(serviceKey)} falhou: ${err.message}`);
      renderOutput();
    } finally {
      delete statusLine.dataset.busy;
    }
  });

  serviceMenu.appendChild(button);
  serviceMenu.hidden = false;

  const bounds = serviceMenu.getBoundingClientRect();
  serviceMenu.style.left = `${Math.min(x, window.innerWidth - bounds.width - 8)}px`;
  serviceMenu.style.top = `${Math.min(y, window.innerHeight - bounds.height - 8)}px`;
}

function buildHistoryFromSnapshot(snapshot) {
  const collected = [];

  serviceOrder.forEach((key) => {
    const service = snapshot.services?.[key];
    if (!service) return;

    serviceState[key] = service;

    (service.logs || []).forEach((entry) => {
      collected.push({
        ts: entry.ts || 0,
        text: toConsoleLine(entry, key)
      });
    });
  });

  collected.sort((a, b) => a.ts - b.ts);
  renderedLines = collected.map((item) => item.text);
  renderOutput();
  updateStatusLine();
}

async function loadSnapshot() {
  statusLine.textContent = "Atualizando historico...";
  const snapshot = await kitAPI.getProcessState();
  buildHistoryFromSnapshot(snapshot);
}

kitAPI.onProcessLog(({ service, entry }) => {
  const key = serviceLabel(service);
  renderedLines.push(toConsoleLine(entry, key));
  renderOutput();
});

kitAPI.onProcessStatus((service) => {
  serviceState[service.key] = {
    ...(serviceState[service.key] || {}),
    ...service
  };
  updateStatusLine();
});

refreshBtn.addEventListener("click", () => {
  loadSnapshot().catch((err) => {
    statusLine.textContent = `Erro ao atualizar: ${err.message}`;
  });
});

clearBtn.addEventListener("click", () => {
  renderedLines = [];
  renderOutput();
});

document.addEventListener("click", hideServiceMenu);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideServiceMenu();
  }
});

loadSnapshot().catch((err) => {
  statusLine.textContent = `Falha ao carregar log: ${err.message}`;
  logOutput.textContent = "Falha ao carregar historico de logs.";
});
