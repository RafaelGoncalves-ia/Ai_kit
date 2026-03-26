//memory.context.js
import { getRecentMessages, getVocabulary } from "./memory.repository.js";

// ======================
// CONTEXTO LIMITADO
// ======================
export function buildContext() {
  const messages = getRecentMessages(10); // limite

  const vocab = getVocabulary(10)
    .map(v => v.text)
    .join("\n");

  return {
    messages: messages.reverse(),
    vocabulary: vocab
  };
}