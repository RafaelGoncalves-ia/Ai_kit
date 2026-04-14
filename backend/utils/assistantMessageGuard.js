import { ensureAssistantRuntime } from "./runtimeState.js";

const BLOCKED_GENERIC_PATTERNS = [
  /claro,\s*posso ajudar/i,
  /como posso ajudar voc[e\u00ea] hoje/i,
  /tudo bem por aqui/i,
  /posso ajudar com qualquer coisa/i,
  /quer conversar um pouco/i,
  /voce ainda esta ai/i,
  /ta tudo bem por ai/i
];

function normalizeComparableText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function buildPromptPreview(prompt, maxLength = 140) {
  const normalized = String(prompt || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function hasUsableAssistantText(text) {
  const raw = String(text || "").trim();
  const normalized = normalizeComparableText(text);
  if (!normalized) {
    return false;
  }

  if (!raw) {
    return false;
  }

  if (["null", "undefined", "..."].includes(normalized)) {
    return false;
  }

  return normalized.length >= 2;
}

export function isBlockedGenericAssistantText(text) {
  const normalized = normalizeComparableText(text);
  if (!normalized) {
    return true;
  }

  return BLOCKED_GENERIC_PATTERNS.some((pattern) => pattern.test(normalized));
}

function getRecentMessagesStore(context) {
  return ensureAssistantRuntime(context).recentMessages;
}

export function shouldSuppressAssistantMessage(context, text, options = {}) {
  const { source = "unknown" } = options;

  if (!hasUsableAssistantText(text)) {
    return {
      blocked: true,
      reason: "empty_or_invalid",
      source
    };
  }

  return {
    blocked: false,
    reason: null,
    source
  };
}

export function registerAssistantMessage(context, text, options = {}) {
  if (!context || !hasUsableAssistantText(text)) {
    return;
  }

  const store = getRecentMessagesStore(context);
  store.push({
    source: options.source || "unknown",
    normalized: normalizeComparableText(text),
    timestamp: Date.now()
  });
}
