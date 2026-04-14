import {
  getMemoryByType,
  getRecentConversationMessages,
  getRelevantMemory,
  getVocabulary,
  saveMemory
} from "./memory.repository.js";

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function truncate(text, maxChars) {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 18)).trim()} [truncado]`;
}

function dedupeEntries(entries = []) {
  const seen = new Set();
  return entries.filter((entry) => {
    const identity = [
      entry.type,
      entry.key || "",
      entry.value || "",
      entry.groupId || "",
      entry.source || ""
    ].join("|");

    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });
}

function extractGreetingVocabulary(text) {
  const lower = normalizeComparableText(text);
  const greetings = ["bom dia", "boa tarde", "boa noite", "oi", "ola", "olá"];
  return greetings.find((item) => lower.includes(item)) || null;
}

function extractUserEntries(text, meta = {}) {
  const normalized = normalizeText(text);
  const lower = normalizeComparableText(normalized);
  const globalEntries = [];
  const sessionEntries = [];
  const sessionId = meta.sessionId || null;

  const pushGlobal = (entry) => globalEntries.push({
    confidence: 0.8,
    relevance: 0.7,
    source: meta.source || "memory.rule",
    groupId: null,
    ...entry
  });

  const pushSession = (entry) => sessionEntries.push({
    confidence: 0.7,
    relevance: 0.6,
    source: meta.source || "memory.rule",
    groupId: sessionId,
    ...entry
  });

  const nameMatch = normalized.match(/\b(?:meu nome e|me chamo|pode me chamar de)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\- ]{1,40})/i);
  if (nameMatch) {
    pushGlobal({
      type: "user",
      key: "nome",
      value: normalizeText(nameMatch[1]),
      relevance: 0.98,
      confidence: 0.98
    });
  }

  const companyMatch = normalized.match(/\b(?:minha\s+(?:empresa|agencia|agência)\s+(?:e|é|se chama)|empresa|agencia|agência)\s*[:\-]?\s*([A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ '&._-]{1,60})/i);
  if (companyMatch) {
    pushGlobal({
      type: "fact",
      key: "empresa",
      value: normalizeText(companyMatch[1]),
      relevance: 0.92,
      confidence: 0.9
    });
  }

  const workAreaMatch = normalized.match(/\b(?:trabalho com|atuo com|sou de|minha area e|minha área é)\s+([A-Za-zÀ-ÿ0-9 ,._-]{3,80})/i);
  if (workAreaMatch) {
    pushGlobal({
      type: "fact",
      key: "area",
      value: normalizeText(workAreaMatch[1]),
      relevance: 0.85,
      confidence: 0.84
    });
  }

  const likeMatch = normalized.match(/\b(?:eu gosto de|curto|adoro|prefiro)\s+([A-Za-zÀ-ÿ0-9 ,._-]{2,80})/i);
  if (likeMatch) {
    pushGlobal({
      type: "preference",
      key: "gosta_de",
      value: normalizeText(likeMatch[1]),
      relevance: 0.8,
      confidence: 0.78
    });
  }

  const dislikeMatch = normalized.match(/\b(?:nao gosto de|não gosto de|detesto|odeio)\s+([A-Za-zÀ-ÿ0-9 ,._-]{2,80})/i);
  if (dislikeMatch) {
    pushGlobal({
      type: "preference",
      key: "nao_gosta_de",
      value: normalizeText(dislikeMatch[1]),
      relevance: 0.8,
      confidence: 0.78
    });
  }

  const focusMatch = normalized.match(/\b(?:focado em|focada em|foco em|sobre)\s+([A-Za-zÀ-ÿ0-9 ,._-]{2,100})/i);
  if (focusMatch) {
    pushSession({
      type: "topic",
      key: "foco",
      value: normalizeText(focusMatch[1]),
      relevance: 0.82,
      confidence: 0.78
    });
  }

  if (lower.includes("sem inventar")) {
    pushGlobal({
      type: "constraint",
      key: "estilo_resposta",
      value: "sem inventar",
      relevance: 0.9,
      confidence: 0.92
    });
  }

  if (lower.includes("objetivo") || lower.includes("objetiva")) {
    pushGlobal({
      type: "constraint",
      key: "estilo_resposta",
      value: "objetivo",
      relevance: 0.75,
      confidence: 0.72
    });
  }

  if (lower.includes("em portugues") || lower.includes("em português")) {
    pushGlobal({
      type: "constraint",
      key: "idioma",
      value: "pt-BR",
      relevance: 0.88,
      confidence: 0.9
    });
  }

  const greeting = extractGreetingVocabulary(normalized);
  if (greeting) {
    pushSession({
      type: "vocabulary",
      key: "saudacao",
      value: greeting,
      relevance: 0.45,
      confidence: 0.9
    });
  }

  return dedupeEntries([...globalEntries, ...sessionEntries]);
}

function extractAIEntries(text, meta = {}) {
  const normalized = normalizeText(text);
  const entries = [];
  const sessionId = meta.sessionId || null;

  const opinionMatch = normalized.match(/\b(?:eu gosto de|eu prefiro|minha favorita e|minha favorita é)\s+([A-Za-zÀ-ÿ0-9 ,._-]{2,80})/i);
  if (opinionMatch) {
    entries.push({
      type: "ai_opinion",
      key: "opiniao",
      value: normalizeText(opinionMatch[1]),
      relevance: 0.35,
      confidence: 0.45,
      groupId: sessionId,
      source: meta.source || "memory.ai-rule"
    });
  }

  return dedupeEntries(entries);
}

function persistEntries(entries = []) {
  for (const entry of entries) {
    saveMemory(entry);
  }
}

export async function extractMemory(text, context, meta = {}) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { extracted: 0 };
  }

  const entries = extractUserEntries(normalized, meta);
  persistEntries(entries);

  return { extracted: entries.length };
}

export async function extractAIMemory(text, context, meta = {}) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { extracted: 0 };
  }

  const entries = extractAIEntries(normalized, meta);
  persistEntries(entries);
  return { extracted: entries.length };
}

export async function buildContext(options = {}) {
  const sessionId = options.sessionId || options.groupId || null;
  const query = options.query || options.text || "";
  const memories = getRelevantMemory({
    groupId: sessionId,
    query,
    limit: 8
  });
  const vocabulary = getVocabulary(5, {
    groupId: sessionId,
    query
  });
  const recentMessages = getRecentConversationMessages({
    groupId: sessionId || "default",
    limit: 6
  });

  const memoryLines = memories.map((memory) => {
    const label = memory.key ? `${memory.type}/${memory.key}` : memory.type;
    return `- ${label}: ${truncate(memory.content, 140)}`;
  });

  const vocabularyLines = vocabulary.map((item) => {
    const parts = [truncate(item.term || item.phrase, 80)];
    if (item.meaning) {
      parts.push(truncate(item.meaning, 120));
    }
    return `- ${parts.join(": ")}`;
  });
  const conversationLines = recentMessages.map((message) => {
    const roleLabel = message.role === "assistant" ? "assistant" : message.role;
    return `- ${roleLabel}: ${truncate(message.content, 180)}`;
  });

  const sections = [];

  if (memoryLines.length > 0) {
    sections.push(`Memorias persistentes:\n${memoryLines.join("\n")}`);
  }

  if (vocabularyLines.length > 0) {
    sections.push(`Vocabulário útil:\n${vocabularyLines.join("\n")}`);
  }

  if (conversationLines.length > 0) {
    sections.push(`Conversa recente:\n${conversationLines.join("\n")}`);
  }

  const text = sections.join("\n\n").trim();
  return truncate(text, 2400);
}

export function getLegacyContextSnapshot() {
  return {
    userData: getMemoryByType("user", 5),
    preferences: getMemoryByType("preference", 5),
    facts: getMemoryByType("fact", 5)
  };
}
