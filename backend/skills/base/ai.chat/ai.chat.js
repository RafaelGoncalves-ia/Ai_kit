// Skill base de Chat com IA
// Responsável por:
// - integrar IA ao sistema de skills
// - registrar comandos básicos
// - controlar comportamento padrão de resposta

export default {
  name: "base/ai.chat",

  init(context) {
    const { commandEngine } = context.core

    // COMANDO: trocar modelo
    commandEngine.register({
      name: "trocar modelo",

      match: (text) => {
        return text.startsWith("usar modelo ")
      },

      execute: async (ctx, text) => {
        const model = text.replace("usar modelo ", "").trim()

        if (!model) {
          return {
            text: "Qual modelo você quer usar?",
            speak: true
          }
        }

        ctx.services.ai.setModel(model)

        return {
          text: `Agora estou usando o modelo ${model}`,
          speak: true
        }
      }
    })

    // COMANDO: listar modelos
    commandEngine.register({
      name: "listar modelos",

      match: (text) => {
        return text.includes("listar modelos")
      },

      execute: async (ctx) => {
        const models = await ctx.services.ai.listModels()

        if (!models.length) {
          return {
            text: "Não encontrei modelos disponíveis.",
            speak: true
          }
        }

        return {
          text: `Modelos disponíveis: ${models.join(", ")}`,
          speak: false // evita leitura longa
        }
      }
    })
  },

  // HOOK: antes da IA (futuro)
  async before(ctx, input) {
    return input
  },

  // HOOK: depois da IA (futuro)
  async after(ctx, response) {
    return response
  }
}