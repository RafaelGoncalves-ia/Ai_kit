// Skill de comportamento: Conversas aleatórias
// Faz a IA iniciar interações sozinha (sensação de companhia)

export default {
  name: "behavior/randomTalk",

  init(context) {
    const { scheduler } = context.core

    if (!scheduler) return

    // ======================
    // TAREFA AGENDADA
    // ======================
    scheduler.register({
      name: "randomTalk",

      interval: 1000 * 60 * 2, // a cada 2 minutos (ajustável)

      enabled: true,

      async execute(ctx) {
        // evita falar se TTS estiver desligado
        if (!ctx.services.tts?.isEnabled()) return

        // chance de falar (evita ficar irritante)
        const chance = Math.random()
        if (chance > 0.3) return

        const prompts = [
          "Você ainda está aí?",
          "Como está o seu dia?",
          "Quer conversar um pouco?",
          "Posso te ajudar em algo?",
          "Tá tudo bem por aí?",
          "Faz tempo que você não fala comigo 😅"
        ]

        const randomPrompt =
          prompts[Math.floor(Math.random() * prompts.length)]

        try {
          const response = await ctx.services.ai.chat(randomPrompt)

          if (response?.text) {
            await ctx.services.tts.speak(response.text)
          }
        } catch (err) {
          console.error("Erro no randomTalk:", err)
        }
      }
    })
  }
}