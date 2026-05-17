const chatMicButton = document.getElementById("micBtn");
const CHAT_MIC_STT_URL = "http://localhost:3001/stt";
const CHAT_MIC_SILENCE_INTERVAL_MS = 80;
const CHAT_MIC_SILENCE_THRESHOLD = 0.02;
const CHAT_MIC_SILENCE_TIMEOUT_MS = 1200;
const CHAT_MIC_AUTO_SEND_MS = 2000;

let chatMicRecorder = null;
let chatMicChunks = [];
let chatMicRecording = false;
let chatMicStream = null;
let chatMicAudioContext = null;
let chatMicAnalyser = null;
let chatMicBuffer = null;
let chatMicSilenceTimer = null;
let chatMicStartedAt = 0;
let chatMicLastVoiceAt = 0;
let chatMicAutoSendTimer = null;
let chatMicAutoSendArmedAt = 0;

function getChatInput() {
  return document.getElementById("input");
}

function cancelChatMicAutoSend() {
  if (chatMicAutoSendTimer) {
    window.clearTimeout(chatMicAutoSendTimer);
    chatMicAutoSendTimer = null;
  }
  chatMicAutoSendArmedAt = 0;
}

function scheduleChatMicAutoSend() {
  cancelChatMicAutoSend();
  chatMicAutoSendArmedAt = Date.now();
  chatMicAutoSendTimer = window.setTimeout(() => {
    chatMicAutoSendTimer = null;
    chatMicAutoSendArmedAt = 0;
    if (getChatInput()?.value.trim()) {
      document.getElementById("sendBtn")?.click();
    }
  }, CHAT_MIC_AUTO_SEND_MS);
}

function cancelChatMicAutoSendFromUserAction() {
  if (!chatMicAutoSendTimer) {
    return;
  }

  if (Date.now() - chatMicAutoSendArmedAt < 50) {
    return;
  }

  cancelChatMicAutoSend();
}

function setChatMicState(state = "ready") {
  if (!chatMicButton) {
    return;
  }

  chatMicButton.classList.toggle("loading", state === "loading");
  chatMicButton.classList.toggle("listening", state === "listening");
  chatMicButton.classList.toggle("recording", state === "listening");

  if (state === "loading") {
    chatMicButton.title = "Carregando microfone";
    chatMicButton.setAttribute("aria-label", "Carregando microfone");
    chatMicButton.disabled = true;
    return;
  }

  chatMicButton.disabled = false;

  if (state === "listening") {
    chatMicButton.title = "Parar gravacao";
    chatMicButton.setAttribute("aria-label", "Parar gravacao");
    return;
  }

  chatMicButton.title = "Ativar Microfone";
  chatMicButton.setAttribute("aria-label", "Ativar Microfone");
}

function clearChatMicSilenceTimer() {
  if (chatMicSilenceTimer) {
    window.clearInterval(chatMicSilenceTimer);
    chatMicSilenceTimer = null;
  }
}

function cleanupChatMicResources() {
  clearChatMicSilenceTimer();

  if (chatMicStream) {
    chatMicStream.getTracks().forEach((track) => track.stop());
    chatMicStream = null;
  }

  if (chatMicAudioContext) {
    chatMicAudioContext.close().catch(() => {});
    chatMicAudioContext = null;
  }

  chatMicAnalyser = null;
  chatMicBuffer = null;
  chatMicRecorder = null;
  chatMicChunks = [];
}

function resetChatMicUI(placeholder = "") {
  chatMicRecording = false;
  setChatMicState("ready");

  const chatInput = getChatInput();
  if (chatInput && placeholder) {
    chatInput.placeholder = placeholder;
  }
}

function readChatMicInputLevel() {
  if (!chatMicAnalyser || !chatMicBuffer) {
    return 0;
  }

  chatMicAnalyser.getByteTimeDomainData(chatMicBuffer);
  let sum = 0;
  for (let index = 0; index < chatMicBuffer.length; index += 1) {
    const centered = (chatMicBuffer[index] - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / chatMicBuffer.length);
}

function monitorChatMicSilence() {
  if (!chatMicRecording) {
    return;
  }

  const level = readChatMicInputLevel();
  const now = Date.now();
  if (level >= CHAT_MIC_SILENCE_THRESHOLD) {
    chatMicLastVoiceAt = now;
    return;
  }

  if (now - chatMicStartedAt < 250) {
    return;
  }

  if (now - chatMicLastVoiceAt >= CHAT_MIC_SILENCE_TIMEOUT_MS) {
    stopChatMicRecording();
  }
}

async function setupChatMicSilenceDetection(stream) {
  const AudioContextRef = window.AudioContext || window.webkitAudioContext;
  chatMicAudioContext = new AudioContextRef();
  const source = chatMicAudioContext.createMediaStreamSource(stream);
  chatMicAnalyser = chatMicAudioContext.createAnalyser();
  chatMicAnalyser.fftSize = 2048;
  source.connect(chatMicAnalyser);
  chatMicBuffer = new Uint8Array(chatMicAnalyser.frequencyBinCount);

  if (chatMicAudioContext.state === "suspended") {
    await chatMicAudioContext.resume();
  }

  clearChatMicSilenceTimer();
  chatMicSilenceTimer = window.setInterval(monitorChatMicSilence, CHAT_MIC_SILENCE_INTERVAL_MS);
}

async function startChatMicRecording() {
  if (chatMicRecording) {
    return;
  }

  const chatInput = getChatInput();

  try {
    cancelChatMicAutoSend();
    setChatMicState("loading");
    if (chatInput) {
      chatInput.placeholder = "Carregando microfone...";
    }

    await window.kitAPI?.markActivity?.("mic-request");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    chatMicStream = stream;
    chatMicRecorder = new MediaRecorder(stream);
    chatMicChunks = [];
    await setupChatMicSilenceDetection(stream);

    chatMicRecorder.ondataavailable = (event) => {
      if (event.data?.size) {
        chatMicChunks.push(event.data);
      }
    };

    chatMicRecorder.onstop = async () => {
      setChatMicState("loading");
      if (chatInput) {
        chatInput.placeholder = "Transcrevendo...";
      }

      const blob = new Blob(chatMicChunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", blob, "audio.webm");

      try {
        const response = await fetch(CHAT_MIC_STT_URL, {
          method: "POST",
          body: formData
        });
        const data = await response.json().catch(() => ({}));
        const nextText = String(data.text || "").trim();

        if (nextText && chatInput) {
          chatInput.value = chatInput.value.trim()
            ? `${chatInput.value.trim()} ${nextText}`
            : nextText;
          chatInput.focus();
          chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
          chatInput.dispatchEvent(new Event("input"));
          scheduleChatMicAutoSend();
        }
      } catch (err) {
        console.error("Erro STT:", err);
      } finally {
        cleanupChatMicResources();
        resetChatMicUI("Transcricao pronta");
      }
    };

    chatMicRecorder.start();
    chatMicRecording = true;
    chatMicStartedAt = Date.now();
    chatMicLastVoiceAt = chatMicStartedAt;
    setChatMicState("listening");
    if (chatInput) {
      chatInput.placeholder = "Ouvindo... pare de falar para transcrever";
    }
  } catch (err) {
    console.error("Erro microfone:", err);
    cleanupChatMicResources();
    resetChatMicUI();
  }
}

function stopChatMicRecording() {
  if (chatMicRecorder && chatMicRecorder.state !== "inactive") {
    setChatMicState("loading");
    chatMicRecorder.stop();
    return;
  }

  cleanupChatMicResources();
  resetChatMicUI();
}

chatMicButton?.addEventListener("click", () => {
  if (!chatMicRecording) {
    void startChatMicRecording();
  } else {
    stopChatMicRecording();
  }
});

const chatMicInput = getChatInput();
chatMicInput?.addEventListener("input", cancelChatMicAutoSendFromUserAction);
chatMicInput?.addEventListener("pointerdown", cancelChatMicAutoSendFromUserAction);
chatMicInput?.addEventListener("keydown", cancelChatMicAutoSendFromUserAction);
