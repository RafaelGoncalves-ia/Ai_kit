import { eventBus } from "./eventBus.js";
import { captureScreen } from "../services/vision.js";

/**
 * ORCHESTRATOR (VERSÃO FINAL AJUSTADA)
 */

export default function createOrchestrator(context) {
  const state = context.state;

  async function handle({ input, source = "user" }) {
    const text = normalize(input);

    if (!text) {
      return { reply: "Fala direito 😒", queued: false };
    }

    state.user.isActive = true;
    state.user.lastSeen = Date.now();

    const memorySkill = context.core.skillManager.get("memory");

    // 🔥 memória NÃO bloqueia
    if (memorySkill) {
      memorySkill.processInput(text);
    }

    const memoryContext = memorySkill
      ? await memorySkill.getContext()
      : "";

    // ======================
    // INTENT
    // ======================
    const intent = detectIntent(text);

    // ======================
    // VISION
    // ======================
    let images = [];

    if (intent.useVision) {
      try {
        const img = await captureScreen();
        images.push(img);

        // 🔥 salva visão na memória
        if (memorySkill) {
          memorySkill.processInput("O usuário pediu para analisar a tela");
        }

      } catch (err) {
        console.error("[VISION ERROR]", err);
      }
    }

    // ======================
    // SYSTEM COMMANDS
    // ======================
    if (intent.systemCommand) {
      executeSystemCommand(intent.systemCommand);

      return {
        reply: "Já fiz 😏",
        queued: false
      };
    }

    // ======================
    // RESPOSTA RÁPIDA
    // ======================
    const quickReply = await generateStyledResponse({
      text,
      memoryContext,
      mode: "quick",
      images
    });

    context.core.responseQueue.enqueue({
      text: quickReply,
      speak: true,
      priority: 1
    });

    // ======================
    // LONG TASK
    // ======================
    let queued = false;
    let taskId = null;

    if (intent.requiresLongTask) {
      queued = true;

      taskId = enqueueTask({
        text,
        memoryContext
      });
    }

    return {
      reply: quickReply,
      queued,
      taskId
    };
  }

  // ======================
  // INTENT DETECTOR
  // ======================
  function detectIntent(text) {
    const lower = text.toLowerCase();

    const visionTriggers = ["olha", "ve", "ver", "tela", "print"];

    const longTriggers = [
      "gere",
      "arquivo",
      "escreva",
      "corrija",
      "crie",
      "desenvolva"
    ];

    if (lower.includes("abre") || lower.includes("abrir")) {
      if (lower.includes("chrome")) {
        return { systemCommand: "open_chrome" };
      }
    }

    if (lower.includes("clica") || lower.includes("clique")) {
      return { systemCommand: "click" };
    }

    return {
      useVision: visionTriggers.some(t => lower.includes(t)),
      requiresLongTask: longTriggers.some(t => lower.includes(t))
    };
  }

  // ======================
  // SYSTEM COMMAND EXEC
  // ======================
  function executeSystemCommand(cmd) {
    switch (cmd) {
      case "open_chrome":
        console.log("[CMD] Abrindo Chrome...");
        // integrar depois com system.js
        break;

      case "click":
        console.log("[CMD] Click simulado...");
        break;
    }
  }

  // ======================
  // RESPONSE COM PERSONALIDADE
  // ======================
  async function generateStyledResponse({ text, memoryContext, mode, images = [] }) {
    const prompt = buildPrompt({
      text,
      memoryContext,
      mode
    });

    const ai = await context.services.ai.chat(prompt, { images });

    return ai.text || "…";
  }

  // ======================
  // PROMPT BUILDER
  // ======================
  function buildPrompt({ text, memoryContext, mode }) {
    const emotion = state.emotion?.type || "neutral";
    const action = state.routine?.currentAction || "idle";

    const personalityBase = `
Você é uma garota jovem, sarcástica, provocadora e levemente arrogante.
Fala como alguém da internet, usa gírias e zoa o usuário.
Nunca fala formal demais.
Sempre parece viva e com atitude.
`;

    const emotionLayer = `
Estado atual:
- Emoção: ${emotion}
- Ação atual: ${action}
`;

    const memoryLayer = memoryContext
      ? `
Use as informações abaixo APENAS se forem úteis:

${memoryContext}
`
      : "";

    const controlLayer = `
Nunca invente fatos.
Use memória apenas quando fizer sentido.
`;

    let instruction = "";

    if (mode === "quick") {
      instruction = `
Responda curto (1-2 frases), com personalidade forte.
`;
    }

    if (mode === "final") {
      instruction = `
Feche a interação de forma curta.
`;
    }

    return `
${personalityBase}
${emotionLayer}
${memoryLayer}
${controlLayer}

Usuário: ${text}

${instruction}
Resposta:
`;
  }

  // ======================
  // LONG TASK
  // ======================
  function enqueueTask({ text, memoryContext }) {
    const id = generateId();

    const task = {
      id,
      text,
      memoryContext,
      status: "pending",
      createdAt: Date.now(),
      result: null
    };

    if (!state.orchestrator) {
      state.orchestrator = {
        queue: [],
        isProcessing: false
      };
    }

    state.orchestrator.queue.push(task);

    state.routine.forced = "working_pc";
    state.world.location = "pc";

    processTask(task);

    return id;
  }

  async function processTask(task) {
    state.orchestrator.isProcessing = true;

    try {
      task.status = "processing";

      const prompt = `
Responda de forma completa e detalhada.

${task.memoryContext ? "Contexto:\n" + task.memoryContext : ""}

Pedido:
${task.text}
`;

      const ai = await context.services.ai.chat(prompt);

      task.result = ai.text;
      task.status = "done";

      const finalReply = await generateStyledResponse({
        text: "Terminei 😌",
        memoryContext: task.memoryContext,
        mode: "final"
      });

      context.core.responseQueue.enqueue({
        text: finalReply,
        speak: true,
        priority: 2
      });

      eventBus.emit("task:completed", {
        ...task,
        finalReply
      });

    } catch (err) {
      console.error("Erro task:", err);

      task.status = "error";
      task.result = "Deu ruim 😑";
    } finally {
      state.orchestrator.isProcessing = false;
      state.routine.forced = null;
    }
  }

  // ======================
  // RANDOM TALK (PRONTO PRA USAR)
  // ======================
  async function randomTalk() {
    const memorySkill = context.core.skillManager.get("memory");

    const memoryContext = memorySkill
      ? await memorySkill.getContext()
      : "";

    const reply = await generateStyledResponse({
      text: "Comente algo aleatório baseado no contexto atual",
      memoryContext,
      mode: "quick"
    });

    context.core.responseQueue.enqueue({
      text: reply,
      speak: true,
      priority: 0
    });
  }

  // ======================
  // HELPERS
  // ======================
  function normalize(text) {
    return text?.trim() || "";
  }

  function generateId() {
    return Math.random().toString(36).slice(2);
  }

  return {
    handle,
    randomTalk
  };
}