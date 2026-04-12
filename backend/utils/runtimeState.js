function ensureObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

export function ensureRuntime(context) {
  if (!context || typeof context !== "object") {
    return {};
  }

  context.runtime = ensureObject(context.runtime, {});
  return context.runtime;
}

export function ensureAssistantRuntime(context) {
  const runtime = ensureRuntime(context);
  runtime.assistant = ensureObject(runtime.assistant, {});
  runtime.assistant.recentMessages = Array.isArray(runtime.assistant.recentMessages)
    ? runtime.assistant.recentMessages
    : [];
  return runtime.assistant;
}

export function ensureExecutionRuntime(context) {
  const runtime = ensureRuntime(context);
  runtime.execution = ensureObject(runtime.execution, {});
  runtime.execution.executions = ensureObject(runtime.execution.executions, {});
  runtime.execution.currentExecution = runtime.execution.currentExecution || null;
  return runtime.execution;
}

export function ensureOrchestratorRuntime(context) {
  const runtime = ensureRuntime(context);
  runtime.orchestrator = ensureObject(runtime.orchestrator, {});
  runtime.orchestrator.pendingAudioIntent = runtime.orchestrator.pendingAudioIntent || null;
  runtime.orchestrator.lastSessionId = runtime.orchestrator.lastSessionId || "default";
  return runtime.orchestrator;
}

export function getLastSessionId(context) {
  return ensureOrchestratorRuntime(context).lastSessionId || "default";
}

export function setLastSessionId(context, sessionId = "default") {
  const orchestrator = ensureOrchestratorRuntime(context);
  orchestrator.lastSessionId = sessionId || "default";
  return orchestrator.lastSessionId;
}
