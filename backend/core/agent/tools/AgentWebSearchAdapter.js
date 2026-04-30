import { isValidPlainDomain } from "../ToolRequestParser.js";

function domainFromUrl(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function normalizeSource(source = {}) {
  const url = String(source.url || "").trim();
  const domain = String(source.domain || domainFromUrl(url)).trim();

  return {
    title: String(source.title || "Fonte sem titulo").trim(),
    url,
    domain,
    content: String(source.content || source.excerpt || source.snippet || "").trim()
  };
}

export function createAgentWebSearchAdapter(context, config = {}) {
  const webConfig = config.webSearch || {};

  return async function runAgentWebSearch(request = {}) {
    const query = String(request.query || "").trim();
    const domain = request.domain ? String(request.domain).trim().toLowerCase() : null;

    if (!query) {
      throw new Error("Consulta de busca vazia.");
    }

    if (domain && (webConfig.allowDomainRestriction === false || !isValidPlainDomain(domain))) {
      throw new Error("Dominio de busca invalido.");
    }

    const searchInput = {
      query: domain ? `${query} site:${domain}` : query,
      originalQuery: query,
      domain,
      allowedDomainsOnly: domain ? [domain] : undefined,
      maxSources: Number(webConfig.maxSources || 3),
      maxSearchResults: Number(webConfig.maxSearchResults || 8),
      intent: "general",
      source: "agent-tool-loop.web_search"
    };

    const tool = context.invokeTool
      ? (input) => context.invokeTool("web_search", input)
      : context.tools?.web_search;

    if (typeof tool !== "function") {
      throw new Error("WebSearchTool indisponivel.");
    }

    const result = await tool(searchInput);
    if (result?.status !== "ok") {
      throw new Error(result?.error || "Falha na pesquisa web.");
    }

    const data = result.data || {};
    const rawSources = Array.isArray(data.sources) ? data.sources : [];
    const normalized = rawSources
      .map(normalizeSource)
      .filter((source) => source.url || source.content)
      .slice(0, Number(webConfig.maxSources || 3));
    const sources = normalized.map((source) => ({
      title: source.title,
      url: source.url,
      domain: source.domain
    }));
    const content = normalized.map((source) => ({
      title: source.title,
      url: source.url,
      text: source.content
    }));
    const summary = `${sources.length} ${sources.length === 1 ? "fonte encontrada" : "fontes encontradas"}`;

    return {
      tool: "web_search",
      query,
      domain,
      reason: String(request.reason || "").trim(),
      summary,
      sources,
      content,
      results: normalized
    };
  };
}
