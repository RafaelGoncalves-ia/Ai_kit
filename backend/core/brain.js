// backend/core/brain.js
/**
 * Brain (VERSÃO SIMPLIFICADA)
 * Responsável apenas por gerar respostas via LLM.
 * Toda lógica de decisão agora fica no Orchestrator.
 */

export default function createBrain(context) {
  // ======================
  // GERAR RESPOSTA IA
  // ======================
  async function generate(input, options = {}) {
    const text = normalize(input);

    if (!text) return { text: "", usage: null };

    try {
      const response = await context.invokeTool("ai_chat", {
        prompt: text,
        images: options.images || [],
        options,
        source: options.source || "brain.generate",
        sessionId: options.sessionId || null,
        executionId: options.executionId || null
      });
      return {
        text: response?.data?.text || "",
        usage: response?.data?.raw?.usage || null
      };
    } catch (err) {
      console.error("Erro em brain.generate:", err);
      return {
        text: "Deu ruim aqui... tenta de novo.",
        usage: null
      };
    }
  }

  // ======================
  // NORMALIZA TEXTO
  // ======================
  function normalize(text) {
    return text?.trim() || "";
  }

  return {
    generate
  };
}
