import { ensureExecutionRuntime } from "./runtimeState.js";

function normalizeStatus(input = {}) {
  return {
    executionId: input.executionId || null,
    status: input.status || "idle",
    mode: input.mode || "task",
    currentStep: Number(input.currentStep || 0),
    totalSteps: Number(input.totalSteps || 0),
    label: input.label || "",
    progressText: input.progressText || "",
    startedAt: input.startedAt || null,
    finishedAt: input.finishedAt || null,
    error: input.error || null,
    sessionId: input.sessionId || null
  };
}

export function updateExecutionStatus(context, patch = {}) {
  const runtime = ensureExecutionRuntime(context);
  const executionId = patch.executionId || runtime.currentExecution?.executionId || null;
  const previous = executionId ? runtime.executions[executionId] || {} : {};
  const next = normalizeStatus({
    ...previous,
    ...patch,
    executionId
  });

  if (!next.startedAt && ["planning", "running", "waiting_input"].includes(next.status)) {
    next.startedAt = Date.now();
  }

  if (["done", "error", "idle"].includes(next.status) && !next.finishedAt) {
    next.finishedAt = Date.now();
  }

  if (executionId) {
    runtime.executions[executionId] = next;
    runtime.currentExecution = next.status === "idle" ? null : next;
  } else {
    runtime.currentExecution = next;
  }

  context.core?.eventBus?.emit("execution:status", next);
  return next;
}

export function clearExecutionStatus(context, executionId = null) {
  const runtime = ensureExecutionRuntime(context);

  if (executionId && runtime.executions[executionId]) {
    const previous = runtime.executions[executionId];
    const cleared = updateExecutionStatus(context, {
      ...previous,
      executionId,
      status: "idle",
      label: "",
      progressText: "",
      error: null
    });
    runtime.currentExecution = null;
    return cleared;
  }

  runtime.currentExecution = null;
  return updateExecutionStatus(context, {
    executionId: executionId || null,
    status: "idle",
    mode: "task",
    currentStep: 0,
    totalSteps: 0,
    label: "",
    progressText: "",
    startedAt: null,
    finishedAt: Date.now(),
    error: null,
    sessionId: null
  });
}

export function getCurrentExecutionStatus(context) {
  const runtime = ensureExecutionRuntime(context);
  return runtime.currentExecution || null;
}

export function listExecutionStatuses(context) {
  const runtime = ensureExecutionRuntime(context);
  return Object.values(runtime.executions);
}

export function hasWaitingExecutionInput(context) {
  const runtime = ensureExecutionRuntime(context);
  return Object.values(runtime.executions).some((execution) => execution.status === "waiting_input");
}

export function hasActiveExecution(context) {
  const runtime = ensureExecutionRuntime(context);
  return Object.values(runtime.executions).some((execution) =>
    ["planning", "running", "waiting_input"].includes(execution.status)
  );
}
