const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");
const plusBtn = document.getElementById("plus");

const API_URL = "http://localhost:3001/chat";
const STT_URL = "http://localhost:3001/stt";
const SILENCE_INTERVAL_MS = 80;
const SILENCE_THRESHOLD = 0.02;
const SILENCE_TIMEOUT_MS = 1200;
const MAX_VIDEO_MB = 40;
const MAX_AUDIO_MB = 12;
const MAX_RECORD_AUDIO_MS = 90000;
const MAX_INPUT_LINES = 7;
const INPUT_LINE_HEIGHT = 22;

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let selectedAttachment = null;
let recordingStream = null;
let recordingAudioContext = null;
let recordingAnalyser = null;
let recordingBuffer = null;
let silenceTimer = null;
let recordingStartedAt = 0;
let lastVoiceAt = 0;
let attachmentRecorder = null;
let attachmentChunks = [];
let attachmentStream = null;
let attachmentTimeout = null;

function autoResizeInput() {
  if (!input) {
    return;
  }

  input.style.height = "auto";
  const maxHeight = INPUT_LINE_HEIGHT * MAX_INPUT_LINES;
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
  requestWidgetResize();
}

function requestWidgetResize() {
  const widgetBox = document.getElementById("widgetBox");
  if (!widgetBox || !window.kitAPI?.resizeWidget) {
    return;
  }

  const desiredHeight = Math.ceil(widgetBox.scrollHeight + 20);
  window.kitAPI.resizeWidget(desiredHeight).catch(() => {});
}

async function send(textOverride = null) {
  const value = (textOverride || input.value).trim();

  if (!value && !selectedAttachment) return;

  input.value = "";
  autoResizeInput();
  const attachmentToSend = selectedAttachment;
  selectedAttachment = null;
  plusBtn.style.color = "";

  try {
    await window.kitAPI?.markActivity?.("widget-send");
    let response;

    if (attachmentToSend?.blob) {
      const formData = new FormData();
      formData.append("text", value);
      formData.append("sessionId", "widget");
      formData.append("mediaType", attachmentToSend.kind);
      formData.append("file", attachmentToSend.blob, attachmentToSend.name);
      response = await fetch(API_URL, {
        method: "POST",
        body: formData
      });
    } else {
      response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: value,
          file: attachmentToSend?.path || null,
          fileName: attachmentToSend?.name || null,
          mediaType: attachmentToSend?.kind || null,
          sessionId: "widget"
        })
      });
    }

    const data = await response.json().catch(() => ({}));

    if (data?.sessionId) {
      window.kitAPI?.setActiveConversation?.(data.sessionId);
    }

    window.kitAPI.closeWidget();
  } catch (err) {
    console.error("Erro ao enviar:", err);
    input.value = value;
    if (attachmentToSend) {
      selectedAttachment = attachmentToSend;
    }
  }
}

function validateAttachment({ sizeBytes = 0, kind = "image" }) {
  if (kind === "video" && sizeBytes > MAX_VIDEO_MB * 1024 * 1024) {
    input.placeholder = `Video acima de ${MAX_VIDEO_MB}MB`;
    return false;
  }

  if (kind === "audio" && sizeBytes > MAX_AUDIO_MB * 1024 * 1024) {
    input.placeholder = `Audio acima de ${MAX_AUDIO_MB}MB`;
    return false;
  }

  return true;
}

function setSelectedAttachment(attachment) {
  selectedAttachment = attachment;
  if (attachment) {
    plusBtn.style.color = "#00ff88";
    input.placeholder = `Anexo: ${attachment.name}`;
    input.focus();
    autoResizeInput();
  }
}

function removeMediaMenu() {
  document.getElementById("widgetMediaMenu")?.remove();
}

function openFilePicker(kind) {
  window.kitAPI.openFileDialog({ kind });
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
    attachmentRecorder.onstop = () => {
      const mimeType = attachmentRecorder?.mimeType || "audio/webm";
      const blob = new Blob(attachmentChunks, { type: mimeType });
      if (validateAttachment({ sizeBytes: blob.size, kind: "audio" })) {
        setSelectedAttachment({
          kind: "audio",
          blob,
          name: `gravacao-${Date.now()}.webm`
        });
      }
      attachmentChunks = [];
      if (attachmentStream) {
        attachmentStream.getTracks().forEach((track) => track.stop());
      }
      attachmentRecorder = null;
      attachmentStream = null;
    };
    attachmentRecorder.start();
    attachmentTimeout = setTimeout(() => {
      stopAttachmentRecording();
    }, MAX_RECORD_AUDIO_MS);
    input.placeholder = "Gravando audio para anexo...";
  } catch (err) {
    console.error("Erro ao gravar audio de anexo:", err);
  }
}

function stopAttachmentRecording() {
  if (attachmentTimeout) {
    clearTimeout(attachmentTimeout);
    attachmentTimeout = null;
  }

  if (attachmentRecorder && attachmentRecorder.state !== "inactive") {
    attachmentRecorder.stop();
  }
}

function showMediaMenu() {
  removeMediaMenu();
  const menu = document.createElement("div");
  menu.id = "widgetMediaMenu";
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
    border: "1px solid rgba(255,255,255,0.12)"
  });

  const actions = [
    { label: "Imagem", run: () => openFilePicker("image") },
    { label: "Video", run: () => openFilePicker("video") },
    { label: "Audio", run: () => openFilePicker("audio") },
    {
      label: attachmentRecorder ? "Parar gravacao" : "Gravar audio",
      run: () => {
        if (attachmentRecorder) {
          stopAttachmentRecording();
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

plusBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  showMediaMenu();
});

window.kitAPI?.onFileSelected?.((payload) => {
  if (!payload?.path) {
    return;
  }

  if (!validateAttachment({ sizeBytes: payload.sizeBytes || 0, kind: payload.kind || "image" })) {
    return;
  }

  setSelectedAttachment({
    path: payload.path,
    kind: payload.kind || "image",
    name: payload.name || payload.path.split(/[\\/]/).pop()
  });
});

input.addEventListener("input", () => {
  autoResizeInput();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
  if (e.key === "Escape") window.kitAPI.closeWidget();
});

sendBtn.addEventListener("click", () => send());

micBtn.addEventListener("click", () => {
  if (!isRecording) startRecording();
  else stopRecording();
});

async function startRecording() {
  if (isRecording) {
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    recordingStream = stream;
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    await setupSilenceDetection(stream);

    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", blob, "audio.webm");

      try {
        const res = await fetch(STT_URL, { method: "POST", body: formData });
        const data = await res.json();

        if (data.text) {
          const nextText = String(data.text || "").trim();
          if (nextText) {
            input.value = input.value.trim()
              ? `${input.value.trim()} ${nextText}`
              : nextText;
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
            autoResizeInput();
          }
        }
      } catch (err) {
        console.error("Erro STT:", err);
      } finally {
        cleanupRecordingResources();
        resetMicUI("Transcrição pronta");
      }
    };

    mediaRecorder.start();
    isRecording = true;
    recordingStartedAt = Date.now();
    lastVoiceAt = recordingStartedAt;
    micBtn.textContent = "\u23F9\uFE0F";
    micBtn.classList.add("recording");
    input.placeholder = "Ouvindo... pare de falar para transcrever";
    autoResizeInput();
  } catch (err) {
    console.error("Erro microfone:", err);
    cleanupRecordingResources();
    resetMicUI();
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    return;
  }
  cleanupRecordingResources();
  resetMicUI();
}

function resetMicUI(placeholder = null) {
  isRecording = false;
  micBtn.textContent = "\uD83C\uDFA4";
  micBtn.classList.remove("recording");
  input.placeholder = placeholder || (selectedAttachment ? input.placeholder : "");
  autoResizeInput();
}

async function setupSilenceDetection(stream) {
  const AudioContextRef = window.AudioContext || window.webkitAudioContext;
  recordingAudioContext = new AudioContextRef();
  const source = recordingAudioContext.createMediaStreamSource(stream);
  recordingAnalyser = recordingAudioContext.createAnalyser();
  recordingAnalyser.fftSize = 2048;
  source.connect(recordingAnalyser);
  recordingBuffer = new Uint8Array(recordingAnalyser.frequencyBinCount);

  if (recordingAudioContext.state === "suspended") {
    await recordingAudioContext.resume();
  }

  clearSilenceTimer();
  silenceTimer = window.setInterval(() => {
    monitorRecordingSilence();
  }, SILENCE_INTERVAL_MS);
}

function monitorRecordingSilence() {
  if (!isRecording || !recordingAnalyser || !recordingBuffer) {
    return;
  }

  const level = readInputLevel(recordingAnalyser, recordingBuffer);
  const now = Date.now();
  if (level >= SILENCE_THRESHOLD) {
    lastVoiceAt = now;
    return;
  }

  if (now - recordingStartedAt < 250) {
    return;
  }

  if (now - lastVoiceAt >= SILENCE_TIMEOUT_MS) {
    stopRecording();
  }
}

function readInputLevel(analyser, buffer) {
  analyser.getByteTimeDomainData(buffer);

  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const centered = (buffer[i] - 128) / 128;
    sum += centered * centered;
  }

  return Math.sqrt(sum / buffer.length);
}

function clearSilenceTimer() {
  if (silenceTimer) {
    window.clearInterval(silenceTimer);
    silenceTimer = null;
  }
}

function cleanupRecordingResources() {
  clearSilenceTimer();

  if (recordingStream) {
    recordingStream.getTracks().forEach((track) => track.stop());
    recordingStream = null;
  }

  if (recordingAudioContext) {
    recordingAudioContext.close().catch(() => {});
    recordingAudioContext = null;
  }

  recordingAnalyser = null;
  recordingBuffer = null;
  mediaRecorder = null;
  audioChunks = [];
}

window.kitAPI?.onStartVoice?.(() => {
  if (!isRecording) startRecording();
});

autoResizeInput();
