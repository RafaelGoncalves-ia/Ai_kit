// Skill Mestre: Comenta a atividade do usuário
// Depende de:
// - behavior/randomTalk
// - base/tts
// - future: skill de pesquisa
// Objetivo: dar sensação de companhia pro usuário

export default {
  name: "master/commentActivity",

  // Depende de outras skills
  dependsOn: ["behavior/randomTalk", "base/tts"],

  init(context) {
    const { scheduler, skillManager } = context.core

    if (!scheduler) return

    // ======================
    // JOB PRINCIPAL
    // ======================
    scheduler.register({
      name: "commentActivity",
      interval: 1000 * 60 * 5, // a cada 5 minutos
      enabled: true,

      async execute(ctx) {
        // valida dependências
        const ttsSkill = skillManager.get("base/tts")
        const talkSkill = skillManager.get("behavior/randomTalk")

        if (!ttsSkill?.enabled || !talkSkill?.enabled) return

        // chance de comentar
        if (Math.random() > 0.4) return

        // prompts básicos de exemplo
        const prompts = [
          "Olha que interessante o que você está fazendo!",
          "Será que você quer ajuda com isso?",
          "Isso parece divertido 😄",
          "Posso te mostrar algo sobre isso?",
          "Você já pensou em comparar opções antes de decidir?"
        ]

        const prompt =
          prompts[Math.floor(Math.random() * prompts.length)]

        try {
          const response = await ctx.services.ai.chat(prompt)

          if (response?.text) {
            await ctx.services.tts.speak(response.text)
          }
        } catch (err) {
          console.error("Erro em commentActivity:", err)
        }
      }
    })
  }
}