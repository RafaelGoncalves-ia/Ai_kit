// Engine responsável por interpretar comandos de texto/voz
// Todas as skills podem registrar comandos aqui

export default function createCommandEngine(context) {
  const commands = []

  // REGISTRAR COMANDO
  function register(command) {
    /**
     * Estrutura esperada:
     * {
     *   name: "ativar tts",
     *   match: (text) => boolean,
     *   execute: async (ctx, text) => {}
     * }
     */
    commands.push(command)
  }

  // PROCESSAR TEXTO
  async function process(text) {
    for (const cmd of commands) {
      try {
        if (cmd.match(text)) {
          return await cmd.execute(context, text)
        }
      } catch (err) {
        console.error("Erro no comando:", cmd.name, err)
      }
    }

    // fallback → IA responde normalmente
    return null
  }

  // DEBUG / LISTAGEM
  function list() {
    return commands.map((c) => c.name)
  }

  return {
    register,
    process,
    list
  }
}