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
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value = "") {
  const raw = decodeHtml(value);

  try {
    if (raw.startsWith("/url?")) {
      const temp = new URL(`https://www.google.com${raw}`);
      return temp.searchParams.get("q") || "";
    }

    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return raw;
    }

    return "";
  } catch {
    return "";
  }
}

export function detectCaptcha(payload = {}) {
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

export function parseGoogleSearchResults(html = "", options = {}) {
  const maxResults = Math.max(1, Number(options.maxResults || 8));
  const results = [];
  const seen = new Set();
  const source = String(html || "");
  const anchorRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(source)) && results.length < maxResults) {
    const href = normalizeUrl(match[1]);
    if (!href || seen.has(href)) {
      continue;
    }

    if (/google\./i.test(href) || href.startsWith("javascript:")) {
      continue;
    }

    const title = stripTags(match[2]);
    if (!title || title.length < 3) {
      continue;
    }

    const snippetChunk = source.slice(match.index, Math.min(source.length, match.index + 1200));
    const snippet = stripTags(
      snippetChunk
        .replace(match[0], " ")
        .replace(/\b(Cache|Traduzir esta pagina|Translate this page)\b/gi, " ")
    ).slice(0, 320);

    seen.add(href);
    results.push({
      title,
      url: href,
      snippet
    });
  }

  return results;
}
