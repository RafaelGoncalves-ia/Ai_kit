const API = "http://localhost:3001";

// ======================
// INIT
// ======================
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  loadAll();

  const sliders = ["aura", "energy", "hunger", "mood", "hygiene"];

  sliders.forEach(id => {
    const slider = document.getElementById(id);
    const val = document.getElementById(id + "Val");

    if (!slider) return;

    slider.addEventListener("input", () => {
      val.innerText = Math.round(slider.value);
    });
  });

  // SSE
  if (window.EventSource) {
    const sse = new EventSource(`${API}/events`);

    sse.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);

    if (msg.type === "state:update") {
      // Atualiza sliders, tokens, rotina etc, mas NÃO renderiza inventário
      updateStateUI({
        ...msg.payload,
        inventory: undefined // ⚡ mantém inventário atual
     });

      // Só renderiza inventário se vier de ação de compra ou gift
      // renderInventory(msg.payload); // ❌ não chamar aqui
    }

    } catch (err) {
    console.error("Erro SSE:", err);
   }
  };
  }
});

// ======================
// TABS
// ======================
function setupTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.onclick = () => {
      const parent = btn.closest("section") || document;

      parent.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      parent.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    };
  });
}

// ======================
// LOAD ALL
// ======================
async function loadAll() {
  setStatus("Carregando...");

  try {
    await loadModels();
    await loadConfig();
    await loadSkills();
    await loadShop();

    const res = await fetch(`${API}/status`);
    const data = await res.json();
    const state = data.state;

    updateStateUI(state);
    renderInventory(state);

    setStatus("Sistema sincronizado");
  } catch (err) {
    console.error("Erro geral:", err);
    setStatus("Erro ao conectar");
  }
}

// ======================
// MODELS
// ======================
async function loadModels() {
  try {
    const res = await fetch(`${API}/models`);
    const data = await res.json();

    aiModel.innerHTML = data.models.map(m =>
      `<option value="${m.name}">${m.name}</option>`
    ).join("");
  } catch {
    console.warn("models indisponível");
  }
}

// ======================
// CONFIG
// ======================
async function loadConfig() {
  try {
    const res = await fetch(`${API}/config`);
    const config = await res.json();

    aiModel.value = config.system?.aiModel || "";
    useXTTS.checked = config.voice?.xttsEnabled || false;
    microphone.checked = config.voice?.microphoneEnabled || false;

    kitName.value = config.identity?.name || "KIT";
    kitDescription.value = config.identity?.description || "";
    kitPersonality.value = config.identity?.personality || "";
  } catch {
    console.warn("config indisponível");
  }
}

// ======================
// STATE UI
// ======================
function updateStateUI(state) {
  if (!state) return;

  const sliders = ["aura", "energy", "hunger", "mood", "hygiene"];

  sliders.forEach(id => {
    const slider = document.getElementById(id);
    const val = document.getElementById(id + "Val");

    if (state.needs?.[id] !== undefined && slider) {
      slider.value = state.needs[id];
      val.innerText = Math.round(state.needs[id]);
    }
  });

  if (state.routine) {
    currentAction.innerText = state.routine.currentAction || "-";
  }

  if (state.world) {
    currentLocation.innerText = state.world.location || "-";
  }

  if (state.emotion) {
    currentEmotion.innerText = state.emotion.type || "-";
  }

  if (state.tokens !== undefined) {
    userTokens.innerText = `Tokens: ${state.tokens}`;
  }
}

// ======================
// SKILLS
// ======================
async function loadSkills() {
  try {
    const res = await fetch(`${API}/skills`);
    const skills = await res.json();

    skillsGrid.innerHTML = skills.map(skill => `
      <div class="card">
        <div style="display:flex; justify-content:space-between;">
          <strong>${skill.name}</strong>
          <input type="checkbox" ${skill.active ? "checked" : ""}
            onchange="toggleSkill('${skill.name}', this.checked)">
        </div>
        <small>${skill.description || "Sem descrição"}</small>
      </div>
    `).join("");
  } catch {
    console.warn("skills indisponível");
  }
}

async function toggleSkill(name, active) {
  await fetch(`${API}/skills/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active })
  });

  setStatus(`Skill ${name} ${active ? "ativada" : "desativada"}`);
}

// ======================
// INVENTORY
// ======================
function renderInventory(state) {
  if (!state) return;

  if (!state.inventory || typeof state.inventory !== "object") {
    kitInventory.innerHTML = "<p>Nenhum item ativo</p>";
    return;
  }

  kitInventory.innerHTML = Object.entries(state.inventory).map(([slot, itemId]) => `
    <div class="card">
      <strong>${slot.toUpperCase()}</strong>
      <small>${itemId}</small>
    </div>
  `).join("");
}

// ======================
// SHOP
// ======================
async function loadShop() {
  try {
    const res = await fetch(`${API}/shop`);
    const items = await res.json();

    shopList.innerHTML = items.map(item => `
      <div class="card">
        <strong>${item.nome}</strong>
        <small>${item.descricao}</small>
        <div>💰 ${item.valor}</div>
        <button onclick="buyItem('${item.id}')">🎁 Presentear</button>
      </div>
    `).join("");
  } catch {
    console.warn("shop indisponível");
  }
}

// ======================
// ACTIONS
// ======================
async function buyItem(id) {
  console.log("BUY:", id); // debug opcional

  await fetch(`${API}/shop/gift`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });

  await loadAll();
}

// ======================
// SAVE CONFIG
// ======================
saveBtn.addEventListener("click", async () => {
  try {
    const payload = {
      system: { aiModel: aiModel.value },
      voice: {
        xttsEnabled: useXTTS.checked,
        microphoneEnabled: microphone.checked
      },
      identity: {
        name: kitName.value,
        description: kitDescription.value,
        personality: kitPersonality.value
      }
    };

    await fetch(`${API}/config`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });

    setStatus("Salvo com sucesso");
  } catch (err) {
    console.error(err);
    setStatus("Erro ao salvar");
  }
});

// ======================
function setStatus(text) {
  statusText.innerText = text;
}

// ======================
// POLLING
// ======================
setInterval(async () => {
  try {
    const res = await fetch(`${API}/status`);
    const data = await res.json();
    const state = data.state;

    updateStateUI(state);
    renderInventory(state);
  } catch {}
}, 3000);