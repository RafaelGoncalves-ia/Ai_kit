export default function createOrchestrator(context) {
  const state = context.state;

  let orchestratorReady = false;
  let initializePromise = null;
  let agentRouteInitPromise = null;
  let agentRouteReady = false;
  let responseListenerCleanup = null;
  let agentBridgeCleanup = null;

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

        setupAgentResponseListeners();

        orchestratorReady = true;
        console.log("[ORCHESTRATOR] Orchestrator inicializado com rotas realtime/task");

        void ensureAgentRouteInitialized().catch((err) => {
          console.error("[ORCHESTRATOR] Falha no bootstrap lazy da AgentRoute:", err);
        });

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

        const agentRoute = context.core.routes.agent;

        setupAgentEventBridge(agentRoute);

        if (context.scheduler) {
          agentRoute.registerSchedulerJobs(context.scheduler);
          console.log("[ORCHESTRATOR] Agent jobs registrados no scheduler");
        }

        agentRouteReady = true;
        console.log("[ORCHESTRATOR] AgentRoute inicializada");

        return agentRoute;
      } catch (err) {
        console.error("[ORCHESTRATOR] Erro ao inicializar AgentRoute:", err);
        throw err;
      } finally {
        agentRouteInitPromise = null;
      }
    })();

    return agentRouteInitPromise;
  }

  function setupAgentResponseListeners() {
    if (responseListenerCleanup || !context.core?.eventBus) {
      return;
    }

    const eventBus = context.core.eventBus;
    const listeners = [];

    function addListener(eventName, handler) {
      eventBus.on(eventName, handler);
      listeners.push([eventName, handler]);
    }

    addListener("agent:randomtalk-ready", async (data) => {
      console.log("[ORCHESTRATOR] Capturando agent:randomtalk-ready");
      if (context.core?.responseQueue) {
        context.core.responseQueue.enqueue({
          text: data.text,
          speak: true,
          priority: 3,
          source: "randomTalk"
        });
      }
    });

    addListener("agent:reminder-ready", async (data) => {
      console.log("[ORCHESTRATOR] Capturando agent:reminder-ready");
      if (context.core?.responseQueue) {
        context.core.responseQueue.enqueue({
          text: `Lembrete: ${data.title} - ${data.message}`,
          speak: true,
          priority: 5,
          source: "reminder",
          allowGeneric: true
        });
      }
    });

    addListener("agent:needs-ready", async (data) => {
      console.log("[ORCHESTRATOR] Capturando agent:needs-ready");
      if (context.core?.responseQueue && data.action) {
        context.core.responseQueue.enqueue({
          text: data.action,
          speak: true,
          priority: 4,
          source: "needs"
        });
      }
    });

    addListener("agent:activity-ready", async (data) => {
      console.log("[ORCHESTRATOR] Capturando agent:activity-ready");
      if (context.core?.responseQueue) {
        context.core.responseQueue.enqueue({
          text: data.text,
          speak: true,
          priority: 2,
          source: "activity-comment"
        });
      }
    });

    responseListenerCleanup = () => {
      for (const [eventName, handler] of listeners) {
        eventBus.off(eventName, handler);
      }
      responseListenerCleanup = null;
    };

    console.log("[ORCHESTRATOR] Event listeners de resposta do AgentRoute configurados");
  }

  function setupAgentEventBridge(agentRoute) {
    agentBridgeCleanup?.();

    if (!context.core?.eventBus || !agentRoute?.handleAgentEvent) {
      return;
    }

    const eventBus = context.core.eventBus;
    const listeners = [];

    function bind(eventName, eventType) {
      const handler = async (data) => {
        await agentRoute.handleAgentEvent(eventType, data);
      };

      eventBus.on(eventName, handler);
      listeners.push([eventName, handler]);
    }

    bind("agent:randomtalk", "randomtalk");
    bind("agent:reminder", "reminder");
    bind("agent:needs-triggered", "needs-triggered");
    bind("agent:activity-comment", "activity-comment");

    agentBridgeCleanup = () => {
      for (const [eventName, handler] of listeners) {
        eventBus.off(eventName, handler);
      }
      agentBridgeCleanup = null;
    };

    console.log("[ORCHESTRATOR] Bridge de eventos do AgentRoute configurado");
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

      state.user.isActive = true;
      state.user.lastSeen = Date.now();

      const intent = detectIntent(normalizedInput);
      const realtimeRoute = context.core.routes.realtime;
      const taskRoute = context.core.routes.task;

      if (!realtimeRoute || !taskRoute) {
        throw new Error("Rotas nao inicializadas");
      }

      if (intent.requiresLongTask && !hasMedia) {
        console.log("[ORCHESTRATOR] -> TaskRoute (long task)");

        const isBusy = taskRoute.isAudioBusy?.();
        if (isBusy) {
          return { handled: false, busy: true };
        }

        const taskId = await taskRoute.enqueueLongTask({
          text: normalizedInput,
          sessionId
        });

        return { handled: true, type: "task", taskId };
      }

      console.log("[ORCHESTRATOR] -> RealtimeRoute (realtime)");

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
        allowGeneric: true
      });

      return { handled: false, error: err.message };
    }
  }

  function detectIntent(text) {
    const lower = String(text || "").toLowerCase();
    const explicitPatterns = [
      /\b(crie|criar|gere|gerar|escreva|escrever|desenvolva|desenvolver|monte|montar|produza|produzir|salve|salvar)\b.*\b(arquivo|pasta|projeto|campanha|roteiro|legenda|texto|audio|imagem|documento|codigo)\b/,
      /\b(corrija|corrigir)\b.*\b(codigo|arquivo|texto|erro|bug|projeto)\b/
    ];

    return {
      requiresLongTask: explicitPatterns.some((pattern) => pattern.test(lower))
    };
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
