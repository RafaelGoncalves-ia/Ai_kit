let mediaRecorder;
let audioChunks = [];
let isRecording = false;

const micBtn = document.getElementById("micBtn");

micBtn.addEventListener("click", async () => {
  if (!isRecording) {
    await startRecording();
    micBtn.textContent = "⏹️";
  } else {
    stopRecording();
    micBtn.textContent = "🎤";
  }
});

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/webm" });

    const formData = new FormData();
    formData.append("audio", blob, "audio.webm");

    const res = await fetch("http://localhost:3001/stt", {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    document.getElementById("input").value = data.text;

    // dispara envio automático (opcional)
    document.getElementById("sendBtn").click();
  };

  mediaRecorder.start();
  isRecording = true;
}

function stopRecording() {
  mediaRecorder.stop();
  isRecording = false;
}