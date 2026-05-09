const state = {
  meta: null,
  activeType: "client",
  currentPreset: null,
  currentFilePath: null,
  lists: {},
  validation: null,
  dirty: false
};

const elements = {
  typeTabs: document.getElementById("typeTabs"),
  statusBadge: document.getElementById("statusBadge"),
  fileList: document.getElementById("fileList"),
  listTitle: document.getElementById("listTitle"),
  listMeta: document.getElementById("listMeta"),
  editorTitle: document.getElementById("editorTitle"),
  editorMeta: document.getElementById("editorMeta"),
  dirtyBadge: document.getElementById("dirtyBadge"),
  validationBox: document.getElementById("validationBox"),
  formRoot: document.getElementById("formRoot"),
  summaryRoot: document.getElementById("summaryRoot"),
  summaryType: document.getElementById("summaryType"),
  newBtn: document.getElementById("newBtn"),
  loadBtn: document.getElementById("loadBtn"),
  duplicateBtn: document.getElementById("duplicateBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  validateBtn: document.getElementById("validateBtn"),
  saveBtn: document.getElementById("saveBtn"),
  saveAsBtn: document.getElementById("saveAsBtn")
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getTypeMeta(type = state.activeType) {
  return state.meta?.types?.[type] || null;
}

function getIn(target, path) {
  return String(path || "").split(".").reduce((acc, key) => acc?.[key], target);
}

function setIn(target, path, value) {
  const keys = String(path || "").split(".");
  let cursor = target;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
      return;
    }
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  });
}

function markDirty(nextDirty = true) {
  state.dirty = nextDirty;
  elements.dirtyBadge.classList.toggle("hidden", !nextDirty);
}

function setStatus(text, tone = "neutral") {
  elements.statusBadge.textContent = text;
  elements.statusBadge.style.color = tone === "error"
    ? "var(--danger)"
    : tone === "success"
      ? "var(--success)"
      : "var(--muted)";
}

function withFriendlyError(error, fallback) {
  return error?.message || fallback;
}

function makeLocalDuplicate() {
  const duplicated = clone(state.currentPreset);
  const baseName = String(duplicated?.name || getTypeMeta()?.title || "preset").trim();
  duplicated.name = baseName ? `${baseName} Copia` : "Preset Copia";
  duplicated.id = slugify(duplicated.name, `${state.activeType}-copia`);
  return duplicated;
}

function slugify(value, fallback = "preset") {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || fallback;
}

function hasUnsavedChanges() {
  return state.dirty;
}

function confirmDiscard() {
  if (!hasUnsavedChanges()) {
    return true;
  }
  return window.confirm("Existem alteracoes nao salvas. Deseja continuar e perder essas alteracoes?");
}

function renderTabs() {
  const tabs = [
    { type: "client", label: "Clientes" },
    { type: "style", label: "Estilos IA" },
    { type: "format", label: "Formatos" }
  ];

  elements.typeTabs.innerHTML = tabs.map((tab) => `
    <button class="type-tab ${tab.type === state.activeType ? "is-active" : ""}" data-type-tab="${tab.type}" type="button">${tab.label}</button>
  `).join("");

  elements.typeTabs.querySelectorAll("[data-type-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextType = button.dataset.typeTab;
      if (nextType === state.activeType) {
        return;
      }
      if (!confirmDiscard()) {
        return;
      }
      await switchType(nextType);
    });
  });
}

function renderList() {
  const typeMeta = getTypeMeta();
  const items = state.lists[state.activeType] || [];
  elements.listTitle.textContent = typeMeta?.title || "Arquivos";
  elements.listMeta.textContent = `${items.length} ${items.length === 1 ? "item" : "itens"}`;

  if (!items.length) {
    elements.fileList.innerHTML = "<div class='empty-state'>Nenhum preset salvo para este tipo.</div>";
    return;
  }

  elements.fileList.innerHTML = items.map((item) => `
    <button class="file-card ${item.filePath === state.currentFilePath ? "is-active" : ""}" type="button" data-open-file="${escapeAttr(item.filePath)}">
      <strong>${escapeHtml(item.name || item.fileName || "Sem nome")}</strong>
      <small>${escapeHtml(item.id || item.fileName || "")}</small>
      <small>${escapeHtml(item.description || "")}</small>
      ${item.invalid ? "<small style='color: var(--danger);'>Arquivo invalido</small>" : ""}
    </button>
  `).join("");

  elements.fileList.querySelectorAll("[data-open-file]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmDiscard()) {
        return;
      }
      await openPresetFromPath(button.dataset.openFile);
    });
  });
}

function renderValidation() {
  const validation = state.validation;
  if (!validation) {
    elements.validationBox.className = "validation-box hidden";
    elements.validationBox.innerHTML = "";
    return;
  }

  const isSuccess = validation.valid;
  elements.validationBox.className = `validation-box ${isSuccess ? "is-success" : "is-error"}`;
  elements.validationBox.innerHTML = isSuccess
    ? "<strong>Preset valido.</strong><div class='muted'>O schema, type e estrutura estao consistentes.</div>"
    : `<strong>Erros de validacao</strong><ul>${validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`;
}

function renderEditorMeta() {
  const typeMeta = getTypeMeta();
  elements.editorTitle.textContent = state.currentPreset?.name || typeMeta?.subtitle || "Preset";
  elements.editorMeta.textContent = state.currentFilePath || "Sem arquivo selecionado";
  elements.summaryType.textContent = typeMeta?.subtitle || "-";
}

function renderSummary() {
  const preset = state.currentPreset;
  if (!preset) {
    elements.summaryRoot.innerHTML = "<div class='empty-state'>Selecione ou crie um preset para visualizar o resumo.</div>";
    return;
  }

  const summaryCards = [
    {
      title: "Arquivo",
      lines: [
        `Tipo: ${preset.type || "-"}`,
        `Schema: ${preset.schemaVersion || "-"}`,
        `ID: ${preset.id || "-"}`,
        `Nome: ${preset.name || "-"}`
      ]
    }
  ];

  if (state.activeType === "client") {
    summaryCards.push(
      {
        title: "Marca",
        lines: [
          `Segmento: ${preset.segment || "-"}`,
          `Tom: ${preset.voice?.tone || "-"}`,
          `Oferta: ${preset.commercial?.mainOffer || "-"}`
        ]
      },
      {
        title: "Assets",
        pills: [
          `logos: ${(preset.assets?.logoFiles || []).length}`,
          `referencias: ${(preset.assets?.referenceImages || []).length}`,
          `arquivos: ${(preset.assets?.brandFiles || []).length}`
        ]
      }
    );
  }

  if (state.activeType === "style") {
    summaryCards.push(
      {
        title: "Pipelines",
        lines: [
          `Imagem: ${preset.imagePipeline?.model || "-"}`,
          `Video: ${preset.videoPipeline?.model || "-"}`,
          `Preview: ${preset.previewImage || "-"}`
        ]
      },
      {
        title: "Compatibilidade",
        pills: [
          ...(preset.compatibility?.goals || []),
          ...(preset.compatibility?.funnels || []),
          ...(preset.compatibility?.mediaTypes || [])
        ].slice(0, 8)
      }
    );
  }

  if (state.activeType === "format") {
    summaryCards.push(
      {
        title: "Midia",
        lines: [
          `Plataforma: ${preset.platform || "-"}`,
          `Tipo: ${preset.mediaType || "-"}`,
          `Aspect Ratio: ${preset.aspectRatio || "-"}`,
          `Tamanho: ${preset.width || 0} x ${preset.height || 0}`
        ]
      },
      {
        title: "Slides",
        lines: [
          `Padrao: ${preset.defaultSlides}`,
          `Minimo: ${preset.minSlides}`,
          `Maximo: ${preset.maxSlides}`
        ]
      }
    );
  }

  elements.summaryRoot.innerHTML = summaryCards.map((card) => `
    <section class="summary-card">
      <strong>${escapeHtml(card.title)}</strong>
      ${(card.lines || []).map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
      ${card.pills?.length ? `<div class="summary-list">${card.pills.map((pill) => `<span class="mini-pill">${escapeHtml(pill)}</span>`).join("")}</div>` : ""}
    </section>
  `).join("");
}

function renderField(path, meta) {
  const value = getIn(state.currentPreset, path);
  const wide = meta.kind === "textarea" || meta.kind.endsWith("-array") || meta.kind === "lora-array";
  const label = meta.label || path;

  if (meta.kind === "textarea") {
    return `
      <div class="field is-wide">
        <label for="${escapeAttr(path)}">${escapeHtml(label)}</label>
        <textarea id="${escapeAttr(path)}" data-field-path="${escapeAttr(path)}" placeholder="${escapeAttr(meta.placeholder || "")}">${escapeHtml(value || "")}</textarea>
      </div>
    `;
  }

  if (meta.kind === "number") {
    return `
      <div class="field">
        <label for="${escapeAttr(path)}">${escapeHtml(label)}</label>
        <input id="${escapeAttr(path)}" data-field-path="${escapeAttr(path)}" type="number" min="${meta.min ?? ""}" max="${meta.max ?? ""}" step="${meta.step ?? "1"}" value="${escapeAttr(String(value ?? ""))}">
      </div>
    `;
  }

  if (meta.kind === "file") {
    const showColor = /Color$/i.test(path);
    const colorValue = typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
    return `
      <div class="field ${showColor ? "" : "is-wide"}">
        <label>${escapeHtml(label)}</label>
        <div class="${showColor ? "color-line" : "field-inline"}">
          <input data-field-path="${escapeAttr(path)}" type="text" value="${escapeAttr(value || "")}" placeholder="${escapeAttr(meta.placeholder || "")}">
          <button class="btn btn-secondary" type="button" data-select-single="${escapeAttr(path)}" data-selection="${escapeAttr(meta.selection || "file")}">Selecionar Arquivo</button>
          ${showColor ? `<input data-color-path="${escapeAttr(path)}" type="color" value="${escapeAttr(colorValue)}">` : ""}
        </div>
      </div>
    `;
  }

  if (meta.kind === "string-array" || meta.kind === "file-array") {
    const items = Array.isArray(value) ? value : [];
    return `
      <div class="${meta.kind === "file-array" ? "lora-editor" : "array-editor"}">
        <div class="array-head">
          <label>${escapeHtml(label)}</label>
          <button class="btn btn-secondary" type="button" data-array-add="${escapeAttr(path)}">Adicionar item</button>
        </div>
        <div>
          ${items.length
            ? items.map((item, index) => `
              <div class="array-item">
                <div class="${meta.kind === "file-array" ? "field-inline triple" : "field-inline"}">
                  <input type="text" data-array-item="${escapeAttr(path)}" data-index="${index}" value="${escapeAttr(item || "")}">
                  ${meta.kind === "file-array"
                    ? `<button class="btn btn-secondary" type="button" data-array-select="${escapeAttr(path)}" data-index="${index}" data-selection="${escapeAttr(meta.selection || "file")}">Selecionar Arquivo</button>`
                    : ""}
                  <button class="btn btn-danger" type="button" data-array-remove="${escapeAttr(path)}" data-index="${index}">Remover</button>
                </div>
              </div>
            `).join("")
            : "<div class='empty-state'>Nenhum item cadastrado.</div>"}
        </div>
      </div>
    `;
  }

  if (meta.kind === "lora-array") {
    const items = Array.isArray(value) ? value : [];
    return `
      <div class="lora-editor">
        <div class="array-head">
          <label>${escapeHtml(label)}</label>
          <button class="btn btn-secondary" type="button" data-lora-add="${escapeAttr(path)}">Adicionar LoRA</button>
        </div>
        <div>
          ${items.length
            ? items.map((item, index) => `
              <div class="lora-card">
                <div class="lora-grid">
                  <div class="field">
                    <label>Nome</label>
                    <input type="text" data-lora-field="${escapeAttr(path)}" data-index="${index}" data-key="name" value="${escapeAttr(item?.name || "")}">
                  </div>
                  <div class="field">
                    <label>Path</label>
                    <input type="text" data-lora-field="${escapeAttr(path)}" data-index="${index}" data-key="path" value="${escapeAttr(item?.path || "")}">
                  </div>
                  <div class="field">
                    <label>Peso</label>
                    <input type="number" step="0.01" data-lora-field="${escapeAttr(path)}" data-index="${index}" data-key="weight" value="${escapeAttr(String(item?.weight ?? 1))}">
                  </div>
                </div>
                <div class="item-actions">
                  <button class="btn btn-secondary" type="button" data-lora-select="${escapeAttr(path)}" data-index="${index}">Selecionar Arquivo</button>
                  <button class="btn btn-danger" type="button" data-lora-remove="${escapeAttr(path)}" data-index="${index}">Remover</button>
                </div>
              </div>
            `).join("")
            : "<div class='empty-state'>Nenhuma LoRA cadastrada.</div>"}
        </div>
      </div>
    `;
  }

  const showColor = /Color$/i.test(path);
  return `
    <div class="field ${showColor ? "" : ""}">
      <label for="${escapeAttr(path)}">${escapeHtml(label)}</label>
      <div class="${showColor ? "color-line" : ""}">
        <input id="${escapeAttr(path)}" data-field-path="${escapeAttr(path)}" type="text" value="${escapeAttr(value || "")}" placeholder="${escapeAttr(meta.placeholder || "")}">
        ${showColor ? `<input data-color-path="${escapeAttr(path)}" type="color" value="${escapeAttr(typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000")}">` : ""}
      </div>
    </div>
  `;
}

function renderForm() {
  const typeMeta = getTypeMeta();
  if (!state.currentPreset || !typeMeta) {
    elements.formRoot.innerHTML = "<div class='empty-state'>Nenhum preset selecionado.</div>";
    return;
  }

  elements.formRoot.innerHTML = typeMeta.sections.map((section) => `
    <details class="section-card" open>
      <summary>${escapeHtml(section.title)}</summary>
      <div class="section-content">
        <div class="field-grid">
          ${section.fields.map((fieldPath) => renderField(fieldPath, typeMeta.fields[fieldPath] || { label: fieldPath, kind: "text" })).join("")}
        </div>
      </div>
    </details>
  `).join("");

  bindFormEvents();
}

function bindFormEvents() {
  elements.formRoot.querySelectorAll("[data-field-path]").forEach((input) => {
    input.addEventListener("input", () => {
      const path = input.dataset.fieldPath;
      const fieldMeta = getTypeMeta().fields[path];
      const nextValue = fieldMeta?.kind === "number" ? Number(input.value || 0) : input.value;
      setIn(state.currentPreset, path, nextValue);
      markDirty(true);
      state.validation = null;
      renderEditorMeta();
      renderSummary();
    });
  });

  elements.formRoot.querySelectorAll("[data-color-path]").forEach((input) => {
    input.addEventListener("input", () => {
      const path = input.dataset.colorPath;
      setIn(state.currentPreset, path, input.value);
      markDirty(true);
      state.validation = null;
      renderForm();
      renderSummary();
    });
  });

  elements.formRoot.querySelectorAll("[data-select-single]").forEach((button) => {
    button.addEventListener("click", async () => {
      const selected = await window.kitAPI?.selectPresetAsset?.({
        selection: button.dataset.selection || "file",
        multiple: false
      });
      if (!selected) {
        return;
      }
      setIn(state.currentPreset, button.dataset.selectSingle, selected);
      markDirty(true);
      renderForm();
      renderSummary();
    });
  });

  elements.formRoot.querySelectorAll("[data-array-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const list = Array.isArray(getIn(state.currentPreset, button.dataset.arrayAdd))
        ? [...getIn(state.currentPreset, button.dataset.arrayAdd)]
        : [];
      list.push("");
      setIn(state.currentPreset, button.dataset.arrayAdd, list);
      markDirty(true);
      renderForm();
      renderSummary();
    });
  });

  elements.formRoot.querySelectorAll("[data-array-item]").forEach((input) => {
    input.addEventListener("input", () => {
      const path = input.dataset.arrayItem;
      const list = Array.isArray(getIn(state.currentPreset, path)) ? [...getIn(state.currentPreset, path)] : [];
      list[Number(input.dataset.index)] = input.value;
      setIn(state.currentPreset, path, list);
      markDirty(true);
      state.validation = null;
      renderSummary();
    });
  });

  elements.formRoot.querySelectorAll("[data-array-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.dataset.arrayRemove;
      const list = Array.isArray(getIn(state.currentPreset, path)) ? [...getIn(state.currentPreset, path)] : [];
      list.splice(Number(button.dataset.index), 1);
      setIn(state.currentPreset, path, list);
      markDirty(true);
      renderForm();
      renderSummary();
    });
  });

  elements.formRoot.querySelectorAll("[data-array-select]").forEach((button) => {
    button.addEventListener("click", async () => {
      const selected = await window.kitAPI?.selectPresetAsset?.({
        selection: button.dataset.selection || "file",
        multiple: false
      });
      if (!selected) {
        return;
      }
      const path = button.dataset.arraySelect;
      const list = Array.isArray(getIn(state.currentPreset, path)) ? [...getIn(state.currentPreset, path)] : [];
      list[Number(button.dataset.index)] = selected;
      setIn(state.currentPreset, path, list);
      markDirty(true);
      renderForm();
      renderSummary();
    });
  });

  elements.formRoot.querySelectorAll("[data-lora-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const list = Array.isArray(getIn(state.currentPreset, button.dataset.loraAdd))
        ? [...getIn(state.currentPreset, button.dataset.loraAdd)]
        : [];
      list.push({ name: "", path: "", weight: 1 });
      setIn(state.currentPreset, button.dataset.loraAdd, list);
      markDirty(true);
      renderForm();
      renderSummary();
    });
  });

  elements.formRoot.querySelectorAll("[data-lora-field]").forEach((input) => {
    input.addEventListener("input", () => {
      const path = input.dataset.loraField;
      const index = Number(input.dataset.index);
      const key = input.dataset.key;
      const list = Array.isArray(getIn(state.currentPreset, path)) ? clone(getIn(state.currentPreset, path)) : [];
      list[index] = list[index] || { name: "", path: "", weight: 1 };
      list[index][key] = key === "weight" ? Number(input.value || 1) : input.value;
      setIn(state.currentPreset, path, list);
      markDirty(true);
      state.validation = null;
      renderSummary();
    });
  });

  elements.formRoot.querySelectorAll("[data-lora-select]").forEach((button) => {
    button.addEventListener("click", async () => {
      const selected = await window.kitAPI?.selectPresetAsset?.({
        selection: "file",
        multiple: false
      });
      if (!selected) {
        return;
      }
      const path = button.dataset.loraSelect;
      const index = Number(button.dataset.index);
      const list = Array.isArray(getIn(state.currentPreset, path)) ? clone(getIn(state.currentPreset, path)) : [];
      list[index] = list[index] || { name: "", path: "", weight: 1 };
      list[index].path = selected;
      list[index].name = list[index].name || selected.split(/[\\/]/).pop() || "";
      setIn(state.currentPreset, path, list);
      markDirty(true);
      renderForm();
      renderSummary();
    });
  });

  elements.formRoot.querySelectorAll("[data-lora-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.dataset.loraRemove;
      const list = Array.isArray(getIn(state.currentPreset, path)) ? clone(getIn(state.currentPreset, path)) : [];
      list.splice(Number(button.dataset.index), 1);
      setIn(state.currentPreset, path, list);
      markDirty(true);
      renderForm();
      renderSummary();
    });
  });
}

function renderAll() {
  renderTabs();
  renderList();
  renderEditorMeta();
  renderValidation();
  renderForm();
  renderSummary();
  elements.duplicateBtn.disabled = !state.currentPreset;
  elements.deleteBtn.disabled = !state.currentPreset;
}

async function refreshList() {
  const response = await window.kitAPI?.listPresets?.(state.activeType);
  state.lists[state.activeType] = response?.items || [];
}

async function createNewPreset() {
  const created = await window.kitAPI?.createPreset?.(state.activeType);
  state.currentPreset = clone(created?.preset || {});
  state.currentFilePath = null;
  state.validation = null;
  markDirty(false);
  renderAll();
  setStatus("Novo preset pronto para edicao.");
}

async function openPresetFromPath(filePath) {
  try {
    setStatus("Carregando preset...");
    const loaded = await window.kitAPI?.openPreset?.({
      type: state.activeType,
      filePath
    });
    if (!loaded) {
      setStatus("Carregamento cancelado.");
      return;
    }
    state.currentPreset = clone(loaded.preset);
    state.currentFilePath = loaded.filePath || null;
    state.validation = null;
    markDirty(false);
    renderAll();
    setStatus("Preset carregado com sucesso.", "success");
  } catch (error) {
    setStatus(withFriendlyError(error, "Falha ao carregar preset."), "error");
    state.validation = {
      valid: false,
      errors: [withFriendlyError(error, "Falha ao carregar preset.")]
    };
    renderValidation();
  }
}

async function switchType(type) {
  state.activeType = type;
  await refreshList();
  await createNewPreset();
}

async function handleLoad() {
  if (!confirmDiscard()) {
    return;
  }

  try {
    const loaded = await window.kitAPI?.openPreset?.({
      type: state.activeType
    });
    if (!loaded) {
      setStatus("Carregamento cancelado.");
      return;
    }
    state.currentPreset = clone(loaded.preset);
    state.currentFilePath = loaded.filePath || null;
    state.validation = null;
    markDirty(false);
    await refreshList();
    renderAll();
    setStatus("Arquivo carregado.", "success");
  } catch (error) {
    state.validation = {
      valid: false,
      errors: [withFriendlyError(error, "Falha ao carregar arquivo.")]
    };
    renderValidation();
    setStatus(withFriendlyError(error, "Falha ao carregar arquivo."), "error");
  }
}

async function handleValidate() {
  if (!state.currentPreset) {
    return;
  }

  const validation = await window.kitAPI?.validatePreset?.({
    type: state.activeType,
    preset: state.currentPreset
  });
  state.validation = validation;
  renderValidation();
  setStatus(validation?.valid ? "Preset valido." : "Foram encontrados erros de validacao.", validation?.valid ? "success" : "error");
}

async function handleSave(saveAs = false) {
  if (!state.currentPreset) {
    return;
  }

  try {
    setStatus(saveAs ? "Salvando preset como..." : "Salvando preset...");
    const response = saveAs
      ? await window.kitAPI?.savePresetAs?.({
        type: state.activeType,
        preset: state.currentPreset,
        suggestedName: state.currentPreset?.name || state.currentPreset?.id || state.activeType
      })
      : await window.kitAPI?.savePreset?.({
        type: state.activeType,
        preset: state.currentPreset,
        filePath: state.currentFilePath
      });

    if (!response) {
      setStatus("Salvamento cancelado.");
      return;
    }

    state.currentPreset = clone(response.preset);
    state.currentFilePath = response.filePath;
    state.validation = {
      valid: true,
      errors: [],
      normalized: clone(response.preset)
    };
    markDirty(false);
    await refreshList();
    renderAll();
    setStatus("Preset salvo com sucesso.", "success");
  } catch (error) {
    state.validation = {
      valid: false,
      errors: [withFriendlyError(error, "Falha ao salvar preset.")]
    };
    renderValidation();
    setStatus(withFriendlyError(error, "Falha ao salvar preset."), "error");
  }
}

async function handleDuplicate() {
  if (!state.currentPreset) {
    return;
  }

  try {
    if (state.currentFilePath) {
      const duplicated = await window.kitAPI?.duplicatePreset?.({
        type: state.activeType,
        filePath: state.currentFilePath
      });
      state.currentPreset = clone(duplicated.preset);
      state.currentFilePath = duplicated.filePath;
      state.validation = null;
      markDirty(false);
      await refreshList();
      renderAll();
      setStatus("Preset duplicado com novo ID.", "success");
      return;
    }

    state.currentPreset = makeLocalDuplicate();
    state.currentFilePath = null;
    state.validation = null;
    markDirty(true);
    renderAll();
    setStatus("Copia local criada. Salve para persistir o novo arquivo.");
  } catch (error) {
    setStatus(withFriendlyError(error, "Falha ao duplicar preset."), "error");
  }
}

async function handleDelete() {
  if (!state.currentPreset) {
    return;
  }

  if (state.currentFilePath) {
    const confirmed = window.confirm("Deseja excluir permanentemente este arquivo de preset?");
    if (!confirmed) {
      return;
    }
    try {
      await window.kitAPI?.deletePreset?.({
        type: state.activeType,
        filePath: state.currentFilePath
      });
      await refreshList();
      await createNewPreset();
      setStatus("Preset excluido.", "success");
    } catch (error) {
      setStatus(withFriendlyError(error, "Falha ao excluir preset."), "error");
    }
    return;
  }

  if (!window.confirm("Descartar o preset atual nao salvo?")) {
    return;
  }
  await createNewPreset();
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value = "") {
  return escapeHtml(String(value || ""));
}

function bindActions() {
  elements.newBtn.addEventListener("click", async () => {
    if (!confirmDiscard()) {
      return;
    }
    await createNewPreset();
  });
  elements.loadBtn.addEventListener("click", handleLoad);
  elements.validateBtn.addEventListener("click", handleValidate);
  elements.saveBtn.addEventListener("click", async () => handleSave(false));
  elements.saveAsBtn.addEventListener("click", async () => handleSave(true));
  elements.duplicateBtn.addEventListener("click", handleDuplicate);
  elements.deleteBtn.addEventListener("click", handleDelete);
}

async function init() {
  bindActions();
  setStatus("Carregando schemas oficiais...");
  state.meta = await window.kitAPI?.getPresetManagerMeta?.();
  if (!state.meta?.types) {
    throw new Error("Nao foi possivel carregar os schemas oficiais do Gerenciador de Presets.");
  }
  await switchType(state.activeType);
  setStatus("Gerenciador pronto.", "success");
}

init().catch((error) => {
  state.validation = {
    valid: false,
    errors: [withFriendlyError(error, "Falha ao iniciar o Gerenciador de Presets.")]
  };
  renderValidation();
  setStatus(withFriendlyError(error, "Falha ao iniciar o Gerenciador de Presets."), "error");
});
