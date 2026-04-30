import { createAgentToolLoop, loadAgentToolLoopConfig } from "../agent/AgentToolLoop.js";
import { createAgentExecutionEngine, loadAgentExecutionConfig } from "../agent/AgentExecutionEngine.js";

const BLOCKED_AUTOMATIC_JOBS = [
  "agent:randomtalk",
  "agent:needs-analysis",
  "agent:reminders",
  "agent:autonomous-task"
];

const TASK_INTENT_PATTERNS = [
  /\b(crie|criar|gere|gerar|escreva|escrever|desenvolva|desenvolver|monte|montar|produza|produzir|salve|salvar|explique|explicar)\b/i,
  /\b(corrija|corrigir|arrume|ajuste|implemente|implementar|planeje|planejar|organize|organizar|pesquise|pesquisar|liste|listar)\b/i
];

const PLANNING_PATTERNS = [
  /\b(planeje|planejar|plano|estrategia|estrategico|roadmap|cronograma|programacao|calendario|editorial|postagens?)\b/i,
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

const SEARCH_TASK_PATTERNS = [
  /\b(pesquise|pesquisar|pesquisa|busque|buscar|busca|procure|procurar|google|web|online)\b/i,
  /\b(contatos?|telefones?|enderecos?|sites?)\b/i,
  /\b(lista|liste|listar|tabela|opcoes?|encontre|monte)\b.*\b(fornecedores?|provedores?|operadoras?|empresas?|lojas?|servicos?)\b/i,
  /\b(fornecedores?|provedores?|operadoras?|empresas?|lojas?|servicos?)\b.*\b(em\s+[a-z0-9][a-z0-9\s.-]{2,}|contatos?|telefones?|enderecos?|sites?)\b/i,
  /\b(link|links?)\b.*\b(compra|comprar|produto|produtos?)\b/i,
  /\b(compra|comprar|produto|produtos?)\b.*\b(link|links?)\b/i,
  /\b(filmes?|cinema|cartaz|programacao)\b.*\b(hoje|agora|atual|atuais|cartaz|programacao)\b/i,
  /\b(anime|animes|manga|mangas|crunchyroll|myanimelist|anilist)\b.*\b(hoje|agora|atual|atuais|temporada|lancamento|lancamentos|episodios?|lista|top|melhores?)\b/i,
  /\b(lista|liste|monte|encontre)\b.*\b(anime|animes|manga|mangas)\b/i
];

const STRUCTURED_OUTPUT_PATTERNS = [
  /\b(lista|liste|listar|tabela|opcoes?|fornecedores?|programacao|cronograma|calendario|postagens?)\b/i,
  /\b\d+\s+(opcoes?|fornecedores?|empresas?|produtos?|itens?|links?)\b/i
];

const EXPLANATION_PATTERNS = [
  /\b(explique|explicar|o que e|o que eh|qual e o conceito|conceito de)\b/i
];

function normalizeTaskText(input) {
  return String(input || "").trim();
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function normalizeComparableText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function summarizeSatisfiedCriteria(criteria) {
  return Object.entries(criteria)
    .filter(([, satisfied]) => satisfied)
    .map(([name]) => name);
}

export function evaluateAgentTaskComplexity(input, options = {}) {
  const text = normalizeTaskText(input);
  const normalizedText = normalizeComparableText(text);
  const hasMedia = Boolean(options.hasMedia);
  const isStructuredOutputTask = matchesAny(normalizedText, STRUCTURED_OUTPUT_PATTERNS);
  const isExplanationTask = matchesAny(normalizedText, EXPLANATION_PATTERNS);
  const isTaskLike = text.length > 0 && (matchesAny(text, TASK_INTENT_PATTERNS) || isStructuredOutputTask || isExplanationTask);
  const isSearchTask = matchesAny(normalizedText, SEARCH_TASK_PATTERNS);

  const criteria = {
    requiresSearch: isSearchTask,
    requiresPlanning: matchesAny(text, PLANNING_PATTERNS),
    requiresMultipleSteps: matchesAny(text, MULTI_STEP_PATTERNS) || isStructuredOutputTask || isExplanationTask,
    hasIntermediateState: matchesAny(text, INTERMEDIATE_STATE_PATTERNS),
    hasCompletionCriteria: matchesAny(text, COMPLETION_CRITERIA_PATTERNS)
  };

  const satisfiedCriteria = summarizeSatisfiedCriteria(criteria);
  const shouldUseAgentRoute = (
    isTaskLike &&
    !hasMedia &&
    (
      criteria.requiresSearch ||
      criteria.requiresPlanning ||
      criteria.hasIntermediateState ||
      criteria.requiresMultipleSteps ||
      criteria.hasCompletionCriteria
    )
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
  const executionConfig = loadAgentExecutionConfig();
  const agentExecutionEngine = createAgentExecutionEngine(context, executionConfig);
  const toolLoopConfig = loadAgentToolLoopConfig();
  const agentToolLoop = createAgentToolLoop(context, toolLoopConfig);

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

  async function handleTask({ input, sessionId = "default", source = "user", executionId = null, webSearchEnabled = true }) {
    const decision = evaluateAgentTaskComplexity(input);
    const allowDirectSearchTask = decision.isTaskLike && decision.criteria?.requiresSearch && !decision.hasMedia;

    if (!decision.shouldUseAgentRoute && !allowDirectSearchTask) {
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
      reason: agentExecutionEngine.enabled ? "agent_execution_engine" : agentToolLoop.enabled ? "agent_tool_loop" : allowDirectSearchTask ? "direct_search_task" : decision.reason,
      criteria: decision.criteria,
      satisfiedCriteria: decision.satisfiedCriteria
    });

    if (agentExecutionEngine.enabled) {
      const result = await agentExecutionEngine.run({
        goal: input,
        sessionId,
        executionId,
        allowWebSearch: webSearchEnabled !== false
      });

      const finalText = String(result?.text || result?.answer || result?.error || "").trim();
      if (finalText && context.core?.responseQueue) {
        context.core.responseQueue.enqueue({
          text: finalText,
          speak: false,
          priority: 2,
          source: "agent-exec",
          sessionId,
          userFacing: true
        });
      }

      return {
        handled: result?.status === "ok",
        type: "agent-exec",
        result,
        decision
      };
    }

    if (agentToolLoop.enabled) {
      const result = await agentToolLoop.run({
        goal: input,
        sessionId,
        executionId,
        allowWebSearch: webSearchEnabled !== false
      });

      const finalText = String(result?.text || result?.answer || result?.error || "").trim();
      if (finalText && context.core?.responseQueue) {
        context.core.responseQueue.enqueue({
          text: finalText,
          speak: false,
          priority: 2,
          source: "agent-tool-loop",
          sessionId,
          userFacing: true
        });
      }

      return {
        handled: result?.status === "ok",
        type: "agent-tool-loop",
        result,
        decision
      };
    }

    const taskRoute = context.core?.routes?.task;
    if (taskRoute?.enqueueLongTask) {
      const taskId = await taskRoute.enqueueLongTask({
        text: input,
        sessionId,
        routeMode: "agent",
        routeSource: "agent-route",
        routeReason: decision,
        executionId,
        webSearchEnabled
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
      executionId,
      allowWebSearch: webSearchEnabled !== false
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
