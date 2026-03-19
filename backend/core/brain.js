// Cérebro principal da aplicação
// Decide o fluxo:
// 1. Verifica comandos
// 2. Usa IA (chat)
// 3. Dispara TTS (se ativo)

export default function createBrain(context) {
  // ======================
  // PROCESSAR INPUT
  // ======================
  async function processInput(input) {
    const text = normalize(input)

    // 1. Tenta comandos primeiro
    const commandResult = await context.core.commandEngine.process(text)

    if (commandResult) {
      return handleOutput(commandResult)
    }

    // 2. Fallback → IA
    const aiResponse = await context.services.ai.chat(text)

    return handleOutput(aiResponse)
  }

  // ======================
  // NORMALIZA TEXTO
  // ======================
  function normalize(text) {
    if (!text) return ""
    return text.toLowerCase().trim()
  }

  // ======================
  // SAÍDA PADRÃO
  // ======================
  async function handleOutput(response) {
    /**
     * Formato padrão esperado:
     * {
     *   text: "resposta da IA",
     *   speak: true/false (opcional)
     * }
     */

    if (!response) {
      return {
        text: "Não entendi direito...",
        speak: false
      }
    }

    // garante formato
    const output = {
      text: response.text || "",
      speak: response.speak ?? false
    }

    // TTS se habilitado
    if (output.speak && context.services.tts) {
      try {
        await context.services.tts.speak(output.text)
      } catch (err) {
        console.error("Erro no TTS:", err)
      }
    }

    return output
  }

  return {
    processInput
  }
}