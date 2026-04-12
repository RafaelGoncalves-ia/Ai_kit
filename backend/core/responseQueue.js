import { addMessage } from "../utils/conversationStore.js";
import {
  registerAssistantMessage,
  shouldSuppressAssistantMessage
} from "../utils/assistantMessageGuard.js";
import { getLastSessionId } from "../utils/runtimeState.js";

export default function createResponseQueue(context) {
  function shouldProcessAssistantMemory(source = "unknown") {
    return !/(error|search|system|audio|empty-input)/i.test(String(source || ""));
  }

  function enqueue({
    text,
    speak = true,
    priority = 0,
    source = "unknown",
    allowGeneric = false,
    sessionId = null
  }) {
    const suppression = shouldSuppressAssistantMessage(context, text, {
      source,
      allowGeneric
    });

    if (suppression.blocked) {
      console.warn(
        `[RESPONSE-QUEUE] Mensagem bloqueada source=${source} reason=${suppression.reason}`
      );
      return false;
    }

    registerAssistantMessage(context, text, { source });

    const messageId = `${Date.now()}-${Math.random()}`;
    const resolvedSessionId = sessionId || getLastSessionId(context);

    addMessage({
      id: messageId,
      role: "assistant",
      text,
      groupId: resolvedSessionId
    });

    if (shouldProcessAssistantMemory(source)) {
      void context.invokeTool?.("memory_access", {
        action: "process_ai_response",
        text,
        source: `${source}.memory-response`,
        sessionId: resolvedSessionId
      }).catch((err) => {
        console.warn("[RESPONSE-QUEUE] Falha nao bloqueante ao consolidar memoria:", err?.message || err);
      });
    }

    if (context.core?.eventBus) {
      context.core.eventBus.emit("task:completed", {
        payload: {
          id: messageId,
          result: text
        }
      });

      console.log("[RESPONSE-QUEUE] Texto exibido na UI");
    }

    if (speak && text.length > 0) {
      enqueueToTTSQueue(text, priority, source);
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
