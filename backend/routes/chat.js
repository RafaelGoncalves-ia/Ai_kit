// Rota de chat principal
// Recebe texto do frontend ou voz convertida em texto
// Envia para o brain → retorna resposta estruturada

import express from "express"

const router = express.Router()

export default function createChatRoutes(context) {
  // ======================
  // POST /chat
  // ======================
  router.post("/", async (req, res) => {
    try {
      const { text } = req.body

      if (!text || typeof text !== "string") {
        return res.status(400).json({
          error: "Texto inválido"
        })
      }

      // processa input no brain
      const output = await context.core.brain.processInput(text)

      res.json(output)
    } catch (err) {
      console.error("Erro na rota /chat:", err)
      res.status(500).json({
        error: "Erro interno"
      })
    }
  })

  return router
}