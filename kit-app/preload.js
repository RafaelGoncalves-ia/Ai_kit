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
  openCanvas: () => ipcRenderer.send("open-canvas"),
  openWidget: () => ipcRenderer.send("open-widget"),
  startVoice: () => ipcRenderer.send("start-voice"),
  closeWidget: () => ipcRenderer.send("close-widget"),
  resizeWidget: (height) => ipcRenderer.invoke("widget:resize", height),
  closeNotify: () => ipcRenderer.send("close-notify"),
  setActiveConversation: (sessionId) => ipcRenderer.send("set-active-conversation", sessionId),
  getWakeListeningConfig: () => ipcRenderer.invoke("wake-listening:get-config"),
  getWakeListeningRuntime: () => ipcRenderer.invoke("wake-listening:get-runtime"),
  wakeListeningLog: (message) => ipcRenderer.send("wake-listening:log", message),
  openFileDialog: (options) => ipcRenderer.invoke("open-file-dialog", options || {}),
  createBrandKit: () => ipcRenderer.invoke("canvas:brand-kit:new"),
  openBrandKit: () => ipcRenderer.invoke("canvas:brand-kit:open"),
  saveBrandKit: (payload) => ipcRenderer.invoke("canvas:brand-kit:save", payload || {}),
  selectBrandKitFiles: (options) => ipcRenderer.invoke("canvas:brand-kit:select-files", options || {}),
  createCanvasProject: () => ipcRenderer.invoke("canvas:project:new"),
  openCanvasProject: () => ipcRenderer.invoke("canvas:project:open"),
  openCanvasProjectPath: (filePath) => ipcRenderer.invoke("canvas:project:open-path", filePath),
  saveCanvasProject: (payload) => ipcRenderer.invoke("canvas:project:save", payload || {}),
  saveCanvasMaskPng: (payload) => ipcRenderer.invoke("canvas:mask:save-png", payload || {}),
  saveCanvasImage: (payload) => ipcRenderer.invoke("canvas:image:save", payload || {}),
  saveCanvasAutosave: (payload) => ipcRenderer.invoke("canvas:autosave:save", payload || {}),
  loadCanvasAutosave: () => ipcRenderer.invoke("canvas:autosave:load"),
  onCanvasCommand: (callback) => {
    const subscription = (event, payload) => callback(payload);
    ipcRenderer.on("canvas:command", subscription);
    return () => ipcRenderer.removeListener("canvas:command", subscription);
  },
  replyCanvasCommand: (payload) => ipcRenderer.send("canvas:command-result", payload || {}),
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
  markActivity: (source) => ipcRenderer.invoke("kit:activity", source),

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

  onConversationActivated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on("conversation-activated", subscription);
    return () => ipcRenderer.removeListener("conversation-activated", subscription);
  },

  onWakeListeningConfig: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on("wake-listening:config", subscription);
    return () => ipcRenderer.removeListener("wake-listening:config", subscription);
  },

  onBeforeClose: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on("start-fade-out", subscription);
    return () => ipcRenderer.removeListener("start-fade-out", subscription);
  },

  onFileSelected: (callback) => {
    const subscription = (event, payload) => callback(payload);
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
