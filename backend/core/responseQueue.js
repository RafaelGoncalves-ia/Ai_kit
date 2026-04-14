import { addMessage } from "../utils/conversationStore.js";
import {
  registerAssistantMessage,
  shouldSuppressAssistantMessage
} from "../utils/assistantMessageGuard.js";
import { validateConversationMessage } from "../skills/memory/memory.repository.js";
import { getLastSessionId } from "../utils/runtimeState.js";
import { buildSpeechPayload } from "../services/speechFilter.js";

export default function createResponseQueue(context) {
  let lastSpokenNormalized = "";
  let lastSpokenAt = 0;

  function shouldProcessAssistantMemory(source = "unknown") {
    return !/(error|search|system|audio|empty-input)/i.test(String(source || ""));
  }

  function normalizeForSpeechDedup(text = "") {
    return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function enqueue({
    text,
    speakText = "",
    speak = true,
    priority = 0,
    source = "unknown",
    allowGeneric = false,
    sessionId = null,
    userFacing = false
  }) {
    const uiText = String(text || "").trim();
    const suppression = shouldSuppressAssistantMessage(context, uiText, {
      source,
      allowGeneric
    });

    if (suppression.blocked && suppression.reason === "empty_or_invalid") {
      console.warn(
        `[RESPONSE-QUEUE] Mensagem bloqueada source=${source} reason=${suppression.reason}`
      );
      return false;
    }

    if (suppression.blocked) {
      console.warn(
        `[RESPONSE-QUEUE] Bloqueio ignorado para UI source=${source} reason=${suppression.reason}`
      );
    }

    const messageId = `${Date.now()}-${Math.random()}`;
    const resolvedSessionId = sessionId || getLastSessionId(context);
    const shouldDeliverToChat = userFacing === true;
    const shouldSpeak = shouldDeliverToChat && speak === true;
    const conversationValidation = shouldDeliverToChat
      ? validateConversationMessage({
        groupId: resolvedSessionId,
        role: "assistant",
        content: uiText
      })
      : { ok: true, content: uiText, role: "assistant" };

    if (shouldDeliverToChat && !conversationValidation.ok) {
      console.warn(
        `[RESPONSE-QUEUE] Mensagem de assistant bloqueada source=${source} reason=${conversationValidation.reason}`
      );
      return false;
    }

    if (shouldDeliverToChat) {
      registerAssistantMessage(context, conversationValidation.content, { source });

      addMessage({
        id: messageId,
        role: "assistant",
        text: conversationValidation.content,
        groupId: resolvedSessionId
      });
    } else {
      console.log(`[RESPONSE-QUEUE] Mensagem mantida fora do chat source=${source}`);
    }

    if (shouldDeliverToChat && shouldProcessAssistantMemory(source)) {
      void context.invokeTool?.("memory_access", {
        action: "process_ai_response",
        text: conversationValidation.content,
        source: `${source}.memory-response`,
        sessionId: resolvedSessionId
      }).catch((err) => {
        console.warn("[RESPONSE-QUEUE] Falha nao bloqueante ao consolidar memoria:", err?.message || err);
      });
    }

    if (shouldDeliverToChat && context.core?.eventBus) {
      context.core.eventBus.emit("assistant:message", {
        id: messageId,
        role: "assistant",
        text: conversationValidation.content,
        sessionId: resolvedSessionId,
        source
      });

      console.log("[RESPONSE-QUEUE] Texto exibido na UI");
    }

    const speechPayload = buildSpeechPayload({
      uiText: text,
      speakText,
      source
    });

    if (speak && !shouldSpeak) {
      console.log(`[RESPONSE-QUEUE] TTS bloqueado source=${source} userFacing=${userFacing}`);
    }

    if (shouldSpeak && !speechPayload.shouldSpeak) {
      console.log(`[RESPONSE-QUEUE] TTS filtrado source=${source} reason=${speechPayload.reason}`);
    }

    if (shouldSpeak && speechPayload.shouldSpeak) {
      const normalizedSpeech = normalizeForSpeechDedup(speechPayload.text);
      const now = Date.now();
      const repeatedSpeech = normalizedSpeech && normalizedSpeech === lastSpokenNormalized && now - lastSpokenAt < 15000;

      if (repeatedSpeech) {
        console.log(`[RESPONSE-QUEUE] TTS duplicado suprimido source=${source}`);
      } else {
        lastSpokenNormalized = normalizedSpeech;
        lastSpokenAt = now;
        enqueueToTTSQueue(speechPayload.text, priority, source);
      }
    }

    return true;
  }

  function enqueueToTTSQueue(text, priority = 0, source = "unknown") {
    try {
      const ttsQueueSkill = context.core?.skillManager?.get("tts-queue");

      if (!ttsQueueSkill) {
        console.warn("[RESPONSE-QUEUE] Skill tts-queue nao disponivel");
        return;
      }

      const result = ttsQueueSkill.enqueueText(text, priority);

      if (result.queued) {
        console.log(
          `[RESPONSE-QUEUE] TTS enfileirado source=${source} chunks=${result.chunkCount} ` +
          `queueLength=${ttsQueueSkill.getQueueStatus().queueLength}`
        );
      }
    } catch (err) {
      console.error("[RESPONSE-QUEUE] Erro ao enfileirar TTS:", err.message);
    }
  }

  function cancelTTS() {
    try {
      const ttsQueueSkill = context.core?.skillManager?.get("tts-queue");

      if (!ttsQueueSkill) {
        console.warn("[RESPONSE-QUEUE] Skill tts-queue nao disponivel");
        return;
      }

      const result = ttsQueueSkill.cancelQueue();
      console.log(`[RESPONSE-QUEUE] TTS cancelado (${result.itemsRemoved} items removidos)`);
    } catch (err) {
      console.error("[RESPONSE-QUEUE] Erro ao cancelar TTS:", err.message);
    }
  }

  function isTTSBusy() {
    try {
      const ttsQueueSkill = context.core?.skillManager?.get("tts-queue");
      return ttsQueueSkill?.isBusy?.() ?? false;
    } catch {
      return false;
    }
  }

  return {
    enqueue,
    cancelTTS,
    isTTSBusy,
    getQueueStatus: () => {
      const ttsQueueSkill = context.core?.skillManager?.get("tts-queue");
      return ttsQueueSkill?.getQueueStatus?.() ?? { isProcessing: false, queueLength: 0 };
    }
  };
}
