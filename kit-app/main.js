const { app, BrowserWindow, globalShortcut, ipcMain, screen, Notification, dialog } = require("electron");
const path = require("path");
const { EventSource } = require("eventsource");

let widgetWindow;
let chatWindow;
let configWindow;
let notifyWindow;

// ======================
// WIDGET
// ======================
function createWidget() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  widgetWindow = new BrowserWindow({
    width: 500,
    height: 70,
    x: Math.floor((width - 500) / 2),
    y: height - 100,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  widgetWindow.loadFile("renderer/widget.html");
  widgetWindow.hide();
}

// ======================
// CHAT
// ======================
function createChat() {
  if (chatWindow) {
    chatWindow.show();
    chatWindow.focus();
    return;
  }

  chatWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  chatWindow.loadFile("renderer/index.html");

  chatWindow.on("closed", () => {
    chatWindow = null;
  });
}

// ======================
// CONFIG
// ======================
function createConfig() {
  if (configWindow) {
    configWindow.focus();
    return;
  }

  configWindow = new BrowserWindow({
    width: 600,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  configWindow.loadFile("renderer/config/config.html");

  configWindow.on("closed", () => {
    configWindow = null;
  });
}

// ======================
// NOTIFICAÇÃO HTML
// ======================
function createNotifyHTML(data) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  if (notifyWindow) {
    notifyWindow.close();
    notifyWindow = null;
  }

  notifyWindow = new BrowserWindow({
    width: 320,
    height: 90,
    x: width - 340,
    y: height - 110,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  notifyWindow.loadFile("renderer/notify.html");

  notifyWindow.webContents.on("did-finish-load", () => {
    notifyWindow.webContents.send("notify", data);
  });
}

// ======================
// SSE - RESPOSTAS DA IA
// ======================
function connectSSE() {
  try {
    const evt = new EventSource("http://localhost:3001/events");

    evt.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "task:completed") {
          const msg = data.payload.result;

          const notification = new Notification({
            title: "Kit IA",
            body: msg,
            silent: false,
          });

          notification.show();

          notification.on("click", () => {
            createChat();
            if (notifyWindow) {
              notifyWindow.close();
              notifyWindow = null;
            }
          });

          createNotifyHTML({
            title: "Kit IA",
            message: msg,
            type: "info"
          });

          if (chatWindow) {
            chatWindow.webContents.send("chat-message", {
              author: "Kit IA",
              text: msg,
            });
          }
        }
      } catch (err) {
        console.error("Erro parse SSE:", err);
      }
    };

    evt.onerror = () => {
      console.warn("Reconectando SSE...");
      evt.close();
      setTimeout(connectSSE, 3000);
    };
  } catch (err) {
    console.error("Erro ao iniciar SSE:", err);
  }
}

// ======================
// IPC
// ======================
ipcMain.on("open-chat", () => {
  createChat();
  if (notifyWindow) {
    notifyWindow.close();
    notifyWindow = null;
  }
});

ipcMain.on("open-config", () => {
  createConfig();
});

ipcMain.on("close-widget", () => {
  if (widgetWindow) widgetWindow.hide();
});

ipcMain.on("close-notify", () => {
  if (notifyWindow) {
    notifyWindow.close();
    notifyWindow = null;
  }
});

ipcMain.handle("open-file-dialog", async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: "Selecionar imagem",
    properties: ["openFile"],
    filters: [
      { name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }
    ]
  });

  const selectedPath = result.canceled ? null : result.filePaths[0] || null;
  event.sender.send("file-selected", selectedPath);
  return selectedPath;
});

// ======================
// APP READY
// ======================
app.whenReady().then(() => {
  createWidget();
  connectSSE();

  globalShortcut.register("CommandOrControl+Space", () => {
    widgetWindow.isVisible() ? widgetWindow.hide() : widgetWindow.show();
  });

  globalShortcut.register("CommandOrControl+Shift+C", () => {
    createChat();
  });

  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    widgetWindow.show();
    setTimeout(() => {
      widgetWindow.webContents.send("start-voice");
    }, 300);
  });

  globalShortcut.register("CommandOrControl+Shift+N", () => {
    createNotifyHTML({
      title: "DEBUG",
      message: "Notificação funcionando",
      type: "success"
    });
  });
});

// ======================
// GENERIC WINDOW HANDLER
// ======================
ipcMain.handle("open-window", (event, url, options) => {
  const win = new BrowserWindow({
    width: options.width || 800,
    height: options.height || 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: false
    },
    title: options.title || "Janela"
  });

  win.loadFile(path.join(__dirname, url));
});

// ======================
// CLEANUP
// ======================
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
