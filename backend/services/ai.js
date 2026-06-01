import fetch from "node-fetch";
import logger from "../utils/logger.js";
import { buildPromptPreview, hasUsableAssistantText } from "../utils/assistantMessageGuard.js";
import { resolveLLMRequestPolicy } from "./llmPolicy.js";
import { buildSpeechPayload } from "./speechFilter.js";

const LLM_MODES = {
  fast: {
    id: "fast",
    label: "Fast",
    model: "fredrezones55/Gemma-4-Uncensored-HauhauCS-Aggressive:e2b-SCN",
    keepAlive: "20m"
  },
  smart: {
    id: "smart",
    label: "Smart",
    model: "fredrezones55/Gemma-4-Uncensored-HauhauCS-Aggressive:e4b",
    keepAlive: "20m"
  }
};

const THOUGHT_START_RE = /<\|channel\|>thought\s*/i;
const THOUGHT_END_RE = /(?:<\|channel\|>|<channel\|>)/i;

function parseThinkingOutput(value) {
  const raw = String(value || "").replace(/<\|think\|>/gi, "");
  const startMatch = THOUGHT_START_RE.exec(raw);

  if (!startMatch) {
    return {
      raw,
      thought: "",
      final: raw.trim(),
      hasThoughtBlock: false,
      thoughtComplete: false
    };
  }

  const thoughtStartIndex = startMatch.index + startMatch[0].length;
  const afterStart = raw.slice(thoughtStartIndex);
  const endMatch = THOUGHT_END_RE.exec(afterStart);

  if (!endMatch) {
    return {
      raw,
      thought: afterStart.trim(),
      final: "",
      hasThoughtBlock: true,
      thoughtComplete: false
    };
  }

  const thought = afterStart.slice(0, endMatch.index).trim();
  const final = afterStart.slice(endMatch.index + endMatch[0].length).trim();

  return {
    raw,
    thought,
    final,
    hasThoughtBlock: true,
    thoughtComplete: true
  };
}

function sanitizeAssistantOutput(value) {
  return parseThinkingOutput(value).final;
}

function salvageAssistantText(value) {
  if (typeof value === "string") {
    return sanitizeAssistantOutput(value);
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const candidates = [
    value?.message?.content,
    value?.response,
    value?.content,
    value?.text
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return sanitizeAssistantOutput(candidate);
    }
  }

  return "";
}

function salvageAssistantThought(value) {
  if (typeof value === "string") {
    return parseThinkingOutput(value).thought;
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const candidates = [
    value?.message?.content,
    value?.response,
    value?.content,
    value?.text
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return parseThinkingOutput(candidate).thought;
    }
  }

  return "";
}

function normalizeMediaPart(part = {}) {
  const type = String(part.type || part.mediaType || "").toLowerCase();
  const data = String(part.data || part.base64 || "").trim();
  if (!type || !data) {
    return null;
  }

  return {
    type,
    data,
    mimeType: part.mimeType || null,
    name: part.name || part.fileName || null,
    textHint: part.textHint || null,
    transcript: part.transcript || null,
    tokenBudget: Number(part.tokenBudget || 0) || null
  };
}

function buildSystemPrompt({ thinkEnabled }) {
  const prefix = thinkEnabled ? "<|think|>\n" : "";
  return `${prefix}Voce responde para a KIT. Nunca exponha raciocinio interno; entregue apenas a resposta final para o usuario.`;
}

function buildChatMessages({ prompt, images = [], media = [], thinkEnabled = false }) {
  const normalizedMedia = (Array.isArray(media) ? media : [])
    .map(normalizeMediaPart)
    .filter(Boolean);

  const imageParts = normalizedMedia.filter((part) => part.type === "image");
  const audioParts = normalizedMedia.filter((part) => part.type === "audio");
  const videoParts = normalizedMedia.filter((part) => part.type === "video");
  const hasRichMedia = audioParts.length > 0 || videoParts.length > 0;

  if (!hasRichMedia) {
    return [
      {
        role: "system",
        content: buildSystemPrompt({ thinkEnabled })
      },
      {
        role: "user",
        content: prompt,
        images: images.length
          ? images
          : imageParts.length
            ? imageParts.map((part) => part.data)
            : undefined
      }
    ];
  }

  const content = [];

  for (const part of imageParts) {
    content.push({
      type: "image",
      image: part.data,
      mime_type: part.mimeType || undefined,
      token_budget: part.tokenBudget || undefined
    });
  }

  for (const part of audioParts) {
    content.push({
      type: "audio",
      audio: part.data,
      mime_type: part.mimeType || undefined
    });
  }

  for (const part of videoParts) {
    content.push({
      type: "video",
      video: part.data,
      mime_type: part.mimeType || undefined,
      token_budget: part.tokenBudget || undefined
    });
  }

  content.push({
    type: "text",
    text: prompt
  });

  return [
    {
      role: "system",
      content: buildSystemPrompt({ thinkEnabled })
    },
    {
      role: "user",
      content
    }
  ];
}

function buildFallbackPromptWithMediaHints(prompt, media = []) {
  const hints = (Array.isArray(media) ? media : [])
    .map(normalizeMediaPart)
    .filter(Boolean)
    .map((part, index) => {
      const label = `${part.type} ${index + 1}`;
      const extras = [];
      if (part.transcript) {
        extras.push(`transcricao: ${part.transcript}`);
      }
      if (part.textHint) {
        extras.push(`contexto: ${part.textHint}`);
      }
      return extras.length ? `- ${label}: ${extras.join(" | ")}` : `- ${label}: anexado`;
    });

  if (!hints.length) {
    return prompt;
  }

  return `${prompt}\n\nContexto adicional de midia anexada:\n${hints.join("\n")}`.trim();
}

async function postChatRequest({
  ollamaUrl,
  model,
  stream,
  think,
  keepAlive,
  options,
  messages,
  signal
}) {
  return fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model,
      stream,
      think,
      keep_alive: keepAlive,
      options,
      messages
    })
  });
}

async function postChatRequestWithFallback({
  ollamaUrl,
  model,
  stream,
  think,
  keepAlive,
  options,
  prompt,
  images,
  media,
  signal
}) {
  const thinkEnabled = think === true;
  let response = await postChatRequest({
    ollamaUrl,
    model,
    stream,
    think,
    keepAlive,
    options,
    messages: buildChatMessages({
      prompt,
      images,
      media,
      thinkEnabled
    }),
    signal
  });

  const hasRichMedia = Array.isArray(media) && media.some((part) => {
    const type = String(part?.type || part?.mediaType || "").toLowerCase();
    return type === "audio" || type === "video";
  });

  if (response.ok || !hasRichMedia) {
    return response;
  }

  response = await postChatRequest({
    ollamaUrl,
    model,
    stream,
    think,
    keepAlive,
    options,
    messages: buildChatMessages({
      prompt: buildFallbackPromptWithMediaHints(prompt, media),
      images,
      media: media.filter((part) => String(part?.type || part?.mediaType || "").toLowerCase() === "image"),
      thinkEnabled
    }),
    signal
  });

  return response;
}

function decodeResponseChunk(chunk) {
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString("utf8");
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString("utf8");
  }

  return String(chunk || "");
}

async function readNonStreamingChatResponse({
  ollamaUrl,
  model,
  keepAlive,
  prompt,
  options,
  images = [],
  media = [],
  think = false,
  timeoutMs = 20000
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await postChatRequestWithFallback({
      ollamaUrl,
      model,
      stream: false,
      think,
      keepAlive,
      options,
      prompt,
      images,
      media,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Erro Ollama: ${response.status}`);
    }

    const data = await response.json().catch(() => ({}));
    return {
      text: salvageAssistantText(data),
      thought: salvageAssistantThought(data),
      raw: data
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeMeta(prompt, options = {}, meta = {}) {
  const merged = {
    source: meta.source || options.meta?.source || "unknown",
    sessionId: meta.sessionId || options.meta?.sessionId || null,
    executionId: meta.executionId || options.meta?.executionId || null,
    timestamp: new Date().toISOString()
  };

  return {
    ...merged,
    preview: buildPromptPreview(meta.preview || options.meta?.preview || prompt)
  };
}

export default function createAIService(context) {
  const OLLAMA_URL = context.config.system?.ollamaUrl || "http://127.0.0.1:11434";
  const singleModelMode = process.env.OLLAMA_SINGLE_MODEL_MODE !== "false";
  const warmupTimeoutMs = Math.max(
    30000,
    Number(process.env.OLLAMA_WARMUP_TIMEOUT_MS || 180000)
  );

  let currentMode = "off";
  let requestedMode = "fast";
  let currentModel = LLM_MODES.fast.model;
  let switchingTo = null;
  let modeSwitchPromise = null;

  const defaultRequestTimeoutMs = Math.max(
    1000,
    Number(process.env.OLLAMA_TIMEOUT_MS || context.config.system?.ollamaTimeoutMs || 45000)
  );

  const timeoutBySource = {
    "realtime.memory-input": 15000,
    "realtime.image-upload": 120000,
    "realtime.audio-upload": 120000,
    "realtime.video-upload": 90000,
    "realtime.image-inline": 120000,
    "realtime.session-media": 120000,
    "realtime.screenshot-path": 120000,
    "realtime.screenshot-capture": 90000,
    "analyze-image": 150000,
    "analyze-audio": 120000,
    "analyze-video": 90000,
    realtime: 45000,
    task: 120000
  };

  const maxConcurrent = Math.max(
    1,
    Math.min(
      Number(process.env.OLLAMA_MAX_CONCURRENT || context.config.system?.maxConcurrentLlmCalls || 1),
      singleModelMode ? 1 : 8
    )
  );

  let activeRequests = 0;
  const pendingRequests = [];
  const recentCalls = [];
  let warmupRunning = false;

  function flushQueue() {
    while (activeRequests < maxConcurrent && pendingRequests.length > 0) {
      const next = pendingRequests.shift();
      next();
    }
  }

  async function runWithConcurrencyLimit(task) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        if (modeSwitchPromise) {
          await modeSwitchPromise.catch(() => {});
        }

        activeRequests += 1;

        try {
          resolve(await task());
        } catch (err) {
          reject(err);
        } finally {
          activeRequests -= 1;
          flushQueue();
        }
      };

      pendingRequests.push(run);
      flushQueue();
    });
  }

  async function listModels() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(defaultRequestTimeoutMs, 10000));

    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, {
        signal: controller.signal
      });
      const data = await res.json();
      return data.models?.map((model) => model.name) || [];
    } catch (err) {
      console.error("Erro ao listar modelos:", err);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  function setModel(modelName) {
    currentModel = modelName;
    const matchedMode = Object.values(LLM_MODES).find((mode) => mode.model === modelName);
    if (matchedMode) {
      requestedMode = matchedMode.id;
      currentMode = matchedMode.id;
    }
  }

  function getModel() {
    return currentModel;
  }

  function normalizeMode(value = "fast") {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "smart" || normalized === "fast" || normalized === "off") {
      return normalized;
    }
    return "fast";
  }

  function getMode() {
    return {
      active: currentMode,
      requested: requestedMode,
      switchingTo,
      model: currentMode === "off" ? null : currentModel,
      modes: LLM_MODES
    };
  }

  function emitModeChanged(extra = {}) {
    context.core?.eventBus?.emit("llm:mode", {
      ...getMode(),
      ...extra,
      timestamp: Date.now()
    });
  }

  function isSmartRequiredSource(source = "") {
    const normalized = String(source || "").toLowerCase();
    return (
      normalized.includes("agent") ||
      normalized.includes("studio") ||
      normalized.includes("analyze") ||
      normalized.includes("briefing") ||
      normalized.includes("planner") ||
      normalized.includes("script") ||
      normalized.includes("document") ||
      normalized.includes("code") ||
      normalized.startsWith("task")
    );
  }

  function resolveRequiredMode(source = "unknown", options = {}) {
    if (options.llmMode) {
      return normalizeMode(options.llmMode);
    }
    if (isSmartRequiredSource(source)) {
      return "smart";
    }
    return requestedMode === "smart" ? "smart" : "fast";
  }

  function resolveModeReason(source = "unknown", explicitReason = "") {
    if (explicitReason) return explicitReason;
    const normalized = String(source || "").toLowerCase();
    if (normalized.includes("agent")) return "agent_required";
    if (normalized.includes("studio")) return "studio_required";
    if (normalized === "chat-open" || normalized === "chat_open" || normalized === "warmup") return "chat_default";
    return requestedMode === "smart" ? "manual_selection" : "chat_default";
  }

  async function postUnloadModel(model) {
    if (!model) {
      return { ok: true, model: null };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          prompt: "",
          stream: false,
          keep_alive: 0
        })
      });
      await response.json().catch(() => ({}));
      return {
        ok: response.ok,
        model,
        status: response.status
      };
    } catch (err) {
      return {
        ok: false,
        model,
        error: err.message
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function waitForVramRelease() {
    const delayMs = Math.max(250, Number(process.env.OLLAMA_SWAP_VRAM_WAIT_MS || 1200));
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  async function isModelLoaded(model) {
    if (!model) {
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(`${OLLAMA_URL}/api/ps`, {
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      const loadedModels = Array.isArray(data?.models) ? data.models : [];

      return loadedModels.some((item) => {
        const loadedName = item?.model || item?.name;
        if (loadedName !== model) {
          return false;
        }

        if (!item?.expires_at) {
          return true;
        }

        const expiresAt = Date.parse(item.expires_at);
        return !Number.isFinite(expiresAt) || expiresAt > Date.now() + 5000;
      });
    } catch (err) {
      logger.warn(`[LLM][MODE] nao consegui verificar modelo carregado: ${err.message}`);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadMode(modeId, reason = "manual_selection") {
    const mode = LLM_MODES[modeId];
    if (!mode) {
      return { ok: false, error: `Modo invalido: ${modeId}` };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), warmupTimeoutMs);
    try {
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: mode.model,
          stream: false,
          think: false,
          keep_alive: mode.keepAlive,
          options: {
            num_ctx: 512,
            num_predict: 8,
            temperature: 0.1
          },
          messages: buildChatMessages({
            prompt: "Responda apenas com OK.",
            thinkEnabled: false
          })
        })
      });
      await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      currentMode = modeId;
      currentModel = mode.model;
      console.log(`[LLM][MODE] active=${modeId} model=${mode.model.split(":").pop()} reason=${reason} keep_alive=${mode.keepAlive}`);
      emitModeChanged({ reason });
      return { ok: true, mode: modeId, model: mode.model };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function performModeSwitch(targetMode, reason = "manual_selection") {
    const normalizedTarget = normalizeMode(targetMode);
    if (["manual_selection", "chat_default"].includes(reason) && normalizedTarget !== "off") {
      requestedMode = normalizedTarget;
    }

    if (normalizedTarget === "off") {
      if (reason === "canvas_default") {
        requestedMode = "fast";
      }
      switchingTo = "off";
      emitModeChanged({ reason });
      await Promise.all(Object.values(LLM_MODES).map((mode) => postUnloadModel(mode.model)));
      await waitForVramRelease();
      currentMode = "off";
      currentModel = LLM_MODES.fast.model;
      switchingTo = null;
      console.log(`[LLM][MODE] active=off reason=${reason}`);
      emitModeChanged({ reason });
      return { ok: true, mode: "off" };
    }

    const target = LLM_MODES[normalizedTarget];
    if (currentMode === normalizedTarget && currentModel === target.model) {
      if (await isModelLoaded(target.model)) {
        console.log(`[LLM][MODE] active=${normalizedTarget} model=${target.model.split(":").pop()} reason=${reason} keep_alive=${target.keepAlive}`);
        emitModeChanged({ reason });
        return { ok: true, mode: normalizedTarget, model: target.model, unchanged: true };
      }

      console.log(`[LLM][MODE] reload=${normalizedTarget} model=${target.model.split(":").pop()} reason=${reason} keep_alive=${target.keepAlive}`);
      return await loadMode(normalizedTarget, reason);
    }

    const previousMode = currentMode;
    const previousModel = currentMode === "off" ? null : currentModel;
    switchingTo = normalizedTarget;
    emitModeChanged({ reason });

    console.log(`[LLM][SWAP] from=${previousMode} to=${normalizedTarget} unload=${previousMode} load=${normalizedTarget}`);
    await postUnloadModel(previousModel);
    const otherMode = normalizedTarget === "fast" ? LLM_MODES.smart : LLM_MODES.fast;
    await postUnloadModel(otherMode.model);
    await waitForVramRelease();
    try {
      return await loadMode(normalizedTarget, reason);
    } finally {
      switchingTo = null;
      emitModeChanged({ reason });
    }
  }

  async function switchMode(targetMode, reason = "manual_selection") {
    const runSwitch = async () => {
      while (activeRequests > 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return performModeSwitch(targetMode, reason);
    };

    modeSwitchPromise = (modeSwitchPromise || Promise.resolve())
      .catch(() => {})
      .then(runSwitch)
      .finally(() => {
        modeSwitchPromise = null;
      });

    return modeSwitchPromise;
  }

  async function ensureMode(targetMode, reason = "chat_default") {
    if (modeSwitchPromise) {
      await modeSwitchPromise.catch(() => {});
    }

    const normalizedTarget = normalizeMode(targetMode);
    if (normalizedTarget === "off") {
      return switchMode("off", reason);
    }

    if (currentMode === normalizedTarget && currentModel === LLM_MODES[normalizedTarget].model) {
      if (await isModelLoaded(currentModel)) {
        return { ok: true, mode: normalizedTarget, model: currentModel };
      }

      logger.info(
        `[LLM][MODE] estado indicava ${normalizedTarget}, mas o modelo nao esta carregado; aquecendo antes da chamada`
      );
      return switchMode(normalizedTarget, `${reason}_reload`);
    }

    return switchMode(normalizedTarget, reason);
  }

  function recordCall(entry) {
    recentCalls.unshift({
      ...entry,
      recordedAt: new Date().toISOString()
    });

    if (recentCalls.length > 30) {
      recentCalls.length = 30;
    }
  }

  function resolveTimeoutMs(source = "unknown", options = {}) {
    if (Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0) {
      return Math.max(1000, Number(options.timeoutMs));
    }

    const thinkEnabled = options.think === true;

    if (source === "realtime.memory-input") {
      return timeoutBySource["realtime.memory-input"];
    }

    if (source === "realtime.screenshot-capture") {
      return timeoutBySource["realtime.screenshot-capture"];
    }

    if (
      source === "realtime.image-upload" ||
      source === "realtime.audio-upload" ||
      source === "realtime.video-upload" ||
      source === "realtime.image-inline" ||
      source === "realtime.session-media" ||
      source === "realtime.screenshot-path" ||
      source === "analyze-image" ||
      source === "analyze-audio" ||
      source === "analyze-video"
    ) {
      return timeoutBySource[source];
    }

    if (source === "realtime") {
      if (thinkEnabled) {
        return Math.max(timeoutBySource.realtime, 90000);
      }
      return timeoutBySource.realtime;
    }

    if (
      source === "task" ||
      source.startsWith("task.") ||
      source.startsWith("task-") ||
      source.startsWith("taskRoute") ||
      source.startsWith("task-route") ||
      source.startsWith("agent-engine")
    ) {
      return timeoutBySource.task;
    }

    if ((options.images || []).length > 0) {
      return Math.max(defaultRequestTimeoutMs, timeoutBySource["realtime.screenshot-capture"]);
    }

    return defaultRequestTimeoutMs;
  }

  async function chat(prompt, options = {}, meta = {}) {
    const requestMeta = normalizeMeta(prompt, options, meta);
    const requiredMode = resolveRequiredMode(requestMeta.source, options);
    const requiredReason = resolveModeReason(requestMeta.source, options.modeReason || options.llmModeReason);
    const requestOptions = {
      ...options,
      keep_alive: options.keep_alive ?? options.keepAlive ?? LLM_MODES[requiredMode]?.keepAlive
    };
    const resolvedTimeoutMs = resolveTimeoutMs(requestMeta.source, requestOptions);
    const policy = resolveLLMRequestPolicy({
      context,
      source: requestMeta.source,
      prompt,
      options: requestOptions
    });
    const shouldEmitEvents = requestOptions.emitEvents !== false;

    await ensureMode(requiredMode, requiredReason);

    return runWithConcurrencyLimit(async () => {
      const controller = new AbortController();
      const startedAt = Date.now();
      const timeout = setTimeout(() => controller.abort(), resolvedTimeoutMs);
      const requestThink = requestOptions.think ?? context.config.system?.thinkingEnabled ?? false;
      const requestStream = policy.stream;
      let firstTokenAt = null;
      let promptEvalCount = null;
      let evalCount = null;
      let loadDurationMs = null;
      let evalDurationMs = null;
      let doneReason = null;

      logger.info(
        `[OLLAMA CALL] source=${requestMeta.source} timestamp=${requestMeta.timestamp} ` +
        `sessionId=${requestMeta.sessionId || "-"} executionId=${requestMeta.executionId || "-"} ` +
        `mode=${policy.mode} llm_mode=${currentMode} profile=${policy.profileId} model=${currentModel} ` +
        `num_ctx=${policy.options.num_ctx} num_predict=${policy.options.num_predict} ` +
        `keep_alive=${policy.keepAlive} stream=${requestStream} think=${requestThink} ` +
        `prompt_tokens=${policy.promptTokens}/${policy.promptTokensBeforeTrim} ` +
        `queued=${pendingRequests.length} active=${activeRequests} timeoutMs=${resolvedTimeoutMs} ` +
        `preview="${requestMeta.preview}"`
      );

      try {
        if (shouldEmitEvents) {
          context.core?.eventBus?.emit("llm:started", {
            source: requestMeta.source,
            sessionId: requestMeta.sessionId || null,
            executionId: requestMeta.executionId || null,
            model: currentModel,
            mode: policy.mode,
            profile: policy.profileId,
            think: requestThink
          });
        }

        const res = await postChatRequestWithFallback({
          ollamaUrl: OLLAMA_URL,
          model: currentModel,
          llmMode: currentMode,
          stream: requestStream,
          think: requestThink,
          keepAlive: policy.keepAlive,
          options: policy.options,
          prompt: policy.prompt,
        images: requestOptions.images || [],
        media: requestOptions.media || [],
          signal: controller.signal
        });

        if (!res.ok) {
          throw new Error(`Erro Ollama: ${res.status}`);
        }

        let responseText = "";
        let responseThought = "";
        const rawChunks = [];

        if (!requestStream) {
          const data = await res.json().catch(() => ({}));
          rawChunks.push(data);
          responseText = salvageAssistantText(data);
          responseThought = salvageAssistantThought(data);
        } else if (!res.body) {
          const data = await res.json().catch(() => ({}));
          rawChunks.push(data);
          responseText = salvageAssistantText(data);
          responseThought = salvageAssistantThought(data);
        } else {
          let buffer = "";
          let streamedRaw = "";
          let emittedThoughtLength = 0;
          let emittedFinalLength = 0;
          const parseChunkLine = (line) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
              return;
            }

            const data = JSON.parse(trimmedLine);
            rawChunks.push(data);
            const token = String(data?.message?.content || "");

            if (token) {
              streamedRaw += token;
              const parsed = parseThinkingOutput(streamedRaw);
              responseThought = parsed.thought;
              responseText = parsed.final;

              const thoughtDelta = parsed.thought.slice(emittedThoughtLength);
              const finalDelta = parsed.final.slice(emittedFinalLength);
              emittedThoughtLength = parsed.thought.length;
              emittedFinalLength = parsed.final.length;

              if (!firstTokenAt) {
                firstTokenAt = Date.now();
              }

              if (thoughtDelta && typeof requestOptions.onThoughtToken === "function") {
                requestOptions.onThoughtToken(thoughtDelta);
              }

              if (finalDelta && typeof requestOptions.onToken === "function") {
                requestOptions.onToken(finalDelta);
              }

              if (shouldEmitEvents) {
                if (thoughtDelta) {
                  context.core?.eventBus?.emit("llm:thought-token", {
                    source: requestMeta.source,
                    sessionId: requestMeta.sessionId || null,
                    executionId: requestMeta.executionId || null,
                    token: thoughtDelta
                  });
                }

                if (finalDelta) {
                  context.core?.eventBus?.emit("llm:token", {
                    source: requestMeta.source,
                    sessionId: requestMeta.sessionId || null,
                    executionId: requestMeta.executionId || null,
                    token: finalDelta
                  });
                }
              }
            }

            if (data?.done) {
              promptEvalCount = Number(data.prompt_eval_count || 0);
              evalCount = Number(data.eval_count || 0);
              loadDurationMs = Number(data.load_duration || 0) / 1e6;
              evalDurationMs = Number(data.eval_duration || 0) / 1e6;
              doneReason = data.done_reason || null;
            }
          };

          for await (const chunk of res.body) {
            buffer += decodeResponseChunk(chunk);
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              parseChunkLine(line);
            }
          }

          if (buffer.trim()) {
            parseChunkLine(buffer);
          }
        }

        responseText = String(responseText || "").trim();

        if (!responseText && rawChunks.length > 0) {
          for (let index = rawChunks.length - 1; index >= 0; index -= 1) {
            const salvaged = salvageAssistantText(rawChunks[index]);
            if (salvaged) {
              responseText = salvaged;
              responseThought = salvageAssistantThought(rawChunks[index]);
              break;
            }
          }
        }

        if (!hasUsableAssistantText(responseText) && requestStream) {
          logger.warn(
            `[OLLAMA RETRY] source=${requestMeta.source} mode=${policy.mode} model=${currentModel} reason=empty_stream_response`
          );

          const retryResult = await readNonStreamingChatResponse({
            ollamaUrl: OLLAMA_URL,
            model: currentModel,
            keepAlive: policy.keepAlive,
            prompt: policy.prompt,
            options: policy.options,
            images: requestOptions.images || [],
            media: requestOptions.media || [],
            think: requestThink,
            timeoutMs: Math.min(20000, resolvedTimeoutMs)
          });

          if (hasUsableAssistantText(retryResult.text)) {
            responseText = String(retryResult.text || "").trim();
            responseThought = String(retryResult.thought || "").trim();
          }
        }

        if (!hasUsableAssistantText(responseText) && requestThink) {
          logger.warn(
            `[OLLAMA RETRY] source=${requestMeta.source} mode=${policy.mode} model=${currentModel} reason=empty_response_retry_without_think`
          );

          const retryWithoutThink = await readNonStreamingChatResponse({
            ollamaUrl: OLLAMA_URL,
            model: currentModel,
            keepAlive: policy.keepAlive,
            prompt: policy.prompt,
            options: policy.options,
            images: requestOptions.images || [],
            media: requestOptions.media || [],
            think: false,
            timeoutMs: Math.min(Math.max(30000, resolvedTimeoutMs), 120000)
          });

          if (hasUsableAssistantText(retryWithoutThink.text)) {
            responseText = String(retryWithoutThink.text || "").trim();
            responseThought = "";
          }
        }

        if (!hasUsableAssistantText(responseText)) {
          const emptyError = new Error("empty_response");
          emptyError.code = "LLM_EMPTY";
          throw emptyError;
        }

        const speech = buildSpeechPayload({
          uiText: responseText,
          source: requestMeta.source
        });
        const totalDurationMs = Date.now() - startedAt;
        const timeToFirstTokenMs = firstTokenAt ? firstTokenAt - startedAt : totalDurationMs;

        recordCall({
          source: requestMeta.source,
          mode: policy.mode,
          profile: policy.profileId,
          model: currentModel,
          numCtx: policy.options.num_ctx,
          numPredict: policy.options.num_predict,
          keepAlive: policy.keepAlive,
          streaming: requestStream,
          think: requestThink,
          promptTokens: policy.promptTokens,
          promptTokensBeforeTrim: policy.promptTokensBeforeTrim,
          historyLoad: policy.flags.historyLoad,
          timeToFirstTokenMs,
          totalDurationMs,
          promptEvalCount,
          evalCount,
          loadDurationMs,
          evalDurationMs,
          doneReason,
          sessionId: requestMeta.sessionId || null,
          executionId: requestMeta.executionId || null
        });

        logger.info(
          `[OLLAMA OK] source=${requestMeta.source} mode=${policy.mode} profile=${policy.profileId} ` +
          `model=${currentModel} num_ctx=${policy.options.num_ctx} num_predict=${policy.options.num_predict} ` +
          `prompt_tokens=${policy.promptTokens} ttftMs=${timeToFirstTokenMs} totalMs=${totalDurationMs} ` +
          `prompt_eval=${promptEvalCount || 0} eval=${evalCount || 0} ` +
          `loadMs=${loadDurationMs || 0} evalMs=${evalDurationMs || 0} done=${doneReason || "-"} think=${requestThink} ` +
          `sessionId=${requestMeta.sessionId || "-"} executionId=${requestMeta.executionId || "-"}`
        );

        if (shouldEmitEvents) {
          context.core?.eventBus?.emit("llm:completed", {
            source: requestMeta.source,
            sessionId: requestMeta.sessionId || null,
            executionId: requestMeta.executionId || null,
            model: currentModel,
            mode: policy.mode,
            profile: policy.profileId,
            think: requestThink,
            hasThought: Boolean(responseThought),
            timeToFirstTokenMs,
            totalDurationMs
          });
        }

        return {
          text: responseText,
          thought: responseThought,
          speakText: speech.shouldSpeak ? speech.text : "",
          speak: speech.shouldSpeak,
          diagnostics: {
            mode: policy.mode,
            profile: policy.profileId,
            model: currentModel,
            num_ctx: policy.options.num_ctx,
            num_predict: policy.options.num_predict,
            promptTokens: policy.promptTokens,
            promptTokensBeforeTrim: policy.promptTokensBeforeTrim,
            timeToFirstTokenMs,
            totalDurationMs
          }
        };
      } catch (err) {
        const isAbort = err.name === "AbortError";
        const message = isAbort
          ? `Timeout de ${resolvedTimeoutMs}ms ao chamar Ollama`
          : err.message;

        logger.error(
          `[OLLAMA ERROR] source=${requestMeta.source} durationMs=${Date.now() - startedAt} ` +
          `sessionId=${requestMeta.sessionId || "-"} executionId=${requestMeta.executionId || "-"} ` +
          `message="${message}"`,
          isAbort ? null : err
        );

        if (isAbort) {
          return {
            error: "timeout",
            message: "LLM demorou para responder",
            timeoutMs: resolvedTimeoutMs,
            text: "",
            speakText: "",
            speak: false
          };
        }

        const error = new Error(message);
        if (!error.code && message === "empty_response") {
          error.code = "LLM_EMPTY";
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  async function warmup() {
    if (warmupRunning || activeRequests > 0 || pendingRequests.length > 0 || context.runtime?.agentActive) {
      logger.info(
        `[OLLAMA WARMUP] ignorado active=${activeRequests} queued=${pendingRequests.length} agentActive=${context.runtime?.agentActive === true}`
      );
      return;
    }

    warmupRunning = true;
    const startedAt = Date.now();
    logger.info(`[OLLAMA WARMUP] iniciando mode=${requestedMode} model=${LLM_MODES[requestedMode]?.model || currentModel}`);

    try {
      await ensureMode(requestedMode || "fast", requestedMode === "smart" ? "manual_selection" : "chat_default");
      logger.info(`[OLLAMA WARMUP] sucesso mode=${currentMode} model=${currentModel} durationMs=${Date.now() - startedAt}`);
    } catch (err) {
      logger.warn(`[OLLAMA WARMUP] falhou model=${currentModel} durationMs=${Date.now() - startedAt} error=${err.message}`);
    } finally {
      warmupRunning = false;
    }
  }

  async function unload() {
    const startedAt = Date.now();
    logger.info(`[OLLAMA UNLOAD] iniciando model=${currentModel}`);

    try {
      await switchMode("off", "unload");
      logger.info(`[OLLAMA UNLOAD] concluido model=${currentModel} durationMs=${Date.now() - startedAt}`);
      return {
        ok: true,
        model: currentModel
      };
    } catch (err) {
      logger.warn(
        `[OLLAMA UNLOAD] falhou model=${currentModel} durationMs=${Date.now() - startedAt} error=${err.message}`
      );
      return {
        ok: false,
        model: currentModel,
        error: err.message
      };
    }
  }

  function getDiagnostics() {
      return {
        currentModel,
        currentMode,
        requestedMode,
        switchingTo,
        modes: LLM_MODES,
        singleModelMode,
      defaultRequestTimeoutMs,
      timeoutBySource,
      maxConcurrent,
      activeRequests,
      queuedRequests: pendingRequests.length,
      recentCalls
    };
  }

  async function getLiveDiagnostics() {
    const psController = new AbortController();
    const timeout = setTimeout(() => psController.abort(), 3000);

    try {
      const response = await fetch(`${OLLAMA_URL}/api/ps`, {
        signal: psController.signal
      });
      const data = await response.json().catch(() => ({}));
      return {
        ...getDiagnostics(),
        ollamaPs: data?.models || [],
        compareHint: "Compare este payload com o comando local: ollama ps"
      };
    } catch (err) {
      return {
        ...getDiagnostics(),
        ollamaPs: [],
        compareHint: "Compare este payload com o comando local: ollama ps",
        ollamaPsError: err.message
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { chat, listModels, setModel, getModel, getMode, switchMode, ensureMode, getDiagnostics, getLiveDiagnostics, warmup, unload };
}
