import createAgentEngine from "../AgentEngine.js";

/**
 * AGENT ROUTE (Rota Autônoma)
 * 
 * Responsabilidades:
 * - Execução de ações SEM input direto do usuário
 * - Integração com scheduler
 * - NUNCA responder diretamente ao usuário
 * - Emitir eventos para serem capturados por outras rotas
 * 
 * Controlada por:
 * - Scheduler (periodicamente)
 * - EventBus (baseado em eventos)
 * - Skills de autonomia (randomTalk, needsEngine, etc)
 * 
 * Exemplos:
 * - Lembretes agendados
 * - RandomTalk/Notícias
 * - Análise de necessidades
 * - Check de atividades
 * - Síntese de dados em background
 */

export default function createAgentRoute(context) {
  const state = context.state;
  const agentEngine = createAgentEngine(context);
  let autonomousTaskRunning = false;
  let lastAutonomousTaskAt = 0;
  const AUTONOMOUS_TASK_INTERVAL = 60 * 1000;

  // ==========================================
  // EMIT AGENT EVENT
  // ==========================================
  /**
   * Emite evento para outras rotas capturarem
   * Nunca enfileira resposta diretamente!
   */
  function emitAgentEvent(type, payload) {
    if (!context.core?.eventBus) {
      console.warn("[AGENT-ROUTE] EventBus não disponível");
      return;
    }

    context.core.eventBus.emit(`agent:${type}`, {
      timestamp: Date.now(),
      source: "agent",
      ...payload
    });

    console.log(`[AGENT-ROUTE] Evento emitido: agent:${type}`);
  }

  // ==========================================
  // SCHEDULE JOB INTEGRATION
  // ==========================================
  /**
   * Registra job no scheduler
   * Chamado durante inicialização
   */
  function registerSchedulerJobs(scheduler) {
    if (!scheduler || typeof scheduler.register !== "function") {
      console.warn("[AGENT-ROUTE] Scheduler não disponível");
      return;
    }

    // Job de RandomTalk
    scheduler.register({
      name: "agent:randomtalk",
      priority: 5,
      enabled: true,
      execute: async () => {
        try {
          await executeRandomTalk();
        } catch (err) {
          console.error("[AGENT-ROUTE] Erro em randomTalk:", err.message);
        }
      }
    });

    // Job de análise de necessidades
    scheduler.register({
      name: "agent:needs-analysis",
      priority: 4,
      enabled: true,
      execute: async () => {
        try {
          await executeNeedsAnalysis();
        } catch (err) {
          console.error("[AGENT-ROUTE] Erro em needsAnalysis:", err.message);
        }
      }
    });

    // Job de lembretes
    scheduler.register({
      name: "agent:reminders",
      priority: 6,
      enabled: true,
      execute: async () => {
        try {
          await executeReminders();
        } catch (err) {
          console.error("[AGENT-ROUTE] Erro em reminders:", err.message);
        }
      }
    });

    // Job de comentário de atividade
    scheduler.register({
      name: "agent:activity-comment",
      priority: 3,
      enabled: true,
      execute: async () => {
        try {
          await executeActivityComment();
        } catch (err) {
          console.error("[AGENT-ROUTE] Erro em activityComment:", err.message);
        }
      }
    });

    scheduler.register({
      name: "agent:autonomous-task",
      priority: 2,
      enabled: true,
      execute: async () => {
        if (autonomousTaskRunning) return;

        const now = Date.now();
        if (now - lastAutonomousTaskAt < AUTONOMOUS_TASK_INTERVAL) {
          return;
        }

        autonomousTaskRunning = true;
        lastAutonomousTaskAt = now;

        try {
          await agentEngine.run({
            goal: "criar campanha com imagens e gerar legenda e audio",
            sessionId: "auto"
          });
        } catch (err) {
          console.error("[AGENT-ROUTE] Erro em autonomousTask:", err.message);
        } finally {
          autonomousTaskRunning = false;
        }
      }
    });

    console.log("[AGENT-ROUTE] 5 scheduler jobs registrados");
  }

  // ==========================================
  // RANDOM TALK
  // ==========================================
  async function executeRandomTalk() {
    const randomTalkSkill = context.core.skillManager.get("randomTalk");

    if (!randomTalkSkill || typeof randomTalkSkill.execute !== "function") {
      return;
    }

    try {
      const result = await randomTalkSkill.execute({ context });

      if (result && result.text) {
        // Emite evento para RealtimeRoute capturar e falar
        emitAgentEvent("randomtalk", {
          text: result.text,
          voice: result.voice || "default"
        });
      }
    } catch (err) {
      console.error("[AGENT-ROUTE] RandomTalk erro:", err);
    }
  }

  // ==========================================
  // NEEDS ANALYSIS
  // ==========================================
  async function executeNeedsAnalysis() {
    const needsSkill = context.core.skillManager.get("needs");

    if (!needsSkill || typeof needsSkill.execute !== "function") {
      return;
    }

    try {
      const result = await needsSkill.execute({ context });

      if (result && result.triggered) {
        // Emite evento se alguma necessidade foi acionada
        emitAgentEvent("needs-triggered", {
          need: result.need,
          level: result.level,
          action: result.action
        });
      }
    } catch (err) {
      console.error("[AGENT-ROUTE] NeedsAnalysis erro:", err);
    }
  }

  // ==========================================
  // REMINDERS
  // ==========================================
  async function executeReminders() {
    const tasksSkill = context.core.skillManager.get("tasks");

    if (!tasksSkill || typeof tasksSkill.checkReminders !== "function") {
      return;
    }

    try {
      const reminders = await tasksSkill.checkReminders();

      if (reminders && reminders.length > 0) {
        for (const reminder of reminders) {
          // Emite evento de lembrete
          emitAgentEvent("reminder", {
            title: reminder.title,
            message: reminder.message,
            client: reminder.client
          });
        }
      }
    } catch (err) {
      console.error("[AGENT-ROUTE] Reminders erro:", err);
    }
  }

  // ==========================================
  // ACTIVITY COMMENT
  // ==========================================
  async function executeActivityComment() {
    const commentSkill = context.core.skillManager.get("commentActivity");

    if (!commentSkill || typeof commentSkill.execute !== "function") {
      return;
    }

    try {
      const result = await commentSkill.execute({ context });

      if (result && result.text) {
        // Emite comentário de atividade
        emitAgentEvent("activity-comment", {
          text: result.text,
          activity: result.activity
        });
      }
    } catch (err) {
      console.error("[AGENT-ROUTE] ActivityComment erro:", err);
    }
  }

  // ==========================================
  // HANDLE AGENT EVENT
  // ==========================================
  /**
   * Processa evento emitido por AgentRoute
   * E delega para rota apropriada
   * 
   * Esta função é chamada por listeners de eventos
   */
  async function handleAgentEvent(eventType, eventData) {
    console.log(`[AGENT-ROUTE] Processando evento: ${eventType}`);

    switch (eventType) {
      case "randomtalk":
        return handleRandomTalk(eventData);

      case "reminder":
        return handleReminder(eventData);

      case "needs-triggered":
        return handleNeedsTriggered(eventData);

      case "activity-comment":
        return handleActivityComment(eventData);

      default:
        console.warn(`[AGENT-ROUTE] Evento desconhecido: ${eventType}`);
        return null;
    }
  }

  // ==========================================
  // EVENT HANDLERS (Delegam para rotas)
  // ==========================================
  function handleRandomTalk(data) {
    // RandomTalk é emitido via eventBus
    // A UI/Frontend vai capturar e exibir
    console.log("[AGENT-ROUTE] RandomTalk emitido:", data.text.substring(0, 50));

    if (context.core?.eventBus) {
      context.core.eventBus.emit("agent:randomtalk-ready", {
        text: data.text,
        voice: data.voice,
        timestamp: Date.now()
      });
    }
  }

  function handleReminder(data) {
    // Lembretes são emitidos e capturados pela UI
    console.log("[AGENT-ROUTE] Lembrete:", data.title);

    if (context.core?.eventBus) {
      context.core.eventBus.emit("agent:reminder-ready", {
        title: data.title,
        message: data.message,
        client: data.client,
        timestamp: Date.now()
      });
    }
  }

  function handleNeedsTriggered(data) {
    // Necessidades acionadas geram eventos
    console.log(`[AGENT-ROUTE] Necessidade acionada: ${data.need} (${data.level})`);

    if (context.core?.eventBus) {
      context.core.eventBus.emit("agent:needs-ready", {
        need: data.need,
        level: data.level,
        action: data.action,
        timestamp: Date.now()
      });
    }
  }

  function handleActivityComment(data) {
    // Comentários de atividade são emitidos
    console.log("[AGENT-ROUTE] Comentário de atividade:", data.text.substring(0, 50));

    if (context.core?.eventBus) {
      context.core.eventBus.emit("agent:activity-ready", {
        text: data.text,
        activity: data.activity,
        timestamp: Date.now()
      });
    }
  }

  // ==========================================
  // RETRIEVE AGENT STATE
  // ==========================================
  function getAgentStatus() {
    return {
      isScheduled: true,
      eventBusReady: !!context.core?.eventBus,
      skillsLoaded: {
        randomTalk: !!context.core?.skillManager?.get("randomTalk"),
        needs: !!context.core?.skillManager?.get("needs"),
        tasks: !!context.core?.skillManager?.get("tasks"),
        commentActivity: !!context.core?.skillManager?.get("commentActivity")
      },
      autonomousTask: {
        running: autonomousTaskRunning,
        lastRunAt: lastAutonomousTaskAt || null
      }
    };
  }

  return {
    registerSchedulerJobs,
    handleAgentEvent,
    emitAgentEvent,
    getAgentStatus
  };
}
