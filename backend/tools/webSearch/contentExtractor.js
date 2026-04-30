function decodeHtml(value = "") {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value = "") {
  return decodeHtml(String(value || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitleFromHtml(html = "") {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripTags(match?.[1] || "");
}

function extractParagraphs(html = "") {
  const matches = String(html || "").match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
  return matches
    .map((item) => stripTags(item))
    .filter((item) => item.length >= 60);
}

function buildExcerpt(text = "", maxChars = 360) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

export function extractContent(payload = {}) {
  const html = String(payload.html || "");
  const readerText = String(payload.readerText || "").replace(/\s+/g, " ").trim();
  const text = String(payload.text || "").replace(/\s+/g, " ").trim();
  const paragraphs = extractParagraphs(html);
  const combinedText = readerText || (paragraphs.length
    ? paragraphs.slice(0, 4).join(" ")
    : stripTags(html).slice(0, 4000) || text);

  return {
    title: String(payload.title || extractTitleFromHtml(html) || "").trim(),
    text: combinedText,
    excerpt: buildExcerpt(combinedText || readerText || text || payload.snippet || ""),
    rawText: text
  };
}
