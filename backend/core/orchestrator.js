function detectIntent(text) {
  const lower = String(text || "").toLowerCase();
  const explicitTaskPatterns = [
    /\b(crie|criar|gere|gerar|escreva|escrever|desenvolva|desenvolver|monte|montar|produza|produzir|salve|salvar)\b.*\b(arquivo|pasta|projeto|campanha|roteiro|legenda|texto|audio|imagem|documento|codigo)\b/,
    /\b(corrija|corrigir)\b.*\b(codigo|arquivo|texto|erro|bug|projeto)\b/,
    /\b(planeje|planejar|organize|organizar|estruture|estruturar|resuma|resumir|liste|listar|analise|analisar)\b/,
    /\b(lista|resumo|relatorio|documento|analise)\b/
  ];

  return {
    requiresLongTask: explicitTaskPatterns.some((pattern) => pattern.test(lower))
  };
}

export default function createOrchestrator(context) {
  let orchestratorReady = false;
  let initializePromise = null;
  let agentRouteInitPromise = null;
  let agentRouteReady = false;

  async function initialize() {
    if (orchestratorReady) {
      return getStatus();
    }

    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = (async () => {
      try {
        const { default: createRealtimeRoute } = await import("./routes/realtimeRoute.js");
        const { default: createTaskRoute } = await import("./routes/taskRoute.js");

        if (!context.core.routes) {
          context.core.routes = {};
        }

        if (!context.core.routes.realtime) {
          context.core.routes.realtime = createRealtimeRoute(context);
        }

        if (!context.core.routes.task) {
          context.core.routes.task = createTaskRoute(context);
        }

        orchestratorReady = true;
        console.log("[ORCHESTRATOR] Orchestrator inicializado com rotas realtime/task");

        return getStatus();
      } catch (err) {
        console.error("[ORCHESTRATOR] Erro ao inicializar rotas:", err);
        throw err;
      } finally {
        initializePromise = null;
      }
    })();

    return initializePromise;
  }

  async function ensureAgentRouteInitialized() {
    if (agentRouteReady && context.core?.routes?.agent) {
      return context.core.routes.agent;
    }

    if (agentRouteInitPromise) {
      return agentRouteInitPromise;
    }

    agentRouteInitPromise = (async () => {
      try {
        const { default: createAgentRoute } = await import("./routes/agentRoute.js");

        if (!context.core.routes) {
          context.core.routes = {};
        }

        if (!context.core.routes.agent) {
          context.core.routes.agent = createAgentRoute(context);
        }

        agentRouteReady = true;
        console.log("[ORCHESTRATOR] AgentRoute inicializada sob demanda");

        return context.core.routes.agent;
      } catch (err) {
        console.error("[ORCHESTRATOR] Erro ao inicializar AgentRoute:", err);
        throw err;
      } finally {
        agentRouteInitPromise = null;
      }
    })();

    return agentRouteInitPromise;
  }

  async function resolveRouteDecision({ input, hasMedia }) {
    const intent = detectIntent(input);

    if (!intent.requiresLongTask || hasMedia) {
      return {
        route: "realtime",
        reason: hasMedia ? "media_request_stays_realtime" : "quick_interaction"
      };
    }

    const { evaluateAgentTaskComplexity } = await import("./routes/agentRoute.js");
    const complexity = evaluateAgentTaskComplexity(input, { hasMedia });

    if (complexity.shouldUseAgentRoute) {
      return {
        route: "agent",
        reason: complexity.reason,
        complexity
      };
    }

    return {
      route: "task",
      reason: complexity.reason,
      complexity
    };
  }

  async function handle({
    input,
    source = "user",
    sessionId = "default",
    filePath = null,
    screenshotPath = null,
    mediaType = null
  }) {
    if (!orchestratorReady) {
      console.error("[ORCHESTRATOR] Orchestrator nao inicializado");
      return { handled: false, error: "Orchestrator nao ready" };
    }

    const normalizedInput = typeof input === "string" ? input : "";
    const hasMedia = Boolean(filePath || screenshotPath);

    if (!normalizedInput && !hasMedia) {
      return { handled: false, error: "Input invalido" };
    }

    try {
      if (source === "user") {
        try {
          context.core.responseQueue.cancelTTS?.();
        } catch (err) {
          console.error("[ORCHESTRATOR] Erro ao cancelar TTS:", err.message);
        }
      }

      const realtimeRoute = context.core.routes.realtime;
      const taskRoute = context.core.routes.task;

      if (!realtimeRoute || !taskRoute) {
        throw new Error("Rotas nao inicializadas");
      }

      const decision = await resolveRouteDecision({
        input: normalizedInput,
        hasMedia
      });

      if (decision.route === "agent") {
        const agentRoute = await ensureAgentRouteInitialized();

        console.log("[ORCHESTRATOR] -> AgentRoute", {
          sessionId,
          reason: decision.reason,
          criteria: decision.complexity?.criteria || {},
          satisfiedCriteria: decision.complexity?.satisfiedCriteria || []
        });

        return await agentRoute.handleTask({
          input: normalizedInput,
          source,
          sessionId
        });
      }

      if (decision.route === "task") {
        console.log("[ORCHESTRATOR] -> TaskRoute", {
          sessionId,
          reason: decision.reason,
          criteria: decision.complexity?.criteria || {}
        });

        const isBusy = taskRoute.isAudioBusy?.();
        if (isBusy) {
          return { handled: false, busy: true };
        }

        const taskId = await taskRoute.enqueueLongTask({
          text: normalizedInput,
          sessionId,
          routeMode: "task",
          routeSource: "task-route",
          routeReason: decision.complexity || null
        });

        return {
          handled: true,
          type: "task",
          taskId,
          complexity: decision.complexity || null
        };
      }

      console.log("[ORCHESTRATOR] -> RealtimeRoute", {
        sessionId,
        reason: decision.reason
      });

      return await realtimeRoute.handle({
        input: normalizedInput,
        images: [],
        sessionId,
        filePath,
        screenshotPath,
        mediaType
      });
    } catch (err) {
      console.error("[ORCHESTRATOR] Erro critico:", err);

      context.core.responseQueue.enqueue({
        text: "Algo deu errado.",
        speak: false,
        priority: 1,
        source: "orchestrator-error",
        allowGeneric: true,
        userFacing: true,
        sessionId
      });

      return { handled: false, error: err.message };
    }
  }

  function getStatus() {
    if (!orchestratorReady) {
      return { ready: false };
    }

    const realtimeRoute = context.core.routes.realtime;
    const taskRoute = context.core.routes.task;
    const agentRoute = context.core.routes.agent;

    return {
      ready: true,
      routes: {
        realtime: !!realtimeRoute,
        task: taskRoute ? taskRoute.getQueueStatus() : null,
        agent: agentRoute ? agentRoute.getAgentStatus() : null
      },
      initialization: {
        orchestratorReady,
        agentRouteReady,
        agentRouteInitializing: !!agentRouteInitPromise
      }
    };
  }

  return {
    initialize,
    handle,
    getStatus
  };
}
