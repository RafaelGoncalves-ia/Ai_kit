import logger from "../../utils/logger.js";
import { getRuntimeActivity } from "../../utils/runtimeGuards.js";
import MemoryRepository from "./memoryRepository.js";
import { createMemoryValidator, shouldConsiderConversationMessage } from "./memoryValidator.js";

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncate(value, maxLength = 320) {
  const text = normalizeText(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 16)).trim()} [truncado]`;
}

function safeJsonArrayParse(payload) {
  const text = normalizeText(payload);
  if (!text) {
    throw new Error("empty_payload");
  }

  const withoutFences = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = withoutFences.indexOf("[");
  const end = withoutFences.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("json_array_not_found");
  }

  return JSON.parse(withoutFences.slice(start, end + 1));
}

export default class LongTermMemoryConsolidator {
  constructor(context, config = {}) {
    this.context = context;
    this.config = config;
    this.repository = new MemoryRepository({ config, logger });
    this.validator = createMemoryValidator(config);
    this.running = false;
    this.jobName = "memory-long-term-consolidation";
    this.lastAttemptAt = 0;
    this.retryCooldownMs = 60000;
  }

  init() {
    this.repository.ensureReady();
    this.context.core.longTermMemory = this;

    const scheduler = this.context.core?.scheduler;
    if (scheduler && !scheduler.hasJob?.(this.jobName)) {
      scheduler.register({
        name: this.jobName,
        priority: -10,
        execute: () => {
          this.scheduleIfEligible();
        }
      });
    }
  }

  buildContext(query = "", limit = 3) {
    return this.repository.buildContextText({ query, limit });
  }

  scheduleIfEligible() {
    if (this.running) {
      return false;
    }

    if (Date.now() - this.lastAttemptAt < this.retryCooldownMs) {
      return false;
    }

    const eligibility = this.evaluateEligibility();
    if (!eligibility.shouldRun) {
      return false;
    }

    this.running = true;
    this.lastAttemptAt = Date.now();
    void this.runConsolidation(eligibility).finally(() => {
      this.running = false;
    });
    return true;
  }

  evaluateEligibility() {
    const settings = this.config.settings || {};
    const latestConversationMessage = this.repository.getLatestConversationMessage();
    if (!latestConversationMessage) {
      return { shouldRun: false, reason: "no_conversation_messages" };
    }

    const idleThresholdMs = Number(settings.idle_time_minutes || 5) * 60 * 1000;
    const idleForMs = Date.now() - Number(latestConversationMessage.createdAt || 0);
    if (idleForMs < idleThresholdMs) {
      return { shouldRun: false, reason: "idle_threshold_not_reached" };
    }

    const checkpoint = this.repository.getCheckpoint();
    const messageCount = this.repository.countConversationMessagesSince(checkpoint?.lastMessageId || null);
    if (messageCount < Number(settings.min_messages_threshold || 10)) {
      return { shouldRun: false, reason: "message_threshold_not_reached" };
    }

    const activity = getRuntimeActivity(this.context);
    if (activity.safeDiagnosticMode || activity.ttsBusy || activity.realtimeBusy || activity.taskRouteBusy || activity.activeExecution || activity.waitingExecutionInput || activity.pendingQuestions) {
      return { shouldRun: false, reason: "runtime_busy" };
    }

    const llmDiagnostics = this.context.rawServices?.ai?.getDiagnostics?.() || {};
    if (Number(llmDiagnostics.activeRequests || 0) > 0 || Number(llmDiagnostics.queuedRequests || 0) > 0) {
      return { shouldRun: false, reason: "llm_busy" };
    }

    return {
      shouldRun: true,
      reason: null,
      checkpoint,
      messageCount,
      latestConversationMessage
    };
  }

  async runConsolidation(eligibility = this.evaluateEligibility()) {
    const checkpoint = eligibility.checkpoint || this.repository.getCheckpoint();
    const messages = this.repository.getConversationMessagesSince(checkpoint?.lastMessageId || null);
    if (!messages.length) {
      return;
    }

    const lastMessageId = String(messages[messages.length - 1].id);
    const filteredMessages = messages.filter((message) => shouldConsiderConversationMessage(message));
    if (!filteredMessages.length) {
      this.repository.updateCheckpoint(lastMessageId);
      logger.info("[Memory] bloco analisado sem mensagens relevantes para consolidacao");
      return;
    }

    const extractionPrompt = this.buildExtractionPrompt(filteredMessages);

    let aiResult;
    try {
      aiResult = await this.context.invokeTool("ai_chat", {
        prompt: extractionPrompt,
        source: "memory.consolidation",
        stream: false,
        think: false,
        emitEvents: false,
        temperature: 0.2,
        num_predict: 700,
        timeoutMs: 20000
      });
    } catch (err) {
      logger.error("[Memory] falha nao bloqueante ao chamar LLM de consolidacao", err);
      return;
    }

    if (aiResult?.status !== "ok") {
      logger.warn(`[Memory] consolidacao abortada: ${aiResult?.error || "llm_unavailable"}`);
      return;
    }

    let parsedItems;
    try {
      parsedItems = safeJsonArrayParse(aiResult?.data?.text || "");
    } catch (err) {
      logger.error("[Memory] JSON invalido na consolidacao", err);
      return;
    }

    if (!Array.isArray(parsedItems)) {
      logger.warn("[Memory] consolidacao abortada: resposta nao veio em array");
      return;
    }

    const limitedItems = parsedItems.slice(0, Math.max(1, Number(this.config.settings?.max_items_per_batch || 3)));
    const validItems = [];

    for (const candidate of limitedItems) {
      const validation = this.validator.validateCandidate(candidate);
      if (!validation.ok) {
        logger.warn(`[Memory] item descartado: ${validation.reason}`);
        continue;
      }
      validItems.push(validation.item);
    }

    try {
      for (const item of validItems) {
        this.repository.upsertMemory(item);
      }
      this.repository.updateCheckpoint(lastMessageId);
      logger.info(`[Memory] consolidacao concluida items=${validItems.length} messages=${messages.length}`);
    } catch (err) {
      logger.error("[Memory] falha ao salvar consolidacao", err);
    }
  }

  buildExtractionPrompt(messages = []) {
    const settings = this.config.settings || {};
    const categories = Array.isArray(this.config.categories) ? this.config.categories : [];
    const categoryLines = categories.map((category) => {
      const aliases = Array.isArray(category.aliases) ? category.aliases.join(", ") : "";
      return `- ${category.id}: ${category.description} | aliases: ${aliases}`;
    }).join("\n");

    const conversationBlock = messages
      .map((message) => `[${message.id}] ${message.role}: ${truncate(message.content, 360)}`)
      .join("\n");

    const existingMemoryBlock = this.repository.listMemoriesForPrompt(
      messages.map((message) => message.content).join(" "),
      12
    ).map((memory) => `- ${memory.category}/${memory.key}: ${truncate(memory.content, 220)}`).join("\n");

    return `
Voce vai consolidar memoria de longo prazo da KIT.

Analise apenas o bloco de mensagens abaixo e extraia memoria duravel.
Priorize fatos, preferencias, focos recorrentes e contexto de negocio que continuem uteis em conversas futuras.
Priorize o que foi explicitamente dito pelo usuario. Use falas do assistant apenas como apoio quando realmente ajudarem a consolidar o estado atual.

NAO salve:
- saudacoes, risos, conversa casual vazia
- instrucoes operacionais como abrir pasta, print, ler tela, abrir app, alarme
- estado temporario da sessao
- pedidos momentaneos
- opinioes inventadas da IA
- "o usuario pediu X"
- qualquer coisa que o historico curto ja resolve

Categorias permitidas:
${categoryLines}

Regras de saida:
- retorne somente um JSON array
- no maximo ${Number(settings.max_items_per_batch || 3)} itens
- category deve ser exatamente uma categoria permitida
- pode criar novas keys, mas nao pode criar novas categories
- key deve ser curta, previsivel e em slug com underscore
- content deve ser curto, factual, consolidado e reescrito
- nunca concatene texto bruto
- confidence deve ser numerica
- se nada for util, retorne []

Memorias ja existentes que podem precisar de merge:
${existingMemoryBlock || "[]"}

Mensagens desde o ultimo checkpoint:
${conversationBlock}

Responda somente com JSON.
`.trim();
  }
}
