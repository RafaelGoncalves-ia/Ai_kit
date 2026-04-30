import { isValidPlainDomain } from "./ToolRequestParser.js";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function cleanJsonCandidate(text = "") {
  return String(text || "")
    .replace(/<\|think\|>/gi, "")
    .replace(/<\|channel\|>\s*(analysis|thought|final)\s*/gi, "")
    .replace(/<\|message\|>/gi, "")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function extractJsonCandidates(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);

  for (let start = raw.indexOf("{"); start >= 0; start = raw.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(raw.slice(start, index + 1));
          break;
        }
      }
    }
  }

  candidates.push(raw);
  return [...new Set(candidates.map(cleanJsonCandidate).filter(Boolean))];
}

function cleanTaskId(value = "") {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
}

function normalizeSources(sources = []) {
  if (!Array.isArray(sources)) return [];

  return sources
    .filter((source) => source && typeof source === "object")
    .map((source) => ({
      title: String(source.title || "Fonte sem titulo").trim().slice(0, 180),
      url: String(source.url || "").trim(),
      domain: String(source.domain || "").trim().slice(0, 120)
    }))
    .filter((source) => source.title || source.url || source.domain)
    .slice(0, 12);
}

export function validateAgentStep(candidate, options = {}) {
  const allowedTools = Array.isArray(options.allowedTools) ? options.allowedTools : [];
  const knownTaskIds = Array.isArray(options.taskIds) ? options.taskIds : [];

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, error: "invalid_step_object" };
  }

  if (candidate.type === "tool_request") {
    const taskId = cleanTaskId(candidate.taskId);
    const tool = String(candidate.tool || "").trim();
    const input = candidate.input && typeof candidate.input === "object" && !Array.isArray(candidate.input)
      ? candidate.input
      : {};
    const query = String(input.query || "").trim();
    const domain = input.domain === null || input.domain === undefined
      ? null
      : String(input.domain).trim().toLowerCase();

    if (!taskId || (knownTaskIds.length && !knownTaskIds.includes(taskId))) {
      return { ok: false, error: "invalid_task_id" };
    }

    if (!allowedTools.includes(tool)) {
      return { ok: false, error: "tool_not_allowed" };
    }

    if (tool !== "web_search") {
      return { ok: false, error: "unsupported_tool" };
    }

    if (!query) {
      return { ok: false, error: "empty_query" };
    }

    if (domain && !isValidPlainDomain(domain)) {
      return { ok: false, error: "invalid_domain" };
    }

    return {
      ok: true,
      value: {
        type: "tool_request",
        taskId,
        tool,
        reason: String(candidate.reason || "").replace(/\s+/g, " ").trim().slice(0, 240),
        input: {
          query,
          domain
        }
      }
    };
  }

  if (candidate.type === "task_update") {
    const taskId = cleanTaskId(candidate.taskId);
    const status = String(candidate.status || "").trim();
    const summary = String(candidate.summary || "").replace(/\s+/g, " ").trim();

    if (!taskId || (knownTaskIds.length && !knownTaskIds.includes(taskId))) {
      return { ok: false, error: "invalid_task_id" };
    }

    if (!["pending", "running", "completed", "failed"].includes(status)) {
      return { ok: false, error: "invalid_task_status" };
    }

    if (!summary) {
      return { ok: false, error: "empty_task_summary" };
    }

    return {
      ok: true,
      value: {
        type: "task_update",
        taskId,
        status,
        summary: summary.slice(0, 240)
      }
    };
  }

  if (candidate.type === "final") {
    const answer = String(candidate.answer || "").trim();
    if (!answer) {
      return { ok: false, error: "empty_final_answer" };
    }

    return {
      ok: true,
      value: {
        type: "final",
        answer,
        sources: normalizeSources(candidate.sources)
      }
    };
  }

  return { ok: false, error: "unsupported_step_type" };
}

export function parseAgentStep(text, options = {}) {
  for (const candidate of extractJsonCandidates(text)) {
    const parsed = safeJsonParse(candidate);
    if (!parsed) continue;

    const validated = validateAgentStep(parsed, options);
    if (validated.ok) return validated;
  }

  return { ok: false, error: "invalid_json" };
}
