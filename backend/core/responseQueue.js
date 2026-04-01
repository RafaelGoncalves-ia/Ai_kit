import { addMessage } from "../utils/conversationStore.js";

/**
 * RESPONSE QUEUE (VERSÃO OTIMIZADA)
 *
 * - Remove dependência de global.sendSSE ❌
 * - Usa apenas eventBus (fluxo padrão) ✅
 * - Evita duplicação de eventos
 * - Mantém TTS desacoplado
 */

export default function createResponseQueue(context) {
  const queue = [];
  let isSpeaking = false;

  function enqueue({ text, speak = true, priority = 0 }) {
    const messageId = Date.now() + "-" + Math.random();

    // 🔥 salva no histórico
    addMessage({
      id: messageId,
      role: "assistant",
      text
    });

    queue.push({
      id: messageId,
      text,
      speak,
      priority,
      createdAt: Date.now()
    });

    // 🔥 prioridade (maior primeiro)
    queue.sort((a, b) => b.priority - a.priority);

    processQueue();
  }

  async function processQueue() {
    if (isSpeaking) return;
    if (!queue.length) return;

    const item = queue.shift();
    if (!item) return;

    isSpeaking = true;

    try {
      // 🔊 TTS (não bloqueia resposta lógica)
      if (item.speak && item.text.length < 300) {
        console.log("[QUEUE] TTS...");
        if (context.services.tts) {
          await context.services.tts.speak(item.text);
        }
      }

      // 🔥 ENVIO ÚNICO VIA EVENTBUS (PADRÃO GLOBAL)
      if (context.core?.eventBus) {
        context.core.eventBus.emit("task:completed", {
          payload: {
            id: item.id,
            result: item.text
          }
        });
      }

    } catch (err) {
      console.error("[QUEUE] erro:", err);
    } finally {
      isSpeaking = false;
      processQueue();
    }
  }

  return {
    enqueue
  };
}