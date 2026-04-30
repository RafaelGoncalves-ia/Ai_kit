function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonCandidate(text = "") {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return raw.slice(first, last + 1).trim();
  }

  return raw;
}

function isPlainDomain(value = "") {
  const domain = String(value || "").trim().toLowerCase();
  if (!domain) {
    return true;
  }

  if (
    domain.includes("://") ||
    domain.includes("/") ||
    domain.includes("\\") ||
    domain.includes("..") ||
    domain.startsWith(".") ||
    domain.endsWith(".")
  ) {
    return false;
  }

  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
}

export function validateAgentToolMessage(candidate, options = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, error: "invalid_json_object" };
  }

  if (candidate.type === "tool_request") {
    const allowedTools = Array.isArray(options.allowedTools) ? options.allowedTools : [];
    const tool = String(candidate.tool || "").trim();
    const query = String(candidate.query || "").trim();
    const reason = String(candidate.reason || "").trim();
    const domain = candidate.domain === null || candidate.domain === undefined
      ? null
      : String(candidate.domain).trim().toLowerCase();

    if (!allowedTools.includes(tool)) {
      return { ok: false, error: "tool_not_allowed" };
    }

    if (!query) {
      return { ok: false, error: "empty_query" };
    }

    if (domain && !isPlainDomain(domain)) {
      return { ok: false, error: "invalid_domain" };
    }

    return {
      ok: true,
      value: {
        type: "tool_request",
        tool,
        reason,
        query,
        domain
      }
    };
  }

  if (candidate.type === "final") {
    const answer = String(candidate.answer || "").trim();
    const sources = Array.isArray(candidate.sources)
      ? candidate.sources
          .filter((source) => source && typeof source === "object")
          .map((source) => ({
            title: String(source.title || "").trim(),
            url: String(source.url || "").trim(),
            domain: String(source.domain || "").trim()
          }))
          .filter((source) => source.title || source.url || source.domain)
      : [];

    if (!answer) {
      return { ok: false, error: "empty_final_answer" };
    }

    return {
      ok: true,
      value: {
        type: "final",
        answer,
        sources
      }
    };
  }

  return { ok: false, error: "unsupported_message_type" };
}

export function parseAgentToolMessage(text, options = {}) {
  const candidateText = extractJsonCandidate(text);
  const parsed = safeJsonParse(candidateText);
  if (!parsed) {
    return { ok: false, error: "invalid_json" };
  }

  return validateAgentToolMessage(parsed, options);
}

export function isValidPlainDomain(value = "") {
  return isPlainDomain(value);
}
