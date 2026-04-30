function formatElapsed(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function sanitizeLine(value = "", maxLength = 240) {
  const cleaned = String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

export function createAgentTrace(context, options = {}) {
  const config = options.config || {};
  const traceConfig = config.trace || {};
  const eventBus = context.core?.eventBus;
  const maxLineLength = Math.max(40, Number(traceConfig.maxLineLength || 240));
  const startedAt = Date.now();
  const runId = options.runId || `agent_run_${startedAt}_${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = options.sessionId || "default";

  const state = {
    id: runId,
    status: "running",
    startedAt,
    endedAt: null,
    elapsedMs: 0,
    lines: []
  };

  function title() {
    return `Worked for ${formatElapsed((state.endedAt || Date.now()) - state.startedAt)}`;
  }

  function emit(type, payload = {}) {
    eventBus?.emit(type, {
      runId,
      sessionId,
      ...payload
    });
  }

  function start() {
    if (config.showTraceInChat === false) return;
    emit("agent_trace_started", {
      title: title(),
      collapsed: false,
      startedAt: state.startedAt
    });
  }

  function add(type, text) {
    const safeText = sanitizeLine(text, maxLineLength);
    if (!safeText) return null;

    const entry = {
      type,
      text: safeText,
      timestamp: Date.now()
    };

    state.lines.push(entry);
    const line = `| ${type}: ${safeText}`;

    if (config.showTraceInChat !== false) {
      emit("agent_trace_line", {
        line,
        entry
      });
    }

    return entry;
  }

  function addRaw(type, lineText) {
    const safeText = sanitizeLine(lineText, maxLineLength);
    if (!safeText) return null;

    const entry = {
      type,
      text: safeText,
      timestamp: Date.now()
    };

    state.lines.push(entry);
    const line = safeText.startsWith("|") ? safeText : `| ${safeText}`;

    if (config.showTraceInChat !== false) {
      emit("agent_trace_line", {
        line,
        entry
      });
    }

    return entry;
  }

  function finish(patch = {}) {
    state.status = patch.status || "done";
    state.endedAt = Date.now();
    state.elapsedMs = state.endedAt - state.startedAt;

    if (config.showTraceInChat !== false) {
      emit("agent_trace_finished", {
        title: title(),
        collapsed: config.collapseTraceOnFinal !== false,
        elapsedMs: state.elapsedMs,
        status: state.status
      });
    }
  }

  return {
    runId,
    state,
    start,
    add,
    addRaw,
    finish,
    title: () => title()
  };
}

