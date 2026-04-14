document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("toggleSidebar");
  const chatList = document.getElementById("chatList");
  const newChatBtn = document.getElementById("newChatBtn");

  const API_BASE = "http://localhost:3001";

  if (!sidebar || !toggleBtn) {
    console.error("Sidebar nao encontrada");
    return;
  }

  toggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  async function loadChats(options = {}) {
    const selectId = options.selectId || window.getCurrentConversationId?.() || null;

    try {
      const res = await fetch(`${API_BASE}/conversations`);
      const chats = await res.json();
      const chatItems = Array.isArray(chats) ? chats.slice() : [];

      if (selectId && !chatItems.some((chat) => chat.id === selectId)) {
        chatItems.unshift({
          id: selectId,
          title: "Novo Chat"
        });
      }

      chatList.innerHTML = "";

      chatItems.forEach((chat) => {
        const div = document.createElement("div");
        div.className = "chat-item";
        div.dataset.id = chat.id;

        const titleSpan = document.createElement("span");
        titleSpan.className = "chat-title";
        titleSpan.textContent = chat.title || "Novo Chat";

        const delBtn = document.createElement("span");
        delBtn.className = "chat-delete";
        delBtn.textContent = "x";
        delBtn.title = "Excluir chat";
        delBtn.style.display = "none";

        div.appendChild(titleSpan);
        div.appendChild(delBtn);
        chatList.appendChild(div);

        div.addEventListener("click", () => {
          if (window.loadConversation) {
            window.loadConversation(chat.id);
          }
          highlightSelected(div);
        });

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

            await fetch(`${API_BASE}/conversations/${chat.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: newName })
            });
          });

          input.addEventListener("keypress", (event) => {
            if (event.key === "Enter") input.blur();
          });
        });

        div.addEventListener("mouseenter", () => {
          delBtn.style.display = "inline";
        });

        div.addEventListener("mouseleave", () => {
          delBtn.style.display = "none";
        });

        delBtn.addEventListener("click", async (event) => {
          event.stopPropagation();
          if (!confirm("Deseja realmente excluir este chat?")) {
            return;
          }

          await fetch(`${API_BASE}/conversations/${chat.id}`, { method: "DELETE" });
          div.remove();

          const first = chatList.querySelector(".chat-item");
          if (first && window.loadConversation) {
            window.loadConversation(first.dataset.id);
          }
        });

        if (selectId && chat.id === selectId) {
          highlightSelected(div);
        }
      });
    } catch (err) {
      console.error("Erro ao carregar chats:", err);
    }
  }

  if (newChatBtn) {
    newChatBtn.addEventListener("click", async () => {
      try {
        if (window.createNewChat) {
          await window.createNewChat();
          return;
        }

        const response = await fetch(`${API_BASE}/conversations/new`, { method: "POST" });
        const data = await response.json().catch(() => ({}));
        await loadChats({
          selectId: data?.conversation?.id || null
        });
      } catch (err) {
        console.error("Erro ao criar chat:", err);
      }
    });
  }

  function highlightSelected(div) {
    document.querySelectorAll(".chat-item").forEach((item) => item.classList.remove("selected"));
    div.classList.add("selected");
  }

  window.refreshSidebar = loadChats;

  loadChats();
});
