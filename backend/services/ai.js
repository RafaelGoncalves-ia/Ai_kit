import fetch from "node-fetch";
import logger from "../utils/logger.js";
import { buildPromptPreview, hasUsableAssistantText } from "../utils/assistantMessageGuard.js";

function cleanTextForSpeech(text) {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#/g, "")
    .replace(/`/g, "")
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .trim();
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
    realtime: 90000,
    task: 120000
  };

  const maxConcurrent = Math.max(
    1,
    Number(process.env.OLLAMA_MAX_CONCURRENT || context.config.system?.maxConcurrentLlmCalls || 1)
  );

  let activeRequests = 0;
  const pendingRequests = [];

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

    return runWithConcurrencyLimit(async () => {
      const controller = new AbortController();
      const startedAt = Date.now();
      const timeout = setTimeout(() => controller.abort(), resolvedTimeoutMs);

      logger.info(
        `[OLLAMA CALL] source=${requestMeta.source} timestamp=${requestMeta.timestamp} ` +
        `sessionId=${requestMeta.sessionId || "-"} executionId=${requestMeta.executionId || "-"} ` +
        `timeoutMs=${resolvedTimeoutMs} ` +
        `preview="${requestMeta.preview}"`
      );

      try {
        const res = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: currentModel,
            stream: false,
            messages: [
              {
                role: "user",
                content: prompt,
                images: options.images?.length ? options.images : undefined
              }
            ]
          })
        });

        if (!res.ok) {
          throw new Error(`Erro Ollama: ${res.status}`);
        }

        const data = await res.json();
        const responseText = String(data?.message?.content || "").trim();

        if (!hasUsableAssistantText(responseText)) {
          throw new Error("Resposta da IA vazia ou invalida");
        }

        logger.info(
          `[OLLAMA OK] source=${requestMeta.source} durationMs=${Date.now() - startedAt} ` +
          `sessionId=${requestMeta.sessionId || "-"} executionId=${requestMeta.executionId || "-"}`
        );

        return {
          text: responseText,
          speakText: cleanTextForSpeech(responseText),
          speak: true
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

        throw new Error(message);
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  function getDiagnostics() {
    return {
      currentModel,
      defaultRequestTimeoutMs,
      timeoutBySource,
      maxConcurrent,
      activeRequests,
      queuedRequests: pendingRequests.length
    };
  }

  return { chat, listModels, setModel, getModel, getDiagnostics };
}
