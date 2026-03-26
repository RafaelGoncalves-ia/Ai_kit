// Script principal do frontend Kit IA atualizado (com suporte a fila / task async)

const chatBox = document.getElementById("chatBox")
const input = document.getElementById("input")
const sendBtn = document.getElementById("sendBtn")
const kitIcon = document.getElementById("kitIcon")
const messageTemplate = document.getElementById("messageTemplate")

const fileBtn = document.getElementById("fileBtn")
const fileInput = document.getElementById("fileInput")

const API_URL = "http://localhost:3001/chat"
const EVENTS_URL = "http://localhost:3001/events" // 🔥 SSE endpoint

// ======================
// MARKDOWN CONFIG
// ======================
marked.setOptions({
  breaks: true,
  gfm: true
})

// ======================
// RENDER MESSAGE
// ======================
function addMessage(author, text) {
  const id = "msg-" + Date.now();

  const clone = messageTemplate.content.cloneNode(true);
  const msg = clone.querySelector(".message");
  msg.id = id;

  const textContainer = clone.querySelector(".text");

  clone.querySelector(".author").textContent = author + ":";
  textContainer.innerHTML = marked.parse(text);

  if(author === "Você") {
    msg.classList.add("user-msg");
  } else {
    msg.classList.add("ai-msg");
  }

  chatBox.appendChild(clone);
  chatBox.parentElement.scrollTop = chatBox.parentElement.scrollHeight;

  return id;
}

// ======================
// AVATAR FEEDBACK
// ======================
function animateAvatar() {
  kitIcon.src = "assets/avatar/listening.png"
  setTimeout(() => {
    kitIcon.src = "assets/avatar/idle.png"
  }, 1500)
}

// ======================
// FILE HANDLING
// ======================
fileBtn.addEventListener("click", () => fileInput.click())

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0]
  if (file) {
    addMessage("Sistema", `Arquivo selecionado: **${file.name}**`)
    fileInput.value = ""
  }
})

// ======================
// SEND MESSAGE
// ======================
async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  addMessage("Você", text);
  input.value = "";

  // 🔥 mensagem temporária
  const loadingId = addMessage("Kit IA", "_processando..._");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    const data = await res.json();

    // remove loading
    removeMessage(loadingId);

    if (data?.reply) {
      addMessage("Kit IA", data.reply);
    }

  } catch (err) {
    console.error("Erro:", err);
    removeMessage(loadingId);
    addMessage("Sistema", "Erro ao conectar com backend.");
  }
}
function removeMessage(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}
// ======================
// SSE - ESCUTA TASK FINAL
// ======================
function connectEvents() {
  const evtSource = new EventSource(EVENTS_URL)

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)

      // 🔥 task finalizada
      if (data.type === "task:completed") {
        addMessage("Kit IA", data.payload.result)

        if (data.payload.speak) {
          console.log("TTS FINAL:", data.payload.result)
        }

        animateAvatar()
      }

    } catch (err) {
      console.error("Erro SSE:", err)
    }
  }

  evtSource.onerror = () => {
    console.warn("Reconectando SSE...")
    evtSource.close()
    setTimeout(connectEvents, 3000)
  }
}

// ======================
// EVENTS
// ======================
sendBtn.addEventListener("click", sendMessage)

input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage()
})

const configBtn = document.getElementById("configBtn")
configBtn.addEventListener("click", () => {
  window.open("config/config.html", "_blank", "width=600,height=700")
})

// ======================
// INIT
// ======================
connectEvents()