import {
  hasUsableAssistantText,
  shouldSuppressAssistantMessage
} from "../../utils/assistantMessageGuard.js";
import { isSafeDiagnosticMode, shouldSilenceAutonomousSource } from "../../utils/runtimeGuards.js";

export default function createAgentRoute(context) {
  const state = context.state;
  const agentEngine = context.core?.agentEngine;
  let autonomousTaskRunning = false;
  let lastAutonomousTaskAt = 0;
  const AUTONOMOUS_TASK_INTERVAL = 60 * 1000;

  function isAutonomousTaskEnabled() {
    if (isSafeDiagnosticMode(context)) {
      return false;
    }

    return (
      context.config?.system?.enableAutonomousTask === true ||
      process.env.ENABLE_AUTONOMOUS_TASK === "true"
    );
  }

  function getAutonomousGoal() {
    return (
      context.config?.system?.autonomousTaskGoal ||
      process.env.AUTONOMOUS_TASK_GOAL ||
      ""
    ).trim();
  }

  function emitAgentEvent(type, payload) {
    if (!context.core?.eventBus) {
      console.warn("[AGENT-ROUTE] EventBus nao disponivel");
      return;
    }

    context.core.eventBus.emit(`agent:${type}`, {
      timestamp: Date.now(),
      source: "agent",
      ...payload
    });

    console.log(`[AGENT-ROUTE] Evento emitido: agent:${type}`);
  }

  function registerSchedulerJobs(scheduler) {
    if (!scheduler || typeof scheduler.register !== "function") {
      console.warn("[AGENT-ROUTE] Scheduler nao disponivel");
      return;
    }

    scheduler.register({
      name: "agent:randomtalk",
      priority: 5,
      enabled: !isSafeDiagnosticMode(context),
      execute: async () => {
        try {
          await executeRandomTalk();
        } catch (err) {
          console.error("[AGENT-ROUTE] Erro em randomTalk:", err.message);
        }
      }
    });

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

    scheduler.register({
      name: "agent:activity-comment",
      priority: 3,
      enabled: !isSafeDiagnosticMode(context),
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
      enabled: isAutonomousTaskEnabled(),
      execute: async () => {
        if (!agentEngine?.run) {
          return;
        }

        if (!isAutonomousTaskEnabled()) {
          return;
        }

        const runtimeBlock = shouldSilenceAutonomousSource(context, "autonomous-task");
        if (runtimeBlock.blocked) {
          return;
        }

        if (autonomousTaskRunning) return;

        const now = Date.now();
        if (now - lastAutonomousTaskAt < AUTONOMOUS_TASK_INTERVAL) {
          return;
        }

        const goal = getAutonomousGoal();
        if (!goal) {
          return;
        }

        autonomousTaskRunning = true;
        lastAutonomousTaskAt = now;

        try {
          await agentEngine.run({
            goal,
            sessionId: "auto",
            mode: "agent"
          });
        } catch (err) {
          console.error("[AGENT-ROUTE] Erro em autonomousTask:", err.message);
        } finally {
          autonomousTaskRunning = false;
        }
      }
    });

    console.log("[AGENT-ROUTE] Scheduler jobs registrados");
  }

  async function executeRandomTalk() {
    const runtimeBlock = shouldSilenceAutonomousSource(context, "randomTalk");
    if (runtimeBlock.blocked) {
      return;
    }

    const randomTalkSkill = context.core.skillManager.get("randomTalk");

    if (!randomTalkSkill || typeof randomTalkSkill.execute !== "function") {
      return;
    }

    try {
      const result = await randomTalkSkill.execute({ context });

      if (result && result.text) {
        emitAgentEvent("randomtalk", {
          text: result.text,
          voice: result.voice || "default"
        });
      }
    } catch (err) {
      console.error("[AGENT-ROUTE] RandomTalk erro:", err);
    }
  }

  async function executeNeedsAnalysis() {
    const needsSkill = context.core.skillManager.get("needs");

    if (!needsSkill || typeof needsSkill.execute !== "function") {
      return;
    }

    try {
      const result = await needsSkill.execute({ context });

      if (result && result.triggered) {
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

  async function executeReminders() {
    const tasksSkill = context.core.skillManager.get("tasks");

    if (!tasksSkill || typeof tasksSkill.checkReminders !== "function") {
      return;
    }

    try {
      const reminders = await tasksSkill.checkReminders();

      if (reminders && reminders.length > 0) {
        for (const reminder of reminders) {
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

  async function executeActivityComment() {
    const runtimeBlock = shouldSilenceAutonomousSource(context, "activity-comment");
    if (runtimeBlock.blocked) {
      return;
    }

    const commentSkill = context.core.skillManager.get("commentActivity");

    if (!commentSkill || typeof commentSkill.execute !== "function") {
      return;
    }

    try {
      const result = await commentSkill.execute({ context });

      if (result && result.text) {
        emitAgentEvent("activity-comment", {
          text: result.text,
          activity: result.activity
        });
      }
    } catch (err) {
      console.error("[AGENT-ROUTE] ActivityComment erro:", err);
    }
  }

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

  function shouldEmitPreparedText(source, text) {
    const suppression = shouldSuppressAssistantMessage(context, text, { source });
    return hasUsableAssistantText(text) && !suppression.blocked;
  }

  function handleRandomTalk(data) {
    if (!shouldEmitPreparedText("randomTalk", data?.text)) {
      return null;
    }

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
    if (!shouldEmitPreparedText("activity-comment", data?.text)) {
      return null;
    }

    console.log("[AGENT-ROUTE] Comentario de atividade:", data.text.substring(0, 50));

    if (context.core?.eventBus) {
      context.core.eventBus.emit("agent:activity-ready", {
        text: data.text,
        activity: data.activity,
        timestamp: Date.now()
      });
    }
  }

  function getAgentStatus() {
    return {
      isScheduled: true,
      eventBusReady: !!context.core?.eventBus,
      safeDiagnosticMode: isSafeDiagnosticMode(context),
      skillsLoaded: {
        randomTalk: !!context.core?.skillManager?.get("randomTalk"),
        needs: !!context.core?.skillManager?.get("needs"),
        tasks: !!context.core?.skillManager?.get("tasks"),
        commentActivity: !!context.core?.skillManager?.get("commentActivity")
      },
      autonomousTask: {
        enabled: isAutonomousTaskEnabled(),
        engineReady: !!agentEngine?.run,
        goalConfigured: !!getAutonomousGoal(),
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
