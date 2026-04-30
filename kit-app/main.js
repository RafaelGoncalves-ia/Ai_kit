const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  dialog,
  globalShortcut,
  nativeImage,
  session,
  screen,
  ipcMain,
  shell
} = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { pathToFileURL } = require("url");
const { EventSource } = require("eventsource");
const { createProcessManager } = require("./processManager");
const { createWebSearchBridge } = require("./webSearchBridge");
const {
  createDefaultBrandKit,
  loadBrandKitFromFile,
  saveBrandKitToFile
} = require("./main/brandKit");
const {
  createDefaultProject,
  loadProjectFromFile,
  saveProjectToFile
} = require("./main/projectFile");

const ROOT_DIR = path.resolve(__dirname, "..");
const PRELOAD_PATH = path.join(__dirname, "preload.js");
const TRAY_ICON_PATH = path.join(__dirname, "renderer", "assets", "icone.ico");
const CHAT_HTML_PATH = path.join(__dirname, "renderer", "index.html");
const CANVAS_HTML_PATH = path.join(__dirname, "renderer", "canvas", "canvas.html");
const CANVAS_AUTOSAVE_FILE = "canvas-autosave.json";
const CANVAS_BRIDGE_PORT = Number(process.env.KIT_CANVAS_BRIDGE_PORT || 31977);

let widgetWindow = null;
let chatWindow = null;
let configWindow = null;
let monitorWindow = null;
let canvasWindow = null;
let notifyWindow = null;
let wakeWindow = null;
let tray = null;
let sseConnection = null;
let isQuitting = false;
let isShuttingDown = false;
let activeConversationId = null;
let wakeListeningConfig = null;
let wakeConfigModulePromise = null;
let llmIdleTimer = null;
let xttsIdleTimer = null;
let webSearchBridge = null;
let canvasBridgeServer = null;
let canvasCommandCounter = 0;
const pendingCanvasCommands = new Map();

const LLM_IDLE_TIMEOUT_MS = Math.max(
  60000,
  Number(process.env.KIT_IDLE_LLM_TIMEOUT_MS || 5 * 60 * 1000)
);
const AUTO_UNLOAD_LLM = process.env.KIT_AUTO_UNLOAD_LLM === "true";
const XTTS_IDLE_TIMEOUT_MS = Math.max(
  LLM_IDLE_TIMEOUT_MS * 2,
  Number(process.env.KIT_IDLE_XTTS_TIMEOUT_MS || LLM_IDLE_TIMEOUT_MS * 2)
);
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

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

function clearIdleTimer(timerRef) {
  if (!timerRef) {
    return null;
  }

  clearTimeout(timerRef);
  return null;
}

async function notifyBackendActivity(source = "unknown") {
  try {
    await fetch("http://localhost:3001/runtime/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source })
    });
  } catch {}
}

async function warmupBackendLLM() {
  try {
    await fetch("http://localhost:3001/llm/warmup", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
  } catch {}
}

async function unloadBackendLLM() {
  try {
    await fetch("http://localhost:3001/llm/unload", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
  } catch {}
}

function scheduleIdlePowerDown() {
  llmIdleTimer = clearIdleTimer(llmIdleTimer);
  xttsIdleTimer = clearIdleTimer(xttsIdleTimer);

  if (AUTO_UNLOAD_LLM) {
    llmIdleTimer = setTimeout(() => {
      void unloadBackendLLM();
    }, LLM_IDLE_TIMEOUT_MS);
    llmIdleTimer.unref?.();
  }

  xttsIdleTimer = setTimeout(() => {
    void processManager.stopService("xtts");
  }, XTTS_IDLE_TIMEOUT_MS);
  xttsIdleTimer.unref?.();
}

async function ensureInteractiveServices(source = "unknown") {
  await notifyBackendActivity(source);
  await processManager.startService("xtts");
  void warmupBackendLLM();
  scheduleIdlePowerDown();
}

function createBaseWindow(options = {}) {
  const windowRef = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: true
    },
    ...options
  });

  attachSpellcheckContextMenu(windowRef);
  return windowRef;
}

function attachSpellcheckContextMenu(windowRef) {
  if (!windowRef || windowRef.isDestroyed()) {
    return;
  }

  windowRef.webContents.on("context-menu", (event, params) => {
    const menuTemplate = [];
    const suggestions = Array.isArray(params.dictionarySuggestions)
      ? params.dictionarySuggestions.slice(0, 6)
      : [];

    if (params.misspelledWord && suggestions.length) {
      suggestions.forEach((suggestion) => {
        menuTemplate.push({
          label: suggestion,
          click: () => windowRef.webContents.replaceMisspelling(suggestion)
        });
      });
      menuTemplate.push({ type: "separator" });
    }

    if (params.misspelledWord && !suggestions.length) {
      menuTemplate.push({
        label: "Sem sugestoes",
        enabled: false
      });
      menuTemplate.push({ type: "separator" });
    }

    if (params.isEditable) {
      menuTemplate.push(
        { role: "undo", label: "Desfazer" },
        { role: "redo", label: "Refazer" },
        { type: "separator" },
        { role: "cut", label: "Recortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Colar" },
        { role: "selectAll", label: "Selecionar tudo" }
      );
    } else if (params.selectionText) {
      menuTemplate.push(
        { role: "copy", label: "Copiar" },
        { role: "selectAll", label: "Selecionar tudo" }
      );
    }

    if (!menuTemplate.length) {
      return;
    }

    const menu = Menu.buildFromTemplate(menuTemplate);
    menu.popup({
      window: windowRef
    });
  });
}

function getPreferredParentWindow() {
  const windows = [canvasWindow, chatWindow, configWindow, monitorWindow, widgetWindow, wakeWindow];
  return windows.find((windowRef) => windowRef && !windowRef.isDestroyed()) || null;
}

function isAbsoluteFilePath(filePath = "") {
  return path.isAbsolute(String(filePath || ""));
}

function resolveProjectBrandKitPath(project = {}, projectFilePath = "") {
  const brandKitPath = String(project.brandKitPath || "").trim();
  if (!brandKitPath) {
    return null;
  }

  if (isAbsoluteFilePath(brandKitPath)) {
    return brandKitPath;
  }

  if (!projectFilePath) {
    return path.resolve(ROOT_DIR, brandKitPath);
  }

  return path.resolve(path.dirname(projectFilePath), brandKitPath);
}

function makeBrandKitPathRelativeToProject(project = {}, projectFilePath = "") {
  const brandKitPath = String(project.brandKitPath || "").trim();
  if (!brandKitPath || !projectFilePath || !isAbsoluteFilePath(brandKitPath)) {
    return project;
  }

  const relativePath = path.relative(path.dirname(projectFilePath), brandKitPath);
  return {
    ...project,
    brandKitPath: relativePath || brandKitPath
  };
}

function loadInheritedBrandKit(project = {}, projectFilePath = "") {
  const resolvedPath = resolveProjectBrandKitPath(project, projectFilePath);
  if (!resolvedPath) {
    return null;
  }

  if (!fs.existsSync(resolvedPath)) {
    return {
      missing: true,
      filePath: resolvedPath,
      error: "Brand Kit pai nao encontrado."
    };
  }

  return loadBrandKitFromFile(resolvedPath);
}

function getCanvasAutosavePath() {
  return path.join(app.getPath("userData"), CANVAS_AUTOSAVE_FILE);
}

function writeCanvasAutosave(payload = {}) {
  const autosavePath = getCanvasAutosavePath();
  const savedAt = payload.savedAt || new Date().toISOString();
  const data = {
    version: 1,
    savedAt,
    filePath: payload.filePath || null,
    project: payload.project || createDefaultProject()
  };

  fs.mkdirSync(path.dirname(autosavePath), { recursive: true });
  fs.writeFileSync(autosavePath, JSON.stringify(data, null, 2), "utf8");
  return {
    savedAt,
    filePath: autosavePath
  };
}

function readCanvasAutosave() {
  const autosavePath = getCanvasAutosavePath();
  if (!fs.existsSync(autosavePath)) {
    return null;
  }

  const data = JSON.parse(fs.readFileSync(autosavePath, "utf8"));
  if (!data?.project) {
    return null;
  }

  return {
    ...data,
    inheritedBrandKit: loadInheritedBrandKit(data.project, data.filePath || "")
  };
}

function isInternalAppUrl(url = "") {
  if (!url) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:";
  } catch {
    return false;
  }
}

function openExternalUrl(url = "") {
  if (!url || isInternalAppUrl(url)) {
    return;
  }

  shell.openExternal(url).catch((err) => {
    console.error("[KIT] Falha ao abrir link externo:", err.message);
  });
}

function attachExternalLinkGuard(windowRef) {
  if (!windowRef || windowRef.isDestroyed()) {
    return;
  }

  windowRef.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  windowRef.webContents.on("will-navigate", (event, url) => {
    if (isInternalAppUrl(url)) {
      return;
    }

    event.preventDefault();
    openExternalUrl(url);
  });
}

async function loadWakeConfigModule() {
  if (!wakeConfigModulePromise) {
    const moduleUrl = pathToFileURL(
      path.join(ROOT_DIR, "backend", "core", "audio", "WakeListeningConfig.js")
    ).href;
    wakeConfigModulePromise = import(moduleUrl);
  }

  return wakeConfigModulePromise;
}

async function ensureWakeListeningConfigLoaded() {
  const wakeConfigModule = await loadWakeConfigModule();
  wakeListeningConfig = wakeConfigModule.loadWakeListeningConfig();
  return wakeListeningConfig;
}

async function saveWakeListeningConfig(nextConfig = {}) {
  const wakeConfigModule = await loadWakeConfigModule();
  wakeListeningConfig = wakeConfigModule.saveWakeListeningConfig(nextConfig);
  void syncWakeListeningConfigToBackend(wakeListeningConfig);
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
  }
  pushWakeListeningConfig();
  return wakeListeningConfig;
}

function isWakeListeningEnabled() {
  return Boolean(wakeListeningConfig?.enabled && wakeListeningConfig?.continuousListening);
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

function createWakeListeningWindow() {
  if (wakeWindow && !wakeWindow.isDestroyed()) {
    return wakeWindow;
  }

  wakeWindow = createBaseWindow({
    width: 1,
    height: 1,
    x: -10000,
    y: -10000,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    show: true,
    focusable: false,
    opacity: 0,
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  });

  wakeWindow.loadFile(path.join(__dirname, "renderer", "wake-listening.html"));
  wakeWindow.setAlwaysOnTop(false);
  wakeWindow.webContents.on("did-finish-load", () => {
    pushWakeListeningConfig();
  });
  wakeWindow.on("closed", () => {
    wakeWindow = null;
  });

  return wakeWindow;
}

function pushWakeListeningConfig() {
  if (!wakeWindow || wakeWindow.isDestroyed() || !wakeListeningConfig) {
    return;
  }

  wakeWindow.webContents.send("wake-listening:config", wakeListeningConfig);
}

function showWidget() {
  const windowRef = createWidget();
  void ensureInteractiveServices("widget-open");
  windowRef.show();
  windowRef.focus();
}

function resizeWidgetWindow(height) {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    return false;
  }

  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const currentBounds = widgetWindow.getBounds();
  const nextHeight = Math.max(70, Math.min(Number(height || 70), 260));
  const nextY = workArea.y + workArea.height - nextHeight - 30;

  widgetWindow.setBounds({
    x: currentBounds.x,
    y: nextY,
    width: currentBounds.width,
    height: nextHeight
  });

  return true;
}

function triggerWidgetVoiceCapture() {
  const windowRef = createWidget();
  void ensureInteractiveServices("widget-voice");
  windowRef.show();
  windowRef.focus();
  setTimeout(() => {
    if (!windowRef.isDestroyed()) {
      windowRef.webContents.send("start-voice");
    }
  }, 300);
}

function createChat() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    void ensureInteractiveServices("chat-open");
    if (!chatWindow.webContents.getURL().startsWith(pathToFileURL(CHAT_HTML_PATH).href)) {
      chatWindow.loadFile(CHAT_HTML_PATH);
    }
    chatWindow.show();
    chatWindow.focus();
    syncChatConversation();
    return chatWindow;
  }

  chatWindow = createBaseWindow({
    width: 900,
    height: 700
  });
  void ensureInteractiveServices("chat-open");

  attachExternalLinkGuard(chatWindow);
  chatWindow.loadFile(CHAT_HTML_PATH);
  attachHideOnClose(chatWindow);
  chatWindow.on("closed", () => {
    chatWindow = null;
  });

  chatWindow.once("ready-to-show", () => {
    chatWindow.show();
    syncChatConversation();
  });

  return chatWindow;
}

function syncChatConversation() {
  if (!activeConversationId || !chatWindow || chatWindow.isDestroyed()) {
    return;
  }

  chatWindow.webContents.send("conversation-activated", {
    sessionId: activeConversationId
  });
}

async function fetchBackendStatus() {
  try {
    const response = await fetch("http://localhost:3001/status");
    if (!response.ok) {
      return {};
    }
    return response.json();
  } catch {
    return {};
  }
}

async function syncWakeListeningConfigToBackend(config) {
  try {
    await fetch("http://localhost:3001/config/wake-listening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: config })
    });
  } catch {}
}

async function setWakeListeningEnabled(enabled) {
  const currentConfig = wakeListeningConfig || await ensureWakeListeningConfigLoaded();
  await saveWakeListeningConfig({
    ...currentConfig,
    enabled: Boolean(enabled),
    continuousListening: Boolean(enabled)
  });
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

function createCanvas() {
  if (canvasWindow && !canvasWindow.isDestroyed()) {
    canvasWindow.show();
    canvasWindow.focus();
    return canvasWindow;
  }

  canvasWindow = createBaseWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: "Canvas KIT IA"
  });

  canvasWindow.loadFile(CANVAS_HTML_PATH);
  attachHideOnClose(canvasWindow);
  canvasWindow.on("closed", () => {
    canvasWindow = null;
  });

  canvasWindow.once("ready-to-show", () => {
    canvasWindow.show();
  });

  return canvasWindow;
}

function ensureCanvasReady() {
  const windowRef = createCanvas();
  if (windowRef.webContents.isLoading()) {
    return new Promise((resolve) => {
      windowRef.webContents.once("did-finish-load", () => resolve(windowRef));
    });
  }

  return Promise.resolve(windowRef);
}

function focusCanvasWindow() {
  const windowRef = createCanvas();
  if (windowRef.isMinimized()) {
    windowRef.restore();
  }
  windowRef.show();
  windowRef.focus();
  return windowRef;
}

async function sendCanvasCommandToRenderer(action, payload = {}, options = {}) {
  const windowRef = await ensureCanvasReady();
  focusCanvasWindow();

  const commandId = `canvas-command-${Date.now()}-${++canvasCommandCounter}`;
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 15000));

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingCanvasCommands.delete(commandId);
      resolve({
        ok: false,
        action,
        message: "Tempo esgotado aguardando resposta do Canvas."
      });
    }, timeoutMs);

    pendingCanvasCommands.set(commandId, { resolve, timeout });
    windowRef.webContents.send("canvas:command", {
      id: commandId,
      action,
      payload
    });
  });
}

async function handleCanvasBridgeCommand(command = {}) {
  const action = String(command.action || "status").trim();
  const payload = command.payload && typeof command.payload === "object" ? command.payload : {};

  if (action === "open" || action === "focus") {
    focusCanvasWindow();
    return {
      ok: true,
      action,
      message: action === "open" ? "Canvas aberto." : "Canvas focado."
    };
  }

  return sendCanvasCommandToRenderer(action, payload, {
    timeoutMs: command.timeoutMs
  });
}

function sendJsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error("Payload muito grande."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error(`JSON invalido: ${err.message}`));
      }
    });
    req.on("error", reject);
  });
}

function startCanvasBridgeServer() {
  if (canvasBridgeServer) {
    return canvasBridgeServer;
  }

  canvasBridgeServer = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        sendJsonResponse(res, 200, {
          ok: true,
          service: "canvas-bridge",
          canvasOpen: Boolean(canvasWindow && !canvasWindow.isDestroyed())
        });
        return;
      }

      if (req.method !== "POST" || req.url !== "/canvas-command") {
        sendJsonResponse(res, 404, {
          ok: false,
          message: "Rota do Canvas Bridge nao encontrada."
        });
        return;
      }

      const command = await readRequestJson(req);
      const result = await handleCanvasBridgeCommand(command);
      sendJsonResponse(res, result?.ok === false ? 500 : 200, result);
    } catch (err) {
      sendJsonResponse(res, 500, {
        ok: false,
        message: err.message || "Falha no Canvas Bridge."
      });
    }
  });

  canvasBridgeServer.listen(CANVAS_BRIDGE_PORT, "127.0.0.1", () => {
    console.log(`[CANVAS-BRIDGE] Ativo em http://127.0.0.1:${CANVAS_BRIDGE_PORT}`);
  });

  canvasBridgeServer.on("error", (err) => {
    console.error("[CANVAS-BRIDGE] Erro:", err.message);
  });

  return canvasBridgeServer;
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
      label: "Canvas KIT IA",
      click: () => createCanvas()
    },
    {
      label: "Widget",
      click: () => showWidget()
    },
    {
      label: "Escuta contínua",
      type: "checkbox",
      checked: isWakeListeningEnabled(),
      click: (menuItem) => {
        void setWakeListeningEnabled(menuItem.checked);
      }
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

          if (data.payload.sessionId) {
            activeConversationId = data.payload.sessionId;
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
              text: msg,
              sessionId: data.payload.sessionId || null,
              source: data.payload.source || null
            });
          }
        }

        if (data.type === "web_search:captcha") {
          const message = "CAPTCHA detectado. Resolva na janela de pesquisa para eu continuar.";
          const notification = new Notification({
            title: "KIT Web Search",
            body: message,
            silent: false
          });

          notification.show();
          createNotifyHTML({
            title: "KIT Web Search",
            message,
            type: "warning"
          });
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

  globalShortcut.register("CommandOrControl+Shift+K", () => {
    createCanvas();
  });

  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    triggerWidgetVoiceCapture();
  });

  globalShortcut.register("CommandOrControl+Shift+N", () => {
    createNotifyHTML({
      title: "DEBUG",
      message: "Notificacao funcionando",
      type: "success"
    });
  });
}

function configureMediaPermissions() {
  const defaultSession = session.defaultSession;
  if (!defaultSession) {
    return;
  }

  defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === "media" || permission === "microphone" || permission === "audioCapture") {
      return true;
    }

    return false;
  });

  defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === "media" || permission === "microphone" || permission === "audioCapture") {
      callback(true);
      return;
    }

    callback(false);
  });
}

function configureSpellChecker() {
  const defaultSession = session.defaultSession;
  if (!defaultSession?.setSpellCheckerLanguages) {
    return;
  }

  try {
    defaultSession.setSpellCheckerLanguages(["pt-BR", "en-US"]);
  } catch (err) {
    console.warn("Nao consegui configurar idiomas do corretor:", err.message);
  }
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

    await webSearchBridge?.stop?.();
    if (canvasBridgeServer) {
      await new Promise((resolve) => canvasBridgeServer.close(resolve));
      canvasBridgeServer = null;
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

ipcMain.on("open-canvas", () => {
  createCanvas();
});

ipcMain.on("open-widget", () => {
  showWidget();
});

ipcMain.on("start-voice", () => {
  triggerWidgetVoiceCapture();
});

ipcMain.on("close-widget", () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.hide();
  }
});

ipcMain.handle("widget:resize", (event, height) => {
  return resizeWidgetWindow(height);
});

ipcMain.on("set-active-conversation", (event, sessionId) => {
  activeConversationId = sessionId || null;
  syncChatConversation();
});

ipcMain.on("wake-listening:log", (event, message) => {
  if (message) {
    console.log(String(message));
  }
});

ipcMain.on("close-notify", () => {
  if (notifyWindow && !notifyWindow.isDestroyed()) {
    notifyWindow.close();
    notifyWindow = null;
  }
});

ipcMain.on("canvas:command-result", (event, payload = {}) => {
  const commandId = String(payload.id || "");
  const pending = pendingCanvasCommands.get(commandId);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timeout);
  pendingCanvasCommands.delete(commandId);
  pending.resolve(payload.result || {
    ok: false,
    message: "Resposta do Canvas sem resultado."
  });
});

ipcMain.handle("open-file-dialog", async (event, options = {}) => {
  const kind = String(options.kind || "image").toLowerCase();
  const filtersByKind = {
    image: [
      { name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }
    ],
    audio: [
      { name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "webm"] }
    ],
    video: [
      { name: "Video", extensions: ["mp4", "webm", "mov", "mkv", "avi"] }
    ]
  };

  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: `Selecionar ${kind}`,
    properties: ["openFile"],
    filters: filtersByKind[kind] || filtersByKind.image
  });

  const selectedPath = result.canceled ? null : result.filePaths[0] || null;
  const payload = selectedPath
    ? {
      path: selectedPath,
      kind,
      name: path.basename(selectedPath),
      sizeBytes: fs.existsSync(selectedPath) ? fs.statSync(selectedPath).size : 0
    }
    : null;
  event.sender.send("file-selected", payload);
  return payload;
});

ipcMain.handle("canvas:brand-kit:new", async () => {
  return {
    brandKit: createDefaultBrandKit(),
    filePath: null
  };
});

ipcMain.handle("canvas:brand-kit:open", async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: "Abrir Brand Kit",
    properties: ["openFile"],
    filters: [
      { name: "Brand Kit KIT IA", extensions: ["kit"] },
      { name: "JSON", extensions: ["json"] }
    ]
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  return loadBrandKitFromFile(result.filePaths[0]);
});

ipcMain.handle("canvas:brand-kit:save", async (event, payload = {}) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  let targetPath = String(payload.filePath || "").trim();

  if (!targetPath) {
    const result = await dialog.showSaveDialog(parentWindow, {
      title: "Salvar Brand Kit",
      defaultPath: `${payload.brandKit?.name || "brand-kit"}.kit`,
      filters: [
        { name: "Brand Kit KIT IA", extensions: ["kit"] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    targetPath = result.filePath;
  }

  return saveBrandKitToFile(targetPath, payload.brandKit || {});
});

ipcMain.handle("canvas:brand-kit:select-files", async (event, options = {}) => {
  const kind = String(options.kind || "asset").toLowerCase();
  const filtersByKind = {
    logo: [
      { name: "Logos", extensions: ["png", "jpg", "jpeg", "webp", "svg"] }
    ],
    font: [
      { name: "Fontes", extensions: ["ttf", "otf", "woff", "woff2"] }
    ],
    xtts: [
      { name: "XTTS", extensions: ["wav", "pth", "json", "onnx", "pt"] }
    ],
    asset: [
      { name: "Assets", extensions: ["png", "jpg", "jpeg", "webp", "svg", "gif"] }
    ]
  };

  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: `Selecionar ${kind}`,
    properties: ["openFile", "multiSelections"],
    filters: filtersByKind[kind] || filtersByKind.asset
  });

  if (result.canceled) {
    return [];
  }

  return result.filePaths.map((filePath) => ({
    path: filePath,
    name: path.basename(filePath),
    type: path.extname(filePath).replace(".", "").toLowerCase()
  }));
});

ipcMain.handle("canvas:project:new", async () => {
  return {
    project: createDefaultProject(),
    filePath: null
  };
});

ipcMain.handle("canvas:project:open", async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: "Abrir Projeto Canvas",
    properties: ["openFile"],
    filters: [
      { name: "Projeto Canvas KIT IA", extensions: ["kia"] },
      { name: "JSON", extensions: ["json"] }
    ]
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const loadedProject = loadProjectFromFile(result.filePaths[0]);
  return {
    ...loadedProject,
    inheritedBrandKit: loadInheritedBrandKit(loadedProject.project, loadedProject.filePath)
  };
});

ipcMain.handle("canvas:project:open-path", async (event, filePath = "") => {
  const targetPath = String(filePath || "").trim();
  if (!targetPath) {
    throw new Error("Caminho do projeto nao informado.");
  }

  const loadedProject = loadProjectFromFile(targetPath);
  return {
    ...loadedProject,
    inheritedBrandKit: loadInheritedBrandKit(loadedProject.project, loadedProject.filePath)
  };
});

ipcMain.handle("canvas:project:save", async (event, payload = {}) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  let targetPath = String(payload.filePath || "").trim();

  if (!targetPath) {
    const result = await dialog.showSaveDialog(parentWindow, {
      title: "Salvar Projeto Canvas",
      defaultPath: `${payload.project?.name || "canvas-project"}.kia`,
      filters: [
        { name: "Projeto Canvas KIT IA", extensions: ["kia"] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    targetPath = result.filePath;
  }

  const project = makeBrandKitPathRelativeToProject(payload.project || {}, targetPath);
  const savedProject = saveProjectToFile(targetPath, project);
  return {
    ...savedProject,
    inheritedBrandKit: loadInheritedBrandKit(savedProject.project, savedProject.filePath)
  };
});

ipcMain.handle("canvas:mask:save-png", async (event, payload = {}) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const dataUrl = String(payload.dataUrl || "");
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");

  if (!base64 || base64 === dataUrl) {
    throw new Error("PNG da mascara invalido.");
  }

  const result = await dialog.showSaveDialog(parentWindow, {
    title: "Exportar mascara PNG",
    defaultPath: `${payload.name || "mascara-inpainting"}.png`,
    filters: [
      { name: "PNG", extensions: ["png"] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  fs.writeFileSync(result.filePath, Buffer.from(base64, "base64"));
  return {
    filePath: result.filePath
  };
});

ipcMain.handle("canvas:image:save", async (event, payload = {}) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const format = String(payload.format || "png").toLowerCase();
  const extension = format === "jpeg" ? "jpg" : format;
  const filtersByFormat = {
    png: [{ name: "PNG", extensions: ["png"] }],
    jpeg: [{ name: "JPG", extensions: ["jpg", "jpeg"] }],
    webp: [{ name: "WebP", extensions: ["webp"] }]
  };

  if (!["png", "jpeg", "webp"].includes(format)) {
    throw new Error("Formato de imagem invalido.");
  }

  const dataUrl = String(payload.dataUrl || "");
  const match = dataUrl.match(/^data:image\/(?:png|jpeg|webp);base64,(.+)$/);
  if (!match?.[1]) {
    throw new Error("Imagem exportada invalida.");
  }

  let targetPath = String(payload.filePath || payload.targetPath || "").trim();

  if (!targetPath) {
    const result = await dialog.showSaveDialog(parentWindow, {
      title: "Exportar imagem",
      defaultPath: `${payload.name || "canvas-artboard"}.${extension}`,
      filters: filtersByFormat[format]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    targetPath = result.filePath;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, Buffer.from(match[1], "base64"));
  return {
    filePath: targetPath
  };
});

ipcMain.handle("canvas:autosave:save", async (event, payload = {}) => {
  return writeCanvasAutosave(payload);
});

ipcMain.handle("canvas:autosave:load", async () => {
  return readCanvasAutosave();
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

ipcMain.handle("kit:activity", async (event, source) => {
  await ensureInteractiveServices(source || "renderer");
  return { success: true };
});

ipcMain.handle("wake-listening:get-config", async () => {
  return ensureWakeListeningConfigLoaded();
});

ipcMain.handle("wake-listening:get-runtime", async () => {
  const status = await fetchBackendStatus();
  return {
    sessionId: activeConversationId || "default",
    ttsBusy: Boolean(status?.audio?.ttsBusy)
  };
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

app.on("second-instance", () => {
  createChat();
  if (chatWindow && !chatWindow.isDestroyed()) {
    if (chatWindow.isMinimized()) {
      chatWindow.restore();
    }
    chatWindow.show();
    chatWindow.focus();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.whenReady().then(async () => {
  app.setAppUserModelId("kit.ia.host");
  configureMediaPermissions();
  configureSpellChecker();
  await ensureWakeListeningConfigLoaded();
  webSearchBridge = createWebSearchBridge({
    createBaseWindow,
    getParentWindow: getPreferredParentWindow
  });
  await webSearchBridge.start();
  startCanvasBridgeServer();
  createTray();
  createWidget();
  createWakeListeningWindow();
  registerShortcuts();
  connectSSE();
  await processManager.startDefaults();
  scheduleIdlePowerDown();
  void syncWakeListeningConfigToBackend(wakeListeningConfig);
  pushWakeListeningConfig();
});
