import { captureScreen } from "../services/vision.js";
import { getPersonalityByAura } from "../skills/needs/personality.map.js";

/**
 * ORCHESTRATOR (VERSÃO FINAL AJUSTADA)
 * - Personalidade desacoplada (config + aura)
 * - Fallback seguro se config não existir
 * - Fila controlada (anti overload)
 */

export default function createOrchestrator(context) {
  const state = context.state;

  let runningTasks = 0;
  const MAX_CONCURRENT = context.config?.system?.maxConcurrentTasks || 1;

  // ======================
  // HANDLE INPUT
  // ======================
  async function handle({ input, source = "user" }) {
    const text = normalize(input);

    if (!text) {
      context.core.responseQueue.enqueue({
        text: "Fala direito 😒",
        speak: true,
        priority: 1
      });
      return { queued: false };
    }

    state.user.isActive = true;
    state.user.lastSeen = Date.now();

    const memorySkill = context.core.skillManager.get("memory");

    if (memorySkill) {
      memorySkill.processInput(text);
    }

    const memoryContext = memorySkill
      ? await memorySkill.getContext()
      : "";

    const intent = detectIntent(text);

    // ======================
    // VISION
    // ======================
    let images = [];

    if (intent.useVision) {
      try {
        const img = await captureScreen();
        images.push(img);

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

      context.core.responseQueue.enqueue({
        text: "Já fiz 😏",
        speak: true,
        priority: 1
      });

      return { queued: false };
    }

    // ======================
    // QUICK RESPONSE
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
      taskId = enqueueTask({ text, memoryContext });
    }

    return { queued, taskId };
  }

  // ======================
  // INTENT
  // ======================
  function detectIntent(text) {
    const lower = text.toLowerCase();

    const visionTriggers = ["olha", "ve", "ver", "tela", "print"];
    const longTriggers = ["gere", "arquivo", "escreva", "corrija", "crie", "desenvolva"];

    if (lower.includes("abre") || lower.includes("abrir")) {
      if (lower.includes("chrome")) return { systemCommand: "open_chrome" };
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
  // SYSTEM COMMAND
  // ======================
  function executeSystemCommand(cmd) {
    switch (cmd) {
      case "open_chrome":
        console.log("[CMD] Abrindo Chrome...");
        break;

      case "click":
        console.log("[CMD] Click simulado...");
        break;
    }
  }

  // ======================
  // RESPONSE
  // ======================
  async function generateStyledResponse({ text, memoryContext, mode, images = [] }) {
    const prompt = buildPrompt({ text, memoryContext, mode });
    const ai = await context.services.ai.chat(prompt, { images });
    return ai.text || "…";
  }

  // ======================
  // PROMPT BUILDER (DESACOPLADO)
  // ======================
  function buildPrompt({ text, memoryContext, mode }) {
    const emotion = state.emotion?.type || "neutral";
    const action = state.routine?.currentAction || "idle";

    const aura = state.needs?.aura ?? 50;
    const auraProfile = getPersonalityByAura(aura);

    // 🔥 fallback seguro (evita crash se config não existir ainda)
    const base = context.config?.personality || {
      name: "KIT",
      identity: {
        archetype: "assistente",
        style: "casual",
        tone: "neutro"
      },
      rules: {
        neverFormal: true,
        maxAggression: 0.6,
        allowSarcasm: true
      }
    };

    // ======================
    // LAYERS
    // ======================

    const identityLayer = `
Você é ${base.name}.

Identidade:
- Arquétipo: ${base.identity?.archetype}
- Estilo: ${base.identity?.style}
- Tom base: ${base.identity?.tone}
`;

    const auraLayer = `
Estado atual:
- Aura: ${aura}/100
- Perfil: ${auraProfile.label}

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

    const rulesLayer = `
Regras:
- Evite formalidade: ${base.rules?.neverFormal}
- Nível máximo de agressividade: ${base.rules?.maxAggression}
- Sarcasmo permitido: ${base.rules?.allowSarcasm}
`;

    let instruction = "";

    if (mode === "quick") {
      instruction = "Responda curto (1-2 frases).";
    }

    if (mode === "final") {
      instruction = "Finalize de forma curta.";
    }

    return `
${identityLayer}
${auraLayer}
${emotionLayer}
${memoryLayer}
${rulesLayer}

Usuário: ${text}

${instruction}
Resposta:
`;
  }

  // ======================
  // TASK QUEUE
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

    processNextTask();

    return id;
  }

  async function processNextTask() {
    if (runningTasks >= MAX_CONCURRENT) return;

    const nextTask = state.orchestrator.queue.find(t => t.status === "pending");
    if (!nextTask) return;

    runningTasks++;
    await processTask(nextTask);
    runningTasks--;

    processNextTask();
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
  // RANDOM TALK
  // ======================
  async function randomTalk() {
    const memorySkill = context.core.skillManager.get("memory");
    const memoryContext = memorySkill ? await memorySkill.getContext() : "";

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