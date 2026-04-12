import {
  hasUsableAssistantText,
  shouldSuppressAssistantMessage
} from "../../utils/assistantMessageGuard.js";
import { canStartIdleTalk, shouldSilenceAutonomousSource } from "../../utils/runtimeGuards.js";

function ensureContext(context) {
  if (!context || typeof context !== "object") {
    return {
      state: {
        needs: {}
      }
    };
  }

  context.state = context.state || {};
  context.state.needs = context.state.needs || {};
  return context;
}

function getNeedsState(ctx) {
  return ctx?.state?.needs || ctx?.state?.kitState?.needs || null;
}

function getRandomInteractionType() {
  const types = ["casual", "reminder", "topic", "screen_check"];
  const weights = [0.5, 0.2, 0.2, 0.1];

  const random = Math.random();
  let cumulative = 0;

  for (let index = 0; index < types.length; index += 1) {
    cumulative += weights[index];
    if (random <= cumulative) {
      return types[index];
    }
  }

  return "casual";
}

function getRandomInterval() {
  return Math.random() * (20 - 5) * 60 * 1000 + 5 * 60 * 1000;
}

async function buildPrompt(ctx, interactionType) {
  const memoryResult = await ctx.invokeTool("memory_access", {
    action: "get_context",
    source: "randomTalk.memory-context"
  });
  const memoryContext = memoryResult?.data?.text || "";

  switch (interactionType) {
    case "reminder":
      return {
        prompt: `Baseado no contexto de memoria, lembre o usuario de algo relevante ou faca uma pergunta relacionada ao que voces conversaram antes. Gere uma frase curta (1-2 linhas) sem frases genericas de assistente.\n\nContexto:\n${memoryContext}\n\nGere uma lembranca ou pergunta natural e casual.`,
        images: [],
        source: "randomTalk.reminder"
      };
    case "topic":
      return {
        prompt: `Puxe um assunto interessante baseado no contexto ou no que voce sabe sobre o usuario. Gere uma frase curta (1-2 linhas) sem frases genericas de assistente.\n\nContexto:\n${memoryContext}\n\nInicie uma conversa sobre algo relevante ou curioso.`,
        images: [],
        source: "randomTalk.topic"
      };
    case "screen_check": {
      const imageResult = await ctx.invokeTool("analyze_image", {
        capture: true,
        goal: "Comente algo casual sobre a tela do usuario.",
        source: "randomTalk.screen-check.vision"
      });

      return {
        prompt: `Voce esta olhando para a tela do usuario. Comente algo sobre o que ve ou pergunte sobre atividades. Gere uma frase curta (1-2 linhas) sem usar frases genericas como "posso ajudar".\n\nContexto:\n${memoryContext}\n\nFaca um comentario casual sobre a tela ou atividades.`,
        images: imageResult?.data?.image ? [imageResult.data.image] : [],
        source: "randomTalk.screen-check"
      };
    }
    case "casual":
    default: {
      const casualPrompts = [
        "Puxe um comentario curto e casual sem perguntar genericamente se pode ajudar.",
        "Faca uma observacao curta e natural para retomar a conversa.",
        "Gere uma frase breve e espontanea, sem usar frases prontas de assistente."
      ];

      return {
        prompt: casualPrompts[Math.floor(Math.random() * casualPrompts.length)],
        images: [],
        source: "randomTalk.casual"
      };
    }
  }
}

export default {
  name: "randomTalk",

  async init(context) {
    this.context = context;
    this.nextTalkTime = null;
  },

  async execute(input = {}) {
    const ctx = ensureContext(
      input?.context ||
      input?.ctx ||
      (input?.state ? input : null) ||
      this.context
    );

    if (!ctx?.invokeTool) {
      return null;
    }

    const idleState = canStartIdleTalk(ctx);
    if (!idleState.allowed) {
      this.nextTalkTime = null;
      return null;
    }

    const runtimeBlock = shouldSilenceAutonomousSource(ctx, "randomTalk");
    if (runtimeBlock.blocked) {
      this.nextTalkTime = null;
      return null;
    }

    const now = Date.now();

    if (!this.nextTalkTime) {
      this.nextTalkTime = now + getRandomInterval();
      return null;
    }

    if (now < (this.nextTalkTime || 0)) return null;

    if (ctx.lastUserInteraction && (now - ctx.lastUserInteraction) < 2 * 60 * 1000) {
      this.nextTalkTime = null;
      return null;
    }

    const config = ctx.config?.skills?.randomTalk;
    if (config === false) return null;
    if (!ctx.services?.tts?.isEnabled?.()) return null;

    this.nextTalkTime = null;

    try {
      const interactionType = getRandomInteractionType();
      const request = await buildPrompt(ctx, interactionType);
      const response = await ctx.invokeTool("ai_chat", {
        ...request,
        source: request.source || "randomTalk"
      });
      const text = String(response?.data?.text || "").trim();
      const suppression = shouldSuppressAssistantMessage(ctx, text, {
        source: "randomTalk"
      });

      if (!hasUsableAssistantText(text) || suppression.blocked) {
        return null;
      }

      const needs = getNeedsState(ctx);
      if (needs && typeof needs === "object") {
        const nextAura = Number(needs.aura ?? 50) + 2;
        needs.aura = Math.max(0, Math.min(100, nextAura));
      }

      ctx.lastRandomTalkTime = Date.now();

      return {
        text,
        voice: "default",
        type: interactionType,
        timestamp: ctx.lastRandomTalkTime
      };
    } catch (err) {
      console.error("Erro no randomTalk:", err);
      return null;
    }
  }
};
