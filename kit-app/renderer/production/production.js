const BACKEND = "http://localhost:3001";

const STATUS_LABELS = {
  idea: "Ideia",
  briefing: "Briefing",
  script: "Roteiro",
  production: "Em producao",
  review: "Revisao",
  scheduled: "Agendado",
  published: "Publicado",
  done: "Concluido"
};

const TYPE_LABELS = {
  feed: "Feed",
  stories: "Stories",
  reels: "Reels",
  carousel: "Carrossel",
  ads: "Ads",
  script: "Roteiro"
};

const TYPE_ICONS = {
  feed: "F",
  stories: "S",
  reels: "R",
  carousel: "C",
  ads: "A",
  script: "T"
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

const state = {
  clients: [],
  demands: [],
  weekStart: startOfWeek(new Date()),
  filters: {
    clientId: "",
    type: "",
    status: "",
    responsible: "",
    platform: "",
    month: "",
    search: ""
  }
};

const els = {
  monthLabel: document.getElementById("monthLabel"),
  weekDays: document.getElementById("weekDays"),
  calendarGrid: document.getElementById("calendarGrid"),
  kanbanBoard: document.getElementById("kanbanBoard"),
  clientFilter: document.getElementById("clientFilter"),
  typeFilter: document.getElementById("typeFilter"),
  statusFilter: document.getElementById("statusFilter"),
  responsibleFilter: document.getElementById("responsibleFilter"),
  platformFilter: document.getElementById("platformFilter"),
  monthFilter: document.getElementById("monthFilter"),
  searchFilter: document.getElementById("searchFilter"),
  prevWeekBtn: document.getElementById("prevWeekBtn"),
  nextWeekBtn: document.getElementById("nextWeekBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  newDemandBtn: document.getElementById("newDemandBtn"),
  demandDialog: document.getElementById("demandDialog"),
  demandForm: document.getElementById("demandForm"),
  dialogTitle: document.getElementById("dialogTitle"),
  closeDialogBtn: document.getElementById("closeDialogBtn"),
  cancelDialogBtn: document.getElementById("cancelDialogBtn"),
  deleteDemandBtn: document.getElementById("deleteDemandBtn"),
  demandId: document.getElementById("demandId"),
  titleInput: document.getElementById("titleInput"),
  clientInput: document.getElementById("clientInput"),
  clientNameInput: document.getElementById("clientNameInput"),
  typeInput: document.getElementById("typeInput"),
  statusInput: document.getElementById("statusInput"),
  plannedDateInput: document.getElementById("plannedDateInput"),
  publishDateInput: document.getElementById("publishDateInput"),
  platformInput: document.getElementById("platformInput"),
  responsibleInput: document.getElementById("responsibleInput"),
  priorityInput: document.getElementById("priorityInput"),
  descriptionInput: document.getElementById("descriptionInput"),
  referencesInput: document.getElementById("referencesInput")
};

function escapeHtml(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function toIsoDate(date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function startOfWeek(date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function debounce(fn, wait = 280) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

async function api(path, options = {}) {
  const response = await fetch(`${BACKEND}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data.data ?? data;
}

function getWeekDates() {
  return Array.from({ length: 7 }, (_, index) => addDays(state.weekStart, index));
}

function currentMonthValue() {
  if (state.filters.month) return state.filters.month;
  return toIsoDate(new Date()).slice(0, 7);
}

function syncMonthFromWeek() {
  const middle = addDays(state.weekStart, 3);
  state.filters.month = toIsoDate(middle).slice(0, 7);
  els.monthFilter.value = state.filters.month;
}

function optionHtml(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function renderSelects() {
  els.clientFilter.innerHTML = optionHtml("", "Todos os clientes") + state.clients.map((client) => (
    optionHtml(client.id, client.name, client.id === state.filters.clientId)
  )).join("");

  els.clientInput.innerHTML = optionHtml("", "Selecionar preset") + state.clients.map((client) => (
    optionHtml(client.id, client.name)
  )).join("");

  const typeOptions = Object.entries(TYPE_LABELS).map(([value, label]) => optionHtml(value, label));
  els.typeFilter.innerHTML = optionHtml("", "Todos") + typeOptions.join("");
  els.typeInput.innerHTML = typeOptions.join("");

  const statusOptions = Object.entries(STATUS_LABELS).map(([value, label]) => optionHtml(value, label));
  els.statusFilter.innerHTML = optionHtml("", "Todos") + statusOptions.join("");
  els.statusInput.innerHTML = statusOptions.join("");
}

function renderWeekNav() {
  const days = getWeekDates();
  els.monthLabel.textContent = currentMonthValue().split("-").reverse().join("/");
  els.weekDays.innerHTML = days.map((date) => `
    <div class="week-day">
      <strong>${date.getDate()}</strong>
      <span>${WEEKDAY_LABELS[date.getDay()]}</span>
    </div>
  `).join("");
}

function visibleDemands() {
  return state.demands;
}

function clientsForCalendar() {
  const byId = new Map(state.clients.map((client) => [client.id, client]));
  visibleDemands().forEach((demand) => {
    if (!byId.has(demand.clientId)) {
      byId.set(demand.clientId, { id: demand.clientId, name: demand.clientName || demand.clientId });
    }
  });

  const list = [...byId.values()];
  if (state.filters.clientId) {
    return list.filter((client) => client.id === state.filters.clientId);
  }

  return list.length ? list : [{ id: "geral", name: "Todos os clientes" }];
}

function cardHtml(demand) {
  const typeLabel = TYPE_LABELS[demand.type] || demand.type;
  const statusLabel = STATUS_LABELS[demand.status] || demand.status;
  const priorityClass = demand.priority === "urgent" || demand.priority === "high" ? `priority-${demand.priority}` : "";

  return `
    <article class="demand-card type-${escapeHtml(demand.type)}" draggable="true" data-demand-id="${escapeHtml(demand.id)}">
      <div class="card-title ${priorityClass}" title="${escapeHtml(demand.title)}">${escapeHtml(demand.title)}</div>
      <div class="card-meta">
        <span>${escapeHtml(TYPE_ICONS[demand.type] || "D")} ${escapeHtml(typeLabel)}</span>
        <span class="status-pill">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="card-footer">
        <span title="${escapeHtml(demand.clientName)}">${escapeHtml(demand.clientName)}</span>
        <span title="${escapeHtml(demand.platform || "")}">${escapeHtml(demand.platform || "Sem plataforma")}</span>
      </div>
      <div class="card-actions">
        <button class="mini-action" type="button" data-card-action="studio">Studio</button>
        <button class="mini-action" type="button" data-card-action="canvas">Canvas</button>
        <button class="mini-action" type="button" data-card-action="script">Roteiro</button>
        <button class="mini-action" type="button" data-card-action="art">Arte</button>
        <button class="mini-action" type="button" data-card-action="publish">Publicado</button>
      </div>
    </article>
  `;
}

function renderCalendar() {
  const days = getWeekDates().map(toIsoDate);
  const clients = clientsForCalendar();
  const demands = visibleDemands();

  els.calendarGrid.innerHTML = clients.map((client) => {
    const cells = days.map((day) => {
      const items = demands.filter((demand) => demand.clientId === client.id && (demand.plannedDate || demand.publishDate) === day);
      return `<div class="calendar-cell" data-date="${day}" data-client-id="${escapeHtml(client.id)}">${items.map(cardHtml).join("")}</div>`;
    }).join("");

    return `
      <div class="client-row">
        <div class="client-label">${escapeHtml(client.name)}</div>
        ${cells}
      </div>
    `;
  }).join("") || `<div class="empty-state">Nenhuma demanda no periodo.</div>`;
}

function renderKanban() {
  const demands = visibleDemands();
  els.kanbanBoard.innerHTML = Object.entries(STATUS_LABELS).map(([status, label]) => {
    const cards = demands.filter((demand) => demand.status === status);
    return `
      <section class="kanban-column" data-status="${status}">
        <header>
          <h3>${escapeHtml(label)}</h3>
          <span class="kanban-count">${cards.length}</span>
        </header>
        <div class="kanban-cards">${cards.map(cardHtml).join("") || `<div class="empty-state">Vazio</div>`}</div>
      </section>
    `;
  }).join("");
}

function renderAll() {
  renderSelects();
  renderWeekNav();
  renderCalendar();
  renderKanban();
}

function collectFilters() {
  state.filters.clientId = els.clientFilter.value;
  state.filters.type = els.typeFilter.value;
  state.filters.status = els.statusFilter.value;
  state.filters.responsible = els.responsibleFilter.value.trim();
  state.filters.platform = els.platformFilter.value.trim();
  state.filters.month = els.monthFilter.value;
  state.filters.search = els.searchFilter.value.trim();
}

async function loadPlanner() {
  collectFilters();
  const params = new URLSearchParams();
  Object.entries(state.filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  if (!params.has("month")) params.set("month", currentMonthValue());

  const [meta, demands] = await Promise.all([
    api("/api/production/meta"),
    api(`/api/production/demands?${params.toString()}`)
  ]);

  state.clients = meta.clients || [];
  state.demands = demands || [];
  renderAll();
}

function openDemandDialog(demand = null, defaults = {}) {
  const isEdit = Boolean(demand?.id);
  const selectedClient = demand?.clientId || defaults.clientId || "";
  const client = state.clients.find((item) => item.id === selectedClient);

  els.dialogTitle.textContent = isEdit ? "Editar demanda" : "Nova demanda";
  els.demandId.value = demand?.id || "";
  els.titleInput.value = demand?.title || "";
  els.clientInput.value = selectedClient;
  els.clientNameInput.value = demand?.clientName || client?.name || defaults.clientName || "";
  els.typeInput.value = demand?.type || "feed";
  els.statusInput.value = demand?.status || "idea";
  els.plannedDateInput.value = demand?.plannedDate || defaults.plannedDate || toIsoDate(new Date());
  els.publishDateInput.value = demand?.publishDate || "";
  els.platformInput.value = demand?.platform || "";
  els.responsibleInput.value = demand?.responsible || "";
  els.priorityInput.value = demand?.priority || "normal";
  els.descriptionInput.value = demand?.description || "";
  els.referencesInput.value = Array.isArray(demand?.references) ? demand.references.join("\n") : "";
  els.deleteDemandBtn.hidden = !isEdit;

  els.demandDialog.showModal();
  els.titleInput.focus();
}

function formPayload() {
  const selectedClient = state.clients.find((client) => client.id === els.clientInput.value);
  const clientName = els.clientNameInput.value.trim() || selectedClient?.name || "Cliente geral";

  return {
    clientId: els.clientInput.value || clientName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cliente-geral",
    clientName,
    title: els.titleInput.value.trim(),
    type: els.typeInput.value,
    status: els.statusInput.value,
    plannedDate: els.plannedDateInput.value,
    publishDate: els.publishDateInput.value,
    platform: els.platformInput.value.trim(),
    responsible: els.responsibleInput.value.trim(),
    priority: els.priorityInput.value,
    description: els.descriptionInput.value.trim(),
    references: els.referencesInput.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  };
}

async function saveDemand() {
  const id = els.demandId.value;
  const payload = formPayload();
  if (!payload.title) return;

  if (id) {
    await api(`/api/production/demands/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  } else {
    await api("/api/production/demands", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  els.demandDialog.close();
  await loadPlanner();
}

async function deleteDemand() {
  const id = els.demandId.value;
  if (!id) return;
  await api(`/api/production/demands/${encodeURIComponent(id)}`, { method: "DELETE" });
  els.demandDialog.close();
  await loadPlanner();
}

async function moveDemand(id, status) {
  await api(`/api/production/demands/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
  const demand = state.demands.find((item) => item.id === id);
  if (demand) demand.status = status;
  renderAll();
}

async function publishDemand(id) {
  await api(`/api/production/demands/${encodeURIComponent(id)}/publish`, { method: "POST" });
  await loadPlanner();
}

function findDemandFromEvent(event) {
  const card = event.target.closest?.(".demand-card");
  if (!card) return null;
  return state.demands.find((demand) => demand.id === card.dataset.demandId) || null;
}

function bindEvents() {
  const debouncedLoad = debounce(loadPlanner);
  [els.clientFilter, els.typeFilter, els.statusFilter, els.monthFilter].forEach((element) => {
    element.addEventListener("change", () => {
      if (element === els.monthFilter && element.value) {
        state.weekStart = startOfWeek(new Date(`${element.value}-01T12:00:00`));
      }
      void loadPlanner();
    });
  });
  [els.responsibleFilter, els.platformFilter, els.searchFilter].forEach((element) => {
    element.addEventListener("input", debouncedLoad);
  });

  els.prevWeekBtn.addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, -7);
    syncMonthFromWeek();
    void loadPlanner();
  });

  els.nextWeekBtn.addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, 7);
    syncMonthFromWeek();
    void loadPlanner();
  });

  els.refreshBtn.addEventListener("click", () => loadPlanner());
  els.newDemandBtn.addEventListener("click", () => openDemandDialog());
  els.closeDialogBtn.addEventListener("click", () => els.demandDialog.close());
  els.cancelDialogBtn.addEventListener("click", () => els.demandDialog.close());
  els.deleteDemandBtn.addEventListener("click", () => deleteDemand());
  els.clientInput.addEventListener("change", () => {
    const client = state.clients.find((item) => item.id === els.clientInput.value);
    if (client && !els.clientNameInput.value.trim()) els.clientNameInput.value = client.name;
  });

  els.demandForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveDemand();
  });

  document.addEventListener("click", (event) => {
    const action = event.target.closest?.("[data-card-action]")?.dataset.cardAction;
    const demand = findDemandFromEvent(event);
    if (action && demand) {
      event.stopPropagation();
      if (action === "publish") void publishDemand(demand.id);
      if (action === "studio") window.kitAPI?.openStudio?.();
      if (action === "canvas" || action === "art") window.kitAPI?.openCanvas?.();
      if (action === "script") window.kitAPI?.openStudio?.();
      return;
    }

    if (demand) openDemandDialog(demand);
  });

  document.addEventListener("dragstart", (event) => {
    const card = event.target.closest?.(".demand-card");
    if (!card) return;
    event.dataTransfer.setData("text/plain", card.dataset.demandId);
    event.dataTransfer.effectAllowed = "move";
  });

  els.kanbanBoard.addEventListener("dragover", (event) => {
    const column = event.target.closest?.(".kanban-column");
    if (!column) return;
    event.preventDefault();
    column.classList.add("is-over");
  });

  els.kanbanBoard.addEventListener("dragleave", (event) => {
    event.target.closest?.(".kanban-column")?.classList.remove("is-over");
  });

  els.kanbanBoard.addEventListener("drop", (event) => {
    const column = event.target.closest?.(".kanban-column");
    if (!column) return;
    event.preventDefault();
    column.classList.remove("is-over");
    const id = event.dataTransfer.getData("text/plain");
    const status = column.dataset.status;
    if (id && status) void moveDemand(id, status);
  });

  els.calendarGrid.addEventListener("dblclick", (event) => {
    const cell = event.target.closest?.(".calendar-cell");
    if (!cell) return;
    const client = state.clients.find((item) => item.id === cell.dataset.clientId);
    openDemandDialog(null, {
      clientId: cell.dataset.clientId,
      clientName: client?.name || "",
      plannedDate: cell.dataset.date
    });
  });
}

async function boot() {
  state.filters.month = toIsoDate(new Date()).slice(0, 7);
  els.monthFilter.value = state.filters.month;
  state.weekStart = startOfWeek(new Date());
  renderSelects();
  bindEvents();
  await loadPlanner();
}

void boot();
