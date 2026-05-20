import { buildStudioContext, normalizeActiveTab } from "./studioContextBuilder.js";
import { buildStudioPrompt } from "./studioPromptBuilder.js";

const VALID_INTENTS = new Set([
  "complete_kit",
  "generate_planner",
  "edit_demand",
  "review_calendar",
  "fallback"
]);

function extractJsonObject(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {}
  }

  return null;
}

function normalizeLlmResponse(rawText = "") {
  const parsed = extractJsonObject(rawText);
  if (!parsed || typeof parsed !== "object") {
    return {
      reply: String(rawText || "").trim() || "Nao consegui montar uma resposta util agora.",
      intent: "fallback",
      actions: []
    };
  }

  const reply = String(parsed.reply || parsed.message || "").trim();
  return {
    reply: reply || "Nao consegui montar uma resposta util agora.",
    intent: VALID_INTENTS.has(parsed.intent) ? parsed.intent : "fallback",
    actions: Array.isArray(parsed.actions)
      ? parsed.actions.filter((action) => action && typeof action === "object")
      : []
  };
}

function validatePayload(payload = {}) {
  const message = String(payload.message || "").trim();
  if (!message) {
    const error = new Error("message obrigatoria.");
    error.statusCode = 400;
    throw error;
  }

  return {
    ...payload,
    message,
    activeTab: normalizeActiveTab(payload.activeTab)
  };
}

async function handleStudioChat(payload = {}, context = {}) {
  const input = validatePayload(payload);
  const studioContext = buildStudioContext(input);
  const prompt = buildStudioPrompt({
    message: input.message,
    context: studioContext
  });

  const ai = context.services?.ai || context.rawServices?.ai;
  if (!ai?.chat) {
    const error = new Error("Servico de LLM indisponivel.");
    error.statusCode = 503;
    throw error;
  }

  const llmResult = await ai.chat(prompt, {
    stream: false,
    think: false,
    emitEvents: true,
    llmMode: "smart",
    mode: "smart",
    meta: {
      source: "studio.chat",
      sessionId: input.conversationId || null
    }
  }, {
    source: "studio.chat",
    sessionId: input.conversationId || null
  });

  if (llmResult?.error) {
    const error = new Error(llmResult.message || "Falha ao chamar LLM do Studio.");
    error.statusCode = 502;
    throw error;
  }

  return {
    ...normalizeLlmResponse(llmResult?.text || llmResult?.response || ""),
    conversationId: input.conversationId || null,
    context: {
      activeTab: studioContext.activeTab,
      clientName: studioContext.interfaceState.clientName,
      month: studioContext.interfaceState.month
    }
  };
}

export {
  handleStudioChat,
  normalizeLlmResponse
};
