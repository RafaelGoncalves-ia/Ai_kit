// Skill de comportamento: Conversas aleatórias
// Faz a IA iniciar interações sozinha (sensação de companhia)

import { captureScreen } from "../../services/vision.js";

/**
 * Garante que context.needs existe
 */
function ensureContext(context) {
  if (!context.needs) {
    context.needs = {};
  }
}

export default {
  name: "randomTalk",

  init(context) {
    const { scheduler } = context.core;

    if (!scheduler) return;

    let nextTalkTime = Date.now() + getRandomInterval();

    // TAREFA AGENDADA
    scheduler.register({
      name: "randomTalk",
      priority: 1,
      enabled: true,
      async execute(ctx) {
        ensureContext(ctx);
        const now = Date.now();

        // Verifica se é hora de falar
        if (now < nextTalkTime) return;

        // Verifica se o usuário interagiu recentemente (últimos 2 minutos)
        if (ctx.lastUserInteraction && (now - ctx.lastUserInteraction) < 2 * 60 * 1000) {
          nextTalkTime = now + getRandomInterval(); // adia
          return;
        }

        // Verifica se está habilitado na config
        const config = ctx.config?.skills?.randomTalk;
        if (config === false) return;

        // Evita falar se TTS estiver desligado
        if (!ctx.services.tts?.isEnabled()) return;

        nextTalkTime = now + getRandomInterval();

        try {
          // Obtém contexto de memória
          const memorySkill = ctx.core.skillManager.get("memory");
          const memoryContext = memorySkill ? await memorySkill.getContext() : "";

          // Decide tipo de interação aleatória
          const interactionType = getRandomInteractionType();

          let prompt = "";
          let useVision = false;

          switch (interactionType) {
            case "reminder":
              prompt = `Baseado no contexto de memória, lembre o usuário de algo relevante ou faça uma pergunta relacionada ao que vocês conversaram antes. Gere uma frase curta (1-2 linhas).

Contexto:
${memoryContext}

Gere uma lembrança ou pergunta natural e casual.`;
              break;

            case "topic":
              prompt = `Puxe um assunto interessante baseado no contexto ou no que você sabe sobre o usuário. Gere uma frase curta (1-2 linhas).

Contexto:
${memoryContext}

Inicie uma conversa sobre algo relevante ou curioso.`;
              break;

            case "screen_check":
              prompt = `Você está olhando para a tela do usuário. Comente algo sobre o que vê ou pergunte sobre atividades. Gere uma frase curta (1-2 linhas).

Contexto:
${memoryContext}

Faça um comentário casual sobre a tela ou atividades.`;
              useVision = true;
              break;

            case "casual":
            default:
              const casualPrompts = [
                "Você ainda está aí?",
                "Como está o seu dia?",
                "Quer conversar um pouco?",
                "Posso te ajudar em algo?",
                "Tá tudo bem por aí?",
                "Faz tempo que você não fala comigo"
              ];
              prompt = casualPrompts[Math.floor(Math.random() * casualPrompts.length)];
              break;
          }

          let images = [];
          if (useVision) {
            try {
              const img = await captureScreen();
              images.push(img);
            } catch (err) {
              console.error("[RandomTalk] Erro na visão:", err);
            }
          }

          const response = await ctx.services.ai.chat(prompt, { images });

          if (response?.text) {
            // Processa memória da resposta da IA
            if (memorySkill) {
              await memorySkill.processAIResponse(response.text);
            }

            // 🎯 Ganho simbólico de aura ao disparar random_talk
            ctx.state.kitState.needs.aura += 2;
            if (ctx.state.kitState.needs.aura > 100) {
              ctx.state.kitState.needs.aura = 100;
            }

            // Rastreia o tempo do último random_talk (para onUserReply)
            ctx.lastRandomTalkTime = Date.now();

            // Fala a resposta
            await ctx.services.tts.speak(response.text);

            // Envia via eventBus para UI
            ctx.core.eventBus.emit("randomTalk", {
              text: response.text,
              type: interactionType,
              timestamp: ctx.lastRandomTalkTime
            });
          }
        } catch (err) {
          console.error("Erro no randomTalk:", err);
        }
      }
    });

    console.log("RandomTalk skill inicializada");
  }
};

function getRandomInteractionType() {
  const types = ["casual", "reminder", "topic", "screen_check"];
  const weights = [0.5, 0.2, 0.2, 0.1]; // casual mais frequente

  const random = Math.random();
  let cumulative = 0;

  for (let i = 0; i < types.length; i++) {
    cumulative += weights[i];
    if (random <= cumulative) {
      return types[i];
    }
  }

  return "casual";
}

function getRandomInterval() {
  // 5-20 minutos em ms
  return Math.random() * (20 - 5) * 60 * 1000 + 5 * 60 * 1000;
}