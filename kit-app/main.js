const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  dialog,
  globalShortcut,
  nativeImage,
  screen,
  ipcMain
} = require("electron");
const path = require("path");
const { EventSource } = require("eventsource");
const { createProcessManager } = require("./processManager");

const ROOT_DIR = path.resolve(__dirname, "..");
const PRELOAD_PATH = path.join(__dirname, "preload.js");
const TRAY_ICON_PATH = path.join(__dirname, "renderer", "assets", "icone.ico");

let widgetWindow = null;
let chatWindow = null;
let configWindow = null;
let monitorWindow = null;
let notifyWindow = null;
let tray = null;
let sseConnection = null;
let isQuitting = false;
let isShuttingDown = false;

const processManager = createProcessManager({
  rootDir: ROOT_DIR,
  onLog(payload) {
    if (monitorWindow && !monitorWindow.isDestroyed()) {
      monitorWindow.webContents.send("process-log", payload);
    }
  },
  onStatus(payload) {
    if (monitorWindow && !monitorWindow.isDestroyed()) {
      monitorWindow.webContents.send("process-status", payload);
    }
  }
});

function createBaseWindow(options = {}) {
  return new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: true,
      contextIsolation: false
    },
    ...options
  });
}

function attachHideOnClose(windowRef, onHidden) {
  windowRef.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    windowRef.hide();
    onHidden?.();
  });
}

function createWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    return widgetWindow;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  widgetWindow = createBaseWindow({
    width: 500,
    height: 70,
    x: Math.floor((width - 500) / 2),
    y: height - 100,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    skipTaskbar: true
  });

  widgetWindow.loadFile(path.join(__dirname, "renderer", "widget.html"));
  attachHideOnClose(widgetWindow);
  widgetWindow.on("closed", () => {
    widgetWindow = null;
  });

  return widgetWindow;
}

function showWidget() {
  const windowRef = createWidget();
  windowRef.show();
  windowRef.focus();
}

function createChat() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.show();
    chatWindow.focus();
    return chatWindow;
  }

  chatWindow = createBaseWindow({
    width: 900,
    height: 700
  });

  chatWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  attachHideOnClose(chatWindow);
  chatWindow.on("closed", () => {
    chatWindow = null;
  });

  chatWindow.once("ready-to-show", () => {
    chatWindow.show();
  });

  return chatWindow;
}

function createConfig() {
  if (configWindow && !configWindow.isDestroyed()) {
    configWindow.show();
    configWindow.focus();
    return configWindow;
  }

  configWindow = createBaseWindow({
    width: 700,
    height: 760
  });

  configWindow.loadFile(path.join(__dirname, "renderer", "config", "config.html"));
  attachHideOnClose(configWindow);
  configWindow.on("closed", () => {
    configWindow = null;
  });

  configWindow.once("ready-to-show", () => {
    configWindow.show();
  });

  return configWindow;
}

function createMonitor() {
  if (monitorWindow && !monitorWindow.isDestroyed()) {
    monitorWindow.show();
    monitorWindow.focus();
    return monitorWindow;
  }

  monitorWindow = createBaseWindow({
    width: 1100,
    height: 760
  });

  monitorWindow.loadFile(path.join(__dirname, "renderer", "monitor.html"));
  attachHideOnClose(monitorWindow);
  monitorWindow.on("closed", () => {
    monitorWindow = null;
  });

  monitorWindow.once("ready-to-show", () => {
    monitorWindow.show();
  });

  return monitorWindow;
}

function createNotifyHTML(data) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  if (notifyWindow && !notifyWindow.isDestroyed()) {
    notifyWindow.close();
    notifyWindow = null;
  }

  notifyWindow = createBaseWindow({
    width: 320,
    height: 90,
    x: width - 340,
    y: height - 110,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    skipTaskbar: true
  });

  notifyWindow.loadFile(path.join(__dirname, "renderer", "notify.html"));
  notifyWindow.on("closed", () => {
    notifyWindow = null;
  });
  notifyWindow.webContents.on("did-finish-load", () => {
    notifyWindow?.webContents.send("notify", data);
  });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Chat",
      click: () => createChat()
    },
    {
      label: "Config",
      click: () => createConfig()
    },
    {
      label: "Log",
      click: () => createMonitor()
    },
    {
      label: "Widget",
      click: () => showWidget()
    },
    { type: "separator" },
    {
      label: "Encerrar",
      click: () => {
        void shutdownAllAndQuit();
      }
    }
  ]);
}

function createTray() {
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
    return tray;
  }

  const icon = nativeImage.createFromPath(TRAY_ICON_PATH);
  tray = new Tray(icon.isEmpty() ? TRAY_ICON_PATH : icon);
  tray.setToolTip("KIT IA");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", () => {
    createChat();
  });
  tray.on("right-click", () => {
    tray.popUpContextMenu(buildTrayMenu());
  });

  return tray;
}

function connectSSE() {
  if (sseConnection) {
    sseConnection.close();
    sseConnection = null;
  }

  try {
    const evt = new EventSource("http://localhost:3001/events");
    sseConnection = evt;

    evt.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "assistant_message" && data.payload?.role === "assistant") {
          const msg = String(data.payload.text || "").trim();
          if (!msg) {
            return;
          }

          const notification = new Notification({
            title: "Kit IA",
            body: msg,
            silent: false
          });

          notification.show();
          notification.on("click", () => {
            createChat();
            if (notifyWindow && !notifyWindow.isDestroyed()) {
              notifyWindow.close();
              notifyWindow = null;
            }
          });

          createNotifyHTML({
            title: "Kit IA",
            message: msg,
            type: "info"
          });

          if (chatWindow && !chatWindow.isDestroyed()) {
            chatWindow.webContents.send("chat-message", {
              author: "Kit IA",
              text: msg
            });
          }
        }
      } catch (err) {
        console.error("Erro parse SSE:", err);
      }
    };

    evt.onerror = () => {
      evt.close();
      sseConnection = null;

      if (!isQuitting) {
        setTimeout(connectSSE, 3000);
      }
    };
  } catch (err) {
    console.error("Erro ao iniciar SSE:", err);
    if (!isQuitting) {
      setTimeout(connectSSE, 3000);
    }
  }
}

function registerShortcuts() {
  globalShortcut.register("CommandOrControl+Space", () => {
    const windowRef = createWidget();
    if (windowRef.isVisible()) {
      windowRef.hide();
      return;
    }

    windowRef.show();
    windowRef.focus();
  });

  globalShortcut.register("CommandOrControl+Shift+C", () => {
    createChat();
  });

  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    const windowRef = createWidget();
    windowRef.show();
    windowRef.focus();
    setTimeout(() => {
      if (!windowRef.isDestroyed()) {
        windowRef.webContents.send("start-voice");
      }
    }, 300);
  });

  globalShortcut.register("CommandOrControl+Shift+N", () => {
    createNotifyHTML({
      title: "DEBUG",
      message: "Notificacao funcionando",
      type: "success"
    });
  });
}

async function shutdownAllAndQuit() {
  if (isShuttingDown) {
    return;
  }

  isQuitting = true;
  isShuttingDown = true;

  try {
    if (sseConnection) {
      sseConnection.close();
      sseConnection = null;
    }

    await processManager.shutdownAll();
  } finally {
    globalShortcut.unregisterAll();
    tray?.destroy();
    tray = null;
    app.quit();
  }
}

ipcMain.on("open-chat", () => {
  createChat();
  if (notifyWindow && !notifyWindow.isDestroyed()) {
    notifyWindow.close();
    notifyWindow = null;
  }
});

ipcMain.on("open-config", () => {
  createConfig();
});

ipcMain.on("open-monitor", () => {
  createMonitor();
});

ipcMain.on("close-widget", () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.hide();
  }
});

ipcMain.on("close-notify", () => {
  if (notifyWindow && !notifyWindow.isDestroyed()) {
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

ipcMain.handle("vocabulary:select-excel", async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: "Selecionar planilha de vocabulário",
    properties: ["openFile"],
    filters: [
      { name: "Planilhas Excel", extensions: ["xlsx"] }
    ]
  });

  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle("monitor:get-state", async () => {
  return processManager.getSnapshot();
});

ipcMain.handle("service:control", async (event, service, action) => {
  if (action === "start") {
    return processManager.startService(service);
  }

  if (action === "stop") {
    return processManager.stopService(service);
  }

  if (action === "restart") {
    return processManager.restartService(service);
  }

  throw new Error(`Acao desconhecida: ${action}`);
});

ipcMain.handle("open-window", (event, url, options) => {
  const win = createBaseWindow({
    width: options.width || 800,
    height: options.height || 600,
    title: options.title || "Janela"
  });

  win.loadFile(path.join(__dirname, url));
  win.once("ready-to-show", () => {
    win.show();
  });
});

app.on("before-quit", (event) => {
  if (isQuitting) {
    return;
  }

  event.preventDefault();
  void shutdownAllAndQuit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.whenReady().then(async () => {
  app.setAppUserModelId("kit.ia.host");
  createTray();
  createWidget();
  registerShortcuts();
  connectSSE();
  await processManager.startDefaults();
});
