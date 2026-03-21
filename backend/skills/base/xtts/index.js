import { waitForXTTS, speak } from "../../../services/xttsClient.js"
import { ensureRunning } from "./xtts.js"

export default {
    name: "xtts",
    description: "Voz natural com XTTS",
    active: true,

    async init() {
        console.log("[Skill XTTS] carregada")
        // Inicia o servidor XTTS
        ensureRunning()
        // Aguarda estar pronto (não lança erro se timeout)
        const ready = await waitForXTTS()
        if (!ready) {
            console.warn("[Skill XTTS] Servidor não ficou pronto, TTS pode falhar")
        }
    },

    // =========================
    // RESPOSTA FINAL
    // =========================
    async onAIResponse(context, response) {
        try {
            await speak(response)
        } catch (err) {
            console.error("[Skill XTTS] Erro ao falar:", err)
            throw err // Re-throw para que brain.js use TTS padrão
        }
    }
}