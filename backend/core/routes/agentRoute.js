const BLOCKED_AUTOMATIC_JOBS = [
  "agent:randomtalk",
  "agent:needs-analysis",
  "agent:reminders",
  "agent:autonomous-task"
];

const TASK_INTENT_PATTERNS = [
  /\b(crie|criar|gere|gerar|escreva|escrever|desenvolva|desenvolver|monte|montar|produza|produzir|salve|salvar)\b/i,
  /\b(corrija|corrigir|arrume|ajuste|implemente|implementar|planeje|planejar|organize|organizar|pesquise|pesquisar)\b/i
];

const PLANNING_PATTERNS = [
  /\b(planeje|planejar|plano|estrategia|estrategico|roadmap|cronograma)\b/i,
  /\b(passo a passo|divida|quebre em etapas|sequencia de execucao)\b/i
];

const MULTI_STEP_PATTERNS = [
  /\b(etapas|passos|fases|sequencia|workflow|pipeline|checklist|multietapa)\b/i,
  /\b(primeiro|depois|em seguida|por fim)\b/i
];

const INTERMEDIATE_STATE_PATTERNS = [
  /\b(acompanhe|acompanhar|monitor|monitorar|status|progresso|estado|iterar|iteracao)\b/i,
  /\b(revisar|revisao|ajustar|ajuste|refinar|refinamento)\b/i
];

const COMPLETION_CRITERIA_PATTERNS = [
  /\b(concluir|conclusao|finalizar|final|entregavel|objetivo final|resultado final)\b/i,
  /\b(ate terminar|ate concluir|criterio|criterios|quando terminar|quando concluir)\b/i
];

function normalizeTaskText(input) {
  return String(input || "").trim();
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function summarizeSatisfiedCriteria(criteria) {
  return Object.entries(criteria)
    .filter(([, satisfied]) => satisfied)
    .map(([name]) => name);
}

export function evaluateAgentTaskComplexity(input, options = {}) {
  const text = normalizeTaskText(input);
  const hasMedia = Boolean(options.hasMedia);
  const isTaskLike = text.length > 0 && matchesAny(text, TASK_INTENT_PATTERNS);

  const criteria = {
    requiresPlanning: matchesAny(text, PLANNING_PATTERNS),
    requiresMultipleSteps: matchesAny(text, MULTI_STEP_PATTERNS),
    hasIntermediateState: matchesAny(text, INTERMEDIATE_STATE_PATTERNS),
    hasCompletionCriteria: matchesAny(text, COMPLETION_CRITERIA_PATTERNS)
  };

  const satisfiedCriteria = summarizeSatisfiedCriteria(criteria);
  const shouldUseAgentRoute = (
    isTaskLike &&
    !hasMedia &&
    (criteria.requiresPlanning || criteria.hasIntermediateState) &&
    (criteria.requiresMultipleSteps || criteria.hasCompletionCriteria)
  );

  return {
    shouldUseAgentRoute,
    isTaskLike,
    hasMedia,
    criteria,
    satisfiedCriteria,
    reason: shouldUseAgentRoute
      ? "complex_task_detected"
      : hasMedia
        ? "media_stays_on_realtime_route"
        : !isTaskLike
          ? "not_an_explicit_task"
          : "complexity_criteria_not_met"
  };
}

export default function createAgentRoute(context) {
  const agentEngine = context.core?.agentEngine;

  function logBlockedAutomatic(action, details = {}) {
    console.log("[AGENT-ROUTE] Automatic behavior blocked", {
      action,
      ...details
    });
  }

  function registerSchedulerJobs() {
    logBlockedAutomatic("scheduler-registration-ignored", {
      blockedJobs: BLOCKED_AUTOMATIC_JOBS
    });
    return {
      registered: [],
      blocked: BLOCKED_AUTOMATIC_JOBS.slice()
    };
  }

  function handleAgentEvent(eventType, eventData = {}) {
    logBlockedAutomatic("agent-event-ignored", {
      eventType,
      source: eventData?.source || "unknown"
    });
    return null;
  }

  function emitAgentEvent(type, payload = {}) {
    logBlockedAutomatic("agent-event-emission-blocked", {
      type,
      source: payload?.source || "agent-route"
    });
    return false;
  }

  async function handleTask({ input, sessionId = "default", source = "user", executionId = null }) {
    const decision = evaluateAgentTaskComplexity(input);

    if (!decision.shouldUseAgentRoute) {
      console.log("[AGENT-ROUTE] Ignorado: tarefa nao atende criterio de complexidade", {
        sessionId,
        source,
        reason: decision.reason,
        criteria: decision.criteria,
        satisfiedCriteria: decision.satisfiedCriteria
      });

      return {
        handled: false,
        reason: decision.reason,
        decision
      };
    }

    console.log("[AGENT-ROUTE] Acionado sob demanda", {
      sessionId,
      source,
      reason: decision.reason,
      criteria: decision.criteria,
      satisfiedCriteria: decision.satisfiedCriteria
    });

    const taskRoute = context.core?.routes?.task;
    if (taskRoute?.enqueueLongTask) {
      const taskId = await taskRoute.enqueueLongTask({
        text: input,
        sessionId,
        routeMode: "agent",
        routeSource: "agent-route",
        routeReason: decision,
        executionId
      });

      return {
        handled: Boolean(taskId),
        type: "agent",
        taskId,
        decision
      };
    }

    if (!agentEngine?.run) {
      throw new Error("AgentEngine indisponivel");
    }

    const result = await agentEngine.run({
      goal: input,
      sessionId,
      mode: "agent",
      executionId
    });

    return {
      handled: true,
      type: "agent",
      result,
      decision
    };
  }

  function getAgentStatus() {
    return {
      isScheduled: false,
      automaticJobsBlocked: BLOCKED_AUTOMATIC_JOBS.slice(),
      engineReady: !!agentEngine?.run
    };
  }

  return {
    registerSchedulerJobs,
    handleAgentEvent,
    emitAgentEvent,
    handleTask,
    evaluateTaskComplexity: evaluateAgentTaskComplexity,
    getAgentStatus
  };
}
