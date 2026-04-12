import { getModels, getBundle, mutateBundle, setValueByPath } from "./config.state.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function field({ path, label, help = "", type = "text", placeholder = "", value = "" }) {
  const safeValue = type === "checkbox" ? "" : escapeHtml(value);
  if (type === "checkbox") {
    return `
      <div class="field-checkbox">
        <label>${label}</label>
        <div class="checkbox-row">
          <input data-path="${path}" data-type="checkbox" type="checkbox" ${value ? "checked" : ""}>
          <span class="field-help">${help}</span>
        </div>
      </div>
    `;
  }

  if (type === "textarea") {
    return `
      <div class="field-textarea">
        <label for="${path}">${label}</label>
        <textarea data-path="${path}" data-type="textarea" placeholder="${escapeHtml(placeholder)}">${safeValue}</textarea>
        ${help ? `<p class="field-help">${help}</p>` : ""}
      </div>
    `;
  }

  return `
    <div class="field">
      <label for="${path}">${label}</label>
      <input data-path="${path}" data-type="${type}" type="${type}" value="${safeValue}" placeholder="${escapeHtml(placeholder)}">
      ${help ? `<p class="field-help">${help}</p>` : ""}
    </div>
  `;
}

function selectField({ path, label, help = "", value = "", options = [] }) {
  return `
    <div class="field">
      <label for="${path}">${label}</label>
      <select data-path="${path}" data-type="select">
        ${options.map((option) => `
          <option value="${escapeHtml(option.value)}" ${option.value === value ? "selected" : ""}>
            ${escapeHtml(option.label)}
          </option>
        `).join("")}
      </select>
      ${help ? `<p class="field-help">${help}</p>` : ""}
    </div>
  `;
}

function renderStringList(items, meta) {
  const list = Array.isArray(items) ? items : [];
  return `
    <div class="editor-card">
      <div class="object-item-header">
        <div>
          <h3 class="section-title">${meta.title}</h3>
          <p class="section-description">${meta.description}</p>
        </div>
        <button class="btn-inline" data-action="add-string-item" data-path="${meta.path}">Adicionar</button>
      </div>
      <div class="list-editor">
        ${list.map((item, index) => `
          <div class="list-item">
            ${field({
              path: `${meta.path}.${index}`,
              label: `${meta.itemLabel} ${index + 1}`,
              value: item,
              help: meta.itemHelp
            })}
            <button class="btn-danger" data-action="remove-string-item" data-path="${meta.path}" data-index="${index}">Remover</button>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderObjectList(items, meta) {
  const list = Array.isArray(items) ? items : [];

  return `
    <div class="editor-card">
      <div class="object-item-header">
        <div>
          <h3 class="section-title">${meta.title}</h3>
          <p class="section-description">${meta.description}</p>
        </div>
        <button class="btn-inline" data-action="add-object-item" data-path="${meta.path}" data-kind="${meta.kind}">Adicionar</button>
      </div>
      <div class="object-list-editor">
        ${list.map((item, index) => `
          <div class="object-item">
            <div class="object-item-header">
              <span class="object-item-title">${escapeHtml(item?.label || item?.id || `${meta.itemTitle} ${index + 1}`)}</span>
              <button class="btn-danger" data-action="remove-object-item" data-path="${meta.path}" data-index="${index}">Remover</button>
            </div>
            <div class="form-grid">
              ${meta.fields.map((config) => {
                const value = item?.[config.key];
                return field({
                  path: `${meta.path}.${index}.${config.key}`,
                  label: config.label,
                  help: config.help,
                  type: config.type || "text",
                  value
                });
              }).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

export function renderSystemPanel(target) {
  const bundle = getBundle();
  const models = getModels();
  const modelOptions = models.length
    ? models.map((model) => ({ value: model.name, label: `${model.name} (${model.size || "N/A"})` }))
    : [{ value: bundle.config.system.aiModel, label: bundle.config.system.aiModel }];

  target.innerHTML = `
    <div class="editor-card">
      <span class="pill">Sistema</span>
      <h2 class="section-title">Sistema</h2>
      <p class="section-description">Modelo, flags principais de voz e recursos leves do backend.</p>
      <div class="form-grid">
        ${selectField({
          path: "config.system.aiModel",
          label: "Modelo de IA",
          help: "Modelo principal usado pelo backend para chamadas de LLM.",
          value: bundle.config.system.aiModel,
          options: modelOptions
        })}
        ${field({
          path: "config.system.muted",
          label: "Mutado",
          help: "Impede respostas sonoras do sistema quando aplicável.",
          type: "checkbox",
          value: bundle.config.system.muted
        })}
        ${field({
          path: "config.voice.xttsEnabled",
          label: "XTTS habilitado",
          help: "Permite leitura falada pela rota em tempo real.",
          type: "checkbox",
          value: bundle.config.voice.xttsEnabled
        })}
        ${field({
          path: "config.voice.microphoneEnabled",
          label: "Microfone habilitado",
          help: "Liga os fluxos de entrada por voz no app.",
          type: "checkbox",
          value: bundle.config.voice.microphoneEnabled
        })}
        ${field({
          path: "config.skills.randomTalk",
          label: "RandomTalk",
          help: "Permanece desligado por padrão e fora do AgentRoute.",
          type: "checkbox",
          value: bundle.config.skills.randomTalk
        })}
      </div>
    </div>
  `;
}

export function renderPersonalityPanel(target) {
  const bundle = getBundle();
  const manifest = bundle.personality.manifest;
  const base = bundle.personality.base;
  const responseModes = bundle.personality.responseModes;
  const needsMap = bundle.personality.needsMap;
  const emotionsMap = bundle.personality.emotionsMap;

  target.innerHTML = `
    <div class="editor-card">
      <span class="pill">Manifesto</span>
      <h2 class="section-title">Arquivos de Personalidade</h2>
      <p class="section-description">Fonte única de verdade para os JSONs que controlam identidade e comportamento.</p>
      <div class="form-grid">
        ${field({ path: "personality.manifest.version", label: "Versão", value: manifest.version })}
        ${field({ path: "personality.manifest.activeProfile", label: "Perfil ativo", value: manifest.activeProfile })}
        ${field({ path: "personality.manifest.files.base", label: "Arquivo base", value: manifest.files.base })}
        ${field({ path: "personality.manifest.files.responseModes", label: "Arquivo de modos", value: manifest.files.responseModes })}
        ${field({ path: "personality.manifest.files.needsMap", label: "Arquivo de needs/aura", value: manifest.files.needsMap })}
        ${field({ path: "personality.manifest.files.emotionsMap", label: "Arquivo de emoções", value: manifest.files.emotionsMap })}
      </div>
    </div>

    <div class="editor-card">
      <span class="pill">Identidade</span>
      <h2 class="section-title">Identidade da KIT</h2>
      <p class="section-description">Nome, papel, apresentação e relação-base da persona usada só na RealtimeRoute.</p>
      <div class="form-grid">
        ${field({ path: "personality.base.name", label: "Nome", value: base.name })}
        ${field({ path: "personality.base.identity.archetype", label: "Archetype", value: base.identity.archetype })}
        ${field({ path: "personality.base.identity.style", label: "Style", value: base.identity.style })}
        ${field({ path: "personality.base.identity.baseTone", label: "Base tone", value: base.identity.baseTone })}
        ${field({ path: "personality.base.identity.presentation", label: "Presentation", value: base.identity.presentation })}
        ${field({ path: "personality.base.identity.genderIdentity", label: "Gender identity", value: base.identity.genderIdentity })}
        ${field({ path: "personality.base.identity.pronouns", label: "Pronouns", value: base.identity.pronouns })}
        ${field({ path: "personality.base.identity.targetUser", label: "Target user", value: base.identity.targetUser })}
        ${field({ path: "personality.base.identity.relationship", label: "Relationship", value: base.identity.relationship })}
      </div>
    </div>

    <div class="editor-card">
      <span class="pill">Fala</span>
      <h2 class="section-title">Regras de Fala</h2>
      <p class="section-description">Flags comportamentais principais para a persona e uma lista editável de gírias proibidas.</p>
      <div class="form-grid">
        ${field({ path: "personality.base.rules.neverFormal", label: "Never formal", type: "checkbox", value: base.rules.neverFormal })}
        ${field({ path: "personality.base.rules.allowSarcasm", label: "Allow sarcasm", type: "checkbox", value: base.rules.allowSarcasm })}
        ${field({ path: "personality.base.rules.stickToIdentity", label: "Stick to identity", type: "checkbox", value: base.rules.stickToIdentity })}
        ${field({ path: "personality.base.rules.avoidTechnicalAssistantTone", label: "Avoid technical assistant tone", type: "checkbox", value: base.rules.avoidTechnicalAssistantTone })}
        ${field({ path: "personality.base.rules.avoidHashtags", label: "Avoid hashtags", type: "checkbox", value: base.rules.avoidHashtags })}
        ${field({ path: "personality.base.rules.shortRepliesPreferred", label: "Short replies preferred", type: "checkbox", value: base.rules.shortRepliesPreferred })}
        ${field({ path: "personality.base.rules.spokenDirectStyle", label: "Spoken direct style", type: "checkbox", value: base.rules.spokenDirectStyle })}
      </div>
    </div>

    ${renderStringList(base.rules.avoidMasculineSlang, {
      path: "personality.base.rules.avoidMasculineSlang",
      title: "Lista de Gírias Masculinas a Evitar",
      description: "Termos que a KIT deve evitar ao falar em conversa normal.",
      itemLabel: "Termo",
      itemHelp: "Use um item por linha editável."
    })}

    <div class="editor-card">
      <span class="pill">Modos</span>
      <h2 class="section-title">Modos de Resposta</h2>
      <p class="section-description">Define se cada rota usa persona e quais instruções de comportamento recebe.</p>
      <div class="panel-stack">
        ${["realtime", "task", "agent"].map((mode) => `
          <div class="object-item">
            <div class="object-item-header">
              <span class="object-item-title">${mode}</span>
            </div>
            <div class="form-grid">
              ${field({
                path: `personality.responseModes.routeModes.${mode}.usePersona`,
                label: "Usa persona",
                type: "checkbox",
                value: responseModes.routeModes[mode].usePersona
              })}
              ${field({
                path: `personality.responseModes.routeModes.${mode}.plannerRole`,
                label: "Planner role",
                value: responseModes.routeModes[mode].plannerRole
              })}
            </div>
            ${renderStringList(responseModes.routeModes[mode].instructions, {
              path: `personality.responseModes.routeModes.${mode}.instructions`,
              title: `Instruções de ${mode}`,
              description: "Lista de instruções aplicadas a esse modo.",
              itemLabel: "Instrução",
              itemHelp: "Mantenha instruções curtas e claras."
            })}
          </div>
        `).join("")}
      </div>
    </div>

    ${renderObjectList(needsMap.profiles, {
      path: "personality.needsMap.profiles",
      kind: "needs-profile",
      title: "Perfis por Needs / Aura",
      description: "Faixas de aura e o comportamento associado da KIT na rota de conversa.",
      itemTitle: "Perfil",
      fields: [
        { key: "id", label: "ID" },
        { key: "min", label: "Min", type: "number" },
        { key: "max", label: "Max", type: "number" },
        { key: "mode", label: "Mode" },
        { key: "label", label: "Label" },
        { key: "prompt", label: "Prompt", type: "textarea" }
      ]
    })}

    <div class="editor-card">
      <span class="pill">Emoções</span>
      <h2 class="section-title">Defaults de Emoções</h2>
      <p class="section-description">Valores-base e decay emocional usados pela lógica comportamental.</p>
      <div class="form-grid">
        ${field({ path: "personality.emotionsMap.defaults.type", label: "Type", value: emotionsMap.defaults.type })}
        ${field({ path: "personality.emotionsMap.defaults.intensity", label: "Intensity", type: "number", value: emotionsMap.defaults.intensity })}
        ${field({ path: "personality.emotionsMap.defaults.decayMinutes", label: "Decay minutes", type: "number", value: emotionsMap.defaults.decayMinutes })}
        ${field({ path: "personality.emotionsMap.defaults.decayType", label: "Decay type", value: emotionsMap.defaults.decayType })}
        ${field({ path: "personality.emotionsMap.defaults.decayIntensity", label: "Decay intensity", type: "number", value: emotionsMap.defaults.decayIntensity })}
      </div>
    </div>

    ${renderObjectList(emotionsMap.rules, {
      path: "personality.emotionsMap.rules",
      kind: "emotion-rule",
      title: "Regras de Emoção",
      description: "Regras derivadas de needs que atualizam o estado emocional.",
      itemTitle: "Regra",
      fields: [
        { key: "metric", label: "Metric" },
        { key: "operator", label: "Operator" },
        { key: "value", label: "Value", type: "number" },
        { key: "emotion", label: "Emotion" },
        { key: "intensity", label: "Intensity", type: "number" }
      ]
    })}
  `;
}

export function bindConfigPanelEvents(root, rerender) {
  root.querySelectorAll("[data-path]").forEach((input) => {
    input.addEventListener("input", () => {
      const path = input.dataset.path;
      const type = input.dataset.type;
      let value = input.value;

      if (type === "checkbox") {
        value = input.checked;
      } else if (input.type === "number") {
        value = Number(input.value);
      }

      mutateBundle((bundle) => {
        setValueByPath(bundle, path, value);
      });
    });
  });

  root.querySelectorAll("[data-action='add-string-item']").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.dataset.path;
      mutateBundle((bundle) => {
        const list = path.split(".").reduce((acc, key) => acc[key], bundle);
        list.push("");
      });
      rerender();
    });
  });

  root.querySelectorAll("[data-action='remove-string-item']").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.dataset.path;
      const index = Number(button.dataset.index);
      mutateBundle((bundle) => {
        const list = path.split(".").reduce((acc, key) => acc[key], bundle);
        list.splice(index, 1);
      });
      rerender();
    });
  });

  root.querySelectorAll("[data-action='add-object-item']").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.dataset.path;
      const kind = button.dataset.kind;
      const templates = {
        "needs-profile": {
          id: "",
          min: 0,
          max: 0,
          mode: "",
          label: "",
          prompt: ""
        },
        "emotion-rule": {
          metric: "",
          operator: "",
          value: 0,
          emotion: "",
          intensity: 0.5
        }
      };

      mutateBundle((bundle) => {
        const list = path.split(".").reduce((acc, key) => acc[key], bundle);
        list.push({ ...templates[kind] });
      });
      rerender();
    });
  });

  root.querySelectorAll("[data-action='remove-object-item']").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.dataset.path;
      const index = Number(button.dataset.index);
      mutateBundle((bundle) => {
        const list = path.split(".").reduce((acc, key) => acc[key], bundle);
        list.splice(index, 1);
      });
      rerender();
    });
  });
}
