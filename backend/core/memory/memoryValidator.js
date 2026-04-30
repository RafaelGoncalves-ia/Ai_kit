const TEMPORARY_PATTERNS = [
  /\bagora\b/i,
  /\bhoje\b/i,
  /\bneste momento\b/i,
  /\bo usuario pediu\b/i,
  /\banalisar a tela\b/i,
  /\babrir pasta\b/i,
  /\bprint\b/i,
  /\babrir app\b/i,
  /\balarme\b/i,
  /\bleia a tela\b/i
];

const OPERATIONAL_PATTERNS = [
  /\babrir\b.+\b(pasta|app|arquivo|chrome|programa)\b/i,
  /\b(print|screenshot|captura de tela)\b/i,
  /\b(leia|ler|analise|analisar)\b.+\b(tela|print|imagem)\b/i,
  /\bcomando\b/i,
  /\btemporario\b/i
];

const TRIVIAL_PATTERNS = [
  /^(oi|ola|ol[áa]|e ai|bom dia|boa tarde|boa noite)[!. ]*$/i,
  /^(kkk+|haha+|rs+)[!. ]*$/i
];

const CONTENT_LOG_PATTERNS = [
  /\[(info|warn|error|debug)\]/i,
  /\bconsole\.(log|warn|error|debug)\b/i,
  /```/
];

const STOPWORDS = new Set([
  "a", "o", "e", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "para", "por", "com", "sem", "um", "uma", "uns", "umas", "que", "como", "isso",
  "essa", "esse", "mais", "menos", "muito", "muita", "pra", "pro", "sou", "estou",
  "esta", "esse", "essa", "agora", "hoje", "ontem", "amanha"
]);

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeMemoryKey(value) {
  const normalized = normalizeComparableText(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return normalized.slice(0, 60);
}

export function extractSearchTerms(value, limit = 12) {
  const terms = normalizeComparableText(value)
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length >= 3 && !STOPWORDS.has(term));

  return Array.from(new Set(terms)).slice(0, limit);
}

export function isOperationalOrTemporaryText(value) {
  const text = normalizeText(value);
  if (!text) {
    return true;
  }

  if (TRIVIAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  if (TEMPORARY_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  return OPERATIONAL_PATTERNS.some((pattern) => pattern.test(text));
}

export function shouldConsiderConversationMessage(message = {}) {
  const content = normalizeText(message.content);
  if (!content) {
    return false;
  }

  if (content.length < 12) {
    return false;
  }

  return !isOperationalOrTemporaryText(content);
}

export function createMemoryValidator(memoryConfig = {}) {
  const settings = memoryConfig.settings || {};
  const categories = Array.isArray(memoryConfig.categories) ? memoryConfig.categories : [];
  const categoryIds = new Set(categories.map((category) => String(category.id || "").trim()).filter(Boolean));

  function validateCandidate(candidate = {}) {
    const category = String(candidate.category || "").trim();
    const key = normalizeMemoryKey(candidate.key || "");
    const content = normalizeText(candidate.content || "");
    const confidence = Number(candidate.confidence);

    if (!categoryIds.has(category)) {
      return { ok: false, reason: "invalid_category" };
    }

    if (!key || key.length < 2 || key.length > 60 || key.split("_").length > 6) {
      return { ok: false, reason: "invalid_key" };
    }

    if (!Number.isFinite(confidence) || confidence < Number(settings.min_confidence || 0.8)) {
      return { ok: false, reason: "low_confidence" };
    }

    const minLength = Number(settings.min_content_length || 80);
    const maxLength = Number(settings.max_content_length || 600);
    if (content.length < minLength || content.length > maxLength) {
      return { ok: false, reason: "invalid_content_length" };
    }

    if (isOperationalOrTemporaryText(content)) {
      return { ok: false, reason: "temporary_or_operational_content" };
    }

    if (CONTENT_LOG_PATTERNS.some((pattern) => pattern.test(content))) {
      return { ok: false, reason: "log_like_content" };
    }

    return {
      ok: true,
      item: {
        category,
        key,
        content,
        confidence
      }
    };
  }

  return {
    validateCandidate
  };
}
