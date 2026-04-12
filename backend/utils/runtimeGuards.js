import { hasActiveExecution, hasWaitingExecutionInput } from "./executionStatus.js";

export function isSafeDiagnosticMode(context) {
  return (
    context?.config?.system?.safeDiagnosticMode === true ||
    process.env.SAFE_DIAGNOSTIC_MODE === "true"
  );
}

export function getConversationActivity(context) {
  const lastUserInteraction = Number(
    context?.lastUserInteraction ||
    context?.state?.user?.lastSeen ||
    0
  );
  const activeWindowMs = Number(
    context?.config?.system?.activeConversationWindowMs ||
    process.env.ACTIVE_CONVERSATION_WINDOW_MS ||
    120000
  );
  const now = Date.now();
  const idleForMs = lastUserInteraction > 0 ? now - lastUserInteraction : Number.POSITIVE_INFINITY;

  return {
    active: lastUserInteraction > 0 && idleForMs < activeWindowMs,
    lastUserInteraction,
    idleForMs,
    activeWindowMs
  };
}

function hasPendingUserQuestions(context) {
  const sessions = Object.values(context?.sessions || {});
  return sessions.some((session) => Object.keys(session?.questions || {}).length > 0);
}

function isRealtimeBusy(context) {
  const diagnostics = context?.rawServices?.ai?.getDiagnostics?.() || context?.services?.ai?.getDiagnostics?.();
  return Number(diagnostics?.activeRequests || 0) > 0 || Number(diagnostics?.queuedRequests || 0) > 0;
}

function isTaskRouteBusy(context) {
  const taskStatus = context?.core?.routes?.task?.getQueueStatus?.();
  return (
    Number(taskStatus?.runningTasks || 0) > 0 ||
    Number(taskStatus?.queueLength || 0) > 0
  );
}

export function getRuntimeActivity(context) {
  const conversation = getConversationActivity(context);

  return {
    safeDiagnosticMode: isSafeDiagnosticMode(context),
    conversation,
    ttsBusy: context?.core?.responseQueue?.isTTSBusy?.() ?? false,
    realtimeBusy: isRealtimeBusy(context),
    taskRouteBusy: isTaskRouteBusy(context),
    activeExecution: hasActiveExecution(context),
    waitingExecutionInput: hasWaitingExecutionInput(context),
    pendingQuestions: hasPendingUserQuestions(context)
  };
}

export function canStartIdleTalk(context) {
  const activity = getRuntimeActivity(context);

  if (activity.safeDiagnosticMode) {
    return {
      allowed: false,
      reason: "safe_diagnostic_mode"
    };
  }

  if (activity.conversation.active) {
    return {
      allowed: false,
      reason: "active_user_conversation"
    };
  }

  if (activity.ttsBusy) {
    return {
      allowed: false,
      reason: "tts_busy"
    };
  }

  if (activity.realtimeBusy) {
    return {
      allowed: false,
      reason: "realtime_busy"
    };
  }

  if (activity.taskRouteBusy) {
    return {
      allowed: false,
      reason: "task_route_busy"
    };
  }

  if (activity.activeExecution) {
    return {
      allowed: false,
      reason: "execution_running"
    };
  }

  if (activity.waitingExecutionInput || activity.pendingQuestions) {
    return {
      allowed: false,
      reason: "waiting_user_input"
    };
  }

  return {
    allowed: true,
    reason: null
  };
}

export function shouldSilenceAutonomousSource(context, source = "unknown") {
  const idleCheck = canStartIdleTalk(context);
  if (!idleCheck.allowed) {
    return {
      blocked: true,
      reason: idleCheck.reason,
      source
    };
  }

  return {
    blocked: false,
    reason: null,
    source
  };
}
