import express from "express";
import { addMessage } from "../utils/conversationStore.js";

/**
 * Chat Routes (API + SSE)
 * - Limpa dependências de frontend legacy
 * - Apenas dispara Orchestrator
 * - Respostas são enviadas via eventBus / SSE
 */

export default function createChatRoutes(context) {
  const router = express.Router();

  // ======================
  // POST /chat
  // ======================
  router.post("/", async (req, res) => {
    try {
      const { text, file } = req.body;

      if ((!text || typeof text !== "string") && !file) {
        return res.status(400).json({
          success: false,
          error: "Texto ou arquivo obrigatório."
        });
      }

      // 🔹 salva mensagem do usuário
      addMessage({
        role: "user",
        text: text || `<Arquivo enviado: ${file}>`,
        timestamp: new Date().toISOString()
      });

      const orchestrator = context.core.orchestrator;
      if (!orchestrator) {
        return res.status(500).json({
          success: false,
          error: "Orchestrator não inicializado."
        });
      }

      // 🔥 dispara processamento no Orchestrator
      await orchestrator.handle({
        input: text || "",
        filePath: file || null,
        source: "user"
      });

      // resposta imediata sem conteúdo (a resposta real sai via SSE/eventBus)
      return res.json({
        success: true
      });

    } catch (err) {
      console.error("Erro crítico na rota /chat:", err);

      return res.status(500).json({
        success: false,
        error: "Erro interno ao processar a mensagem de chat."
      });
    }
  });

  // ======================
  // GET /chat/queue
  // ======================
  router.get("/queue", (req, res) => {
    try {
      const queue = (context.state?.orchestrator?.queue) || [];
      const completed = queue.filter(q => q.status === "done");

      return res.json({
        success: true,
        data: completed
      });

    } catch (err) {
      console.error("Erro ao buscar fila de processamento:", err);
      return res.status(500).json({
        success: false,
        error: "Erro ao acessar fila de tarefas."
      });
    }
  });

  return router;
}