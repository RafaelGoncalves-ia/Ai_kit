import {
  hasUsableAssistantText,
  shouldSuppressAssistantMessage
} from "../../utils/assistantMessageGuard.js";
import { updateExecutionStatus } from "../../utils/executionStatus.js";

function hasRealFile(pathValue) {
  try {
    return Boolean(pathValue);
  } catch {
    return false;
  }
}

function buildFinalChatMessage(result) {
  const summary = result?.summary || {};
  const files = Array.isArray(summary.files) ? summary.files.filter(Boolean) : [];
  const text = String(summary.text || "").trim();

  if (files.length > 0 && text) {
    return `${text}\n\nArquivo salvo em:\n${files.join("\n")}`;
  }

  if (files.length > 0) {
    return `Conclui a execucao e salvei o arquivo em:\n${files.join("\n")}`;
  }

  if (hasUsableAssistantText(text)) {
    return text;
  }

  return "";
}

export default function createTaskRoute(context) {
  let runningTasks = 0;
  const MAX_CONCURRENT = context.config?.system?.maxConcurrentTasks || 1;
  const queue = [];
  const completedTasks = [];

  function recordCompletedTask(task) {
    completedTasks.unshift({
      id: task.id,
      type: task.type,
      status: task.status,
      sessionId: task.sessionId,
      createdAt: task.createdAt,
      finishedAt: Date.now(),
      result: task.result
    });

    if (completedTasks.length > 50) {
      completedTasks.length = 50;
    }
  }

  function emitStatus(message) {
    if (!context.core?.eventBus) {
      return;
    }

    context.core.eventBus.emit("action:status", {
      message,
      timestamp: Date.now()
    });

    if (message) {
      console.log(`[TASK-ROUTE] ${message}`);
    } else {
      console.log("[TASK-ROUTE] status cleared");
    }
  }

  async function enqueueAudioTask({ type, data, text, sessionId = "default" }) {
    if (runningTasks >= MAX_CONCURRENT) {
      console.warn("[TASK-ROUTE] Limite de tarefas concorrentes atingido");
      return null;
    }

    const taskId = generateId();
    const task = {
      id: taskId,
      type: "audio",
      sessionId,
      status: "pending",
      createdAt: Date.now(),
      result: null,
      data,
      text
    };

    queue.push(task);
    console.log(`[TASK-ROUTE] Audio task enfileirada (ID: ${taskId})`);

    updateExecutionStatus(context, {
      executionId: taskId,
      sessionId,
      mode: "task",
      status: "planning",
      label: "Na fila",
      progressText: "Aguardando inicio da geracao de audio",
      currentStep: 0,
      totalSteps: 1
    });

    if (context.core?.eventBus) {
      context.core.eventBus.emit("task:enqueued", {
        taskId,
        type: "audio",
        queueLength: queue.length
      });
    }

    processNextTask();
    return taskId;
  }

  async function enqueueLongTask({
    text,
    sessionId = "default",
    routeMode = "task",
    routeSource = "task-route",
    routeReason = null,
    executionId = null
  }) {
    if (runningTasks >= MAX_CONCURRENT) {
      console.warn("[TASK-ROUTE] Limite de tarefas concorrentes atingido");
      return null;
    }

    const taskId = generateId();
    const task = {
      id: taskId,
      type: "long",
      sessionId,
      routeMode,
      routeSource,
      routeReason,
      requestedExecutionId: executionId,
      status: "pending",
      createdAt: Date.now(),
      result: null,
      text
    };

    queue.push(task);
    console.log("[TASK-ROUTE] Long task enfileirada", {
      taskId,
      sessionId,
      routeMode,
      routeSource,
      routeReason: routeReason?.satisfiedCriteria || []
    });

    updateExecutionStatus(context, {
      executionId: taskId,
      sessionId,
      mode: "task",
      status: "planning",
      label: "Na fila",
      progressText: "Aguardando inicio da execucao",
      currentStep: 0,
      totalSteps: 0
    });

    if (context.core?.eventBus) {
      context.core.eventBus.emit("task:enqueued", {
        taskId,
        type: "long",
        queueLength: queue.length
      });
    }

    processNextTask();
    return taskId;
  }

  async function processNextTask() {
    if (runningTasks >= MAX_CONCURRENT) return;
    if (!queue.length) return;

    const nextTask = queue.find((task) => task.status === "pending");
    if (!nextTask) return;

    runningTasks += 1;

    try {
      await processTask(nextTask);
    } finally {
      runningTasks -= 1;
      processNextTask();
    }
  }

  async function processTask(task) {
    try {
      task.status = "processing";

      if (task.type === "audio") {
        await processAudioTask(task);
      } else if (task.type === "long") {
        await processLongTask(task);
      }

      task.status = "done";
      recordCompletedTask(task);

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
      recordCompletedTask(task);

      updateExecutionStatus(context, {
        executionId: task.id,
        sessionId: task.sessionId,
        mode: "task",
        status: "error",
        label: "Falha na execucao",
        progressText: err.message,
        error: err.message,
        finishedAt: Date.now()
      });

      if (context.core?.responseQueue) {
        context.core.responseQueue.enqueue({
          text: err.message,
          speak: false,
          priority: 2,
          source: "task-route-error",
          allowGeneric: true,
          sessionId: task.sessionId,
          userFacing: true
        });
      }

      if (context.core?.eventBus) {
        context.core.eventBus.emit("task:error", {
          taskId: task.id,
          type: task.type,
          error: err.message
        });
      }
    } finally {
      const taskIndex = queue.findIndex((item) => item.id === task.id);
      if (taskIndex >= 0) {
        queue.splice(taskIndex, 1);
      }
      emitStatus(null);
    }
  }

  async function processAudioTask(task) {
    emitStatus("gerando audio...");

    updateExecutionStatus(context, {
      executionId: task.id,
      sessionId: task.sessionId,
      mode: "task",
      status: "running",
      label: "Gerando audio",
      progressText: "Trabalhando... 1/1",
      currentStep: 1,
      totalSteps: 1
    });

    const result = await context.invokeTool("generate_audio", {
      ...(task.data || {}),
      sessionId: task.sessionId,
      executionId: task.id
    });

    if (result?.status !== "ok" || !result.data?.file) {
      throw new Error(result?.error || "Falha ao gerar o audio.");
    }

    task.result = {
      file: result.data.file
    };

    updateExecutionStatus(context, {
      executionId: task.id,
      sessionId: task.sessionId,
      mode: "task",
      status: "done",
      label: "Concluido",
      progressText: `Audio salvo em ${result.data.file}`,
      currentStep: 1,
      totalSteps: 1,
      finishedAt: Date.now()
    });

    context.core.responseQueue.enqueue({
      text: `Audio gerado em:\n${result.data.file}`,
      speak: true,
      priority: 2,
      source: "task-route-audio",
      allowGeneric: true,
      sessionId: task.sessionId,
      userFacing: true
    });
  }

  async function processLongTask(task) {
    emitStatus("planejando execucao...");

    const agentEngine = context.core?.agentEngine;
    if (!agentEngine?.run) {
      throw new Error("AgentEngine indisponivel");
    }

    const result = await agentEngine.run({
      goal: task.text,
      sessionId: task.sessionId,
      mode: task.routeMode || "task",
      executionId: task.requestedExecutionId || task.id
    });

    task.result = result;

    if (result?.status === "busy") {
      throw new Error("Ja existe uma execucao em andamento para esta sessao.");
    }

    if (result?.status === "ignored") {
      throw new Error("A solicitacao nao abriu uma execucao real.");
    }

    if (result?.status !== "ok") {
      throw new Error(result?.error || "Execucao longa falhou.");
    }

    const finalMessage = buildFinalChatMessage(result);
    const suppression = shouldSuppressAssistantMessage(context, finalMessage, {
      source: "task-route"
    });

    if (!hasUsableAssistantText(finalMessage) || suppression.blocked) {
      throw new Error(`Resultado final da task-route invalido: ${suppression.reason || "empty_response"}`);
    }

    const queued = context.core.responseQueue.enqueue({
      text: finalMessage,
      speak: false,
      priority: 2,
      source: task.routeSource || "task-route",
      sessionId: task.sessionId,
      userFacing: true
    });

    if (!queued) {
      throw new Error("Resultado final da task-route bloqueado pelos filtros");
    }
  }

  function getQueueStatus() {
    return {
      runningTasks,
      maxConcurrent: MAX_CONCURRENT,
      queueLength: queue.length,
      queue: queue.map((task) => ({
        id: task.id,
        type: task.type,
        status: task.status,
        sessionId: task.sessionId,
        createdAt: task.createdAt
      }))
    };
  }

  function isAudioBusy() {
    return runningTasks > 0 || queue.length > 0;
  }

  function listRecentCompleted(limit = 20) {
    return completedTasks.slice(0, Math.max(1, Number(limit || 20)));
  }

  function generateId() {
    return Math.random().toString(36).slice(2);
  }

  return {
    enqueueAudioTask,
    enqueueLongTask,
    getQueueStatus,
    isAudioBusy,
    listRecentCompleted
  };
}
