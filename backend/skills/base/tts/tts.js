// Skill base de TTS (voz)
// Responsável por:
// - ativar/desativar voz
// - controlar comportamento de fala
// - integrar com service de TTS

export default {
  name: "base/tts",

  init(context) {
    const { commandEngine } = context.core

    // COMANDO: ativar voz
    commandEngine.register({
      name: "ativar voz",

      match: (text) => {
        return text.includes("ativar voz") || text.includes("fala comigo")
      },

      execute: async (ctx) => {
        ctx.services.tts.enable()

        return {
          text: "Ok, agora vou falar com você.",
          speak: true
        }
      }
    })

    // COMANDO: desativar voz
    commandEngine.register({
      name: "desativar voz",

      match: (text) => {
        return text.includes("desativar voz") || text.includes("fica quieta")
      },

      execute: async (ctx) => {
        ctx.services.tts.disable()

        return {
          text: "Certo, vou ficar em silêncio.",
          speak: false
        }
      }
    })

    // COMANDO: status voz
    commandEngine.register({
      name: "status voz",

      match: (text) => {
        return text.includes("voz está ativa") || text.includes("status da voz")
      },

      execute: async (ctx) => {
        const active = ctx.services.tts.isEnabled()

        return {
          text: active
            ? "A voz está ativada."
            : "A voz está desativada.",
          speak: true
        }
      }
    })
  },

  // HOOK: depois da resposta
  async after(ctx, response) {
    // força speak = false se TTS estiver desativado
    if (!ctx.services.tts.isEnabled()) {
      return {
        ...response,
        speak: false
      }
    }

    return response
  }
}