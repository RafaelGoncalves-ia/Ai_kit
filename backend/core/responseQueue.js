import { addMessage } from "../utils/conversationStore.js";

/**
 * RESPONSE QUEUE (VERSÃO REFATORADA)
 *
 * Responsabilidades:
 * - ✅ Separação: texto exibido IMEDIATO, áudio em background
 * - ✅ Usa skill tts-queue para gerenciar fila de TTS
 * - ✅ Cancelamento automático ao receber nova mensagem
 * - ✅ Apenas orquestra, não duplica lógica TTS
 * - ✅ Emite eventos para UI via eventBus
 */

export default function createResponseQueue(context) {
  function enqueue({ text, speak = true, priority = 0 }) {
    const messageId = Date.now() + "-" + Math.random();

    // 🔥 salva no histórico
    addMessage({
      id: messageId,
      role: "assistant",
      text
    });

    // 🔥 ENVIO IMEDIATO VIA EVENTBUS (texto aparece AGORA na UI)
    if (context.core?.eventBus) {
      context.core.eventBus.emit("task:completed", {
        payload: {
          id: messageId,
          result: text
        }
      });

      console.log("[RESPONSE-QUEUE] ✅ Texto exibido na UI (sem esperar áudio)");
    }

    // 🔊 Enfileira áudio em background (APENAS NA ROTA CURTA)
    // Rota longa não enfileira automaticamente
    if (speak && text.length > 0) {
      enqueueToTTSQueue(text, priority);
    }
  }

  /**
   * Enfileira texto para TTS via skill tts-queue
   * Garante processamento sequencial e cancela fila anterior
   */
  function enqueueToTTSQueue(text, priority = 0) {
    try {
      const ttsQueueSkill = context.core?.skillManager?.get("tts-queue");
      
      if (!ttsQueueSkill) {
        console.warn("[RESPONSE-QUEUE] Skill tts-queue não disponível");
        return;
      }

      // Enfileira texto para processamento sequencial
      const result = ttsQueueSkill.enqueueText(text, priority);
      
      if (result.queued) {
        console.log(
          `[RESPONSE-QUEUE] 🎵 ${result.chunkCount} chunks enfileirados ` +
          `(Total na fila: ${ttsQueueSkill.getQueueStatus().queueLength})`
        );
      }

    } catch (err) {
      console.error("[RESPONSE-QUEUE] Erro ao enfileirar TTS:", err.message);
    }
  }

  /**
   * Cancela fila de TTS (chamado quando nova entrada de usuário chega)
   */
  function cancelTTS() {
    try {
      const ttsQueueSkill = context.core?.skillManager?.get("tts-queue");
      
      if (!ttsQueueSkill) {
        console.warn("[RESPONSE-QUEUE] Skill tts-queue não disponível");
        return;
      }

      const result = ttsQueueSkill.cancelQueue();
      console.log(`[RESPONSE-QUEUE] 🛑 TTS cancelado (${result.itemsRemoved} items removidos)`);

    } catch (err) {
      console.error("[RESPONSE-QUEUE] Erro ao cancelar TTS:", err.message);
    }
  }

  /**
   * Verifica se há áudio sendo processado
   */
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