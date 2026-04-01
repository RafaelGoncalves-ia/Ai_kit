const API = "http://localhost:3001";

// ======================
// INIT
// ======================
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  loadAll();

  // ======================
  // SLIDERS (LIVE VALUE)
  // ======================
  const sliders = ["aura", "energy", "hunger", "mood"];
  sliders.forEach(id => {
    const slider = document.getElementById(id);
    const val = document.getElementById(id + "Val");
    slider.addEventListener("input", () => {
      val.innerText = Math.round(slider.value);
    });
  });

  // ======================
  // SSE - LIVE UPDATE
  // ======================
  if (!!window.EventSource) {
    const sse = new EventSource(`${API}/events`);

    sse.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Atualiza NEEDS
        if (msg.type === "state:update" && msg.payload.needs) {
          const needs = msg.payload.needs;
          sliders.forEach(id => {
            const slider = document.getElementById(id);
            const val = document.getElementById(id + "Val");
            if (needs[id] !== undefined && needs[id] !== null) {
              slider.value = needs[id];
              val.innerText = Math.round(needs[id]);
            }
          });
        }

        // Atualiza rotina / localização
        if (msg.type === "state:update" && msg.payload.routine) {
          const { currentAction } = msg.payload.routine;
          if (currentAction) document.getElementById("currentAction").innerText = currentAction;
        }
        if (msg.type === "state:update" && msg.payload.world) {
          const { location } = msg.payload.world;
          if (location) document.getElementById("currentLocation").innerText = location;
        }

        // Atualiza emoção
        if (msg.type === "state:update" && msg.payload.emotion) {
          const { type } = msg.payload.emotion;
          if (type) document.getElementById("currentEmotion").innerText = type;
        }

      } catch (err) {
        console.error("Erro SSE:", err);
      }
    };

    sse.onerror = () => console.warn("SSE desconectado ou erro de conexão");
  }
});

// ======================
// TABS
// ======================
function setupTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

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
    await loadState();
    await loadSkills();
    await loadCurrentAction();

    setStatus("Sistema sincronizado");
  } catch (err) {
    console.error(err);
    setStatus("Erro ao conectar");
  }
}

// ======================
// MODELS
// ======================
async function loadModels() {
  const res = await fetch(`${API}/models`);
  const data = await res.json();

  const select = document.getElementById("aiModel");

  select.innerHTML = data.models.map(m =>
    `<option value="${m.name}">${m.name} ${m.size ? `(${m.size})` : ""}</option>`
  ).join("");
}

// ======================
// CONFIG (SISTEMA + IDENTIDADE)
// ======================
async function loadConfig() {
  const res = await fetch(`${API}/config`);
  const config = await res.json();

  // Sistema
  aiModel.value = config.system?.aiModel || "";
  useXTTS.checked = config.voice?.xttsEnabled || false;
  microphone.checked = config.voice?.microphoneEnabled || false;

  // Identidade
  kitName.value = config.identity?.name || "KIT";
  kitDescription.value = config.identity?.description || "";
  kitPersonality.value = config.identity?.personality || "";
}

// ======================
// STATE
// ======================
async function loadState() {
  const res = await fetch(`${API}/status`);
  const data = await res.json();

  applyState(data.state || {});
}

function applyState(state) {
  // NEEDS
  const sliders = ["aura", "energy", "hunger", "mood"];
  sliders.forEach(id => {
    const slider = document.getElementById(id);
    const val = document.getElementById(id + "Val");
    if (state.needs?.[id] !== undefined && state.needs[id] !== null) {
      slider.value = state.needs[id];
      val.innerText = Math.round(state.needs[id]);
    }
  });

  // EMOÇÃO
  if (state.emotion) {
    document.getElementById("currentEmotion").innerText = state.emotion.type;
  }

  // ROTINA / LOCAL
  if (state.routine) {
    document.getElementById("currentAction").innerText = state.routine.currentAction;
  }

  if (state.world) {
    document.getElementById("currentLocation").innerText = state.world.location;
  }
}

// ======================
// CURRENT ACTION / LIVE UPDATE (Fallback polling)
// ======================
async function loadCurrentAction() {
  const res = await fetch(`${API}/status`);
  const data = await res.json();

  const state = data.state || {};
  if (state.routine) {
    document.getElementById("currentAction").innerText = state.routine.currentAction;
  }
  if (state.world) {
    document.getElementById("currentLocation").innerText = state.world.location;
  }
  if (state.emotion) {
    document.getElementById("currentEmotion").innerText = state.emotion.type;
  }
}

// ======================
// SKILLS
// ======================
async function loadSkills() {
  const res = await fetch(`${API}/skills`);
  const skills = await res.json();

  const grid = document.getElementById("skillsGrid");

  grid.innerHTML = skills.map(skill => `
    <div class="card">
      <div style="display:flex; justify-content:space-between;">
        <strong>${skill.name}</strong>
        <input type="checkbox" ${skill.active ? "checked" : ""}
          onchange="toggleSkill('${skill.name}', this.checked)">
      </div>
      <small>${skill.description || "Sem descrição"}</small>
    </div>
  `).join("");
}

// ======================
// TOGGLE SKILL
// ======================
async function toggleSkill(name, active) {
  await fetch(`${API}/skills/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active })
  });

  setStatus(`Skill ${name} ${active ? "ativada" : "desativada"}`);
}

// ======================
// SAVE CONFIG
// ======================
document.getElementById("saveBtn").addEventListener("click", async () => {
  try {
    const payload = {
      system: { aiModel: aiModel.value },
      voice: { xttsEnabled: useXTTS.checked, microphoneEnabled: microphone.checked },
      identity: { name: kitName.value, description: kitDescription.value, personality: kitPersonality.value }
    };

    await fetch(`${API}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setStatus("Salvo com sucesso");
  } catch (err) {
    console.error(err);
    setStatus("Erro ao salvar");
  }
});

// ======================
// UI HELPERS
// ======================
function setStatus(text) {
  document.getElementById("statusText").innerText = text;
}

// ======================
// OPTIONAL: POLLING fallback every 2s
// ======================
setInterval(loadCurrentAction, 2000);