import { getRecentConversationMessages, getVocabulary } from "./memory.repository.js";

// ======================
// CONTEXTO LIMITADO
// ======================
export function buildContext(options = {}) {
  const messages = getRecentConversationMessages({
    groupId: options.sessionId || "default",
    limit: 10
  });

  const vocab = getVocabulary(10, {
    groupId: options.sessionId || null,
    query: options.query || ""
  })
    .map((v) => v.term || v.phrase)
    .join("\n");

  return {
    messages,
    vocabulary: vocab
  };
}
