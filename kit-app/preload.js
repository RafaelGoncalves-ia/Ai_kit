const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kitAPI", {
  openWindow: (url, options) => ipcRenderer.invoke("open-window", url, options),
  sendMessage: (msg) => ipcRenderer.send("send-message", msg),
  openChat: () => ipcRenderer.send("open-chat"),
  openConfig: () => ipcRenderer.send("open-config"),
  startVoice: () => ipcRenderer.send("start-voice"),
  closeWidget: () => ipcRenderer.send("close-widget"),
  closeNotify: () => ipcRenderer.send("close-notify"),
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),

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
  }
});
