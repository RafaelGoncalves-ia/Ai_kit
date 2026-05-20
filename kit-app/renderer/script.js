const renderedMessages = new Set();
const chatBox = document.getElementById("chatBox");
const chatContainer = document.getElementById("chatContainer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const kitIcon = document.getElementById("kitIcon");
const messageTemplate = document.getElementById("messageTemplate");
const processingIndicator = document.getElementById("processingIndicator");
const scrollToBottomBtn = document.getElementById("scrollToBottomBtn");

const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");
const configBtn = document.getElementById("configBtn");
const appMenuBtn = document.getElementById("appMenuBtn");
const appMenu = document.getElementById("appMenu");
const studioBtn = document.getElementById("studioBtn");
const canvasBtn = document.getElementById("canvasBtn");
const productionPlannerBtn = document.getElementById("productionPlannerBtn");
const thinkingBtn = document.getElementById("thinkingBtn");
const internetBtn = document.getElementById("internetBtn");
const llmModeSelector = document.getElementById("llmModeSelector");
const llmModeToggle = document.getElementById("llmModeToggle");
const llmModeIcon = document.getElementById("llmModeIcon");
const llmModeMenu = document.getElementById("llmModeMenu");
const llmFastBtn = document.getElementById("llmFastBtn");
const llmSmartBtn = document.getElementById("llmSmartBtn");
const llmModeStatus = document.getElementById("llmModeStatus");

const API_BASE = "http://localhost:3001";
const API_URL = `${API_BASE}/chat`;
const EVENTS_URL = `${API_BASE}/events`;
const AUTO_SCROLL_THRESHOLD = 80;
const MAX_VIDEO_MB = 40;
const MAX_AUDIO_MB = 12;
const MAX_RECORD_AUDIO_MS = 90000;
const MAX_INPUT_LINES = 7;
const INPUT_LINE_HEIGHT = 24;
const LONG_MESSAGE_CHAR_THRESHOLD = 520;
const LONG_MESSAGE_LINE_THRESHOLD = 10;

let currentConversationId = null;
let selectedAttachment = null;
let activeAssistantStream = null;
let conversationLoadToken = 0;
let refreshConversationTimeout = null;
let attachmentRecorder = null;
let attachmentChunks = [];
let attachmentStream = null;
let attachmentTimeout = null;
let realtimeThinkingEnabled = window.localStorage.getItem("kit.realtimeThinkingEnabled") === "true";
let webSearchEnabled = window.localStorage.getItem("kit.webSearchEnabled") !== "false";
let realtimeStreamingEnabled = true;
let autoScrollLocked = true;
let suppressScrollLockUpdate = false;
const agentTraceBlocks = new Map();
const agentTraceStore = new Map();

function traceStorageKey(conversationId = currentConversationId) {
  return `kit.agentTraces.${conversationId || "default"}`;
}

function loadStoredAgentTraces(conversationId = currentConversationId) {
  try {
    const raw = window.sessionStorage.getItem(traceStorageKey(conversationId));
    const traces = JSON.parse(raw || "[]");
    agentTraceStore.set(conversationId, Array.isArray(traces) ? traces : []);
    return agentTraceStore.get(conversationId);
  } catch {
    agentTraceStore.set(conversationId, []);
    return [];
  }
}

function saveStoredAgentTraces(conversationId = currentConversationId) {
  if (!conversationId) return;
  const traces = agentTraceStore.get(conversationId) || [];
  try {
    window.sessionStorage.setItem(traceStorageKey(conversationId), JSON.stringify(traces.slice(-12)));
  } catch {}
}

function upsertStoredAgentTrace(tracePatch = {}) {
  const conversationId = tracePatch.sessionId || currentConversationId;
  if (!conversationId || !tracePatch.runId) return null;
  const traces = agentTraceStore.get(conversationId) || loadStoredAgentTraces(conversationId);
  let stored = traces.find((trace) => trace.runId === tracePatch.runId);
  if (!stored) {
    stored = {
      runId: tracePatch.runId,
      sessionId: conversationId,
      startedAt: Number(tracePatch.startedAt || Date.now()),
      endedAt: null,
      elapsedMs: 0,
      title: tracePatch.title || "Worked for 0s",
      collapsed: tracePatch.collapsed === true,
      lines: [],
      status: "running"
    };
    traces.push(stored);
  }
  Object.assign(stored, tracePatch);
  agentTraceStore.set(conversationId, traces);
  saveStoredAgentTraces(conversationId);
  return stored;
}

function isUserFacingStreamSource(source = "") {
  const normalized = String(source || "").trim().toLowerCase();
  return (
    normalized.startsWith("realtime") ||
    normalized.startsWith("task") ||
    normalized.startsWith("agent")
  );
}

function shouldHandleStreamingPayload(payload = {}) {
  if (!payload?.sessionId || payload.sessionId !== currentConversationId) {
    return false;
  }

  return isUserFacingStreamSource(payload.source);
}

function shouldDisplaySessionPayload(payload = {}) {
  return Boolean(payload?.sessionId && payload.sessionId === currentConversationId);
}

function getChatScrollContainer() {
  return chatContainer || chatBox?.parentElement || null;
}

function isNearBottom() {
  const container = getChatScrollContainer();
  if (!container) {
    return true;
  }

  const distanceToBottom =
    container.scrollHeight - container.clientHeight - container.scrollTop;

  return distanceToBottom <= AUTO_SCROLL_THRESHOLD;
}

function setAutoScrollLocked(locked) {
  autoScrollLocked = locked !== false;

  if (scrollToBottomBtn) {
    scrollToBottomBtn.classList.toggle("hidden", autoScrollLocked);
  }
}

function captureScrollState() {
  const container = getChatScrollContainer();
  if (!container) {
    return {
      stickToBottom: true,
      bottomOffset: 0
    };
  }

  return {
    stickToBottom: autoScrollLocked || isNearBottom(),
    bottomOffset: Math.max(
      0,
      container.scrollHeight - container.clientHeight - container.scrollTop
    )
  };
}

function restoreScrollState(state, options = {}) {
  const container = getChatScrollContainer();
  if (!container) {
    return;
  }

  if (options.forceBottom || state?.stickToBottom) {
    scrollBottom({
      behavior: options.behavior || "auto",
      lock: true
    });
    return;
  }

  suppressScrollLockUpdate = true;
  container.scrollTop = Math.max(
    0,
    container.scrollHeight - container.clientHeight - (state?.bottomOffset || 0)
  );
  setAutoScrollLocked(false);
  requestAnimationFrame(() => {
    suppressScrollLockUpdate = false;
  });
}

window.chatBox = chatBox;
window.addMessage = addMessage;
window.clearChat = clearChat;
window.loadConversation = loadConversation;
window.createNewChat = createNewChat;
window.getCurrentConversationId = () => currentConversationId;

marked.setOptions({
  breaks: true,
  gfm: true
});

const markdownRenderer = new marked.Renderer();

markdownRenderer.link = function renderSafeLink(href, title, text) {
  const token = typeof href === "object" && href !== null ? href : null;
  const safeHref = escapeHtml(String(token?.href || href || ""));
  const linkTitle = token?.title || title || "";
  const linkText = token?.text || text || safeHref;
  const safeTitle = linkTitle ? ` title="${escapeHtml(linkTitle)}"` : "";
  return `<a href="${safeHref}"${safeTitle} target="_blank" rel="noopener noreferrer">${linkText}</a>`;
};

marked.use({ renderer: markdownRenderer });

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderLatexExpression(expression = "") {
  let html = escapeHtml(String(expression || "").trim());

  const renderGroupedCommand = (pattern, replacer) => {
    let previous = "";
    while (previous !== html) {
      previous = html;
      html = html.replace(pattern, replacer);
    }
  };

  renderGroupedCommand(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, numerator, denominator) => {
    return `<span class="kit-math-fraction"><span class="kit-math-numerator">${renderLatexExpression(numerator)}</span><span class="kit-math-denominator">${renderLatexExpression(denominator)}</span></span>`;
  });

  renderGroupedCommand(/\\sqrt\{([^{}]+)\}/g, (_, content) => {
    return `<span class="kit-math-radical"><span class="kit-math-radical-sign">√</span><span class="kit-math-radical-content">${renderLatexExpression(content)}</span></span>`;
  });

  html = html
    .replace(/\\pm/g, "±")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\cdot/g, "·")
    .replace(/\\leq/g, "≤")
    .replace(/\\geq/g, "≥")
    .replace(/\\neq/g, "≠");

  html = html.replace(/([A-Za-z0-9)\]])\^\{([^{}]+)\}/g, (_, base, exponent) => {
    return `${base}<sup>${renderLatexExpression(exponent)}</sup>`;
  });
  html = html.replace(/([A-Za-z0-9)\]])\^([A-Za-z0-9+-])/g, "$1<sup>$2</sup>");

  html = html.replace(/([A-Za-z0-9)\]])_\{([^{}]+)\}/g, (_, base, subscript) => {
    return `${base}<sub>${renderLatexExpression(subscript)}</sub>`;
  });
  html = html.replace(/([A-Za-z0-9)\]])_([A-Za-z0-9+-])/g, "$1<sub>$2</sub>");

  html = html.replace(/[{}]/g, "");
  return html;
}

function renderMathMarkup(text = "") {
  return String(text || "")
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expression) => {
      return `\n<div class="kit-math-block">${renderLatexExpression(expression)}</div>\n`;
    })
    .replace(/(^|[^\wÀ-ÿ])\$([^$\n]+?)\$(?=[^\wÀ-ÿ]|$)/g, (_, prefix, expression) => {
      return `${prefix}<span class="kit-math-inline">${renderLatexExpression(expression)}</span>`;
    });
}

function normalizeCompactMarkdownTables(text = "") {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => {
      const hasTableSeparator = /\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|/.test(line);
      if (!hasTableSeparator) {
        return line;
      }

      return line.replace(/\|\s+\|(?=\s*(?:\:?-{3,}\:?|[^|\s]))/g, "|\n|");
    })
    .join("\n");
}

function wrapMarkdownTables(html = "") {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");

  template.content.querySelectorAll("table").forEach((table) => {
    if (table.parentElement?.classList?.contains("table-wrapper")) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "table-wrapper";
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  return template.innerHTML;
}

function renderMessageText(text = "") {
  return wrapMarkdownTables(marked.parse(renderMathMarkup(normalizeCompactMarkdownTables(text))));
}

function getAttachmentKindLabel(kind = "file") {
  const normalized = String(kind || "file").toLowerCase();
  if (normalized === "image" || normalized === "screenshot") return "Imagem";
  if (normalized === "audio") return "Audio";
  if (normalized === "video") return "Video";
  return "Arquivo";
}

function getAttachmentKindBadge(kind = "file") {
  const normalized = String(kind || "file").toLowerCase();
  if (normalized === "image" || normalized === "screenshot") return "IMG";
  if (normalized === "audio") return "AUD";
  if (normalized === "video") return "VID";
  return "ARQ";
}

function buildAttachmentComment(attachment = {}) {
  try {
    return `<!--kit-attachment:${JSON.stringify({
      kind: attachment.kind || attachment.mediaType || "file",
      name: attachment.name || attachment.fileName || "arquivo"
    })}-->`;
  } catch {
    return "";
  }
}

function buildPersistedUserMessage(text = "", attachment = null) {
  const normalizedText = String(text || "").trim();
  if (!attachment?.name) {
    return normalizedText;
  }

  const marker = `[Midia enviada: ${attachment.name}]`;
  const comment = buildAttachmentComment(attachment);

  if (!normalizedText) {
    return `${marker}\n${comment}`;
  }

  return `${normalizedText}\n\n${marker}\n${comment}`;
}

function extractAttachmentFromText(text = "") {
  const raw = String(text || "");
  let attachment = null;
  let normalizedText = raw;

  normalizedText = normalizedText.replace(
    /<!--kit-attachment:({[\s\S]*?})-->/g,
    (_, payload) => {
      try {
        const parsed = JSON.parse(payload);
        attachment = {
          kind: parsed?.kind || "file",
          name: parsed?.name || "arquivo"
        };
      } catch {}
      return "";
    }
  );

  normalizedText = normalizedText.replace(/\[Midia enviada:\s*([^\]]+)\]/g, (_, name) => {
    if (!attachment) {
      attachment = {
        kind: "file",
        name: String(name || "arquivo").trim()
      };
    }
    return "";
  });

  normalizedText = normalizedText.replace(/<Midia enviada:\s*([^>]+)>/g, (_, name) => {
    if (!attachment) {
      attachment = {
        kind: "file",
        name: String(name || "arquivo").trim()
      };
    }
    return "";
  });

  return {
    attachment,
    text: normalizedText.replace(/\n{3,}/g, "\n\n").trim()
  };
}

function isUserAuthor(author = "") {
  return String(author || "").toLowerCase().startsWith("voc");
}

function autoResizeInput() {
  if (!input) {
    return;
  }

  input.style.height = "auto";
  const maxHeight = INPUT_LINE_HEIGHT * MAX_INPUT_LINES;
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
}

function shouldCollapseMessage(text = "") {
  const normalized = String(text || "");
  const lineCount = normalized.split(/\r?\n/).length;
  return (
    normalized.length >= LONG_MESSAGE_CHAR_THRESHOLD ||
    lineCount >= LONG_MESSAGE_LINE_THRESHOLD
  );
}

function applyMessageBody(node, text = "") {
  if (!node) {
    return;
  }

  const rendered = renderMessageText(text);
  if (!shouldCollapseMessage(text)) {
    node.innerHTML = rendered;
    return;
  }

  node.innerHTML = "";
  const body = document.createElement("div");
  body.className = "message-body is-collapsed";
  body.innerHTML = rendered;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "message-expand-btn";
  toggle.textContent = "Mostrar mais v";
  toggle.addEventListener("click", () => {
    const collapsed = body.classList.toggle("is-collapsed");
    toggle.textContent = collapsed ? "Mostrar mais v" : "Mostrar menos ^";
  });

  node.appendChild(body);
  node.appendChild(toggle);
}

function addMessage(author, text, options = {}) {
  const parsed = extractAttachmentFromText(text);
  const attachment = options.attachment || parsed.attachment;
  const bodyText = parsed.text;
  const id = options.dedupeKey || `${author}-${text}`;

  if (renderedMessages.has(id)) return;
  renderedMessages.add(id);

  const clone = messageTemplate.content.cloneNode(true);
  const msg = clone.querySelector(".message");
  const textNode = clone.querySelector(".text");

  clone.querySelector(".author").textContent = `${author}:`;

  if (attachment) {
    msg.classList.add("has-attachment");
    textNode.parentNode.insertBefore(
      createAttachmentNode(attachment, {
        awaitingInstruction: !bodyText && author === "Você"
      }),
      textNode
    );
  }

  if (bodyText) {
    applyMessageBody(textNode, bodyText);
  } else {
    textNode.remove();
  }

  msg.classList.add(author === "Você" ? "user-msg" : "ai-msg");

  chatBox.appendChild(clone);

  if (options.forceScroll || (!options.suppressScroll && autoScrollLocked)) {
    scrollBottom({
      behavior: options.scrollBehavior || "smooth",
      lock: true
    });
  }
}

function createAttachmentNode(attachment = {}, options = {}) {
  const wrapper = document.createElement("div");
  const badge = document.createElement("span");
  const info = document.createElement("div");
  const title = document.createElement("div");
  const caption = document.createElement("div");
  const kindLabel = getAttachmentKindLabel(attachment.kind);
  const baseCaption =
    options.caption ||
    (options.awaitingInstruction
      ? `${kindLabel} enviada e pronta para a proxima instrucao`
      : `${kindLabel} enviada com a mensagem`);

  wrapper.className = "message-attachment";
  badge.className = "message-attachment-badge";
  info.className = "message-attachment-info";
  title.className = "message-attachment-title";
  caption.className = "message-attachment-caption";

  badge.textContent = getAttachmentKindBadge(attachment.kind);
  title.textContent = attachment.name || "arquivo";
  caption.textContent = baseCaption;

  info.appendChild(title);
  info.appendChild(caption);
  wrapper.appendChild(badge);
  wrapper.appendChild(info);

  return wrapper;
}

function syncThinkingButton() {
  if (!thinkingBtn) {
    return;
  }

  thinkingBtn.classList.toggle("active", realtimeThinkingEnabled);
  thinkingBtn.setAttribute("aria-pressed", realtimeThinkingEnabled ? "true" : "false");
  thinkingBtn.dataset.state = realtimeThinkingEnabled ? "on" : "off";
  thinkingBtn.title = realtimeThinkingEnabled
    ? "Thinking ativo na rota curta"
    : "Thinking desativado na rota curta";
}

function syncInternetButton() {
  if (!internetBtn) {
    return;
  }

  internetBtn.classList.toggle("active", webSearchEnabled);
  internetBtn.setAttribute("aria-pressed", webSearchEnabled ? "true" : "false");
  internetBtn.dataset.state = webSearchEnabled ? "on" : "off";
  internetBtn.title = webSearchEnabled
    ? "Pesquisa web ligada"
    : "Pesquisa web desligada";
  internetBtn.setAttribute(
    "aria-label",
    webSearchEnabled ? "Pesquisa web ligada" : "Pesquisa web desligada"
  );
}

function setLlmModeSelectorState(state = {}) {
  const active = String(state.active || state.requested || "fast").toLowerCase();
  const switchingTo = state.switchingTo ? String(state.switchingTo).toLowerCase() : "";
  const disabled = Boolean(switchingTo);
  const visibleStatusText = switchingTo === "smart"
    ? "Trocando para Smart..."
    : switchingTo === "fast"
      ? "Trocando para Fast..."
      : active === "smart"
        ? "Smart ativo"
        : active === "fast"
          ? "Fast ativo"
          : active === "off"
            ? "LLM desligado"
            : "LLM indisponivel";
  const activeIcon = active === "smart" ? "\u{1F9E0}" : "\u26A1";

  [llmFastBtn, llmSmartBtn].forEach((button) => {
    if (!button) return;
    const mode = button.dataset.mode;
    button.disabled = disabled;
    button.classList.toggle("active", !switchingTo && active === mode);
    button.classList.toggle("switching", disabled);
    button.setAttribute("aria-checked", !switchingTo && active === mode ? "true" : "false");
  });

  if (llmModeSelector) {
    llmModeSelector.dataset.state = switchingTo || active || "unavailable";
    llmModeSelector.title = visibleStatusText;
    llmModeSelector.setAttribute("aria-label", visibleStatusText);
  }

  if (llmModeToggle) {
    llmModeToggle.disabled = disabled;
    llmModeToggle.title = visibleStatusText;
    llmModeToggle.setAttribute("aria-label", visibleStatusText);
  }

  if (llmModeIcon) {
    llmModeIcon.textContent = activeIcon;
  }

  if (llmModeStatus) {
    llmModeStatus.textContent = visibleStatusText;
  }
}

async function refreshLlmModeSelector() {
  try {
    const response = await fetch(`${API_BASE}/llm/mode`);
    const data = await response.json().catch(() => ({}));
    if (data?.success !== false) {
      setLlmModeSelectorState(data.data || {});
    } else {
      setLlmModeSelectorState({ active: "unavailable" });
    }
  } catch {
    setLlmModeSelectorState({ active: "unavailable" });
  }
}

async function selectLlmMode(mode) {
  const target = String(mode || "fast").toLowerCase() === "smart" ? "smart" : "fast";
  setLlmModeSelectorState({ switchingTo: target, requested: target });
  try {
    const response = await fetch(`${API_BASE}/llm/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: target,
        reason: "manual_selection"
      })
    });
    const data = await response.json().catch(() => ({}));
    if (data?.success === false) {
      setLlmModeSelectorState({ active: "unavailable" });
      return;
    }
    setLlmModeSelectorState(data.data || { active: target });
  } catch {
    setLlmModeSelectorState({ active: "unavailable" });
  }
}

async function loadChatRuntimeConfig() {
  try {
    const response = await fetch(`${API_BASE}/config/bundle`);
    const data = await response.json().catch(() => ({}));
    const bundle = data?.data;
    realtimeStreamingEnabled = bundle?.config?.system?.realtimeStreamingEnabled !== false;
  } catch (err) {
    console.warn("Nao consegui carregar config de runtime do chat:", err);
    realtimeStreamingEnabled = true;
  }
}

function createAssistantStream() {
  if (activeAssistantStream?.element?.isConnected) {
    return activeAssistantStream;
  }

  const shouldStickToBottom = true;
  const clone = messageTemplate.content.cloneNode(true);
  const msg = clone.querySelector(".message");
  const authorNode = clone.querySelector(".author");
  const textNode = clone.querySelector(".text");
  const thoughtNode = document.createElement("details");
  const thoughtSummaryNode = document.createElement("summary");
  const thoughtContentNode = document.createElement("div");

  authorNode.textContent = "Kit IA:";
  textNode.innerHTML = "";
  msg.classList.add("ai-msg");
  msg.dataset.streaming = "true";
  thoughtNode.className = "message-thought";
  thoughtNode.hidden = true;
  thoughtNode.open = true;
  thoughtSummaryNode.textContent = "pensando...";
  thoughtContentNode.className = "message-thought-content";
  thoughtNode.appendChild(thoughtSummaryNode);
  thoughtNode.appendChild(thoughtContentNode);
  textNode.parentNode.insertBefore(thoughtNode, textNode);

  chatBox.appendChild(clone);
  activeAssistantStream = {
    element: chatBox.lastElementChild,
    textNode,
    thoughtNode,
    thoughtSummaryNode,
    thoughtContentNode,
    text: "",
    thoughtText: "",
    shouldStickToBottom
  };

  if (shouldStickToBottom) {
    scrollBottom({ behavior: "smooth", lock: true });
  }

  return activeAssistantStream;
}

function appendAssistantStream(token) {
  if (!token) return;
  const stream = createAssistantStream();
  stream.text += token;
  applyMessageBody(stream.textNode, stream.text);

  if (stream.shouldStickToBottom) {
    scrollBottom({ behavior: "smooth", lock: true });
  }
}

function appendAssistantThoughtStream(token) {
  if (!token) return;
  const stream = createAssistantStream();
  stream.thoughtText += token;
  stream.thoughtNode.hidden = false;
  stream.thoughtNode.open = true;
  stream.thoughtSummaryNode.textContent = "pensando...";
  stream.thoughtContentNode.textContent = stream.thoughtText;

  if (stream.shouldStickToBottom) {
    scrollBottom({ behavior: "smooth", lock: true });
  }
}

function finalizeAssistantStream(finalText = "") {
  if (!activeAssistantStream?.element?.isConnected) {
    if (finalText) {
      addMessage("Kit IA", finalText);
    }
    return;
  }

  const finalMessage = String(finalText || activeAssistantStream.text || "").trim();
  if (!finalMessage) {
    activeAssistantStream.element.remove();
    activeAssistantStream = null;
    return;
  }

  activeAssistantStream.text = finalMessage;
  applyMessageBody(activeAssistantStream.textNode, finalMessage);
  if (activeAssistantStream.thoughtText.trim()) {
    activeAssistantStream.thoughtNode.hidden = false;
    activeAssistantStream.thoughtNode.open = false;
    activeAssistantStream.thoughtSummaryNode.textContent = "pensou";
    activeAssistantStream.thoughtContentNode.textContent = activeAssistantStream.thoughtText.trim();
  } else {
    activeAssistantStream.thoughtNode.hidden = true;
  }
  activeAssistantStream.element.dataset.streaming = "false";
  renderedMessages.add(`Kit IA-${finalMessage}`);

  const shouldStickToBottom = activeAssistantStream.shouldStickToBottom;
  activeAssistantStream = null;

  if (shouldStickToBottom) {
    scrollBottom({ behavior: "smooth", lock: true });
  }
}

function clearChat() {
  chatBox.innerHTML = "";
  renderedMessages.clear();
  activeAssistantStream = null;
  agentTraceBlocks.forEach((trace) => {
    if (trace.intervalId) {
      clearInterval(trace.intervalId);
    }
  });
  agentTraceBlocks.clear();
}

function scrollBottom(options = {}) {
  const container = getChatScrollContainer();
  if (!container) {
    return;
  }

  suppressScrollLockUpdate = true;
  container.scrollTo({
    top: container.scrollHeight,
    behavior: options.behavior || "auto"
  });
  if (options.lock !== false) {
    setAutoScrollLocked(true);
  }
  requestAnimationFrame(() => {
    suppressScrollLockUpdate = false;
  });
}

function formatAgentTraceElapsed(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function updateAgentTraceHeader(trace) {
  if (!trace?.button) return;
  const elapsed = trace.endedAt
    ? trace.endedAt - trace.startedAt
    : Date.now() - trace.startedAt;
  const title = trace.title || `Worked for ${formatAgentTraceElapsed(elapsed)}`;
  trace.button.textContent = `${title} ${trace.collapsed ? ">" : "v"}`;
}

function renderAgentTrace(stored = {}) {
  if (!stored.runId || !chatBox) {
    return;
  }

  const existing = agentTraceBlocks.get(stored.runId);
  if (existing?.element?.isConnected) {
    return;
  }

  const wrapper = document.createElement("div");
  const button = document.createElement("button");
  const body = document.createElement("pre");

  wrapper.className = "agent-trace";
  wrapper.dataset.runId = stored.runId;
  button.className = "agent-trace-header";
  button.type = "button";
  body.className = "agent-trace-body";

  wrapper.appendChild(button);
  wrapper.appendChild(body);
  chatBox.appendChild(wrapper);

  const trace = {
    element: wrapper,
    button,
    body,
    startedAt: Number(stored.startedAt || Date.now()),
    endedAt: stored.endedAt || null,
    title: stored.title || "Worked for 0s",
    collapsed: stored.collapsed === true,
    intervalId: null
  };
  body.textContent = (stored.lines || []).join("\n");

  button.addEventListener("click", () => {
    trace.collapsed = !trace.collapsed;
    wrapper.classList.toggle("collapsed", trace.collapsed);
    upsertStoredAgentTrace({
      runId: stored.runId,
      sessionId: stored.sessionId || currentConversationId,
      collapsed: trace.collapsed
    });
    updateAgentTraceHeader(trace);
  });

  wrapper.classList.toggle("collapsed", trace.collapsed);
  if (!trace.endedAt) {
    trace.intervalId = setInterval(() => {
      trace.title = `Worked for ${formatAgentTraceElapsed(Date.now() - trace.startedAt)}`;
      updateAgentTraceHeader(trace);
    }, 1000);
  }

  agentTraceBlocks.set(stored.runId, trace);
  updateAgentTraceHeader(trace);
  scrollBottom({ behavior: "smooth", lock: true });
}

function restoreAgentTraces(conversationId = currentConversationId) {
  for (const stored of loadStoredAgentTraces(conversationId)) {
    renderAgentTrace(stored);
  }
}

function startAgentTrace(payload = {}) {
  if (!shouldDisplaySessionPayload(payload) || !payload.runId || !chatBox) {
    return;
  }

  const stored = upsertStoredAgentTrace({
    runId: payload.runId,
    sessionId: payload.sessionId,
    startedAt: Number(payload.startedAt || Date.now()),
    title: payload.title || "Worked for 0s",
    collapsed: payload.collapsed === true,
    status: "running"
  });
  renderAgentTrace(stored);
}

function appendAgentTraceLine(payload = {}) {
  if (!shouldDisplaySessionPayload(payload) || !payload.runId) {
    return;
  }

  const stored = upsertStoredAgentTrace({
    runId: payload.runId,
    sessionId: payload.sessionId,
    lines: [
      ...(agentTraceStore.get(payload.sessionId || currentConversationId)?.find((trace) => trace.runId === payload.runId)?.lines || []),
      payload.line
    ]
  });
  const trace = agentTraceBlocks.get(payload.runId);
  if (!trace?.element?.isConnected || !payload.line) {
    if (stored) renderAgentTrace(stored);
    return;
  }

  trace.body.textContent += `${trace.body.textContent ? "\n" : ""}${payload.line}`;
  if (autoScrollLocked) {
    scrollBottom({ behavior: "smooth", lock: true });
  }
}

function finishAgentTrace(payload = {}) {
  if (!shouldDisplaySessionPayload(payload) || !payload.runId) {
    return;
  }

  const trace = agentTraceBlocks.get(payload.runId);
  if (!trace?.element?.isConnected) {
    return;
  }

  if (trace.intervalId) {
    clearInterval(trace.intervalId);
    trace.intervalId = null;
  }

  trace.endedAt = Date.now();
  trace.title = payload.title || `Worked for ${formatAgentTraceElapsed(payload.elapsedMs || trace.endedAt - trace.startedAt)}`;
  trace.collapsed = payload.collapsed === true;
  trace.element.classList.toggle("collapsed", trace.collapsed);
  upsertStoredAgentTrace({
    runId: payload.runId,
    sessionId: payload.sessionId,
    endedAt: trace.endedAt,
    elapsedMs: payload.elapsedMs || trace.endedAt - trace.startedAt,
    title: trace.title,
    collapsed: trace.collapsed,
    status: payload.status || "done"
  });
  updateAgentTraceHeader(trace);
  if (autoScrollLocked) {
    scrollBottom({ behavior: "smooth", lock: true });
  }
}

function animateAvatar() {
  kitIcon.src = "assets/avatar/listening.png";
  setTimeout(() => {
    kitIcon.src = "assets/avatar/idle.png";
  }, 1500);
}

function showProcessing(message) {
  if (processingIndicator) {
    const shouldStickToBottom = autoScrollLocked || isNearBottom();
    processingIndicator.querySelector("span").textContent = message || "Processando...";
    processingIndicator.classList.remove("hidden");

    if (shouldStickToBottom) {
      scrollBottom({ behavior: "smooth", lock: true });
    }
  }
}

function hideProcessing() {
  if (processingIndicator) {
    processingIndicator.classList.add("hidden");
  }
}

function clearSelectedAttachment() {
  selectedAttachment = null;
  fileInput.value = "";
}

function setSelectedAttachment(attachment) {
  selectedAttachment = attachment;
  if (attachment?.name) {
    addMessage("Sistema", `Midia anexada: **${attachment.name}**`);
  }
}

function validateAttachmentFile(file, kind) {
  if (!file) return false;

  if (kind === "video" && file.size > MAX_VIDEO_MB * 1024 * 1024) {
    addMessage("Sistema", `Video acima do limite de ${MAX_VIDEO_MB}MB.`, { forceScroll: true });
    return false;
  }

  if (kind === "audio" && file.size > MAX_AUDIO_MB * 1024 * 1024) {
    addMessage("Sistema", `Audio acima do limite de ${MAX_AUDIO_MB}MB.`, { forceScroll: true });
    return false;
  }

  return true;
}

function detectAttachmentKind(file) {
  const type = String(file?.type || "").toLowerCase();
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "image";
}

function openAttachmentPicker(kind) {
  const accepts = {
    image: "image/*",
    audio: "audio/*",
    video: "video/*"
  };

  fileInput.accept = accepts[kind] || "*/*";
  fileInput.dataset.kind = kind;
  fileInput.click();
}

function stopAttachmentRecording({ keepBlob = true } = {}) {
  if (attachmentTimeout) {
    clearTimeout(attachmentTimeout);
    attachmentTimeout = null;
  }

  if (attachmentRecorder && attachmentRecorder.state !== "inactive") {
    attachmentRecorder.onstop = () => {
      const recorderMimeType = attachmentRecorder?.mimeType || "audio/webm";
      if (keepBlob) {
        const blob = new Blob(attachmentChunks, { type: recorderMimeType });
        if (blob.size > MAX_AUDIO_MB * 1024 * 1024) {
          addMessage("Sistema", `Audio gravado acima do limite de ${MAX_AUDIO_MB}MB.`, { forceScroll: true });
        } else {
          setSelectedAttachment({
            kind: "audio",
            blob,
            name: `gravacao-${Date.now()}.webm`,
            mimeType: recorderMimeType
          });
        }
      }

      if (attachmentStream) {
        attachmentStream.getTracks().forEach((track) => track.stop());
      }
      attachmentRecorder = null;
      attachmentStream = null;
      attachmentChunks = [];
    };
    attachmentRecorder.stop();
    return;
  }

  if (attachmentStream) {
    attachmentStream.getTracks().forEach((track) => track.stop());
  }
  attachmentRecorder = null;
  attachmentStream = null;
  attachmentChunks = [];
}

async function startAttachmentRecording() {
  try {
    attachmentStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    attachmentRecorder = new MediaRecorder(attachmentStream);
    attachmentChunks = [];
    attachmentRecorder.ondataavailable = (event) => {
      if (event.data?.size) {
        attachmentChunks.push(event.data);
      }
    };
    attachmentRecorder.start();
    attachmentTimeout = setTimeout(() => {
      stopAttachmentRecording({ keepBlob: true });
    }, MAX_RECORD_AUDIO_MS);

    addMessage("Sistema", "Gravando audio para anexo... abra o + novamente para parar.", {
      forceScroll: true
    });
  } catch (err) {
    addMessage("Sistema", "Nao consegui iniciar a gravacao de audio.", {
      forceScroll: true
    });
  }
}

function removeMediaMenu() {
  document.getElementById("mediaActionMenu")?.remove();
}

function showMediaMenu() {
  removeMediaMenu();
  const menu = document.createElement("div");
  menu.id = "mediaActionMenu";
  Object.assign(menu.style, {
    position: "fixed",
    left: "16px",
    bottom: "76px",
    zIndex: "9999",
    display: "grid",
    gap: "8px",
    padding: "10px",
    borderRadius: "14px",
    background: "rgba(22,22,22,0.96)",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)"
  });

  const actions = [
    { label: "Imagem", run: () => openAttachmentPicker("image") },
    { label: "Video", run: () => openAttachmentPicker("video") },
    { label: "Audio", run: () => openAttachmentPicker("audio") },
    {
      label: attachmentRecorder ? "Parar gravacao" : "Gravar audio",
      run: () => {
        if (attachmentRecorder) {
          stopAttachmentRecording({ keepBlob: true });
        } else {
          void startAttachmentRecording();
        }
      }
    }
  ];

  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    Object.assign(button.style, {
      padding: "10px 12px",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.12)",
      background: "#202020",
      color: "#f5f5f5",
      cursor: "pointer"
    });
    button.addEventListener("click", () => {
      removeMediaMenu();
      action.run();
    });
    menu.appendChild(button);
  }

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener("click", removeMediaMenu, { once: true });
  }, 0);
}

fileBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  showMediaMenu();
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    const kind = fileInput.dataset.kind || detectAttachmentKind(file);
    if (!validateAttachmentFile(file, kind)) {
      fileInput.value = "";
      return;
    }

    setSelectedAttachment({
      kind,
      file,
      name: file.name,
      mimeType: file.type || ""
    });
  }
});

async function openStudioLaunchFromResponse(data = {}) {
  const initialState = data?.studio?.initialState || data?.initialState || null;
  if (!initialState) {
    return false;
  }

  if (window.kitAPI?.openStudioWindow) {
    await window.kitAPI.openStudioWindow(initialState);
  } else if (window.kitAPI?.openStudio) {
    window.kitAPI.openStudio();
  } else {
    window.open("./studio/studio.html", "_blank");
  }

  hideProcessing();
  return true;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text && !selectedAttachment) return;
  const outboundText = buildPersistedUserMessage(text, selectedAttachment);

  addMessage("Você", outboundText, { forceScroll: true });

  input.value = "";
  autoResizeInput();
  const attachmentToSend = selectedAttachment;
  clearSelectedAttachment();

  showProcessing("Processando...");

  try {
    await window.kitAPI?.markActivity?.("chat-send");
    let response;

    if (attachmentToSend) {
      const formData = new FormData();
      formData.append("text", text);
      formData.append("sessionId", currentConversationId || "default");
      formData.append("mediaType", attachmentToSend.kind);
      formData.append("realtimeThinkingEnabled", String(realtimeThinkingEnabled));
      formData.append("webSearchEnabled", String(webSearchEnabled));
      if (attachmentToSend.file) {
        formData.append("file", attachmentToSend.file, attachmentToSend.name);
      } else if (attachmentToSend.blob) {
        formData.append("file", attachmentToSend.blob, attachmentToSend.name);
      }

      response = await fetch(API_URL, {
        method: "POST",
        body: formData
      });
    } else {
      response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          sessionId: currentConversationId || "default",
          realtimeThinkingEnabled,
          webSearchEnabled
        })
      });
    }

    const data = await response.json().catch(() => ({}));

    if (data?.sessionId) {
      window.kitAPI?.setActiveConversation?.(data.sessionId);
    }

    if (data?.route === "studio-launch") {
      await openStudioLaunchFromResponse(data);
    }

    if (window.refreshSidebar) {
      await window.refreshSidebar({
        selectId: currentConversationId
      });
    }
  } catch (err) {
    console.error(err);
    hideProcessing();
    addMessage("Sistema", "Erro ao conectar com backend.", {
      forceScroll: true
    });

    if (attachmentToSend) {
      selectedAttachment = attachmentToSend;
    }
  }
}

function handleChatScroll() {
  if (suppressScrollLockUpdate) {
    return;
  }

  if (isNearBottom()) {
    setAutoScrollLocked(true);
    if (activeAssistantStream) {
      activeAssistantStream.shouldStickToBottom = true;
    }
    return;
  }

  setAutoScrollLocked(false);
  if (activeAssistantStream) {
    activeAssistantStream.shouldStickToBottom = false;
  }
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("input", () => {
  autoResizeInput();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

if (configBtn) {
  configBtn.addEventListener("click", () => {
    if (window.kitAPI?.openConfig) {
      window.kitAPI.openConfig();
      return;
    }

    window.open("./config/config.html", "_blank");
  });
}

function closeAppMenu() {
  appMenu?.parentElement?.classList.remove("open");
  appMenuBtn?.setAttribute("aria-expanded", "false");
}

if (appMenuBtn) {
  appMenuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const menuRoot = appMenuBtn.closest(".app-menu");
    const isOpen = menuRoot?.classList.toggle("open");
    appMenuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

if (appMenu) {
  appMenu.addEventListener("click", () => {
    closeAppMenu();
  });
}

document.addEventListener("click", (event) => {
  if (!event.target.closest?.(".app-menu")) {
    closeAppMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAppMenu();
  }
});

if (canvasBtn) {
  canvasBtn.addEventListener("click", () => {
    if (window.kitAPI?.openCanvas) {
      window.kitAPI.openCanvas();
      return;
    }

    window.open("./canvas/canvas.html", "_blank");
  });
}

if (studioBtn) {
  studioBtn.addEventListener("click", () => {
    if (window.kitAPI?.openStudio) {
      window.kitAPI.openStudio();
      return;
    }

    window.open("./studio/studio.html", "_blank");
  });
}

if (productionPlannerBtn) {
  productionPlannerBtn.addEventListener("click", () => {
    if (window.kitAPI?.openProductionPlanner) {
      window.kitAPI.openProductionPlanner();
      return;
    }

    window.open("./production/production.html", "_blank");
  });
}

if (thinkingBtn) {
  thinkingBtn.addEventListener("click", () => {
    realtimeThinkingEnabled = !realtimeThinkingEnabled;
    window.localStorage.setItem("kit.realtimeThinkingEnabled", String(realtimeThinkingEnabled));
    syncThinkingButton();
  });
}

if (internetBtn) {
  internetBtn.addEventListener("click", () => {
    webSearchEnabled = !webSearchEnabled;
    window.localStorage.setItem("kit.webSearchEnabled", String(webSearchEnabled));
    syncInternetButton();
  });
}

function closeLlmModeMenu() {
  llmModeSelector?.classList.remove("open");
  llmModeToggle?.setAttribute("aria-expanded", "false");
}

llmModeToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = llmModeSelector?.classList.toggle("open");
  llmModeToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
});

llmModeMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
});

llmFastBtn?.addEventListener("click", () => {
  closeLlmModeMenu();
  void selectLlmMode("fast");
});

llmSmartBtn?.addEventListener("click", () => {
  closeLlmModeMenu();
  void selectLlmMode("smart");
});

document.addEventListener("click", (event) => {
  if (!llmModeSelector?.contains(event.target)) {
    closeLlmModeMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLlmModeMenu();
  }
});

if (scrollToBottomBtn) {
  scrollToBottomBtn.addEventListener("click", () => {
    if (activeAssistantStream) {
      activeAssistantStream.shouldStickToBottom = true;
    }
    scrollBottom({ behavior: "smooth", lock: true });
  });
}

async function loadConversation(id, options = {}) {
  const targetConversationId = id || currentConversationId;
  if (!targetConversationId) {
    return;
  }

  const loadToken = ++conversationLoadToken;
  const shouldPreserveScroll = options.preserveScroll === true;
  const scrollState = shouldPreserveScroll ? captureScrollState() : null;
  currentConversationId = targetConversationId;

  if (options.syncActiveConversation !== false) {
    window.kitAPI?.setActiveConversation?.(targetConversationId);
  }

  try {
    const res = await fetch(`${API_BASE}/conversations/${targetConversationId}`);
    const data = await res.json();

    if (
      loadToken !== conversationLoadToken ||
      currentConversationId !== targetConversationId
    ) {
      return;
    }

    clearChat();
    hideProcessing();

    if (!data?.messages) {
      restoreScrollState(scrollState, {
        forceBottom: !shouldPreserveScroll || autoScrollLocked,
        behavior: shouldPreserveScroll ? "auto" : "smooth"
      });
      return;
    }

    data.messages.forEach((msg) => {
      const author = msg.role === "user" ? "Você" : "Kit IA";
      const text = msg.content ?? msg.text ?? "";
      addMessage(author, text, {
        suppressScroll: true
      });
    });

    restoreAgentTraces(targetConversationId);

    restoreScrollState(scrollState, {
      forceBottom: !shouldPreserveScroll || autoScrollLocked,
      behavior: shouldPreserveScroll ? "auto" : "smooth"
    });
  } catch (err) {
    console.error("Erro ao carregar conversa:", err);
  }
}

async function refreshCurrentConversation() {
  if (!currentConversationId) {
    await loadInitialHistory();
    return;
  }

  await loadConversation(currentConversationId, {
    preserveScroll: true,
    syncActiveConversation: false
  });

  if (window.refreshSidebar) {
    await window.refreshSidebar({
      selectId: currentConversationId
    });
  }
}

async function createNewChat() {
  try {
    const response = await fetch(`${API_BASE}/conversations/new`, {
      method: "POST"
    });
    const data = await response.json().catch(() => ({}));
    const newConversationId = data?.conversation?.id || null;

    if (newConversationId) {
      currentConversationId = newConversationId;
      conversationLoadToken += 1;
      window.kitAPI?.setActiveConversation?.(newConversationId);
      clearChat();
      hideProcessing();
      scrollBottom({ behavior: "smooth", lock: true });
    }

    if (window.refreshSidebar) {
      await window.refreshSidebar({
        selectId: newConversationId
      });
    }
  } catch (err) {
    console.error("Erro ao criar chat:", err);
  }
}

async function loadInitialHistory() {
  try {
    const res = await fetch(`${API_BASE}/conversations`);
    const list = await res.json();

    if (!list.length) return;

    if (currentConversationId && list.some((chat) => chat.id === currentConversationId)) {
      await loadConversation(currentConversationId, {
        preserveScroll: true,
        syncActiveConversation: false
      });
      return;
    }

    await loadConversation(list[0].id);
  } catch (err) {
    console.warn("Erro ao carregar historico inicial:", err);
  }
}

function scheduleConversationRefresh() {
  clearTimeout(refreshConversationTimeout);
  refreshConversationTimeout = setTimeout(() => {
    void refreshCurrentConversation();
  }, 150);
}

function connectEvents() {
  const evtSource = new EventSource(EVENTS_URL);

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "assistant_message") {
        if (data.payload?.role === "assistant" && shouldDisplaySessionPayload(data.payload)) {
          finalizeAssistantStream(data.payload.text || "");
          animateAvatar();
          hideProcessing();
        }
      }

      if (data.type === "user_message") {
        if (data.payload?.role === "user" && shouldDisplaySessionPayload(data.payload)) {
          addMessage("Você", data.payload.text || "", {
            forceScroll: true
          });
          hideProcessing();
        }
      }

      if (data.type === "llm:started") {
        if (shouldHandleStreamingPayload(data.payload)) {
          createAssistantStream();
        }
      }

      if (data.type === "llm:thought-token") {
        if (shouldHandleStreamingPayload(data.payload)) {
          appendAssistantThoughtStream(data.payload.token || "");
        }
      }

      if (data.type === "llm:token") {
        if (shouldHandleStreamingPayload(data.payload)) {
          appendAssistantStream(data.payload.token || "");
        }
      }

      if (data.type === "llm:mode") {
        setLlmModeSelectorState(data.payload || {});
      }

      if (data.type === "agent_trace_started") {
        startAgentTrace(data.payload || {});
      }

      if (data.type === "agent_trace_line") {
        appendAgentTraceLine(data.payload || {});
      }

      if (data.type === "agent_trace_finished") {
        finishAgentTrace(data.payload || {});
      }

      if (data.type === "system_notification") {
        if (data.payload?.message) {
          showProcessing(data.payload.message);
        } else {
          hideProcessing();
        }
      }
    } catch (err) {
      console.error("Erro SSE:", err);
    }
  };

  evtSource.onerror = () => {
    console.warn("Reconectando SSE...");
    evtSource.close();
    setTimeout(connectEvents, 3000);
  };
}

window.addEventListener("focus", () => {
  scheduleConversationRefresh();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    scheduleConversationRefresh();
  }
});

window.kitAPI?.onChatMessage?.((payload) => {
  if (!payload?.text) {
    return;
  }

  if (payload.sessionId && payload.sessionId !== currentConversationId) {
    return;
  }

  if (payload.author === "Kit IA") {
    finalizeAssistantStream(payload.text);
    animateAvatar();
    hideProcessing();
  }
});

window.kitAPI?.onConversationActivated?.((payload) => {
  if (!payload?.sessionId) {
    return;
  }

  if (payload.sessionId !== currentConversationId) {
    void loadConversation(payload.sessionId, {
      syncActiveConversation: false
    });
  }

  if (window.refreshSidebar) {
    void window.refreshSidebar({
      selectId: payload.sessionId
    });
  }
});

async function init() {
  await loadChatRuntimeConfig();
  syncThinkingButton();
  syncInternetButton();
  await refreshLlmModeSelector();
  autoResizeInput();
  setAutoScrollLocked(true);
  getChatScrollContainer()?.addEventListener("scroll", handleChatScroll, { passive: true });
  await loadInitialHistory();
  connectEvents();
}

init();
