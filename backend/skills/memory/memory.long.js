import { getRelevantMemory, saveMemory } from "./memory.repository.js";

export function addLongMemory(entry) {
  if (!entry || !entry.type) {
    return;
  }

  saveMemory({
    type: entry.type,
    key: entry.key || null,
    value: entry.value || entry.content || "",
    relevance: entry.relevance || 0.6,
    confidence: entry.confidence || 0.7,
    source: entry.source || "memory.long",
    groupId: entry.groupId || null
  });
}

export function fetchLongMemory(options = {}) {
  return getRelevantMemory({
    groupId: options.sessionId || null,
    query: options.query || "",
    limit: options.limit || 20
  });
}
