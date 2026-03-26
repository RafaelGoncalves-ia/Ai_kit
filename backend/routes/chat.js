import express from "express"

export default function createChatRoutes(context) {
  const router = express.Router()

  // POST /chat
  router.post("/", async (req, res) => {
    try {
      const { text } = req.body

      if (!text || typeof text !== "string") {
        return res.status(400).json({
          error: "Texto inválido"
        })
      }

      const orchestrator = context.core.orchestrator

      if (!orchestrator) {
        return res.status(500).json({
          error: "Orchestrator não inicializado"
        })
      }

      // PROCESSA INPUT
      const result = await orchestrator.handle({
        input: text,
        context
      })

      return res.json({
        success: true,
        ...result
      })

    } catch (err) {
      console.error("Erro na rota /chat:", err)

      return res.status(500).json({
        success: false,
        error: "Erro interno"
      })
    }
  })

  // GET /chat/queue
  // usado pelo frontend pra buscar respostas longas prontas
  router.get("/queue", (req, res) => {
    try {
      const queue = context.state.orchestrator.queue || []

      // retorna apenas respostas prontas
      const completed = queue.filter(q => q.status === "done")

      return res.json({
        success: true,
        data: completed
      })

    } catch (err) {
      console.error("Erro ao buscar fila:", err)

      return res.status(500).json({
        success: false,
        error: "Erro interno"
      })
    }
  })

  return router
}