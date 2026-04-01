// kit-app/renderer/app.js

const input = document.getElementById("input"); 
const chat = document.getElementById("chat");

// ======================
// WIDGET INPUT
// ======================
if (input) {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const value = input.value.trim();
      if (!value) return;

      window.kitAPI.sendMessage(value);
      input.value = "";
    }
  });
}

// ======================
// CHAT (tempo real via IPC)
// ======================
if (chat) {
  window.kitAPI.onChatMessage((data) => {
    const div = document.createElement("div");

    // 🔥 suporta padrão novo (author/text)
    const user = data.user || "";
    const bot = data.bot || data.text || "";

    div.innerHTML = `
      ${user ? `<b>Você:</b> ${user}<br>` : ""}
      <b>Kit:</b> ${bot}
      <hr>
    `;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  });
}

// ======================
// VOZ
// ======================
if (window.kitAPI?.onStartVoice) {
  window.kitAPI.onStartVoice(() => {
    document.getElementById("micBtn")?.click();
  });
}