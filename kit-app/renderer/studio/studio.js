const FALLBACK_PROJECT = {
  source: "studio",
  clientName: "Projetar MGJ Engenharia",
  projectName: "Usucapião e Regularização",
  currentStep: "briefing",
  currentTab: "briefing",
  unlockedTabs: ["briefing", "script"],
  progress: {
    currentTask: "Briefing em revisão editorial",
    percent: 32,
    completedSteps: 1,
    totalSteps: 2,
    elapsedMs: 0
  },
  resourceUsage: {
    vram: "--",
    ram: "--",
    gpu: "--",
    cpu: "--",
    disk: "--"
  },
  briefing: {
    theme: "Regularização de imóveis e usucapião com a Projetar MGJ Engenharia.",
    purpose: "Promover os serviços técnicos de engenharia para processos de usucapião, transmitindo segurança e profissionalismo.",
    audience: "Proprietários de imóveis sem documentação regularizada que buscam segurança jurídica.",
    visualMaterial: "aigc",
    duration: "30",
    mediaType: "clip",
    ratio: "9:16",
    platform: "TikTok",
    bgmStyle: "Inspiring hopeful piano corporate music",
    subtitleInfo: "Legendas dinâmicas em amarelo e branco",
    rawReferences: "",
    materialReferences: [
      "Cena inicial com tensão documental e signos de posse do imóvel.",
      "Bloco técnico com engenheiro, medição laser, planta e memorial descritivo.",
      "Fechamento com família, fachada valorizada e chamada para ação."
    ],
    videoContent: "Ambiente brasileiro realista, luz natural de fim de tarde e foco em confiança técnica."
  },
  script: {
    approved: false,
    totalDuration: 30,
    scenes: [
    {
      id: "scene_01",
      index: 1,
      title: "O problema",
      duration: 10,
      status: "Aguardando aprovação",
      narration: "Você já mora no imóvel há anos, mas ainda não conseguiu regularizar a documentação?",
      visualDescription: "Homem preocupado, documentos antigos, contas, IPTU e detalhes da casa com texto na tela reforçando usucapião e regularização."
    },
    {
      id: "scene_02",
      index: 2,
      title: "A solução técnica",
      duration: 10,
      status: "Estrutura pronta",
      narration: "A Projetar MGJ Engenharia realiza toda a parte técnica necessária para o seu processo de usucapião.",
      visualDescription: "Engenheiro em ação, drone, sobreposição técnica, planta detalhada e lista dos entregáveis."
    },
    {
      id: "scene_03",
      index: 3,
      title: "Resultado e segurança",
      duration: 10,
      status: "Estrutura pronta",
      narration: "Regularize seu imóvel com segurança e acompanhamento especializado.",
      visualDescription: "Família sorrindo, fachada valorizada, marca e CTA final."
    }
    ]
  }
};

const stateStore = window.StudioState.createStudioState(FALLBACK_PROJECT);
const state = stateStore.getViewModel();
const MAX_PROJECT_MESSAGES = 24;
const PRODUCTION_STATUS_STEPS = ["aguardando", "gerando voz", "gerando mídia", "pronto"];
const productionTimers = [];
const SCENE_TECH_PRESETS = {
  standard: { preset: "standard", quality: "standard", mode: "auto", fps: 12, steps: 24, cfg: 7, denoise: 0.55 },
  fast: { preset: "fast", quality: "draft", mode: "auto", fps: 10, steps: 18, cfg: 6.5, denoise: 0.5 },
  quality: { preset: "quality", quality: "high", mode: "auto", fps: 16, steps: 32, cfg: 7.5, denoise: 0.6 },
  cinematic: { preset: "cinematic", quality: "high", mode: "i2v", fps: 16, steps: 36, cfg: 8, denoise: 0.58 },
  custom: { preset: "custom" }
};
const TECH_QUALITY_OPTIONS = ["draft", "standard", "high"];
const TECH_MODE_OPTIONS = ["auto", "t2v", "i2v"];
const TECH_RATIO_OPTIONS = ["", "9:16", "16:9", "1:1", "4:5", "3:4"];
const TECH_SCHEDULER_OPTIONS = ["", "DPMSolverMultistepScheduler", "Euler", "Euler A"];
const TECH_SAMPLER_OPTIONS = ["", "ddim", "euler", "dpmpp-2m"];
const TECH_ACTION_ICONS = {
  "add-reference": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h6v2H5v6H3zM10 3h3v3h-2V5h-1zM7 7h6v6H7z"/></svg>',
  "add-persona": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2a3 3 0 1 1 0 6a3 3 0 0 1 0-6zm0 7c3 0 5 1.7 5 4v1H3v-1c0-2.3 2-4 5-4z"/></svg>',
  "generate-image": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12v10H2zM4 11l2.2-2.7L8 10l1.7-2L12 11zM5.2 6.2a1.1 1.1 0 1 0 0 .1z"/></svg>',
  "generate-video": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h7v10H3zM11 6l2.5-1.5v7L11 10z"/></svg>',
  "set-start-frame": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v10H3zM6 8l7-5v10z"/></svg>',
  "set-end-frame": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 3h2v10h-2zM3 3l7 5l-7 5z"/></svg>',
  interpolate: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 11c2-5 4-5 6 0s4 5 6 0v2c-2 4-4 4-6 0s-4-4-6 0z"/></svg>',
  "regenerate-media": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3a5 5 0 1 1-4.2 2.3H2V2h3.3v1.7A6 6 0 1 0 8 2z"/></svg>'
};
state.messages = [
  {
    id: "msg-1",
    role: "user",
    type: "command",
    timestamp: new Date().toISOString(),
    text: "Kit cria um vídeo vertical para Projetar MGJ sobre regularização de imóveis e usucapião."
  },
  {
    id: "msg-2",
    role: "assistant",
    type: "status",
    timestamp: new Date().toISOString(),
    text: "Briefing inicial estruturado. O centro agora funciona como documento corrido com variáveis editáveis em dropdown."
  }
];
state.selectedSceneId = FALLBACK_PROJECT.script.scenes[0]?.id || null;
state.referenceLibrary = {
  open: false,
  loading: false,
  activeTab: "client-media",
  items: {
    "client-media": [],
    "ai-media": [],
    "project-attachments": []
  },
  error: ""
};

const elements = {
  clientNameLabel: document.getElementById("clientNameLabel"),
  projectNameLabel: document.getElementById("projectNameLabel"),
  flowTypeLabel: document.getElementById("flowTypeLabel"),
  resourceVram: document.getElementById("resourceVram"),
  resourceRam: document.getElementById("resourceRam"),
  resourceGpu: document.getElementById("resourceGpu"),
  resourceCpu: document.getElementById("resourceCpu"),
  resourceDisk: document.getElementById("resourceDisk"),
  currentTaskLabel: document.getElementById("currentTaskLabel"),
  progressBarFill: document.getElementById("progressBarFill"),
  stepCountLabel: document.getElementById("stepCountLabel"),
  elapsedLabel: document.getElementById("elapsedLabel"),
  stageTitle: document.getElementById("stageTitle"),
  tabStateLabel: document.getElementById("tabStateLabel"),
  tabAvailabilityLabel: document.getElementById("tabAvailabilityLabel"),
  studioTabs: document.getElementById("studioTabs"),
  studioTabPanel: document.getElementById("studioTabPanel"),
  chatMessageList: document.getElementById("chatMessageList"),
  messageCountLabel: document.getElementById("messageCountLabel"),
  chatInput: document.getElementById("chatInput"),
  chatContextLabel: document.getElementById("chatContextLabel"),
  sendChatButton: document.getElementById("sendChatButton"),
  approveBriefingButton: document.getElementById("approveBriefingButton"),
  approveScriptButton: document.getElementById("approveScriptButton"),
  generateCaptionButton: document.getElementById("generateCaptionButton"),
  minimizeStudioButton: document.getElementById("minimizeStudioButton"),
  maximizeStudioButton: document.getElementById("maximizeStudioButton"),
  closeStudioButton: document.getElementById("closeStudioButton")
};

function syncStateFromProject() {
  const viewModel = stateStore.getViewModel();
  Object.assign(state, viewModel, {
    messages: Array.isArray(state.messages) ? state.messages : []
  });
  if (!getSelectedScene()) {
    state.selectedSceneId = state.project?.script?.scenes?.[0]?.id || null;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatElapsed(seconds = 0) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const remainingSeconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function getTabLabel(tabId) {
  return state.tabs.find((tab) => tab.id === tabId)?.label || "Briefing";
}

function getStageTitle(tabId) {
  return tabId === "script"
    ? "Roteiro base com cenas já organizadas"
    : "Briefing em formato de documento corrido";
}

function getSelectedScene() {
  const scenes = state.project?.script?.scenes || [];
  if (!scenes.length) {
    return null;
  }

  const selected = scenes.find((scene) => scene.id === state.selectedSceneId);
  return selected || scenes[0];
}

function getSceneById(sceneId) {
  return (state.project?.script?.scenes || []).find((scene) => scene.id === sceneId) || null;
}

function getAllScenes() {
  return state.project?.script?.scenes || [];
}

function getDefaultSceneTechSettings(scene = {}) {
  return {
    preset: "standard",
    model: "",
    quality: "standard",
    mode: "auto",
    duration: Number(scene.duration || 5),
    fps: 12,
    ratio: String(state.project?.briefing?.ratio || "").trim(),
    width: 0,
    height: 0,
    seed: "",
    lora: "",
    steps: 24,
    cfg: 7,
    sampler: "",
    scheduler: "",
    denoise: 0.55,
    startImage: "",
    endImage: "",
    interpolationReady: false,
    useProjectPersona: false
  };
}

function getSceneTechSettings(scene = {}) {
  return {
    ...getDefaultSceneTechSettings(scene),
    ...(scene.generationSettings || {})
  };
}

function formatResolution(width = 0, height = 0) {
  const safeWidth = Number(width || 0);
  const safeHeight = Number(height || 0);
  return safeWidth > 0 && safeHeight > 0 ? `${safeWidth}x${safeHeight}` : "";
}

function parseResolution(value = "") {
  const match = String(value || "").trim().match(/^(\d{2,5})\s*[xX]\s*(\d{2,5})$/);
  return match
    ? { width: Number(match[1] || 0), height: Number(match[2] || 0) }
    : { width: 0, height: 0 };
}

function getProjectPersonaSummary() {
  const briefing = state.project?.briefing || {};
  return [
    state.project?.clientName ? `Cliente: ${state.project.clientName}` : "",
    briefing.theme ? `Tema: ${briefing.theme}` : "",
    briefing.purpose ? `Objetivo: ${briefing.purpose}` : "",
    briefing.audience ? `Publico: ${briefing.audience}` : ""
  ].filter(Boolean).join(" | ");
}

function resolveSceneReferenceImage(scene = {}) {
  const visualReferences = getVisualReferences(scene);
  return String(visualReferences[0]?.path || visualReferences[0]?.filePath || "").trim();
}

function resolveSceneStartImage(scene = {}) {
  const settings = getSceneTechSettings(scene);
  return String(settings.startImage || "").trim()
    || (/\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(getSceneMediaPath(scene)) ? getSceneMediaPath(scene) : "")
    || resolveSceneReferenceImage(scene);
}

function buildSceneGenerationPayload(scene = {}) {
  const settings = getSceneTechSettings(scene);
  const personaSummary = settings.useProjectPersona ? getProjectPersonaSummary() : "";
  const basePrompt = scene.visualPrompt || scene.visualDescription || scene.title || "";
  const prompt = personaSummary ? `${basePrompt}\n\n${personaSummary}`.trim() : basePrompt;
  const startImage = resolveSceneStartImage(scene);

  return {
    projectId: state.project?.id || "",
    sceneId: scene.id,
    preset: settings.preset || "standard",
    model: settings.model || "",
    quality: settings.quality || "standard",
    mode: settings.mode || "auto",
    duration: Number(settings.duration || scene.duration || 5),
    fps: Number(settings.fps || 12),
    ratio: String(settings.ratio || state.project?.briefing?.ratio || "").trim(),
    width: Number(settings.width || 0),
    height: Number(settings.height || 0),
    resolution: formatResolution(settings.width, settings.height),
    seed: settings.seed || "",
    lora: settings.lora || "",
    steps: Number(settings.steps || 24),
    cfg: Number(settings.cfg || 7),
    sampler: settings.sampler || "",
    scheduler: settings.scheduler || "",
    denoise: Number(settings.denoise || 0.55),
    startImage,
    endImage: String(settings.endImage || "").trim(),
    interpolationReady: Boolean(settings.interpolationReady),
    prompt,
    negativePrompt: scene.negativePrompt || "",
    motionPrompt: scene.motionPrompt || "",
    references: Array.isArray(scene.references) ? scene.references : []
  };
}

function buildImageGenerationPayload(scene = {}) {
  const payload = buildSceneGenerationPayload(scene);
  return {
    ...payload,
    mode: payload.mode === "i2v"
      ? "img2img"
      : payload.mode === "t2v"
        ? "txt2img"
        : (getVisualReferences(scene).length || payload.startImage ? "img2img" : "txt2img")
  };
}

function areAllScenesApproved() {
  const scenes = getAllScenes();
  return scenes.length > 0 && scenes.every((scene) => Boolean(scene.approved));
}

function isProductionRunning() {
  return state.project?.production?.status === "running";
}

function getSceneMedia(scene = {}) {
  return scene.generatedMedia || scene.mediaAsset || null;
}

function getSceneMediaPath(scene = {}) {
  const media = getSceneMedia(scene);
  return media?.path || media?.filePath || "";
}

function formatReferences(references = []) {
  if (!Array.isArray(references) || !references.length) {
    return "";
  }

  return references
    .map((reference) => {
      if (typeof reference === "string") {
        return reference;
      }
      return reference.label || reference.name || reference.fileName || reference.path || "";
    })
    .filter(Boolean)
    .join("\n");
}

function parseReferenceLines(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line, index) => {
      const text = line.trim();
      if (!text) {
        return null;
      }
      return {
        id: `ref_${index + 1}`,
        label: text,
        type: "text",
        path: "",
        role: "scene-reference"
      };
    })
    .filter(Boolean);
}

function getReferenceLibraryTabs() {
  return [
    { id: "client-media", label: "Midia do cliente" },
    { id: "ai-media", label: "Midia de IA" },
    { id: "project-attachments", label: "Arquivos enviados" }
  ];
}

function getLibraryFieldBySource(source = "") {
  if (source === "client-media") {
    return "clientMediaRefs";
  }
  if (source === "ai-media") {
    return "aiMediaRefs";
  }
  return "uploadedRefs";
}

function normalizeReferenceItem(item = {}, source = "project-attachments") {
  return {
    id: String(item.id || `${source}:${item.path || item.label || Date.now()}`),
    label: String(item.label || item.name || item.fileName || item.path || "Referencia").trim(),
    fileName: String(item.fileName || "").trim(),
    path: String(item.path || item.filePath || "").trim(),
    type: String(item.type || item.kind || "reference").trim(),
    kind: String(item.kind || item.type || "file").trim(),
    role: String(item.role || "scene-reference").trim(),
    source: String(item.source || source).trim()
  };
}

function getVisualReferences(scene = {}) {
  return (Array.isArray(scene?.references) ? scene.references : [])
    .filter((reference) => /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(String(reference?.path || reference?.filePath || "")));
}

function shouldUseVideoGeneration(scene = {}) {
  const mediaType = String(scene?.mediaType || "").toLowerCase();
  const generationMode = String(scene?.generationMode || "").toLowerCase();
  return mediaType === "video" || generationMode === "t2v" || generationMode === "i2v";
}

function areReferencesEqual(left = {}, right = {}) {
  return String(left.path || left.label || left.id) === String(right.path || right.label || right.id);
}

function isReferenceSelected(scene = {}, item = {}) {
  const normalizedItem = normalizeReferenceItem(item, item.source);
  const field = getLibraryFieldBySource(normalizedItem.source);
  const sourceList = Array.isArray(scene?.[field]) ? scene[field] : [];
  return sourceList.some((reference) => areReferencesEqual(reference, normalizedItem));
}

function renderReferencePreview(item = {}) {
  const safePath = escapeHtml(item.path || "");
  if (item.kind === "image" && safePath) {
    return `<img src="${safePath}" alt="${escapeHtml(item.label || "Referencia")}">`;
  }

  if (item.kind === "video" && safePath) {
    return `<video muted playsinline src="${safePath}"></video>`;
  }

  if (item.kind === "audio" && safePath) {
    return `<audio controls src="${safePath}"></audio>`;
  }

  return `
    <div class="reference-item-fallback">
      <strong>${escapeHtml((item.kind || "arquivo").toUpperCase())}</strong>
    </div>
  `;
}

function getSceneStatus(scene = {}) {
  if (scene.productionStatus) {
    return scene.productionStatus;
  }
  if (scene.approved) {
    return "aprovada";
  }
  return scene.status || "pendente";
}

function getCurrentChatScene() {
  return state.currentTab === "script" ? getSelectedScene() : null;
}

function normalizeMessage(message = {}) {
  return {
    id: String(message.id || `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    role: String(message.role || "system"),
    text: String(message.text || "").trim(),
    timestamp: message.timestamp || new Date().toISOString(),
    sceneId: message.sceneId || null,
    type: String(message.type || message.role || "note")
  };
}

function setProjectMessages(messages = []) {
  state.messages = (Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter((message) => message.text)
    .slice(-MAX_PROJECT_MESSAGES);
}

function getMessageTitle(message = {}) {
  if (message.role === "user") {
    return message.type === "command" ? "Comando" : "Voce";
  }

  if (message.role === "assistant") {
    return "KIT";
  }

  return "Sistema";
}

function formatMessageMeta(message = {}) {
  const timestamp = new Date(message.timestamp);
  const timeLabel = Number.isNaN(timestamp.getTime())
    ? "--:--"
    : timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const scene = message.sceneId ? getSceneById(message.sceneId) : null;
  return [message.type || message.role, scene ? `Cena ${scene.index}` : "", timeLabel]
    .filter(Boolean)
    .join(" - ");
}

function renderTopbar() {
  elements.clientNameLabel.textContent = state.clientName;
  elements.projectNameLabel.textContent = state.projectName;
  elements.flowTypeLabel.textContent = state.flowType;
  elements.resourceVram.textContent = state.resources.vram;
  elements.resourceRam.textContent = state.resources.ram;
  elements.resourceGpu.textContent = state.resources.gpu;
  elements.resourceCpu.textContent = state.resources.cpu;
  elements.resourceDisk.textContent = state.resources.disk;
}

function renderStatus() {
  elements.currentTaskLabel.textContent = state.currentTask;
  elements.progressBarFill.style.width = `${Math.max(0, Math.min(100, state.progress.percent))}%`;
  elements.stepCountLabel.textContent = `${state.progress.completedSteps} / ${state.progress.totalSteps} etapas`;
  elements.elapsedLabel.textContent = formatElapsed(state.progress.elapsedSeconds);
  elements.tabStateLabel.textContent = `Aba ativa: ${getTabLabel(state.currentTab)}`;
  elements.tabAvailabilityLabel.textContent = `${state.tabs.length} abas prontas`;
  elements.stageTitle.textContent = getStageTitle(state.currentTab);
}

function renderTabs() {
  elements.studioTabs.innerHTML = state.tabs
    .map((tab) => {
      const isActive = state.currentTab === tab.id;
      return `
        <button
          type="button"
          class="tab-button${isActive ? " is-active" : ""}"
          data-tab-id="${tab.id}"
          aria-pressed="${isActive ? "true" : "false"}"
        >
          <img src="${escapeHtml(tab.icon)}" alt="">
          <span>${escapeHtml(tab.label)}</span>
        </button>
      `;
    })
    .join("");
}

function renderSelect(field, options = []) {
  const currentValue = state.project.briefing[field] || "";
  return `
    <select class="doc-select" data-briefing-field="${field}">
      ${options
        .map((option) => `<option value="${escapeHtml(option)}" ${option === currentValue ? "selected" : ""}>${escapeHtml(option)}</option>`)
        .join("")}
    </select>
  `;
}

function normalizeLines(value) {
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}

function getBriefingFieldValue(field) {
  if (field === "postCaption") {
    return state.project.postCaption || state.project.briefing?.postCaption || "";
  }

  return state.project.briefing[field] || "";
}

function renderBriefingInput(label, field, placeholder = "") {
  const value = getBriefingFieldValue(field);
  return `
    <label class="briefing-field">
      <span>${escapeHtml(label)}</span>
      <input class="briefing-input" data-briefing-field="${field}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
    </label>
  `;
}

function renderBriefingTextarea(label, field, placeholder = "") {
  const value = normalizeLines(getBriefingFieldValue(field));
  return `
    <label class="briefing-field is-wide">
      <span>${escapeHtml(label)}</span>
      <textarea class="briefing-textarea" data-briefing-field="${field}" rows="4" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function renderBriefingSelectField(label, field, options = []) {
  return `
    <label class="briefing-field">
      <span>${escapeHtml(label)}</span>
      ${renderSelect(field, options)}
    </label>
  `;
}

function renderBriefingPanel() {
  const briefing = state.project.briefing;
  return `
    <article class="briefing-paper">
      <header class="paper-header">
        <span class="paper-kicker">Documento de briefing</span>
        <h2 class="paper-title">${escapeHtml(state.projectName)}</h2>
        <div class="paper-subtitle">
          Projeto criado para <strong>${escapeHtml(state.clientName)}</strong>. Todos os campos abaixo sao editaveis antes da aprovacao.
        </div>
      </header>

      <div class="paper-body">
        <section class="paper-section">
          <h2>Resumo editorial</h2>
          <div class="briefing-form-grid">
            ${renderBriefingTextarea("Tema", "theme", "Tema central da campanha")}
            ${renderBriefingTextarea("Objetivo", "purpose", "Objetivo de comunicacao")}
            ${renderBriefingTextarea("Publico", "audience", "Quem deve ser impactado")}
          </div>
        </section>

        <section class="paper-section">
          <h2>Parâmetros principais</h2>
          <div class="briefing-form-grid is-compact">
            ${renderBriefingSelectField("Material visual", "visualMaterial", ["aigc", "user", "user + aigc"])}
            ${renderBriefingSelectField("Duracao", "duration", ["", "15", "30", "45", "60"])}
            ${renderBriefingSelectField("Tipo de midia", "mediaType", ["clip", "imagem", "carrossel", "stories"])}
            ${renderBriefingSelectField("Proporcao", "ratio", ["9:16", "3:4", "1:1", "16:9"])}
            ${renderBriefingSelectField("Plataforma", "platform", ["Instagram", "Reels", "Stories", "TikTok", "YouTube Shorts", "Facebook", "LinkedIn"])}
            ${renderBriefingInput("Musica", "bgmStyle", "Ex: trilha leve e emocional")}
          </div>
        </section>

        <section class="paper-section">
          <h2>Conteudo e narrativa</h2>
          <div class="briefing-form-grid">
            ${renderBriefingTextarea("Conteudo", "videoContent", "Direcao do conteudo")}
            ${renderBriefingTextarea("Narracao", "videoNarration", "Texto ou guia de narracao")}
            ${renderBriefingTextarea("Legenda de postagem", "postCaption", "Legenda que sera usada no post")}
          </div>
        </section>

        <section class="paper-section">
          <h2>Direcao visual</h2>
          <div class="briefing-form-grid">
            ${renderBriefingTextarea("Personagens", "characters", "Um item por linha")}
            ${renderBriefingTextarea("Estilo visual", "styleList", "Um item por linha")}
            ${renderBriefingTextarea("Referencias", "materialReferences", "Um item por linha")}
          </div>
        </section>

        <section class="paper-section">
          <h2>Legenda e aprovacao</h2>
          <div class="briefing-form-grid">
            ${renderBriefingTextarea("Legenda operacional", "subtitleInfo", "Como as legendas devem aparecer no video")}
            <div class="briefing-actions is-wide">
              <button type="button" class="ghost-button" data-briefing-action="save">Salvar briefing</button>
              <button type="button" class="primary-button" data-briefing-action="approve">Aprovar briefing</button>
              <span>${briefing.approved || state.project.briefingApproved ? "Briefing aprovado" : "Aguardando aprovacao"}</span>
            </div>
          </div>
        </section>
      </div>
    </article>
  `;
}

function renderSceneSummary(label, value, extraClass = "") {
  return `
    <div class="scene-detail ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(value || "Nao definido.")}</p>
    </div>
  `;
}

function renderSceneEditor(label, field, value, disabled = false, rows = 3) {
  return `
    <label class="scene-editor-field" data-scene-editor-target="${escapeHtml(field)}">
      <span>${escapeHtml(label)}</span>
      <textarea
        data-scene-field="${escapeHtml(field)}"
        rows="${rows}"
        ${disabled ? "disabled" : ""}
      >${escapeHtml(value || "")}</textarea>
    </label>
  `;
}

function renderTechActionButton(action, label, sceneId) {
  const icon = TECH_ACTION_ICONS[action] || "";
  return `
    <button type="button" class="scene-tech-action" data-scene-tech-action="${escapeHtml(action)}" data-scene-id="${escapeHtml(sceneId)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      <span class="scene-tech-icon">${icon}</span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderSceneTechSelect(sceneId, field, value, options = [], title = "") {
  return `
    <label class="scene-tech-field">
      <span>${escapeHtml(title || field)}</span>
      <select data-scene-tech-field="${escapeHtml(field)}" data-scene-id="${escapeHtml(sceneId)}">
        ${options.map((option) => `
          <option value="${escapeHtml(option)}" ${String(value) === String(option) ? "selected" : ""}>${escapeHtml(option || "auto")}</option>
        `).join("")}
      </select>
    </label>
  `;
}

function renderSceneTechInput(sceneId, field, value, title, options = {}) {
  const type = options.type || "text";
  const step = options.step !== undefined ? `step="${escapeHtml(options.step)}"` : "";
  const min = options.min !== undefined ? `min="${escapeHtml(options.min)}"` : "";
  const placeholder = options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : "";
  return `
    <label class="scene-tech-field">
      <span>${escapeHtml(title)}</span>
      <input type="${escapeHtml(type)}" value="${escapeHtml(value ?? "")}" data-scene-tech-field="${escapeHtml(field)}" data-scene-id="${escapeHtml(sceneId)}" ${step} ${min} ${placeholder}>
    </label>
  `;
}

function renderSceneTechBar(scene = null) {
  if (!scene) {
    return "";
  }

  const settings = getSceneTechSettings(scene);
  return `
    <div class="scene-tech-bar">
      <div class="scene-tech-actions">
        ${renderTechActionButton("add-reference", "Referencia", scene.id)}
        ${renderTechActionButton("add-persona", settings.useProjectPersona ? "Persona on" : "Persona", scene.id)}
        ${renderTechActionButton("generate-image", "Imagem", scene.id)}
        ${renderTechActionButton("generate-video", "Video", scene.id)}
        ${renderTechActionButton("set-start-frame", "Quadro inicial", scene.id)}
        ${renderTechActionButton("set-end-frame", "Quadro final", scene.id)}
        ${renderTechActionButton("interpolate", settings.interpolationReady ? "Interpolacao on" : "Interpolacao", scene.id)}
        ${renderTechActionButton("regenerate-media", "Regenerar", scene.id)}
      </div>
      <div class="scene-tech-grid">
        ${renderSceneTechSelect(scene.id, "preset", settings.preset || "standard", ["standard", "fast", "quality", "cinematic", "custom"], "Preset")}
        ${renderSceneTechInput(scene.id, "model", settings.model, "Modelo")}
        ${renderSceneTechSelect(scene.id, "quality", settings.quality || "standard", TECH_QUALITY_OPTIONS, "Qualidade")}
        ${renderSceneTechSelect(scene.id, "mode", settings.mode || "auto", TECH_MODE_OPTIONS, "Modo")}
        ${renderSceneTechInput(scene.id, "duration", settings.duration, "Duracao", { type: "number", min: 1, step: 1 })}
        ${renderSceneTechInput(scene.id, "fps", settings.fps, "FPS", { type: "number", min: 1, step: 1 })}
        ${renderSceneTechSelect(scene.id, "ratio", settings.ratio || "", TECH_RATIO_OPTIONS, "Proporcao")}
        ${renderSceneTechInput(scene.id, "resolution", formatResolution(settings.width, settings.height), "Resolucao", { placeholder: "720x1280" })}
        ${renderSceneTechInput(scene.id, "seed", settings.seed, "Seed")}
        ${renderSceneTechInput(scene.id, "lora", settings.lora, "LoRA")}
        ${renderSceneTechInput(scene.id, "steps", settings.steps, "Steps", { type: "number", min: 0, step: 1 })}
        ${renderSceneTechInput(scene.id, "cfg", settings.cfg, "CFG", { type: "number", min: 0, step: 0.1 })}
        ${renderSceneTechSelect(scene.id, "sampler", settings.sampler || "", TECH_SAMPLER_OPTIONS, "Sampler")}
        ${renderSceneTechSelect(scene.id, "scheduler", settings.scheduler || "", TECH_SCHEDULER_OPTIONS, "Scheduler")}
        ${renderSceneTechInput(scene.id, "denoise", settings.denoise, "Denoise", { type: "number", min: 0, step: 0.01 })}
      </div>
    </div>
  `;
}

function renderScenePreviewMedia(scene = {}) {
  const generatedPath = getSceneMediaPath(scene);
  const isImage = /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(generatedPath);
  const isVideo = /\.(mp4|webm|mov|mkv|avi)$/i.test(generatedPath);

  if (generatedPath && isImage) {
    return `<img src="${escapeHtml(generatedPath)}" alt="${escapeHtml(scene.title || "Preview da cena")}">`;
  }

  if (generatedPath && isVideo) {
    return `<video controls src="${escapeHtml(generatedPath)}"></video>`;
  }

  return `
    <div class="preview-empty">
      <strong>Mídia ainda não gerada</strong>
      <p>Quando imagem ou vídeo forem gerados, este painel será atualizado com o asset real da cena selecionada.</p>
      <div class="prompt-box">${escapeHtml(scene.visualPrompt || scene.visualDescription || "Prompt visual ainda não definido.")}</div>
    </div>
  `;
}

function renderSceneMediaThumb(scene = {}) {
  const generatedPath = getSceneMediaPath(scene);
  const isImage = /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(generatedPath);
  const isVideo = /\.(mp4|webm|mov|mkv|avi)$/i.test(generatedPath);

  if (generatedPath && isImage) {
    return `
      <div class="scene-media-thumb">
        <img src="${escapeHtml(generatedPath)}" alt="${escapeHtml(scene.title || "Midia da cena")}">
      </div>
    `;
  }

  if (generatedPath && isVideo) {
    return `
      <div class="scene-media-thumb is-video">
        <video muted playsinline src="${escapeHtml(generatedPath)}"></video>
      </div>
    `;
  }

  return `
    <div class="scene-media-thumb is-empty">
      <span>Sem midia</span>
    </div>
  `;
}

function getProductionButtonLabel() {
  if (state.project?.production?.status === "ready") {
    return "Producao concluida";
  }

  if (isProductionRunning()) {
    return "Producao em andamento";
  }

  return "Gerar producao";
}

function renderReferenceLibraryPanel(selectedScene = null) {
  if (!state.referenceLibrary?.open || !selectedScene) {
    return "";
  }

  const activeTab = state.referenceLibrary.activeTab || "client-media";
  const tabs = getReferenceLibraryTabs();
  const items = Array.isArray(state.referenceLibrary.items?.[activeTab])
    ? state.referenceLibrary.items[activeTab]
    : [];

  return `
    <div class="reference-library-overlay" data-reference-overlay>
      <div class="reference-library-panel" role="dialog" aria-modal="true" aria-label="Biblioteca contextual de referencias">
        <div class="reference-library-header">
          <div>
            <span class="eyebrow">Biblioteca contextual</span>
            <h3>Referencias da cena ${escapeHtml(String(selectedScene.index || 1).padStart(2, "0"))}</h3>
            <p>${escapeHtml(selectedScene.title || "Cena selecionada")}</p>
          </div>
          <button type="button" class="scene-open-button" data-reference-action="close">Fechar</button>
        </div>

        <div class="reference-library-tabs">
          ${tabs.map((tab) => `
            <button
              type="button"
              class="scene-open-button${tab.id === activeTab ? " is-active" : ""}"
              data-reference-tab="${escapeHtml(tab.id)}"
            >
              ${escapeHtml(tab.label)}
            </button>
          `).join("")}
        </div>

        ${state.referenceLibrary.error ? `<div class="reference-library-alert">${escapeHtml(state.referenceLibrary.error)}</div>` : ""}
        ${state.referenceLibrary.loading ? `<div class="reference-library-loading">Carregando referencias...</div>` : ""}

        <div class="reference-library-grid">
          ${items.length
            ? items.map((item) => {
              const selected = isReferenceSelected(selectedScene, item);
              return `
                <article class="reference-item${selected ? " is-selected" : ""}">
                  <div class="reference-item-preview">
                    ${renderReferencePreview(item)}
                  </div>
                  <div class="reference-item-copy">
                    <strong>${escapeHtml(item.label || item.fileName || "Referencia")}</strong>
                    <span>${escapeHtml(item.kind || item.type || "arquivo")}</span>
                    <p>${escapeHtml(item.path || "Sem caminho disponivel")}</p>
                  </div>
                  <div class="reference-item-actions">
                    <button
                      type="button"
                      class="scene-open-button"
                      data-reference-action="${selected ? "remove" : "select"}"
                      data-reference-source="${escapeHtml(item.source || activeTab)}"
                      data-reference-id="${escapeHtml(item.id || "")}"
                    >
                      ${selected ? "Remover da cena" : "Vincular a cena"}
                    </button>
                  </div>
                </article>
              `;
            }).join("")
            : `<div class="reference-library-empty">Nenhuma midia encontrada nesta categoria.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderSceneHistory(scene = null) {
  const history = Array.isArray(scene?.history) ? scene.history.slice(-6).reverse() : [];
  if (!history.length) {
    return `
      <div class="scene-history-empty">
        Ainda nao ha historico contextual para esta cena.
      </div>
    `;
  }

  return `
    <div class="scene-history-list">
      ${history.map((entry) => `
        <article class="scene-history-item is-${escapeHtml(entry.role || "system")}">
          <span>${escapeHtml(entry.type || entry.role || "evento")}</span>
          <p>${escapeHtml(entry.text || "")}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderScriptPanel() {
  const selectedScene = getSelectedScene();
  const scenes = getAllScenes();
  const allApproved = areAllScenesApproved();
  const productionRunning = isProductionRunning();
  const selectedLocked = Boolean(selectedScene?.approved);

  return `
    <section class="script-sheet">
      <div class="script-sheet-column is-list">
        <header class="script-sheet-header">
          <div>
            <span class="eyebrow">Roteiro base</span>
            <h2>Fichas das cenas</h2>
          </div>
          <div class="scene-badges">
            <span class="metric-pill">${scenes.length} cenas</span>
            <span class="metric-pill">${state.project.script.totalDuration || state.project.briefing.duration}s total</span>
            <span class="metric-pill">${scenes.filter((scene) => scene.approved).length}/${scenes.length} aprovadas</span>
          </div>
        </header>

        <div class="script-global-actions">
          <button type="button" class="scene-open-button" data-script-action="approve-all">Aprovar roteiro completo</button>
          <button type="button" class="primary-button" data-script-action="start-production" ${allApproved && !productionRunning ? "" : "disabled"}>${escapeHtml(getProductionButtonLabel())}</button>
        </div>

        <div class="scene-list">
          ${scenes
            .map(
              (scene, index) => `
                <article class="scene-item${scene.id === selectedScene?.id ? " is-selected" : ""}${scene.approved ? " is-approved" : ""}" data-scene-card-id="${escapeHtml(scene.id)}" tabindex="0" role="button" aria-pressed="${scene.id === selectedScene?.id ? "true" : "false"}">
                  <div class="scene-item-header">
                    <div class="scene-card-copy">
                      <span class="eyebrow">Cena ${String(index + 1).padStart(2, "0")}</span>
                      <h3>${escapeHtml(scene.title)}</h3>
                      <p>${escapeHtml(scene.visualDescription || scene.visualPrompt || "Cena sem descricao visual ainda.")}</p>
                    </div>
                    <div class="scene-badges">
                      <span class="metric-pill">${escapeHtml(`${scene.duration}s`)}</span>
                      <span class="metric-pill is-status">${escapeHtml(getSceneStatus(scene))}</span>
                    </div>
                  </div>

                  <div class="scene-card-details">
                    ${renderSceneSummary("Indice", `Cena ${String(scene.index || index + 1).padStart(2, "0")}`)}
                    ${renderSceneSummary("Duracao", `${scene.duration || 0}s`)}
                    ${renderSceneSummary("Narracao", scene.narration)}
                    ${renderSceneSummary("Legenda", scene.subtitle)}
                    ${renderSceneSummary("Descricao visual", scene.visualDescription)}
                    ${renderSceneSummary("Prompt positivo", scene.visualPrompt)}
                    ${renderSceneSummary("Prompt negativo", scene.negativePrompt)}
                    ${renderSceneSummary("Referencias", formatReferences(scene.references))}
                    ${renderSceneSummary("Status", getSceneStatus(scene))}
                    ${renderSceneSummary("Midia gerada", getSceneMediaPath(scene) || "Ainda sem midia")}
                  </div>

                  ${renderSceneMediaThumb(scene)}

                  <div class="scene-card-actions">
                    <button type="button" class="scene-open-button" data-scene-id="${escapeHtml(scene.id)}">Selecionar</button>
                    <div class="scene-icon-actions">
                      ${scene.approved ? `
                        <button type="button" class="scene-open-button" data-scene-action="unlock" data-scene-id="${escapeHtml(scene.id)}">Revisar/desbloquear</button>
                      ` : `
                        <button type="button" class="scene-open-button" data-scene-action="approve" data-scene-id="${escapeHtml(scene.id)}">Aprovar cena</button>
                      `}
                      <button type="button" class="scene-open-button" data-scene-action="edit-text" data-scene-id="${escapeHtml(scene.id)}" ${scene.approved ? "disabled" : ""}>Editar texto</button>
                      <button type="button" class="scene-open-button" data-scene-action="edit-subtitle" data-scene-id="${escapeHtml(scene.id)}" ${scene.approved ? "disabled" : ""}>Editar legenda</button>
                      <button type="button" class="scene-open-button" data-scene-action="adjust-prompt" data-scene-id="${escapeHtml(scene.id)}" ${scene.approved ? "disabled" : ""}>Ajustar prompt</button>
                      <button type="button" class="scene-open-button" data-scene-action="adjust-references" data-scene-id="${escapeHtml(scene.id)}" ${scene.approved ? "disabled" : ""}>Ajustar referencias</button>
                      <button type="button" class="scene-open-button" data-scene-action="regenerate" data-scene-id="${escapeHtml(scene.id)}" ${scene.approved ? "disabled" : ""}>Regenerar texto</button>
                      <button type="button" class="scene-open-button" data-scene-action="context" data-scene-id="${escapeHtml(scene.id)}">Chat contextual</button>
                    </div>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </div>

      <div class="script-sheet-column is-preview">
        <div class="script-preview">
          <div class="script-preview-header">
            <div>
              <span class="eyebrow">Visualizador</span>
              <h3>${escapeHtml(selectedScene?.title || "Nenhuma cena selecionada")}</h3>
              <p>${escapeHtml(selectedScene ? `Prévia e edição da cena ${selectedScene.index}` : "Selecione uma ficha para ver os detalhes.")}</p>
            </div>
            <div class="scene-badges">
              <span class="metric-pill">${escapeHtml(selectedScene ? `${selectedScene.duration}s` : "--")}</span>
              <span class="metric-pill">${escapeHtml(selectedScene ? getSceneStatus(selectedScene) : "vazio")}</span>
              ${selectedLocked ? `<span class="metric-pill">bloqueada</span>` : ""}
            </div>
          </div>

          <div class="preview-stage">
            ${selectedScene ? renderScenePreviewMedia(selectedScene) : ""}
          </div>

          ${selectedScene?.subtitle ? `<div class="scene-visual-caption">${escapeHtml(selectedScene.subtitle)}</div>` : ""}

          <div class="preview-meta-grid">
            <div class="preview-meta-card">
              <span>Status</span>
              <p>${escapeHtml(selectedScene ? getSceneStatus(selectedScene) : "Sem cena selecionada.")}</p>
            </div>
            <div class="preview-meta-card">
              <span>Duracao</span>
              <p>${escapeHtml(selectedScene ? `${selectedScene.duration}s` : "--")}</p>
            </div>
            <div class="preview-meta-card">
              <span>Narracao</span>
              <p>${escapeHtml(selectedScene?.narration || "Sem narracao definida.")}</p>
            </div>
            <div class="preview-meta-card">
              <span>Geracao</span>
              <p>${escapeHtml(`${selectedScene?.mediaType || "--"} / ${selectedScene?.generationMode || "--"} / ${selectedScene?.audioAsset?.path || "sem voz"} / ${getSceneMediaPath(selectedScene || {}) || "sem asset"}`)}</p>
            </div>
            <div class="preview-meta-card">
              <span>Prompt positivo</span>
              <p>${escapeHtml(selectedScene?.visualPrompt || "Ainda nao definido.")}</p>
            </div>
            <div class="preview-meta-card">
              <span>Prompt negativo</span>
              <p>${escapeHtml(selectedScene?.negativePrompt || "Ainda nao definido.")}</p>
            </div>
          </div>

          ${selectedScene ? renderSceneTechBar(selectedScene) : ""}

          ${selectedScene ? `
            <div class="scene-toolbar ${selectedLocked ? "is-locked" : ""}">
              ${selectedLocked
                ? `<button type="button" class="scene-open-button" data-scene-action="unlock" data-scene-id="${escapeHtml(selectedScene.id)}">Revisar/desbloquear cena aprovada</button>`
                : `
                  <button type="button" class="scene-open-button" data-scene-action="approve" data-scene-id="${escapeHtml(selectedScene.id)}">Aprovar cena</button>
                  <button type="button" class="scene-open-button" data-scene-action="edit-text" data-scene-id="${escapeHtml(selectedScene.id)}">Editar texto</button>
                  <button type="button" class="scene-open-button" data-scene-action="edit-subtitle" data-scene-id="${escapeHtml(selectedScene.id)}">Editar legenda</button>
                  <button type="button" class="scene-open-button" data-scene-action="adjust-prompt" data-scene-id="${escapeHtml(selectedScene.id)}">Ajustar prompt</button>
                  <button type="button" class="scene-open-button" data-scene-action="adjust-references" data-scene-id="${escapeHtml(selectedScene.id)}">Ajustar referencias</button>
                  ${shouldUseVideoGeneration(selectedScene)
                    ? `<button type="button" class="scene-open-button" data-scene-action="generate-video" data-scene-id="${escapeHtml(selectedScene.id)}">Gerar video</button>`
                    : ""}
                  <button type="button" class="scene-open-button" data-scene-action="generate-image" data-scene-id="${escapeHtml(selectedScene.id)}">Gerar imagem</button>
                  <button type="button" class="scene-open-button" data-scene-action="regenerate" data-scene-id="${escapeHtml(selectedScene.id)}">Regenerar texto da cena</button>
                `}
              <button type="button" class="scene-open-button" data-scene-action="context" data-scene-id="${escapeHtml(selectedScene.id)}">Abrir chat contextual</button>
            </div>

            <div class="scene-editor-grid ${selectedLocked ? "is-locked" : ""}">
              ${renderSceneEditor("Texto/narracao da cena", "narration", selectedScene.narration, selectedLocked)}
              ${renderSceneEditor("Legenda visual da cena", "subtitle", selectedScene.subtitle, selectedLocked)}
              ${renderSceneEditor("Descricao visual", "visualDescription", selectedScene.visualDescription, selectedLocked)}
              ${renderSceneEditor("Prompt positivo", "visualPrompt", selectedScene.visualPrompt, selectedLocked, 4)}
              ${renderSceneEditor("Prompt negativo", "negativePrompt", selectedScene.negativePrompt, selectedLocked, 3)}
              ${renderSceneEditor("Referencias", "references", formatReferences(selectedScene.references), selectedLocked, 3)}
            </div>

            <div class="scene-history-panel">
              <div class="scene-history-header">
                <span class="eyebrow">Historico contextual</span>
                <strong>Ultimos ajustes da cena</strong>
              </div>
              ${renderSceneHistory(selectedScene)}
            </div>
          ` : ""}
        </div>
      </div>
      ${renderReferenceLibraryPanel(selectedScene)}
    </section>
  `;
}

function renderActivePanel() {
  elements.studioTabPanel.innerHTML = state.currentTab === "script"
    ? renderScriptPanel()
    : renderBriefingPanel();
}

function renderMessages() {
  elements.messageCountLabel.textContent = `${state.messages.length} mensagens`;
  const contextScene = getCurrentChatScene();
  if (elements.chatContextLabel) {
    elements.chatContextLabel.textContent = contextScene
      ? `Contexto: Cena ${contextScene.index} - ${contextScene.title}`
      : "Contexto: projeto atual";
  }
  elements.chatMessageList.innerHTML = state.messages
    .map((message) => {
      return `
        <article class="chat-message is-${escapeHtml(message.role)}${message.sceneId ? " has-scene" : ""}">
          <span class="message-meta">${escapeHtml(formatMessageMeta(message))}</span>
          <strong>${escapeHtml(getMessageTitle(message))}</strong>
          <p>${escapeHtml(message.text)}</p>
        </article>
      `;
    })
    .join("");
  elements.chatMessageList.scrollTop = elements.chatMessageList.scrollHeight;
}

function renderAll() {
  syncStateFromProject();
  renderTopbar();
  renderStatus();
  renderTabs();
  renderActivePanel();
  renderMessages();
}

function focusSceneEditor(field) {
  if (!field) {
    return;
  }

  window.requestAnimationFrame(() => {
    const target = document.querySelector(`[data-scene-field="${field}"]`);
    if (!target || target.disabled) {
      return;
    }

    target.focus();
    target.setSelectionRange?.(target.value.length, target.value.length);
  });
}

function selectScene(sceneId, fieldToFocus = "") {
  if (!sceneId) {
    return;
  }

  state.selectedSceneId = sceneId;
  renderActivePanel();
  renderMessages();
  focusSceneEditor(fieldToFocus);
}

function setCurrentTab(tabId) {
  stateStore.patchProject({
    currentTab: tabId
  });
  renderAll();
}

function pushMessage(role, text, type = "note", options = {}) {
  const nextText = String(text || "").trim();
  if (!nextText) {
    return;
  }

  const nextMessage = normalizeMessage({
    id: options.id || `msg-${Date.now()}`,
    role,
    sceneId: options.sceneId || null,
    type,
    timestamp: options.timestamp || new Date().toISOString(),
    text: nextText
  });
  setProjectMessages([...state.messages, nextMessage]);
  renderMessages();
}

function patchScene(sceneId, patch = {}) {
  const scenes = getAllScenes().map((scene) => {
    if (scene.id !== sceneId) {
      return scene;
    }

    return {
      ...scene,
      ...patch
    };
  });
  const scriptApproved = scenes.length > 0 && scenes.every((scene) => scene.approved);

  stateStore.patchProject({
    script: {
      ...state.project.script,
      approved: scriptApproved,
      scenes
    },
    progress: {
      ...state.project.progress,
      currentTask: scriptApproved ? "Roteiro aprovado" : state.project.progress.currentTask,
      elapsedMs: state.progress.elapsedSeconds * 1000
    }
  });
}

function patchSceneTechSettings(sceneId, settingsPatch = {}, options = {}) {
  const scene = getSceneById(sceneId);
  if (!scene) {
    return;
  }

  const currentSettings = getSceneTechSettings(scene);
  const nextSettings = {
    ...currentSettings,
    ...settingsPatch
  };

  if (options.markCustom !== false && !Object.prototype.hasOwnProperty.call(settingsPatch, "preset")) {
    nextSettings.preset = "custom";
  }

  const scenePatch = {
    generationSettings: nextSettings,
    status: options.keepStatus ? scene.status : "edited"
  };

  if (Object.prototype.hasOwnProperty.call(settingsPatch, "duration")) {
    scenePatch.duration = Number(nextSettings.duration || scene.duration || 5);
  }

  patchScene(sceneId, scenePatch);
  syncStateFromProject();
  renderActivePanel();
  renderMessages();
}

function applySceneTechPreset(sceneId, presetId = "standard") {
  const scene = getSceneById(sceneId);
  if (!scene) {
    return;
  }

  const preset = SCENE_TECH_PRESETS[presetId] || SCENE_TECH_PRESETS.standard;
  const current = getSceneTechSettings(scene);
  patchSceneTechSettings(sceneId, {
    ...current,
    ...preset,
    duration: current.duration || scene.duration || 5,
    ratio: current.ratio || state.project?.briefing?.ratio || ""
  }, {
    markCustom: false
  });
}

function updateSceneTechField(sceneId, field, rawValue) {
  const scene = getSceneById(sceneId);
  if (!scene) {
    return;
  }

  if (field === "preset") {
    applySceneTechPreset(sceneId, rawValue || "standard");
    return;
  }

  if (field === "resolution") {
    const resolution = parseResolution(rawValue);
    patchSceneTechSettings(sceneId, resolution);
    return;
  }

  const numericFields = new Set(["duration", "fps", "steps", "cfg", "denoise"]);
  const nextValue = numericFields.has(field)
    ? Number(rawValue || 0)
    : rawValue;
  patchSceneTechSettings(sceneId, {
    [field]: nextValue
  });
}

function setSceneTechFrame(sceneId, frameField) {
  const scene = getSceneById(sceneId);
  if (!scene) {
    return;
  }

  const referenceImage = resolveSceneReferenceImage(scene);
  const mediaPath = /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(getSceneMediaPath(scene)) ? getSceneMediaPath(scene) : "";
  const nextImage = mediaPath || referenceImage;
  if (!nextImage) {
    pushMessage("system", "Nao encontrei uma imagem valida para usar como quadro da cena.", "warning", {
      sceneId
    });
    return;
  }

  patchSceneTechSettings(sceneId, {
    [frameField]: nextImage
  });
  void saveStudioProjectSilently();
  pushMessage("assistant", `${frameField === "startImage" ? "Quadro inicial" : "Quadro final"} definido para a cena ${scene.index}.`, "media-generation", {
    sceneId
  });
}

function handleSceneTechAction(sceneId, action) {
  const scene = getSceneById(sceneId);
  if (!scene) {
    return;
  }

  if (action === "add-reference") {
    selectScene(sceneId, "references");
    void loadReferenceLibrary("client-media");
    return;
  }

  if (action === "add-persona") {
    const settings = getSceneTechSettings(scene);
    patchSceneTechSettings(sceneId, {
      useProjectPersona: !settings.useProjectPersona
    });
    void saveStudioProjectSilently();
    return;
  }

  if (action === "generate-image") {
    void generateSelectedSceneImage(sceneId);
    return;
  }

  if (action === "generate-video") {
    void generateSelectedSceneVideo(sceneId);
    return;
  }

  if (action === "set-start-frame") {
    setSceneTechFrame(sceneId, "startImage");
    return;
  }

  if (action === "set-end-frame") {
    setSceneTechFrame(sceneId, "endImage");
    return;
  }

  if (action === "interpolate") {
    const settings = getSceneTechSettings(scene);
    patchSceneTechSettings(sceneId, {
      interpolationReady: !settings.interpolationReady
    });
    void saveStudioProjectSilently();
    pushMessage("assistant", `Interpolacao futura ${!settings.interpolationReady ? "preparada" : "desativada"} na cena ${scene.index}.`, "media-generation", {
      sceneId
    });
    return;
  }

  if (action === "regenerate-media") {
    if (shouldUseVideoGeneration(scene)) {
      void generateSelectedSceneVideo(sceneId);
    } else {
      void generateSelectedSceneImage(sceneId);
    }
  }
}

async function applySceneInstruction(instruction) {
  const scene = getCurrentChatScene();
  if (!scene) {
    return false;
  }

  if (scene.approved) {
    pushMessage("system", `Cena ${scene.index} está aprovada. Clique em revisar/desbloquear antes de editar.`, "locked", {
      sceneId: scene.id
    });
    return false;
  }

  if (!window.kitAPI?.applyStudioSceneInstruction) {
    pushMessage("system", "Ajuste contextual indisponivel nesta janela.", "warning", {
      sceneId: scene.id
    });
    return false;
  }

  try {
    stateStore.patchProject({
      progress: {
        ...state.project.progress,
        currentTask: `Aplicando ajuste contextual na cena ${scene.index}`,
        elapsedMs: state.progress.elapsedSeconds * 1000
      }
    });
    syncStateFromProject();
    renderStatus();

    const result = await window.kitAPI.applyStudioSceneInstruction({
      projectId: state.project?.id || "",
      sceneId: scene.id,
      instruction,
      scene,
      briefing: state.project?.briefing || {}
    });

    if (!result?.updatedScene) {
      pushMessage("system", "Nao houve retorno valido para ajustar a cena.", "warning", {
        sceneId: scene.id
      });
      return false;
    }

    patchScene(scene.id, {
      ...result.updatedScene,
      approved: false
    });
    stateStore.patchProject({
      progress: {
        ...state.project.progress,
        currentTask: `Ajuste contextual aplicado na cena ${scene.index}`,
        elapsedMs: state.progress.elapsedSeconds * 1000
      }
    });
    syncStateFromProject();
    renderAll();
    await saveStudioProjectSilently();
    pushMessage("assistant", result.assistantMessage || `Ajuste aplicado na cena ${scene.index}.`, "scene-context", {
      sceneId: scene.id
    });
    return true;
  } catch (err) {
    pushMessage("system", `Nao consegui ajustar a cena agora: ${err.message || err}`, "warning", {
      sceneId: scene.id
    });
    return false;
  }
}

async function generateSelectedSceneImage(sceneId = "") {
  const scene = sceneId ? getSceneById(sceneId) : getSelectedScene();
  if (!scene) {
    return false;
  }

  if (scene.approved) {
    pushMessage("system", `Cena ${scene.index} está aprovada. Clique em revisar/desbloquear antes de gerar nova imagem.`, "locked", {
      sceneId: scene.id
    });
    return false;
  }

  if (!window.kitAPI?.generateStudioSceneImage) {
    pushMessage("system", "Geracao de imagem do Studio indisponivel nesta janela.", "warning", {
      sceneId: scene.id
    });
    return false;
  }

  const generationPayload = buildImageGenerationPayload(scene);

  try {
    stateStore.patchProject({
      progress: {
        ...state.project.progress,
        currentTask: `Gerando imagem da cena ${scene.index}`,
        elapsedMs: state.progress.elapsedSeconds * 1000
      }
    });
    patchScene(scene.id, {
      status: "gerando mídia",
      productionStatus: "gerando mídia"
    });
    syncStateFromProject();
    renderAll();

    const result = await window.kitAPI.generateStudioSceneImage({
      ...generationPayload
    });

    const generatedMedia = {
      id: result.mediaId,
      mediaId: result.mediaId,
      type: result.type || "image",
      kind: result.type || "image",
      path: result.path,
      filePath: result.path,
      thumbnailPath: result.thumbnailPath || result.path,
      source: "ai-media",
      metadata: result.metadata || {}
    };

    patchScene(scene.id, {
      generatedMedia,
      status: "media-ready",
      productionStatus: "pronto"
    });
    stateStore.patchProject({
      progress: {
        ...state.project.progress,
        currentTask: `Imagem gerada para a cena ${scene.index}`,
        elapsedMs: state.progress.elapsedSeconds * 1000
      }
    });
    syncStateFromProject();
    renderAll();
    await saveStudioProjectSilently();
    pushMessage("assistant", `Imagem da cena ${scene.index} gerada com sucesso e vinculada ao projeto.`, "media-generation", {
      sceneId: scene.id
    });
    return true;
  } catch (err) {
    patchScene(scene.id, {
      status: "erro",
      productionStatus: "erro"
    });
    syncStateFromProject();
    renderAll();
    pushMessage("system", `Nao consegui gerar a imagem da cena ${scene.index}: ${err.message || err}`, "warning", {
      sceneId: scene.id
    });
    return false;
  }
}

async function waitForVideoJob(jobId = "", timeoutMs = 180000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    const response = await window.kitAPI.getStudioVideoJobStatus({
      jobId
    });
    const job = response?.job || null;
    if (!job) {
      throw new Error("Job de video nao encontrado durante o acompanhamento.");
    }

    if (job.status === "completed" || job.status === "failed") {
      return job;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 900));
  }

  throw new Error("Tempo limite aguardando geracao de video.");
}

async function generateSelectedSceneVideo(sceneId = "") {
  const scene = sceneId ? getSceneById(sceneId) : getSelectedScene();
  if (!scene) {
    return false;
  }

  if (scene.approved) {
    pushMessage("system", `Cena ${scene.index} está aprovada. Clique em revisar/desbloquear antes de gerar novo vídeo.`, "locked", {
      sceneId: scene.id
    });
    return false;
  }

  if (!window.kitAPI?.generateStudioSceneVideo || !window.kitAPI?.getStudioVideoJobStatus) {
    pushMessage("system", "Geracao de video do Studio indisponivel nesta janela.", "warning", {
      sceneId: scene.id
    });
    return false;
  }

  const generationPayload = buildSceneGenerationPayload(scene);

  try {
    stateStore.patchProject({
      progress: {
        ...state.project.progress,
        currentTask: `Gerando video da cena ${scene.index}`,
        elapsedMs: state.progress.elapsedSeconds * 1000
      }
    });
    patchScene(scene.id, {
      status: "gerando mídia",
      productionStatus: "gerando mídia"
    });
    syncStateFromProject();
    renderAll();

    const created = await window.kitAPI.generateStudioSceneVideo({
      ...generationPayload
    });

    const finalJob = await waitForVideoJob(created?.job?.id || "");
    if (finalJob.status !== "completed" || !finalJob.output?.path) {
      throw new Error(finalJob.error || "Job de video terminou sem arquivo final.");
    }

    const generatedMedia = {
      id: finalJob.output.mediaId || finalJob.id,
      mediaId: finalJob.output.mediaId || finalJob.id,
      type: finalJob.output.type || "video",
      kind: finalJob.output.type || "video",
      path: finalJob.output.path,
      filePath: finalJob.output.path,
      thumbnailPath: finalJob.output.thumbnailPath || "",
      source: "ai-media",
      metadata: finalJob.output.metadata || {}
    };

    patchScene(scene.id, {
      generatedMedia,
      generationMode: finalJob.output?.metadata?.mode || scene.generationMode,
      status: "media-ready",
      productionStatus: "pronto"
    });
    stateStore.patchProject({
      progress: {
        ...state.project.progress,
        currentTask: `Video gerado para a cena ${scene.index}`,
        elapsedMs: state.progress.elapsedSeconds * 1000
      }
    });
    syncStateFromProject();
    renderAll();
    await saveStudioProjectSilently();
    pushMessage("assistant", `Vídeo da cena ${scene.index} gerado com sucesso em ${finalJob.output.metadata?.mode || "auto"}.`, "media-generation", {
      sceneId: scene.id
    });
    return true;
  } catch (err) {
    patchScene(scene.id, {
      status: "erro",
      productionStatus: "erro"
    });
    syncStateFromProject();
    renderAll();
    pushMessage("system", `Nao consegui gerar o vídeo da cena ${scene.index}: ${err.message || err}`, "warning", {
      sceneId: scene.id
    });
    return false;
  }
}

function approveScene(sceneId) {
  const scene = getSceneById(sceneId);
  if (!scene) {
    return;
  }

  patchScene(sceneId, {
    approved: true,
    status: "approved"
  });
  pushMessage("assistant", `Cena ${scene.index} aprovada e bloqueada para edição direta.`, "approval", {
    sceneId
  });
  renderAll();
}

function unlockScene(sceneId) {
  const scene = getSceneById(sceneId);
  if (!scene) {
    return;
  }

  patchScene(sceneId, {
    approved: false,
    status: "review"
  });
  pushMessage("assistant", `Cena ${scene.index} desbloqueada para revisão.`, "review", {
    sceneId
  });
  renderAll();
}

function regenerateSceneText(sceneId) {
  const scene = getSceneById(sceneId);
  if (!scene || scene.approved) {
    return;
  }

  patchScene(sceneId, {
    narration: scene.narration || `Cena ${scene.index}: ${state.project.briefing.theme || state.projectName}.`,
    subtitle: scene.subtitle || scene.title || `Cena ${scene.index}`,
    status: "text-ready"
  });
  pushMessage("assistant", `Texto base regenerado para a cena ${scene.index}.`, "scene-text", {
    sceneId
  });
  renderAll();
}

function approveAllScenes() {
  const scenes = getAllScenes();
  if (!scenes.length) {
    pushMessage("system", "Ainda nao ha cenas para aprovar.", "warning");
    return;
  }

  stateStore.patchProject({
    script: {
      ...state.project.script,
      approved: true,
      scenes: scenes.map((scene) => ({
        ...scene,
        approved: true,
        status: "approved"
      }))
    },
    progress: {
      ...state.project.progress,
      currentTask: "Roteiro completo aprovado",
      percent: Math.max(state.progress.percent, 74),
      elapsedMs: state.progress.elapsedSeconds * 1000
    }
  });
  pushMessage("assistant", "Roteiro completo aprovado. O botão Gerar produção foi liberado.", "approval");
  renderAll();
}

function updateSelectedSceneField(field, value) {
  const scene = getSelectedScene();
  if (!scene || scene.approved) {
    return;
  }

  const patch = field === "references"
    ? {
      references: parseReferenceLines(value),
      clientMediaRefs: [],
      aiMediaRefs: [],
      uploadedRefs: []
    }
    : { [field]: value };
  patchScene(scene.id, {
    ...patch,
    status: "edited"
  });
  syncStateFromProject();
  renderActivePanel();
  renderMessages();
  if (field === "references") {
    void saveStudioProjectSilently();
  }
}

function clearProductionTimers() {
  while (productionTimers.length) {
    window.clearTimeout(productionTimers.pop());
  }
}

function setSceneProductionStatus(sceneId, productionStatus, generatedMedia = null) {
  const patch = {
    productionStatus,
    status: productionStatus
  };

  if (generatedMedia) {
    patch.generatedMedia = generatedMedia;
  }

  patchScene(sceneId, patch);
  stateStore.patchProject({
    production: {
      ...state.project.production,
      jobs: (state.project.production?.jobs || []).map((job) => (
        job.sceneId === sceneId
          ? { ...job, status: productionStatus }
          : job
      ))
    }
  });
  syncStateFromProject();
  renderActivePanel();
  renderStatus();
}

function startProduction() {
  if (!areAllScenesApproved()) {
    pushMessage("system", "A produção só pode começar quando todas as cenas estiverem aprovadas.", "warning");
    return;
  }

  clearProductionTimers();
  const scenes = getAllScenes();
  stateStore.patchProject({
    currentStep: "production",
    currentTab: "script",
    production: {
      ...state.project.production,
      status: "running",
      jobs: scenes.map((scene) => ({
        sceneId: scene.id,
        status: "aguardando"
      })),
      errors: []
    },
    progress: {
      ...state.project.progress,
      currentTask: "Produção em andamento",
      percent: Math.max(state.progress.percent, 78),
      elapsedMs: state.progress.elapsedSeconds * 1000
    }
  });

  scenes.forEach((scene, sceneIndex) => {
    PRODUCTION_STATUS_STEPS.forEach((status, stepIndex) => {
      const timer = window.setTimeout(() => {
        const isReady = status === "pronto";
        setSceneProductionStatus(scene.id, status, isReady ? {
          type: scene.mediaType || "video",
          path: getSceneMediaPath(scene) || "",
          status: getSceneMediaPath(scene) ? "ready" : "placeholder-ready",
          note: getSceneMediaPath(scene) ? "Asset real conectado." : "Asset real sera conectado nas proximas etapas."
        } : null);

        if (sceneIndex === scenes.length - 1 && stepIndex === PRODUCTION_STATUS_STEPS.length - 1) {
          stateStore.patchProject({
            production: {
              ...state.project.production,
              status: "ready"
            },
            progress: {
              ...state.project.progress,
              currentTask: "Produção concluída. Projeto pronto para exportar/salvar no Canvas.",
              percent: 100,
              elapsedMs: state.progress.elapsedSeconds * 1000
            }
          });
          pushMessage("assistant", "Produção concluída. Os status das fichas foram atualizados e o projeto está pronto para a próxima etapa de exportação.", "production");
          renderAll();
        }
      }, (sceneIndex * 1400) + (stepIndex * 700));
      productionTimers.push(timer);
    });
  });

  pushMessage("assistant", "Produção iniciada dentro da aba Roteiro. Vou atualizar cada ficha conforme avança.", "production");
  renderAll();
}

async function generateScriptFromBriefing() {
  if (!window.kitAPI?.generateStudioScript) {
    pushMessage("system", "Gerador de roteiro indisponivel nesta janela.", "warning");
    return null;
  }

  try {
    const result = await window.kitAPI.generateStudioScript({
      projectId: state.project.id,
      briefing: state.project.briefing,
      clientKit: state.project.briefing?.defaultsFromClientKit || null
    });

    if (!Array.isArray(result?.scenes) || !result.scenes.length) {
      pushMessage("system", "Gerador retornou sem cenas. Mantive o roteiro atual.", "warning");
      return null;
    }

    return result;
  } catch (err) {
    pushMessage("system", `Nao consegui gerar roteiro completo agora: ${err.message || err}`, "warning");
    return null;
  }
}

async function approveBriefing() {
  const caption = state.project.postCaption || buildProjectCaption();
  state.currentTask = "Briefing aprovado. Roteiro pronto para refinamento.";
  state.progress.percent = 58;
  state.progress.completedSteps = 2;
  pushMessage("assistant", "Briefing aprovado. Vou gerar o roteiro completo em fichas independentes.", "approval");
  const generatedScript = await generateScriptFromBriefing();
  stateStore.patchProject({
    briefingApproved: true,
    currentStep: "script",
    currentTab: "script",
    unlockedTabs: Array.from(new Set([...(state.project.unlockedTabs || []), "script"])),
    postCaption: generatedScript?.postCaption || caption,
    briefing: {
      ...state.project.briefing,
      approved: true,
      postCaption: generatedScript?.postCaption || caption
    },
    ...(generatedScript ? {
      script: {
        approved: false,
        totalDuration: generatedScript.totalDuration,
        scenes: generatedScript.scenes
      }
    } : {}),
    progress: {
      currentTask: generatedScript ? "Roteiro completo gerado" : state.currentTask,
      percent: generatedScript ? 68 : state.progress.percent,
      completedSteps: state.progress.completedSteps,
      totalSteps: state.progress.totalSteps,
      elapsedMs: state.progress.elapsedSeconds * 1000
    }
  });
  pushMessage(
    "assistant",
    generatedScript
      ? `Roteiro completo gerado com ${generatedScript.scenes.length} cenas. A aba Roteiro esta pronta para aprovacao individual.`
      : `Briefing aprovado. Gerei a legenda de postagem e liberei a aba Roteiro.\n\n${caption}`,
    generatedScript ? "script" : "approval"
  );
  renderAll();
}

function approveScript() {
  approveAllScenes();
}

function buildProjectCaption() {
  const briefing = state.project?.briefing || {};
  if (state.project.postCaption || briefing.postCaption) {
    return state.project.postCaption || briefing.postCaption;
  }

  const target = briefing.theme || state.projectName;
  const purpose = briefing.purpose || "conteudo visual";
  const platform = briefing.platform || "redes sociais";
  const callToAction = state.project?.clientName && state.project.clientName !== "Cliente nao definido"
    ? `Fale com ${state.project.clientName} e saiba mais.`
    : "Chame agora e saiba mais.";

  return `${target}\n\n${purpose}\n\nFormato pensado para ${platform}, com visual claro, direto e facil de entender.\n\n${callToAction}`;
}

function applyBriefingField(field, value) {
  const listFields = new Set(["characters", "styleList", "materialReferences"]);
  const nextValue = listFields.has(field)
    ? String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    : value;

  if (field === "postCaption") {
    stateStore.patchProject({
      postCaption: String(nextValue || ""),
      briefing: {
        ...state.project.briefing,
        postCaption: String(nextValue || "")
      }
    });
    return;
  }

  stateStore.updateBriefing(field, nextValue);
}

function generatePostCaption() {
  const caption = buildProjectCaption();
  stateStore.patchProject({
    postCaption: caption,
    progress: {
      ...state.project.progress,
      currentTask: "Legenda de postagem gerada",
      percent: Math.max(state.progress.percent, 62),
      elapsedMs: state.progress.elapsedSeconds * 1000
    }
  });
  pushMessage("assistant", `Legenda gerada para o projeto:\n\n${caption}`, "caption");
  renderAll();
}

async function saveBriefing() {
  syncStateFromProject();
  try {
    if (window.kitAPI?.saveStudioProject) {
      const saved = await window.kitAPI.saveStudioProject({
        project: state.project,
        filePath: state.filePath || ""
      });
      if (saved?.filePath) {
        state.filePath = saved.filePath;
      }
    }

    pushMessage("assistant", "Briefing salvo no projeto atual.", "save");
  } catch {
    pushMessage("system", "Nao consegui salvar em arquivo agora, mas as edicoes ficaram aplicadas no projeto aberto.", "warning");
  }
}

async function saveStudioProjectSilently() {
  syncStateFromProject();
  try {
    if (!window.kitAPI?.saveStudioProject) {
      return;
    }

    const saved = await window.kitAPI.saveStudioProject({
      project: state.project,
      filePath: state.filePath || ""
    });

    if (saved?.filePath) {
      state.filePath = saved.filePath;
    }
  } catch {}
}

async function loadReferenceLibrary(tabId = state.referenceLibrary.activeTab || "client-media") {
  const selectedScene = getSelectedScene();
  if (!selectedScene) {
    return;
  }

  state.referenceLibrary.open = true;
  state.referenceLibrary.loading = true;
  state.referenceLibrary.error = "";
  state.referenceLibrary.activeTab = tabId;
  renderActivePanel();

  const query = {
    clientId: state.project?.clientId || "",
    clientName: state.project?.clientName || "",
    projectId: state.project?.id || ""
  };

  try {
    let response = { items: [] };
    if (tabId === "client-media") {
      response = await window.kitAPI?.getStudioClientMedia?.(query);
    } else if (tabId === "ai-media") {
      response = await window.kitAPI?.getStudioAiMedia?.(query);
    } else {
      response = await window.kitAPI?.getStudioProjectAttachments?.({
        projectId: state.project?.id || ""
      });
    }

    state.referenceLibrary.items[tabId] = Array.isArray(response?.items)
      ? response.items.map((item) => normalizeReferenceItem(item, tabId))
      : [];
  } catch (err) {
    state.referenceLibrary.error = err?.message || "Nao consegui carregar esta biblioteca agora.";
  } finally {
    state.referenceLibrary.loading = false;
    renderActivePanel();
  }
}

function closeReferenceLibrary() {
  state.referenceLibrary.open = false;
  state.referenceLibrary.loading = false;
  state.referenceLibrary.error = "";
  renderActivePanel();
}

async function toggleSceneReference(source = "", referenceId = "") {
  const selectedScene = getSelectedScene();
  if (!selectedScene || selectedScene.approved) {
    pushMessage("system", "Desbloqueie a cena antes de alterar referencias.", "locked", {
      sceneId: selectedScene?.id || null
    });
    return;
  }

  const sourceItems = Array.isArray(state.referenceLibrary.items?.[source]) ? state.referenceLibrary.items[source] : [];
  const chosen = sourceItems.find((item) => String(item.id) === String(referenceId));
  if (!chosen) {
    return;
  }

  const field = getLibraryFieldBySource(source);
  const normalized = normalizeReferenceItem(chosen, source);
  const currentSpecific = Array.isArray(selectedScene[field]) ? selectedScene[field] : [];
  const currentAll = Array.isArray(selectedScene.references) ? selectedScene.references : [];
  const alreadySelected = currentSpecific.some((item) => areReferencesEqual(item, normalized));

  const nextSpecific = alreadySelected
    ? currentSpecific.filter((item) => !areReferencesEqual(item, normalized))
    : [...currentSpecific, normalized];

  const nextAll = alreadySelected
    ? currentAll.filter((item) => !areReferencesEqual(item, normalized))
    : [...currentAll, normalized];

  patchScene(selectedScene.id, {
    [field]: nextSpecific,
    references: nextAll,
    status: "references-updated"
  });
  syncStateFromProject();
  renderActivePanel();
  await saveStudioProjectSilently();
}

async function registerManualChatMessage() {
  const value = elements.chatInput.value.trim();
  if (!value) {
    return;
  }

  const scene = getCurrentChatScene();
  pushMessage("user", value, scene ? "scene-adjustment" : "manual", {
    sceneId: scene?.id || null
  });

  if (scene) {
    await applySceneInstruction(value);
  } else {
    pushMessage("assistant", "Mensagem registrada no contexto do projeto atual.", "status");
  }

  elements.chatInput.value = "";
  renderMessages();
}

function applyIncomingState(nextState = {}) {
  if (!nextState || typeof nextState !== "object") {
    return;
  }

  const incomingProject = nextState.project || nextState;
  stateStore.replaceProject(incomingProject);
  state.filePath = nextState.filePath || state.filePath || null;

  if (Array.isArray(nextState.messages)) {
    setProjectMessages(nextState.messages);
  } else if (!Array.isArray(state.messages)) {
    setProjectMessages([]);
  }

  renderAll();
}

function bindEvents() {
  elements.studioTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab-id]");
    if (!button) {
      return;
    }

    setCurrentTab(button.dataset.tabId);
  });

  elements.studioTabPanel.addEventListener("click", (event) => {
    const sceneTechActionButton = event.target.closest("[data-scene-tech-action]");
    if (sceneTechActionButton) {
      handleSceneTechAction(sceneTechActionButton.dataset.sceneId, sceneTechActionButton.dataset.sceneTechAction);
      return;
    }

    const sceneActionButton = event.target.closest("[data-scene-action]");
    if (sceneActionButton) {
      const scene = getSceneById(sceneActionButton.dataset.sceneId);
      if (!scene) {
        return;
      }

      state.selectedSceneId = scene.id;
      const action = sceneActionButton.dataset.sceneAction;

      if (action === "approve") {
        approveScene(scene.id);
        return;
      }

      if (action === "unlock") {
        unlockScene(scene.id);
        return;
      }

      if (action === "edit-text") {
        selectScene(scene.id, "narration");
        elements.chatInput.placeholder = `Editar texto da cena ${scene.index}`;
      } else if (action === "edit-subtitle") {
        selectScene(scene.id, "subtitle");
        elements.chatInput.placeholder = `Editar legenda da cena ${scene.index}`;
      } else if (action === "adjust" || action === "adjust-prompt") {
        selectScene(scene.id, "visualPrompt");
        elements.chatInput.placeholder = `Ajustar prompt da cena ${scene.index}`;
      } else if (action === "adjust-references") {
        selectScene(scene.id, "references");
        elements.chatInput.placeholder = `Ajustar referencias da cena ${scene.index}`;
        void loadReferenceLibrary("client-media");
      } else if (action === "generate-video") {
        void generateSelectedSceneVideo(scene.id);
        return;
      } else if (action === "generate-image") {
        void generateSelectedSceneImage(scene.id);
        return;
      } else if (action === "context") {
        selectScene(scene.id);
        elements.chatInput.placeholder = `Chat contextual da cena ${scene.index}: ${scene.title}`;
      } else if (action === "regenerate") {
        regenerateSceneText(scene.id);
        return;
      }

      if (action === "context") {
        elements.chatInput.focus();
      }
      return;
    }

    const referenceActionButton = event.target.closest("[data-reference-action]");
    if (referenceActionButton) {
      const action = referenceActionButton.dataset.referenceAction;
      if (action === "close") {
        closeReferenceLibrary();
        return;
      }

      const source = referenceActionButton.dataset.referenceSource || state.referenceLibrary.activeTab;
      const referenceId = referenceActionButton.dataset.referenceId || "";
      void toggleSceneReference(source, referenceId);
      return;
    }

    const referenceTabButton = event.target.closest("[data-reference-tab]");
    if (referenceTabButton) {
      void loadReferenceLibrary(referenceTabButton.dataset.referenceTab);
      return;
    }

    if (event.target.matches("[data-reference-overlay]")) {
      closeReferenceLibrary();
      return;
    }

    const sceneCard = event.target.closest("[data-scene-card-id]");
    if (sceneCard) {
      selectScene(sceneCard.dataset.sceneCardId);
      return;
    }

    const sceneButton = event.target.closest("[data-scene-id]");
    if (sceneButton) {
      selectScene(sceneButton.dataset.sceneId);
      return;
    }
  });

  elements.studioTabPanel.addEventListener("click", (event) => {
    const scriptActionButton = event.target.closest("[data-script-action]");
    if (!scriptActionButton) {
      return;
    }

    if (scriptActionButton.dataset.scriptAction === "approve-all") {
      approveAllScenes();
      return;
    }

    if (scriptActionButton.dataset.scriptAction === "start-production") {
      startProduction();
    }
  });

  elements.studioTabPanel.addEventListener("change", (event) => {
    const sceneTechField = event.target.closest("[data-scene-tech-field]");
    if (sceneTechField) {
      updateSceneTechField(sceneTechField.dataset.sceneId, sceneTechField.dataset.sceneTechField, sceneTechField.value);
      void saveStudioProjectSilently();
      return;
    }

    const sceneField = event.target.closest("[data-scene-field]");
    if (sceneField) {
      updateSelectedSceneField(sceneField.dataset.sceneField, sceneField.value);
      return;
    }

    const select = event.target.closest("[data-briefing-field]");
    if (!select) {
      return;
    }

    applyBriefingField(select.dataset.briefingField, select.value);
    if (select.dataset.briefingField === "mediaType") {
      state.flowType = select.value === "clip" ? "Clip vertical" : select.value;
    }
    renderAll();
  });

  elements.studioTabPanel.addEventListener("input", (event) => {
    const field = event.target.closest(".briefing-input, .briefing-textarea");
    if (!field || !field.dataset.briefingField) {
      return;
    }

    applyBriefingField(field.dataset.briefingField, field.value);
  });

  elements.studioTabPanel.addEventListener("keydown", (event) => {
    const sceneCard = event.target.closest("[data-scene-card-id]");
    if (!sceneCard) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectScene(sceneCard.dataset.sceneCardId);
    }
  });

  elements.studioTabPanel.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-briefing-action]");
    if (!actionButton) {
      return;
    }

    if (actionButton.dataset.briefingAction === "save") {
      void saveBriefing();
      return;
    }

    if (actionButton.dataset.briefingAction === "approve") {
      approveBriefing();
    }
  });

  elements.sendChatButton.addEventListener("click", registerManualChatMessage);

  elements.chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      elements.sendChatButton.click();
    }
  });

  elements.approveBriefingButton.addEventListener("click", approveBriefing);
  elements.approveScriptButton.addEventListener("click", approveScript);
  elements.generateCaptionButton.addEventListener("click", generatePostCaption);

  elements.minimizeStudioButton.addEventListener("click", () => {
    window.kitAPI?.minimizeStudioWindow?.();
  });

  elements.maximizeStudioButton.addEventListener("click", () => {
    window.kitAPI?.toggleStudioMaximize?.();
  });

  elements.closeStudioButton.addEventListener("click", () => {
    if (window.kitAPI?.closeStudio) {
      window.kitAPI.closeStudio();
      return;
    }

    window.close();
  });
}

function startElapsedClock() {
  window.setInterval(() => {
    state.progress.elapsedSeconds = Math.max(0, Number(state.progress.elapsedSeconds || 0) + 1);
    stateStore.patchProject({
      progress: {
        ...state.project.progress,
        elapsedMs: state.progress.elapsedSeconds * 1000
      }
    });
    elements.elapsedLabel.textContent = formatElapsed(state.progress.elapsedSeconds);
  }, 1000);
}

async function refreshSystemStats() {
  if (!window.kitAPI?.getStudioSystemStats) {
    return;
  }

  try {
    const stats = await window.kitAPI.getStudioSystemStats();
    if (!stats || typeof stats !== "object") {
      return;
    }

    stateStore.patchProject({
      resourceUsage: {
        ...state.project.resourceUsage,
        ...stats
      }
    });
    syncStateFromProject();
    renderTopbar();
  } catch {}
}

function startSystemStatsPolling() {
  void refreshSystemStats();
  window.setInterval(() => {
    void refreshSystemStats();
  }, 5000);
}

async function bootstrapProject() {
  if (window.kitAPI?.getStudioInitialState) {
    try {
      const initialState = await window.kitAPI.getStudioInitialState();
      if (initialState) {
        applyIncomingState(initialState);
        bindEvents();
        startElapsedClock();
        startSystemStatsPolling();
        return;
      }
    } catch {}
  }

  if (!window.kitAPI?.createStudioProject) {
    renderAll();
    bindEvents();
    startElapsedClock();
    startSystemStatsPolling();
    return;
  }

  try {
    const created = await window.kitAPI.createStudioProject(FALLBACK_PROJECT);
    if (created?.project) {
      stateStore.replaceProject(created.project);
      state.filePath = created.filePath || null;
    }
  } catch {}

  renderAll();
  bindEvents();
  startElapsedClock();
  startSystemStatsPolling();
}

if (window.kitAPI?.onStudioInitState) {
  window.kitAPI.onStudioInitState((payload) => {
    applyIncomingState(payload);
  });
}

bootstrapProject();
