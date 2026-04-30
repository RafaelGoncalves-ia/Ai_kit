function truncate(value = "", maxChars = 360) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

export function formatSearchResultText({
  intent = "general",
  query = "",
  searchUrl = "",
  sources = []
} = {}) {
  const header = [
    `PESQUISA WEB (${intent})`,
    query ? `Consulta: ${query}` : "",
    searchUrl ? `Busca: ${searchUrl}` : ""
  ].filter(Boolean).join("\n");

  const sourceBlocks = sources.map((source, index) => [
    `${index + 1}. ${source.title || "Fonte sem titulo"} (${source.domain || "dominio-desconhecido"})`,
    `URL: ${source.url}`,
    source.pageType ? `Tipo: ${source.pageType}` : "",
    Array.isArray(source.products) && source.products.length
      ? `Produtos: ${source.products.slice(0, 5).map((item) => [
        item.title || "produto",
        item.price,
        item.rating,
        item.shipping
      ].filter(Boolean).join(" | ")).join(" ; ")}`
      : "",
    Array.isArray(source.prices) && source.prices.length && (!source.products || !source.products.length)
      ? `Precos: ${source.prices.slice(0, 8).join(", ")}`
      : "",
    source.snippet ? `Snippet: ${truncate(source.snippet, 220)}` : "",
    source.excerpt ? `Conteudo: ${truncate(source.excerpt, 420)}` : ""
  ].filter(Boolean).join("\n"));

  const linkList = sources.map((source) => `- ${source.url}`).join("\n");

  return [
    header,
    "",
    ...sourceBlocks,
    "",
    "Fontes:",
    linkList || "- sem fontes confirmadas"
  ].join("\n").trim();
}
