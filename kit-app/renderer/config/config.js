import {
  API,
  fetchConfigBundle,
  fetchModels,
  fetchShop,
  fetchSkills,
  fetchStatus,
  saveConfigBundle,
  toggleSkill,
  buyShopItem
} from "./config.api.js";
import {
  getBundle,
  setBundle,
  setModels,
  setStatusSnapshot
} from "./config.state.js";
import { renderPersonalityPanel, renderSystemPanel, bindConfigPanelEvents } from "./config.render.js";
import { validateBundle } from "./config.validate.js";

const statusText = document.getElementById("statusText");
const systemPanel = document.getElementById("systemPanel");
const personalityPanel = document.getElementById("personalityPanel");
const saveBtn = document.getElementById("saveBtn");
const reloadBtn = document.getElementById("reloadBtn");

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupStateSliders();
  setupActions();
  loadAll();
  setupSSE();
  startPolling();
});

function setupTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.tab).classList.add("active");
    });
  });
}

function setupStateSliders() {
  ["aura", "energy", "hunger", "mood", "hygiene"].forEach((id) => {
    const slider = document.getElementById(id);
    const label = document.getElementById(`${id}Val`);
    if (!slider || !label) return;
    slider.addEventListener("input", () => {
      label.innerText = Math.round(slider.value);
    });
  });
}

function setupActions() {
  saveBtn.addEventListener("click", handleSave);
  reloadBtn.addEventListener("click", () => loadAll(true));
}

async function loadAll(forceStatus = false) {
  setStatus("Carregando configurações...");

  try {
    const [models, bundle, skills, shop, statusPayload] = await Promise.all([
      fetchModels(),
      fetchConfigBundle(),
      fetchSkills(),
      fetchShop(),
      fetchStatus()
    ]);

    setModels(models);
    setBundle(bundle);
    setStatusSnapshot(statusPayload);

    renderConfigPanels();
    renderSkills(skills);
    renderShop(shop);
    updateStateUI(statusPayload.state);
    renderInventory(statusPayload.state);

    if (forceStatus) {
      setStatus("Configurações recarregadas");
    } else {
      setStatus("Configuração sincronizada");
    }
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Erro ao carregar configurações", true);
  }
}

function renderConfigPanels() {
  renderSystemPanel(systemPanel);
  renderPersonalityPanel(personalityPanel);

  bindConfigPanelEvents(systemPanel, renderConfigPanels);
  bindConfigPanelEvents(personalityPanel, renderConfigPanels);
}

async function handleSave() {
  try {
    const bundle = getBundle();
    validateBundle(bundle);
    const savedBundle = await saveConfigBundle(bundle);
    setBundle(savedBundle);
    renderConfigPanels();
    setStatus("Configurações salvas com sucesso");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Falha ao salvar configuração", true);
  }
}

function updateStateUI(state) {
  if (!state) return;

  ["aura", "energy", "hunger", "mood", "hygiene"].forEach((id) => {
    const slider = document.getElementById(id);
    const label = document.getElementById(`${id}Val`);
    if (!slider || !label) return;

    const value = state?.needs?.[id];
    if (value !== undefined) {
      slider.value = value;
      label.innerText = Math.round(value);
    }
  });

  document.getElementById("currentAction").innerText = state?.routine?.currentAction || "-";
  document.getElementById("currentLocation").innerText = state?.world?.location || "-";
  document.getElementById("currentEmotion").innerText = state?.emotion?.type || "-";
  document.getElementById("userTokens").innerText = `Tokens: ${state?.tokens ?? 0}`;
}

function renderSkills(skills) {
  const target = document.getElementById("skillsGrid");
  target.innerHTML = skills.map((skill) => `
    <div class="card">
      <div class="object-item-header">
        <strong>${skill.name}</strong>
        <input data-skill-toggle="${skill.name}" type="checkbox" ${skill.active ? "checked" : ""}>
      </div>
      <p class="field-help">${skill.description || "Sem descrição"}</p>
    </div>
  `).join("");

  target.querySelectorAll("[data-skill-toggle]").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        await toggleSkill(input.dataset.skillToggle, input.checked);
        setStatus(`Skill ${input.dataset.skillToggle} ${input.checked ? "ativada" : "desativada"}`);
      } catch (err) {
        console.error(err);
        setStatus(err.message || "Falha ao alterar skill", true);
        input.checked = !input.checked;
      }
    });
  });
}

function renderInventory(state) {
  const target = document.getElementById("kitInventory");
  if (!state?.inventory || typeof state.inventory !== "object") {
    target.innerHTML = "<p class='field-help'>Nenhum item ativo.</p>";
    return;
  }

  target.innerHTML = Object.entries(state.inventory).map(([slot, itemId]) => `
    <div class="card">
      <strong>${slot.toUpperCase()}</strong>
      <small class="field-help">${itemId}</small>
    </div>
  `).join("");
}

function renderShop(items) {
  const target = document.getElementById("shopList");
  target.innerHTML = items.map((item) => `
    <div class="card">
      <strong>${item.nome}</strong>
      <p class="field-help">${item.descricao}</p>
      <div class="pill">💰 ${item.valor}</div>
      <button class="btn-primary" data-buy-item="${item.id}">Presentear</button>
    </div>
  `).join("");

  target.querySelectorAll("[data-buy-item]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await buyShopItem(button.dataset.buyItem);
        await refreshStatusOnly();
        setStatus("Compra realizada com sucesso");
      } catch (err) {
        console.error(err);
        setStatus(err.message || "Falha ao comprar item", true);
      }
    });
  });
}

async function refreshStatusOnly() {
  try {
    const statusPayload = await fetchStatus();
    setStatusSnapshot(statusPayload);
    updateStateUI(statusPayload.state);
    renderInventory(statusPayload.state);
  } catch {}
}

function setupSSE() {
  if (!window.EventSource) return;

  const sse = new EventSource(`${API}/events`);
  sse.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "state:update") {
        updateStateUI(payload.payload);
      }
    } catch (err) {
      console.error("Erro SSE:", err);
    }
  };
}

function startPolling() {
  setInterval(() => {
    refreshStatusOnly();
  }, 3000);
}

function setStatus(text, isError = false) {
  statusText.innerText = text;
  statusText.classList.toggle("message-error", isError);
  statusText.classList.toggle("message-success", !isError);
}
