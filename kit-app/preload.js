const { contextBridge, ipcRenderer } = require("electron");
const { ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kitAPI", {
  openWindow: (url, options) => ipcRenderer.invoke("open-window", url, options)
});
contextBridge.exposeInMainWorld("kitAPI", {
  // --- Envios (Renderer -> Main) ---
  sendMessage: (msg) => ipcRenderer.send("send-message", msg),
  openChat: () => ipcRenderer.send("open-chat"),
  openConfig: () => ipcRenderer.send("open-config"),
  startVoice: () => ipcRenderer.send("start-voice"),
  closeWidget: () => ipcRenderer.send("close-widget"),
  closeNotify: () => ipcRenderer.send("close-notify"),

  // --- Recebimentos (Main -> Renderer) ---
  
  // Para a janela de Notificação (o balão)
  onNotify: (callback) => {
    const subscription = (event, msg) => callback(msg);
    ipcRenderer.on("notify", subscription);
    // Retorna uma função para remover o listener se necessário
    return () => ipcRenderer.removeListener("notify", subscription);
  },

  // Para o Chat principal
  onChatMessage: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on("chat-message", subscription);
    return () => ipcRenderer.removeListener("chat-message", subscription);
  },
  //
  
  // Novo: Para animar o fechamento suave do balão antes de destruir a janela
  onBeforeClose: (callback) => {
    ipcRenderer.on("start-fade-out", () => callback());
  }
});