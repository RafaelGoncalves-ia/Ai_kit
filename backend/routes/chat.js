import express from "express";
import { addMessage } from "../utils/conversationStore.js";

/**
 * Chat Routes (API + SSE)
 * - Limpa dependências de frontend legacy
 * - Apenas dispara Orchestrator
 * - Respostas são enviadas via eventBus / SSE
 */

/**
 * Processa bônus de aura se o usuário responde logo após random_talk
 * Janela de tempo: 10 segundos após random_talk disparar
 */
function onUserReply(context) {
  if (!context.lastRandomTalkTime) return; // Nenhum random_talk disparado recentemente

  const now = Date.now();
  const timeSinceRandomTalk = now - context.lastRandomTalkTime;
  const WINDOW = 10 * 1000; // Janela de 10 segundos

  if (timeSinceRandomTalk < WINDOW) {
    // 🎯 Bônus por interação ativa após random_talk
    context.state.kitState.needs.aura += 20;
    if (context.state.kitState.needs.aura > 100) {
      context.state.kitState.needs.aura = 100;
    }
    console.log(`[AuraBonus] +20 aura por resposta após random_talk (total: ${context.state.kitState.needs.aura})`);
  }

  // Limpa o timestamp para evitar múltiplas bonificações
  context.lastRandomTalkTime = null;
}

export default function createChatRoutes(context) {
  const router = express.Router();

  // ======================
  // POST /chat
  // ======================
  router.post("/", async (req, res) => {
    try {
      const { text, file, sessionId } = req.body;
      const activeSessionId = sessionId || "default";

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

      // Processa bônus de aura se respondeu ao random_talk
      onUserReply(context);

      // Atualiza tempo da última interação do usuário
      context.lastUserInteraction = Date.now();
      context.sessions = context.sessions || {};
      context.sessions[activeSessionId] = context.sessions[activeSessionId] || {
        id: activeSessionId,
        memory: {},
        questions: {},
        executions: []
      };

      if (text && context.core?.eventBus) {
        context.core.eventBus.emit("user:response", {
          sessionId: activeSessionId,
          text,
          timestamp: Date.now()
        });
      }

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
        sessionId: activeSessionId,
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
