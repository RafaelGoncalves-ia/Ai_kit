/**
 * Brain (VERSÃO SIMPLIFICADA)
 * Responsável apenas por gerar resposta do modelo (LLM)
 * Toda lógica de decisão agora fica no Orchestrator
 */

export default function createBrain(context) {

  // ======================
  // GERAR RESPOSTA IA
  // ======================
  async function generate(input, options = {}) {
    const text = normalize(input)

    if (!text) {
      return {
        text: "",
        usage: null
      }
    }

    try {
      const response = await context.services.ai.chat(text, options)

      return {
        text: response?.text || "",
        usage: response?.usage || null
      }

    } catch (err) {
      console.error("Erro no brain.generate:", err)

      return {
        text: "Deu ruim aqui... tenta de novo.",
        usage: null
      }
    }
  }

  // ======================
  // NORMALIZA TEXTO
  // ======================
  function normalize(text) {
    if (!text) return ""
    return text.trim()
  }

  return {
    generate
  }
}