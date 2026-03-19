// Script principal do frontend Kit IA
// - Envia mensagens para o backend
// - Renderiza mensagens do usuário e da IA
// - Integra com TTS local (via skill)
// - Troca avatar de acordo com estado da IA (placeholder)

const chatBox = document.getElementById("chatBox")
const input = document.getElementById("input")
const sendBtn = document.getElementById("sendBtn")
const micBtn = document.getElementById("micBtn")
const kitIcon = document.getElementById("kitIcon")
const messageTemplate = document.getElementById("messageTemplate")

const API_URL = "http://localhost:3000/chat"

// ======================
// FUNÇÃO PARA RENDERIZAR MENSAGEM
// ======================
function addMessage(author, text) {
  const clone = messageTemplate.content.cloneNode(true)
  const msg = clone.querySelector(".message")
  clone.querySelector(".author").textContent = author
  clone.querySelector(".text").textContent = text

  // define classe de estilo
  if(author === "Você") {
    msg.classList.add("user-msg")
  } else {
    msg.classList.add("ai-msg")
  }

  chatBox.appendChild(clone)
  chatBox.scrollTop = chatBox.scrollHeight
}

// ======================
// FUNÇÃO PARA ENVIAR MENSAGEM
// ======================
async function sendMessage() {
  const text = input.value.trim()
  if (!text) return

  addMessage("Você", text)
  input.value = ""

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    })

    const data = await res.json()

    if (data?.text) {
      addMessage("Kit IA", data.text)

      // ======================
      // TTS local (Skill)
      // ======================
      if (data.speak) {
        // placeholder: futuramente chamaremos TTS Skill
        console.log("TTS ativo:", data.text)
      }

      // ======================
      // Avatar placeholder
      // ======================
      // pode mudar src dependendo da Skill ou emoção
      kitIcon.src = "assets/avatar/listening.png"
      setTimeout(() => {
        kitIcon.src = "assets/avatar/idle.png"
      }, 1500)
    }
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err)
    addMessage("Sistema", "Erro ao conectar com o backend.")
  }
}

// ======================
// EVENTOS
// ======================
sendBtn.addEventListener("click", sendMessage)

input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage()
})
// ===== Botão de Configurações =====
const configBtn = document.getElementById("configBtn");
configBtn.addEventListener("click", () => {
  // Abre a página de configuração em nova aba/janela
  window.open("config/config.html", "_blank", "width=600,height=700");
});

// ======================
// MICROFONE (placeholder)
// ======================
micBtn.addEventListener("click", () => {
  console.log("Microfone ativado (placeholder)")
  // futuramente integração com SpeechRecognition
})