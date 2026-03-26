/**
 * RESPONSE QUEUE
 *
 * Responsável por:
 * - Fila de falas
 * - Prioridade
 * - Evitar sobreposição
 */

export default function createResponseQueue(context) {
  const queue = [];
  let isSpeaking = false;

  // ======================
  // ADD
  // ======================
  function enqueue({ text, speak = true, priority = 0 }) {
    queue.push({
      text,
      speak,
      priority,
      createdAt: Date.now()
    });

    queue.sort((a, b) => b.priority - a.priority);

    processQueue();
  }

  // ======================
  // PROCESS
  // ======================
  async function processQueue() {
    if (isSpeaking) return;
    if (!queue.length) return;

    const item = queue.shift();
    if (!item) return;

    isSpeaking = true;

    try {
      // 🔥 evita falar textos grandes
      if (item.speak && item.text.length < 300) {
        console.log("[QUEUE] enviando para TTS...");

        // 🔥 AGORA SEMPRE usa o TTS central
        if (context.services.tts) {
          await context.services.tts.speak(item.text);
        }
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