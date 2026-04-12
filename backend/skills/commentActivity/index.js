import {
  hasUsableAssistantText,
  shouldSuppressAssistantMessage
} from "../../utils/assistantMessageGuard.js";
import { shouldSilenceAutonomousSource } from "../../utils/runtimeGuards.js";

export default {
  name: "commentActivity",
  commands: ["falar", "perguntar"],

  async init(context) {
    this.context = context;
    this.nextCommentAt = Date.now() + 5 * 60 * 1000;
  },

  async execute({ context }) {
    const ctx = context || this.context;
    if (!ctx) return null;

    const runtimeBlock = shouldSilenceAutonomousSource(ctx, "activity-comment");
    if (runtimeBlock.blocked) {
      return null;
    }

    const now = Date.now();
    if (now < (this.nextCommentAt || 0)) return null;
    this.nextCommentAt = now + 5 * 60 * 1000;

    if (Math.random() > 0.4) return null;

    const prompts = [
      "Comente de forma curta e especifica a atividade atual do usuario, sem usar frases genericas de assistente.",
      "Faca uma observacao breve sobre o que o usuario parece estar fazendo, sem dizer que pode ajudar com qualquer coisa.",
      "Gere um comentario curto sobre a atividade atual, evitando frases prontas como 'claro, posso ajudar'."
    ];

    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    const response = await ctx.invokeTool("ai_chat", {
      prompt,
      source: "activity-comment"
    });
    const text = String(response?.data?.text || "").trim();
    const suppression = shouldSuppressAssistantMessage(ctx, text, {
      source: "activity-comment"
    });

    if (!hasUsableAssistantText(text) || suppression.blocked) {
      return null;
    }

    return {
      text,
      activity: "general"
    };
  }
};
