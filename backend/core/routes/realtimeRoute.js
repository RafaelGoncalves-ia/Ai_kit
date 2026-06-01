import {
  hasUsableAssistantText,
  shouldSuppressAssistantMessage
} from "../../utils/assistantMessageGuard.js";
import { deriveEmotionFromState, getRouteBehavior } from "../personalityConfig.js";
import { ensureOrchestratorRuntime } from "../../utils/runtimeState.js";
import { buildHelpText, isHelpCommand } from "../CommandHelp.js";
import { updateSessionThemes, isThemeActive } from "../sessionThemes/SessionThemeManager.js";
import {
  updateActiveEntities,
  enrichLeagueQueryWithEntities
} from "../sessionThemes/ActiveEntityTracker.js";
import { isContextualLeagueQuestion } from "../sessionThemes/TopicDetector.js";

export default function createRealtimeRoute(context) {
  const state = context.state;
  const runtime = ensureOrchestratorRuntime(context);
  const FRIENDLY_LLM_FALLBACK = "Demorei demais para processar isso 😵‍💫 tenta novamente ou simplifica o pedido.";

  function emitStatus(message) {
    if (!context.core?.eventBus) {
      return;
    }

    context.core.eventBus.emit("action:status", {
      message,
      timestamp: Date.now()
    });

    if (message) {
      console.log(`[REALTIME] ${message}`);
    } else {
      console.log("[REALTIME] status cleared");
    }
  }

  function ensureSession(sessionId = "default") {
    context.sessions = context.sessions || {};
    context.sessions[sessionId] = context.sessions[sessionId] || {
      id: sessionId,
      memory: {},
      questions: {},
      executions: []
    };

    context.sessions[sessionId].memory = context.sessions[sessionId].memory || {};
    return context.sessions[sessionId];
  }

  function normalize(text) {
    return text?.trim() || "";
  }

  function stripAccents(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeComparableText(text) {
    return stripAccents(text).toLowerCase().trim();
  }

  function getRuntimeTimeZone() {
    return process.env.KIT_TIMEZONE || process.env.TZ || "America/Sao_Paulo";
  }

  function buildCurrentDateTimeContext(now = new Date()) {
    const timeZone = getRuntimeTimeZone();
    const weekday = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      timeZone
    }).format(now);
    const date = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone
    }).format(now);
    const time = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone
    }).format(now);
    const [hour = "", minute = ""] = time.split(":");
    const spokenTime = `${Number(hour)} horas${Number(minute) > 0 ? ` e ${Number(minute)} minutos` : ""}`;

    return {
      weekday,
      date,
      time,
      spokenTime,
      timeZone,
      iso: now.toISOString()
    };
  }

  function buildDirectTemporalReply(text = "") {
    const normalized = normalizeComparableText(text);
    const asksTime = /\b(que horas|qual hora|horas sao|horario agora|hora atual)\b/.test(normalized);
    const asksDate = /\b(que dia|dia e hoje|data de hoje|qual a data|hoje e que dia|dia da semana)\b/.test(normalized);

    if (!asksTime && !asksDate) {
      return null;
    }

    const current = buildCurrentDateTimeContext();

    if (asksTime && asksDate) {
      return `Agora sao ${current.spokenTime}. Hoje e ${current.weekday}, ${current.date}.`;
    }

    if (asksTime) {
      return `Agora sao ${current.spokenTime}.`;
    }

    return `Hoje e ${current.weekday}, ${current.date}.`;
  }

  function isDifferenceComparisonRequest(text) {
    const normalized = stripAccents(text).toLowerCase();
    return (
      /\b(diferenca|diferencas|compare|comparar|comparacao|mudanca|mudancas)\b/.test(normalized) &&
      /\b(cima|baixo|superior|inferior|duas imagens|imagem de cima|imagem de baixo)\b/.test(normalized)
    );
  }

  function truncateSection(value, maxChars, suffix = "\n[trecho truncado]") {
    const text = String(value || "").trim();
    if (!text || text.length <= maxChars) {
      return text;
    }

    return `${text.slice(0, Math.max(0, maxChars - suffix.length)).trim()}${suffix}`;
  }

  function isLLMTimeoutError(err) {
    if (!err) return false;
    return err.code === "LLM_TIMEOUT" || err.code === "LLM_ERROR_TIMEOUT";
  }

  function isLLMFailureError(err) {
    if (!err) return false;
    return err.code === "LLM_TIMEOUT" || err.code === "LLM_ERROR" || err.code === "LLM_ERROR_TIMEOUT" || err.code === "LLM_EMPTY";
  }

  function isVisionFailureError(err) {
    if (!err) return false;
    return err.code === "VISION_TIMEOUT" || err.code === "VISION_UNAVAILABLE";
  }

  function isAudioFailureError(err) {
    if (!err) return false;
    return err.code === "AUDIO_TIMEOUT" || err.code === "AUDIO_UNAVAILABLE";
  }

  function isVideoFailureError(err) {
    if (!err) return false;
    return err.code === "VIDEO_TIMEOUT" || err.code === "VIDEO_UNAVAILABLE";
  }

  function buildFriendlyRealtimeReply(kind = "generic") {
    if (kind === "vision") {
      return "A analise da imagem ou da tela realmente demorou demais desta vez. Se quiser, tenta de novo que eu refaço com calma.";
    }

    if (kind === "audio") {
      return "Demorei demais para analisar o audio. Tenta de novo ou manda um trecho menor.";
    }

    if (kind === "video") {
      return "Demorei demais para analisar o video. Tenta de novo ou manda um trecho menor.";
    }

    return FRIENDLY_LLM_FALLBACK;
  }

  function buildSafeRealtimeFallback(err) {
    if (isVisionFailureError(err)) {
      return buildFriendlyRealtimeReply("vision");
    }

    if (isAudioFailureError(err)) {
      return buildFriendlyRealtimeReply("audio");
    }

    if (isVideoFailureError(err)) {
      return buildFriendlyRealtimeReply("video");
    }

    if (err?.code === "LLM_TIMEOUT") {
      return buildFriendlyRealtimeReply("generic");
    }

    return "Tive um erro ao responder agora. Tenta mais uma vez.";
  }

  function buildSearchFallbackReply(searchResult, userText = "") {
    const raw = String(searchResult || "").trim();
    if (!raw) {
      return null;
    }

    const normalized = raw.toLowerCase();
    if (
      normalized.includes("nao consegui acessar a pesquisa agora") ||
      normalized.includes("não consegui acessar a pesquisa agora") ||
      normalized.includes("nao consegui ver isso agora") ||
      normalized.includes("não consegui ver isso agora")
    ) {
      return null;
    }

    const summaryMatch = raw.match(/RESUMO:\s*([\s\S]*?)(?:\n\s*\nFONTES:|$)/i);
    const sourcesBlockMatch = raw.match(/FONTES:\s*([\s\S]*)$/i);
    const summary = String(summaryMatch?.[1] || raw)
      .replace(/\s+/g, " ")
      .trim();

    const sourceLines = String(sourcesBlockMatch?.[1] || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .map((line) => line.replace(/\s+/g, " "));

    const intro = userText
      ? `Encontrei isso sobre ${String(userText).replace(/[.!?]+$/g, "").trim()}:`
      : "Encontrei isso:";

    const compactSummary = truncateSection(summary, 420, "...");
    const compactSources = sourceLines.length
      ? ` Fontes citadas: ${sourceLines.map((line) => truncateSection(line, 110, "...")).join(" | ")}`
      : "";

    return `${intro} ${compactSummary}${compactSources}`.trim();
  }

  function emitSyntheticRealtimeStream({
    text = "",
    sessionId = "default",
    source = "realtime",
    chunkSize = 18
  }) {
    const finalText = String(text || "").trim();
    if (!finalText || !context.core?.eventBus) {
      return;
    }

    context.core.eventBus.emit("llm:started", {
      source,
      sessionId,
      executionId: null,
      model: "synthetic",
      mode: "realtime",
      profile: "synthetic",
      think: false
    });

    for (let index = 0; index < finalText.length; index += chunkSize) {
      context.core.eventBus.emit("llm:token", {
        source,
        sessionId,
        executionId: null,
        token: finalText.slice(index, index + chunkSize)
      });
    }

    context.core.eventBus.emit("llm:completed", {
      source,
      sessionId,
      executionId: null,
      model: "synthetic",
      mode: "realtime",
      profile: "synthetic",
      think: false,
      hasThought: false,
      timeToFirstTokenMs: 0,
      totalDurationMs: 0
    });
  }

  function extractCommandPayload(text, patterns = []) {
    const normalized = String(text || "").trim();
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match?.[1]) {
        return match[1].trim().replace(/[.!?]+$/g, "").trim();
      }
    }
    return "";
  }

  function cleanPlayMediaQuery(text) {
    return stripAccents(text)
      .replace(/\b(kita|kit|kit ia)\b/gi, "")
      .replace(/\b(toca|tocar|toque|coloca|colocar|coloque|ouve|ouvir|escuta|escutar|escute)\b/gi, "")
      .replace(/\b(musica|som|faixa|playlist)\b/gi, "")
      .replace(/\s+/g, " ")
      .replace(/^[,.:;\-]+|[,.:;\-]+$/g, "")
      .trim();
  }

  function detectMemoryCommand(text = "") {
    const raw = String(text || "").trim();
    const stripPrefix = (value) => value
      .replace(/^(?:kit|kita|kit ia)\s*[,;:.-]?\s*/i, "")
      .trim();
    const commandText = stripPrefix(raw);
    const commandNormalized = normalizeComparableText(commandText);

    if (/^memoria$/.test(commandNormalized)) {
      return { action: "list" };
    }

    const openTitle = extractCommandPayload(commandText, [
      /^\s*abrir\s+mem[oó]ria\s*[:;-]\s*(.+)$/i,
      /^\s*abra\s+a?\s*mem[oó]ria\s*[:;-]\s*(.+)$/i
    ]);
    if (openTitle) {
      return { action: "open", title: openTitle };
    }

    const deleteTitle = extractCommandPayload(commandText, [
      /^\s*esquecer\s+isso\s*[:;-]\s*(.+)$/i,
      /^\s*esque[cç]a\s+isso\s*[:;-]\s*(.+)$/i,
      /^\s*apague\s+(?:esta|essa|a)?\s*mem[oó]ria\s*[:;-]\s*(.+)$/i,
      /^\s*exclui\s+(?:esta|essa|a)?\s*mem[oó]ria\s*[:;-]\s*(.+)$/i,
      /^\s*excluir\s+(?:esta|essa|a)?\s*mem[oó]ria\s*[:;-]\s*(.+)$/i
    ]);
    if (deleteTitle) {
      return { action: "delete", title: deleteTitle };
    }

    const knowledgeQuery = extractCommandPayload(commandText, [
      /^\s*(?:me\s+diga\s+)?(?:o\s+que|oque)\s+(?:voce|voc[eê])\s+sabe\s+sobre\s+(.+)$/i,
      /^\s*(?:voce|voc[eê])?\s*sabe\s+sobre\s+(.+)$/i,
      /^\s*me\s+diga\s+o\s+que\s+sabe\s+sobre\s+(.+)$/i
    ]);
    if (knowledgeQuery) {
      return { action: "search_answer", query: knowledgeQuery };
    }

    return null;
  }

  function detectIntent(text) {
    if (isHelpCommand(text)) {
      return { helpCommand: true };
    }

    const lower = String(text || "").toLowerCase();
    const includesTerm = (term) => {
      if (term.includes(" ")) {
        return lower.includes(term);
      }

      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(lower);
    };

    const searchTriggers = ["pesquise", "busque", "pesquisa", "noticias", "noticia", "procure", "busca"];
    const visionTriggers = ["olha", "ve", "ver", "tela", "print", "olhar", "screenshot"];
    const legacyScreenCommandPatterns = [
      /\b(olha|olhar|ve|ver|mostra|mostrar|analisa|analisar|descreve|descrever)\b.*\b(tela|print|screenshot)\b/i,
      /\b(tela|print|screenshot)\b.*\b(olha|olhar|ve|ver|mostra|mostrar|analisa|analisar|descreve|descrever)\b/i
    ];
    const explicitMediaContextPatterns = [
      /\b(descreva|analise|explique|identifique|leia)\b.*\b(imagem|foto|print|screenshot|tela)\b/i,
      /\b(imagem|foto|print|screenshot|tela)\b.*\b(descreva|analise|explique|identifique|leia)\b/i,
      /\b(descreva|analise|explique|identifique|transcreva|ouca|escute)\b.*\b(audio|áudio|som|gravacao|gravação|voz)\b/i,
      /\b(audio|áudio|som|gravacao|gravação|voz)\b.*\b(descreva|analise|explique|identifique|transcreva|ouca|escute)\b/i,
      /\b(descreva|analise|explique|identifique|resuma|assista)\b.*\b(video|vídeo)\b/i,
      /\b(video|vídeo)\b.*\b(descreva|analise|explique|identifique|resuma|assista)\b/i
    ];
    const longTriggers = ["arquivo", "escreva", "corrija", "crie", "desenvolva"];
    const openAppTarget = extractCommandPayload(text, [
      /^\s*(?:(?:kit|kita|kit\s*ia)\s*[:,;-]?\s*)?abr(?:a|e|i|ir)\s+(?:(?:o|a|os|as|um|uma)\s+)?(.+)$/i
    ]);
    const normalizedText = stripAccents(text).toLowerCase();
    const playMediaTriggers = /\b(toca|tocar|toque|coloca|colocar|coloque|ouve|ouvir|escuta|escutar|escute|musica)\b/i;
    const playMediaQuery = playMediaTriggers.test(normalizedText) ? cleanPlayMediaQuery(text) : "";

    if (openAppTarget) {
      return { toolCommand: "open_app", toolInput: { target: openAppTarget } };
    }

    if (playMediaQuery) {
      return { toolCommand: "play_music", toolInput: { query: playMediaQuery } };
    }

    if (lower.includes("clica") || lower.includes("clique")) {
      return { systemCommand: "click" };
    }

    const legacyScreenCommand = legacyScreenCommandPatterns.some((pattern) => pattern.test(lower));

    return {
      requiresSearch: searchTriggers.some((trigger) => includesTerm(trigger)),
      useVision: legacyScreenCommand || visionTriggers.some((trigger) => includesTerm(trigger)),
      legacyScreenCommand,
      requiresMediaContext: explicitMediaContextPatterns.some((pattern) => pattern.test(text)),
      requiresLongTask: longTriggers.some((trigger) => includesTerm(trigger))
    };
  }

  function extractAllowedDomainsFromText(text = "") {
    const normalized = normalizeComparableText(text);
    const siteMatches = String(text || "").match(/\bsite:([a-z0-9.-]+\.[a-z]{2,})\b/gi) || [];
    const inferred = siteMatches.map((item) => item.replace(/^site:/i, "").toLowerCase());

    const namedDomains = [
      ["mercado livre", "mercadolivre.com.br"],
      ["amazon", "amazon.com.br"],
      ["kabum", "kabum.com.br"],
      ["magalu", "magazineluiza.com.br"],
      ["magazine luiza", "magazineluiza.com.br"],
      ["wikipedia", "wikipedia.org"],
      ["github", "github.com"],
      ["stackoverflow", "stackoverflow.com"],
      ["mdn", "developer.mozilla.org"],
      ["g1", "g1.globo.com"],
      ["imdb", "imdb.com"],
      ["myanimelist", "myanimelist.net"],
      ["anilist", "anilist.co"]
    ];

    for (const [label, domain] of namedDomains) {
      if (normalized.includes(label)) {
        inferred.push(domain);
      }
    }

    return Array.from(new Set(inferred.filter(Boolean)));
  }

  function inferWebSearchIntent(text = "") {
    const normalized = normalizeComparableText(text);

    if (
      /\b(lol|league of legends|campeao|campeoes|champion|champions|anime|manga|personagem|filme|serie|temporada|episodio|elenco|fandom|crunchyroll|imdb|anilist|myanimelist)\b/.test(normalized)
    ) {
      return "media";
    }

    if (
      /\b(em cartaz|cartaz hoje|cinema hoje|filmes hoje|sessoes de cinema|sessões de cinema|programacao do cinema|programação do cinema)\b/.test(normalized)
    ) {
      return "news";
    }

    if (
      /\b(preco|valor|vale|custa|quanto custa|quanto vale|fipe|faixa de preco|comparar preco|comparacao de preco|mais barato|produto|notebook|pc gamer|celular|carro|moto|veiculo)\b/.test(normalized)
    ) {
      return "price";
    }

    if (
      /\b(noticia|noticias|hoje|agora|ultima|ultimo|mais recente|recentes|atual|atualizado)\b/.test(normalized)
    ) {
      return "news";
    }

    if (
      /\b(erro|bug|stack|traceback|exception|typeerror|referenceerror|syntaxerror|docs|documentacao|api|stackoverflow|github|mdn)\b/.test(normalized)
    ) {
      return "debug";
    }

    return "general";
  }

  function shouldAutoSearch(text = "", mediaContext = null, intent = {}) {
    const normalized = normalizeComparableText(text);

    if (intent.requiresSearch) {
      return true;
    }

    if (!normalized) {
      return false;
    }

    if (userIsCorrectingAssistant(text)) {
      return true;
    }

    if (
      /\b(preco|valor|vale|custa|quanto custa|quanto vale|fipe|mercado|comparar|comparacao|mais barato|noticia|noticias|hoje|agora|ultima|ultimo|mais recente|atual)\b/.test(normalized)
    ) {
      return true;
    }

    if (
      /\b(erro|bug|traceback|exception|typeerror|referenceerror|syntaxerror|documentacao|docs|api)\b/.test(normalized)
    ) {
      return true;
    }

    if (
      /\b(lol|league of legends|campeao|campeoes|champion|champions|anime|filme|serie|personagem|temporada|episodio|elenco)\b/.test(normalized)
    ) {
      return true;
    }

    if (
      /\b(quem e|quem foi|idade de|altura de|fortuna de|presidente|ceo|ator|atriz|cantor|cantora)\b/.test(normalized)
    ) {
      return true;
    }

    if (
      mediaContext?.summary &&
      /\b(o que e|quem e|que produto e|que personagem e|que anime e|que erro e|identifica|identifique)\b/.test(normalized)
    ) {
      return true;
    }

    return false;
  }

  function buildWebSearchPlan({ text, mediaContext = null, intent = {} }) {
    const normalized = normalizeComparableText(text);
    if (!shouldAutoSearch(text, mediaContext, intent)) {
      return null;
    }

    const inferredIntent = inferWebSearchIntent(text);
    const allowedDomainsOnly = extractAllowedDomainsFromText(text);
    let query = String(text || "").trim();

    if (
      mediaContext?.summary &&
      /\b(o que e|quem e|que produto e|que personagem e|que anime e|que erro e|identifica|identifique)\b/.test(normalized)
    ) {
      query = `${query} ${truncateSection(mediaContext.summary, 180, "...")}`.trim();
    }

    if (
      /\b(ultima|ultimo|mais recente|atual|hoje|agora)\b/.test(normalized) &&
      !/\b20\d{2}\b/.test(query)
    ) {
      query = `${query} ${new Date().getFullYear()}`.trim();
    }

    if (/\b(lol|league of legends)\b/.test(normalized)) {
      query = `${query} Riot Games League of Legends`.trim();
    }

    if (
      /\b(ultimo|ultima|mais recente)\b/.test(normalized) &&
      /\b(campeao|campeoes|champion|champions)\b/.test(normalized)
    ) {
      query = `${query} newest released official`.trim();
    }

    if (/\bone piece\b/.test(normalized)) {
      query = `${query} official latest season arc`.trim();
    }

    if (/\b(em cartaz|cartaz hoje|cinema hoje|filmes hoje)\b/.test(normalized)) {
      query = `${query} brasil cinemas hoje em cartaz`.trim();
    }

    return {
      intent: inferredIntent,
      query,
      maxSources: inferredIntent === "news" ? 4 : 3,
      allowedDomainsOnly
    };
  }

  function cleanSearchQueryHeuristically(text = "", intent = "general") {
    const raw = String(text || "").trim();
    const normalized = normalizeComparableText(raw);
    if (!normalized) {
      return raw;
    }

    let cleaned = normalized
      .replace(/\b(kit|kita|por favor|pesquisa ai|pesquisa isso|procura ai|me diz|me fala|quero saber|voce viu|vc viu|entao pq vc falou|entao porque voce falou)\b/g, " ")
      .replace(/\b(qual e|qual o|qual a|quais sao|me diga|me mostra|sera que|tem como)\b/g, " ")
      .replace(/\b(vc|vcs|voce|voces)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (/\b(samsung|galaxy)\b/.test(cleaned) && /\b(ultimo|ultima|mais recente|lancado|lançado)\b/.test(cleaned)) {
      cleaned = `${cleaned} flagship latest official samsung galaxy`;
    }

    if (/\b(celular|smartphone)\b/.test(cleaned) && /\b(samsung)\b/.test(cleaned)) {
      cleaned = `${cleaned} samsung galaxy official`;
    }

    if (/\b(lol|league of legends)\b/.test(cleaned) && /\b(campeao|campeoes|champion|champions)\b/.test(cleaned)) {
      cleaned = `${cleaned} newest released official riot`;
    }

    if (/\b(em cartaz|filmes hoje|cinema hoje)\b/.test(cleaned)) {
      cleaned = `${cleaned} brasil cinemas hoje em cartaz`;
    }

    if (intent === "price") {
      cleaned = `${cleaned} preco brasil`;
    }

    return cleaned.replace(/\s+/g, " ").trim();
  }

  function isSearchPlanTooLiteral(originalText = "", plannedQuery = "") {
    const original = normalizeComparableText(originalText)
      .replace(/[?!.;,:"']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const planned = normalizeComparableText(plannedQuery)
      .replace(/[?!.;,:"']/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!original || !planned) {
      return false;
    }

    return original === planned || planned.includes(original) || original.includes(planned);
  }

  function userIsCorrectingAssistant(text = "") {
    const normalized = normalizeComparableText(text);
    if (!normalized) {
      return false;
    }

    return (
      /\b(voce nao viu|vc nao viu|você nao viu|entao pq vc falou|entao porque voce falou|pesquisa ai|pesquisa isso|ja tem|já tem|tem sim|na verdade)\b/.test(normalized) ||
      /\b(ta errado|esta errado|tá errado|errou|voce falou errado|vc falou errado)\b/.test(normalized)
    );
  }

  function parseSearchPlannerJson(value = "") {
    const raw = String(value || "").trim();
    if (!raw) {
      return null;
    }

    const fencedMatch = raw.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1] || raw;
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    const jsonText = objectMatch?.[0] || candidate;

    try {
      return JSON.parse(jsonText);
    } catch {
      return null;
    }
  }

  function emitSearchPlannerThought({ sessionId = "default", thought = "" }) {
    const finalThought = String(thought || "").trim();
    if (!finalThought || !context.core?.eventBus) {
      return;
    }

    context.core.eventBus.emit("llm:started", {
      source: "realtime-search-planner",
      sessionId,
      executionId: null,
      model: "search-planner",
      mode: "realtime",
      profile: "search-planner",
      think: true
    });

    context.core.eventBus.emit("llm:thought-token", {
      source: "realtime-search-planner",
      sessionId,
      executionId: null,
      token: finalThought
    });

    context.core.eventBus.emit("llm:completed", {
      source: "realtime-search-planner",
      sessionId,
      executionId: null,
      model: "search-planner",
      mode: "realtime",
      profile: "search-planner",
      think: true,
      hasThought: true,
      timeToFirstTokenMs: 0,
      totalDurationMs: 0
    });
  }

  async function refineWebSearchPlan({
    sessionId = "default",
    text = "",
    mediaContext = null,
    basePlan = null
  } = {}) {
    if (!basePlan) {
      return null;
    }

    try {
      const plannerPrompt = [
        "Voce e um planner de busca web.",
        "Sua tarefa e transformar o pedido do usuario em uma consulta curta, limpa e objetiva para Google.",
        "Nao copie a fala coloquial inteira do usuario.",
        "Mantenha somente entidades, produto, assunto, tempo e filtros realmente uteis.",
        "Se houver tema atual ou temporal, preserve isso.",
        "Se houver franquia/jogo/marca oficial, adicione termos oficiais uteis.",
        "Responda somente JSON valido.",
        "",
        "Schema:",
        '{',
        '  "intent": "price|news|media|debug|general",',
        '  "query": "consulta limpa",',
        '  "maxSources": 3,',
        '  "allowedDomainsOnly": ["opcional.com"]',
        '}',
        "",
        `Data atual: ${new Date().toISOString().slice(0, 10)}`,
        `Pedido do usuario: ${text}`,
        mediaContext?.summary ? `Contexto de midia: ${truncateSection(mediaContext.summary, 220, "...")}` : "",
        `Plano base: ${JSON.stringify(basePlan)}`
      ].filter(Boolean).join("\n");

      const plannerResult = await context.invokeTool("ai_chat", {
        prompt: plannerPrompt,
        source: "task.search-planner",
        sessionId,
        stream: false,
        think: true,
        emitEvents: false,
        timeoutMs: 60000,
        numPredict: 220
      });

      if (plannerResult?.status !== "ok") {
        return basePlan;
      }

      emitSearchPlannerThought({
        sessionId,
        thought: plannerResult?.data?.thought || ""
      });

      const parsed = parseSearchPlannerJson(plannerResult?.data?.text || "");
      if (!parsed || typeof parsed !== "object") {
        return basePlan;
      }

      const nextQuery = String(parsed.query || "").trim();
      const nextIntent = String(parsed.intent || "").trim().toLowerCase();
      const nextMaxSources = Number(parsed.maxSources || basePlan.maxSources || 3);
      const nextAllowedDomainsOnly = Array.isArray(parsed.allowedDomainsOnly)
        ? parsed.allowedDomainsOnly.map((item) => String(item || "").trim()).filter(Boolean)
        : basePlan.allowedDomainsOnly;

      const resolvedQuery = (() => {
        if (!nextQuery) {
          return cleanSearchQueryHeuristically(text, basePlan.intent);
        }

        if (isSearchPlanTooLiteral(text, nextQuery)) {
          return cleanSearchQueryHeuristically(nextQuery, nextIntent || basePlan.intent);
        }

        return nextQuery;
      })();

      return {
        intent: ["price", "news", "media", "debug", "general"].includes(nextIntent)
          ? nextIntent
          : basePlan.intent,
        query: resolvedQuery || basePlan.query,
        maxSources: Math.max(1, Math.min(nextMaxSources || basePlan.maxSources || 3, 6)),
        allowedDomainsOnly: nextAllowedDomainsOnly
      };
    } catch (err) {
      console.error("[REALTIME] Falha ao refinar plano de busca:", err);
      return {
        ...basePlan,
        query: cleanSearchQueryHeuristically(basePlan.query, basePlan.intent)
      };
    }
  }

  function isDetailedVisualRequest(text) {
    const normalized = stripAccents(text).toLowerCase();
    if (!normalized) {
      return false;
    }

    return [
      "descreva",
      "descricao",
      "analise",
      "detalh",
      "completa",
      "completo",
      "profunda",
      "profundo",
      "elabore",
      "liste",
      "todos",
      "todas",
      "sete erros",
      "7 erros"
    ].some((term) => normalized.includes(term));
  }

  function shouldPreferDirectMediaReply(text, mediaContext) {
    if (!mediaContext?.summary) {
      return false;
    }

    const mediaType = String(mediaContext.mediaType || "").toLowerCase();
    if (mediaType !== "image" && mediaType !== "screenshot") {
      return false;
    }

    return isDifferenceComparisonRequest(text) || isDetailedVisualRequest(text);
  }

  function rememberSessionMedia(session, media = {}) {
    const memory = session.memory || {};
    const now = Date.now();

    memory.lastMediaPath = media.imagePath || media.mediaPath || memory.lastMediaPath || null;
    memory.lastMediaType = media.mediaType || memory.lastMediaType || "image";
    memory.lastMediaAt = now;
    memory.pendingMedia = Boolean(memory.lastMediaPath);

    if (memory.lastMediaType === "screenshot") {
      memory.lastScreenshotPath = memory.lastMediaPath;
      memory.lastScreenshotAt = now;
    } else {
      memory.lastImagePath = memory.lastMediaPath;
      memory.lastImageAt = now;
    }

    memory.currentVisualContext = {
      path: memory.lastMediaPath,
      type: memory.lastMediaType,
      capturedAt: now
    };

    session.memory = memory;
  }

  async function resolveMediaContext({
    session,
    text,
    images = [],
    filePath = null,
    screenshotPath = null,
    mediaType = null,
    mimeType = null,
    intent
  }) {
    const memory = session.memory || {};
    let analysisResult = null;
    let source = null;
    let consumePendingMedia = false;
    const shouldKeepPendingAfterUse = !text && Boolean(filePath || screenshotPath || images.length > 0);

    if (filePath) {
      source = mediaType === "audio"
        ? "realtime.audio-upload"
        : mediaType === "video"
          ? "realtime.video-upload"
          : "realtime.image-upload";
      analysisResult = await context.invokeTool("analyze_media", {
        path: filePath,
        mediaType: mediaType || "image",
        mimeType,
        goal: text || "Descreva a midia de forma objetiva, sem inventar.",
        source,
        sessionId: session.id,
        think: false,
        stream: true
      });
    } else if (screenshotPath) {
      source = "realtime.screenshot-path";
      analysisResult = await context.invokeTool("analyze_media", {
        path: screenshotPath,
        goal: text || "Descreva a tela de forma objetiva, sem inventar.",
        source,
        sessionId: session.id,
        mediaType: "screenshot",
        think: false,
        stream: true
      });
    } else if (images.length > 0) {
      source = "realtime.image-inline";
      analysisResult = await context.invokeTool("analyze_media", {
        image: images[0],
        goal: text || "Descreva a imagem de forma objetiva, sem inventar.",
        source,
        sessionId: session.id,
        think: false,
        stream: true
      });
    } else if (memory.pendingMedia && memory.lastMediaPath) {
      source = "realtime.session-media";
      consumePendingMedia = true;
      analysisResult = await context.invokeTool("analyze_media", {
        path: memory.lastMediaPath,
        goal: text || "Descreva a midia de forma objetiva, sem inventar.",
        source,
        sessionId: session.id,
        mediaType: memory.lastMediaType || "image",
        think: false,
        stream: true
      });
    } else if (intent.useVision) {
      source = "realtime.screenshot-capture";
      console.log(`[REALTIME] Comando legado de tela acionado (sessionId=${session.id})`);
      analysisResult = await context.invokeTool("analyze_media", {
        capture: true,
        goal: text || "Descreva a tela de forma objetiva, sem inventar.",
        source,
        sessionId: session.id,
        mediaType: "screenshot",
        think: false,
        stream: true
      });
    }

    if (!analysisResult) {
      return null;
    }

    if (analysisResult.status !== "ok") {
      const resolvedMediaType =
        analysisResult.data?.mediaType ||
        mediaType ||
        (screenshotPath ? "screenshot" : "image");
      const mediaErrorPrefix =
        resolvedMediaType === "audio"
          ? "AUDIO"
          : resolvedMediaType === "video"
            ? "VIDEO"
            : "VISION";
      const error = new Error(analysisResult.error || "Falha ao analisar midia");
      error.code = analysisResult?.data?.kind === "timeout"
        ? `${mediaErrorPrefix}_TIMEOUT`
        : `${mediaErrorPrefix}_UNAVAILABLE`;
      error.cause = analysisResult;
      throw error;
    }

    if (consumePendingMedia) {
      session.memory.pendingMedia = false;
    }

    rememberSessionMedia(session, {
      mediaPath:
        analysisResult.data?.imagePath ||
        analysisResult.data?.audioPath ||
        analysisResult.data?.videoPath ||
        filePath ||
        screenshotPath ||
        null,
      mediaType: analysisResult.data?.mediaType || (screenshotPath ? "screenshot" : "image")
    });

    if ((analysisResult.data?.mediaType || (screenshotPath ? "screenshot" : "image")) === "screenshot") {
      console.log(
        `[REALTIME] Screenshot salvo em ${session.memory.lastScreenshotPath} (sessionId=${session.id})`
      );
    }

    if (!shouldKeepPendingAfterUse) {
      session.memory.pendingMedia = false;
    }

    return {
      summary: analysisResult.data?.summary || "",
      image: analysisResult.data?.image || null,
      audio: analysisResult.data?.audio || null,
      video: analysisResult.data?.video || null,
      imagePath: analysisResult.data?.imagePath || null,
      audioPath: analysisResult.data?.audioPath || null,
      videoPath: analysisResult.data?.videoPath || null,
      transcript: analysisResult.data?.transcript || "",
      mediaType: analysisResult.data?.mediaType || "image"
    };
  }

  function buildVisualReplyFromSummary(text, mediaContext) {
    const summary = String(mediaContext?.summary || "").trim();
    if (!summary) {
      return "";
    }

    const request = stripAccents(text).toLowerCase();
    const asksForComparison =
      /\b(diferenca|diferencas|compare|comparar|comparacao|qual a diferenca|quais sao as diferencas)\b/.test(request) &&
      /\b(cima|baixo|superior|inferior)\b/.test(request);

    if (asksForComparison) {
      return `Analisei a midia, mas a resposta final falhou. Pelo que consegui extrair: ${summary}`;
    }

    return summary;
  }

  async function handle({
    input,
    images = [],
    sessionId = "default",
    filePath = null,
    screenshotPath = null,
    mediaType = null,
    mimeType = null,
    realtimeThinkingEnabled = false,
    webSearchEnabled = true
  }) {
    const text = normalize(input);
    const session = ensureSession(sessionId);
    const intent = detectIntent(text);
    const memoryCommand = detectMemoryCommand(text);
    const realtimeStreamingEnabled = context.config?.system?.realtimeStreamingEnabled !== false;
    const hasIncomingMedia = Boolean(filePath || screenshotPath || images.length > 0 || session.memory?.pendingMedia);
    let mediaContext = null;

    if (!text && !hasIncomingMedia) {
      context.core.responseQueue.enqueue({
        text: "Preciso de texto ou de uma midia valida para continuar.",
        speak: false,
        priority: 1,
        source: "realtime-empty-input",
        allowGeneric: true,
        sessionId,
        userFacing: true
      });
      return { handled: false };
    }

    let searchResult = null;

    try {
      if (memoryCommand && !hasIncomingMedia) {
        emitStatus("lendo memoria...");
        const memoryResponse = await handleMemoryCommand({
          command: memoryCommand,
          text,
          sessionId
        });

        if (memoryResponse?.handled) {
          context.core.responseQueue.enqueue({
            text: memoryResponse.text,
            speak: memoryResponse.speak === true,
            priority: 1,
            source: "realtime-memory",
            allowGeneric: true,
            sessionId,
            userFacing: true
          });
          emitStatus(null);

          return {
            handled: true,
            type: "memory",
            response: memoryResponse.text
          };
        }
      }

      const audioSkill = context.core.skillManager.get("audio");
      const lolCoachSkill = context.core.skillManager.get("lolCoach");
      const llmMode = context.services?.ai?.getMode?.()?.requested || "fast";
      const fastMode = llmMode === "fast";
      const sessionThemeState = updateSessionThemes({ session, text });
      const leagueThemeActive = isThemeActive(session, "league_of_legends");

      if (leagueThemeActive) {
        updateActiveEntities({
          session,
          text,
          themeId: "league_of_legends",
          lolCoachService: lolCoachSkill?.service
        });
      }

      const memoryResult = await context.invokeTool("memory_access", {
        action: "get_context",
        source: "realtime.memory-context",
        sessionId,
        query: text,
        includeShortContext: !intent.useVision,
        shortLimit: intent.useVision ? 0 : (fastMode ? 4 : 5),
        shortRoles: ["user", "assistant"],
        includeLongContext: !fastMode
      });
      const memoryContext = memoryResult?.data?.text || "";

      let audioIntent = null;
      if (audioSkill?.parseCommand && text) {
        audioIntent = audioSkill.parseCommand(text);
      }

      if (!audioIntent && runtime.pendingAudioIntent && audioSkill?.completePendingAudioIntent && text) {
        audioIntent = audioSkill.completePendingAudioIntent(
          runtime.pendingAudioIntent,
          text
        );
      }

      if (audioIntent) {
        return await handleAudioIntent({
          audioIntent,
          text,
          memoryContext,
          sessionId
        });
      }

      let lolCoachContext = null;
      const explicitLolCoachIntent = lolCoachSkill?.parseCommand?.(text);
      const autoLolCoachIntent = (
        !explicitLolCoachIntent &&
        leagueThemeActive &&
        (
          sessionThemeState.detected?.theme === "league_of_legends" ||
          isContextualLeagueQuestion(text)
        )
      )
        ? {
          type: "lolCoach",
          action: "context",
          text: enrichLeagueQueryWithEntities(text, session),
          originalText: text,
          sessionTheme: sessionThemeState.primaryTheme
        }
        : null;
      const lolCoachIntent = explicitLolCoachIntent || autoLolCoachIntent;
      if (lolCoachIntent) {
        emitStatus(lolCoachIntent.action === "update" ? "atualizando base do LoL..." : "lendo base local do LoL...");
        const lolCoachInput = (
          lolCoachIntent.action === "context" &&
          leagueThemeActive &&
          explicitLolCoachIntent
        )
          ? {
            ...lolCoachIntent,
            text: enrichLeagueQueryWithEntities(lolCoachIntent.text || text, session),
            originalText: text,
            sessionTheme: sessionThemeState.primaryTheme
          }
          : lolCoachIntent;
        const lolCoachResult = await lolCoachSkill.execute({
          input: lolCoachInput,
          context,
          services: context.services,
          tools: context.tools,
          invokeTool: context.invokeTool,
          skills: context.core.skillManager
        });

        if (lolCoachResult?.type === "status" || !lolCoachResult?.success) {
          const reply = lolCoachResult?.message || "Base do LoL ainda não existe. Use: Kit, atualizar dados do LoL.";
          context.core.responseQueue.enqueue({
            text: reply,
            speak: true,
            priority: 1,
            source: "realtime-lolCoach",
            allowGeneric: true,
            sessionId,
            userFacing: true
          });
          emitStatus(null);

          return {
            handled: true,
            type: "lolCoach",
            response: reply,
            result: lolCoachResult
          };
        }

        lolCoachContext = lolCoachResult.runtimeContext || null;
      }

      if (intent.helpCommand) {
        context.core.responseQueue.enqueue({
          text: buildHelpText(),
          speak: false,
          priority: 1,
          source: "realtime-help",
          allowGeneric: true,
          sessionId,
          userFacing: true
        });

        return {
          handled: true,
          type: "help"
        };
      }

      if (intent.toolCommand) {
        const toolResult = await context.invokeTool(intent.toolCommand, intent.toolInput || {});
        console.log(`[REALTIME] Tool ${intent.toolCommand} ->`, toolResult);
        const feedbackText = buildToolFeedback(intent.toolCommand, toolResult, text);

        context.core.responseQueue.enqueue({
          text: feedbackText,
          speak: true,
          priority: 1,
          source: "realtime-tool",
          allowGeneric: true,
          sessionId,
          userFacing: true
        });

        return {
          handled: true,
          type: intent.toolCommand,
          result: toolResult
        };
      }

      if (intent.systemCommand) {
        executeSystemCommand(intent.systemCommand);

        context.core.responseQueue.enqueue({
          text: "Ja fiz.",
          speak: true,
          priority: 1,
          source: "realtime-system",
          allowGeneric: true,
          sessionId,
          userFacing: true
        });

        return { handled: true, type: "system" };
      }

      const temporalReply = buildDirectTemporalReply(text);
      if (temporalReply) {
        context.core.responseQueue.enqueue({
          text: temporalReply,
          speak: true,
          priority: 1,
          source: "realtime-temporal",
          allowGeneric: true,
          sessionId,
          userFacing: true
        });

        return {
          handled: true,
          type: "temporal",
          response: temporalReply
        };
      }

      if (intent.requiresMediaContext && !hasIncomingMedia && !intent.useVision) {
        throw new Error("Voce pediu analise de midia, mas nao existe arquivo valido no contexto.");
      }

      if (intent.legacyScreenCommand && !filePath && !screenshotPath && images.length === 0) {
        emitStatus("capturando tela...");
      } else {
        emitStatus("lendo...");
      }

      mediaContext = await resolveMediaContext({
        session,
        text,
        images,
        filePath,
        screenshotPath,
        mediaType,
        mimeType,
        intent
      });

      if (intent.requiresMediaContext && !mediaContext) {
        throw new Error("Nao encontrei midia valida para analisar.");
      }

      let webSearchPlan = lolCoachContext ? null : buildWebSearchPlan({
        text,
        mediaContext,
        intent
      });

      if (webSearchPlan && webSearchEnabled !== false) {
        try {
          emitStatus("pensando na busca...");
          webSearchPlan = await refineWebSearchPlan({
            sessionId,
            text,
            mediaContext,
            basePlan: webSearchPlan
          });

          emitStatus("pesquisando na web...");
          const searchToolResult = await context.invokeTool("web_search", webSearchPlan);

          if (searchToolResult?.status === "ok") {
            searchResult = searchToolResult?.data?.text || null;
          } else if (searchToolResult?.data?.code === "WEB_SEARCH_CAPTCHA") {
            const captchaMessage = "Encontrei um CAPTCHA na pesquisa web. Resolve a janela de busca e me pede de novo que eu continuo.";
            context.core.responseQueue.enqueue({
              text: captchaMessage,
              speak: true,
              priority: 1,
              source: "realtime-search-captcha",
              allowGeneric: true,
              sessionId,
              userFacing: true
            });

            return {
              handled: true,
              type: "web_search_captcha",
              response: captchaMessage
            };
          } else {
            console.error("[REALTIME] Pesquisa web falhou:", searchToolResult);
          }
        } catch (err) {
          console.error("[REALTIME] Erro search:", err);
          searchResult = "Nao consegui acessar a pesquisa agora.";
        }
      }

      emitStatus("lendo...");

      const response = await generateResponse({
        text,
        memoryContext,
        searchResult,
        mediaContext,
        lolCoachContext,
        sessionId,
        realtimeThinkingEnabled
      });

      const queued = context.core.responseQueue.enqueue({
        text: response.text,
        speakText: response.speakText,
        speak: true,
        priority: 1,
        source: "realtime",
        sessionId,
        userFacing: true
      });

      if (!queued) {
        throw new Error("Resposta bloqueada pelos filtros da realtime");
      }

      emitStatus(null);

      return {
        handled: true,
        type: "realtime",
        response: response.text,
        media: mediaContext ? {
          imagePath: mediaContext.imagePath,
          mediaType: mediaContext.mediaType
        } : null
      };
    } catch (err) {
      console.error("[REALTIME] Erro critico:", err);
      emitStatus(null);

      if (isLLMFailureError(err) || err?.message?.includes("LLM demorou para responder")) {
        const visualFallback = buildVisualReplyFromSummary(text, mediaContext);
        if (visualFallback) {
          if (realtimeStreamingEnabled) {
            emitSyntheticRealtimeStream({
              text: visualFallback,
              sessionId
            });
          }

          context.core.responseQueue.enqueue({
            text: visualFallback,
            speak: true,
            priority: 1,
            source: "realtime-visual-fallback",
            allowGeneric: true,
            sessionId,
            userFacing: true
          });

          return {
            handled: true,
            type: "realtime",
            response: visualFallback,
            fallback: true
          };
        }

        const searchFallback = buildSearchFallbackReply(searchResult, text);
        if (searchFallback) {
          if (realtimeStreamingEnabled) {
            emitSyntheticRealtimeStream({
              text: searchFallback,
              sessionId
            });
          }

          context.core.responseQueue.enqueue({
            text: searchFallback,
            speak: true,
            priority: 1,
            source: "realtime-search-fallback",
            allowGeneric: true,
            sessionId,
            userFacing: true
          });

          return {
            handled: true,
            type: "realtime",
            response: searchFallback,
            fallback: true
          };
        }

        const fallbackText = buildSafeRealtimeFallback(err);

        context.core.responseQueue.enqueue({
          text: fallbackText,
          speak: true,
          priority: 1,
          source: "realtime",
          allowGeneric: true,
          sessionId,
          userFacing: true
        });

        return {
          handled: true,
          type: "realtime",
          response: fallbackText,
          fallback: true
        };
      }

      if (isVisionFailureError(err)) {
        const fallbackText = buildFriendlyRealtimeReply("vision");

        context.core.responseQueue.enqueue({
          text: fallbackText,
          speak: true,
          priority: 1,
          source: "realtime",
          allowGeneric: true,
          sessionId,
          userFacing: true
        });

        return {
          handled: true,
          type: "realtime",
          response: fallbackText,
          fallback: true
        };
      }

      context.core.responseQueue.enqueue({
        text: buildSafeRealtimeFallback(err),
        speak: true,
        priority: 1,
        source: "realtime-error",
        allowGeneric: true,
        sessionId,
        userFacing: true
      });

      return { handled: false, error: err.message };
    }
  }

  async function handleAudioIntent({ audioIntent, text, memoryContext, sessionId }) {
    let quickReply = "Tudo bem, vou gerar o audio.";
    let queued = false;
    let taskId = null;

    if (audioIntent.missingText && audioIntent.missingVoice) {
      quickReply = "Certo, quero gerar um audio. Me diga o texto e qual voz voce quer usar (masculina, feminina ou locutor).";
    } else if (audioIntent.missingVoice) {
      quickReply = "Qual voz voce quer usar para o audio? Masculina, feminina ou locutor.";
    } else if (audioIntent.missingText) {
      quickReply = "Perfeito, qual texto voce quer transformar em audio?";
    } else {
      const voiceLabel = audioIntent.voiceName || audioIntent.voiceFunction || audioIntent.voiceGenre || "padrao";
      quickReply = `Beleza, estou gerando o audio com voz ${voiceLabel}.`;
      queued = true;

      if (context.core?.routes?.task) {
        taskId = await context.core.routes.task.enqueueAudioTask({
          type: "audio",
          data: audioIntent,
          text,
          memoryContext
        });
      }
    }

    if (audioIntent.missingText || audioIntent.missingVoice) {
      runtime.pendingAudioIntent = audioIntent;
    } else {
      runtime.pendingAudioIntent = null;
    }

    context.core.responseQueue.enqueue({
      text: quickReply,
      speak: true,
      priority: 1,
      source: "realtime-audio",
      allowGeneric: true,
      sessionId,
      userFacing: true
    });

    return { handled: true, type: "audio", queued, taskId };
  }

  function executeSystemCommand(cmd) {
    switch (cmd) {
      case "open_chrome":
        console.log("[REALTIME] Abrindo Chrome...");
        break;
      case "click":
        console.log("[REALTIME] Click simulado...");
        break;
      default:
        console.log(`[REALTIME] Comando desconhecido: ${cmd}`);
    }
  }

  function buildToolFeedback(toolName, result, originalText = "") {
    if (toolName === "open_app") {
      if (result?.status === "ok") {
        return `Abrindo ${result.displayName || result.app || "o aplicativo"}.`;
      }

      if (result?.status === "need_input") {
        return result.question || "Qual aplicativo devo abrir?";
      }

      if (result?.error === "APP_NOT_FOUND") {
        return `Nao encontrei um aplicativo configurado para "${originalText}".`;
      }

      if (result?.error === "COMMAND_NOT_FOUND") {
        return `Encontrei ${result.displayName || result.app || "esse aplicativo"}, mas o caminho configurado nao existe.`;
      }

      return "Nao consegui abrir esse aplicativo agora.";
    }

    if (toolName === "play_media" || toolName === "play_music") {
      if (result?.status === "ok" && (result.provider === "local" || result.type === "local")) {
        return "Tocando a musica encontrada na biblioteca local.";
      }

      if (result?.status === "ok" && (result.provider === "youtube" || result.type === "youtube")) {
        return "Abri a busca no YouTube para tocar isso.";
      }

      if (result?.status === "need_input") {
        return result.question || "O que voce quer tocar?";
      }

      return "Nao consegui tocar isso agora.";
    }

    return "Ja fiz.";
  }

  async function handleMemoryCommand({ command, text, sessionId }) {
    if (!command) {
      return null;
    }

    if (command.action === "list") {
      const result = await context.invokeTool("memory_access", {
        action: "list",
        source: "realtime.memory-list",
        sessionId,
        limit: 80
      });

      return {
        handled: true,
        type: "memory",
        text: result?.data?.text || "Nao consegui listar a memoria agora.",
        speak: false
      };
    }

    if (command.action === "open" || command.action === "delete") {
      const result = await context.invokeTool("memory_access", {
        action: command.action,
        source: `realtime.memory-${command.action}`,
        sessionId,
        title: command.title
      });

      return {
        handled: true,
        type: "memory",
        text: result?.data?.text || "Nao consegui acessar essa memoria agora.",
        speak: false
      };
    }

    if (command.action === "search_answer") {
      const memoryResult = await context.invokeTool("memory_access", {
        action: "search",
        source: "realtime.memory-search",
        sessionId,
        query: command.query,
        limit: 8
      });
      const memoryContext = String(memoryResult?.data?.text || "").trim();

      if (!memoryContext) {
        return {
          handled: true,
          type: "memory",
          text: `Nao achei memoria salva sobre "${command.query}".`,
          speak: true
        };
      }

      const prompt = `
Voce e a KIT respondendo com base exclusivamente na memoria salva abaixo.
Se a memoria nao tiver informacao suficiente para responder o pedido, diga isso com naturalidade.
Nao use vocabulario/girias como se fossem memoria comum. Nao invente fatos fora do contexto.

Memoria encontrada:
${memoryContext}

Pedido do usuario:
${text}

Resposta natural:
`;

      const ai = await context.invokeTool("ai_chat", {
        prompt,
        source: "realtime.memory-answer",
        sessionId,
        stream: context.config?.system?.realtimeStreamingEnabled !== false
      });

      return {
        handled: true,
        type: "memory",
        text: String(ai?.data?.text || "").trim() || "Achei memoria, mas nao consegui transformar isso numa resposta agora.",
        speak: true
      };
    }

    return null;
  }

  async function generateResponse({ text, memoryContext, searchResult, mediaContext, lolCoachContext = null, sessionId, realtimeThinkingEnabled = false }) {
    if (shouldPreferDirectMediaReply(text, mediaContext)) {
      if (context.config?.system?.realtimeStreamingEnabled !== false) {
        emitSyntheticRealtimeStream({
          text: mediaContext.summary,
          sessionId
        });
      }

      return {
        text: mediaContext.summary,
        speakText: mediaContext.summary
      };
    }

    const prompt = await buildPrompt({
      text,
      memoryContext,
      searchResult,
      mediaContext,
      lolCoachContext,
      usePersona: true
    });

    const ai = await context.invokeTool("ai_chat", {
      prompt,
      images: mediaContext?.summary ? [] : (mediaContext?.image ? [mediaContext.image] : []),
      source: "realtime",
      sessionId,
      stream: context.config?.system?.realtimeStreamingEnabled !== false,
      think: realtimeThinkingEnabled === true,
      timeoutMs: searchResult ? 90000 : undefined
    });

    if (ai?.status !== "ok") {
      const error = new Error(ai?.error || "Falha ao gerar resposta realtime");
      if (ai?.data?.kind === "timeout") {
        error.code = "LLM_TIMEOUT";
      } else if (ai?.error === "empty_response") {
        error.code = "LLM_EMPTY";
      } else {
        error.code = "LLM_ERROR";
      }
      error.cause = ai;
      throw error;
    }

    const responseText = String(ai?.data?.text || "").trim();
    const speakText = String(ai?.data?.speakText || responseText).trim();

    if (!hasUsableAssistantText(responseText)) {
      const error = new Error("empty_response");
      error.code = "LLM_EMPTY";
      throw error;
    }

    return {
      text: responseText,
      speakText
    };
  }

  async function buildPrompt({ text, memoryContext, searchResult, mediaContext, lolCoachContext = null, usePersona = true }) {
    const personalityConfig = context.config?.personality || {};
    const base = personalityConfig.base || {};
    const routeBehavior = getRouteBehavior("realtime");
    const identity = base.identity || {};
    const promptSections = base.promptSections || {};

    const derivedEmotion = usePersona ? deriveEmotionFromState(state) : { type: "neutral" };
    const emotion = derivedEmotion.type || "neutral";
    const action = usePersona ? state.routine?.currentAction || "idle" : "idle";

    const hasVisualContext = Boolean(mediaContext);
    const isVisualComparison = isDifferenceComparisonRequest(text);
    const effectiveUserText = truncateSection(
      text || "Descreva a imagem de forma objetiva, sem inventar.",
      hasVisualContext ? 900 : 700
    );
    const trimmedMemoryContext = truncateSection(memoryContext, hasVisualContext ? 700 : 500);
    const trimmedSearchResult = truncateSection(searchResult, 700);
    const trimmedMediaSummary = truncateSection(mediaContext?.summary || "", hasVisualContext ? 2200 : 500);
    const trimmedLolCoachContext = truncateSection(lolCoachContext?.contextText || "", 1800);
    const realtimeInstructions = (routeBehavior.instructions || [])
      .map((instruction) => `- ${instruction}`)
      .join("\n");

    const identityLayer = usePersona ? `
Voce e ${base.name || "KIT"}.

${promptSections.identityTitle || "Identidade"}:
- Arquetipo: ${identity.archetype || "assistente conversacional"}
- Estilo: ${identity.style || "conversa direta"}
- Tom base: ${identity.baseTone || "natural"}
- Identidade de genero: ${identity.genderIdentity || "feminina"}
- Pronomes: ${identity.pronouns || ""}
- Vibe: ${identity.presentation || "direta e falada"}
- Relacao com o usuario: ${identity.relationship || "parceira de conversa"}

Guardrails de conversa:
${realtimeInstructions}
` : "";

    const emotionLayer = usePersona ? `
${promptSections.internalStateTitle || "Estado interno"}:
- Emocao: ${emotion}
- Acao atual: ${action}
` : "";

    const memoryLayer = trimmedMemoryContext ? `
${promptSections.memoryTitle || "Memoria relevante"}:
${trimmedMemoryContext}
` : "";

    const searchLayer = trimmedSearchResult ? `
${promptSections.searchTitle || "Resultado da pesquisa web"}:
${trimmedSearchResult}
` : "";

    const mediaLayer = mediaContext ? `
${promptSections.visualContextTitle || "Contexto de midia analisada"}:
- Tipo: ${mediaContext.mediaType}
- Caminho: ${mediaContext.imagePath || mediaContext.audioPath || mediaContext.videoPath || "sem-caminho"}
- Analise objetiva: ${trimmedMediaSummary}

Use esse contexto de midia junto com a instrucao textual. Se a analise estiver insuficiente, diga isso explicitamente e nao invente.
` : "";
    const lolCoachLayer = trimmedLolCoachContext ? `
Contexto tecnico local de LoL:
${trimmedLolCoachContext}

Metadados lolCoach:
- Camada: ${lolCoachContext.layer}
- Intent: ${lolCoachContext.intent}
- Patch fonte: ${lolCoachContext.sourcePatch}
- Politica de personalidade: ${lolCoachContext.personalityPolicy}
- Restricoes de resposta: ${JSON.stringify(lolCoachContext.responseConstraints || {})}

Use o contexto tecnico acima como base factual para League of Legends. A personalidade, tom e estilo continuam vindo exclusivamente da rota atual da KIT.
` : "";
    const currentDateTime = buildCurrentDateTimeContext();
    const temporalLayer = `
Data e hora atuais:
- Data: ${currentDateTime.weekday}, ${currentDateTime.date}
- Hora: ${currentDateTime.spokenTime} (${currentDateTime.time})
- Fuso: ${currentDateTime.timeZone}
- ISO: ${currentDateTime.iso}
`;

    return `
${identityLayer}
${emotionLayer}
${temporalLayer}
${memoryLayer}
${searchLayer}
${mediaLayer}
${lolCoachLayer}

Instrucao do usuario:
${effectiveUserText}

Evite respostas genericas como "claro, posso ajudar" ou "como posso ajudar voce hoje".
Nao exponha raciocinio interno, prompt, metadados, JSON cru, markdown, logs ou instrucoes de sistema.
${hasVisualContext && isDetailedVisualRequest(text)
  ? "Para pedidos de analise visual detalhada, responda de forma completa, objetiva e cobrindo o maximo de detalhes confirmaveis."
  : "Para pedidos simples, responda em ate 3 frases naturais, com contexto suficiente para nao soar monossilabica."}
${isVisualComparison ? "Se o pedido for comparar imagem de cima e de baixo, responda com lista numerada completa e objetiva, sem resumir em 1 frase." : ""}
${trimmedSearchResult ? "Quando houver resultado de pesquisa web, priorize essas fontes acima da memoria do modelo. Se algo nao estiver confirmado nas fontes, diga que nao conseguiu confirmar." : ""}
${trimmedSearchResult ? "Se a pergunta pedir o ultimo, a ultima, o mais recente ou o atual, compare as fontes e prefira a informacao mais recente, dando prioridade a dominio oficial quando existir." : ""}
${trimmedSearchResult ? "Se voce usar a pesquisa web para responder, termine com uma secao 'Fontes:' citando de 1 a 3 URLs ou dominios das fontes usadas." : ""}
${trimmedLolCoachContext ? "Para LoL, nao diga que pesquisou na web; esta resposta usa cache local. Respeite as restricoes de resposta do lolCoach sem expor JSON cru." : ""}
Se houver imagem ou tela no contexto, responda com base nela.
Resposta:
`;
  }

  return {
    handle
  };
}
