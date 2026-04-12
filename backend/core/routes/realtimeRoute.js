import {
  hasUsableAssistantText,
  shouldSuppressAssistantMessage
} from "../../utils/assistantMessageGuard.js";
import { getRouteBehavior } from "../personalityConfig.js";
import { ensureOrchestratorRuntime } from "../../utils/runtimeState.js";

export default function createRealtimeRoute(context) {
  const state = context.state;
  const runtime = ensureOrchestratorRuntime(context);
  const FRIENDLY_LLM_FALLBACK = "Demorei demais para processar isso 😵‍💫 tenta novamente ou simplifica o pedido.";

  function emitStatus(message) {
    if (!context.core?.eventBus) {
      return;
    }

    context.core.eventBus.emit("action:status", {
      message,
      timestamp: Date.now()
    });

    if (message) {
      console.log(`[REALTIME] ${message}`);
    } else {
      console.log("[REALTIME] status cleared");
    }
  }

  function ensureSession(sessionId = "default") {
    context.sessions = context.sessions || {};
    context.sessions[sessionId] = context.sessions[sessionId] || {
      id: sessionId,
      memory: {},
      questions: {},
      executions: []
    };

    context.sessions[sessionId].memory = context.sessions[sessionId].memory || {};
    return context.sessions[sessionId];
  }

  function normalize(text) {
    return text?.trim() || "";
  }

  function truncateSection(value, maxChars, suffix = "\n[trecho truncado]") {
    const text = String(value || "").trim();
    if (!text || text.length <= maxChars) {
      return text;
    }

    return `${text.slice(0, Math.max(0, maxChars - suffix.length)).trim()}${suffix}`;
  }

  function isLLMTimeoutError(err) {
    if (!err) return false;
    return err.code === "LLM_TIMEOUT" || err.code === "LLM_ERROR_TIMEOUT";
  }

  function isLLMFailureError(err) {
    if (!err) return false;
    return err.code === "LLM_TIMEOUT" || err.code === "LLM_ERROR" || err.code === "LLM_ERROR_TIMEOUT";
  }

  function isVisionFailureError(err) {
    if (!err) return false;
    return err.code === "VISION_TIMEOUT" || err.code === "VISION_UNAVAILABLE";
  }

  function buildFriendlyRealtimeReply(kind = "generic") {
    if (kind === "vision") {
      return "Demorei demais para analisar a imagem ou a tela. Tenta de novo ou manda algo mais direto.";
    }

    return FRIENDLY_LLM_FALLBACK;
  }

  function detectIntent(text) {
    const lower = String(text || "").toLowerCase();
    const includesTerm = (term) => {
      if (term.includes(" ")) {
        return lower.includes(term);
      }

      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(lower);
    };

    const searchTriggers = ["pesquise", "busque", "pesquisa", "noticias", "noticia", "procure", "busca"];
    const visionTriggers = ["olha", "ve", "ver", "tela", "print", "olhar", "screenshot"];
    const legacyScreenCommandPatterns = [
      /\b(olha|olhar|ve|ver|mostra|mostrar|analisa|analisar|descreve|descrever)\b.*\b(tela|print|screenshot)\b/i,
      /\b(tela|print|screenshot)\b.*\b(olha|olhar|ve|ver|mostra|mostrar|analisa|analisar|descreve|descrever)\b/i
    ];
    const imageContextTriggers = [
      "imagem",
      "foto",
      "print",
      "tela",
      "screenshot",
      "descreva a imagem",
      "analise a imagem",
      "descreva o print"
    ];
    const longTriggers = ["arquivo", "escreva", "corrija", "crie", "desenvolva"];

    if (lower.includes("abre") || lower.includes("abrir")) {
      if (lower.includes("chrome")) return { systemCommand: "open_chrome" };
    }

    if (lower.includes("clica") || lower.includes("clique")) {
      return { systemCommand: "click" };
    }

    const legacyScreenCommand = legacyScreenCommandPatterns.some((pattern) => pattern.test(lower));

    return {
      requiresSearch: searchTriggers.some((trigger) => includesTerm(trigger)),
      useVision: legacyScreenCommand || visionTriggers.some((trigger) => includesTerm(trigger)),
      legacyScreenCommand,
      requiresImageContext: imageContextTriggers.some((trigger) => includesTerm(trigger)),
      requiresLongTask: longTriggers.some((trigger) => includesTerm(trigger))
    };
  }

  function rememberSessionMedia(session, media = {}) {
    const memory = session.memory || {};
    const now = Date.now();

    memory.lastMediaPath = media.imagePath || media.mediaPath || memory.lastMediaPath || null;
    memory.lastMediaType = media.mediaType || memory.lastMediaType || "image";
    memory.lastMediaAt = now;
    memory.pendingMedia = Boolean(memory.lastMediaPath);

    if (memory.lastMediaType === "screenshot") {
      memory.lastScreenshotPath = memory.lastMediaPath;
      memory.lastScreenshotAt = now;
    } else {
      memory.lastImagePath = memory.lastMediaPath;
      memory.lastImageAt = now;
    }

    memory.currentVisualContext = {
      path: memory.lastMediaPath,
      type: memory.lastMediaType,
      capturedAt: now
    };

    session.memory = memory;
  }

  async function resolveMediaContext({
    session,
    text,
    images = [],
    filePath = null,
    screenshotPath = null,
    intent
  }) {
    const memory = session.memory || {};
    let analysisResult = null;
    let source = null;
    let consumePendingMedia = false;
    const shouldKeepPendingAfterUse = !text && Boolean(filePath || screenshotPath || images.length > 0);

    if (filePath) {
      source = "realtime.image-upload";
      analysisResult = await context.invokeTool("analyze_image", {
        imagePath: filePath,
        goal: text || "Descreva a imagem de forma objetiva, sem inventar.",
        source,
        sessionId: session.id
      });
    } else if (screenshotPath) {
      source = "realtime.screenshot-path";
      analysisResult = await context.invokeTool("analyze_image", {
        imagePath: screenshotPath,
        goal: text || "Descreva a tela de forma objetiva, sem inventar.",
        source,
        sessionId: session.id,
        mediaType: "screenshot"
      });
    } else if (images.length > 0) {
      source = "realtime.image-inline";
      analysisResult = await context.invokeTool("analyze_image", {
        image: images[0],
        goal: text || "Descreva a imagem de forma objetiva, sem inventar.",
        source,
        sessionId: session.id
      });
    } else if (memory.pendingMedia && memory.lastMediaPath) {
      source = "realtime.session-media";
      consumePendingMedia = true;
      analysisResult = await context.invokeTool("analyze_image", {
        imagePath: memory.lastMediaPath,
        goal: text || "Descreva a imagem de forma objetiva, sem inventar.",
        source,
        sessionId: session.id,
        mediaType: memory.lastMediaType || "image"
      });
    } else if (intent.useVision) {
      source = "realtime.screenshot-capture";
      console.log(`[REALTIME] Comando legado de tela acionado (sessionId=${session.id})`);
      analysisResult = await context.invokeTool("analyze_image", {
        capture: true,
        goal: text || "Descreva a tela de forma objetiva, sem inventar.",
        source,
        sessionId: session.id,
        mediaType: "screenshot"
      });
    }

    if (!analysisResult) {
      return null;
    }

    if (analysisResult.status !== "ok") {
      const error = new Error(analysisResult.error || "Falha ao analisar imagem");
      error.code = analysisResult?.data?.kind === "timeout"
        ? "VISION_TIMEOUT"
        : "VISION_UNAVAILABLE";
      error.cause = analysisResult;
      throw error;
    }

    if (consumePendingMedia) {
      session.memory.pendingMedia = false;
    }

    rememberSessionMedia(session, {
      imagePath: analysisResult.data?.imagePath || filePath || screenshotPath || null,
      mediaType: analysisResult.data?.mediaType || (screenshotPath ? "screenshot" : "image")
    });

    if ((analysisResult.data?.mediaType || (screenshotPath ? "screenshot" : "image")) === "screenshot") {
      console.log(
        `[REALTIME] Screenshot salvo em ${session.memory.lastScreenshotPath} (sessionId=${session.id})`
      );
    }

    if (!shouldKeepPendingAfterUse) {
      session.memory.pendingMedia = false;
    }

    return {
      summary: analysisResult.data?.summary || "",
      image: analysisResult.data?.image || null,
      imagePath: analysisResult.data?.imagePath || null,
      mediaType: analysisResult.data?.mediaType || "image"
    };
  }

  async function handle({ input, images = [], sessionId = "default", filePath = null, screenshotPath = null }) {
    const text = normalize(input);
    const session = ensureSession(sessionId);
    const intent = detectIntent(text);
    const hasIncomingMedia = Boolean(filePath || screenshotPath || images.length > 0 || session.memory?.pendingMedia);

    if (!text && !hasIncomingMedia) {
      context.core.responseQueue.enqueue({
        text: "Preciso de texto ou de uma imagem valida para continuar.",
        speak: false,
        priority: 1,
        source: "realtime-empty-input",
        allowGeneric: true,
        sessionId,
        userFacing: true
      });
      return { handled: false };
    }

    try {
      const audioSkill = context.core.skillManager.get("audio");

      const memoryResult = await context.invokeTool("memory_access", {
        action: "get_context",
        source: "realtime.memory-context",
        sessionId,
        query: text
      });
      const memoryContext = memoryResult?.data?.text || "";

      let audioIntent = null;
      if (audioSkill?.parseCommand && text) {
        audioIntent = audioSkill.parseCommand(text);
      }

      if (!audioIntent && runtime.pendingAudioIntent && audioSkill?.completePendingAudioIntent && text) {
        audioIntent = audioSkill.completePendingAudioIntent(
          runtime.pendingAudioIntent,
          text
        );
      }

      if (audioIntent) {
        return await handleAudioIntent({
          audioIntent,
          text,
          memoryContext,
          sessionId
        });
      }

      if (intent.systemCommand) {
        executeSystemCommand(intent.systemCommand);

        context.core.responseQueue.enqueue({
          text: "Ja fiz.",
          speak: true,
          priority: 1,
          source: "realtime-system",
          allowGeneric: true,
          sessionId,
          userFacing: true
        });

        return { handled: true, type: "system" };
      }

      let searchResult = null;
      if (intent.requiresSearch && text) {
        try {
          emitStatus("pesquisando...");

          context.core.responseQueue.enqueue({
            text: "Deixa eu pesquisar sobre isso...",
            speak: true,
            priority: 1,
            source: "realtime-search",
            allowGeneric: true,
            sessionId,
            userFacing: true
          });

          const searchToolResult = await context.invokeTool("web_search", { query: text });
          searchResult = searchToolResult?.data?.text || null;
        } catch (err) {
          console.error("[REALTIME] Erro search:", err);
          searchResult = "Nao consegui acessar a pesquisa agora.";
        }
      }

      if (intent.requiresImageContext && !hasIncomingMedia && !intent.useVision) {
        throw new Error("Voce pediu analise de imagem, mas nao existe imagem valida no contexto.");
      }

      if (intent.legacyScreenCommand && !filePath && !screenshotPath && images.length === 0) {
        emitStatus("capturando tela...");
      } else {
        emitStatus("lendo...");
      }

      const mediaContext = await resolveMediaContext({
        session,
        text,
        images,
        filePath,
        screenshotPath,
        intent
      });

      if (intent.requiresImageContext && !mediaContext) {
        throw new Error("Nao encontrei imagem valida para analisar.");
      }

      emitStatus("lendo...");

      const response = await generateResponse({
        text,
        memoryContext,
        searchResult,
        mediaContext,
        sessionId
      });

      const queued = context.core.responseQueue.enqueue({
        text: response,
        speak: true,
        priority: 1,
        source: "realtime",
        sessionId,
        userFacing: true
      });

      if (!queued) {
        throw new Error("Resposta bloqueada pelos filtros da realtime");
      }

      emitStatus(null);

      return {
        handled: true,
        type: "realtime",
        response,
        media: mediaContext ? {
          imagePath: mediaContext.imagePath,
          mediaType: mediaContext.mediaType
        } : null
      };
    } catch (err) {
      console.error("[REALTIME] Erro critico:", err);
      emitStatus(null);

      if (isLLMFailureError(err) || err?.message?.includes("LLM demorou para responder")) {
        const fallbackText = buildFriendlyRealtimeReply("generic");

        context.core.responseQueue.enqueue({
          text: fallbackText,
          speak: true,
          priority: 1,
          source: "realtime",
          allowGeneric: true,
          sessionId,
          userFacing: true
        });

        return {
          handled: true,
          type: "realtime",
          response: fallbackText,
          fallback: true
        };
      }

      if (isVisionFailureError(err)) {
        const fallbackText = buildFriendlyRealtimeReply("vision");

        context.core.responseQueue.enqueue({
          text: fallbackText,
          speak: true,
          priority: 1,
          source: "realtime",
          allowGeneric: true,
          sessionId,
          userFacing: true
        });

        return {
          handled: true,
          type: "realtime",
          response: fallbackText,
          fallback: true
        };
      }

      context.core.responseQueue.enqueue({
        text: err.message || "Nao consegui responder de forma util agora.",
        speak: false,
        priority: 1,
        source: "realtime-error",
        allowGeneric: true,
        sessionId,
        userFacing: true
      });

      return { handled: false, error: err.message };
    }
  }

  async function handleAudioIntent({ audioIntent, text, memoryContext, sessionId }) {
    let quickReply = "Tudo bem, vou gerar o audio.";
    let queued = false;
    let taskId = null;

    if (audioIntent.missingText && audioIntent.missingVoice) {
      quickReply = "Certo, quero gerar um audio. Me diga o texto e qual voz voce quer usar (masculina, feminina ou locutor).";
    } else if (audioIntent.missingVoice) {
      quickReply = "Qual voz voce quer usar para o audio? Masculina, feminina ou locutor.";
    } else if (audioIntent.missingText) {
      quickReply = "Perfeito, qual texto voce quer transformar em audio?";
    } else {
      const voiceLabel = audioIntent.voiceName || audioIntent.voiceFunction || audioIntent.voiceGenre || "padrao";
      quickReply = `Beleza, estou gerando o audio com voz ${voiceLabel}.`;
      queued = true;

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
      runtime.pendingAudioIntent = audioIntent;
    } else {
      runtime.pendingAudioIntent = null;
    }

    context.core.responseQueue.enqueue({
      text: quickReply,
      speak: true,
      priority: 1,
      source: "realtime-audio",
      allowGeneric: true,
      sessionId,
      userFacing: true
    });

    return { handled: true, type: "audio", queued, taskId };
  }

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

  async function generateResponse({ text, memoryContext, searchResult, mediaContext, sessionId }) {
    const prompt = await buildPrompt({
      text,
      memoryContext,
      searchResult,
      mediaContext,
      usePersona: true
    });

    const ai = await context.invokeTool("ai_chat", {
      prompt,
      images: mediaContext?.image ? [mediaContext.image] : [],
      source: "realtime",
      sessionId
    });

    if (ai?.status !== "ok") {
      const error = new Error(ai?.error || "Falha ao gerar resposta realtime");
      error.code = ai?.data?.kind === "timeout" ? "LLM_TIMEOUT" : "LLM_ERROR";
      error.cause = ai;
      throw error;
    }

    const responseText = String(ai?.data?.text || "").trim();
    const suppression = shouldSuppressAssistantMessage(context, responseText, {
      source: "realtime"
    });

    if (!hasUsableAssistantText(responseText) || suppression.blocked) {
      throw new Error(`Falha ao gerar resposta realtime: ${suppression.reason || "empty_response"}`);
    }

    return responseText;
  }

  async function buildPrompt({ text, memoryContext, searchResult, mediaContext, usePersona = true }) {
    const { getPersonalityByAura } = await import("../skills/needs/personality.map.js");
    const personalityConfig = context.config?.personality || {};
    const base = personalityConfig.base || {};
    const routeBehavior = getRouteBehavior("realtime");
    const identity = base.identity || {};
    const promptSections = base.promptSections || {};

    const emotion = usePersona ? state.emotion?.type || "neutral" : "neutral";
    const action = usePersona ? state.routine?.currentAction || "idle" : "idle";
    const aura = usePersona ? state.needs?.aura ?? 50 : 50;
    const auraProfile = getPersonalityByAura(aura);

    const hasVisualContext = Boolean(mediaContext);
    const effectiveUserText = truncateSection(
      text || "Descreva a imagem de forma objetiva, sem inventar.",
      hasVisualContext ? 1600 : 2400
    );
    const trimmedMemoryContext = truncateSection(memoryContext, hasVisualContext ? 1800 : 2800);
    const trimmedSearchResult = truncateSection(searchResult, 1800);
    const trimmedMediaSummary = truncateSection(mediaContext?.summary || "", 1200);
    const realtimeInstructions = (routeBehavior.instructions || [])
      .map((instruction) => `- ${instruction}`)
      .join("\n");

    const identityLayer = usePersona ? `
Voce e ${base.name || "KIT"}.

${promptSections.identityTitle || "Identidade"}:
- Arquetipo: ${identity.archetype || "assistente conversacional"}
- Estilo: ${identity.style || "conversa direta"}
- Tom base: ${identity.baseTone || "natural"}
- Identidade de genero: ${identity.genderIdentity || "feminina"}
- Pronomes: ${identity.pronouns || ""}
- Vibe: ${identity.presentation || "direta e falada"}
- Relacao com o usuario: ${identity.relationship || "parceira de conversa"}

Guardrails de conversa:
${realtimeInstructions}
` : "";

    const auraLayer = usePersona ? `
${promptSections.behaviorTitle || "Comportamento"}:
Aura atual: ${aura}/100
Perfil: ${auraProfile.label}

Comportamento:
${auraProfile.prompt}
` : "";

    const emotionLayer = usePersona ? `
${promptSections.internalStateTitle || "Estado interno"}:
- Emocao: ${emotion}
- Acao atual: ${action}
` : "";

    const memoryLayer = trimmedMemoryContext ? `
${promptSections.memoryTitle || "Memoria relevante"}:
${trimmedMemoryContext}
` : "";

    const searchLayer = trimmedSearchResult ? `
${promptSections.searchTitle || "Resultado da pesquisa web"}:
${trimmedSearchResult}
` : "";

    const mediaLayer = mediaContext ? `
${promptSections.visualContextTitle || "Contexto visual analisado"}:
- Tipo: ${mediaContext.mediaType}
- Caminho: ${mediaContext.imagePath || "sem-caminho"}
- Analise objetiva: ${trimmedMediaSummary}

Use esse contexto visual junto com a instrucao textual. Se a analise visual estiver insuficiente, diga isso explicitamente e nao invente.
` : "";

    return `
${identityLayer}
${auraLayer}
${emotionLayer}
${memoryLayer}
${searchLayer}
${mediaLayer}

Instrucao do usuario:
${effectiveUserText}

Evite respostas genericas como "claro, posso ajudar" ou "como posso ajudar voce hoje".
Se houver imagem ou tela no contexto, responda com base nela.
Resposta:
`;
  }

  return {
    handle
  };
}
