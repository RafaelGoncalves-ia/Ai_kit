const notifyEl = document.getElementById("notify");
const textEl = document.getElementById("text");
const titleEl = document.getElementById("title");

// Recebe mensagem do Main
window.kitAPI.onNotify((data) => {
  console.log("NOTIFY RECEBIDO:", data);

  const isObject = typeof data === "object";

  const message = isObject ? data.message : data;
  const title = isObject && data.title ? data.title : "Kit IA";
  const type = isObject && data.type ? data.type : "info";
  const duration = isObject && data.duration ? data.duration : 5000;

  if (textEl) textEl.innerText = message || "Sem mensagem";
  if (titleEl) titleEl.innerText = title;

  // reset classes corretamente
  notifyEl.className = "";
  notifyEl.classList.add(type);

  // mostra
  notifyEl.style.opacity = 1;

  // auto fechar
  setTimeout(() => fadeOutAndClose(), duration);
});

// Fade + fechar
function fadeOutAndClose() {
  notifyEl.classList.add("fade-out");

  setTimeout(() => {
    window.kitAPI.closeNotify();
  }, 300);
}

// Clique abre chat
notifyEl.onclick = () => {
  window.kitAPI.openChat();
  fadeOutAndClose();
};