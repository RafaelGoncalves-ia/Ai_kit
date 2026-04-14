const { contextBridge, ipcRenderer } = require("electron");
const API = "http://localhost:3001/api/vocabulary";

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Falha na requisição.");
  }
  return data;
}

const kitAPI = {
  openWindow: (url, options) => ipcRenderer.invoke("open-window", url, options),
  sendMessage: (msg) => ipcRenderer.send("send-message", msg),
  openChat: () => ipcRenderer.send("open-chat"),
  openConfig: () => ipcRenderer.send("open-config"),
  openMonitor: () => ipcRenderer.send("open-monitor"),
  startVoice: () => ipcRenderer.send("start-voice"),
  closeWidget: () => ipcRenderer.send("close-widget"),
  closeNotify: () => ipcRenderer.send("close-notify"),
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  selectVocabularyExcel: () => ipcRenderer.invoke("vocabulary:select-excel"),
  updateVocabularyFromExcel: async (filePath) => {
    const response = await fetch(`${API}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath })
    });
    return parseJson(response);
  },
  getVocabularyMeta: async () => {
    const response = await fetch(`${API}/meta`);
    return parseJson(response);
  },
  getProcessState: () => ipcRenderer.invoke("monitor:get-state"),
  controlService: (service, action) => ipcRenderer.invoke("service:control", service, action),

  onNotify: (callback) => {
    const subscription = (event, msg) => callback(msg);
    ipcRenderer.on("notify", subscription);
    return () => ipcRenderer.removeListener("notify", subscription);
  },

  onChatMessage: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on("chat-message", subscription);
    return () => ipcRenderer.removeListener("chat-message", subscription);
  },

  onBeforeClose: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on("start-fade-out", subscription);
    return () => ipcRenderer.removeListener("start-fade-out", subscription);
  },

  onFileSelected: (callback) => {
    const subscription = (event, filePath) => callback(filePath);
    ipcRenderer.on("file-selected", subscription);
    return () => ipcRenderer.removeListener("file-selected", subscription);
  },

  onStartVoice: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on("start-voice", subscription);
    return () => ipcRenderer.removeListener("start-voice", subscription);
  },

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

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld("kitAPI", kitAPI);
} else {
  window.kitAPI = kitAPI;
}
