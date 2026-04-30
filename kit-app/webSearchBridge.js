const http = require("http");
const { BrowserWindow, dialog, screen } = require("electron");
const {
  cleanPage,
  extractCleanContent,
  clearAgentSession,
  getDomainProfile,
  getSessionForExecution,
  loadConfig: loadCleanConfig,
  saveDomainDecision,
  domainFromUrl
} = require("./main/browserClean");

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += String(chunk || "");
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error("Payload muito grande."));
      }
    });

    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", reject);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectCaptcha(payload = {}) {
  const title = String(payload.title || "").toLowerCase();
  const html = String(payload.html || "").toLowerCase();
  const text = String(payload.text || "").toLowerCase();
  const combined = `${title} ${text}`;

  const hardSignals = [
    "unusual traffic",
    "detected unusual traffic",
    "our systems have detected unusual traffic",
    "/sorry/index",
    "g-recaptcha",
    "hcaptcha",
    "cf-chl",
    "recaptcha/api.js",
    "why did this happen?"
  ];

  const humanCheckSignals = [
    "não sou um robô",
    "nao sou um robo",
    "prove you are human",
    "verify you are human",
    "i'm not a robot",
    "sou humano"
  ];

  return (
    hardSignals.some((signal) => html.includes(signal) || combined.includes(signal)) ||
    (combined.includes("captcha") && humanCheckSignals.some((signal) => combined.includes(signal) || html.includes(signal))) ||
    humanCheckSignals.some((signal) => combined.includes(signal))
  );
}

function createWebSearchBridge({ createBaseWindow, getParentWindow }) {
  let bridgeServer = null;
  let searchWindow = null;
  let activeAgentSession = null;
  let activeExecutionId = null;
  let autoCloseTimer = null;

  function clearAutoCloseTimer() {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
  }

  function closeSearchWindow({ destroy = false } = {}) {
    clearAutoCloseTimer();

    if (!searchWindow || searchWindow.isDestroyed()) {
      searchWindow = null;
      return;
    }

    if (destroy) {
      searchWindow.close();
      searchWindow = null;
      return;
    }

    searchWindow.hide();
  }

  function positionWindow(windowRef, browser = {}) {
    const area = windowRef.getParentWindow?.()?.getBounds?.() || screen.getPrimaryDisplay().workArea;
    const bounds = windowRef.getBounds();
    const margin = 18;

    if (browser.position === "bottom-right") {
      windowRef.setPosition(
        Math.max(area.x + margin, area.x + area.width - bounds.width - margin),
        Math.max(area.y + margin, area.y + area.height - bounds.height - margin)
      );
    }
  }

  function scheduleAutoClose(browser = {}) {
    clearAutoCloseTimer();
    const autoCloseAfterMs = Math.max(0, Number(browser.autoCloseAfterMs || 3000));
    if (!autoCloseAfterMs) {
      return;
    }

    autoCloseTimer = setTimeout(() => {
      closeSearchWindow({
        destroy: browser.closeWhenDone === true
      });
    }, autoCloseAfterMs);
    autoCloseTimer.unref?.();
  }

  function configureAgentSession(agentSession) {
    const cleanConfig = loadCleanConfig();
    if (!agentSession || cleanConfig.blockPermissions === false) {
      return;
    }

    const blockedPermissions = new Set([
      "notifications",
      "geolocation",
      "camera",
      "microphone",
      "midi",
      "clipboard-read",
      "fullscreen",
      "media",
      "display-capture",
      "pointerLock"
    ]);

    agentSession.setPermissionCheckHandler((_webContents, permission) => !blockedPermissions.has(permission));
    agentSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(!blockedPermissions.has(permission));
    });
  }

  function attachBrowserGuards(windowRef) {
    const cleanConfig = loadCleanConfig();
    if (!windowRef || windowRef.isDestroyed()) {
      return;
    }

    windowRef.webContents.setWindowOpenHandler((details) => {
      const url = String(details.url || "");
      if (cleanConfig.blockPopups === false) {
        return { action: "allow" };
      }

      const disposition = String(details.disposition || "");
      if (/foreground-tab|background-tab/.test(disposition) && /^https?:\/\//i.test(url)) {
        console.log("[BROWSER-CLEAN] target blank redirected:", url);
        windowRef.loadURL(url).catch((err) => console.warn("[BROWSER-CLEAN] target blank failed:", err.message));
      } else {
        console.log("[BROWSER-CLEAN] popup blocked:", url);
      }

      return { action: "deny" };
    });

    windowRef.webContents.on("will-navigate", (event, url) => {
      if (String(url || "").startsWith("kit-agent-close://")) {
        event.preventDefault();
        closeSearchWindow({ destroy: true });
      }
    });
  }

  function ensureWindow(browser = {}, showWindow = true, executionId = "default") {
    const cleanConfig = loadCleanConfig();
    const agentSession = getSessionForExecution(executionId);

    if (activeExecutionId !== executionId && searchWindow && !searchWindow.isDestroyed()) {
      closeSearchWindow({ destroy: true });
    }

    if (searchWindow && !searchWindow.isDestroyed()) {
      searchWindow.setSize(
        Math.max(480, Number(browser.width || 720)),
        Math.max(320, Number(browser.height || 480))
      );
      searchWindow.setOpacity(1);
      searchWindow.setAlwaysOnTop(false);
      positionWindow(searchWindow, browser);

      if (showWindow) {
        if (browser.focusOnOpen === false && typeof searchWindow.showInactive === "function") {
          searchWindow.showInactive();
        } else {
          searchWindow.show();
        }
      } else {
        searchWindow.hide();
      }

      return searchWindow;
    }

    activeExecutionId = executionId;
    activeAgentSession = agentSession;
    configureAgentSession(agentSession);

    searchWindow = createBaseWindow({
      width: Math.max(480, Number(browser.width || 720)),
      height: Math.max(320, Number(browser.height || 480)),
      frame: browser.frame !== false,
      opacity: 1,
      show: Boolean(showWindow),
      title: "KIT Web Search",
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: cleanConfig.privateSessionEnabled === false ? undefined : `${cleanConfig.partitionPrefix || "agent-temp-"}${String(executionId || "default").replace(/[^a-zA-Z0-9_-]/g, "")}`
      }
    });

    searchWindow.on("closed", () => {
      searchWindow = null;
    });

    attachBrowserGuards(searchWindow);
    positionWindow(searchWindow, browser);

    return searchWindow;
  }

  async function extractPageState(windowRef) {
    return windowRef.webContents.executeJavaScript(`
      (() => {
        const readerRoot = document.querySelector('[data-kit-reader-root="true"]');
        const html = document.documentElement ? document.documentElement.outerHTML : "";
        const text = document.body ? document.body.innerText : "";
        const readerText = readerRoot ? readerRoot.innerText : "";
        return {
          title: document.title || "",
          html,
          text,
          readerText,
          url: location.href
        };
      })();
    `, true);
  }

  async function runCleanPasses(windowRef, profile) {
    const cleanConfig = loadCleanConfig();
    const passes = Array.isArray(cleanConfig.repeatCleanPasses) && cleanConfig.repeatCleanPasses.length
      ? cleanConfig.repeatCleanPasses
      : [0, 800, 2000, 5000];
    let lastResult = null;
    let previousAt = 0;

    for (const at of passes) {
      const waitMs = Math.max(0, Number(at || 0) - previousAt);
      if (waitMs) {
        await wait(waitMs);
      }
      previousAt = Math.max(previousAt, Number(at || 0));
      lastResult = await cleanPage(windowRef.webContents, { profile });
    }

    return lastResult;
  }

  async function navigate(payload = {}) {
    const targetUrl = String(payload.url || "").trim();
    if (!targetUrl) {
      throw new Error("URL obrigatoria.");
    }

    const executionId = String(payload.executionId || "default");
    const windowRef = ensureWindow(payload.browser || {}, payload.showWindow !== false, executionId);
    const browser = payload.browser || {};
    const domain = domainFromUrl(targetUrl);
    const profile = payload.domainProfile || getDomainProfile(domain);

    if (payload.showWindow !== false) {
      if (browser.focusOnOpen === false && typeof windowRef.showInactive === "function") {
        windowRef.showInactive();
      } else {
        windowRef.show();
        windowRef.focus();
      }
    } else {
      windowRef.hide();
    }

    await windowRef.loadURL(targetUrl, {
      userAgent: payload.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    });

    const cleanResult = await runCleanPasses(windowRef, profile);
    await wait(Number(payload.waitAfterLoadMs || 1200));
    await cleanPage(windowRef.webContents, { profile, pageType: cleanResult?.pageType });
    await wait(150);
    const page = await extractPageState(windowRef);
    const cleanContent = await extractCleanContent(windowRef.webContents);
    const captchaDetected = detectCaptcha(page);

    if (captchaDetected) {
      clearAutoCloseTimer();
      if (browser.alwaysOnTopOnCaptcha !== false) {
        windowRef.setAlwaysOnTop(true);
      }
      windowRef.show();
      windowRef.focus();
    } else {
      scheduleAutoClose(browser);
    }

    return {
      success: true,
      ...page,
      cleanContent,
      pageType: cleanContent.pageType,
      products: cleanContent.products,
      prices: cleanContent.prices,
      detectedNoise: cleanContent.detectedNoise,
      extractionQuality: cleanContent.extractionQuality,
      captchaDetected
    };
  }

  async function askPermission(payload = {}) {
    clearAutoCloseTimer();
    const domain = String(payload.domain || "").trim() || "dominio desconhecido";
    const url = String(payload.url || "").trim();
    const parent = typeof getParentWindow === "function" ? getParentWindow() : null;
    const response = await dialog.showMessageBox(parent instanceof BrowserWindow ? parent : undefined, {
      type: "question",
      buttons: ["Abrir como Loja", "Abrir como Leitura", "Abrir Normal", "Nao abrir", "Banir"],
      defaultId: 0,
      cancelId: 3,
      title: "Classificar fonte web",
      message: `Rafa, achei uma fonte em ${domain}.`,
      detail: `Como devo abrir este dominio para o navegador limpo do agente?\n\n${url}`
    });

    const choices = [
      { allowed: true, permission: "allow", profile: "product_clean" },
      { allowed: true, permission: "allow", profile: "article_reader" },
      { allowed: true, permission: "allow", profile: "auto" },
      { allowed: false, permission: "ignore", profile: "auto" },
      { allowed: false, permission: "block", profile: "blocked" }
    ];
    const choice = choices[response.response] || choices[3];

    if (choice.permission === "allow" || choice.permission === "block") {
      saveDomainDecision(domain, {
        permission: choice.permission,
        profile: choice.profile,
        source: "user"
      });
    }

    return {
      success: true,
      ...choice
    };
  }

  async function start() {
    if (bridgeServer) {
      return;
    }

    const port = Number(process.env.KIT_WEB_SEARCH_BRIDGE_PORT || 3011);
    bridgeServer = http.createServer(async (req, res) => {
      try {
        if (req.method === "GET" && req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Metodo nao permitido." }));
          return;
        }

        const payload = await readJsonBody(req);

        if (req.url === "/search" || req.url === "/extract") {
          const result = await navigate(payload);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
          return;
        }

        if (req.url === "/release") {
          const cleanConfig = loadCleanConfig();
          closeSearchWindow({
            destroy: payload?.destroy === true
          });
          if (activeAgentSession && cleanConfig.clearSessionAfterRun !== false) {
            await clearAgentSession(activeAgentSession);
          }
          activeAgentSession = null;
          activeExecutionId = null;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        if (req.url === "/permission") {
          const result = await askPermission(payload);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
          return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Rota nao encontrada." }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message || "Erro interno." }));
      }
    });

    await new Promise((resolve, reject) => {
      bridgeServer.once("error", reject);
      bridgeServer.listen(port, "127.0.0.1", resolve);
    });
  }

  async function stop() {
    if (!bridgeServer) {
      return;
    }

    closeSearchWindow({ destroy: true });
    const server = bridgeServer;
    bridgeServer = null;
    await new Promise((resolve) => server.close(resolve));
  }

  return {
    start,
    stop
  };
}

module.exports = {
  createWebSearchBridge
};
