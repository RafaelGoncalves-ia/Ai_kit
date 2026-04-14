function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function estimateTokenCount(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 0;
  }

  return Math.ceil(normalized.length / 4);
}

function detectProfile(source = "", context = {}, options = {}, prompt = "") {
  const normalizedSource = String(source || "").toLowerCase();
  const currentAction = String(context?.state?.routine?.currentAction || "").toLowerCase();
  const normalizedPrompt = String(prompt || "").toLowerCase();

  if (
    normalizedSource.includes("randomtalk") ||
    normalizedSource.includes("social") ||
    normalizedSource.includes("sune") ||
    currentAction === "stream_live"
  ) {
    return "social";
  }

  if (
    normalizedSource.includes("agent-engine") ||
    normalizedSource.startsWith("task") ||
    normalizedSource.includes("task-route")
  ) {
    return "agent";
  }

  if (
    normalizedSource.includes("realtime") ||
    normalizedSource.includes("vision") ||
    normalizedSource.includes("screenshot")
  ) {
    return "quick";
  }

  if (options.images?.length > 0 || normalizedPrompt.includes("contexto visual")) {
    return "quick";
  }

  return "assistant";
}

function createProfiles() {
  return {
    quick: {
      mode: "realtime",
      numCtx: 1536,
      numPredict: 80,
      temperature: 0.4,
      topP: 0.88,
      topK: 40,
      repeatPenalty: 1.08,
      keepAlive: "20m",
      maxPromptRatio: 0.6
    },
    assistant: {
      mode: "assistant",
      numCtx: 4096,
      numPredict: 220,
      temperature: 0.5,
      topP: 0.9,
      topK: 50,
      repeatPenalty: 1.08,
      keepAlive: "15m",
      maxPromptRatio: 0.72
    },
    agent: {
      mode: "agent",
      numCtx: 8192,
      numPredict: 420,
      temperature: 0.35,
      topP: 0.92,
      topK: 60,
      repeatPenalty: 1.05,
      keepAlive: "20m",
      maxPromptRatio: 0.74
    },
    social: {
      mode: "social",
      numCtx: 3072,
      numPredict: 160,
      temperature: 0.75,
      topP: 0.92,
      topK: 60,
      repeatPenalty: 1.06,
      keepAlive: "15m",
      maxPromptRatio: 0.68
    }
  };
}

function hasDocumentContext(prompt = "", options = {}) {
  const normalizedPrompt = String(prompt || "").toLowerCase();
  return (
    Boolean(options.document) ||
    normalizedPrompt.includes("documento") ||
    normalizedPrompt.includes("arquivo") ||
    normalizedPrompt.includes("fontes:") ||
    normalizedPrompt.includes("conteudo do arquivo")
  );
}

function hasToolContext(prompt = "", options = {}) {
  const normalizedPrompt = String(prompt || "").toLowerCase();
  return (
    Boolean(options.hasTools) ||
    normalizedPrompt.includes("ferramentas disponiveis") ||
    normalizedPrompt.includes("toolname") ||
    normalizedPrompt.includes("tool ")
  );
}

function estimateHistoryLoad(prompt = "") {
  const normalizedPrompt = String(prompt || "");
  const recentConversationHits = normalizedPrompt.match(/-\s*(assistant|user|system)\s*:/gi) || [];
  const conversationSectionHits = normalizedPrompt.match(/conversa recente/gi) || [];
  return recentConversationHits.length + conversationSectionHits.length * 3;
}

export function trimPromptToBudget(prompt = "", maxPromptTokens = 0) {
  const normalizedPrompt = String(prompt || "").trim();
  if (!normalizedPrompt || maxPromptTokens <= 0) {
    return normalizedPrompt;
  }

  const estimatedTokens = estimateTokenCount(normalizedPrompt);
  if (estimatedTokens <= maxPromptTokens) {
    return normalizedPrompt;
  }

  const maxChars = maxPromptTokens * 4;
  const headChars = Math.max(160, Math.floor(maxChars * 0.35));
  const tailChars = Math.max(320, maxChars - headChars - 32);
  const head = normalizedPrompt.slice(0, headChars).trim();
  const tail = normalizedPrompt.slice(-tailChars).trim();

  return `${head}\n\n[contexto truncado para caber na janela]\n\n${tail}`.trim();
}

export function resolveLLMRequestPolicy({
  context,
  source = "unknown",
  prompt = "",
  options = {}
}) {
  const profiles = createProfiles();
  const profileId = detectProfile(source, context, options, prompt);
  const baseProfile = profiles[profileId] || profiles.assistant;

  const estimatedPromptTokens = estimateTokenCount(prompt);
  const historyLoad = estimateHistoryLoad(prompt);
  const documentContext = hasDocumentContext(prompt, options);
  const toolContext = hasToolContext(prompt, options);
  const imageContext = Array.isArray(options.images) && options.images.length > 0;

  let numCtx = baseProfile.numCtx;

  if (documentContext) {
    numCtx += 1024;
  }

  if (toolContext) {
    numCtx += 512;
  }

  if (historyLoad >= 8) {
    numCtx += 512;
  }

  if (imageContext) {
    numCtx += 512;
  }

  numCtx = clamp(numCtx, 1024, 12288);

  const numPredict = clamp(
    Number(options.num_predict ?? options.numPredict ?? baseProfile.numPredict),
    32,
    profileId === "agent" ? 700 : 320
  );

  const maxPromptTokens = clamp(
    Math.floor(numCtx * baseProfile.maxPromptRatio),
    512,
    numCtx - 256
  );

  const trimmedPrompt = trimPromptToBudget(prompt, maxPromptTokens);
  const trimmedPromptTokens = estimateTokenCount(trimmedPrompt);
  const stream = options.stream !== false;

  return {
    profileId,
    mode: baseProfile.mode,
    stream,
    keepAlive: options.keep_alive ?? options.keepAlive ?? baseProfile.keepAlive,
    prompt: trimmedPrompt,
    promptTokens: trimmedPromptTokens,
    promptTokensBeforeTrim: estimatedPromptTokens,
    maxPromptTokens,
    options: {
      num_ctx: Number(options.num_ctx ?? options.numCtx ?? numCtx),
      num_predict: numPredict,
      temperature: Number(options.temperature ?? baseProfile.temperature),
      top_p: Number(options.top_p ?? options.topP ?? baseProfile.topP),
      top_k: Number(options.top_k ?? options.topK ?? baseProfile.topK),
      repeat_penalty: Number(options.repeat_penalty ?? options.repeatPenalty ?? baseProfile.repeatPenalty),
      stop: Array.isArray(options.stop) ? options.stop : []
    },
    flags: {
      documentContext,
      toolContext,
      imageContext,
      historyLoad
    }
  };
}
