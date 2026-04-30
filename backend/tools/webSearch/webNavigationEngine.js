import fs from "fs";
import path from "path";
import crypto from "crypto";
import fetch from "node-fetch";
import { extractContent } from "./contentExtractor.js";
import { evaluateDomainAccess, extractDomainsFromQuery, getDomainFromUrl, isDomainMatch } from "./domainGuard.js";
import { detectCaptcha, parseGoogleSearchResults } from "./googleSearchParser.js";
import { formatSearchResultText } from "./resultFormatter.js";

const CONFIG_PATH = path.resolve("backend/config/webSearch.json");
const CLEAN_CONFIG_PATH = path.resolve("backend/config/browser.clean.json");
const NOISE_CONFIG_PATH = path.resolve("backend/config/browserNoise.json");
const SOURCE_CATALOG_PATH = path.resolve("backend/config/source_catalog.json");
const DEFAULT_BRIDGE_URL = `http://127.0.0.1:${process.env.KIT_WEB_SEARCH_BRIDGE_PORT || "3011"}`;

const DEFAULT_CONFIG = {
  enabled: true,
  showBrowserWindow: true,
  defaultSearchEngine: "google",
  maxSources: 3,
  maxSearchResults: 8,
  requirePermissionForUnknownDomains: true,
  browser: {
    width: 1100,
    height: 720,
    opacity: 0.8,
    frame: false,
    alwaysOnTopOnCaptcha: true
  },
  allowlist: [],
  blocklist: [],
  searchProfiles: {}
};

const DEFAULT_CLEAN_CONFIG = {
  enabled: true,
  maxAttemptsPerDomain: 2,
  maxAttemptsPerUrl: 1,
  noiseScoreSkipThreshold: 8,
  partitionPrefix: "agent-temp-",
  domainProfiles: {}
};

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return structuredClone(DEFAULT_CONFIG);
    }

    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return {
      ...structuredClone(DEFAULT_CONFIG),
      ...parsed,
      browser: {
        ...DEFAULT_CONFIG.browser,
        ...(parsed?.browser || {})
      },
      searchProfiles: parsed?.searchProfiles || {}
    };
  } catch (err) {
    console.warn("[WEB_SEARCH] Falha ao carregar webSearch.json:", err.message);
    return structuredClone(DEFAULT_CONFIG);
  }
}

function readJsonFile(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      return structuredClone(fallback);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn("[BROWSER-CLEAN] Falha ao carregar config:", filePath, err.message);
    return structuredClone(fallback);
  }
}

function readCleanConfig() {
  const parsed = readJsonFile(CLEAN_CONFIG_PATH, DEFAULT_CLEAN_CONFIG);
  return {
    ...structuredClone(DEFAULT_CLEAN_CONFIG),
    ...parsed,
    domainProfiles: parsed?.domainProfiles || {}
  };
}

function readSourceCatalog() {
  return readJsonFile(SOURCE_CATALOG_PATH, { domains: {} });
}

function readNoiseConfig() {
  return readJsonFile(NOISE_CONFIG_PATH, {});
}

function normalizeDomain(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function resolveDomainProfile(domain = "", cleanConfig = readCleanConfig()) {
  const normalizedDomain = normalizeDomain(domain);
  const catalog = readSourceCatalog();
  const catalogEntry = Object.entries(catalog.domains || {}).find(([rule]) => isDomainMatch(normalizedDomain, rule));
  if (catalogEntry) {
    const [, entry] = catalogEntry;
    if (entry.permission === "block") {
      return "blocked";
    }
    return entry.profile || "auto";
  }

  const configured = Object.entries(cleanConfig.domainProfiles || {}).find(([rule]) => isDomainMatch(normalizedDomain, rule));
  return configured?.[1] || "auto";
}

function getCatalogDomainLists() {
  const catalog = readSourceCatalog();
  const allowlist = [];
  const blocklist = [];

  for (const [domain, entry] of Object.entries(catalog.domains || {})) {
    if (entry?.permission === "block") {
      blocklist.push(domain);
    } else if (entry?.permission === "allow") {
      allowlist.push(domain);
    }
  }

  return { allowlist, blocklist };
}

function shouldSkipByNoise(domain, cleanConfig, input = {}) {
  const normalizedDomain = normalizeDomain(domain);
  if (input.domain && isDomainMatch(normalizedDomain, input.domain)) {
    return { skip: false };
  }

  const profile = resolveDomainProfile(normalizedDomain, cleanConfig);
  if (profile === "blocked") {
    return { skip: true, reason: "blocked_profile" };
  }

  const noise = readNoiseConfig();
  const noiseScore = Number(noise[normalizedDomain]?.noiseScore || 0);
  if (noiseScore >= Number(cleanConfig.noiseScoreSkipThreshold || 8)) {
    return { skip: true, reason: "noiseScore/high_retry", noiseScore };
  }

  return { skip: false, noiseScore };
}

function incrementAttempt(executionContext, url, domain) {
  const normalizedUrl = String(url || "").trim();
  const normalizedDomain = normalizeDomain(domain);
  executionContext.urls[normalizedUrl] = Number(executionContext.urls[normalizedUrl] || 0) + 1;
  executionContext.domains[normalizedDomain] = Number(executionContext.domains[normalizedDomain] || 0) + 1;
}

function canAttempt(executionContext, url, domain, cleanConfig, input = {}) {
  if (input.domain && isDomainMatch(domain, input.domain)) {
    return { allow: true };
  }

  const urlAttempts = Number(executionContext.urls[String(url || "").trim()] || 0);
  if (urlAttempts >= Number(cleanConfig.maxAttemptsPerUrl || 1)) {
    return { allow: false, reason: "url_retry" };
  }

  const domainAttempts = Number(executionContext.domains[normalizeDomain(domain)] || 0);
  if (domainAttempts >= Number(cleanConfig.maxAttemptsPerDomain || 2)) {
    return { allow: false, reason: "domain_retry" };
  }

  return { allow: true };
}

function appendDomainHints(query = "", preferredDomains = []) {
  const normalizedQuery = String(query || "").trim();
  const domains = Array.isArray(preferredDomains) ? preferredDomains.filter(Boolean) : [];

  if (!normalizedQuery || !domains.length) {
    return normalizedQuery;
  }

  if (domains.some((domain) => normalizedQuery.includes(`site:${domain}`))) {
    return normalizedQuery;
  }

  return `${normalizedQuery} ${domains.map((domain) => `site:${domain}`).join(" OR ")}`.trim();
}

function buildSearchUrl({ engine = "google", query = "", maxResults = 8, freshness = "" } = {}) {
  const normalizedQuery = String(query || "").trim();
  const size = Math.max(1, Math.min(Number(maxResults || 8), 10));

  if (String(engine || "").toLowerCase() === "google") {
    const url = new URL("https://www.google.com/search");
    url.searchParams.set("q", normalizedQuery);
    url.searchParams.set("hl", "pt-BR");
    url.searchParams.set("gl", "br");
    url.searchParams.set("num", String(size));
    url.searchParams.set("pws", "0");

    if (freshness === "recent") {
      url.searchParams.set("tbs", "qdr:d");
    }

    return url.toString();
  }

  throw new Error(`Search engine nao suportado: ${engine}`);
}

function sortResults(results = [], preferredDomains = []) {
  const domains = preferredDomains.filter(Boolean);
  if (!domains.length) {
    return results;
  }

  return [...results].sort((left, right) => {
    const leftScore = domains.findIndex((domain) => isDomainMatch(left.domain, domain));
    const rightScore = domains.findIndex((domain) => isDomainMatch(right.domain, domain));
    const normalizedLeft = leftScore === -1 ? Number.MAX_SAFE_INTEGER : leftScore;
    const normalizedRight = rightScore === -1 ? Number.MAX_SAFE_INTEGER : rightScore;
    return normalizedLeft - normalizedRight;
  });
}

export function createWebNavigationEngine(context = {}) {
  const permissionCache = context.runtime?.webSearchDomainPermissionCache || {};
  context.runtime = context.runtime || {};
  context.runtime.webSearchDomainPermissionCache = permissionCache;

  async function bridgeRequest(endpoint, payload = {}, timeoutMs = 90000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${DEFAULT_BRIDGE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || `Bridge HTTP ${response.status}`);
      }

      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function emitStatus(message, payload = {}) {
    context.core?.eventBus?.emit("action:status", {
      message,
      timestamp: Date.now(),
      ...payload
    });
  }

  async function requestUnknownDomainPermission({ domain, url }) {
    const response = await bridgeRequest("/permission", {
      domain,
      url
    }, 120000);

    permissionCache[domain] = response?.allowed === true ? "allow" : response?.permission || "ignore";
    return {
      allowed: response?.allowed === true,
      profile: response?.profile || "auto",
      permission: response?.permission || "ignore"
    };
  }

  async function runSearch(input = {}) {
    const config = readConfig();
    const cleanConfig = readCleanConfig();
    if (config.enabled === false) {
      return {
        success: false,
        code: "WEB_SEARCH_DISABLED",
        error: "Pesquisa web desabilitada no config."
      };
    }

    const intent = String(input.intent || "general").trim().toLowerCase() || "general";
    const query = String(input.query || "").trim();
    if (!query) {
      return {
        success: false,
        code: "INVALID_QUERY",
        error: "Consulta vazia."
      };
    }

    const profile = config.searchProfiles?.[intent] || {};
    const inferredDomains = extractDomainsFromQuery(query);
    const allowedDomainsOnly = Array.from(
      new Set([
        ...(Array.isArray(input.allowedDomainsOnly) ? input.allowedDomainsOnly : []),
        ...inferredDomains
      ].filter(Boolean))
    );
    const maxSources = Math.max(
      1,
      Number(input.maxSources || profile.maxSources || config.maxSources || 3)
    );
    const maxSearchResults = Math.max(
      maxSources,
      Number(input.maxSearchResults || config.maxSearchResults || 8)
    );
    const finalQuery = appendDomainHints(
      query,
      allowedDomainsOnly.length ? allowedDomainsOnly : (profile.preferredDomains || [])
    );
    const searchUrl = buildSearchUrl({
      engine: input.searchEngine || config.defaultSearchEngine,
      query: finalQuery,
      maxResults: maxSearchResults,
      freshness: profile.freshness || input.freshness || ""
    });
    const executionId = String(input.executionId || crypto.randomUUID());
    const executionContext = {
      id: executionId,
      urls: {},
      domains: {}
    };

    try {
      emitStatus("| pesquisando na web...");
      const searchPage = await bridgeRequest("/search", {
        url: searchUrl,
        executionId,
        showWindow: input.showBrowserWindow ?? config.showBrowserWindow,
        browser: config.browser
      });

      if (detectCaptcha(searchPage)) {
        emitStatus("captcha detectado na pesquisa web");
        global.sendSSE?.({
          type: "web_search:captcha",
          payload: {
            stage: "search",
            url: searchUrl
          }
        });

        return {
          success: false,
          code: "WEB_SEARCH_CAPTCHA",
          error: "CAPTCHA detectado na pagina de busca.",
          data: {
            query,
            searchUrl
          }
        };
      }

      const parsedResults = parseGoogleSearchResults(searchPage.html || "", {
        maxResults: maxSearchResults
      }).map((item) => ({
        ...item,
        domain: getDomainFromUrl(item.url)
      }));

      const orderedResults = sortResults(parsedResults, profile.preferredDomains || []);
      const collectedSources = [];
      const catalogLists = getCatalogDomainLists();

      for (const candidate of orderedResults) {
        if (collectedSources.length >= maxSources) {
          break;
        }

        const candidateDomain = candidate.domain || getDomainFromUrl(candidate.url);
        const skipNoise = shouldSkipByNoise(candidateDomain, cleanConfig, input);
        if (skipNoise.skip) {
          console.log(`[BROWSER-CLEAN] skip noisy domain: ${candidateDomain} reason=${skipNoise.reason}`);
          emitStatus(`| dominio ignorado: ${candidateDomain} - muito ruido para pesquisa textual`);
          continue;
        }

        const attempt = canAttempt(executionContext, candidate.url, candidateDomain, cleanConfig, input);
        if (!attempt.allow) {
          console.log(`[BROWSER-CLEAN] skip noisy domain: ${candidateDomain} reason=${attempt.reason}`);
          continue;
        }

        let domainProfile = resolveDomainProfile(candidateDomain, cleanConfig);
        const access = evaluateDomainAccess({
          url: candidate.url,
          allowlist: [
            ...(Array.isArray(config.allowlist) ? config.allowlist : []),
            ...catalogLists.allowlist
          ],
          blocklist: [
            ...(Array.isArray(config.blocklist) ? config.blocklist : []),
            ...(Array.isArray(profile.blocklist) ? profile.blocklist : []),
            ...(Array.isArray(input.blocklist) ? input.blocklist : []),
            ...catalogLists.blocklist
          ],
          allowedDomainsOnly,
          requirePermissionForUnknownDomains: config.requirePermissionForUnknownDomains !== false,
          permissionCache
        });

        if (access.action === "blocked") {
          continue;
        }

        if (access.action === "ask_permission") {
          emitStatus(`pedindo permissao para abrir ${access.domain}...`);
          const decision = await requestUnknownDomainPermission({
            domain: access.domain,
            url: candidate.url
          });

          if (!decision.allowed) {
            continue;
          }
          domainProfile = decision.profile || domainProfile;
        }

        incrementAttempt(executionContext, candidate.url, candidateDomain);
        emitStatus(`| abrindo fonte: ${access.domain || candidate.domain}`);

        let page;
        try {
          page = await bridgeRequest("/extract", {
            url: candidate.url,
            executionId,
            domainProfile,
            showWindow: input.showBrowserWindow ?? config.showBrowserWindow,
            browser: config.browser
          });
        } catch (err) {
          console.warn("[WEB_SEARCH] Fonte ignorada apos falha ao abrir:", {
            url: candidate.url,
            error: err.message
          });
          continue;
        }

        if (detectCaptcha(page)) {
          emitStatus("captcha detectado em uma fonte web");
          global.sendSSE?.({
            type: "web_search:captcha",
            payload: {
              stage: "source",
              url: candidate.url
            }
          });
          continue;
        }

        if (Array.isArray(page.detectedNoise) && page.detectedNoise.length) {
          emitStatus("| pagina limpa: cookies/popups removidos");
        }

        const extracted = extractContent({
          ...page,
          text: page.cleanContent?.mainText || page.text,
          readerText: page.cleanContent?.mainText || page.readerText,
          snippet: candidate.snippet
        });

        if (!extracted.title && !extracted.excerpt) {
          continue;
        }

        collectedSources.push({
          title: extracted.title || candidate.title,
          url: candidate.url,
          domain: candidate.domain,
          snippet: candidate.snippet,
          excerpt: extracted.excerpt,
          content: extracted.text,
          pageType: page.cleanContent?.pageType || page.pageType || "normal",
          products: page.cleanContent?.products || [],
          prices: page.cleanContent?.prices || [],
          extractionQuality: page.cleanContent?.extractionQuality || "unknown"
        });

        const cleanDetails = [];
        if (page.cleanContent?.pageType) cleanDetails.push(page.cleanContent.pageType);
        if (page.cleanContent?.products?.length) cleanDetails.push("produto");
        if (page.cleanContent?.prices?.length) cleanDetails.push("preco");
        if (page.cleanContent?.products?.some((item) => item.rating)) cleanDetails.push("avaliacao");
        emitStatus(`| conteudo extraido: ${cleanDetails.join(", ") || "texto limpo"}`);
      }

      const text = formatSearchResultText({
        intent,
        query,
        searchUrl,
        sources: collectedSources
      });

      return {
        success: true,
        data: {
          intent,
          query,
          searchUrl,
          sources: collectedSources,
          text
        }
      };
    } finally {
      if (config.browser?.closeWhenDone !== false) {
        await bridgeRequest("/release", {
          executionId,
          destroy: true
        }, 5000).catch(() => {});
      }
    }
  }

  return {
    runSearch
  };
}
