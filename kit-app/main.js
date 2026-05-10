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
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");
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
const { createStudioWindow } = require("./main/studioWindow");
const {
  createStudioProject,
  updateStudioProject
} = require("../backend/skills/studio/studioProjectSchema");
const {
  STUDIO_EXTENSION,
  STUDIO_PROJECTS_DIR,
  ensureStudioProjectsDir,
  saveStudioProject,
  loadStudioProject
} = require("../backend/skills/studio/studioProjectStore");
const workspaceLayout = require("../backend/services/workspaceLayout.cjs");
const { createPresetManagerWindow } = require("./main/presetManagerWindow");

const ROOT_DIR = path.resolve(__dirname, "..");
const PRELOAD_PATH = path.join(__dirname, "preload.js");
const TRAY_ICON_PATH = path.join(__dirname, "renderer", "assets", "icone.ico");
const CHAT_HTML_PATH = path.join(__dirname, "renderer", "index.html");
const CANVAS_HTML_PATH = path.join(__dirname, "renderer", "canvas", "canvas.html");
const CANVAS_AUTOSAVE_FILE = "canvas-autosave.json";
const CANVAS_BRIDGE_PORT = Number(process.env.KIT_CANVAS_BRIDGE_PORT || 31977);
const KIT_USER_DATA_PATH = path.join(ROOT_DIR, "temp", "electron-user-data");
const KIT_STARTUP_LOG = path.join(ROOT_DIR, "logs", "kit-app-startup.log");

let widgetWindow = null;
let chatWindow = null;
let configWindow = null;
let monitorWindow = null;
let canvasWindow = null;
let studioWindow = null;
let presetManagerWindow = null;
let notifyWindow = null;
let wakeWindow = null;
let tray = null;
let sseConnection = null;
let isQuitting = false;
let isShuttingDown = false;
let activeConversationId = null;
let wakeListeningConfig = null;
let wakeConfigModulePromise = null;
let presetManagerModulePromise = null;
let llmIdleTimer = null;
let webSearchBridge = null;
let canvasBridgeServer = null;
let canvasCommandCounter = 0;
const pendingCanvasCommands = new Map();
let lastCpuSnapshot = null;
let pendingStudioInitialState = null;

function logStartup(message = "", extra = null) {
  try {
    fs.mkdirSync(path.dirname(KIT_STARTUP_LOG), { recursive: true });
    const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
    fs.appendFileSync(KIT_STARTUP_LOG, `[${new Date().toISOString()}] ${message}${suffix}\n`, "utf8");
  } catch {}
}

const LLM_IDLE_TIMEOUT_MS = Math.max(
  60000,
  Number(process.env.KIT_IDLE_LLM_TIMEOUT_MS || 5 * 60 * 1000)
);
const AUTO_UNLOAD_LLM = process.env.KIT_AUTO_UNLOAD_LLM === "true";
fs.mkdirSync(KIT_USER_DATA_PATH, { recursive: true });
app.setPath("userData", KIT_USER_DATA_PATH);

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

  if (AUTO_UNLOAD_LLM) {
    llmIdleTimer = setTimeout(() => {
      void unloadBackendLLM();
    }, LLM_IDLE_TIMEOUT_MS);
    llmIdleTimer.unref?.();
  }
}

function ensureServicesForIntent(intent = "unknown") {
  void notifyBackendActivity(intent);
  void processManager.startForIntent(intent);
  scheduleIdlePowerDown();
}

function takeCpuSnapshot() {
  const cpus = os.cpus?.() || [];
  let idle = 0;
  let total = 0;

  cpus.forEach((cpu) => {
    const times = cpu?.times || {};
    idle += Number(times.idle || 0);
    total += Object.values(times).reduce((sum, value) => sum + Number(value || 0), 0);
  });

  return {
    idle,
    total,
    at: Date.now()
  };
}

function formatBytesToGb(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0 GB";
  }

  return `${(numeric / (1024 ** 3)).toFixed(1)} GB`;
}

function formatPercent(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return "0%";
  }

  return `${Math.max(0, Math.min(100, Math.round(numeric)))}%`;
}

function getCpuUsagePercent() {
  const snapshot = takeCpuSnapshot();
  if (!lastCpuSnapshot) {
    lastCpuSnapshot = snapshot;
    return 0;
  }

  const idleDelta = snapshot.idle - lastCpuSnapshot.idle;
  const totalDelta = snapshot.total - lastCpuSnapshot.total;
  lastCpuSnapshot = snapshot;

  if (totalDelta <= 0) {
    return 0;
  }

  return (1 - idleDelta / totalDelta) * 100;
}

function runPowerShellJson(command) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message));
          return;
        }

        try {
          resolve(JSON.parse(String(stdout || "").trim() || "{}"));
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
  });
}

async function getStudioSystemStats() {
  const totalRam = os.totalmem?.() || 0;
  const freeRam = os.freemem?.() || 0;
  const usedRam = Math.max(0, totalRam - freeRam);
  const cpuPercent = getCpuUsagePercent();

  let gpuStats = {
    gpuPercent: 0,
    vramUsedBytes: 0,
    vramTotalBytes: 0,
    diskUsedBytes: 0,
    diskTotalBytes: 0
  };

  if (process.platform === "win32") {
    try {
      gpuStats = await runPowerShellJson(`
        $gpuCounter = Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction SilentlyContinue;
        $gpuSamples = @($gpuCounter.CounterSamples | ForEach-Object { $_.CookedValue });
        $gpuTotal = 0;
        if ($gpuSamples.Count -gt 0) {
          $gpuTotal = ($gpuSamples | Measure-Object -Sum).Sum;
        }

        $vramCounter = Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage' -ErrorAction SilentlyContinue;
        $vramUsed = 0;
        if ($vramCounter -and $vramCounter.CounterSamples) {
          $vramUsed = (@($vramCounter.CounterSamples | ForEach-Object { $_.CookedValue }) | Measure-Object -Sum).Sum;
        }

        $vramTotal = 0;
        $videoRegistry = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Video\\*\\0000' -ErrorAction SilentlyContinue |
          Where-Object { $_.'HardwareInformation.qwMemorySize' -gt 0 };
        if ($videoRegistry) {
          $vramTotal = ($videoRegistry | ForEach-Object { [double]$_.'HardwareInformation.qwMemorySize' } | Measure-Object -Sum).Sum;
        }

        $diskTotal = 0;
        $diskFree = 0;
        $drives = [System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady };
        if ($drives) {
          $diskTotal = ($drives | ForEach-Object { [double]$_.TotalSize } | Measure-Object -Sum).Sum;
          $diskFree = ($drives | ForEach-Object { [double]$_.AvailableFreeSpace } | Measure-Object -Sum).Sum;
        }

        [pscustomobject]@{
          gpuPercent = [math]::Min(100, [math]::Round($gpuTotal, 0));
          vramUsedBytes = [double]$vramUsed
          vramTotalBytes = [double]$vramTotal
          diskUsedBytes = [double]($diskTotal - $diskFree)
          diskTotalBytes = [double]$diskTotal
        } | ConvertTo-Json -Compress
      `);
    } catch {}
  }

  return {
    vram: gpuStats.vramTotalBytes > 0
      ? `${formatBytesToGb(gpuStats.vramUsedBytes)} / ${formatBytesToGb(gpuStats.vramTotalBytes)}`
      : "--",
    ram: totalRam > 0
      ? `${formatBytesToGb(usedRam)} / ${formatBytesToGb(totalRam)}`
      : "--",
    gpu: formatPercent(gpuStats.gpuPercent),
    cpu: formatPercent(cpuPercent),
    disk: gpuStats.diskTotalBytes > 0
      ? `${formatBytesToGb(gpuStats.diskUsedBytes)} / ${formatBytesToGb(gpuStats.diskTotalBytes)}`
      : "--"
  };
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
  const windows = [presetManagerWindow, studioWindow, canvasWindow, chatWindow, configWindow, monitorWindow, widgetWindow, wakeWindow];
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

async function getPresetManagerModule() {
  if (!presetManagerModulePromise) {
    const moduleUrl = pathToFileURL(
      path.join(ROOT_DIR, "backend", "services", "presetManager", "index.js")
    ).href;
    presetManagerModulePromise = import(moduleUrl);
  }

  return presetManagerModulePromise;
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
    height: 58,
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
  ensureServicesForIntent("widget-open");
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
  const nextHeight = Math.max(52, Math.min(Number(height || 52), 260));
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
  windowRef.show();
  windowRef.focus();
  void (async () => {
    await notifyBackendActivity("widget-voice");
    await processManager.startForIntent("mic-request", { timeoutMs: 90000 });
    if (!windowRef.isDestroyed()) {
      windowRef.webContents.send("start-voice");
    }
    scheduleIdlePowerDown();
  })();
}

function createChat() {
  logStartup("createChat:start", {
    hasWindow: Boolean(chatWindow && !chatWindow.isDestroyed())
  });
  if (chatWindow && !chatWindow.isDestroyed()) {
    ensureServicesForIntent("chat-open");
    if (!chatWindow.webContents.getURL().startsWith(pathToFileURL(CHAT_HTML_PATH).href)) {
      chatWindow.loadFile(CHAT_HTML_PATH);
    }
    chatWindow.show();
    chatWindow.focus();
    syncChatConversation();
    logStartup("createChat:reuse");
    return chatWindow;
  }

  chatWindow = createBaseWindow({
    width: 900,
    height: 700,
    title: "KIT IA"
  });
  ensureServicesForIntent("chat-open");

  attachExternalLinkGuard(chatWindow);
  chatWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    logStartup("chatWindow:did-fail-load", { errorCode, errorDescription, validatedURL });
  });
  chatWindow.webContents.on("render-process-gone", (event, details) => {
    logStartup("chatWindow:render-process-gone", details);
  });
  chatWindow.on("show", () => {
    logStartup("chatWindow:show", chatWindow.getBounds());
  });
  chatWindow.on("hide", () => {
    logStartup("chatWindow:hide");
  });
  chatWindow.loadFile(CHAT_HTML_PATH);
  attachHideOnClose(chatWindow);
  chatWindow.on("closed", () => {
    chatWindow = null;
  });

  chatWindow.once("ready-to-show", () => {
    logStartup("chatWindow:ready-to-show");
    chatWindow.setTitle("KIT IA");
    chatWindow.show();
    chatWindow.focus();
    syncChatConversation();
  });

  chatWindow.webContents.once("did-finish-load", () => {
    logStartup("chatWindow:did-finish-load");
    if (!chatWindow || chatWindow.isDestroyed()) {
      return;
    }
    chatWindow.setTitle("KIT IA");
    chatWindow.show();
    chatWindow.focus();
    syncChatConversation();
  });

  setTimeout(() => {
    logStartup("chatWindow:show-fallback");
    if (!chatWindow || chatWindow.isDestroyed()) {
      return;
    }
    chatWindow.setTitle("KIT IA");
    chatWindow.show();
    chatWindow.focus();
  }, 2500);

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

function createPresetManager() {
  if (presetManagerWindow && !presetManagerWindow.isDestroyed()) {
    presetManagerWindow.show();
    presetManagerWindow.focus();
    return presetManagerWindow;
  }

  presetManagerWindow = createPresetManagerWindow({
    existingWindow: presetManagerWindow,
    createBaseWindow,
    screen,
    onClosed: () => {
      presetManagerWindow = null;
    }
  });

  return presetManagerWindow;
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

function createStudio(initialState = null) {
  if (initialState && typeof initialState === "object") {
    pendingStudioInitialState = initialState;
  }

  studioWindow = createStudioWindow({
    existingWindow: studioWindow,
    createBaseWindow,
    screen,
    onClosed: () => {
      studioWindow = null;
    }
  });

  if (initialState && !studioWindow.webContents.isDestroyed()) {
    const pushState = () => {
      studioWindow.webContents.send("studio:init-state", initialState);
    };

    if (studioWindow.webContents.isLoading()) {
      studioWindow.webContents.once("did-finish-load", pushState);
    } else {
      pushState();
    }
  }

  return studioWindow;
}

function focusStudioWindow() {
  const windowRef = createStudio();
  if (windowRef.isMinimized()) {
    windowRef.restore();
  }
  windowRef.show();
  windowRef.focus();
  return windowRef;
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
      label: "KIT Studio",
      click: () => createStudio()
    },
    {
      label: "Gerador de Presets",
      click: () => createPresetManager()
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

ipcMain.on("open-studio", () => {
  createStudio();
});

ipcMain.on("open-preset-manager", () => {
  createPresetManager();
});

ipcMain.handle("studio:initial-state:get", () => {
  const initialState = pendingStudioInitialState;
  pendingStudioInitialState = null;
  return initialState;
});

ipcMain.handle("studio:window:open", async (event, initialState = null) => {
  createStudio(initialState && typeof initialState === "object" ? initialState : null);
  return { success: true };
});

ipcMain.handle("preset-manager:meta", async () => {
  const { ensurePresetDirectories, getPresetManagerMeta } = await getPresetManagerModule();
  ensurePresetDirectories();
  return getPresetManagerMeta();
});

ipcMain.handle("preset-manager:list", async (event, type = "client") => {
  const { ensurePresetDirectories, listPresets } = await getPresetManagerModule();
  ensurePresetDirectories();
  return {
    type,
    items: listPresets(type)
  };
});

ipcMain.handle("preset-manager:new", async (event, type = "client") => {
  const { ensurePresetDirectories, createEmptyPreset } = await getPresetManagerModule();
  ensurePresetDirectories();
  return {
    type,
    preset: createEmptyPreset(type),
    filePath: null
  };
});

ipcMain.handle("preset-manager:open", async (event, payload = {}) => {
  const { ensurePresetDirectories, readPresetFile, TYPE_CONFIGS } = await getPresetManagerModule();
  ensurePresetDirectories();
  const expectedType = String(payload?.type || "").trim();
  let targetPath = String(payload?.filePath || "").trim();

  if (!targetPath) {
    const filters = Object.values(TYPE_CONFIGS).map((config) => config.filters[0]);
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: "Carregar preset",
      properties: ["openFile"],
      filters
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    targetPath = result.filePaths[0];
  }

  const loaded = readPresetFile(targetPath, expectedType);
  return loaded;
});

ipcMain.handle("preset-manager:validate", async (event, payload = {}) => {
  const { validatePreset } = await getPresetManagerModule();
  const type = String(payload?.type || "").trim();
  return validatePreset(type, payload?.preset || {});
});

ipcMain.handle("preset-manager:save", async (event, payload = {}) => {
  const { ensurePresetDirectories, makeManagedFilePath, savePresetToPath } = await getPresetManagerModule();
  ensurePresetDirectories();
  const type = String(payload?.type || "").trim();
  const preset = payload?.preset || {};
  let targetPath = String(payload?.filePath || "").trim();

  if (!targetPath) {
    targetPath = makeManagedFilePath(type, preset, preset?.name || preset?.id || "");
  }

  return savePresetToPath(type, preset, targetPath);
});

ipcMain.handle("preset-manager:save-as", async (event, payload = {}) => {
  const { ensurePresetDirectories, makeManagedFilePath, savePresetToPath, TYPE_CONFIGS } = await getPresetManagerModule();
  ensurePresetDirectories();
  const type = String(payload?.type || "").trim();
  const config = TYPE_CONFIGS[type];
  if (!config) {
    throw new Error("Tipo de preset invalido.");
  }

  const preset = payload?.preset || {};
  const defaultPath = makeManagedFilePath(type, preset, payload?.suggestedName || preset?.name || preset?.id || "");
  const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
    title: "Salvar preset como",
    defaultPath,
    filters: config.filters
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return savePresetToPath(type, preset, result.filePath);
});

ipcMain.handle("preset-manager:duplicate", async (event, payload = {}) => {
  const { ensurePresetDirectories, duplicatePreset } = await getPresetManagerModule();
  ensurePresetDirectories();
  const type = String(payload?.type || "").trim();
  const filePath = String(payload?.filePath || "").trim();
  if (!filePath) {
    throw new Error("Nenhum arquivo foi selecionado para duplicar.");
  }
  return duplicatePreset(type, filePath);
});

ipcMain.handle("preset-manager:delete", async (event, payload = {}) => {
  const { ensurePresetDirectories, deletePreset } = await getPresetManagerModule();
  ensurePresetDirectories();
  const type = String(payload?.type || "").trim();
  const filePath = String(payload?.filePath || "").trim();
  if (!filePath) {
    throw new Error("Nenhum arquivo foi selecionado para excluir.");
  }
  return deletePreset(type, filePath);
});

ipcMain.handle("preset-manager:select-asset", async (event, options = {}) => {
  const selection = String(options?.selection || "file").toLowerCase();
  const filtersBySelection = {
    image: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"] }],
    file: [{ name: "Arquivos", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "pdf", "ai", "psd", "cdr", "zip", "json", "txt", "doc", "docx"] }]
  };

  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: "Selecionar arquivo",
    properties: options?.multiple ? ["openFile", "multiSelections"] : ["openFile"],
    filters: filtersBySelection[selection] || filtersBySelection.file
  });

  if (result.canceled) {
    return options?.multiple ? [] : null;
  }

  return options?.multiple ? result.filePaths : result.filePaths[0] || null;
});

ipcMain.handle("studio:launch", async (event, payload = {}) => {
  const response = await fetch("http://localhost:3001/api/studio/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || "Falha ao abrir KIT Studio.");
  }

  createStudio(data.initialState || null);
  return data;
});

ipcMain.on("studio:window:minimize", () => {
  if (studioWindow && !studioWindow.isDestroyed()) {
    studioWindow.minimize();
  }
});

ipcMain.on("studio:window:toggle-maximize", () => {
  if (!studioWindow || studioWindow.isDestroyed()) {
    return;
  }

  if (studioWindow.isMaximized()) {
    studioWindow.unmaximize();
    return;
  }

  studioWindow.maximize();
});

ipcMain.on("studio:close", () => {
  if (studioWindow && !studioWindow.isDestroyed()) {
    studioWindow.close();
  }
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

ipcMain.handle("canvas:video:save-mp4", async (event, payload = {}) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const frames = Array.isArray(payload.frames) ? payload.frames.filter((item) => typeof item === "string" && item.startsWith("data:image/png;base64,")) : [];
  const fps = Math.max(1, Math.min(30, Number(payload.fps || 12)));

  if (!frames.length) {
    throw new Error("Nenhum frame PNG informado para exportar video.");
  }

  let targetPath = String(payload.filePath || payload.targetPath || "").trim();
  if (!targetPath) {
    const result = await dialog.showSaveDialog(parentWindow, {
      title: "Exportar video MP4",
      defaultPath: `${payload.name || "slide_01"}.mp4`,
      filters: [
        { name: "MP4", extensions: ["mp4"] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    targetPath = result.filePath;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kit-canvas-video-"));

  try {
    frames.forEach((dataUrl, index) => {
      const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
      if (!match?.[1]) {
        throw new Error(`Frame PNG invalido no indice ${index}.`);
      }
      const framePath = path.join(tempDir, `frame-${String(index + 1).padStart(5, "0")}.png`);
      fs.writeFileSync(framePath, Buffer.from(match[1], "base64"));
    });

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-y",
        "-framerate", String(fps),
        "-i", path.join(tempDir, "frame-%05d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-r", String(fps),
        targetPath
      ], {
        windowsHide: true
      });

      let stderr = "";
      ffmpeg.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
      });
      ffmpeg.on("error", reject);
      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `ffmpeg retornou codigo ${code}.`));
      });
    });

    return {
      filePath: targetPath
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

ipcMain.handle("canvas:autosave:save", async (event, payload = {}) => {
  return writeCanvasAutosave(payload);
});

ipcMain.handle("canvas:autosave:load", async () => {
  return readCanvasAutosave();
});

ipcMain.handle("studio:project:create", async (event, payload = {}) => {
  const project = createStudioProject(payload || {});
  const saved = saveStudioProject(project);
  focusStudioWindow();
  return saved;
});

ipcMain.handle("studio:project:save", async (event, payload = {}) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const project = updateStudioProject(payload.project || createStudioProject(), {});
  let targetPath = String(payload.filePath || "").trim();

  if (!targetPath) {
    ensureStudioProjectsDir();
    const suggestedProjectPath = workspaceLayout.ensureProjectWorkspace({
      clientName: project.clientName || "cliente",
      projectName: `${project.projectName || project.id}-${project.id}`,
      projectId: project.id
    }).projectFilePath;
    const result = await dialog.showSaveDialog(parentWindow, {
      title: "Salvar Projeto Studio",
      defaultPath: suggestedProjectPath,
      filters: [
        { name: "Projeto Studio KIT", extensions: ["kstudio"] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    targetPath = result.filePath;
  }

  return saveStudioProject(project, targetPath);
});

ipcMain.handle("studio:project:open", async (event, filePath = "") => {
  let targetPath = String(filePath || "").trim();
  if (!targetPath) {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: "Abrir Projeto Studio",
      properties: ["openFile"],
      filters: [
        { name: "Projeto Studio KIT", extensions: ["kstudio"] },
        { name: "JSON", extensions: ["json"] }
      ]
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    targetPath = result.filePaths[0];
  }

  const loaded = loadStudioProject(targetPath);
  focusStudioWindow();
  return loaded;
});

ipcMain.handle("studio:system-stats", async () => {
  return getStudioSystemStats();
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
    return processManager.ensureStarted(service, { trigger: "manual" });
  }

  if (action === "stop") {
    return processManager.ensureStopped(service);
  }

  if (action === "restart") {
    return processManager.restartService(service);
  }

  throw new Error(`Acao desconhecida: ${action}`);
});

ipcMain.handle("kit:activity", async (event, source) => {
  await notifyBackendActivity(source || "renderer");
  void processManager.startForIntent(source || "renderer");
  scheduleIdlePowerDown();
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
  logStartup("app:whenReady:start");
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
  createChat();
  logStartup("app:created-initial-windows");
  createWakeListeningWindow();
  registerShortcuts();
  connectSSE();
  await processManager.startDefaults();
  scheduleIdlePowerDown();
  void syncWakeListeningConfigToBackend(wakeListeningConfig);
  pushWakeListeningConfig();
  logStartup("app:whenReady:done");
});
