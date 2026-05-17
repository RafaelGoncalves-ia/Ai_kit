import {
  normalizeVisionDetailTokenBudget,
  resolveVisionDetailTokenBudget,
  logVisionDetailSelection
} from "../core/visionDetail.js";

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
    normalizedSource.includes("agent-exec") ||
    normalizedSource.includes("agent-tool-loop") ||
    normalizedSource.includes("agent-route") ||
    normalizedSource.startsWith("task") ||
    normalizedSource.includes("task-route")
  ) {
    return "agent";
  }

  if (
    normalizedSource.includes("analyze-image") ||
    normalizedSource.includes("image-upload") ||
    normalizedSource.includes("image-inline") ||
    normalizedSource.includes("session-media") ||
    normalizedSource.includes("vision") ||
    normalizedSource.includes("screenshot")
  ) {
    return "vision";
  }

  if (
    normalizedSource.includes("realtime") ||
    normalizedSource.includes("vision") ||
    normalizedSource.includes("screenshot")
  ) {
    return "quick";
  }

  if (
    options.images?.length > 0 ||
    options.media?.length > 0 ||
    normalizedPrompt.includes("contexto visual") ||
    normalizedPrompt.includes("contexto de midia")
  ) {
    return "vision";
  }

  return "assistant";
}

function createProfiles() {
  return {
    quick: {
      mode: "realtime",
      numCtx: 1536,
      numPredict: 80,
      temperature: 1,
      topP: 0.95,
      topK: 64,
      repeatPenalty: 1.08,
      keepAlive: "20m",
      maxPromptRatio: 0.6
    },
    assistant: {
      mode: "assistant",
      numCtx: 4096,
      numPredict: 360,
      temperature: 1,
      topP: 0.95,
      topK: 64,
      repeatPenalty: 1.08,
      keepAlive: "15m",
      maxPromptRatio: 0.72
    },
    agent: {
      mode: "agent",
      numCtx: 12288,
      numPredict: 1600,
      temperature: 1,
      topP: 0.95,
      topK: 64,
      repeatPenalty: 1.05,
      keepAlive: "30m",
      maxPromptRatio: 0.68
    },
    vision: {
      mode: "vision",
      numCtx: 4096,
      numPredict: 320,
      temperature: 1,
      topP: 0.95,
      topK: 64,
      repeatPenalty: 1.05,
      keepAlive: "30m",
      maxPromptRatio: 0.7
    },
    social: {
      mode: "social",
      numCtx: 3072,
      numPredict: 160,
      temperature: 1,
      topP: 0.95,
      topK: 64,
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
  const samplingConfig = context?.config?.system?.sampling || {};
  const multimodalConfig = context?.config?.system?.multimodal || {};

  const estimatedPromptTokens = estimateTokenCount(prompt);
  const historyLoad = estimateHistoryLoad(prompt);
  const documentContext = hasDocumentContext(prompt, options);
  const toolContext = hasToolContext(prompt, options);
  const imageContext = Array.isArray(options.images) && options.images.length > 0;
  const mediaContext = Array.isArray(options.media) && options.media.length > 0;
  const imageMediaContext = mediaContext && options.media.some((part) => {
    const type = String(part?.type || part?.mediaType || "").toLowerCase();
    return type === "image" || type === "screenshot";
  });

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

  if (imageContext || mediaContext) {
    numCtx += 512;
  }

  numCtx = clamp(numCtx, 1024, 24576);

  const numPredict = clamp(
    Number(options.num_predict ?? options.numPredict ?? baseProfile.numPredict),
    32,
    profileId === "agent" ? 4096 : profileId === "vision" ? 1400 : 900
  );

  const maxPromptTokens = clamp(
    Math.floor(numCtx * baseProfile.maxPromptRatio),
    512,
    numCtx - 256
  );

  const trimmedPrompt = trimPromptToBudget(prompt, maxPromptTokens);
  const trimmedPromptTokens = estimateTokenCount(trimmedPrompt);
  const stream = options.stream !== false;
  const explicitImageBudget = options.image_token_budget ?? options.imageTokenBudget;
  let imageTokenBudget = normalizeVisionDetailTokenBudget(explicitImageBudget);

  if (imageTokenBudget === "auto" && (imageContext || imageMediaContext)) {
    const selection = resolveVisionDetailTokenBudget(context?.config || {}, {
      source,
      prompt,
      mediaType: imageMediaContext ? "image" : ""
    });
    logVisionDetailSelection(selection);
    imageTokenBudget = selection.selected;
  } else if (imageTokenBudget === "auto") {
    imageTokenBudget = normalizeVisionDetailTokenBudget(multimodalConfig.visionTokenBudget) || 280;
    if (imageTokenBudget === "auto") {
      imageTokenBudget = 280;
    }
  }

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
      temperature: Number(options.temperature ?? samplingConfig.temperature ?? baseProfile.temperature),
      top_p: Number(options.top_p ?? options.topP ?? samplingConfig.topP ?? baseProfile.topP),
      top_k: Number(options.top_k ?? options.topK ?? samplingConfig.topK ?? baseProfile.topK),
      repeat_penalty: Number(options.repeat_penalty ?? options.repeatPenalty ?? baseProfile.repeatPenalty),
      stop: Array.isArray(options.stop) ? options.stop : [],
      image_token_budget: Number(imageTokenBudget),
      video_token_budget: Number(
        options.video_token_budget ??
        options.videoTokenBudget ??
        multimodalConfig.videoTokenBudget ??
        140
      )
    },
    flags: {
      documentContext,
      toolContext,
      imageContext,
      mediaContext,
      historyLoad
    }
  };
}
