/*** Skill AI Chat */

export default {
  name: "ai.chat",

  commands: ["falar", "perguntar"],

  /*** Inicialização  */
  async init(context) {
    console.log("Skill AI Chat inicializada");

    // exemplo: registrar algo no contexto
    context.chatEnabled = true;
  },

  /*** Execução da skill   */
  async execute({ input, context }) {
    const message = input?.message || "";

    return {
      text: `Você disse: ${message}`,
    };
  }
};