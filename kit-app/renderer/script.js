const renderedMessages = new Set();
const chatBox = document.getElementById("chatBox");
const input = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const kitIcon = document.getElementById("kitIcon");
const messageTemplate = document.getElementById("messageTemplate");
const processingIndicator = document.getElementById("processingIndicator");

const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");
const configBtn = document.getElementById("configBtn");

const API_BASE = "http://localhost:3001";
const API_URL = `${API_BASE}/chat`;
const EVENTS_URL = `${API_BASE}/events`;

let currentConversationId = null;
let selectedFile = null;
let activeAssistantStream = null;

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

function addMessage(author, text) {
  const id = `${author}-${text}`;

  if (renderedMessages.has(id)) return;
  renderedMessages.add(id);

  const clone = messageTemplate.content.cloneNode(true);
  const msg = clone.querySelector(".message");

  clone.querySelector(".author").textContent = `${author}:`;
  clone.querySelector(".text").innerHTML = marked.parse(text);

  msg.classList.add(author === "Você" ? "user-msg" : "ai-msg");

  chatBox.appendChild(clone);
  scrollBottom();
}

function createAssistantStream() {
  if (activeAssistantStream?.element?.isConnected) {
    return activeAssistantStream;
  }

  const clone = messageTemplate.content.cloneNode(true);
  const msg = clone.querySelector(".message");
  const authorNode = clone.querySelector(".author");
  const textNode = clone.querySelector(".text");

  authorNode.textContent = "Kit IA:";
  textNode.innerHTML = "";
  msg.classList.add("ai-msg");
  msg.dataset.streaming = "true";

  chatBox.appendChild(clone);
  activeAssistantStream = {
    element: chatBox.lastElementChild,
    textNode,
    text: ""
  };

  scrollBottom();
  return activeAssistantStream;
}

function appendAssistantStream(token) {
  if (!token) return;
  const stream = createAssistantStream();
  stream.text += token;
  stream.textNode.innerHTML = marked.parse(stream.text);
  scrollBottom();
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
  activeAssistantStream.textNode.innerHTML = marked.parse(finalMessage);
  activeAssistantStream.element.dataset.streaming = "false";
  renderedMessages.add(`Kit IA-${finalMessage}`);
  activeAssistantStream = null;
  scrollBottom();
}

function clearChat() {
  chatBox.innerHTML = "";
  renderedMessages.clear();
}

function scrollBottom() {
  chatBox.parentElement.scrollTop = chatBox.parentElement.scrollHeight;
}

function animateAvatar() {
  kitIcon.src = "assets/avatar/listening.png";
  setTimeout(() => {
    kitIcon.src = "assets/avatar/idle.png";
  }, 1500);
}

function showProcessing(message) {
  if (processingIndicator) {
    processingIndicator.querySelector("span").textContent = message || "Processando...";
    processingIndicator.classList.remove("hidden");
    scrollBottom();
  }
}

function hideProcessing() {
  if (processingIndicator) {
    processingIndicator.classList.add("hidden");
  }
}

fileBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    selectedFile = file;
    addMessage("Sistema", `Arquivo: **${file.name}**`);
  }
});

async function sendMessage() {
  const text = input.value.trim();
  if (!text && !selectedFile) return;

  if (text) {
    addMessage("Você", text);
  } else if (selectedFile) {
    addMessage("Você", `[Imagem enviada: ${selectedFile.name}]`);
  }

  input.value = "";
  const fileToSend = selectedFile;
  selectedFile = null;
  fileInput.value = "";

  showProcessing("💭 processando...");

  try {
    if (fileToSend) {
      const formData = new FormData();
      formData.append("text", text);
      formData.append("sessionId", currentConversationId || "default");
      formData.append("file", fileToSend, fileToSend.name);

      await fetch(API_URL, {
        method: "POST",
        body: formData
      });
    } else {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          sessionId: currentConversationId || "default"
        })
      });
    }

    if (window.refreshSidebar) {
      await window.refreshSidebar({
        selectId: currentConversationId
      });
    }
  } catch (err) {
    console.error(err);
    hideProcessing();
    addMessage("Sistema", "Erro ao conectar com backend.");

    if (fileToSend) {
      selectedFile = fileToSend;
    }
  }
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
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

async function loadConversation(id) {
  try {
    const res = await fetch(`${API_BASE}/conversations/${id}`);
    const data = await res.json();

    currentConversationId = id;
    clearChat();

    if (!data?.messages) return;

    data.messages.forEach((msg) => {
      const author = msg.role === "user" ? "Você" : "Kit IA";
      const text = msg.content ?? msg.text ?? "";
      addMessage(author, text);
    });
  } catch (err) {
    console.error("Erro ao carregar conversa:", err);
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
      clearChat();
      hideProcessing();
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

    const first = list[0];
    await loadConversation(first.id);
  } catch (err) {
    console.warn("Erro ao carregar histórico inicial:", err);
  }
}

function connectEvents() {
  const evtSource = new EventSource(EVENTS_URL);

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "assistant_message") {
        if (
          data.payload?.role === "assistant" &&
          (!data.payload?.sessionId || data.payload.sessionId === currentConversationId)
        ) {
          finalizeAssistantStream(data.payload.text || "");
          animateAvatar();
          hideProcessing();
        }
      }

      if (data.type === "llm:started") {
        if (!data.payload?.sessionId || data.payload.sessionId === currentConversationId) {
          createAssistantStream();
        }
      }

      if (data.type === "llm:token") {
        if (!data.payload?.sessionId || data.payload.sessionId === currentConversationId) {
          appendAssistantStream(data.payload.token || "");
        }
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

async function init() {
  await loadInitialHistory();
  connectEvents();
}

init();
