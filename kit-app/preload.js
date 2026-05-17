const { contextBridge, ipcRenderer } = require("electron");
const API = "http://localhost:3001/api/vocabulary";
const BACKEND = "http://localhost:3001";

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
  openStudio: () => ipcRenderer.send("open-studio"),
  openPresetManager: () => ipcRenderer.send("open-preset-manager"),
  openStudioWindow: (initialState) => ipcRenderer.invoke("studio:window:open", initialState || null),
  getPresetManagerMeta: () => ipcRenderer.invoke("preset-manager:meta"),
  listPresets: (type) => ipcRenderer.invoke("preset-manager:list", type),
  createPreset: (type) => ipcRenderer.invoke("preset-manager:new", type),
  openPreset: (payload) => ipcRenderer.invoke("preset-manager:open", payload || {}),
  validatePreset: (payload) => ipcRenderer.invoke("preset-manager:validate", payload || {}),
  savePreset: (payload) => ipcRenderer.invoke("preset-manager:save", payload || {}),
  savePresetAs: (payload) => ipcRenderer.invoke("preset-manager:save-as", payload || {}),
  duplicatePreset: (payload) => ipcRenderer.invoke("preset-manager:duplicate", payload || {}),
  deletePreset: (payload) => ipcRenderer.invoke("preset-manager:delete", payload || {}),
  selectPresetAsset: (options) => ipcRenderer.invoke("preset-manager:select-asset", options || {}),
  launchStudioFromCommand: (payload) => ipcRenderer.invoke("studio:launch", payload || {}),
  openWidget: () => ipcRenderer.send("open-widget"),
  minimizeStudioWindow: () => ipcRenderer.send("studio:window:minimize"),
  toggleStudioMaximize: () => ipcRenderer.send("studio:window:toggle-maximize"),
  closeStudio: () => ipcRenderer.send("studio:close"),
  startVoice: () => ipcRenderer.send("start-voice"),
  closeWidget: () => ipcRenderer.send("close-widget"),
  resizeWidget: (height) => ipcRenderer.invoke("widget:resize", height),
  closeNotify: () => ipcRenderer.send("close-notify"),
  setActiveConversation: (sessionId) => ipcRenderer.send("set-active-conversation", sessionId),
  getWakeListeningConfig: () => ipcRenderer.invoke("wake-listening:get-config"),
  getWakeListeningRuntime: () => ipcRenderer.invoke("wake-listening:get-runtime"),
  wakeListeningLog: (message) => ipcRenderer.send("wake-listening:log", message),
  openFileDialog: (options) => ipcRenderer.invoke("open-file-dialog", options || {}),
  openPath: (filePath) => ipcRenderer.invoke("shell:open-path", filePath || ""),
  selectClientFolder: () => ipcRenderer.invoke("canvas:client-folder:select"),
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
  saveCanvasI2ITempPng: (payload) => ipcRenderer.invoke("canvas:i2i:save-temp-png", payload || {}),
  saveCanvasVideoMp4: (payload) => ipcRenderer.invoke("canvas:video:save-mp4", payload || {}),
  saveCanvasAutosave: (payload) => ipcRenderer.invoke("canvas:autosave:save", payload || {}),
  loadCanvasAutosave: () => ipcRenderer.invoke("canvas:autosave:load"),
  createStudioProject: (payload) => ipcRenderer.invoke("studio:project:create", payload || {}),
  saveStudioProject: (payload) => ipcRenderer.invoke("studio:project:save", payload || {}),
  openStudioProject: (filePath) => ipcRenderer.invoke("studio:project:open", filePath || ""),
  getStudioInitialState: () => ipcRenderer.invoke("studio:initial-state:get"),
  getStudioSystemStats: () => ipcRenderer.invoke("studio:system-stats"),
  generateStudioScript: async (payload) => {
    const response = await fetch(`${BACKEND}/api/studio/script/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    return parseJson(response);
  },
  applyStudioSceneInstruction: async (payload) => {
    const response = await fetch(`${BACKEND}/api/studio/scene/instruction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    return parseJson(response);
  },
  generateStudioSceneImage: async (payload) => {
    const response = await fetch(`${BACKEND}/api/studio/media/generate-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    return parseJson(response);
  },
  generateStudioSceneVideo: async (payload) => {
    const response = await fetch(`${BACKEND}/api/studio/media/generate-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    return parseJson(response);
  },
  generateGlobalVideo: async (payload) => {
    const response = await fetch(`${BACKEND}/api/media/generate-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    return parseJson(response);
  },
  getStudioVideoJobStatus: async ({ jobId = "" } = {}) => {
    const query = new URLSearchParams();
    if (jobId) query.set("jobId", jobId);
    const response = await fetch(`${BACKEND}/api/studio/media/video-status?${query.toString()}`);
    return parseJson(response);
  },
  getGlobalVideoJobStatus: async ({ jobId = "" } = {}) => {
    const query = new URLSearchParams();
    if (jobId) query.set("jobId", jobId);
    const response = await fetch(`${BACKEND}/api/media/video-status?${query.toString()}`);
    return parseJson(response);
  },
  cancelGlobalVideoJob: async ({ jobId = "" } = {}) => {
    const response = await fetch(`${BACKEND}/api/media/cancel-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId })
    });
    return parseJson(response);
  },
  listGlobalVideoJobs: async ({ source = "", sessionId = "" } = {}) => {
    const query = new URLSearchParams();
    if (source) query.set("source", source);
    if (sessionId) query.set("sessionId", sessionId);
    const response = await fetch(`${BACKEND}/api/media/list-video-jobs?${query.toString()}`);
    return parseJson(response);
  },
  getGlobalVideoModels: async () => {
    const response = await fetch(`${BACKEND}/api/media/video-models`);
    return parseJson(response);
  },
  listComfyWorkflows: async () => {
    const response = await fetch(`${BACKEND}/api/comfy/workflows`);
    return parseJson(response);
  },
  getComfyWorkflowFields: async (workflowId = "wan2.2") => {
    const response = await fetch(`${BACKEND}/api/comfy/workflows/${encodeURIComponent(workflowId)}/fields`);
    return parseJson(response);
  },
  listXttsVoices: () => ipcRenderer.invoke("xtts:voices:list"),
  saveXttsSubtitle: (payload) => ipcRenderer.invoke("xtts:subtitle:save", payload || {}),
  generateXttsNarration: async (payload) => {
    const response = await fetch(`http://127.0.0.1:${payload?.port || 5005}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: payload?.text || "",
        speaker: payload?.speaker || "Daisy Studious",
        language: payload?.language || "pt"
      })
    });
    return parseJson(response);
  },
  getStudioClientMedia: async ({ clientId = "", clientName = "", projectId = "" } = {}) => {
    const query = new URLSearchParams();
    if (clientId) query.set("clientId", clientId);
    if (clientName) query.set("clientName", clientName);
    if (projectId) query.set("projectId", projectId);
    const response = await fetch(`${BACKEND}/api/studio/client-media?${query.toString()}`);
    return parseJson(response);
  },
  getStudioAiMedia: async ({ clientId = "", clientName = "", projectId = "" } = {}) => {
    const query = new URLSearchParams();
    if (clientId) query.set("clientId", clientId);
    if (clientName) query.set("clientName", clientName);
    if (projectId) query.set("projectId", projectId);
    const response = await fetch(`${BACKEND}/api/studio/ai-media?${query.toString()}`);
    return parseJson(response);
  },
  getStudioProjectAttachments: async ({ projectId = "" } = {}) => {
    const query = new URLSearchParams();
    if (projectId) query.set("projectId", projectId);
    const response = await fetch(`${BACKEND}/api/studio/project-attachments?${query.toString()}`);
    return parseJson(response);
  },
  getStableDiffusionHealth: async () => {
    const response = await fetch(`${BACKEND}/sd/health`);
    return parseJson(response);
  },
  getStableDiffusionModels: async () => {
    const response = await fetch(`${BACKEND}/sd/models`);
    return parseJson(response);
  },
  getStableDiffusionProgress: async () => {
    const response = await fetch(`${BACKEND}/sd/progress`);
    return parseJson(response);
  },
  generateStableDiffusionImage: async (payload) => {
    const response = await fetch(`${BACKEND}/sd/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    return parseJson(response);
  },
  txt2imgStableDiffusionImage: async (payload) => {
    const response = await fetch(`${BACKEND}/sd/txt2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    return parseJson(response);
  },
  img2imgStableDiffusionImage: async (payload) => {
    const response = await fetch(`${BACKEND}/sd/img2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    return parseJson(response);
  },
  inpaintStableDiffusionImage: async (payload) => {
    const response = await fetch(`${BACKEND}/sd/inpaint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    return parseJson(response);
  },
  outpaintStableDiffusionImage: async (payload) => {
    const response = await fetch(`${BACKEND}/sd/outpaint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    return parseJson(response);
  },
  onCanvasCommand: (callback) => {
    const subscription = (event, payload) => callback(payload);
    ipcRenderer.on("canvas:command", subscription);
    return () => ipcRenderer.removeListener("canvas:command", subscription);
  },
  onStudioInitState: (callback) => {
    const subscription = (event, payload) => callback(payload);
    ipcRenderer.on("studio:init-state", subscription);
    return () => ipcRenderer.removeListener("studio:init-state", subscription);
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
