const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");
const plusBtn = document.getElementById("plus"); // Novo: Botão de mídia

const API_URL = "http://localhost:3001/chat";
const STT_URL = "http://localhost:3001/stt";

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let selectedFilePath = null; // Armazena o caminho do arquivo selecionado

// ======================
// ENVIAR TEXTO + ARQUIVO
// ======================
async function send(textOverride = null) {
  const value = (textOverride || input.value).trim();
  
  // Se não houver texto nem arquivo, não envia
  if (!value && !selectedFilePath) return;

  // Limpa interface antes do fetch para dar sensação de velocidade
  input.value = "";
  const tempPath = selectedFilePath;
  selectedFilePath = null;
  plusBtn.style.color = ""; // Volta a cor original do botão +

  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        text: value,
        file: tempPath,
        sessionId: "widget"
      }),
    });

    // 🔥 FECHA SEMPRE após o envio com sucesso
    window.kitAPI.closeWidget();

  } catch (err) {
    console.error("Erro ao enviar:", err);
    // Em caso de erro, devolve o texto ao input para o usuário não perder a mensagem
    input.value = value;
  }
}

// ======================
// GESTÃO DE ARQUIVOS (BOTÃO +)
// ======================
plusBtn.addEventListener("click", () => {
  window.kitAPI.openFileDialog();
});

// Escuta o arquivo selecionado vindo do Main via Preload
window.kitAPI?.onFileSelected?.((filePath) => {
  selectedFilePath = filePath;
  if (filePath) {
    plusBtn.style.color = "#00ff88"; // Feedback visual de sucesso (Verde)
    const fileName = filePath.split(/[\\/]/).pop();
    input.placeholder = `Anexo: ${fileName}`;
    input.focus();
  }
});

// ======================
// EVENTOS DE TECLADO
// ======================
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") send();
  if (e.key === "Escape") window.kitAPI.closeWidget();
});

sendBtn.addEventListener("click", () => send());

// ======================
// MICROFONE (STT)
// ======================
micBtn.addEventListener("click", () => {
  if (!isRecording) startRecording();
  else stopRecording();
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", blob, "audio.webm");

      try {
        const res = await fetch(STT_URL, { method: "POST", body: formData });
        const data = await res.json();
        
        if (data.text) {
          input.value = data.text;
          send(data.text); // Envia automático após falar
        }
      } catch (err) {
        console.error("Erro STT:", err);
      } finally {
        // Limpa visual mesmo se falhar o STT
        resetMicUI();
      }
    };

    mediaRecorder.start();
    isRecording = true;
    micBtn.textContent = "⏹️";
    micBtn.classList.add("recording");

  } catch (err) {
    console.error("Erro microfone:", err);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  resetMicUI();
}

function resetMicUI() {
  isRecording = false;
  micBtn.textContent = "🎤";
  micBtn.classList.remove("recording");
}

// Escuta atalho global do Electron (Ctrl+Shift+Space)
window.kitAPI?.onStartVoice?.(() => {
  if (!isRecording) startRecording();
});
