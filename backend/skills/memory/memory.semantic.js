import { saveMemory, getRecentMemory, getMemoryByType } from "./memory.repository.js";

/**
 * Extração leve (rápida e eficiente)
 */
export async function extractMemory(text) {
  const lower = text.toLowerCase();

  // ======================
  // NOME
  // ======================
  if (lower.includes("meu nome é")) {
    const name = text.split("é").pop().trim();

    if (name.length > 1) {
      saveMemory({
        type: "user",
        key: "nome",
        value: name,
        relevance: 1
      });
    }
  }

  // ======================
  // GOSTOS
  // ======================
  if (lower.includes("eu gosto de")) {
    const value = text.split("de").pop().trim();

    saveMemory({
      type: "preference",
      key: "gosto",
      value,
      relevance: 0.7
    });
  }

  // ======================
  // VOCABULARIO
  // ======================
  if (lower.includes("significa")) {
    saveMemory({
      type: "vocabulary",
      value: text,
      relevance: 0.5
    });
  }

  // ======================
  // SEMPRE salva histórico curto
  // ======================
  saveMemory({
    type: "conversation",
    value: `user: ${text}`,
    relevance: 0.3
  });
}

/**
 * Contexto inteligente
 */
export async function buildContext() {
  const recent = getRecentMemory(8);
  const userData = getMemoryByType("user", 5);
  const preferences = getMemoryByType("preference", 5);
  const vocab = getMemoryByType("vocabulary", 5);

  let context = "";

  if (userData.length) {
    context += `Usuário:\n${userData.join("\n")}\n\n`;
  }

  if (preferences.length) {
    context += `Preferências:\n${preferences.join("\n")}\n\n`;
  }

  if (vocab.length) {
    context += `Vocabulário:\n${vocab.join("\n")}\n\n`;
  }

  if (recent.length) {
    context += `Histórico recente:\n`;
    context += recent.map(r => `- ${r.content}`).join("\n");
  }

  return context.trim();
}