/**
 * TASK ROUTE (Rota Longa)
 * 
 * Responsabilidades:
 * - Execução de tarefas multi-step
 * - Processamento em background
 * - Leitura de arquivos
 * - Geração de conteúdo estruturado
 * - Resumos, análises, etc
 * 
 * Características:
 * - Sem TTS em tempo real
 * - Áudio apenas quando explicitamente solicitado
 * - Pode processar múltiplas tarefas em paralelo (até MAX_CONCURRENT)
 * - Isolado da rota realtime
 */

export default function createTaskRoute(context) {
  const state = context.state;

  let runningTasks = 0;
  const MAX_CONCURRENT = context.config?.system?.maxConcurrentTasks || 1;

  // ==========================================
  // EMIT STATUS
  // ==========================================
  function emitStatus(message) {
    if (context.core?.eventBus) {
      context.core.eventBus.emit("action:status", {
        message,
        timestamp: Date.now()
      });
      console.log(`[TASK-ROUTE] ${message}`);
    }
  }

  // ==========================================
  // ENQUEUE AUDIO TASK
  // ==========================================
  /**
   * Enfileira geração de áudio (chamado pela rota realtime)
   */
  async function enqueueAudioTask({ type, data, text, memoryContext }) {
    if (runningTasks >= MAX_CONCURRENT) {
      console.warn("[TASK-ROUTE] Limite de tarefas concorrentes atingido");
      return null;
    }

    const taskId = generateId();

    const task = {
      id: taskId,
      type: "audio",
      status: "pending",
      createdAt: Date.now(),
      result: null,
      data,
      text,
      memoryContext
    };

    if (!state.taskRoute) {
      state.taskRoute = {
        queue: [],
        isProcessing: false
      };
    }

    state.taskRoute.queue.push(task);

    console.log(`[TASK-ROUTE] Audio task enfileirada (ID: ${taskId})`);

    // Emite evento
    if (context.core?.eventBus) {
      context.core.eventBus.emit("task:enqueued", {
        taskId,
        type: "audio",
        queueLength: state.taskRoute.queue.length
      });
    }

    processNextTask();

    return taskId;
  }

  // ==========================================
  // ENQUEUE LONG TASK
  // ==========================================
  /**
   * Enfileira tarefa longa (chamado pelo orchestrator)
   */
  async function enqueueLongTask({ text, memoryContext, searchResult }) {
    if (runningTasks >= MAX_CONCURRENT) {
      console.warn("[TASK-ROUTE] Limite de tarefas concorrentes atingido");
      return null;
    }

    const taskId = generateId();

    const task = {
      id: taskId,
      type: "long",
      status: "pending",
      createdAt: Date.now(),
      result: null,
      text,
      memoryContext,
      searchResult: searchResult || null
    };

    if (!state.taskRoute) {
      state.taskRoute = {
        queue: [],
        isProcessing: false
      };
    }

    state.taskRoute.queue.push(task);

    console.log(`[TASK-ROUTE] Long task enfileirada (ID: ${taskId})`);

    // Emite evento
    if (context.core?.eventBus) {
      context.core.eventBus.emit("task:enqueued", {
        taskId,
        type: "long",
        queueLength: state.taskRoute.queue.length
      });
    }

    processNextTask();

    return taskId;
  }

  // ==========================================
  // PROCESS NEXT TASK
  // ==========================================
  async function processNextTask() {
    if (runningTasks >= MAX_CONCURRENT) return;
    if (!state.taskRoute?.queue.length) return;

    const nextTask = state.taskRoute.queue.find(t => t.status === "pending");
    if (!nextTask) return;

    runningTasks++;

    try {
      await processTask(nextTask);
    } finally {
      runningTasks--;
      processNextTask();
    }
  }

  // ==========================================
  // PROCESS TASK
  // ==========================================
  async function processTask(task) {
    try {
      task.status = "processing";

      if (task.type === "audio") {
        await processAudioTask(task);
      } else if (task.type === "long") {
        await processLongTask(task);
      }

      task.status = "done";

      // Emite conclusão
      if (context.core?.eventBus) {
        context.core.eventBus.emit("task:completed", {
          taskId: task.id,
          type: task.type,
          result: task.result
        });
      }

    } catch (err) {
      console.error(`[TASK-ROUTE] Erro na task ${task.id}:`, err);

      task.status = "error";
      task.result = { error: err.message };

      // Emite erro
      if (context.core?.eventBus) {
        context.core.eventBus.emit("task:error", {
          taskId: task.id,
          type: task.type,
          error: err.message
        });
      }
    }
  }

  // ==========================================
  // PROCESS AUDIO TASK
  // ==========================================
  async function processAudioTask(task) {
    emitStatus("🎵 gerando áudio...");

    const audioSkill = context.core.skillManager.get("audio");

    if (!audioSkill || typeof audioSkill.execute !== "function") {
      throw new Error("Audio skill não disponível");
    }

    const result = await audioSkill.execute({ input: task.data });

    if (result?.success) {
      task.result = `Áudio gerado com sucesso: ${result.file || "output.wav"}`;
    } else {
      task.result = result?.error || "Falha ao gerar o áudio.";
    }

    // Enfileira resposta com TTS automático (pois é geração de áudio)
    context.core.responseQueue.enqueue({
      text: task.result,
      speak: true,
      priority: 2
    });

    emitStatus(null);
  }

  // ==========================================
  // PROCESS LONG TASK
  // ==========================================
  async function processLongTask(task) {
    emitStatus("⚙️ processando...");

    const prompt = buildLongTaskPrompt({
      text: task.text,
      memoryContext: task.memoryContext,
      searchResult: task.searchResult
    });

    const ai = await context.services.ai.chat(prompt);
    task.result = ai.text || "…";

    // Processar memória da resposta
    const memorySkill = context.core.skillManager.get("memory");
    if (memorySkill) {
      await memorySkill.processAIResponse(task.result);
    }

    // 🔊 Enfileira resposta SEM TTS automático
    // Rota longa nunca fala automaticamente
    context.core.responseQueue.enqueue({
      text: task.result,
      speak: false,  // ✅ Importante: sem TTS automático
      priority: 2
    });

    emitStatus(null);
  }

  // ==========================================
  // BUILD LONG TASK PROMPT
  // ==========================================
  function buildLongTaskPrompt({ text, memoryContext, searchResult }) {
    const base = context.config?.personality || {
      name: "KIT"
    };

    let prompt = `
Você é ${base.name}.

Forneça uma resposta neutra, objetiva e bem estruturada.
Foque em edição e criação de conteúdo: documentos, códigos, ideias, projetos e trabalho.
evite emoção ou tom casual.
`;

    if (memoryContext) {
      prompt += `

Contexto relevante:
${memoryContext}
`;
    }

    if (searchResult) {
      prompt += `

Informações adicionais (pesquisa web):
${searchResult}
`;
    }

    prompt += `

Pedido do usuário:
${text}

Responda de forma estruturada e profissional:
`;

    return prompt;
  }

  // ==========================================
  // QUERY STATUS
  // ==========================================
  function getQueueStatus() {
    return {
      runningTasks,
      maxConcurrent: MAX_CONCURRENT,
      queueLength: state.taskRoute?.queue?.length || 0,
      queue: (state.taskRoute?.queue || []).map(task => ({
        id: task.id,
        type: task.type,
        status: task.status,
        createdAt: task.id
      }))
    };
  }

  function isAudioBusy() {
    return runningTasks > 0 || (state.taskRoute?.queue?.length || 0) > 0;
  }

  // ==========================================
  // UTILITIES
  // ==========================================
  function generateId() {
    return Math.random().toString(36).slice(2);
  }

  return {
    enqueueAudioTask,
    enqueueLongTask,
    getQueueStatus,
    isAudioBusy
  };
}
