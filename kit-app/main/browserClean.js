const fs = require("fs");
const path = require("path");
const { session } = require("electron");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const CONFIG_PATH = path.join(ROOT_DIR, "backend", "config", "browser.clean.json");
const NOISE_PATH = path.join(ROOT_DIR, "backend", "config", "browserNoise.json");
const SOURCE_CATALOG_PATH = path.join(ROOT_DIR, "backend", "config", "source_catalog.json");

const DEFAULT_CONFIG = {
  enabled: true,
  visualCleanEnabled: true,
  textExtractionEnabled: true,
  autoAcceptCookies: true,
  blockPermissions: true,
  blockPopups: true,
  removeFixedOverlays: true,
  repeatCleanPasses: [0, 800, 2000, 5000],
  maxAttemptsPerDomain: 2,
  maxAttemptsPerUrl: 1,
  noiseScoreSkipThreshold: 8,
  preserveEcommerceElements: true,
  privateSessionEnabled: true,
  clearSessionAfterRun: true,
  clearCacheAfterRun: true,
  clearCookiesAfterRun: true,
  partitionPrefix: "agent-temp-",
  domainProfiles: {},
  debug: false
};

const ECOMMERCE_DOMAINS = [
  "mercadolivre.com.br",
  "amazon.com.br",
  "amazon.com",
  "magazineluiza.com.br",
  "magalu.com",
  "shopee.com.br",
  "casasbahia.com.br",
  "americanas.com.br",
  "kabum.com.br"
];

const NOISE_WEIGHTS = {
  popup: 1,
  cookie: 1,
  modal: 2,
  captcha: 3,
  login_wall: 3,
  paywall: 3,
  floating_video: 1,
  extraction_error: 2
};

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return structuredClone(fallback);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn("[BROWSER-CLEAN] config read failed:", filePath, err.message);
    return structuredClone(fallback);
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function loadConfig() {
  const parsed = readJson(CONFIG_PATH, DEFAULT_CONFIG);
  return {
    ...structuredClone(DEFAULT_CONFIG),
    ...parsed,
    domainProfiles: parsed?.domainProfiles || {}
  };
}

function normalizeDomain(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function domainFromUrl(value = "") {
  try {
    return normalizeDomain(new URL(value).hostname);
  } catch {
    return normalizeDomain(value);
  }
}

function isDomainMatch(hostname = "", rule = "") {
  const host = normalizeDomain(hostname);
  const normalizedRule = normalizeDomain(rule);
  return Boolean(host && normalizedRule && (host === normalizedRule || host.endsWith(`.${normalizedRule}`)));
}

function getDomainProfile(domain) {
  const config = loadConfig();
  const normalizedDomain = normalizeDomain(domain);
  const catalog = readJson(SOURCE_CATALOG_PATH, { domains: {} });
  const catalogEntry = Object.entries(catalog.domains || {}).find(([rule]) => isDomainMatch(normalizedDomain, rule));
  if (catalogEntry) {
    const [, entry] = catalogEntry;
    if (entry.permission === "block") {
      return "blocked";
    }
    if (entry.profile) {
      return entry.profile;
    }
  }

  const configured = Object.entries(config.domainProfiles || {}).find(([rule]) => isDomainMatch(normalizedDomain, rule));
  return configured?.[1] || "auto";
}

function registerNoise(domain, issue) {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) {
    return null;
  }

  const issueKey = String(issue || "unknown").trim() || "unknown";
  const allNoise = readJson(NOISE_PATH, {});
  const current = allNoise[normalizedDomain] || {};
  const delta = NOISE_WEIGHTS[issueKey] || 1;
  const next = {
    noiseScore: Math.max(0, Number(current.noiseScore || 0) + delta),
    lastIssue: issueKey,
    blockedCount: Number(current.blockedCount || 0) + (["popup", "modal", "captcha", "login_wall", "paywall"].includes(issueKey) ? 1 : 0),
    lastSeen: new Date().toISOString()
  };

  allNoise[normalizedDomain] = next;
  writeJson(NOISE_PATH, allNoise);
  return next;
}

function shouldSkipDomain(domain, executionContext = {}) {
  const config = loadConfig();
  const normalizedDomain = normalizeDomain(domain);
  const profile = getDomainProfile(normalizedDomain);
  if (profile === "blocked") {
    return { skip: true, reason: "blocked_profile", domain: normalizedDomain };
  }

  if (executionContext.explicitDomain && isDomainMatch(normalizedDomain, executionContext.explicitDomain)) {
    return { skip: false, reason: "explicit_domain", domain: normalizedDomain };
  }

  const allNoise = readJson(NOISE_PATH, {});
  const noiseScore = Number(allNoise[normalizedDomain]?.noiseScore || 0);
  if (noiseScore >= Number(config.noiseScoreSkipThreshold || 8)) {
    return { skip: true, reason: "noiseScore", noiseScore, domain: normalizedDomain };
  }

  return { skip: false, reason: "ok", noiseScore, domain: normalizedDomain };
}

async function detectPageType(webContents) {
  const url = webContents.getURL();
  const domain = domainFromUrl(url);
  const profile = getDomainProfile(domain);

  if (profile === "blocked") {
    return "blocked";
  }

  if (profile === "article_reader") {
    return "article";
  }

  if (profile === "product_clean") {
    return await webContents.executeJavaScript(buildDetectPageTypeScript(true), true).catch(() => "ecommerce_search");
  }

  return await webContents.executeJavaScript(buildDetectPageTypeScript(false), true).catch(() => "normal");
}

function buildDetectPageTypeScript(forceEcommerce) {
  return `
    (() => {
      const text = (document.body?.innerText || '').toLowerCase();
      const domain = location.hostname.replace(/^www\\./, '').toLowerCase();
      const ecommerceDomains = ${JSON.stringify(ECOMMERCE_DOMAINS)};
      const hasKnownDomain = ecommerceDomains.some((item) => domain === item || domain.endsWith('.' + item));
      const schemaProduct = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some((node) => /"@type"\\s*:\\s*"?Product/i.test(node.textContent || ''));
      const priceSignals = (text.match(/(?:r\\$|\\$|€|£)\\s*\\d|\\d+[,.]\\d{2}/g) || []).length;
      const buySignals = /comprar|adicionar ao carrinho|add to cart|ver produto|buy now/.test(text);
      const commerceWords = /frete|vendedor|avaliacao|avaliação|estoque|novo|usado|seller|shipping|reviews?/.test(text);
      const productLike = ${forceEcommerce ? "true" : "false"} || hasKnownDomain || schemaProduct || (priceSignals >= 2 && (buySignals || commerceWords));
      if (!productLike) return document.querySelector('article, main, [role="main"]') ? 'article' : 'normal';
      if (schemaProduct || buySignals || document.querySelector('[itemtype*="Product"], [data-testid*="product"], [class*="product"]')) return 'ecommerce_product';
      return 'ecommerce_search';
    })();
  `;
}

async function cleanPage(webContents, options = {}) {
  const config = { ...loadConfig(), ...(options.cleanConfig || {}) };
  if (config.enabled === false || config.visualCleanEnabled === false) {
    return { cleaned: false, detectedNoise: [] };
  }

  const pageType = options.pageType || await detectPageType(webContents);
  const profile = options.profile || getDomainProfile(domainFromUrl(webContents.getURL()));
  const aggressive = profile === "article_reader" || pageType === "article";
  const preserveEcommerce = config.preserveEcommerceElements !== false && /^ecommerce_/.test(pageType);

  return webContents.executeJavaScript(`
    (${cleanPageInPage.toString()})(${JSON.stringify({
      aggressive,
      preserveEcommerce,
      autoAcceptCookies: config.autoAcceptCookies !== false,
      removeFixedOverlays: config.removeFixedOverlays !== false
    })});
  `, true).then((result) => {
    const domain = domainFromUrl(webContents.getURL());
    for (const issue of result.detectedNoise || []) {
      registerNoise(domain, issue);
    }
    return { ...result, pageType, profile };
  }).catch((err) => {
    registerNoise(domainFromUrl(webContents.getURL()), "extraction_error");
    console.warn("[BROWSER-CLEAN] cleanPage failed:", err.message);
    return { cleaned: false, detectedNoise: ["extraction_error"], pageType, profile };
  });
}

function cleanPageInPage(options) {
  const detectedNoise = [];
  const norm = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const visible = (node) => {
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 5 && rect.height > 5;
  };
  const isImportantCommerce = (node) => {
    if (!options.preserveEcommerce) return false;
    const text = norm(node.innerText || node.textContent || "");
    const attrs = norm(`${node.id || ""} ${node.className || ""} ${node.getAttribute?.("aria-label") || ""}`);
    return /produto|product|preco|price|r\$|comprar|carrinho|cart|frete|vendedor|seller|avaliacao|review|estoque|shipping|buy/.test(`${text} ${attrs}`);
  };
  const hide = (node, issue) => {
    if (!node || node === document.body || node === document.documentElement || isImportantCommerce(node)) return;
    node.setAttribute("data-kit-clean-hidden", issue);
    node.style.setProperty("display", "none", "important");
    if (!detectedNoise.includes(issue)) detectedNoise.push(issue);
  };

  const clickLabels = [
    "aceitar", "aceitar tudo", "concordo", "permitir todos", "entendi", "fechar",
    "agora nao", "agora não", "nao obrigado", "não obrigado", "rejeitar",
    "accept", "accept all", "agree", "got it", "close", "not now", "no thanks", "reject"
  ];

  if (options.autoAcceptCookies) {
    Array.from(document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']")).slice(0, 250).forEach((node) => {
      const label = norm(node.innerText || node.value || node.getAttribute("aria-label") || node.title || "");
      if (clickLabels.some((item) => label === norm(item) || label.includes(norm(item)))) {
        try {
          node.click();
          if (/cookie|consent|gdpr|privacidade|privacy/.test(label)) detectedNoise.push("cookie");
        } catch {}
      }
    });
  }

  const noisySelectors = [
    "[id*='cookie' i]", "[class*='cookie' i]", "[id*='consent' i]", "[class*='consent' i]",
    "[id*='gdpr' i]", "[class*='gdpr' i]", "[id*='newsletter' i]", "[class*='newsletter' i]",
    "[class*='modal' i]", "[id*='modal' i]", "[class*='popup' i]", "[id*='popup' i]",
    "[class*='overlay' i]", "[id*='overlay' i]", "[class*='chat' i]", "[id*='chat' i]",
    "[class*='whatsapp' i]", "[href*='wa.me']", "[class*='floating' i]", "[class*='sticky' i]",
    "[class*='advert' i]", "[id*='advert' i]", "[class*='ads' i]", "[id*='ads' i]",
    "[class*='share' i]", "[class*='app-install' i]", "[class*='video-player' i]"
  ];

  noisySelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      const text = norm(node.innerText || node.textContent || "");
      const attrs = norm(`${node.id || ""} ${node.className || ""}`);
      const signature = `${text} ${attrs}`;
      if (/cookie|consent|gdpr/.test(signature)) return hide(node, "cookie");
      if (/video/.test(signature)) return hide(node, "floating_video");
      if (/modal|popup|overlay|newsletter|chat|whatsapp|floating|sticky/.test(signature)) return hide(node, "modal");
      hide(node, "popup");
    });
  });

  if (options.removeFixedOverlays) {
    Array.from(document.body.querySelectorAll("*")).slice(0, 1200).forEach((node) => {
      if (!visible(node) || isImportantCommerce(node)) return;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const area = rect.width * rect.height;
      const viewportArea = window.innerWidth * window.innerHeight;
      const position = style.position;
      const zIndex = Number(style.zIndex || 0);
      const text = norm(node.innerText || node.textContent || "");
      const attrs = norm(`${node.id || ""} ${node.className || ""}`);
      const signature = `${text} ${attrs}`;

      if ((position === "fixed" || position === "sticky") && zIndex >= 10 && area > viewportArea * 0.08) {
        if (/paywall|assine|subscribe|login|entrar/.test(signature)) {
          hide(node, "paywall");
        } else {
          hide(node, "modal");
        }
      }
      if ((position === "fixed" || position === "sticky") && /chat|whatsapp|cookie|consent|ad|newsletter|video/.test(signature)) {
        hide(node, /video/.test(signature) ? "floating_video" : "popup");
      }
    });
  }

  if (options.aggressive && !options.preserveEcommerce) {
    document.querySelectorAll("nav, footer, aside, [role='navigation'], [role='complementary'], .sidebar, .related, .comments").forEach((node) => hide(node, "popup"));
  }

  let style = document.getElementById("kit-agent-clean-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "kit-agent-clean-style";
    style.textContent = `
      * { scroll-behavior: auto !important; }
      html { padding-top: 34px !important; }
      #kit-agent-browser-header {
        align-items: center !important;
        background: #15171c !important;
        border-bottom: 1px solid rgba(255,255,255,.16) !important;
        box-sizing: border-box !important;
        color: #f4f6fb !important;
        display: flex !important;
        font: 12px Arial, sans-serif !important;
        height: 34px !important;
        justify-content: space-between !important;
        left: 0 !important;
        padding: 0 8px 0 12px !important;
        position: fixed !important;
        right: 0 !important;
        top: 0 !important;
        z-index: 2147483647 !important;
      }
      #kit-agent-browser-header button {
        background: transparent !important;
        border: 0 !important;
        color: #fff !important;
        cursor: pointer !important;
        font: 18px Arial, sans-serif !important;
        height: 28px !important;
        line-height: 24px !important;
        width: 32px !important;
      }
    `;
    document.head.appendChild(style);
  }

  let header = document.getElementById("kit-agent-browser-header");
  if (!header) {
    header = document.createElement("div");
    header.id = "kit-agent-browser-header";
    header.innerHTML = `<span>KIT IA - navegador do agente</span><button type="button" aria-label="Fechar">x</button>`;
    header.querySelector("button").addEventListener("click", () => {
      location.href = "kit-agent-close://close";
    });
    document.documentElement.appendChild(header);
  }

  return { cleaned: true, detectedNoise: Array.from(new Set(detectedNoise)) };
}

async function extractCleanContent(webContents) {
  const pageType = await detectPageType(webContents);
  const result = await webContents.executeJavaScript(`
    (${extractCleanContentInPage.toString()})(${JSON.stringify({ pageType })});
  `, true).catch((err) => {
    registerNoise(domainFromUrl(webContents.getURL()), "extraction_error");
    console.warn("[BROWSER-CLEAN] extract failed:", err.message);
    return null;
  });

  if (!result) {
    return {
      title: "",
      url: webContents.getURL(),
      pageType,
      headings: [],
      mainText: "",
      links: [],
      products: [],
      prices: [],
      images: [],
      detectedNoise: ["extraction_error"],
      extractionQuality: "low"
    };
  }

  return result;
}

function extractCleanContentInPage({ pageType }) {
  const normText = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const absUrl = (value) => {
    try {
      return new URL(value, location.href).toString();
    } catch {
      return "";
    }
  };
  const visible = (node) => {
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 4 && rect.height > 4;
  };
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll("script, style, noscript, svg, nav, footer, aside, iframe, [data-kit-clean-hidden], #kit-agent-browser-header").forEach((node) => node.remove());

  const candidates = [
    document.querySelector("main"),
    document.querySelector("article"),
    document.querySelector("[role='main']"),
    ...Array.from(document.querySelectorAll("section, div")).sort((a, b) => normText(b.innerText).length - normText(a.innerText).length).slice(0, 8),
    document.body
  ].filter(Boolean);
  const mainNode = candidates.find((node) => visible(node) && normText(node.innerText).length > 200) || document.body;
  const textSource = mainNode.cloneNode(true);
  textSource.querySelectorAll("script, style, nav, footer, aside, iframe, [data-kit-clean-hidden], #kit-agent-browser-header").forEach((node) => node.remove());

  const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
    .filter(visible)
    .map((node) => normText(node.innerText))
    .filter(Boolean)
    .slice(0, 20);
  const links = Array.from(document.querySelectorAll("a[href]"))
    .filter(visible)
    .map((node) => ({ text: normText(node.innerText || node.title || node.href), url: absUrl(node.getAttribute("href")) }))
    .filter((item) => item.url && item.text)
    .slice(0, 80);
  const images = Array.from(document.querySelectorAll("img[src], img[data-src]"))
    .filter(visible)
    .map((node) => ({ alt: normText(node.alt || node.title || ""), url: absUrl(node.getAttribute("src") || node.getAttribute("data-src")) }))
    .filter((item) => item.url)
    .slice(0, 40);
  const bodyText = normText(textSource.innerText || "");
  const prices = Array.from(new Set((bodyText.match(/(?:R\$|\$|€|£)\s?\d[\d.]*,?\d{0,2}|\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g) || []).map(normText))).slice(0, 30);

  const productNodes = Array.from(document.querySelectorAll("[itemtype*='Product'], [data-testid*='product' i], [class*='product' i], [class*='item' i], li, article"))
    .filter(visible)
    .filter((node) => /(?:R\$|\$|€|£)\s?\d|comprar|adicionar|frete|vendedor|avaliacao|avaliação|review/i.test(node.innerText || ""))
    .slice(0, pageType === "ecommerce_product" ? 1 : 20);

  const parseProduct = (node) => {
    const text = normText(node.innerText || "");
    const link = node.matches("a[href]") ? node : node.querySelector("a[href]");
    const image = node.querySelector("img[src], img[data-src]");
    const price = (text.match(/(?:R\$|\$|€|£)\s?\d[\d.]*,?\d{0,2}|\b\d{1,3}(?:\.\d{3})*,\d{2}\b/) || [])[0] || "";
    const titleNode = node.querySelector("h1,h2,h3,[class*='title' i],[class*='name' i]") || link || node;
    const rating = (text.match(/(?:\d[,.]\d|\d)\s*(?:de\s*)?(?:5|estrelas|stars)/i) || [])[0] || "";
    const reviews = (text.match(/\(?\d+[\d.]*\)?\s*(?:avaliacoes|avaliações|reviews?)/i) || [])[0] || "";
    const shipping = (text.match(/frete[^\n.]{0,80}|shipping[^\n.]{0,80}/i) || [])[0] || "";
    const seller = (text.match(/(?:vendido por|vendedor|seller)[:\s][^\n.]{2,80}/i) || [])[0] || "";
    const condition = (text.match(/\b(?:novo|usado|recondicionado|new|used)\b/i) || [])[0] || "";
    const availability = (text.match(/(?:em estoque|disponivel|disponível|fora de estoque|indisponivel|indisponível|available|out of stock)/i) || [])[0] || "";
    return {
      title: normText(titleNode.innerText || titleNode.textContent || document.title),
      price,
      url: absUrl(link?.getAttribute("href") || location.href),
      seller,
      rating,
      reviews,
      condition,
      shipping,
      availability,
      image: absUrl(image?.getAttribute("src") || image?.getAttribute("data-src") || "")
    };
  };

  let products = productNodes.map(parseProduct).filter((item) => item.title || item.price || item.url);
  if (pageType === "ecommerce_product" && !products.length) {
    products = [parseProduct(document.body)];
  }

  const detectedNoise = Array.from(document.querySelectorAll("[data-kit-clean-hidden]")).map((node) => node.getAttribute("data-kit-clean-hidden")).filter(Boolean);
  const textLength = bodyText.length;
  const extractionQuality = textLength > 1200 || products.length ? "high" : textLength > 300 ? "medium" : "low";

  return {
    title: document.title || headings[0] || "",
    url: location.href,
    pageType,
    headings,
    mainText: bodyText.slice(0, 16000),
    links,
    products,
    prices,
    images,
    detectedNoise: Array.from(new Set(detectedNoise)),
    extractionQuality
  };
}

async function clearAgentSession(agentSession) {
  if (!agentSession) {
    return;
  }

  await agentSession.clearStorageData().catch((err) => console.warn("[BROWSER-CLEAN] clearStorageData failed:", err.message));
  await agentSession.clearCache().catch((err) => console.warn("[BROWSER-CLEAN] clearCache failed:", err.message));
  await agentSession.clearAuthCache?.().catch((err) => console.warn("[BROWSER-CLEAN] clearAuthCache failed:", err.message));
  agentSession.flushStorageData?.();
}

function getPartitionForExecution(executionId, config = loadConfig()) {
  const safeId = String(executionId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "");
  return `${config.partitionPrefix || "agent-temp-"}${safeId}`;
}

function getSessionForExecution(executionId) {
  const config = loadConfig();
  const partition = config.privateSessionEnabled === false ? undefined : getPartitionForExecution(executionId, config);
  return partition ? session.fromPartition(partition) : session.defaultSession;
}

function saveDomainDecision(domain, decision = {}) {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) {
    return null;
  }

  const catalog = readJson(SOURCE_CATALOG_PATH, { domains: {} });
  const now = new Date().toISOString();
  const current = catalog.domains?.[normalizedDomain] || {};
  catalog.domains = catalog.domains || {};
  catalog.domains[normalizedDomain] = {
    permission: decision.permission || current.permission || "allow",
    profile: decision.profile || current.profile || "auto",
    source: decision.source || "user",
    createdAt: current.createdAt || now,
    updatedAt: now
  };
  writeJson(SOURCE_CATALOG_PATH, catalog);
  return catalog.domains[normalizedDomain];
}

module.exports = {
  cleanPage,
  extractCleanContent,
  clearAgentSession,
  detectPageType,
  getDomainProfile,
  registerNoise,
  shouldSkipDomain,
  loadConfig,
  getSessionForExecution,
  getPartitionForExecution,
  saveDomainDecision,
  domainFromUrl
};
