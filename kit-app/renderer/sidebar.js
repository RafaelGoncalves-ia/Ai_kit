document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("toggleSidebar");
  const chatList = document.getElementById("chatList");
  const newChatBtn = document.getElementById("newChatBtn");

  const API_BASE = "http://localhost:3001";

  if (!sidebar || !toggleBtn) {
    console.error("Sidebar não encontrada");
    return;
  }

  // =============================
  // TOGGLE SIDEBAR
  // =============================
  toggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  // =============================
  // LOAD CHATS (BACKEND)
  // =============================
  async function loadChats() {
    try {
      const res = await fetch(`${API_BASE}/conversations`);
      const chats = await res.json();

      chatList.innerHTML = "";

      chats.forEach(chat => {
        const div = document.createElement("div");
        div.className = "chat-item";
        div.dataset.id = chat.id;

        // Título
        const titleSpan = document.createElement("span");
        titleSpan.className = "chat-title";
        titleSpan.textContent = chat.title || "Novo Chat";

        // Botão apagar
        const delBtn = document.createElement("span");
        delBtn.className = "chat-delete";
        delBtn.textContent = "✖";
        delBtn.title = "Excluir chat";
        delBtn.style.display = "none";

        div.appendChild(titleSpan);
        div.appendChild(delBtn);
        chatList.appendChild(div);

        // =============================
        // INTERAÇÕES
        // =============================
        div.addEventListener("click", () => {
          if (window.loadConversation) {
            window.loadConversation(chat.id);
          }
          highlightSelected(div);
        });

        // Renomear (duplo clique)
        titleSpan.addEventListener("dblclick", () => {
          const input = document.createElement("input");
          input.type = "text";
          input.value = titleSpan.textContent;
          input.className = "rename-input";
          titleSpan.replaceWith(input);
          input.focus();

          input.addEventListener("blur", async () => {
            const newName = input.value.trim() || "Novo Chat";
            titleSpan.textContent = newName;
            input.replaceWith(titleSpan);

            // Atualiza backend
            await fetch(`${API_BASE}/conversations/${chat.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: newName })
            });
          });

          input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") input.blur();
          });
        });

        // Mostrar botão X ao passar o mouse
        div.addEventListener("mouseenter", () => delBtn.style.display = "inline");
        div.addEventListener("mouseleave", () => delBtn.style.display = "none");

        // Deletar chat
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation(); // não seleciona o chat
          if (confirm("Deseja realmente excluir este chat?")) {
            await fetch(`${API_BASE}/conversations/${chat.id}`, { method: "DELETE" });
            div.remove();
            // opcional: carregar outro chat
            const first = chatList.querySelector(".chat-item");
            if (first && window.loadConversation) {
              window.loadConversation(first.dataset.id);
            }
          }
        });
      });

    } catch (err) {
      console.error("Erro ao carregar chats:", err);
    }
  }

  // =============================
  // NOVO CHAT
  // =============================
  if (newChatBtn) {
    newChatBtn.addEventListener("click", async () => {
      try {
        await fetch(`${API_BASE}/conversations/new`, { method: "POST" });
        await loadChats();

        // abrir automaticamente último chat
        const res = await fetch(`${API_BASE}/conversations`);
        const list = await res.json();
        const last = list[list.length - 1];
        if (last && window.loadConversation) {
          window.loadConversation(last.id);
        }
      } catch (err) {
        console.error("Erro ao criar chat:", err);
      }
    });
  }

  // =============================
  // AUX: Highlight selecionado
  // =============================
  function highlightSelected(div) {
    document.querySelectorAll(".chat-item").forEach(d => d.classList.remove("selected"));
    div.classList.add("selected");
  }

  // =============================
  // INIT
  // =============================
  loadChats();
});