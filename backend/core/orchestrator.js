/**
 * ORCHESTRATOR REFATORADO (V2)
 * 
 * Responsabilidade Principal:
 * - Carregar e coordenar as 3 rotas independentes
 * - Decidir qual rota processa cada requisição
 * - Orquestrar komunikação entre rotas via eventBus
 * 
 * Fluxo:
 * 1. Input do usuário chega → orchestrator.handle()
 * 2. Decidir: RealtimeRoute vs TaskRoute
 * 3. Delegar para rota apropriada
 * 4. Resposta via eventBus
 * 
 * AgentRoute:
 * - Roda independentemente via scheduler
 * - Nunca chamada diretamente
 * - Comunica via eventBus
 */

export default function createOrchestrator(context) {
  const state = context.state;

  let orchestratorReady = false;
  let initializePromise = null;
  let agentRouteInitPromise = null;
  let agentRouteReady = false;
  let responseListenerCleanup = null;
  let agentBridgeCleanup = null;

  // ==========================================
  // INITIALIZE ROUTES (Dynamic Import)
  // ==========================================
  async function initialize() {
    if (orchestratorReady) {
      return getStatus();
    }

    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = (async () => {
      try {
        // Imports dinâmicos para não carregar dependências externas desnecessariamente
        const { default: createRealtimeRoute } = await import("./routes/realtimeRoute.js");
        const { default: createTaskRoute } = await import("./routes/taskRoute.js");

        // Criar rotas apenas uma vez
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
        console.log("[ORCHESTRATOR] ✅ Orchestrator inicializado com rotas realtime/task");

        // AgentRoute é pesada e não precisa bloquear startup.
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

  // ==========================================
  // INITIALIZE AGENT ROUTE (Lazy + Idempotent)
  // ==========================================
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
        console.log("[ORCHESTRATOR] ✅ AgentRoute inicializada");

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

  // ==========================================
  // SETUP AGENT RESPONSE LISTENERS
  // ==========================================
  function setupAgentResponseListeners() {
    if (responseListenerCleanup) {
      return;
    }

    if (!context.core?.eventBus) return;

    const eventBus = context.core.eventBus;
    const listeners = [];

    function addListener(eventName, handler) {
      eventBus.on(eventName, handler);
      listeners.push([eventName, handler]);
    }

    // Listener para eventos de agentRoute
    addListener("agent:randomtalk-ready", async (data) => {
      console.log("[ORCHESTRATOR] Capturando agent:randomtalk-ready");
      // Enfileira para TTS se apropriado
      if (context.core?.responseQueue) {
        context.core.responseQueue.enqueue({
          text: data.text,
          speak: true,
          priority: 3
        });
      }
    });

    addListener("agent:reminder-ready", async (data) => {
      console.log("[ORCHESTRATOR] Capturando agent:reminder-ready");
      // Enfileira lembrete
      if (context.core?.responseQueue) {
        context.core.responseQueue.enqueue({
          text: `Lembrete: ${data.title} - ${data.message}`,
          speak: true,
          priority: 5  // Lembretes têm alta prioridade
        });
      }
    });

    addListener("agent:needs-ready", async (data) => {
      console.log("[ORCHESTRATOR] Capturando agent:needs-ready");
      // Processamento de necessidades
      if (context.core?.responseQueue && data.action) {
        context.core.responseQueue.enqueue({
          text: data.action,
          speak: true,
          priority: 4
        });
      }
    });

    addListener("agent:activity-ready", async (data) => {
      console.log("[ORCHESTRATOR] Capturando agent:activity-ready");
      // Comentário de atividade
      if (context.core?.responseQueue) {
        context.core.responseQueue.enqueue({
          text: data.text,
          speak: true,
          priority: 2
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

  // ==========================================
  // SETUP AGENT EVENT BRIDGE
  // ==========================================
  function setupAgentEventBridge(agentRoute) {
    agentBridgeCleanup?.();

    if (!context.core?.eventBus || !agentRoute?.handleAgentEvent) return;

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

  // ==========================================
  // MAIN HANDLE (USER INPUT)
  // ==========================================
  /**
   * Processa entrada do usuário
   * Decide entre RealtimeRoute e TaskRoute
   */
  async function handle({ input, source = "user" }) {
    if (!orchestratorReady) {
      console.error("[ORCHESTRATOR] Orchestrator não inicializado");
      return { handled: false, error: "Orchestrator não ready" };
    }

    if (!input || typeof input !== "string") {
      return { handled: false, error: "Input inválido" };
    }

    try {
      // 🔊 Cancelar TTS anterior para nova entrada
      if (source === "user") {
        try {
          context.core.responseQueue.cancelTTS?.();
        } catch (err) {
          console.error("[ORCHESTRATOR] Erro ao cancelar TTS:", err.message);
        }
      }

      // Atualizar stato de usuário
      state.user.isActive = true;
      state.user.lastSeen = Date.now();

      // ========================
      // DETECTAR TIPO DE AÇÃO
      // ========================
      const intent = detectIntent(input);

      // ========================
      // DECIDIR ROTA
      // ========================
      const realtimeRoute = context.core.routes.realtime;
      const taskRoute = context.core.routes.task;

      if (!realtimeRoute || !taskRoute) {
        throw new Error("Rotas não inicializadas");
      }

      // 🔥 Se requer tarefa longa → TaskRoute
      if (intent.requiresLongTask) {
        console.log("[ORCHESTRATOR] → TaskRoute (long task)");

        // Não processar se audio estiver ocupado (compatibilidade)
        const isBusy = taskRoute.isAudioBusy?.();
        if (isBusy) {
          context.core.responseQueue.enqueue({
            text: "Espera, estou ocupada com uma tarefa...",
            speak: true,
            priority: 1
          });
          return { handled: false, busy: true };
        }

        // Resposta rápida que diz que vai processar
        context.core.responseQueue.enqueue({
          text: "Deixa eu processar isso com cuidado...",
          speak: true,
          priority: 1
        });

        // Enfileira na task route
        const taskId = await taskRoute.enqueueLongTask({
          text: input,
          memoryContext: await getMemoryContext(),
          searchResult: null
        });

        return { handled: true, type: "task", taskId };
      }

      // 🔥 Caso padrão → RealtimeRoute
      console.log("[ORCHESTRATOR] → RealtimeRoute (realtime)");

      const result = await realtimeRoute.handle({
        input,
        images: []
      });

      return result;

    } catch (err) {
      console.error("[ORCHESTRATOR] Erro crítico:", err);

      context.core.responseQueue.enqueue({
        text: "Algo deu errado 😅",
        speak: false,
        priority: 1
      });

      return { handled: false, error: err.message };
    }
  }

  // ==========================================
  // INTENT DETECTION
  // ==========================================
  function detectIntent(text) {
    const lower = text.toLowerCase();

    const longTriggers = ["arquivo", "escreva", "corrija", "crie", "desenvolva"];

    return {
      requiresLongTask: longTriggers.some(t => lower.includes(t))
    };
  }

  // ==========================================
  // GET MEMORY CONTEXT
  // ==========================================
  async function getMemoryContext() {
    const memorySkill = context.core.skillManager.get("memory");
    if (!memorySkill) return "";

    try {
      return await memorySkill.getContext();
    } catch {
      return "";
    }
  }

  // ==========================================
  // GET STATUS
  // ==========================================
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
