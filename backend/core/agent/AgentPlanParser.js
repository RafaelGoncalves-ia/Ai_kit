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

function normalizeTaskId(value, index) {
  const raw = String(value || `task_${index + 1}`).trim();
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  return safe || `task_${index + 1}`;
}

export function validateAgentPlan(candidate, options = {}) {
  const maxPlanTasks = Math.max(1, Number(options.maxPlanTasks || 8));

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, error: "invalid_plan_object" };
  }

  if (candidate.type !== "plan") {
    return { ok: false, error: "invalid_plan_type" };
  }

  const goal = String(candidate.goal || "").trim();
  if (!goal) {
    return { ok: false, error: "empty_plan_goal" };
  }

  if (!Array.isArray(candidate.tasks) || candidate.tasks.length === 0) {
    return { ok: false, error: "empty_plan_tasks" };
  }

  if (candidate.tasks.length > maxPlanTasks) {
    return { ok: false, error: "too_many_plan_tasks" };
  }

  const seenIds = new Set();
  const tasks = [];

  for (let index = 0; index < candidate.tasks.length; index += 1) {
    const task = candidate.tasks[index];
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      return { ok: false, error: "invalid_task_object" };
    }

    const id = normalizeTaskId(task.id, index);
    const title = String(task.title || "").replace(/\s+/g, " ").trim();
    const status = String(task.status || "pending").trim();

    if (!title) {
      return { ok: false, error: "empty_task_title" };
    }

    if (status !== "pending") {
      return { ok: false, error: "invalid_task_status" };
    }

    const uniqueId = seenIds.has(id) ? `task_${index + 1}` : id;
    seenIds.add(uniqueId);

    tasks.push({
      id: uniqueId,
      title: title.slice(0, 160),
      status: "pending"
    });
  }

  return {
    ok: true,
    value: {
      type: "plan",
      goal: goal.slice(0, 240),
      tasks
    }
  };
}

export function parseAgentPlan(text, options = {}) {
  for (const candidate of extractJsonCandidates(text)) {
    const parsed = safeJsonParse(candidate);
    if (!parsed) continue;

    const validated = validateAgentPlan(parsed, options);
    if (validated.ok) return validated;
  }

  return { ok: false, error: "invalid_json" };
}
