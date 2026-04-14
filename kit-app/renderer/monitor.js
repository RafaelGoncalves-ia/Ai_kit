const refreshBtn = document.getElementById("refreshBtn");
const clearBtn = document.getElementById("clearBtn");
const autoScrollToggle = document.getElementById("autoScrollToggle");
const statusLine = document.getElementById("statusLine");
const logOutput = document.getElementById("logOutput");

const MAX_LINES = 1500;
const serviceOrder = ["backend", "stt", "xtts"];
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

function formatTime(timestamp) {
  if (!timestamp) return "--:--:--";
  return new Date(timestamp).toLocaleTimeString("pt-BR");
}

function serviceLabel(value) {
  const key = String(value || "").toLowerCase();
  if (key === "backend") return "backend";
  if (key === "stt") return "stt";
  if (key === "xtts") return "xtts";
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
  const summary = serviceOrder
    .filter((key) => serviceState[key])
    .map((key) => {
      const service = serviceState[key];
      return `${serviceLabel(key)}: ${service.status || "desconhecido"} / ${service.health || "offline"} / PID ${service.pid || "-"}`;
    })
    .join(" | ");

  statusLine.textContent = summary || "Sem processos no snapshot.";
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

loadSnapshot().catch((err) => {
  statusLine.textContent = `Falha ao carregar log: ${err.message}`;
  logOutput.textContent = "Falha ao carregar historico de logs.";
});
