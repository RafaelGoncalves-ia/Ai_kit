import fetch from "node-fetch";
import logger from "../utils/logger.js";
import { buildPromptPreview, hasUsableAssistantText } from "../utils/assistantMessageGuard.js";
import { resolveLLMRequestPolicy } from "./llmPolicy.js";
import { buildSpeechPayload } from "./speechFilter.js";

function salvageAssistantText(value) {
  if (typeof value === "string") {
    return value.trim();
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
      return candidate.trim();
    }
  }

  return "";
}

async function readNonStreamingChatResponse({
  ollamaUrl,
  model,
  keepAlive,
  prompt,
  options,
  images = [],
  think = false,
  timeoutMs = 20000
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think,
        keep_alive: keepAlive,
        options,
        messages: [
          {
            role: "user",
            content: prompt,
            images: images.length ? images : undefined
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Erro Ollama: ${response.status}`);
    }

    const data = await response.json().catch(() => ({}));
    return {
      text: salvageAssistantText(data),
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
  const OLLAMA_URL = context.config.system?.ollamaUrl || "http://localhost:11434";
  const singleModelMode = process.env.OLLAMA_SINGLE_MODEL_MODE !== "false";

  let currentModel =
    context.config.system?.defaultModel ||
    "huihui_ai/qwen3.5-abliterated:4b";

  const defaultRequestTimeoutMs = Math.max(
    1000,
    Number(process.env.OLLAMA_TIMEOUT_MS || context.config.system?.ollamaTimeoutMs || 45000)
  );

  const timeoutBySource = {
    "realtime.memory-input": 15000,
    "realtime.screenshot-capture": 45000,
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

  function flushQueue() {
    while (activeRequests < maxConcurrent && pendingRequests.length > 0) {
      const next = pendingRequests.shift();
      next();
    }
  }

  async function runWithConcurrencyLimit(task) {
    return new Promise((resolve, reject) => {
      const run = async () => {
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
  }

  function getModel() {
    return currentModel;
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

    if (source === "realtime.memory-input") {
      return timeoutBySource["realtime.memory-input"];
    }

    if (source === "realtime.screenshot-capture") {
      return timeoutBySource["realtime.screenshot-capture"];
    }

    if (source === "realtime") {
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
    const resolvedTimeoutMs = resolveTimeoutMs(requestMeta.source, options);
    const policy = resolveLLMRequestPolicy({
      context,
      source: requestMeta.source,
      prompt,
      options
    });

    return runWithConcurrencyLimit(async () => {
      const controller = new AbortController();
      const startedAt = Date.now();
      const timeout = setTimeout(() => controller.abort(), resolvedTimeoutMs);
      let firstTokenAt = null;
      let promptEvalCount = null;
      let evalCount = null;
      let loadDurationMs = null;
      let evalDurationMs = null;
      let doneReason = null;

      logger.info(
        `[OLLAMA CALL] source=${requestMeta.source} timestamp=${requestMeta.timestamp} ` +
        `sessionId=${requestMeta.sessionId || "-"} executionId=${requestMeta.executionId || "-"} ` +
        `mode=${policy.mode} profile=${policy.profileId} model=${currentModel} ` +
        `num_ctx=${policy.options.num_ctx} num_predict=${policy.options.num_predict} ` +
        `keep_alive=${policy.keepAlive} stream=${policy.stream} ` +
        `prompt_tokens=${policy.promptTokens}/${policy.promptTokensBeforeTrim} ` +
        `queued=${pendingRequests.length} active=${activeRequests} timeoutMs=${resolvedTimeoutMs} ` +
        `preview="${requestMeta.preview}"`
      );

      try {
        context.core?.eventBus?.emit("llm:started", {
          source: requestMeta.source,
          sessionId: requestMeta.sessionId || null,
          executionId: requestMeta.executionId || null,
          model: currentModel,
          mode: policy.mode,
          profile: policy.profileId
        });

        const res = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: currentModel,
            stream: policy.stream,
            think: options.think ?? false,
            keep_alive: policy.keepAlive,
            options: policy.options,
            messages: [
              {
                role: "user",
                content: policy.prompt,
                images: options.images?.length ? options.images : undefined
              }
            ]
          })
        });

        if (!res.ok) {
          throw new Error(`Erro Ollama: ${res.status}`);
        }

        let responseText = "";
        const rawChunks = [];

        if (!res.body) {
          const data = await res.json();
          responseText = salvageAssistantText(data);
        } else {
          let buffer = "";
          const parseChunkLine = (line) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
              return;
            }

            const data = JSON.parse(trimmedLine);
            rawChunks.push(data);
            const token = String(data?.message?.content || "");

            if (token) {
              responseText += token;

              if (!firstTokenAt) {
                firstTokenAt = Date.now();
              }

              if (typeof options.onToken === "function") {
                options.onToken(token);
              }

              context.core?.eventBus?.emit("llm:token", {
                source: requestMeta.source,
                sessionId: requestMeta.sessionId || null,
                executionId: requestMeta.executionId || null,
                token
              });
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
            buffer += chunk.toString("utf8");
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
              break;
            }
          }
        }

        if (!hasUsableAssistantText(responseText) && policy.stream) {
          logger.warn(
            `[OLLAMA RETRY] source=${requestMeta.source} mode=${policy.mode} model=${currentModel} reason=empty_stream_response`
          );

          const retryResult = await readNonStreamingChatResponse({
            ollamaUrl: OLLAMA_URL,
            model: currentModel,
            keepAlive: policy.keepAlive,
            prompt: policy.prompt,
            options: policy.options,
            images: options.images || [],
            think: options.think ?? false,
            timeoutMs: Math.min(20000, resolvedTimeoutMs)
          });

          if (hasUsableAssistantText(retryResult.text)) {
            responseText = String(retryResult.text || "").trim();
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
          streaming: policy.stream,
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
          `loadMs=${loadDurationMs || 0} evalMs=${evalDurationMs || 0} done=${doneReason || "-"} ` +
          `sessionId=${requestMeta.sessionId || "-"} executionId=${requestMeta.executionId || "-"}`
        );

        context.core?.eventBus?.emit("llm:completed", {
          source: requestMeta.source,
          sessionId: requestMeta.sessionId || null,
          executionId: requestMeta.executionId || null,
          model: currentModel,
          mode: policy.mode,
          profile: policy.profileId,
          timeToFirstTokenMs,
          totalDurationMs
        });

        return {
          text: responseText,
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
    const startedAt = Date.now();
    logger.info(`[OLLAMA WARMUP] iniciando model=${currentModel}`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: currentModel,
          stream: false,
          think: false,
          keep_alive: "20m",
          options: {
            num_ctx: 512,
            num_predict: 8,
            temperature: 0.1
          },
          messages: [
            {
              role: "user",
              content: "Responda apenas com OK."
            }
          ]
        })
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json().catch(() => ({}));
      const text = salvageAssistantText(data);

      if (text) {
        logger.info(
          `[OLLAMA WARMUP] sucesso model=${currentModel} durationMs=${Date.now() - startedAt} text="${buildPromptPreview(text, 40)}"`
        );
      } else {
        logger.warn(`[OLLAMA WARMUP] concluido sem texto model=${currentModel} durationMs=${Date.now() - startedAt}`);
      }
    } catch (err) {
      logger.warn(`[OLLAMA WARMUP] falhou model=${currentModel} durationMs=${Date.now() - startedAt} error=${err.message}`);
    }
  }

  function getDiagnostics() {
    return {
      currentModel,
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

  return { chat, listModels, setModel, getModel, getDiagnostics, getLiveDiagnostics, warmup };
}
