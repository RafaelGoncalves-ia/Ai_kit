/**
 * REALTIME ROUTE (Rota Curta)
 * 
 * Responsabilidades:
 * - Respostas imediatas via SSE
 * - Processamento rápido (sem lógica complexa)
 * - Integração com TTS em fila (tempo real)
 * - Vision (screenshot)
 * - Comandos de sistema simples
 * - Geração de áudio
 * 
 * NÃO FARÁ:
 * - Tarefas multi-step
 * - Processamento em background
 * - Execução autônoma
 */

import { captureScreen } from "../../services/vision.js";
import { pesquisarMundoReal } from "../../services/searchService.js";

export default function createRealtimeRoute(context) {
  const state = context.state;

  // ==========================================
  // EMIT STATUS
  // ==========================================
  function emitStatus(message) {
    if (context.core?.eventBus) {
      context.core.eventBus.emit("action:status", {
        message,
        timestamp: Date.now()
      });
      console.log(`[REALTIME] ${message}`);
    }
  }

  // ==========================================
  // HANDLE REQUEST
  // ==========================================
  /**
   * Processa requisição de usuário na rota curta
   * Retorna resposta imediata com opcional TTS
   */
  async function handle({ input, images = [] }) {
    const text = normalize(input);

    if (!text) {
      context.core.responseQueue.enqueue({
        text: "Fala direito 😒",
        speak: true,
        priority: 1
      });
      return { handled: false };
    }

    try {
      const memorySkill = context.core.skillManager.get("memory");
      const audioSkill = context.core.skillManager.get("audio");

      // ========================
      // PROCESSAMENTO DE MEMÓRIA
      // ========================
      if (memorySkill) {
        await memorySkill.processInput(text);
      }

      const memoryContext = memorySkill
        ? await memorySkill.getContext()
        : "";

      // ========================
      // PARSE DE ÁUDIO
      // ========================
      let audioIntent = null;
      if (audioSkill?.parseCommand) {
        audioIntent = audioSkill.parseCommand(text);
      }

      // Verificar intent pendente
      if (!audioIntent && state.orchestrator?.pendingAudioIntent && audioSkill?.completePendingAudioIntent) {
        audioIntent = audioSkill.completePendingAudioIntent(
          state.orchestrator.pendingAudioIntent,
          text
        );
      }

      // ========================
      // DETECTAR TIPO DE AÇÃO
      // ========================
      const intent = detectIntent(text);

      // ========================
      // AÇÃO 1: GERAÇÃO DE ÁUDIO
      // ========================
      if (audioIntent) {
        return await handleAudioIntent({
          audioIntent,
          text,
          audioSkill,
          memoryContext
        });
      }

      // ========================
      // AÇÃO 2: COMANDO DE SISTEMA
      // ========================
      if (intent.systemCommand) {
        executeSystemCommand(intent.systemCommand);

        context.core.responseQueue.enqueue({
          text: "Já fiz 😏",
          speak: true,
          priority: 1
        });

        return { handled: true, type: "system" };
      }

      // ========================
      // AÇÃO 3: WEB SEARCH
      // ========================
      let searchResult = null;
      if (intent.requiresSearch) {
        try {
          emitStatus("🔍 pesquisando...");

          context.core.responseQueue.enqueue({
            text: "Deixa eu pesquisar sobre isso...",
            speak: true,
            priority: 1
          });

          searchResult = await pesquisarMundoReal(text);

          if (memorySkill) {
            await memorySkill.processAIResponse(`[Pesquisa Web] ${text}\n${searchResult}`);
          }
        } catch (err) {
          console.error("[REALTIME] Erro search:", err);
          searchResult = "Consegui não, internet tá zoada.";
        }
      }

      // ========================
      // AÇÃO 4: VISION (SCREENSHOT)
      // ========================
      if (intent.useVision && images.length === 0) {
        try {
          const img = await captureScreen();
          images.push(img);

          if (memorySkill) {
            await memorySkill.processInput("O usuário pediu para analisar a tela");
          }
        } catch (err) {
          console.error("[REALTIME] Erro vision:", err);
        }
      }

      // ========================
      // AÇÃO 5: RESPOSTA RÁPIDA
      // ========================
      emitStatus("💭 lendo...");

      const response = await generateResponse({
        text,
        memoryContext,
        searchResult,
        images
      });

      // Processar memória da resposta
      if (memorySkill) {
        await memorySkill.processAIResponse(response);
      }

      // Enfileirar resposta com TTS
      context.core.responseQueue.enqueue({
        text: response,
        speak: true,
        priority: 1
      });

      // Limpa status
      emitStatus(null);

      return { handled: true, type: "realtime", response };

    } catch (err) {
      console.error("[REALTIME] Erro crítico:", err);

      context.core.responseQueue.enqueue({
        text: "Algo deu errado 😅",
        speak: false,
        priority: 1
      });

      return { handled: false, error: err.message };
    }
  }

  // ==========================================
  // AUDIO INTENT HANDLER
  // ==========================================
  async function handleAudioIntent({ audioIntent, text, audioSkill, memoryContext }) {
    let quickReply = "Tudo bem, vou gerar o áudio.";
    let queued = false;
    let taskId = null;

    if (audioIntent.missingText && audioIntent.missingVoice) {
      quickReply = "Certo, quero gerar um áudio. Me diga o texto e qual voz você quer usar (masculina, feminina ou locutor).";
    } else if (audioIntent.missingVoice) {
      quickReply = "Qual voz você quer usar para o áudio? Masculina, feminina ou locutor.";
    } else if (audioIntent.missingText) {
      quickReply = "Perfeito, qual texto você quer transformar em áudio?";
    } else {
      const voiceLabel = audioIntent.voiceName || audioIntent.voiceFunction || audioIntent.voiceGenre || "padrão";
      quickReply = `Beleza, estou gerando o áudio com voz ${voiceLabel}.`;
      queued = true;

      // Delega para rota de tarefas
      if (context.core?.routes?.task) {
        taskId = await context.core.routes.task.enqueueAudioTask({
          type: "audio",
          data: audioIntent,
          text,
          memoryContext
        });
      }
    }

    if (audioIntent.missingText || audioIntent.missingVoice) {
      state.orchestrator = state.orchestrator || {};
      state.orchestrator.pendingAudioIntent = audioIntent;
    } else if (state.orchestrator) {
      state.orchestrator.pendingAudioIntent = null;
    }

    context.core.responseQueue.enqueue({
      text: quickReply,
      speak: true,
      priority: 1
    });

    return { handled: true, type: "audio", queued, taskId };
  }

  // ==========================================
  // INTENT DETECTION
  // ==========================================
  function detectIntent(text) {
    const lower = text.toLowerCase();

    const searchTriggers = ["pesquise", "busque", "pesquisa", "noticias", "noticia", "procure", "busca"];
    const visionTriggers = ["olha", "ve", "ver", "tela", "print", "olhar"];
    const longTriggers = ["arquivo", "escreva", "corrija", "crie", "desenvolva"];

    if (lower.includes("abre") || lower.includes("abrir")) {
      if (lower.includes("chrome")) return { systemCommand: "open_chrome" };
    }

    if (lower.includes("clica") || lower.includes("clique")) {
      return { systemCommand: "click" };
    }

    return {
      requiresSearch: searchTriggers.some(t => lower.includes(t)),
      useVision: visionTriggers.some(t => lower.includes(t)),
      requiresLongTask: longTriggers.some(t => lower.includes(t))
    };
  }

  // ==========================================
  // SYSTEM COMMAND
  // ==========================================
  function executeSystemCommand(cmd) {
    switch (cmd) {
      case "open_chrome":
        console.log("[REALTIME] Abrindo Chrome...");
        break;

      case "click":
        console.log("[REALTIME] Click simulado...");
        break;

      default:
        console.log(`[REALTIME] Comando desconhecido: ${cmd}`);
    }
  }

  // ==========================================
  // GENERATE RESPONSE
  // ==========================================
  async function generateResponse({ text, memoryContext, searchResult, images }) {
    const prompt = await buildPrompt({
      text,
      memoryContext,
      searchResult,
      mode: "quick"
    });

    const ai = await context.services.ai.chat(prompt, { images });
    return ai.text || "…";
  }

  // ==========================================
  // PROMPT BUILDER
  // ==========================================
  async function buildPrompt({ text, memoryContext, searchResult, mode }) {
    const { getPersonalityByAura } = await import("../skills/needs/personality.map.js");

    const emotion = state.emotion?.type || "neutral";
    const action = state.routine?.currentAction || "idle";
    const aura = state.needs?.aura ?? 50;
    const auraProfile = getPersonalityByAura(aura);

    const base = context.config?.personality || {
      name: "KIT",
      identity: {
        archetype: "streamer Gen Z",
        style: "internet/gamer",
        tone: "sarcástica, caótica, divertida"
      }
    };

    const identityLayer = `
Você é ${base.name}.

Identidade:
- Arquétipo: ${base.identity?.archetype}
- Estilo: ${base.identity?.style}
- Tom base: ${base.identity?.tone}
`;

    const auraLayer = `
Aura atual: ${aura}/100
Perfil: ${auraProfile.label}

Comportamento:
${auraProfile.prompt}
`;

    const emotionLayer = `
Estado interno:
- Emoção: ${emotion}
- Ação atual: ${action}
`;

    const memoryLayer = memoryContext
      ? `
Memória relevante:
${memoryContext}
`
      : "";

    const searchLayer = searchResult
      ? `
Resultado da pesquisa web:
${searchResult}
`
      : "";

    let instruction = "Responda curto, rápido e com atitude de live.";

    return `
${identityLayer}
${auraLayer}
${emotionLayer}
${memoryLayer}
${searchLayer}

Usuário: ${text}

${instruction}
Resposta:
`;
  }

  // ==========================================
  // UTILITIES
  // ==========================================
  function normalize(text) {
    return text?.trim() || "";
  }

  return {
    handle
  };
}
