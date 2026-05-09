const fabricApi = window.fabric || (typeof require === "function" ? require("fabric") : null);
const nodePath = typeof require === "function" ? require("path") : null;
const nodeUrl = typeof require === "function" ? require("url") : null;

const DEFAULT_ARTBOARD_WIDTH = 1080;
const DEFAULT_ARTBOARD_HEIGHT = 1080;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const MIN_ARTBOARD_SIZE = 64;
const MAX_ARTBOARD_SIZE = 8192;
const FABRIC_CUSTOM_PROPS = [
  "layerId",
  "layerName",
  "layerLocked",
  "lockMovementX",
  "lockMovementY",
  "lockScalingX",
  "lockScalingY",
  "lockRotation",
  "selectable",
  "evented",
  "hasControls",
  "visible",
  "name",
  "isMaskPath",
  "inpaintOriginalPreserved",
  "brushMode",
  "rasterSourceSrc",
  "rasterMaskSrc",
  "rasterEditedAt",
  "layerKind",
  "targetMode",
  "linkedTo",
  "affectedLayerId",
  "parentLayerId",
  "maskLayerId",
  "maskEnabled",
  "mediaType",
  "mediaSourceSrc",
  "mediaDuration",
  "timelineItemId",
  "isToolOverlay",
  "vectorRole",
  "vectorCurvePoints"
];

const ARTBOARD_PRESETS = {
  "instagram-post": { label: "Instagram Post", width: 1080, height: 1080 },
  "instagram-portrait": { label: "Instagram Retrato", width: 1080, height: 1350 },
  "instagram-story": { label: "Instagram Story", width: 1080, height: 1920 },
  reels: { label: "Reels", width: 1080, height: 1920 },
  "youtube-thumb": { label: "YouTube Thumb", width: 1280, height: 720 },
  "youtube-banner": { label: "YouTube Banner", width: 2560, height: 1440 },
  "tiktok-video": { label: "TikTok Video", width: 1080, height: 1920 },
  "facebook-post": { label: "Facebook Post", width: 1200, height: 630 }
};

const OUTPAINT_TARGETS = {
  "instagram-story": { label: "9:16 Story/Reels", ratio: 9 / 16, preset: "instagram-story" },
  "instagram-portrait": { label: "4:5 Retrato", ratio: 4 / 5, preset: "instagram-portrait" },
  "instagram-post": { label: "1:1 Quadrado", ratio: 1, preset: "instagram-post" },
  "youtube-thumb": { label: "16:9 Horizontal", ratio: 16 / 9, preset: "youtube-thumb" }
};

const TOOLBAR_ICON_BASE = "../assets/icones/Toolsbar";
const TOOLBAR_CONFIG = [
  makeToolbarItem("move", "Mover", "mover.svg", "move"),
  makeToolbarGroup("selection", "Selecao", "Selecao-retangular.svg", "selectRect", [
    makeToolbarItem("selection-rect", "Selecao retangular", "Selecao-retangular.svg", "selectRect", null, { shape: "rect" }),
    makeToolbarItem("selection-ellipse", "Selecao eliptica", "Selecao-elipitico.svg", "selectEllipse", null, { shape: "ellipse" })
  ]),
  makeToolbarGroup("advanced-selection", "Selecao avancada", "varinha-magica.svg", "magicWand", [
    makeToolbarItem("magic-wand", "Varinha magica", "varinha-magica.svg", "magicWand")
  ]),
  makeToolbarGroup("media-sticks", "Midia", "foto-filme-musica.svg", null, [
    makeToolbarAction("media", "Midia", "foto-filme-musica.svg", "add-image"),
    makeToolbarAction("sticks", "Stiks", "adesivo.svg", "open-sticks"),
    makeToolbarAction("client-kit", "Kit do cliente", "biblioteca-dos-clientes.svg", "focus-brand-kit")
  ]),
  makeToolbarGroup("brushes", "Pinceis", "pincel.svg", "brush", [
    makeToolbarItem("brush", "Pincel", "pincel.svg", "brush", null, { brushMode: "paint", brushKind: "brush" }),
    makeToolbarItem("pencil", "Lapis", "lapis.svg", "pencil", null, { brushMode: "paint", brushKind: "pencil", hardness: 100 }),
    makeToolbarItem("mask-brush", "Pincel de mascara", "pincel-de-mascara.svg", "maskBrush", null, { brushMode: "mask", brushKind: "mask" }),
    makeToolbarItem("pen", "Pena IA", "pena.svg", "penAI", null, { aiReady: false })
  ]),
  makeToolbarItem("eraser", "Borracha", "apagador.svg", "eraser"),
  makeToolbarGroup("vector", "Caneta / Vetor / Curvas", "vector-caneta.svg", "vectorPen", [
    makeToolbarItem("vector-pen", "Caneta vetor", "vector-caneta.svg", "vectorPen"),
    makeToolbarItem("vector-move-points", "Vetor mover pontos", "vector-mover-pontos.svg", "vectorMovePoints"),
    makeToolbarItem("vector-curve", "Vetor curva", "vector-curva.svg", "vectorCurve")
  ]),
  makeToolbarItem("eyedropper", "Conta-gotas", "pipeta.svg", "eyedropper"),
  makeToolbarAction("color", "Cor primaria/secundaria", "paleta.svg", "color-picker"),
  makeToolbarGroup("text-group", "Texto", "texto.svg", "text", [
    makeToolbarItem("text", "Texto", "texto.svg", "text"),
    makeToolbarItem("text-box", "Caixa de texto", "caixa-delimitada-texto.svg", "textBox", null, { boxed: true })
  ]),
  makeToolbarGroup("shapes", "Formas", "forma-retangular.svg", "rect", [
    makeToolbarItem("rect", "Retangulo", "forma-retangular.svg", "rect", null, { shape: "rect" }),
    makeToolbarItem("rounded-rect", "Retangulo arredondado", "forma-retangular-arredondada.svg", "rounded-rect", null, { shape: "rounded-rect" }),
    makeToolbarItem("ellipse", "Circulo/elipse", "forma-elipice.svg", "ellipse", null, { shape: "ellipse" }),
    makeToolbarItem("pie-shape", "Forma pizza/setor", "forma-elipice.svg", "pieShape", null, { shape: "pie" })
  ]),
  makeToolbarItem("zoom", "Zoom", "zoom.svg", "zoom")
];

function makeToolbarItem(id, label, icon, mouseTool = null, action = null, settings = {}) {
  return {
    id,
    label,
    icon,
    type: "item",
    children: [],
    enabled: true,
    visible: true,
    mouseTool,
    action,
    settings
  };
}

function makeToolbarAction(id, label, icon, action, settings = {}) {
  return {
    id,
    label,
    icon,
    type: "action",
    children: [],
    enabled: true,
    visible: true,
    mouseTool: null,
    action,
    settings
  };
}

function makeToolbarGroup(id, label, icon, mouseTool, children = [], settings = {}) {
  return {
    id,
    label,
    icon,
    type: "group",
    children,
    enabled: true,
    visible: true,
    mouseTool,
    action: null,
    settings: {}
  };
}

const toolbarHost = document.getElementById("toolbarHost");
const TOOLBAR_STATE_KEY = "kitCanvas.toolbarState.v1";
const INSPECTOR_STATE_KEY = "kitCanvas.inspectorState.v1";
const activeToolLabel = document.getElementById("activeToolLabel");
const zoomLabel = document.getElementById("zoomLabel");
const imageInput = document.getElementById("imageInput");
const projectNameInput = document.getElementById("projectName");
const projectStatus = document.getElementById("projectStatus");
const autosaveStatus = document.getElementById("autosaveStatus");
const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");
const undoMenuItem = document.getElementById("undoMenuItem");
const redoMenuItem = document.getElementById("redoMenuItem");
const artboardPreset = document.getElementById("artboardPreset");
const customArtboardControls = document.getElementById("customArtboardControls");
const customWidthInput = document.getElementById("customWidth");
const customHeightInput = document.getElementById("customHeight");
const artboardSizeLabel = document.getElementById("artboardSizeLabel");
const brandKitStatus = document.getElementById("brandKitStatus");
const brandKitName = document.getElementById("brandKitName");
const brandKitVoice = document.getElementById("brandKitVoice");
const brandKitColors = document.getElementById("brandKitColors");
const brandColorPreview = document.getElementById("brandColorPreview");
const brandLogoList = document.getElementById("brandLogoList");
const brandFontList = document.getElementById("brandFontList");
const brandAssetList = document.getElementById("brandAssetList");
const brandXttsLanguage = document.getElementById("brandXttsLanguage");
const brandXttsModel = document.getElementById("brandXttsModel");
const brandXttsSpeaker = document.getElementById("brandXttsSpeaker");
const layerList = document.getElementById("layerList");
const addLayerButton = document.getElementById("addLayerButton");
const mergeLayerButton = document.getElementById("mergeLayerButton");
const propertyEmpty = document.getElementById("propertyEmpty");
const propX = document.getElementById("propX");
const propY = document.getElementById("propY");
const propW = document.getElementById("propW");
const propH = document.getElementById("propH");
const propAngle = document.getElementById("propAngle");
const propOpacity = document.getElementById("propOpacity");
const propSpeed = document.getElementById("propSpeed");
const propFill = document.getElementById("propFill");
const propStroke = document.getElementById("propStroke");
const propStrokeWidth = document.getElementById("propStrokeWidth");
const propFontFamily = document.getElementById("propFontFamily");
const propFontSize = document.getElementById("propFontSize");
const propTextAlign = document.getElementById("propTextAlign");
const brushMode = document.getElementById("brushMode");
const brushColor = document.getElementById("brushColor");
const brushModeRow = document.getElementById("brushModeRow");
const brushColorRow = document.getElementById("brushColorRow");
const brushSize = document.getElementById("brushSize");
const brushSizeValue = document.getElementById("brushSizeValue");
const brushOpacity = document.getElementById("brushOpacity");
const brushOpacityValue = document.getElementById("brushOpacityValue");
const brushHardness = document.getElementById("brushHardness");
const brushHardnessValue = document.getElementById("brushHardnessValue");
const brushStatus = document.getElementById("brushStatus");
const layerMaskStatus = document.getElementById("layerMaskStatus");
const layerMaskBehaviorNote = document.getElementById("layerMaskBehaviorNote");
const toggleMaskPreviewButton = document.getElementById("toggleMaskPreviewButton");
const toggleLayerMaskEnabledButton = document.getElementById("toggleLayerMaskEnabledButton");
const invertLayerMaskButton = document.getElementById("invertLayerMaskButton");
const applyLayerMaskButton = document.getElementById("applyLayerMaskButton");
const deleteLayerMaskButton = document.getElementById("deleteLayerMaskButton");
const sdMaskStatus = document.getElementById("sdMaskStatus");
const sdMaskBehaviorNote = document.getElementById("sdMaskBehaviorNote");
const exportFormat = document.getElementById("exportFormat");
const exportQuality = document.getElementById("exportQuality");
const exportQualityValue = document.getElementById("exportQualityValue");
const exportStatus = document.getElementById("exportStatus");
const sdStatus = document.getElementById("sdStatus");
const sdPrompt = document.getElementById("sdPrompt");
const sdNegativePrompt = document.getElementById("sdNegativePrompt");
const sdCheckpoint = document.getElementById("sdCheckpoint");
const sdArchitecture = document.getElementById("sdArchitecture");
const sdLora = document.getElementById("sdLora");
const sdMode = document.getElementById("sdMode");
const sdI2IMode = document.getElementById("sdI2IMode");
const sdI2IControls = document.getElementById("sdI2IControls");
const sdSourceStatus = document.getElementById("sdSourceStatus");
const sdInpaintMaskContext = document.getElementById("sdInpaintMaskContext");
const sdScheduler = document.getElementById("sdScheduler");
const sdSteps = document.getElementById("sdSteps");
const sdCfgScale = document.getElementById("sdCfgScale");
const sdWidth = document.getElementById("sdWidth");
const sdHeight = document.getElementById("sdHeight");
const sdSeed = document.getElementById("sdSeed");
const sdDenoising = document.getElementById("sdDenoising");
const sdInpaintInsertMode = document.getElementById("sdInpaintInsertMode");
const sdOutpaintTarget = document.getElementById("sdOutpaintTarget");
const sdOutpaintSide = document.getElementById("sdOutpaintSide");
const sdGenerateButton = document.getElementById("sdGenerateButton");
const timelineTrack = document.getElementById("timelineTrack");
const timelineStatus = document.getElementById("timelineStatus");
const timelineResizeHandle = document.getElementById("timelineResizeHandle");
const sidePanelResizeHandle = document.getElementById("sidePanelResizeHandle");
const board = document.querySelector(".fabric-board");
const stageScroll = document.querySelector(".stage-scroll");
const menuGroups = Array.from(document.querySelectorAll(".menu-group"));
const menuTriggers = Array.from(document.querySelectorAll("[data-menu-trigger]"));
const inspectorAccordions = Array.from(document.querySelectorAll(".inspector-accordion"));
const inspectorAccordionToggles = Array.from(document.querySelectorAll("[data-inspector-toggle]"));
const propertyContextLabel = document.getElementById("propertyContextLabel");
const projectInspectorSummary = document.getElementById("projectInspectorSummary");
const projectSummaryName = document.getElementById("projectSummaryName");
const projectSummaryArtboard = document.getElementById("projectSummaryArtboard");
const projectSummaryTool = document.getElementById("projectSummaryTool");
const projectSummaryStatus = document.getElementById("projectSummaryStatus");
const objectInspectorSummary = document.getElementById("objectInspectorSummary");
const objectSummaryType = document.getElementById("objectSummaryType");
const objectSummaryLayer = document.getElementById("objectSummaryLayer");
const objectSummaryTool = document.getElementById("objectSummaryTool");
const propertyTransformGroup = document.getElementById("propertyTransformGroup");
const propertyAppearanceGroup = document.getElementById("propertyAppearanceGroup");
const propertyTextGroup = document.getElementById("propertyTextGroup");
const propertyImageGroup = document.getElementById("propertyImageGroup");
const propertyAlignGroup = document.getElementById("propertyAlignGroup");

let canvas = null;
let artboardObject = null;
let activeTool = "move";
let isPanning = false;
let lastPanPoint = null;
let spacePressed = false;
let artboardWidth = DEFAULT_ARTBOARD_WIDTH;
let artboardHeight = DEFAULT_ARTBOARD_HEIGHT;
let currentArtboardPreset = "instagram-post";
let currentProject = null;
let currentProjectFilePath = null;
let currentBrandKit = null;
let currentBrandKitFilePath = null;
let inheritedBrandKit = null;
let inheritedBrandKitFilePath = null;
let loadedFontFamilies = new Set();
let layerIdCounter = 0;
let activeBrushMode = "paint";
let activeRasterEdit = null;
let maskPreviewVisible = false;
let activeToolPointerState = null;
let selectionTargetLayerId = null;
let selectionState = {
  type: null,
  start: null,
  end: null,
  bounds: null,
  overlay: null,
  active: false
};
let rasterClipboard = null;
let vectorDraft = {
  points: [],
  overlays: []
};
let activeVectorEdit = null;
let editorColors = {
  primary: "#20232A",
  secondary: "#F2B84B"
};
let historySnapshots = [];
let historyIndex = -1;
let isApplyingSnapshot = false;
let isLoadingFabricObjects = false;
let historyTimer = null;
let autosaveTimer = null;
let lastAutosaveProjectHash = "";
let timelineSlides = [];
let timelineItems = [];
let timelineTrackLabels = [];
let activeSlideId = null;
let selectedTimelineItemId = null;
let timelinePlayhead = 0;
let timelinePlaybackFrame = null;
let timelinePlaybackLastTime = 0;
let timelineIsPlaying = false;
let rasterCursorState = {
  element: null,
  visible: false,
  clientX: 0,
  clientY: 0
};
const mediaElements = {
  video: new Map(),
  audio: new Map()
};
const mediaDisplayCanvases = {
  video: new Map()
};
const mediaWaveformCache = new Map();

const HISTORY_LIMIT = 40;
const HISTORY_DEBOUNCE_MS = 250;
const AUTOSAVE_DEBOUNCE_MS = 2500;
const CanvasActionRegistry = new Map();
const TIMELINE_PIXELS_PER_SECOND = 72;
const TIMELINE_TRACK_HEIGHT = 34;
const TIMELINE_LABEL_WIDTH = 86;
const TIMELINE_MIN_TRACKS = 1;
const TIMELINE_TYPE_ICONS = {
  video: "filme.svg",
  image: "foto.svg",
  imagem: "foto.svg",
  music: "musica-alt.svg",
  musica: "musica-alt.svg",
  audio: "toque.svg",
  text: "texto.svg",
  texto: "texto.svg"
};

function getFabricClass(name) {
  return fabricApi?.[name];
}

function configureFabricCustomProperties() {
  const FabricObject = getFabricClass("FabricObject") || getFabricClass("Object");
  if (!FabricObject) {
    return;
  }

  const currentProps = Array.isArray(FabricObject.customProperties)
    ? FabricObject.customProperties
    : [];
  FabricObject.customProperties = [...new Set([...currentProps, ...FABRIC_CUSTOM_PROPS])];
}

function formatNumber(value) {
  return String(Math.round(Number(value || 0)));
}

function getNumericValue(input, fallback = 0) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isTextObject(object) {
  return ["textbox", "i-text", "text"].includes(object?.type);
}

function normalizeHexColor(value, fallback = "#000000") {
  if (isValidHex(value)) {
    return String(value).toUpperCase();
  }

  return fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex, "#000000").replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function colorWithOpacity(hex, opacityPercent) {
  const { r, g, b } = hexToRgb(hex);
  const alpha = clampValue(Number(opacityPercent || 100), 0, 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createLocalDefaultBrandKit() {
  const timestamp = new Date().toISOString();
  return {
    schema: "kit.brand.v1",
    type: "brand-kit",
    version: 1,
    name: "Novo Brand Kit",
    createdAt: timestamp,
    updatedAt: timestamp,
    identity: {
      voice: "",
      description: ""
    },
    colors: [
      { name: "Claro", hex: "#F7F7F2" },
      { name: "Principal", hex: "#2F7F6F" },
      { name: "Destaque", hex: "#F2B84B" },
      { name: "Escuro", hex: "#20232A" }
    ],
    logos: [],
    fonts: [],
    xtts: {
      language: "pt",
      voiceModelPath: "",
      speakerWavPath: "",
      notes: ""
    },
    assets: {
      global: [],
      frames: [],
      watermarks: [],
      recurring: []
    },
    metadata: {}
  };
}

function getFileName(filePath = "") {
  return String(filePath || "").split(/[\\/]/).pop() || "arquivo";
}

function isAbsolutePath(filePath = "") {
  return nodePath?.isAbsolute?.(String(filePath || "")) || /^[a-zA-Z]:[\\/]/.test(String(filePath || ""));
}

function resolveLocalPath(filePath = "", baseFilePath = "") {
  const value = String(filePath || "").trim();
  if (!value || /^(data:|file:|https?:)/i.test(value) || isAbsolutePath(value)) {
    return value;
  }

  const baseDir = baseFilePath && nodePath ? nodePath.dirname(baseFilePath) : "";
  return baseDir && nodePath ? nodePath.resolve(baseDir, value) : value;
}

function toImageUrl(filePath = "", baseFilePath = "") {
  const resolvedPath = resolveLocalPath(filePath, baseFilePath);
  if (!resolvedPath || /^(data:|file:|https?:)/i.test(resolvedPath)) {
    return resolvedPath;
  }

  return nodeUrl?.pathToFileURL ? nodeUrl.pathToFileURL(resolvedPath).href : resolvedPath;
}

function normalizeAssetItem(item = {}, baseFilePath = "") {
  const originalPath = String(item.path || "").trim();
  const resolvedPath = resolveLocalPath(originalPath, baseFilePath);
  return {
    ...item,
    path: originalPath,
    resolvedPath,
    name: item.name || getFileName(originalPath),
    type: item.type || getFileName(originalPath).split(".").pop() || ""
  };
}

function normalizeBrandKitPaths(brandKit = createLocalDefaultBrandKit(), baseFilePath = "") {
  return {
    ...brandKit,
    logos: (brandKit.logos || []).map((item) => normalizeAssetItem(item, baseFilePath)),
    fonts: (brandKit.fonts || []).map((item) => normalizeAssetItem(item, baseFilePath)),
    assets: {
      ...(brandKit.assets || {}),
      global: (brandKit.assets?.global || []).map((item) => normalizeAssetItem(item, baseFilePath)),
      frames: (brandKit.assets?.frames || []).map((item) => normalizeAssetItem(item, baseFilePath)),
      watermarks: (brandKit.assets?.watermarks || []).map((item) => normalizeAssetItem(item, baseFilePath)),
      recurring: (brandKit.assets?.recurring || []).map((item) => normalizeAssetItem(item, baseFilePath))
    }
  };
}

function isValidHex(value = "") {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
}

function parseColorLines(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return null;
      }

      const hexMatch = trimmed.match(/#[0-9a-fA-F]{6}/);
      if (!hexMatch) {
        return null;
      }

      const name = trimmed.replace(hexMatch[0], "").trim() || `Cor ${index + 1}`;
      return {
        name,
        hex: hexMatch[0].toUpperCase()
      };
    })
    .filter(Boolean);
}

function formatColorLines(colors = []) {
  return colors.map((color) => `${color.name || "Cor"} ${color.hex}`).join("\n");
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function mergeBrandKitWithOverrides(parentBrandKit = null, overrides = {}) {
  const base = parentBrandKit || createLocalDefaultBrandKit();
  return {
    ...base,
    colors: hasItems(overrides.colors) ? overrides.colors : (base.colors || []),
    logos: hasItems(overrides.logos) ? overrides.logos : (base.logos || []),
    fonts: hasItems(overrides.fonts) ? overrides.fonts : (base.fonts || []),
    assets: {
      ...(base.assets || {}),
      global: hasItems(overrides.assets?.global) ? overrides.assets.global : (base.assets?.global || [])
    }
  };
}

function createLocalDefaultProject() {
  const timestamp = new Date().toISOString();
  return {
    schema: "kit.project.v1",
    type: "canvas-project",
    version: 1,
    name: "Novo Projeto Canvas",
    createdAt: timestamp,
    updatedAt: timestamp,
    brandKitPath: currentBrandKitFilePath || null,
    artboard: {
      width: DEFAULT_ARTBOARD_WIDTH,
      height: DEFAULT_ARTBOARD_HEIGHT,
      preset: "instagram-post"
    },
    fabric: {
      version: fabricApi?.version || "",
      objects: []
    },
    metadata: {
      app: "KIT IA",
      module: "Canvas KIT IA"
    },
    ai: {
      prompts: [],
      generations: [],
      inpaints: [],
      outpaints: [],
      masks: []
    },
    timeline: {
      slides: [],
      items: [],
      activeSlideId: null,
      audio: [],
      video: []
    },
    history: [
      {
        action: "created",
        at: timestamp
      }
    ]
  };
}

function getFileLabel(filePath = "") {
  return String(filePath || "").split(/[/\\]/).pop() || "";
}

function updateProjectStatus() {
  if (projectStatus) {
    projectStatus.textContent = currentProjectFilePath
      ? `Salvo: ${getFileLabel(currentProjectFilePath)}`
      : "Projeto ainda nao salvo";
  }
  updateProjectInspectorSummary();
}

function updateAutosaveStatus(message = "") {
  if (autosaveStatus) {
    autosaveStatus.textContent = message || "Autosave aguardando";
  }
  updateProjectInspectorSummary();
}

function updateHistoryControls() {
  const canUndo = historyIndex > 0;
  const canRedo = !(historyIndex < 0 || historyIndex >= historySnapshots.length - 1);

  if (undoButton) {
    undoButton.disabled = !canUndo;
  }

  if (undoMenuItem) {
    undoMenuItem.disabled = !canUndo;
  }

  if (redoButton) {
    redoButton.disabled = !canRedo;
  }

  if (redoMenuItem) {
    redoMenuItem.disabled = !canRedo;
  }
}

function closeTopbarMenus() {
  menuGroups.forEach((group) => {
    group.classList.remove("is-open");
    const trigger = group.querySelector("[data-menu-trigger]");
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
    }
  });
}

function toggleTopbarMenu(menuName) {
  let openedMenu = false;
  menuGroups.forEach((group) => {
    const trigger = group.querySelector("[data-menu-trigger]");
    const shouldOpen = trigger?.dataset.menuTrigger === menuName && !group.classList.contains("is-open");
    group.classList.toggle("is-open", shouldOpen);
    if (trigger) {
      trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    }
    if (shouldOpen) {
      openedMenu = true;
    }
  });

  if (!openedMenu) {
    closeTopbarMenus();
  }
}

function syncZoomLabel() {
  if (!zoomLabel || !canvas) {
    return;
  }

  zoomLabel.textContent = `Zoom ${Math.round(canvas.getZoom() * 100)}%`;
}

function syncArtboardLabel() {
  if (artboardSizeLabel) {
    artboardSizeLabel.textContent = `${artboardWidth} x ${artboardHeight}`;
  }

  if (customWidthInput) {
    customWidthInput.value = String(artboardWidth);
  }

  if (customHeightInput) {
    customHeightInput.value = String(artboardHeight);
  }

  updateProjectInspectorSummary();
}

function clampArtboardDimension(value) {
  const numericValue = Math.round(Number(value || 0));
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_ARTBOARD_WIDTH;
  }

  return Math.min(MAX_ARTBOARD_SIZE, Math.max(MIN_ARTBOARD_SIZE, numericValue));
}

function updateBoardPreviewSize() {
  resizeCanvasViewport({ keepCamera: true });
}

function getViewportSize() {
  const bounds = stageScroll?.getBoundingClientRect();
  return {
    width: Math.max(320, Math.round(bounds?.width || 0)),
    height: Math.max(320, Math.round(bounds?.height || 0))
  };
}

function getRectCenter(rect = {}) {
  return {
    x: Number(rect.x || 0) + Number(rect.width || 0) / 2,
    y: Number(rect.y || 0) + Number(rect.height || 0) / 2
  };
}

function getArtboardRect() {
  return {
    x: Number(artboardObject?.left ?? 0),
    y: Number(artboardObject?.top ?? 0),
    width: artboardWidth,
    height: artboardHeight
  };
}

function getObjectLayoutSize(object) {
  return {
    width: Number(object?.getScaledWidth?.() || object?.width || 0),
    height: Number(object?.getScaledHeight?.() || object?.height || 0)
  };
}

function getObjectTopLeft(object) {
  const point = object?.getPointByOrigin?.("left", "top");
  return {
    x: Number(point?.x ?? object?.left ?? 0),
    y: Number(point?.y ?? object?.top ?? 0)
  };
}

function centerObjectInRect(object, rect = getArtboardRect()) {
  if (!object) {
    return null;
  }

  const size = getObjectLayoutSize(object);
  object.set({
    left: Number(rect.x || 0) + (Number(rect.width || 0) - size.width) / 2,
    top: Number(rect.y || 0) + (Number(rect.height || 0) - size.height) / 2,
    originX: "left",
    originY: "top"
  });
  object.setCoords();
  return object;
}

function normalizeAlignment(alignment = "center") {
  return String(alignment || "center").trim().toLowerCase().replace(/_/g, "-");
}

function alignObjectInRect(object, rect = getArtboardRect(), alignment = "center") {
  if (!object) {
    return null;
  }

  const mode = normalizeAlignment(alignment);
  const size = getObjectLayoutSize(object);
  const topLeft = getObjectTopLeft(object);
  const next = {
    left: topLeft.x,
    top: topLeft.y,
    originX: "left",
    originY: "top"
  };

  if (mode === "center" || mode === "center-h" || mode === "horizontal-center" || mode === "center-horizontal") {
    next.left = Number(rect.x || 0) + (Number(rect.width || 0) - size.width) / 2;
  }

  if (mode === "center" || mode === "center-v" || mode === "vertical-center" || mode === "center-vertical") {
    next.top = Number(rect.y || 0) + (Number(rect.height || 0) - size.height) / 2;
  }

  if (mode === "left") {
    next.left = Number(rect.x || 0);
  }

  if (mode === "right") {
    next.left = Number(rect.x || 0) + Number(rect.width || 0) - size.width;
  }

  if (mode === "top") {
    next.top = Number(rect.y || 0);
  }

  if (mode === "bottom" || mode === "base") {
    next.top = Number(rect.y || 0) + Number(rect.height || 0) - size.height;
  }

  object.set(next);
  object.setCoords();
  return object;
}

function resizeCanvasViewport({ keepCamera = true } = {}) {
  if (!canvas) {
    return;
  }

  const currentTransform = [...canvas.viewportTransform];
  const viewport = getViewportSize();
  canvas.setDimensions(viewport);
  canvas.calcOffset();

  if (keepCamera) {
    canvas.setViewportTransform(currentTransform);
  }

  canvas.requestRenderAll();
}

function fitArtboardInViewport() {
  if (!canvas) {
    return;
  }

  resizeCanvasViewport({ keepCamera: false });
  const viewport = getViewportSize();
  const padding = 72;
  const availableWidth = Math.max(120, viewport.width - padding);
  const availableHeight = Math.max(120, viewport.height - padding);
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(
      MIN_ZOOM,
      Math.min(availableWidth / artboardWidth, availableHeight / artboardHeight)
    )
  );
  const artboardCenter = getRectCenter(getArtboardRect());
  const viewportCenter = getRectCenter({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  const panX = Math.round(viewportCenter.x - artboardCenter.x * zoom);
  const panY = Math.round(viewportCenter.y - artboardCenter.y * zoom);

  canvas.setViewportTransform([zoom, 0, 0, zoom, panX, panY]);
  syncZoomLabel();
}

function centerArtboardInViewport() {
  fitArtboardInViewport();
}

function applyArtboardSize(width, height, options = {}) {
  artboardWidth = clampArtboardDimension(width);
  artboardHeight = clampArtboardDimension(height);
  currentArtboardPreset = options.preset || currentArtboardPreset || "custom";

  if (canvas) {
    artboardObject?.set({
      left: 0,
      top: 0,
      width: artboardWidth,
      height: artboardHeight,
      originX: "left",
      originY: "top"
    });
    artboardObject?.setCoords();

    if (options.resetViewport !== false) {
      centerArtboardInViewport();
    }

    canvas.requestRenderAll();
  }

  syncArtboardLabel();
  updateSelectionInfo();

  if (options.recordHistory !== false) {
    markCanvasChanged("artboard");
  }
}

function applyPreset(presetKey) {
  const isCustom = presetKey === "custom";
  if (customArtboardControls) {
    customArtboardControls.hidden = !isCustom;
  }
  currentArtboardPreset = presetKey;

  if (isCustom) {
    return;
  }

  const preset = ARTBOARD_PRESETS[presetKey];
  if (!preset) {
    return;
  }

  applyArtboardSize(preset.width, preset.height, { preset: presetKey });
}

function normalizeToolId(toolId = "move") {
  const aliases = {
    select: "move",
    "selection-rect": "selectRect",
    "selection-ellipse": "selectEllipse",
    "magic-wand": "magicWand",
    "mask-brush": "maskBrush",
    "text-box": "textBox",
    "rounded-rect": "roundedRect",
    "pie-shape": "pieShape",
    pen: "penAI",
    "vector-pen": "vectorPen",
    "vector-move-points": "vectorMovePoints",
    "vector-curve": "vectorCurve",
    color: "colorPicker",
    sticks: "stickers"
  };
  const value = String(toolId || "move").trim();
  return aliases[value] || value;
}

function makeToolHandler(id, label, cursor, overrides = {}) {
  return {
    id,
    label,
    cursor,
    onActivate: activatePassiveTool,
    onDeactivate: null,
    onPointerDown: null,
    onPointerMove: null,
    onPointerUp: null,
    onClickAction: null,
    ...overrides
  };
}

const ToolRegistry = {
  move: makeToolHandler("move", "Mover", "move", {
    onActivate: activateMoveTool
  }),
  selectRect: makeToolHandler("selectRect", "Selecao retangular", "crosshair", {
    onActivate: activateNonSelectingTool,
    onPointerDown: (event) => startSelectionAreaTool(event, "rect"),
    onPointerMove: updateBoxTool,
    onPointerUp: finishSelectionAreaTool
  }),
  selectEllipse: makeToolHandler("selectEllipse", "Selecao eliptica", "crosshair", {
    onActivate: activateNonSelectingTool,
    onPointerDown: (event) => startSelectionAreaTool(event, "ellipse"),
    onPointerMove: updateBoxTool,
    onPointerUp: finishSelectionAreaTool
  }),
  magicWand: makeToolHandler("magicWand", "Varinha magica", "crosshair", {
    onActivate: activateNonSelectingTool,
    onPointerDown: () => showToolNotice("Varinha magica ainda em implementacao")
  }),
  brush: makeToolHandler("brush", "Pincel", "crosshair", {
    onActivate: activateRasterTool,
    onPointerDown: startRasterEdit,
    onPointerMove: continueRasterEdit,
    onPointerUp: finishRasterEdit
  }),
  pencil: makeToolHandler("pencil", "Lapis", "cell", {
    onActivate: activateRasterTool,
    onPointerDown: startRasterEdit,
    onPointerMove: continueRasterEdit,
    onPointerUp: finishRasterEdit
  }),
  eraser: makeToolHandler("eraser", "Apagador", "crosshair", {
    onActivate: activateRasterTool,
    onPointerDown: startRasterEdit,
    onPointerMove: continueRasterEdit,
    onPointerUp: finishRasterEdit
  }),
  maskBrush: makeToolHandler("maskBrush", "Pincel de mascara", "crosshair", {
    onActivate: activateRasterTool,
    onPointerDown: startRasterEdit,
    onPointerMove: continueRasterEdit,
    onPointerUp: finishRasterEdit
  }),
  penAI: makeToolHandler("penAI", "Pena IA", "crosshair", {
    onActivate: activateNonSelectingTool,
    onPointerDown: () => showToolNotice("Pena IA ainda em implementacao")
  }),
  vectorPen: makeToolHandler("vectorPen", "Caneta vetor", "crosshair", {
    onActivate: activateVectorPenTool,
    onDeactivate: clearVectorDraft,
    onPointerDown: addVectorPenPoint
  }),
  vectorMovePoints: makeToolHandler("vectorMovePoints", "Vetor mover pontos", "pointer", {
    onActivate: activateTargetInspectTool,
    onDeactivate: clearVectorEditOverlays,
    onPointerDown: startVectorPointEdit,
    onPointerMove: moveVectorPointEdit,
    onPointerUp: finishVectorPointEdit
  }),
  vectorCurve: makeToolHandler("vectorCurve", "Editar curva", "pointer", {
    onActivate: activateTargetInspectTool,
    onDeactivate: clearVectorEditOverlays,
    onPointerDown: handleVectorCurvePointerDown
  }),
  eyedropper: makeToolHandler("eyedropper", "Pipeta", "copy", {
    onActivate: activateNonSelectingTool,
    onPointerDown: pickColorAtPointer
  }),
  colorPicker: makeToolHandler("colorPicker", "Cor", "default", {
    onClickAction: () => toggleColorPanel()
  }),
  text: makeToolHandler("text", "Texto", "text", {
    onActivate: activateNonSelectingTool,
    onPointerDown: createTextAtPointer
  }),
  textBox: makeToolHandler("textBox", "Caixa de texto", "crosshair", {
    onActivate: activateNonSelectingTool,
    onPointerDown: startTextBoxTool,
    onPointerMove: updateBoxTool,
    onPointerUp: finishTextBoxTool
  }),
  rect: makeToolHandler("rect", "Retangulo", "crosshair", {
    onActivate: activateNonSelectingTool,
    onPointerDown: (event) => startShapeTool(event, "rect"),
    onPointerMove: updateBoxTool,
    onPointerUp: finishShapeTool
  }),
  roundedRect: makeToolHandler("roundedRect", "Retangulo arredondado", "crosshair", {
    onActivate: activateNonSelectingTool,
    onPointerDown: (event) => startShapeTool(event, "roundedRect"),
    onPointerMove: updateBoxTool,
    onPointerUp: finishShapeTool
  }),
  ellipse: makeToolHandler("ellipse", "Circulo/elipse", "crosshair", {
    onActivate: activateNonSelectingTool,
    onPointerDown: (event) => startShapeTool(event, "ellipse"),
    onPointerMove: updateBoxTool,
    onPointerUp: finishShapeTool
  }),
  pieShape: makeToolHandler("pieShape", "Pizza/meia forma", "crosshair", {
    onActivate: activateNonSelectingTool,
    onPointerDown: () => showToolNotice("Forma pizza ainda em implementacao")
  }),
  zoom: makeToolHandler("zoom", "Zoom", "zoom-in", {
    onActivate: activateNonSelectingTool,
    onPointerDown: zoomAtPointer
  }),
  clientKit: makeToolHandler("clientKit", "Kit do cliente", "default", {
    onClickAction: () => executeToolbarAction("focus-brand-kit")
  }),
  media: makeToolHandler("media", "Midia", "default", {
    onClickAction: () => executeToolbarAction("add-image")
  }),
  stickers: makeToolHandler("stickers", "Stiks", "default", {
    onClickAction: () => executeToolbarAction("open-sticks")
  })
};

function getToolHandler(toolId = activeTool) {
  return ToolRegistry[normalizeToolId(toolId)] || null;
}

function getVisibleToolbarItems(items = TOOLBAR_CONFIG) {
  return items.filter((item) => item.visible !== false);
}

function getToolbarItemByTool(tool, items = TOOLBAR_CONFIG) {
  const normalizedTool = normalizeToolId(tool);
  for (const item of items) {
    if (normalizeToolId(item.mouseTool || item.id) === normalizedTool || item.id === tool) {
      return item;
    }

    const child = getToolbarItemByTool(tool, item.children || []);
    if (child) {
      return child;
    }
  }

  return null;
}

function toolbarItemContainsTool(item = {}, tool = "") {
  const normalizedTool = normalizeToolId(tool);
  if (!normalizedTool) {
    return false;
  }

  if (normalizeToolId(item.mouseTool || item.id) === normalizedTool || normalizeToolId(item.id) === normalizedTool) {
    return true;
  }

  return (item.children || []).some((child) => toolbarItemContainsTool(child, tool));
}

function getToolbarIconPath(icon = "") {
  return `${TOOLBAR_ICON_BASE}/${icon}`;
}

function createToolbarButton(item, extraClass = "") {
  const button = document.createElement("button");
  button.className = ["tool-button", extraClass].filter(Boolean).join(" ");
  button.type = "button";
  button.dataset.toolbarId = item.id;
  button.dataset.tooltip = item.label;
  button.title = item.label;
  button.setAttribute("aria-label", item.label);

  if (item.mouseTool) {
    button.dataset.tool = item.mouseTool;
  }

  if (item.action) {
    button.dataset.action = item.action;
  }

  if (item.enabled === false) {
    button.disabled = true;
  }

  const icon = document.createElement("img");
  icon.src = getToolbarIconPath(item.icon);
  icon.alt = "";
  icon.setAttribute("aria-hidden", "true");
  button.appendChild(icon);

  return button;
}

function getDefaultToolbarState() {
  const bounds = getToolbarMovementBounds();
  return {
    x: bounds.left + 14,
    y: bounds.top + 18,
    height: Math.max(280, Math.min(620, bounds.height - 24)),
    anchor: null
  };
}

function getToolbarMovementBounds() {
  const workspaceBounds = document.querySelector(".canvas-workspace")?.getBoundingClientRect?.();
  const stageBounds = document.querySelector(".stage-area")?.getBoundingClientRect?.();
  const bounds = workspaceBounds || stageBounds || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  return {
    left: Number(bounds.left || 0),
    top: Number(bounds.top || 0),
    right: Number(bounds.right || window.innerWidth),
    bottom: Number(bounds.bottom || window.innerHeight),
    width: Number(bounds.width || window.innerWidth),
    height: Number(bounds.height || window.innerHeight)
  };
}

function loadToolbarState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TOOLBAR_STATE_KEY) || "null");
    return {
      ...getDefaultToolbarState(),
      ...(parsed || {})
    };
  } catch (err) {
    return getDefaultToolbarState();
  }
}

function saveToolbarState(state = loadToolbarState()) {
  try {
    localStorage.setItem(TOOLBAR_STATE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Nao foi possivel salvar estado da ToolBox.", err);
  }
}

function clampToolbarState(state = loadToolbarState()) {
  const bounds = getToolbarMovementBounds();
  const maxHeight = Math.max(220, bounds.height - 24);
  const width = 44;
  const height = clampValue(Number(state.height || getDefaultToolbarState().height), 220, maxHeight);
  const anchor = state.anchor === "left" || state.anchor === "right" ? state.anchor : null;
  const x = anchor === "left"
    ? bounds.left + 14
    : anchor === "right"
      ? bounds.right - width - 14
      : Number(state.x ?? bounds.left + 14);
  return {
    x: clampValue(x, bounds.left + 6, bounds.right - width - 6),
    y: clampValue(Number(state.y ?? bounds.top + 18), bounds.top + 6, bounds.bottom - height - 6),
    height,
    anchor
  };
}

function applyToolbarState(state = loadToolbarState()) {
  if (!toolbarHost) {
    return;
  }

  const nextState = clampToolbarState(state);
  const bounds = getToolbarMovementBounds();
  const isRightSide = nextState.x > bounds.left + bounds.width / 2;
  toolbarHost.classList.toggle("is-right", isRightSide);
  toolbarHost.style.top = `${Math.round(nextState.y)}px`;
  toolbarHost.style.height = `${Math.round(nextState.height)}px`;
  toolbarHost.style.left = `${Math.round(nextState.x)}px`;
  toolbarHost.style.right = "auto";
}

function createToolbarDragHandle() {
  const handle = document.createElement("button");
  handle.className = "toolbar-drag-handle";
  handle.type = "button";
  handle.dataset.tooltip = "Mover ToolBox";
  handle.title = "Mover ToolBox";
  handle.setAttribute("aria-label", "Mover ToolBox");
  handle.textContent = "";
  return handle;
}

function createToolbarResizeHandle() {
  const handle = document.createElement("div");
  handle.className = "toolbar-resize-handle";
  handle.title = "Ajustar altura";
  handle.setAttribute("aria-label", "Ajustar altura da ToolBox");
  return handle;
}

function createToolbarScrollZone(direction = "down") {
  const zone = document.createElement("button");
  zone.className = `toolbar-scroll-zone is-${direction}`;
  zone.type = "button";
  zone.dataset.scrollDirection = direction;
  zone.setAttribute("aria-label", direction === "up" ? "Rolar ferramentas para cima" : "Rolar ferramentas para baixo");
  zone.title = zone.getAttribute("aria-label");
  return zone;
}

function bindToolbarScrollZones(host) {
  host.querySelectorAll(".toolbar-scroll-zone").forEach((zone) => {
    let intervalId = null;
    const direction = zone.dataset.scrollDirection === "up" ? -1 : 1;
    const scroll = () => {
      host.querySelector(".toolbar-scroll-content")?.scrollBy({
        top: direction * 42,
        behavior: "smooth"
      });
    };
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    zone.addEventListener("click", scroll);
    zone.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      scroll();
      stop();
      intervalId = setInterval(scroll, 130);
    });
    zone.addEventListener("pointerup", stop);
    zone.addEventListener("pointerleave", stop);
    zone.addEventListener("pointercancel", stop);
  });
}

function positionToolbarSubmenu(group) {
  const submenuId = group?.dataset.submenuId;
  const submenu = submenuId ? document.getElementById(submenuId) : null;
  const button = group?.querySelector(".tool-button.is-group");
  if (!submenu || !button) {
    return;
  }

  const buttonBounds = button.getBoundingClientRect();
  const wasHidden = getComputedStyle(submenu).display === "none";
  if (wasHidden) {
    submenu.style.visibility = "hidden";
    submenu.style.display = "grid";
  }
  const submenuBounds = submenu.getBoundingClientRect();
  const gap = 11;
  const opensLeft = buttonBounds.right + gap + (submenuBounds.width || 48) > window.innerWidth - 8;
  const top = clampValue(
    Math.round(buttonBounds.top - 7),
    8,
    Math.max(8, window.innerHeight - Math.max(40, submenuBounds.height || 48) - 8)
  );
  const left = opensLeft
    ? Math.round(buttonBounds.left - (submenuBounds.width || 48) - gap)
    : Math.round(buttonBounds.right + gap);

  submenu.classList.toggle("is-left", opensLeft);
  submenu.style.top = `${top}px`;
  submenu.style.left = `${clampValue(left, 8, Math.max(8, window.innerWidth - (submenuBounds.width || 48) - 8))}px`;
  submenu.style.right = "auto";
  if (wasHidden) {
    submenu.style.display = "";
    submenu.style.visibility = "";
  }
}

function bindToolbarFlyouts(host) {
  host.querySelectorAll(".toolbar-group").forEach((group) => {
    const submenu = group.dataset.submenuId ? document.getElementById(group.dataset.submenuId) : null;
    const update = () => {
      group.classList.add("is-open");
      submenu?.classList.add("is-open");
      positionToolbarSubmenu(group);
    };
    group.addEventListener("mouseenter", update);
    group.addEventListener("focusin", update);
    group.addEventListener("click", update);
    group.addEventListener("mouseleave", () => {
      window.setTimeout(() => {
        if (!submenu?.matches(":hover") && !group.matches(":hover")) {
          group.classList.remove("is-open");
          submenu?.classList.remove("is-open");
        }
      }, 120);
    });
    submenu?.addEventListener("mouseenter", update);
    submenu?.addEventListener("mouseleave", () => {
      group.classList.remove("is-open");
      submenu.classList.remove("is-open");
    });
    submenu?.addEventListener("click", handleToolbarClick);
  });
}

function getToolbarActionItem(actionId) {
  const stack = [...TOOLBAR_CONFIG];
  while (stack.length) {
    const item = stack.shift();
    if (item.action === actionId) {
      return item;
    }
    stack.push(...(item.children || []));
  }
  return null;
}

function appendToolbarItem(parent, item) {
  if (item.type === "group") {
    const group = document.createElement("div");
    group.className = "toolbar-group";
    const submenuId = `toolbar-submenu-${item.id}`;
    group.dataset.submenuId = submenuId;

    const groupButton = createToolbarButton(item, "is-group");
    groupButton.setAttribute("aria-haspopup", "true");
    group.appendChild(groupButton);

    const submenu = document.createElement("div");
    submenu.className = "tool-submenu";
    submenu.id = submenuId;
    submenu.dataset.toolbarPortal = "true";
    submenu.role = "menu";
    submenu.setAttribute("aria-label", item.label);

    getVisibleToolbarItems(item.children || []).forEach((child) => {
      const childButton = createToolbarButton(child);
      childButton.role = "menuitem";
      submenu.appendChild(childButton);
    });

    document.body.appendChild(submenu);
    parent.appendChild(group);
    return;
  }

  parent.appendChild(createToolbarButton(item, item.type === "action" ? "is-action" : ""));
}

function renderToolbar() {
  if (!toolbarHost) {
    return;
  }

  applyToolbarState();
  document.querySelectorAll(".tool-submenu[data-toolbar-portal='true']").forEach((submenu) => submenu.remove());
  toolbarHost.innerHTML = "";
  toolbarHost.appendChild(createToolbarDragHandle());
  toolbarHost.appendChild(createToolbarScrollZone("up"));
  const content = document.createElement("div");
  content.className = "toolbar-scroll-content";
  getVisibleToolbarItems().forEach((item) => appendToolbarItem(content, item));
  toolbarHost.appendChild(content);
  toolbarHost.appendChild(createToolbarScrollZone("down"));
  toolbarHost.appendChild(createToolbarResizeHandle());
  bindToolbarScrollZones(toolbarHost);
  bindToolbarFlyouts(toolbarHost);
}

function syncToolbarActiveState() {
  document.querySelectorAll(".tool-button").forEach((item) => {
    const toolbarItem = getToolbarItemByTool(item.dataset.toolbarId);
    item.classList.toggle("is-active", toolbarItemContainsTool(toolbarItem, activeTool));
  });
  syncColorToolButton();
}

function setActiveTool(tool, label) {
  const nextTool = normalizeToolId(tool || "move");
  const nextHandler = getToolHandler(nextTool);
  if (!nextHandler) {
    console.error(`Ferramenta desconhecida na ToolBox: ${tool}`);
    showToolNotice(`Ferramenta desconhecida: ${tool}`);
    return false;
  }

  const previousHandler = getToolHandler(activeTool);
  previousHandler?.onDeactivate?.();
  activeTool = nextTool;
  const item = getToolbarItemByTool(activeTool);
  syncToolbarActiveState();

  if (activeToolLabel) {
    activeToolLabel.textContent = label || item?.label || nextHandler.label || activeTool;
  }

  nextHandler.onActivate?.();
  setCanvasCursor(nextHandler.cursor || "default");
  configureDrawingMode();
  syncBrushContextUi();
  syncInspectorContext();
  return true;
}

function makeObjectName(object) {
  if (!object) {
    return "Objeto";
  }

  if (object.layerName) return object.layerName;
  if (object.name) return object.name;
  if (object.type === "rect") return "Retangulo";
  if (object.type === "circle") return "Circulo";
  if (object.type === "textbox" || object.type === "i-text" || object.type === "text") return "Texto";
  if (object.type === "image") return "Imagem";
  return object.type || "Objeto";
}

function makeObjectTypeName(object) {
  const layerName = object?.layerName;
  const name = object?.name;
  object.layerName = "";
  object.name = "";
  const fallbackName = makeObjectName(object);
  object.layerName = layerName;
  object.name = name;
  return fallbackName;
}

function loadInspectorState() {
  try {
    const raw = localStorage.getItem(INSPECTOR_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveInspectorState(state = {}) {
  try {
    localStorage.setItem(INSPECTOR_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore local storage failures for the inspector.
  }
}

function setInspectorAccordionOpen(section, open, options = {}) {
  const accordion = inspectorAccordions.find((item) => item.dataset.inspectorSection === section);
  if (!accordion) {
    return;
  }

  accordion.classList.toggle("is-open", Boolean(open));
  const toggle = accordion.querySelector("[data-inspector-toggle]");
  if (toggle) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  if (options.persist !== false) {
    const state = loadInspectorState();
    state[section] = Boolean(open);
    saveInspectorState(state);
  }
}

function setInspectorAccordionVisible(section, visible) {
  const accordion = inspectorAccordions.find((item) => item.dataset.inspectorSection === section);
  if (!accordion) {
    return;
  }
  accordion.classList.toggle("is-hidden-context", !visible);
}

function getInspectorSelectionKind(object) {
  if (!object) {
    return "none";
  }
  if (object.layerKind === "mask") {
    return "mask";
  }
  if (isTextObject(object)) {
    return "text";
  }
  if (isVideoLayer(object)) {
    return "image";
  }
  if (isRasterEditableImage(object)) {
    return "image";
  }
  return "shape";
}

function updateProjectInspectorSummary() {
  if (projectSummaryName) {
    projectSummaryName.textContent = projectNameInput?.value?.trim() || "Novo Projeto Canvas";
  }
  if (projectSummaryArtboard) {
    projectSummaryArtboard.textContent = artboardSizeLabel?.textContent || `${artboardWidth} x ${artboardHeight}`;
  }
  if (projectSummaryTool) {
    projectSummaryTool.textContent = activeToolLabel?.textContent || "Selecionar";
  }
  if (projectSummaryStatus) {
    projectSummaryStatus.textContent = projectStatus?.textContent || "Projeto ainda nao salvo";
  }
}

function syncInspectorContext(object = canvas?.getActiveObject?.() || null) {
  const selectionKind = getInspectorSelectionKind(object);
  const toolId = normalizeToolId(activeTool);
  const isBrushTool = ["brush", "pencil", "eraser", "maskBrush"].includes(toolId);
  const isMaskTool = toolId === "maskBrush" || brushMode?.value === "mask";
  const isImageContext = selectionKind === "image" || selectionKind === "mask";

  updateProjectInspectorSummary();

  if (propertyContextLabel) {
    propertyContextLabel.textContent = selectionKind === "none"
      ? "Projeto"
      : selectionKind === "text"
        ? "Texto"
        : selectionKind === "image"
          ? "Imagem"
          : selectionKind === "mask"
            ? "Mascara"
            : "Forma";
  }

  if (projectInspectorSummary) {
    projectInspectorSummary.hidden = selectionKind !== "none";
  }
  if (propertyEmpty) {
    propertyEmpty.hidden = selectionKind !== "none";
  }
  if (objectInspectorSummary) {
    objectInspectorSummary.hidden = selectionKind === "none";
  }
  if (objectSummaryType) {
    objectSummaryType.textContent = selectionKind === "none" ? "Projeto" : makeObjectTypeName(object);
  }
  if (objectSummaryLayer) {
    objectSummaryLayer.textContent = selectionKind === "none" ? "-" : makeObjectName(object);
  }
  if (objectSummaryTool) {
    objectSummaryTool.textContent = activeToolLabel?.textContent || "Selecionar";
  }

  if (propertyTransformGroup) {
    propertyTransformGroup.hidden = selectionKind === "none";
  }
  if (propertyAppearanceGroup) {
    propertyAppearanceGroup.hidden = !["text", "shape"].includes(selectionKind);
  }
  if (propertyTextGroup) {
    propertyTextGroup.hidden = selectionKind !== "text";
  }
  if (propertyImageGroup) {
    propertyImageGroup.hidden = !isImageContext;
  }
  if (propertyAlignGroup) {
    propertyAlignGroup.hidden = selectionKind === "none";
  }

  setInspectorAccordionVisible("layers", true);
  setInspectorAccordionVisible("properties", true);
  setInspectorAccordionVisible("brush", true);
  setInspectorAccordionVisible("mask", isImageContext || isMaskTool);
  setInspectorAccordionVisible("sd", true);
  setInspectorAccordionVisible("sd-mask", true);
  setInspectorAccordionVisible("brand", true);
  setInspectorAccordionVisible("export", true);

  const openSections = new Set(["properties"]);
  if (isBrushTool) {
    openSections.add("brush");
  }
  if (isMaskTool) {
    openSections.add("mask");
  }
  if (getSelectedStableI2ISubmode() === "inpaint" || getSelectedStableI2ISubmode() === "inpaint-sketch") {
    openSections.add("sd-mask");
  }
  if (selectionKind === "image" || selectionKind === "mask") {
    openSections.add("sd");
  }

  inspectorAccordions.forEach((accordion) => {
    const section = accordion.dataset.inspectorSection;
    const shouldOpen = openSections.has(section) && !accordion.classList.contains("is-hidden-context");
    setInspectorAccordionOpen(section, shouldOpen, { persist: false });
  });

  updateLayerMaskPanelState(object);
  updateStableDiffusionPanelState();
}

function getLayerObjects() {
  return canvas ? canvas.getObjects().filter((object) => !object.isArtboard && !object.isToolOverlay) : [];
}

function createLayerId() {
  layerIdCounter += 1;
  return `layer-${Date.now().toString(36)}-${layerIdCounter.toString(36)}`;
}

function getLayerObjectById(layerId) {
  return getLayerObjects().find((object) => object.layerId === layerId) || null;
}

function isMaskLayerObject(object) {
  return Boolean(object && object.layerKind === "mask");
}

function getParentLayerForMask(maskObject) {
  if (!isMaskLayerObject(maskObject)) {
    return null;
  }
  return getLayerObjectById(maskObject.parentLayerId || maskObject.affectedLayerId);
}

function getMaskLayerForObject(object) {
  if (!object || isMaskLayerObject(object)) {
    return null;
  }
  return object.maskLayerId ? getLayerObjectById(object.maskLayerId) : null;
}

function isLayerMaskEnabled(object) {
  return Boolean(object && object.maskEnabled !== false);
}

function getPrimaryLayerObject(object) {
  if (isMaskLayerObject(object)) {
    return getParentLayerForMask(object);
  }
  return object || null;
}

function getTopLevelLayerObjects() {
  return getLayerObjects().filter((object) => !isMaskLayerObject(object));
}

function getDefaultLayerName(object, index = 0) {
  return `${makeObjectTypeName(object)} ${index + 1}`;
}

function ensureLayerMetadata(object, index = 0) {
  if (!object || object.isArtboard) {
    return;
  }

  if (!object.layerId) {
    object.layerId = createLayerId();
  }

  if (!object.layerName) {
    object.layerName = object.name || getDefaultLayerName(object, index);
  }

  object.layerLocked = Boolean(object.layerLocked);
  object.maskLayerId = object.maskLayerId || null;
  object.maskEnabled = object.maskEnabled !== false;

  if (object.layerLocked) {
    setLayerLocked(object, true, { render: false });
  }
}

function syncMaskObjectTransform(maskObject, parentObject) {
  if (!maskObject || !parentObject) {
    return;
  }

  maskObject.set({
    left: parentObject.left,
    top: parentObject.top,
    angle: parentObject.angle || 0,
    scaleX: parentObject.scaleX || 1,
    scaleY: parentObject.scaleY || 1,
    flipX: Boolean(parentObject.flipX),
    flipY: Boolean(parentObject.flipY),
    originX: parentObject.originX || "left",
    originY: parentObject.originY || "top",
    visible: false,
    selectable: true,
    evented: false,
    hasControls: false
  });
  maskObject.setCoords();
}

function normalizeMaskRelationships() {
  const objects = getLayerObjects();
  objects.filter((object) => !isMaskLayerObject(object)).forEach((object) => {
    object.maskLayerId = null;
  });

  objects.filter(isMaskLayerObject).forEach((maskObject) => {
    maskObject.parentLayerId = maskObject.parentLayerId || maskObject.affectedLayerId || null;
    const parentObject = getLayerObjectById(maskObject.parentLayerId);
    if (!parentObject || isMaskLayerObject(parentObject)) {
      maskObject.parentLayerId = null;
      maskObject.affectedLayerId = null;
      return;
    }
    if (parentObject.maskLayerId && parentObject.maskLayerId !== maskObject.layerId) {
      maskObject.parentLayerId = null;
      maskObject.affectedLayerId = null;
      return;
    }

    parentObject.maskLayerId = maskObject.layerId;
    parentObject.rasterMaskSrc = maskObject.rasterSourceSrc || parentObject.rasterMaskSrc || null;
    maskObject.parentLayerId = parentObject.layerId;
    maskObject.affectedLayerId = parentObject.layerId;
    syncMaskObjectTransform(maskObject, parentObject);
  });
}

function ensureAllLayerMetadata() {
  getLayerObjects().forEach((object, index) => ensureLayerMetadata(object, index));
  normalizeMaskRelationships();
}

function setLayerLocked(object, locked, options = {}) {
  if (!object || object.isArtboard) {
    return;
  }

  object.layerLocked = Boolean(locked);
  object.set({
    selectable: !locked,
    evented: !locked,
    hasControls: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked
  });

  if (options.render !== false) {
    canvas?.requestRenderAll();
    updateSelectionInfo();
  }
}

function selectLayerObject(object) {
  if (!canvas || !object) {
    return;
  }

  canvas.discardActiveObject();
  if (object.visible !== false || isMaskLayerObject(object)) {
    canvas.setActiveObject(object);
  }

  canvas.requestRenderAll();
  updateSelectionInfo();
}

function renameLayer(object, nextName) {
  if (!object) {
    return;
  }

  const cleanName = String(nextName || "").trim();
  object.layerName = cleanName || makeObjectTypeName(object);
  updateLayers();
  markCanvasChanged("layer");
}

function toggleLayerVisibility(object) {
  const target = getPrimaryLayerObject(object);
  if (!canvas || !target) {
    return;
  }

  target.set("visible", target.visible === false);
  const activeObject = canvas.getActiveObject();
  if ((activeObject === target || getParentLayerForMask(activeObject) === target) && target.visible === false) {
    canvas.discardActiveObject();
  }
  target.setCoords();
  canvas.requestRenderAll();
  updateSelectionInfo();
  markCanvasChanged("property");
}

function toggleLayerLock(object) {
  const target = getPrimaryLayerObject(object);
  if (!target) {
    return;
  }

  setLayerLocked(target, !target.layerLocked);
  markCanvasChanged("layer");
}

function moveLayer(object, direction) {
  const target = getPrimaryLayerObject(object);
  if (!canvas || !target) {
    return;
  }

  const layerObjects = getTopLevelLayerObjects();
  const layerIndex = layerObjects.indexOf(target);

  if (direction === "up" && layerIndex < layerObjects.length - 1) {
    canvas.bringObjectForward(target);
  }

  if (direction === "down" && layerIndex > 0) {
    canvas.sendObjectBackwards(target);
  }

  const maskObject = getMaskLayerForObject(target);
  if (maskObject) {
    syncMaskObjectTransform(maskObject, target);
  }
  canvas.setActiveObject(target);
  canvas.requestRenderAll();
  updateSelectionInfo();
  syncLayerOrderWithTimeline();
  markCanvasChanged("layer");
}

function reorderLayerByDrag(draggedLayerId, targetLayerId, dropAfterTarget) {
  if (!canvas || !draggedLayerId || !targetLayerId || draggedLayerId === targetLayerId) {
    return;
  }

  const draggedObject = getLayerObjectById(draggedLayerId);
  const targetObject = getLayerObjectById(targetLayerId);
  if (!draggedObject || !targetObject) {
    return;
  }

  const displayObjects = [...getTopLevelLayerObjects()].reverse();
  const withoutDragged = displayObjects.filter((object) => object !== draggedObject);
  const targetIndex = withoutDragged.indexOf(targetObject);
  if (targetIndex < 0) {
    return;
  }

  withoutDragged.splice(targetIndex + (dropAfterTarget ? 1 : 0), 0, draggedObject);
  const canvasOrder = [...withoutDragged].reverse();
  const artboardIndex = artboardObject ? canvas.getObjects().indexOf(artboardObject) : -1;
  const baseIndex = artboardIndex >= 0 ? artboardIndex + 1 : 0;

  canvasOrder.forEach((object, index) => {
    canvas.moveObjectTo(object, baseIndex + index);
    const maskObject = getMaskLayerForObject(object);
    if (maskObject) {
      syncMaskObjectTransform(maskObject, object);
    }
  });

  canvas.setActiveObject(draggedObject);
  canvas.requestRenderAll();
  updateSelectionInfo();
  syncLayerOrderWithTimeline();
  markCanvasChanged("layer");
}

function removeLayer(object) {
  if (!canvas || !object) {
    return;
  }

  if (isMaskLayerObject(object)) {
    const parentObject = getParentLayerForMask(object);
    if (parentObject) {
      parentObject.maskLayerId = null;
      parentObject.rasterMaskSrc = null;
      parentObject.maskEnabled = true;
    }
    if (canvas.getActiveObject() === object) {
      canvas.discardActiveObject();
    }
    canvas.remove(object);
    if (parentObject) {
      void refreshLayerMaskComposite(parentObject);
    }
    canvas.requestRenderAll();
    updateSelectionInfo();
    markCanvasChanged("layer");
    return;
  }

  const maskObject = getMaskLayerForObject(object);

  if (canvas.getActiveObject() === object) {
    canvas.discardActiveObject();
  }

  if (maskObject) {
    canvas.remove(maskObject);
  }
  canvas.remove(object);
  canvas.requestRenderAll();
  updateSelectionInfo();
  markCanvasChanged("layer");
}

function getLayerActionIconPath(label) {
  switch (label) {
    case "Show":
      return "../assets/icones/timeline/olho.svg";
    case "Hide":
      return "../assets/icones/timeline/olhos-cruzados.svg";
    case "Lock":
      return "../assets/icones/restricao-de-idade-dezoito-anos.svg";
    case "Unlock":
      return "../assets/icones/controle.svg";
    case "Up":
      return "../assets/icones/timeline/um-passo-atras.svg";
    case "Down":
      return "../assets/icones/timeline/um-passo-a-frente.svg";
    case "Del":
      return "../assets/icones/excluir-objeto.svg";
    default:
      return "../assets/icones/config.svg";
  }
}

function createLayerIconButton(label, title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "layer-action icon-button";
  button.draggable = false;
  button.innerHTML = `<img src="${getLayerActionIconPath(label)}" alt=""><span class="sr-only">${title}</span>`;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.addEventListener("dragstart", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function createLayerThumb(source, className = "") {
  const thumb = document.createElement("div");
  thumb.className = `layer-thumb ${className}`.trim();
  if (source) {
    const image = document.createElement("img");
    image.src = source;
    image.alt = "";
    thumb.appendChild(image);
  }
  return thumb;
}

function updateLayers() {
  if (!layerList || !canvas) {
    return;
  }

  ensureAllLayerMetadata();
  const objects = getTopLevelLayerObjects();
  const activeObject = canvas.getActiveObject();
  layerList.innerHTML = "";

  if (!objects.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nenhuma camada ainda";
    layerList.appendChild(empty);
    return;
  }

  [...objects].reverse().forEach((object, index) => {
    const layerIndex = objects.indexOf(object);
    const item = document.createElement("div");
    item.className = "layer-item";
    item.draggable = true;
    item.dataset.layerId = object.layerId;
    item.classList.toggle("is-active", object === activeObject);
    item.classList.toggle("is-editing-mask", isMaskLayerObject(activeObject) && getParentLayerForMask(activeObject) === object);
    item.classList.toggle("is-hidden", object.visible === false);
    item.classList.toggle("is-locked", Boolean(object.layerLocked));

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "layer-select";
    selectButton.title = "Selecionar camada";
    selectButton.innerHTML = `<span class="layer-index">${objects.length - index}</span>`;
    item.addEventListener("click", () => {
      selectLayerObject(object);
    });
    item.addEventListener("dragstart", (event) => {
      item.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", object.layerId);
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
      layerList.querySelectorAll(".layer-item").forEach((layerItem) => {
        layerItem.classList.remove("is-drop-before", "is-drop-after");
      });
    });
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      const bounds = item.getBoundingClientRect();
      const dropAfter = event.clientY > bounds.top + bounds.height / 2;
      item.classList.toggle("is-drop-before", !dropAfter);
      item.classList.toggle("is-drop-after", dropAfter);
      event.dataTransfer.dropEffect = "move";
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("is-drop-before", "is-drop-after");
    });
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedMaskId = event.dataTransfer.getData("application/x-kit-mask-layer");
      if (draggedMaskId) {
        item.classList.remove("is-drop-before", "is-drop-after");
        reassignMaskToLayer(draggedMaskId, object.layerId);
        return;
      }
      const draggedLayerId = event.dataTransfer.getData("text/plain");
      const bounds = item.getBoundingClientRect();
      const dropAfter = event.clientY > bounds.top + bounds.height / 2;
      item.classList.remove("is-drop-before", "is-drop-after");
      reorderLayerByDrag(draggedLayerId, object.layerId, dropAfter);
    });
    selectButton.addEventListener("click", (event) => {
      event.stopPropagation();
      selectLayerObject(object);
    });
    selectButton.addEventListener("dragstart", (event) => {
      event.stopPropagation();
    });

    const thumb = createLayerThumb(object.rasterSourceSrc || object.getSrc?.() || "", isRasterEditableImage(object) ? "" : "layer-thumb-generic");

    const nameInput = document.createElement("input");
    nameInput.className = "layer-name";
    nameInput.value = makeObjectName(object);
    nameInput.title = "Renomear camada";
    nameInput.setAttribute("aria-label", "Renomear camada");
    nameInput.draggable = false;
    nameInput.addEventListener("click", (event) => event.stopPropagation());
    nameInput.addEventListener("dragstart", (event) => event.preventDefault());
    nameInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        nameInput.blur();
      }
    });
    nameInput.addEventListener("change", () => renameLayer(object, nameInput.value));
    nameInput.addEventListener("blur", () => renameLayer(object, nameInput.value));

    const actions = document.createElement("div");
    actions.className = "layer-actions";
    actions.appendChild(createLayerIconButton(object.visible === false ? "Show" : "Hide", object.visible === false ? "Mostrar camada" : "Ocultar camada", () => toggleLayerVisibility(object)));
    actions.appendChild(createLayerIconButton(object.layerLocked ? "Unlock" : "Lock", object.layerLocked ? "Desbloquear camada" : "Bloquear camada", () => toggleLayerLock(object)));
    actions.appendChild(createLayerIconButton("Up", "Subir camada", () => moveLayer(object, "up")));
    actions.appendChild(createLayerIconButton("Down", "Descer camada", () => moveLayer(object, "down")));
    actions.appendChild(createLayerIconButton("Del", "Remover camada", () => removeLayer(object)));

    if (layerIndex === objects.length - 1) {
      actions.querySelector('[title="Subir camada"]').disabled = true;
    }

    if (layerIndex === 0) {
      actions.querySelector('[title="Descer camada"]').disabled = true;
    }

    item.appendChild(selectButton);
    item.appendChild(thumb);
    item.appendChild(nameInput);
    item.appendChild(actions);

    const maskObject = getMaskLayerForObject(object);
    if (maskObject) {
      const children = document.createElement("div");
      children.className = "layer-children";

      const maskItem = document.createElement("div");
      maskItem.className = "layer-child";
      maskItem.draggable = true;
      maskItem.dataset.layerId = maskObject.layerId;
      maskItem.classList.toggle("is-active", activeObject === maskObject);
      maskItem.addEventListener("click", (event) => {
        event.stopPropagation();
        selectLayerObject(maskObject);
      });
      maskItem.addEventListener("dragstart", (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-kit-mask-layer", maskObject.layerId);
      });
      maskItem.addEventListener("dragend", () => {
        layerList.querySelectorAll(".layer-item").forEach((layerItem) => {
          layerItem.classList.remove("is-drop-before", "is-drop-after");
        });
      });

      const maskLabel = document.createElement("div");
      maskLabel.className = "layer-child-label";
      maskLabel.textContent = "Mascara";

      const maskThumb = createLayerThumb(maskObject.rasterSourceSrc || "", "layer-thumb-mask");

      const maskName = document.createElement("div");
      maskName.className = "layer-child-name";
      maskName.textContent = activeObject === maskObject ? "Mascara em edicao" : "Mascara";

      const maskActions = document.createElement("div");
      maskActions.className = "layer-child-actions";
      maskActions.appendChild(createLayerIconButton("Del", "Remover mascara", () => removeLayer(maskObject)));

      maskItem.appendChild(maskLabel);
      maskItem.appendChild(maskThumb);
      maskItem.appendChild(maskName);
      maskItem.appendChild(maskActions);
      children.appendChild(maskItem);
      item.appendChild(children);
    }

    layerList.appendChild(item);
  });

  addLayerButton && (addLayerButton.disabled = false);
  mergeLayerButton && (mergeLayerButton.disabled = !getMergeLayerPair());
}

function getSelectedPrimaryLayer() {
  return getPrimaryLayerObject(getActiveEditableObject());
}

function getMergeLayerPair() {
  const activeLayer = getSelectedPrimaryLayer();
  if (!activeLayer) {
    return null;
  }

  const layers = getTopLevelLayerObjects();
  const activeIndex = layers.indexOf(activeLayer);
  if (activeIndex <= 0) {
    return null;
  }

  return {
    upper: activeLayer,
    lower: layers[activeIndex - 1]
  };
}

async function addLayerAboveActive() {
  const activeLayer = getSelectedPrimaryLayer();
  const image = await createBlankRasterLayer(null, {
    aboveLayerId: activeLayer?.layerId || null
  });
  updateLayers();
  markCanvasChanged("layer-add");
  return image;
}

async function createMergedRasterLayer(lowerObject, upperObject) {
  const StaticCanvas = getFabricClass("StaticCanvas");
  if (!StaticCanvas || !lowerObject || !upperObject) {
    return null;
  }

  const mergedCanvas = new StaticCanvas(null, {
    width: artboardWidth,
    height: artboardHeight,
    backgroundColor: "transparent",
    enableRetinaScaling: false
  });
  const offsetX = Number(artboardObject?.left || 0);
  const offsetY = Number(artboardObject?.top || 0);

  for (const object of [lowerObject, upperObject]) {
    const cloned = await cloneFabricObject(object);
    if (!cloned) {
      continue;
    }
    cloned.set({
      left: Number(cloned.left || 0) - offsetX,
      top: Number(cloned.top || 0) - offsetY,
      selectable: false,
      evented: false,
      hasControls: false,
      visible: object.visible !== false
    });
    mergedCanvas.add(cloned);
  }

  mergedCanvas.renderAll();
  const dataUrl = mergedCanvas.toDataURL({
    format: "png",
    multiplier: 1,
    enableRetinaScaling: false
  });
  mergedCanvas.dispose?.();

  const image = await createFabricImageFromUrl(dataUrl);
  image.set({
    left: artboardObject?.left || 0,
    top: artboardObject?.top || 0,
    originX: "left",
    originY: "top",
    name: `${makeObjectName(upperObject)} mesclada`,
    layerName: `${makeObjectName(upperObject)} mesclada`,
    layerKind: "raster",
    rasterSourceSrc: dataUrl
  });
  return image;
}

async function mergeActiveLayerDown() {
  const pair = getMergeLayerPair();
  if (!pair) {
    showToolNotice("Selecione uma layer valida com outra layer logo abaixo para mesclar.");
    return null;
  }

  const mergedLayer = await createMergedRasterLayer(pair.lower, pair.upper);
  if (!mergedLayer) {
    showToolNotice("Nao foi possivel mesclar a layer ativa.");
    return null;
  }

  const insertIndex = canvas.getObjects().indexOf(pair.lower);
  const lowerMask = getMaskLayerForObject(pair.lower);
  const upperMask = getMaskLayerForObject(pair.upper);
  canvas.discardActiveObject();
  [upperMask, pair.upper, lowerMask, pair.lower].filter(Boolean).forEach((object) => {
    canvas.remove(object);
  });
  canvas.add(mergedLayer);
  if (insertIndex >= 0) {
    canvas.moveObjectTo(mergedLayer, insertIndex);
  }
  canvas.setActiveObject(mergedLayer);
  canvas.requestRenderAll();
  updateSelectionInfo();
  updateLayers();
  markCanvasChanged("layer-merge");
  return mergedLayer;
}

async function reassignMaskToLayer(maskLayerId, targetLayerId) {
  const maskObject = getLayerObjectById(maskLayerId);
  const targetObject = getLayerObjectById(targetLayerId);
  if (!isMaskLayerObject(maskObject) || !targetObject || isMaskLayerObject(targetObject)) {
    return;
  }
  if (!isRasterEditableImage(targetObject)) {
    showToolNotice("A mascara so pode ser vinculada a uma layer raster ou imagem.");
    return;
  }
  if (targetObject.maskLayerId && targetObject.maskLayerId !== maskObject.layerId) {
    showToolNotice("A layer de destino ja possui uma mascara.");
    return;
  }

  const previousParent = getParentLayerForMask(maskObject);
  if (previousParent) {
    previousParent.maskLayerId = null;
    previousParent.rasterMaskSrc = null;
    previousParent.maskEnabled = true;
  }

  targetObject.maskLayerId = maskObject.layerId;
  targetObject.rasterMaskSrc = maskObject.rasterSourceSrc || null;
  targetObject.maskEnabled = true;
  maskObject.parentLayerId = targetObject.layerId;
  maskObject.affectedLayerId = targetObject.layerId;
  syncMaskObjectTransform(maskObject, targetObject);
  await refreshLayerMaskComposite(targetObject);
  if (previousParent && previousParent !== targetObject) {
    await refreshLayerMaskComposite(previousParent);
  }
  updateLayers();
  markCanvasChanged("mask-reassign");
}

function getPropertyInputs() {
  return [
    propX,
    propY,
    propW,
    propH,
    propAngle,
    propOpacity,
    propSpeed,
    propFill,
    propStroke,
    propStrokeWidth,
    propFontFamily,
    propFontSize,
    propTextAlign
  ].filter(Boolean);
}

function setPropertyControlsDisabled(disabled, object = null) {
  const textDisabled = disabled || !isTextObject(object);
  getPropertyInputs().forEach((input) => {
    input.disabled = Boolean(disabled);
  });

  [propFontFamily, propFontSize, propTextAlign].filter(Boolean).forEach((input) => {
    input.disabled = Boolean(textDisabled);
  });
}

function setInputValue(input, value) {
  if (!input || document.activeElement === input) {
    return;
  }

  input.value = String(value);
}

function getObjectFillColor(object) {
  return normalizeHexColor(typeof object?.fill === "string" ? object.fill : "", "#20232A");
}

function getObjectStrokeColor(object) {
  return normalizeHexColor(typeof object?.stroke === "string" ? object.stroke : "", "#000000");
}

function renderFontOptions(selectedFamily = "") {
  if (!propFontFamily) {
    return;
  }

  const baseFonts = ["Segoe UI", "Arial", "Verdana", "Georgia", "Times New Roman", "Courier New"];
  const brandFonts = (currentBrandKit?.fonts || [])
    .map((font) => font.family || font.name?.replace(/\.[^.]+$/, "") || "")
    .filter(Boolean);
  const fonts = [...new Set([...baseFonts, ...brandFonts, selectedFamily].filter(Boolean))];

  propFontFamily.innerHTML = "";
  fonts.forEach((family) => {
    const option = document.createElement("option");
    option.value = family;
    option.textContent = family;
    propFontFamily.appendChild(option);
  });

  if (selectedFamily) {
    propFontFamily.value = selectedFamily;
  }
}

function syncBrushLabels() {
  if (brushSizeValue) {
    brushSizeValue.textContent = String(getNumericValue(brushSize, 24));
  }

  if (brushOpacityValue) {
    brushOpacityValue.textContent = `${getNumericValue(brushOpacity, 100)}%`;
  }

  if (brushHardnessValue) {
    brushHardnessValue.textContent = `${getNumericValue(brushHardness, 85)}%`;
  }
}

function syncExportLabels() {
  if (exportQualityValue) {
    exportQualityValue.textContent = `${getNumericValue(exportQuality, 92)}%`;
  }
}

function getBrushConfig() {
  const normalizedTool = normalizeToolId(activeTool);
  const mode = normalizedTool === "maskBrush"
    ? "mask"
    : normalizedTool === "eraser"
      ? "paint"
      : brushMode?.value === "mask"
        ? "mask"
        : "paint";
  const size = clampValue(getNumericValue(brushSize, 24), 1, 160);
  const opacity = clampValue(getNumericValue(brushOpacity, 100), 5, 100);
  const toolItem = getToolbarItemByTool(normalizedTool);
  const brushKind = toolItem?.settings?.brushKind || (normalizedTool === "pencil" ? "pencil" : normalizedTool === "maskBrush" ? "mask" : normalizedTool);
  const hardness = brushKind === "pencil"
    ? 100
    : clampValue(getNumericValue(brushHardness, 85), 1, 100);
  const color = mode === "mask" ? "#FFFFFF" : normalizeHexColor(brushColor?.value || "#20232A", "#20232A");

  return {
    mode,
    brushKind,
    size,
    opacity,
    hardness,
    color,
    stroke: colorWithOpacity(color, opacity)
  };
}

function syncBrushContextUi() {
  const isMaskBrush = normalizeToolId(activeTool) === "maskBrush";
  if (brushModeRow) {
    brushModeRow.hidden = isMaskBrush;
  }
  if (brushColorRow) {
    brushColorRow.hidden = false;
  }
}

function syncMaskPreviewButton() {
  if (!toggleMaskPreviewButton) {
    return;
  }
  toggleMaskPreviewButton.textContent = maskPreviewVisible ? "Ocultar Mascara" : "Visualizar Mascara";
}

async function invertLayerMask() {
  const object = canvas?.getActiveObject?.();
  const parentObject = getPrimaryLayerObject(object);
  const maskObject = isMaskLayerObject(object) ? object : getMaskLayerForObject(parentObject);
  if (!maskObject || !parentObject) {
    return;
  }

  const maskCanvas = await createRasterCanvasFromSource(maskObject.rasterSourceSrc || "", maskObject.getElement?.());
  const ctx = maskCanvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    imageData.data[index] = 255 - imageData.data[index];
    imageData.data[index + 1] = 255 - imageData.data[index + 1];
    imageData.data[index + 2] = 255 - imageData.data[index + 2];
  }
  ctx.putImageData(imageData, 0, 0);
  maskObject.rasterSourceSrc = maskCanvas.toDataURL("image/png");
  parentObject.rasterMaskSrc = maskObject.rasterSourceSrc;
  await refreshLayerMaskComposite(parentObject, { maskCanvas });
  updateLayerMaskPanelState(object);
  markCanvasChanged("layer-mask-invert");
}

function toggleLayerMaskEnabled() {
  const object = canvas?.getActiveObject?.();
  const parentObject = getPrimaryLayerObject(object);
  if (!parentObject || !getMaskLayerForObject(parentObject)) {
    return;
  }
  parentObject.maskEnabled = !isLayerMaskEnabled(parentObject);
  void refreshLayerMaskComposite(parentObject);
  updateLayerMaskPanelState(object);
  markCanvasChanged("layer-mask-toggle");
}

async function applyLayerMaskToParent() {
  const object = canvas?.getActiveObject?.();
  const parentObject = getPrimaryLayerObject(object);
  const maskObject = isMaskLayerObject(object) ? object : getMaskLayerForObject(parentObject);
  if (!parentObject || !maskObject) {
    return;
  }

  const sourceCanvas = await createRasterCanvasFromSource(getImageSourceForRaster(parentObject), parentObject.getElement?.());
  const maskCanvas = await createRasterCanvasFromSource(maskObject.rasterSourceSrc || "", maskObject.getElement?.());
  const mergedCanvas = composeMaskedRasterCanvas(sourceCanvas, maskCanvas);
  parentObject.rasterSourceSrc = mergedCanvas.toDataURL("image/png");
  parentObject.rasterMaskSrc = null;
  parentObject.maskLayerId = null;
  parentObject.maskEnabled = true;
  canvas.remove(maskObject);
  updateRasterImageElement(parentObject, mergedCanvas, null);
  canvas.setActiveObject(parentObject);
  updateSelectionInfo();
  markCanvasChanged("layer-mask-apply");
}

function deleteLayerMaskFromParent() {
  const object = canvas?.getActiveObject?.();
  const maskObject = isMaskLayerObject(object) ? object : getMaskLayerForObject(getPrimaryLayerObject(object));
  if (!maskObject) {
    return;
  }
  removeLayer(maskObject);
}

function updateLayerMaskPanelState(object = canvas?.getActiveObject?.() || null) {
  const primaryLayer = getPrimaryLayerObject(object);
  const maskObject = isMaskLayerObject(object) ? object : getMaskLayerForObject(primaryLayer);
  const parentObject = isMaskLayerObject(object) ? getParentLayerForMask(object) : primaryLayer;
  const hasMask = Boolean(maskObject && parentObject);
  const enabled = hasMask && isLayerMaskEnabled(parentObject);

  if (layerMaskStatus) {
    if (!hasMask) {
      layerMaskStatus.textContent = "Selecione uma layer com mascara ou use o Pincel de mascara para criar uma.";
    } else if (object === maskObject) {
      layerMaskStatus.textContent = `Editando a mascara de ${makeObjectName(parentObject)}.`;
    } else {
      layerMaskStatus.textContent = `Mascara vinculada a ${makeObjectName(parentObject)} ${enabled ? "ativa" : "desativada"}.`;
    }
  }

  if (layerMaskBehaviorNote) {
    layerMaskBehaviorNote.textContent = hasMask
      ? "Preto esconde, branco revela e cinza cria transparencia parcial. Essa mascara pertence apenas a layer pai."
      : "A mascara da layer afeta somente a transparencia da propria layer. Ela nao participa do inpaint do Stable Diffusion.";
  }

  if (toggleLayerMaskEnabledButton) {
    toggleLayerMaskEnabledButton.disabled = !hasMask;
    toggleLayerMaskEnabledButton.textContent = enabled ? "Desativar Mascara" : "Ativar Mascara";
  }
  if (toggleMaskPreviewButton) {
    toggleMaskPreviewButton.disabled = !hasMask;
  }
  if (invertLayerMaskButton) {
    invertLayerMaskButton.disabled = !hasMask;
  }
  if (applyLayerMaskButton) {
    applyLayerMaskButton.disabled = !hasMask;
  }
  if (deleteLayerMaskButton) {
    deleteLayerMaskButton.disabled = !hasMask;
  }
}

function shouldShowRasterCursor(tool = activeTool) {
  const normalizedTool = normalizeToolId(tool);
  return ["brush", "pencil", "maskBrush"].includes(normalizedTool);
}

function ensureRasterCursorOverlay() {
  if (rasterCursorState.element || !board || typeof document === "undefined") {
    return rasterCursorState.element;
  }

  const element = document.createElement("div");
  element.className = "raster-cursor-overlay";
  element.setAttribute("aria-hidden", "true");
  board.appendChild(element);
  rasterCursorState.element = element;
  return element;
}

function hideRasterCursorOverlay() {
  rasterCursorState.visible = false;
  const element = rasterCursorState.element;
  if (element) {
    element.classList.remove("is-visible");
  }
}

function updateRasterCursorOverlay() {
  const element = ensureRasterCursorOverlay();
  if (!element || !canvas || !shouldShowRasterCursor(activeTool)) {
    hideRasterCursorOverlay();
    return;
  }

  const bounds = board?.getBoundingClientRect?.();
  if (!bounds || !rasterCursorState.visible) {
    hideRasterCursorOverlay();
    return;
  }

  const config = getBrushConfig();
  const zoom = Math.max(canvas.getZoom?.() || 1, 0.01);
  const normalizedTool = normalizeToolId(activeTool);
  const isPencil = normalizedTool === "pencil";
  const size = isPencil
    ? Math.max(2, Math.round(config.size * zoom))
    : Math.max(6, Math.round(config.size * zoom));

  element.classList.toggle("is-pencil", isPencil);
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.left = `${rasterCursorState.clientX - bounds.left}px`;
  element.style.top = `${rasterCursorState.clientY - bounds.top}px`;
  element.classList.add("is-visible");
}

function setRasterCursorPositionFromEvent(nativeEvent) {
  if (!nativeEvent) {
    return;
  }

  rasterCursorState.clientX = Number(nativeEvent.clientX || 0);
  rasterCursorState.clientY = Number(nativeEvent.clientY || 0);
  rasterCursorState.visible = true;
  updateRasterCursorOverlay();
}

function syncRasterCursorMode() {
  const upperCanvas = canvas?.upperCanvasEl || document.querySelector(".upper-canvas");
  if (upperCanvas) {
    upperCanvas.classList.toggle("is-raster-cursor-hidden", shouldShowRasterCursor(activeTool));
  }

  if (!shouldShowRasterCursor(activeTool)) {
    hideRasterCursorOverlay();
    return;
  }

  updateRasterCursorOverlay();
}

function configureBrush() {
  if (!canvas) {
    return;
  }

  const PencilBrush = getFabricClass("PencilBrush");
  if (!canvas.freeDrawingBrush && PencilBrush) {
    canvas.freeDrawingBrush = new PencilBrush(canvas);
  }

  const brush = canvas.freeDrawingBrush;
  if (!brush) {
    return;
  }

  const config = getBrushConfig();
  activeBrushMode = config.mode;
  brush.width = config.size;
  brush.color = config.stroke;
  brush.decimate = Math.max(0.1, (101 - config.hardness) / 18);
  brush.strokeLineCap = "round";
  brush.strokeLineJoin = "round";

  const Shadow = getFabricClass("Shadow");
  const blur = Math.round((100 - config.hardness) * config.size / 90);
  brush.shadow = Shadow && blur > 0
    ? new Shadow({
      color: config.stroke,
      blur,
      offsetX: 0,
      offsetY: 0
    })
    : null;

  syncBrushLabels();
  if (brushStatus) {
    brushStatus.textContent = config.mode === "mask"
      ? "Modo mascara: o pincel usa a cor atual e a mascara interpreta preto, branco e cinza."
      : "Modo desenho livre";
  }

  updateRasterCursorOverlay();
}

function setCanvasCursor(cursor = "default") {
  if (!canvas) {
    return;
  }

  canvas.defaultCursor = cursor;
  canvas.hoverCursor = cursor;
  canvas.moveCursor = activeTool === "move" ? "move" : cursor;
  const upperCanvas = canvas.upperCanvasEl || document.querySelector(".upper-canvas");
  if (upperCanvas) {
    upperCanvas.style.cursor = cursor;
  }
  syncRasterCursorMode();
}

function showToolNotice(message = "") {
  if (brushStatus && message) {
    brushStatus.textContent = message;
  }
  if (message) {
    console.info(message);
  }
}

function activateMoveTool() {
  if (!canvas) {
    return;
  }

  canvas.isDrawingMode = false;
  canvas.selection = true;
  canvas.skipTargetFind = false;
  setCanvasCursor("move");
}

function activatePassiveTool() {
  if (!canvas) {
    return;
  }

  canvas.isDrawingMode = false;
  canvas.selection = false;
  canvas.skipTargetFind = true;
}

function activateNonSelectingTool() {
  activatePassiveTool();
}

function activateTargetInspectTool() {
  if (!canvas) {
    return;
  }

  canvas.isDrawingMode = false;
  canvas.selection = false;
  canvas.skipTargetFind = false;
}

function activateRasterTool() {
  activateNonSelectingTool();
  configureBrush();
}

function activateVectorPenTool() {
  activateNonSelectingTool();
}

function configureDrawingMode() {
  if (!canvas) {
    return;
  }

  const handler = getToolHandler(activeTool);
  if (activeTool === "move") {
    canvas.selection = true;
    canvas.skipTargetFind = false;
  } else if (activeTool === "vectorCurve") {
    canvas.selection = false;
    canvas.skipTargetFind = false;
  } else if (handler?.onPointerDown) {
    canvas.selection = false;
    canvas.skipTargetFind = true;
  }
  canvas.isDrawingMode = false;
  setCanvasCursor(handler?.cursor || "default");
  configureBrush();
}

function handlePathCreated(event) {
  const pathObject = event.path;
  if (!pathObject) {
    return;
  }

  const config = getBrushConfig();
  pathObject.set({
    fill: null,
    stroke: config.stroke,
    strokeWidth: config.size,
    opacity: 1,
    strokeLineCap: "round",
    strokeLineJoin: "round",
    isMaskPath: config.mode === "mask",
    brushMode: config.mode,
    layerName: config.mode === "mask" ? "Mascara" : "Pincel"
  });

  ensureLayerMetadata(pathObject, getLayerObjects().length - 1);
  canvas.setActiveObject(pathObject);
  updateSelectionInfo();
}

function isRasterTool(tool = activeTool) {
  return ["brush", "pencil", "eraser", "maskBrush"].includes(normalizeToolId(tool));
}

function isRasterEditableImage(object) {
  const type = String(object?.type || "").toLowerCase();
  return Boolean(object && !object.isArtboard && !isVideoLayer(object) && (type === "image" || object.getElement || object.rasterSourceSrc));
}

function makeRasterCanvas(width, height) {
  const element = document.createElement("canvas");
  element.width = Math.max(1, Math.round(Number(width || 1)));
  element.height = Math.max(1, Math.round(Number(height || 1)));
  return element;
}

function getImageElementSize(element) {
  return {
    width: Number(element?.naturalWidth || element?.videoWidth || element?.width || 0),
    height: Number(element?.naturalHeight || element?.videoHeight || element?.height || 0)
  };
}

function getImageSourceForRaster(imageObject) {
  const source = imageObject?.rasterSourceSrc || imageObject?.mediaPreviewSrc || imageObject?.getSrc?.() || imageObject?.src || "";
  if (source && !imageObject.rasterSourceSrc && !/^https?:/i.test(source)) {
    imageObject.rasterSourceSrc = source;
  }
  return source;
}

function isVideoLayer(object) {
  return Boolean(object && (object.layerKind === "video" || object.mediaType === "video" || object.mediaSourceSrc));
}

function makeMediaCacheKey(itemOrObject = null) {
  return itemOrObject?.id || itemOrObject?.timelineItemId || itemOrObject?.layerId || itemOrObject?.mediaSourceSrc || itemOrObject?.source || "";
}

function makePlaceholderCanvas(width = 1280, height = 720, message = "Carregando video...") {
  const canvasElement = makeRasterCanvas(width, height);
  const ctx = canvasElement.getContext("2d");
  ctx.fillStyle = "#16181d";
  ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
  ctx.fillStyle = "#2b313c";
  ctx.fillRect(24, 24, canvasElement.width - 48, canvasElement.height - 48);
  ctx.fillStyle = "#f5f7fb";
  ctx.font = `600 ${Math.max(22, Math.round(canvasElement.height * 0.055))}px Segoe UI`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, canvasElement.width / 2, canvasElement.height / 2);
  return canvasElement;
}

function getOrCreateVideoDisplayCanvas(object) {
  const key = makeMediaCacheKey(object);
  if (!key) {
    return makePlaceholderCanvas();
  }
  if (!mediaDisplayCanvases.video.has(key)) {
    mediaDisplayCanvases.video.set(key, makePlaceholderCanvas());
  }
  return mediaDisplayCanvases.video.get(key);
}

function getMediaItemTimeRange(item) {
  const startTime = Math.max(0, Number(item?.startTime || 0));
  const duration = Math.max(0.1, Number(item?.duration || 0.1));
  return {
    startTime,
    endTime: startTime + duration
  };
}

function makeWaveformCacheKey(file) {
  if (!file) {
    return "";
  }
  return [
    file.path || "",
    file.name || "",
    Number(file.size || 0),
    Number(file.lastModified || 0)
  ].join("|");
}

async function generateWaveformFromFile(file, bars = 1200) {
  const cacheKey = makeWaveformCacheKey(file);
  if (cacheKey && mediaWaveformCache.has(cacheKey)) {
    return mediaWaveformCache.get(cacheKey);
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor || !file?.arrayBuffer) {
    return null;
  }

  const audioCtx = new AudioContextCtor();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    const safeBars = Math.max(16, Math.floor(Number(bars || 1200)));
    const samplesPerBar = Math.max(1, Math.floor(channelData.length / safeBars));
    const peaks = [];

    for (let index = 0; index < safeBars; index += 1) {
      const start = index * samplesPerBar;
      const end = Math.min(start + samplesPerBar, channelData.length);
      let min = 1;
      let max = -1;

      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        const value = channelData[sampleIndex];
        if (value < min) min = value;
        if (value > max) max = value;
      }

      peaks.push({ min, max });
    }

    const waveform = {
      peaks,
      duration: Math.max(0.1, Number(audioBuffer.duration || 0))
    };
    if (cacheKey) {
      mediaWaveformCache.set(cacheKey, waveform);
    }
    return waveform;
  } catch (err) {
    console.warn("Falha ao gerar waveform da midia:", err);
    return null;
  } finally {
    try {
      await audioCtx.close();
    } catch {
      // Ignore AudioContext close failures.
    }
  }
}

function cloneWaveform(waveform = null) {
  if (!waveform?.peaks) {
    return null;
  }
  return {
    peaks: waveform.peaks,
    duration: Math.max(0.1, Number(waveform.duration || 0))
  };
}

function isTimelineMediaItemActiveAt(item, time = timelinePlayhead) {
  if (!item || item.visible === false) {
    return false;
  }
  const value = Math.max(0, Number(time || 0));
  const range = getMediaItemTimeRange(item);
  return value >= range.startTime && value <= range.endTime;
}

function getTimelineItemMediaVolume(item, object = null) {
  const raw = item?.volume ?? object?.volume ?? 1;
  const value = Number(raw);
  return Number.isFinite(value) ? clampValue(value, 0, 2) : 1;
}

function getTimelineItemMediaMuted(item, object = null) {
  return Boolean(item?.muted ?? object?.muted ?? false);
}

function resolveMediaSourceUrl(source = "") {
  return toImageUrl(source, currentProjectFilePath || "");
}

function attachVideoLifecycle(video, key) {
  if (!video || video.dataset.lifecycleBound === "true") {
    return;
  }
  video.dataset.lifecycleBound = "true";
  video.addEventListener("loadedmetadata", () => {
    const object = getLayerObjects().find((entry) => makeMediaCacheKey(entry) === key);
    const item = timelineItems.find((entry) => makeMediaCacheKey(entry) === key || entry.layerId === object?.layerId);
    if (object && item && Number(video.duration) > 0 && Math.abs(Number(item.duration || 0) - Number(video.duration || 0)) > 0.05) {
      item.duration = Math.max(0.5, Number(video.duration || item.duration || 5));
    }
    syncVideoLayerFrame(object, video, { force: true });
    renderTimeline();
  });
  video.addEventListener("seeked", () => {
    const object = getLayerObjects().find((entry) => makeMediaCacheKey(entry) === key);
    syncVideoLayerFrame(object, video, { force: true });
  });
  video.addEventListener("loadeddata", () => {
    const object = getLayerObjects().find((entry) => makeMediaCacheKey(entry) === key);
    syncVideoLayerFrame(object, video, { force: true });
  });
  video.addEventListener("error", () => {
    const object = getLayerObjects().find((entry) => makeMediaCacheKey(entry) === key);
    syncVideoLayerFrame(object, video, { force: true, errored: true });
  });
}

function createVideoElementForSource(source = "", key = "") {
  const video = document.createElement("video");
  video.preload = "auto";
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.muted = false;
  video.loop = false;
  if (key) {
    attachVideoLifecycle(video, key);
  }
  video.src = resolveMediaSourceUrl(source);
  video.load?.();
  return video;
}

function getOrCreateVideoElement(itemOrObject) {
  const key = makeMediaCacheKey(itemOrObject);
  const source = itemOrObject?.source || itemOrObject?.mediaSourceSrc || "";
  if (!key || !source) {
    return null;
  }
  let video = mediaElements.video.get(key);
  if (!video) {
    video = createVideoElementForSource(source, key);
    mediaElements.video.set(key, video);
  } else if (video.src !== resolveMediaSourceUrl(source)) {
    video.pause?.();
    video.src = resolveMediaSourceUrl(source);
    video.load?.();
  }
  attachVideoLifecycle(video, key);
  return video;
}

function createAudioElementForSource(source = "") {
  const audio = document.createElement("audio");
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";
  audio.src = resolveMediaSourceUrl(source);
  audio.load?.();
  return audio;
}

function getOrCreateAudioElement(item) {
  const key = makeMediaCacheKey(item);
  const source = item?.source || "";
  if (!key || !source) {
    return null;
  }
  let audio = mediaElements.audio.get(key);
  if (!audio) {
    audio = createAudioElementForSource(source);
    mediaElements.audio.set(key, audio);
  } else if (audio.src !== resolveMediaSourceUrl(source)) {
    audio.pause?.();
    audio.src = resolveMediaSourceUrl(source);
    audio.load?.();
  }
  return audio;
}

function cleanupMediaElement(kind, key = "") {
  if (!key) {
    return;
  }
  const element = mediaElements[kind]?.get(key);
  if (element) {
    element.pause?.();
    element.removeAttribute("src");
    element.load?.();
    mediaElements[kind].delete(key);
  }
  if (kind === "video") {
    mediaDisplayCanvases.video.delete(key);
  }
}

function cleanupMediaForItemOrObject(itemOrObject = null) {
  const key = makeMediaCacheKey(itemOrObject);
  cleanupMediaElement("video", key);
  cleanupMediaElement("audio", key);
}

function cleanupUnusedMediaElements() {
  const activeKeys = new Set([
    ...timelineItems.map((item) => makeMediaCacheKey(item)).filter(Boolean),
    ...getLayerObjects().map((object) => makeMediaCacheKey(object)).filter(Boolean)
  ]);
  Array.from(mediaElements.video.keys()).forEach((key) => {
    if (!activeKeys.has(key)) {
      cleanupMediaElement("video", key);
    }
  });
  Array.from(mediaElements.audio.keys()).forEach((key) => {
    if (!activeKeys.has(key)) {
      cleanupMediaElement("audio", key);
    }
  });
}

function updateVideoObjectElement(object, element) {
  if (!object || !element) {
    return;
  }
  const previousWidth = Number(object.width || element.width || 1);
  const previousHeight = Number(object.height || element.height || 1);
  const previousScaleX = Number(object.scaleX || 1);
  const previousScaleY = Number(object.scaleY || 1);
  object.setElement(element, {
    width: previousWidth,
    height: previousHeight
  });
  object.set({
    width: previousWidth,
    height: previousHeight,
    scaleX: previousScaleX,
    scaleY: previousScaleY
  });
  object.dirty = true;
  object.setCoords();
}

function syncVideoLayerFrame(object, video, options = {}) {
  if (!object) {
    return;
  }
  const placeholderMessage = options.errored ? "Erro ao carregar video" : "Carregando video...";
  const displayCanvas = getOrCreateVideoDisplayCanvas(object);
  const width = Math.max(1, Number(video?.videoWidth || displayCanvas.width || 1280));
  const height = Math.max(1, Number(video?.videoHeight || displayCanvas.height || 720));
  if (displayCanvas.width !== width) {
    displayCanvas.width = width;
  }
  if (displayCanvas.height !== height) {
    displayCanvas.height = height;
  }
  const ctx = displayCanvas.getContext("2d");
  ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);

  const ready = !options.errored && video && video.readyState >= 2 && Number(video.videoWidth || 0) > 0 && Number(video.videoHeight || 0) > 0;
  if (!ready) {
    ctx.drawImage(makePlaceholderCanvas(displayCanvas.width, displayCanvas.height, placeholderMessage), 0, 0, displayCanvas.width, displayCanvas.height);
    updateVideoObjectElement(object, displayCanvas);
    canvas?.requestRenderAll();
    return;
  }

  ctx.drawImage(video, 0, 0, displayCanvas.width, displayCanvas.height);
  const maskObject = getMaskLayerForObject(object);
  if (maskObject && isLayerMaskEnabled(object)) {
    const maskSource = maskObject.rasterSourceSrc || object.rasterMaskSrc || "";
    if (maskSource) {
      void createRasterCanvasFromSource(maskSource, maskObject.getElement?.())
        .then((maskCanvas) => {
          const composed = composeMaskedRasterCanvas(displayCanvas, maskCanvas);
          updateVideoObjectElement(object, composed);
          canvas?.requestRenderAll();
        })
        .catch(() => {
          updateVideoObjectElement(object, displayCanvas);
          canvas?.requestRenderAll();
        });
      return;
    }
  }

  updateVideoObjectElement(object, displayCanvas);
  canvas?.requestRenderAll();
}

function pauseAllTimelineMedia() {
  mediaElements.video.forEach((video) => video.pause?.());
  mediaElements.audio.forEach((audio) => audio.pause?.());
}

function resetAllTimelineMediaTimes(time = 0) {
  mediaElements.video.forEach((video) => {
    try {
      video.currentTime = Math.max(0, Number(time || 0));
    } catch {
      // Ignore seek failures while loading metadata.
    }
  });
  mediaElements.audio.forEach((audio) => {
    try {
      audio.currentTime = Math.max(0, Number(time || 0));
    } catch {
      // Ignore seek failures while loading metadata.
    }
  });
}

function syncVideoTimelineAtTime(time = timelinePlayhead, options = {}) {
  const shouldPlay = Boolean(options.shouldPlay);
  timelineItems
    .filter((item) => item.type === "video")
    .forEach((item) => {
      const object = item.layerId ? findCanvasObject({ layerId: item.layerId }) : null;
      const video = getOrCreateVideoElement(item);
      if (!object) {
        return;
      }
      if (!video) {
        syncVideoLayerFrame(object, null, { force: true, errored: true });
        return;
      }

      const isActive = isTimelineMediaItemActiveAt(item, time) && object.visible !== false;
      const localTime = Math.max(0, Number(time || 0) - Number(item.startTime || 0));
      video.volume = getTimelineItemMediaVolume(item, object);
      video.muted = getTimelineItemMediaMuted(item, object);
      video.playbackRate = Math.max(0.1, Number(item.speed || 1));

      if (!isActive) {
        video.pause?.();
        syncVideoLayerFrame(object, video, { force: true });
        return;
      }

      const desiredTime = Math.max(0, localTime * video.playbackRate);
      if (!shouldPlay || Math.abs(Number(video.currentTime || 0) - desiredTime) > 0.12) {
        try {
          video.currentTime = desiredTime;
        } catch {
          // Ignore seek errors until metadata is ready.
        }
      }

      syncVideoLayerFrame(object, video, { force: true });
      if (shouldPlay) {
        const playPromise = video.play?.();
        if (playPromise?.catch) {
          playPromise.catch(() => {});
        }
      } else {
        video.pause?.();
      }
    });
}

function syncAudioTimelineAtTime(time = timelinePlayhead, options = {}) {
  const shouldPlay = Boolean(options.shouldPlay);
  timelineItems
    .filter((item) => item.type === "audio" || item.type === "music")
    .forEach((item) => {
      const audio = getOrCreateAudioElement(item);
      if (!audio) {
        return;
      }
      const isActive = isTimelineMediaItemActiveAt(item, time);
      const localTime = Math.max(0, Number(time || 0) - Number(item.startTime || 0));
      audio.volume = getTimelineItemMediaVolume(item);
      audio.muted = getTimelineItemMediaMuted(item);
      audio.playbackRate = Math.max(0.1, Number(item.speed || 1));

      if (!isActive) {
        audio.pause?.();
        return;
      }

      const desiredTime = Math.max(0, localTime * audio.playbackRate);
      if (!shouldPlay || Math.abs(Number(audio.currentTime || 0) - desiredTime) > 0.12) {
        try {
          audio.currentTime = desiredTime;
        } catch {
          // Ignore seek errors until metadata is ready.
        }
      }

      if (shouldPlay) {
        const playPromise = audio.play?.();
        if (playPromise?.catch) {
          playPromise.catch(() => {});
        }
      } else {
        audio.pause?.();
      }
    });
}

function syncTimelineMediaAtTime(time = timelinePlayhead, options = {}) {
  syncVideoTimelineAtTime(time, options);
  syncAudioTimelineAtTime(time, options);
}

function primeVideoLayer(object) {
  if (!object || !isVideoLayer(object)) {
    return;
  }
  updateVideoObjectElement(object, getOrCreateVideoDisplayCanvas(object));
  const video = getOrCreateVideoElement(object);
  if (!video) {
    syncVideoLayerFrame(object, null, { force: true, errored: true });
    return;
  }
  syncVideoLayerFrame(object, video, { force: true });
}

function hydrateVideoLayers() {
  getLayerObjects()
    .filter((object) => isVideoLayer(object))
    .forEach((object) => primeVideoLayer(object));
  syncTimelineMediaAtTime(timelinePlayhead, { shouldPlay: timelineIsPlaying });
}

function drawSourceIntoCanvas(source, canvasElement) {
  const ctx = canvasElement.getContext("2d");
  ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  if (source) {
    ctx.drawImage(source, 0, 0, canvasElement.width, canvasElement.height);
  }
  return canvasElement;
}

async function loadImageElement(source = "") {
  if (!source) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

async function createRasterCanvasFromSource(source = "", fallbackElement = null) {
  const fallbackSize = getImageElementSize(fallbackElement);
  if (!source && fallbackElement) {
    const canvasElement = makeRasterCanvas(fallbackSize.width, fallbackSize.height);
    return drawSourceIntoCanvas(fallbackElement, canvasElement);
  }

  try {
    const image = await loadImageElement(source);
    const size = getImageElementSize(image);
    const canvasElement = makeRasterCanvas(size.width || fallbackSize.width, size.height || fallbackSize.height);
    return drawSourceIntoCanvas(image, canvasElement);
  } catch (err) {
    if (!fallbackElement) {
      throw err;
    }

    const canvasElement = makeRasterCanvas(fallbackSize.width, fallbackSize.height);
    return drawSourceIntoCanvas(fallbackElement, canvasElement);
  }
}

async function createMaskCanvasForImage(imageObject, width, height) {
  if (imageObject?.rasterMaskSrc) {
    return createRasterCanvasFromSource(imageObject.rasterMaskSrc);
  }

  const canvasElement = makeRasterCanvas(width, height);
  const ctx = canvasElement.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
  return canvasElement;
}

async function createFabricImageFromCanvasElement(canvasElement) {
  return createFabricImageFromUrl(canvasElement.toDataURL("image/png"));
}

function makeBlankRasterCanvas(width = artboardWidth, height = artboardHeight) {
  return makeRasterCanvas(width, height);
}

async function createBlankRasterLayer(point = null, options = {}) {
  const blankCanvas = makeBlankRasterCanvas(artboardWidth, artboardHeight);
  const image = await createFabricImageFromCanvasElement(blankCanvas);
  image.set({
    left: artboardObject?.left || 0,
    top: artboardObject?.top || 0,
    originX: "left",
    originY: "top",
    name: "Camada raster",
    layerName: "Camada raster",
    layerKind: "raster",
    rasterSourceSrc: blankCanvas.toDataURL("image/png")
  });
  canvas.add(image);
  if (options.aboveLayerId) {
    const baseObject = getLayerObjectById(options.aboveLayerId);
    const baseIndex = baseObject ? canvas.getObjects().indexOf(baseObject) : -1;
    if (baseIndex >= 0) {
      canvas.moveObjectTo(image, baseIndex + 1);
    }
  }
  canvas.setActiveObject(image);
  updateSelectionInfo();
  return image;
}

function getCanvasObjectAtScenePoint(point) {
  if (!canvas || !point) {
    return null;
  }

  const Point = getFabricClass("Point");
  const scenePoint = new Point(point.x, point.y);
  return [...getLayerObjects()].reverse().find((object) => {
    if (!object.visible || object.layerLocked) {
      return false;
    }
    return object.containsPoint?.(scenePoint);
  }) || null;
}

function isRasterLayer(object) {
  return isRasterEditableImage(object) || isVideoLayer(object) || isMaskLayerObject(object);
}

async function rasterizeObjectToImage(object) {
  if (!object || isRasterEditableImage(object)) {
    return object;
  }

  const ok = window.confirm?.("Esta camada nao e uma imagem. Deseja converter em imagem para editar pixels?") ?? false;
  if (!ok) {
    return null;
  }

  const dataUrl = object.toDataURL?.({ format: "png", multiplier: 1 });
  if (!dataUrl) {
    showToolNotice("Nao foi possivel rasterizar esta camada.");
    return null;
  }

  const image = await createFabricImageFromUrl(dataUrl);
  image.set({
    left: object.left,
    top: object.top,
    angle: object.angle || 0,
    originX: object.originX || "left",
    originY: object.originY || "top",
    name: `${makeObjectName(object)} raster`,
    layerName: `${makeObjectName(object)} raster`,
    layerKind: "raster",
    rasterSourceSrc: dataUrl
  });
  canvas.add(image);
  canvas.remove(object);
  canvas.setActiveObject(image);
  updateSelectionInfo();
  return image;
}

const RasterEditManager = {
  resolveRasterTargetAtPoint(point) {
    const activeObject = getActiveEditableObject();
    if (isRasterEditableImage(activeObject) && !isMaskLayerObject(activeObject)) {
      return activeObject;
    }

    const hit = getCanvasObjectAtScenePoint(point);
    if (isRasterEditableImage(hit) && !isMaskLayerObject(hit)) {
      canvas.setActiveObject(hit);
      updateSelectionInfo();
      return hit;
    }

    return hit || null;
  },
  async ensureRasterTargetForTool(toolId, point) {
    if (normalizeToolId(toolId) === "maskBrush") {
      return MaskLayerManager.ensureMaskForSelectedOrBelow(point);
    }

    const target = this.resolveRasterTargetAtPoint(point);
    if (isVideoLayer(target)) {
      showToolNotice("Video no canvas aceita mascara e transformacao, mas nao pintura raster direta.");
      return null;
    }
    if (isRasterEditableImage(target) && !isMaskLayerObject(target)) {
      return target;
    }

    if (target && !isRasterEditableImage(target)) {
      return rasterizeObjectToImage(target);
    }

    return createBlankRasterLayer(point);
  },
  beginStroke(toolId, point) {
    return startRasterEditFromTarget(toolId, point);
  },
  updateStroke(point) {
    if (activeRasterEdit) {
      drawRasterStrokeSegment(activeRasterEdit, point);
    }
  },
  endStroke() {
    finishRasterEdit();
  },
  commitUndoSnapshot() {
    markCanvasChanged("raster-edit");
  }
};

function startRasterEditFromTarget(toolId, point) {
  return { toolId, point };
}

const MaskLayerManager = {
  getMaskForLayer(layerId) {
    const target = getLayerObjectById(layerId);
    return target ? getMaskLayerForObject(target) : null;
  },
  async createMaskForLayer(layerId) {
    let target = getLayerObjectById(layerId);
    if (!target) {
      return null;
    }
    if (!isRasterEditableImage(target) && !isVideoLayer(target)) {
      target = await rasterizeObjectToImage(target);
      if (!target) {
        return null;
      }
    }

    const bounds = getObjectScaledBounds(target);
    const maskCanvas = makeRasterCanvas(Math.max(1, Math.round(bounds.width || artboardWidth)), Math.max(1, Math.round(bounds.height || artboardHeight)));
    const maskCtx = maskCanvas.getContext("2d");
    maskCtx.fillStyle = "#FFFFFF";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    const image = await createFabricImageFromCanvasElement(maskCanvas);
    image.set({
      left: target.left,
      top: target.top,
      originX: target.originX || "left",
      originY: target.originY || "top",
      name: "Mascara",
      layerName: "Mascara",
      layerKind: "mask",
      targetMode: "parentLayer",
      parentLayerId: target.layerId,
      affectedLayerId: layerId,
      rasterSourceSrc: maskCanvas.toDataURL("image/png")
    });
    canvas.add(image);
    syncMaskObjectTransform(image, target);
    target.maskLayerId = image.layerId;
    target.rasterMaskSrc = image.rasterSourceSrc;
    target.maskEnabled = true;
    canvas.setActiveObject(image);
    updateSelectionInfo();
    await refreshLayerMaskComposite(target, { maskCanvas });
    return image;
  },
  async ensureMaskForSelectedOrBelow(point) {
    const activeObject = getActiveEditableObject();
    if (isMaskLayerObject(activeObject)) {
      return activeObject;
    }

    let target = activeObject && !activeObject.isArtboard ? activeObject : getCanvasObjectAtScenePoint(point);
    if (!target?.layerId) {
      showToolNotice("Selecione uma camada alvo para criar mascara.");
      return null;
    }
    if (isMaskLayerObject(target)) {
      return target;
    }
    if (!isRasterEditableImage(target) && !isVideoLayer(target)) {
      target = await rasterizeObjectToImage(target);
      if (!target) {
        return null;
      }
    }

    return this.getMaskForLayer(target.layerId) || this.createMaskForLayer(target.layerId);
  },
  paintMask(point, mode) {
    return { point, mode };
  },
  applyMaskPreview() {
    refreshAllMaskComposites();
    canvas?.requestRenderAll();
  }
};

function composeMaskPreview(sourceCanvas, maskCanvas) {
  const previewCanvas = makeRasterCanvas(sourceCanvas.width, sourceCanvas.height);
  const ctx = previewCanvas.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0);

  const tintCanvas = makeRasterCanvas(sourceCanvas.width, sourceCanvas.height);
  const tintCtx = tintCanvas.getContext("2d");
  tintCtx.drawImage(maskCanvas, 0, 0, tintCanvas.width, tintCanvas.height);
  const tintImage = tintCtx.getImageData(0, 0, tintCanvas.width, tintCanvas.height);
  for (let index = 0; index < tintImage.data.length; index += 4) {
    const gray = (tintImage.data[index] + tintImage.data[index + 1] + tintImage.data[index + 2]) / 3 / 255;
    const alpha = Math.round((1 - gray) * 255);
    tintImage.data[index] = 79;
    tintImage.data[index + 1] = 143;
    tintImage.data[index + 2] = 130;
    tintImage.data[index + 3] = alpha;
  }
  tintCtx.putImageData(tintImage, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.35;
  ctx.drawImage(tintCanvas, 0, 0);
  ctx.restore();
  return previewCanvas;
}

function composeMaskedRasterCanvas(sourceCanvas, maskCanvas) {
  const composedCanvas = makeRasterCanvas(sourceCanvas.width, sourceCanvas.height);
  const ctx = composedCanvas.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0);

  if (!maskCanvas) {
    return composedCanvas;
  }

  const sourceImage = ctx.getImageData(0, 0, composedCanvas.width, composedCanvas.height);
  const maskCtx = makeRasterCanvas(composedCanvas.width, composedCanvas.height).getContext("2d");
  maskCtx.drawImage(maskCanvas, 0, 0, composedCanvas.width, composedCanvas.height);
  const maskImage = maskCtx.getImageData(0, 0, composedCanvas.width, composedCanvas.height);

  for (let index = 0; index < sourceImage.data.length; index += 4) {
    const maskGray = (maskImage.data[index] + maskImage.data[index + 1] + maskImage.data[index + 2]) / 3 / 255;
    sourceImage.data[index + 3] = Math.round(sourceImage.data[index + 3] * maskGray);
  }

  ctx.putImageData(sourceImage, 0, 0);
  return composedCanvas;
}

function updateRasterImageElement(imageObject, sourceCanvas, maskCanvas = null, options = {}) {
  if (!imageObject) {
    return;
  }

  const maskedCanvas = maskCanvas ? composeMaskedRasterCanvas(sourceCanvas, maskCanvas) : sourceCanvas;
  const displayCanvas = maskCanvas && options.previewMask ? composeMaskPreview(maskedCanvas, maskCanvas) : maskedCanvas;
  const previousWidth = Number(imageObject.width || displayCanvas.width);
  const previousHeight = Number(imageObject.height || displayCanvas.height);
  const previousScaleX = Number(imageObject.scaleX || 1);
  const previousScaleY = Number(imageObject.scaleY || 1);
  const previousCropX = Number(imageObject.cropX || 0);
  const previousCropY = Number(imageObject.cropY || 0);
  imageObject.setElement(displayCanvas, {
    width: previousWidth,
    height: previousHeight
  });
  imageObject.set({
    width: previousWidth,
    height: previousHeight,
    scaleX: previousScaleX,
    scaleY: previousScaleY,
    cropX: previousCropX,
    cropY: previousCropY
  });
  imageObject.dirty = true;
  imageObject.setCoords();
  canvas?.requestRenderAll();
}

async function refreshLayerMaskComposite(layerObject, options = {}) {
  if (!layerObject || !isRasterEditableImage(layerObject) || isMaskLayerObject(layerObject)) {
    return;
  }

  const element = layerObject.getElement?.();
  const sourceCanvas = await createRasterCanvasFromSource(getImageSourceForRaster(layerObject), element);
  const maskObject = getMaskLayerForObject(layerObject);
  if (!maskObject || !isLayerMaskEnabled(layerObject)) {
    layerObject.rasterMaskSrc = null;
    updateRasterImageElement(layerObject, sourceCanvas, null);
    return;
  }

  const maskCanvas = options.maskCanvas || await createRasterCanvasFromSource(maskObject.rasterSourceSrc || layerObject.rasterMaskSrc || "", maskObject.getElement?.());
  layerObject.rasterMaskSrc = maskObject.rasterSourceSrc || maskCanvas.toDataURL("image/png");
  updateRasterImageElement(layerObject, sourceCanvas, maskCanvas, {
    previewMask: maskPreviewVisible
  });
}

function refreshAllMaskComposites() {
  getTopLevelLayerObjects()
    .filter((object) => isRasterEditableImage(object))
    .forEach((object) => {
      void refreshLayerMaskComposite(object);
    });
}

function getScenePointFromFabricEvent(event) {
  if (event.scenePoint) {
    return event.scenePoint;
  }

  if (canvas?.getScenePoint && event.e) {
    return canvas.getScenePoint(event.e);
  }

  if (canvas?.getPointer && event.e) {
    return canvas.getPointer(event.e);
  }

  return null;
}

function scenePointToImagePixel(imageObject, scenePoint, rasterCanvas) {
  if (!imageObject || !scenePoint || !rasterCanvas) {
    return null;
  }

  const Point = getFabricClass("Point");
  const invertTransform = fabricApi?.util?.invertTransform || fabricApi?.invertTransform;
  const transformPoint = fabricApi?.util?.transformPoint || fabricApi?.transformPoint;
  const matrix = imageObject.calcTransformMatrix?.();
  if (!Point || !invertTransform || !transformPoint || !matrix) {
    return null;
  }

  const localPoint = transformPoint(new Point(scenePoint.x, scenePoint.y), invertTransform(matrix));
  const objectWidth = Math.max(1, Number(imageObject.width || rasterCanvas.width || 1));
  const objectHeight = Math.max(1, Number(imageObject.height || rasterCanvas.height || 1));
  const x = (Number(localPoint.x || 0) + objectWidth / 2) * (rasterCanvas.width / objectWidth);
  const y = (Number(localPoint.y || 0) + objectHeight / 2) * (rasterCanvas.height / objectHeight);

  if (x < 0 || y < 0 || x > rasterCanvas.width || y > rasterCanvas.height) {
    return null;
  }

  return { x, y };
}

function drawRasterStrokeSegment(edit, point) {
  if (!edit || !point) {
    return;
  }

  const targetCanvas = edit.sourceCanvas;
  const ctx = targetCanvas.getContext("2d");
  const previous = edit.lastPoint || point;
  const config = edit.config;
  const radius = Math.max(1, config.size / 2);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = config.size;

  if (normalizeToolId(activeTool) === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = clampValue(config.opacity, 0, 100) / 100;
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = clampValue(config.opacity, 0, 100) / 100;
    ctx.strokeStyle = config.mode === "mask" ? getMaskPaintColor() : config.color;
    ctx.fillStyle = ctx.strokeStyle;

    if (config.brushKind === "pencil") {
      ctx.imageSmoothingEnabled = false;
    }

    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  edit.lastPoint = point;
  if (isMaskLayerObject(edit.imageObject)) {
    edit.imageObject.rasterSourceSrc = edit.sourceCanvas.toDataURL("image/png");
    const parentObject = getParentLayerForMask(edit.imageObject);
    if (parentObject) {
      parentObject.rasterMaskSrc = edit.imageObject.rasterSourceSrc;
      void refreshLayerMaskComposite(parentObject, { maskCanvas: edit.sourceCanvas });
    }
  } else {
    updateRasterImageElement(edit.imageObject, edit.sourceCanvas, null);
  }
}

function getMaskPaintColor() {
  return normalizeHexColor(brushColor?.value || "#20232A", "#20232A");
}

async function startRasterEdit(event) {
  if (!canvas || !isRasterTool()) {
    return false;
  }

  try {
    const scenePoint = getScenePointFromFabricEvent(event);
    const point = scenePoint ? { x: Number(scenePoint.x || 0), y: Number(scenePoint.y || 0) } : null;
    const imageObject = await RasterEditManager.ensureRasterTargetForTool(activeTool, point);
    if (!isRasterEditableImage(imageObject)) {
      if (brushStatus) {
        brushStatus.textContent = "Selecione uma imagem para pintar";
      }
      return false;
    }

    const config = getBrushConfig();
    const element = imageObject.getElement?.();
    const sourceCanvas = isMaskLayerObject(imageObject)
      ? await createMaskCanvasForImage(imageObject, Number(imageObject.width || artboardWidth), Number(imageObject.height || artboardHeight))
      : await createRasterCanvasFromSource(getImageSourceForRaster(imageObject), element);
    const originalSource = imageObject.rasterSourceSrc || sourceCanvas.toDataURL("image/png");
    imageObject.rasterSourceSrc = originalSource;

    activeRasterEdit = {
      imageObject,
      sourceCanvas,
      maskCanvas: null,
      config,
      lastPoint: null
    };

    const imagePoint = scenePointToImagePixel(imageObject, scenePoint, sourceCanvas);
    if (!imagePoint) {
      activeRasterEdit = null;
      return false;
    }

    event.e?.preventDefault?.();
    drawRasterStrokeSegment(activeRasterEdit, imagePoint);
    return true;
  } catch (err) {
    activeRasterEdit = null;
    if (brushStatus) {
      brushStatus.textContent = `Erro ao preparar edicao raster: ${err.message || err}`;
    }
    return false;
  }
}

function continueRasterEdit(event) {
  if (!activeRasterEdit) {
    return;
  }

  const point = scenePointToImagePixel(
    activeRasterEdit.imageObject,
    getScenePointFromFabricEvent(event),
    activeRasterEdit.sourceCanvas
  );
  if (!point) {
    return;
  }

  event.e?.preventDefault?.();
  drawRasterStrokeSegment(activeRasterEdit, point);
}

function finishRasterEdit() {
  if (!activeRasterEdit) {
    return;
  }

  try {
    const { imageObject, sourceCanvas, config } = activeRasterEdit;
    const dataUrl = sourceCanvas.toDataURL("image/png");
    imageObject.rasterSourceSrc = dataUrl;
    if (isMaskLayerObject(imageObject)) {
      const parentObject = getParentLayerForMask(imageObject);
      if (parentObject) {
        parentObject.rasterMaskSrc = dataUrl;
        syncMaskObjectTransform(imageObject, parentObject);
        void refreshLayerMaskComposite(parentObject, { maskCanvas: sourceCanvas });
      }
    }

    imageObject.rasterEditedAt = new Date().toISOString();
    canvas.setActiveObject(imageObject);
    updateSelectionInfo();
    markCanvasChanged(config.mode === "mask" ? "raster-mask" : "raster-edit");

    if (brushStatus) {
      brushStatus.textContent = config.mode === "mask"
        ? "Mascara atualizada."
        : "Pixels atualizados na imagem selecionada.";
    }
  } catch (err) {
    if (brushStatus) {
      brushStatus.textContent = `Erro ao concluir edicao raster: ${err.message || err}`;
    }
  } finally {
    activeRasterEdit = null;
  }
}

function getPrimaryColor() {
  return normalizeHexColor(editorColors.primary || brushColor?.value || "#20232A", "#20232A");
}

function getSecondaryColor() {
  return normalizeHexColor(editorColors.secondary || "#F2B84B", "#F2B84B");
}

function setPrimaryColor(color) {
  if (!isValidHex(color)) {
    return;
  }

  editorColors.primary = normalizeHexColor(color, "#20232A");
  if (brushColor) {
    brushColor.value = editorColors.primary;
  }
  syncColorToolButton();
  configureBrush();
}

function setSecondaryColor(color) {
  if (!isValidHex(color)) {
    return;
  }

  editorColors.secondary = normalizeHexColor(color, "#F2B84B");
  syncColorToolButton();
}

function syncColorToolButton() {
  const colorButton = toolbarHost?.querySelector('[data-action="color-picker"]');
  if (!colorButton) {
    return;
  }

  colorButton.style.background = `linear-gradient(135deg, ${getPrimaryColor()} 0 50%, ${getSecondaryColor()} 50% 100%)`;
  colorButton.style.borderColor = "#eef1f5";
}

function getToolbarColorPanel() {
  let panel = document.getElementById("toolbarColorPanel");
  if (panel) {
    return panel;
  }

  panel = document.createElement("div");
  panel.id = "toolbarColorPanel";
  panel.className = "toolbar-color-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <label>Primaria <input type="color" data-color-role="primary"></label>
    <label>Secundaria <input type="color" data-color-role="secondary"></label>
  `;
  document.body.appendChild(panel);
  panel.querySelector('[data-color-role="primary"]')?.addEventListener("input", (event) => {
    setPrimaryColor(event.target.value);
  });
  panel.querySelector('[data-color-role="secondary"]')?.addEventListener("input", (event) => {
    setSecondaryColor(event.target.value);
  });
  return panel;
}

function hideFloatingPanel(panelId) {
  const panel = document.getElementById(panelId);
  if (panel) {
    panel.hidden = true;
  }
}

function toggleColorPanel() {
  const panel = getToolbarColorPanel();
  const primaryInput = panel.querySelector('[data-color-role="primary"]');
  const secondaryInput = panel.querySelector('[data-color-role="secondary"]');
  if (primaryInput) {
    primaryInput.value = getPrimaryColor();
  }
  if (secondaryInput) {
    secondaryInput.value = getSecondaryColor();
  }

  const colorButton = toolbarHost?.querySelector('[data-action="color-picker"]');
  const bounds = colorButton?.getBoundingClientRect?.();
  if (bounds) {
    panel.style.left = `${Math.round(bounds.right + 12)}px`;
    panel.style.top = `${Math.round(bounds.top)}px`;
  }

  panel.hidden = !panel.hidden;
}

document.addEventListener("pointerdown", (event) => {
  const colorPanel = document.getElementById("toolbarColorPanel");
  if (!colorPanel || colorPanel.hidden) {
    return;
  }
  if (colorPanel.contains(event.target) || toolbarHost?.contains(event.target)) {
    return;
  }
  colorPanel.hidden = true;
});

document.addEventListener("click", (event) => {
  const button = event.target?.closest?.("[data-media-panel-action]");
  if (!button) {
    return;
  }

  const action = String(button.getAttribute("data-media-panel-action") || "").trim();
  const panel = document.getElementById("toolbarMediaPanel");
  if (panel) {
    panel.hidden = true;
  }

  if (action === "upload") {
    imageInput?.click();
    return;
  }

  if (action === "generate-video") {
    void CanvasVideoActions.generateVideo({
      fromSelection: false
    }).catch((error) => {
      showToolNotice(error.message || "Falha ao gerar video.");
    });
    return;
  }

  if (action === "animate-selection") {
    void CanvasVideoActions.generateVideo({
      fromSelection: true,
      useSelectedLayer: true
    }).catch((error) => {
      showToolNotice(error.message || "Falha ao animar selecao.");
    });
  }
});

function getSimpleFloatingPanel(id, title, message) {
  let panel = document.getElementById(id);
  if (panel) {
    return panel;
  }

  panel = document.createElement("div");
  panel.id = id;
  panel.className = "toolbar-color-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <strong>${title}</strong>
    <span>${message}</span>
  `;
  document.body.appendChild(panel);
  return panel;
}

function positionFloatingPanelNearToolbarAction(panel, actionId) {
  const button = toolbarHost?.querySelector(`[data-action="${actionId}"]`);
  const bounds = button?.getBoundingClientRect?.();
  if (!bounds) {
    return;
  }

  panel.style.left = `${Math.round(bounds.right + 12)}px`;
  panel.style.top = `${Math.round(bounds.top)}px`;
}

function openMediaPanel() {
  const panel = getSimpleFloatingPanel("toolbarMediaPanel", "Midia", "Selecione imagem, audio ou video para inserir no projeto.");
  panel.innerHTML = `
    <strong>Midia</strong>
    <span>Escolha como deseja adicionar ou gerar midia no Canvas.</span>
    <div class="toolbar-media-actions">
      <button type="button" data-media-panel-action="upload">Inserir arquivo</button>
      <button type="button" data-media-panel-action="generate-video">Gerar video</button>
      <button type="button" data-media-panel-action="animate-selection">Animar selecao</button>
    </div>
  `;
  positionFloatingPanelNearToolbarAction(panel, "add-image");
  panel.hidden = false;
}

function openStickersPanel() {
  const panel = getSimpleFloatingPanel("toolbarStickersPanel", "Stiks", "Stiks em implementacao.");
  positionFloatingPanelNearToolbarAction(panel, "open-sticks");
  panel.hidden = false;
}

function getScenePoint(event) {
  const point = getScenePointFromFabricEvent(event);
  return point ? { x: Number(point.x || 0), y: Number(point.y || 0) } : null;
}

function makeBoxFromPoints(start, end) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { left, top, width, height };
}

function removeToolOverlay(object) {
  if (object && canvas?.getObjects?.().includes(object)) {
    canvas.remove(object);
  }
}

function clearToolOverlays() {
  canvas?.getObjects()
    .filter((object) => object.isToolOverlay)
    .forEach((object) => canvas.remove(object));
}

function createSelectionOverlay(type = "rect") {
  const Rect = getFabricClass("Rect");
  const Ellipse = getFabricClass("Ellipse");
  const object = type === "ellipse" && Ellipse
    ? new Ellipse({
      left: 0,
      top: 0,
      rx: 1,
      ry: 1,
      originX: "left",
      originY: "top",
      fill: "rgba(79,143,130,0.14)",
      stroke: "#4F8F82",
      strokeDashArray: [8, 5],
      selectable: false,
      evented: false,
      isToolOverlay: true
    })
    : new Rect({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
      originX: "left",
      originY: "top",
      fill: "rgba(79,143,130,0.14)",
      stroke: "#4F8F82",
      strokeDashArray: [8, 5],
      selectable: false,
      evented: false,
      isToolOverlay: true
    });
  object.excludeFromExport = true;
  return object;
}

function updateSelectionOverlay() {
  if (!canvas || !selectionState.bounds || !selectionState.overlay) {
    return;
  }

  const bounds = selectionState.bounds;
  const overlay = selectionState.overlay;
  if (overlay.type === "ellipse") {
    overlay.set({
      left: bounds.left,
      top: bounds.top,
      rx: Math.max(1, bounds.width / 2),
      ry: Math.max(1, bounds.height / 2),
      originX: "left",
      originY: "top",
      scaleX: 1,
      scaleY: 1
    });
  } else {
    overlay.set({
      left: bounds.left,
      top: bounds.top,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
      originX: "left",
      originY: "top",
      scaleX: 1,
      scaleY: 1
    });
  }
  overlay.setCoords();
  canvas.bringObjectToFront?.(overlay);
  canvas.requestRenderAll();
}

const SelectionManager = {
  startSelection(type, point) {
    const activeObject = getActiveEditableObject();
    selectionTargetLayerId = activeObject?.layerId || null;
    clearSelection();
    selectionTargetLayerId = activeObject?.layerId || null;
    selectionState = {
      type,
      start: point,
      end: point,
      bounds: makeBoxFromPoints(point, point),
      overlay: createSelectionOverlay(type),
      active: false
    };
    canvas.add(selectionState.overlay);
    if (activeObject && canvas.getObjects().includes(activeObject)) {
      canvas.setActiveObject(activeObject);
    }
    updateSelectionOverlay();
  },
  updateSelection(point) {
    if (!selectionState.start) {
      return;
    }
    selectionState.end = point;
    selectionState.bounds = makeBoxFromPoints(selectionState.start, point);
    updateSelectionOverlay();
  },
  commitSelection() {
    if (!selectionState.bounds || selectionState.bounds.width < 1 || selectionState.bounds.height < 1) {
      clearSelection();
      return;
    }
    selectionState.active = true;
    updateSelectionOverlay();
    showToolNotice("Selecao ativa.");
  },
  clearSelection() {
    clearSelection();
  },
  getSelectionBounds() {
    return getSelectionBounds();
  },
  hasSelection() {
    return hasSelection();
  },
  getSelectionMask() {
    return getSelectionMask();
  }
};

function startSelectionAreaTool(event, type = "rect") {
  const start = getScenePoint(event);
  if (!start || !canvas) {
    return;
  }

  SelectionManager.startSelection(type === "ellipse" ? "ellipse" : "rect", start);
  activeToolPointerState = { kind: "selection" };
  event.e?.preventDefault?.();
}

function updateBoxTool(event) {
  if (activeToolPointerState?.kind === "selection") {
    const currentPoint = getScenePoint(event);
    if (currentPoint) {
      SelectionManager.updateSelection(currentPoint);
    }
    return;
  }

  if (!activeToolPointerState?.object) {
    return;
  }

  const current = getScenePoint(event);
  if (!current) {
    return;
  }

  const box = makeBoxFromPoints(activeToolPointerState.start, current);
  const object = activeToolPointerState.object;
  if (object.type === "ellipse") {
    object.set({
      left: box.left,
      top: box.top,
      rx: Math.max(1, box.width / 2),
      ry: Math.max(1, box.height / 2)
    });
  } else {
    object.set({
      left: box.left,
      top: box.top,
      width: Math.max(1, box.width),
      height: Math.max(1, box.height)
    });
  }
  object.setCoords();
  canvas?.requestRenderAll();
}

function finishSelectionAreaTool() {
  if (activeToolPointerState?.kind !== "selection") {
    return;
  }

  SelectionManager.commitSelection();
  activeToolPointerState = null;
}

function clearSelection() {
  if (selectionState.overlay) {
    removeToolOverlay(selectionState.overlay);
  }
  selectionTargetLayerId = null;
  selectionState = {
    type: null,
    start: null,
    end: null,
    bounds: null,
    overlay: null,
    active: false
  };
  canvas?.requestRenderAll();
}

function getSelectionBounds() {
  return selectionState.active && selectionState.bounds
    ? { ...selectionState.bounds, type: selectionState.type }
    : null;
}

function hasSelection() {
  return Boolean(getSelectionBounds());
}

function getSelectionMask() {
  const bounds = getSelectionBounds();
  if (!bounds) {
    return null;
  }
  const mask = makeRasterCanvas(bounds.width, bounds.height);
  const ctx = mask.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  if (bounds.type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(bounds.width / 2, bounds.height / 2, bounds.width / 2, bounds.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, bounds.width, bounds.height);
  }
  return mask;
}

function getActiveRasterLayer() {
  const explicitTarget = selectionTargetLayerId ? getLayerObjectById(selectionTargetLayerId) : null;
  if (isRasterEditableImage(explicitTarget)) {
    return explicitTarget;
  }

  const object = getActiveEditableObject();
  if (isMaskLayerObject(object)) {
    const parentObject = getParentLayerForMask(object);
    if (isRasterEditableImage(parentObject)) {
      return parentObject;
    }
  }
  if (isRasterEditableImage(object)) {
    return object;
  }

  const bounds = getSelectionBounds();
  const center = bounds
    ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
    : null;
  const hit = getCanvasObjectAtScenePoint(center);
  return isRasterEditableImage(hit) ? hit : null;
}

function getActiveSelection() {
  return hasSelection()
    ? {
      type: selectionState.type,
      start: selectionState.start ? { ...selectionState.start } : null,
      end: selectionState.end ? { ...selectionState.end } : null,
      bounds: getSelectionBounds(),
      layerId: selectionTargetLayerId
    }
    : null;
}

async function createSelectionCanvasFromLayer(layer) {
  const bounds = getSelectionBounds();
  if (!bounds || !layer) {
    return null;
  }

  const sourceCanvas = await createRasterCanvasFromSource(getImageSourceForRaster(layer), layer.getElement?.());
  const tl = scenePointToImagePixel(layer, { x: bounds.left, y: bounds.top }, sourceCanvas);
  const br = scenePointToImagePixel(layer, { x: bounds.left + bounds.width, y: bounds.top + bounds.height }, sourceCanvas);
  if (!tl || !br) {
    return null;
  }

  const sx = Math.max(0, Math.floor(Math.min(tl.x, br.x)));
  const sy = Math.max(0, Math.floor(Math.min(tl.y, br.y)));
  const sw = Math.max(1, Math.floor(Math.abs(br.x - tl.x)));
  const sh = Math.max(1, Math.floor(Math.abs(br.y - tl.y)));
  const output = makeRasterCanvas(sw, sh);
  const ctx = output.getContext("2d");
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const mask = getSelectionMask();
  if (mask && bounds.type === "ellipse") {
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, sw, sh);
  }

  return { canvas: output, sx, sy, sw, sh, sourceCanvas, sceneLeft: bounds.left, sceneTop: bounds.top };
}

async function copySelectionPixels() {
  const layer = getActiveRasterLayer();
  const selection = await createSelectionCanvasFromLayer(layer);
  if (!selection) {
    showToolNotice("Nenhuma selecao raster para copiar.");
    return null;
  }
  rasterClipboard = selection.canvas.toDataURL("image/png");
  showToolNotice("Pixels copiados da selecao.");
  return rasterClipboard;
}

async function cutSelectionPixels() {
  await copySelectionPixels();
  await deleteSelectionPixels();
}

async function duplicateSelectionToLayer() {
  const layer = getActiveRasterLayer();
  const selection = await createSelectionCanvasFromLayer(layer);
  if (!selection) {
    showToolNotice("Nenhuma selecao raster para duplicar.");
    return null;
  }

  const image = await createFabricImageFromCanvasElement(selection.canvas);
  image.set({
    left: selection.sceneLeft,
    top: selection.sceneTop,
    originX: "left",
    originY: "top",
    name: "Selecao duplicada",
    layerName: "Selecao duplicada",
    layerKind: "raster",
    rasterSourceSrc: selection.canvas.toDataURL("image/png")
  });
  canvas.add(image);
  canvas.setActiveObject(image);
  updateSelectionInfo();
  markCanvasChanged("duplicate-selection");
  return image;
}

async function deleteSelectionPixels() {
  const layer = getActiveRasterLayer();
  const selection = await createSelectionCanvasFromLayer(layer);
  if (!selection) {
    return false;
  }

  const ctx = selection.sourceCanvas.getContext("2d");
  if (getSelectionBounds().type === "ellipse") {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.ellipse(selection.sx + selection.sw / 2, selection.sy + selection.sh / 2, selection.sw / 2, selection.sh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.clearRect(selection.sx, selection.sy, selection.sw, selection.sh);
  }
  layer.rasterSourceSrc = selection.sourceCanvas.toDataURL("image/png");
  updateRasterImageElement(layer, selection.sourceCanvas);
  markCanvasChanged("delete-selection");
  return true;
}

async function pasteRasterClipboard() {
  if (!rasterClipboard) {
    return false;
  }
  const image = await createFabricImageFromUrl(rasterClipboard);
  image.set({
    left: getSelectionBounds()?.left || artboardObject?.left || 0,
    top: getSelectionBounds()?.top || artboardObject?.top || 0,
    originX: "left",
    originY: "top",
    name: "Colagem raster",
    layerName: "Colagem raster",
    layerKind: "raster",
    rasterSourceSrc: rasterClipboard
  });
  canvas.add(image);
  canvas.setActiveObject(image);
  updateSelectionInfo();
  markCanvasChanged("paste-selection");
  return true;
}

function makeShapeObject(shape, box) {
  const Rect = getFabricClass("Rect");
  const Ellipse = getFabricClass("Ellipse");
  const common = {
    fill: getSecondaryColor(),
    stroke: getPrimaryColor(),
    strokeWidth: 3,
    selectable: false,
    evented: false,
    isToolOverlay: true
  };

  if (shape === "ellipse" && Ellipse) {
    return new Ellipse({
      ...common,
      left: box.left,
      top: box.top,
      rx: Math.max(1, box.width / 2),
      ry: Math.max(1, box.height / 2),
      originX: "left",
      originY: "top"
    });
  }

  return new Rect({
    ...common,
    left: box.left,
    top: box.top,
    width: Math.max(1, box.width),
    height: Math.max(1, box.height),
    rx: shape === "roundedRect" ? 28 : 0,
    ry: shape === "roundedRect" ? 28 : 0
  });
}

function startShapeTool(event, shape = "rect") {
  const start = getScenePoint(event);
  if (!start || !canvas) {
    return;
  }

  const object = makeShapeObject(shape, { left: start.x, top: start.y, width: 1, height: 1 });
  activeToolPointerState = { kind: "shape", shape, start, object };
  canvas.add(object);
  event.e?.preventDefault?.();
}

function finishShapeTool() {
  if (!activeToolPointerState?.object || activeToolPointerState.kind !== "shape") {
    return;
  }

  const object = activeToolPointerState.object;
  object.set({
    selectable: true,
    evented: true,
    isToolOverlay: false
  });
  ensureLayerMetadata(object, getLayerObjects().length);
  ensureTimelineItemForCanvasObject(object);
  canvas.setActiveObject(object);
  canvas.requestRenderAll();
  updateLayers();
  updateSelectionInfo();
  markCanvasChanged("shape");
  activeToolPointerState = null;
}

function createTextObjectAt(point, options = {}) {
  const Textbox = getFabricClass("Textbox");
  const object = new Textbox(options.text || "Texto editavel", {
    left: point.x,
    top: point.y,
    originX: "left",
    originY: "top",
    width: options.width || 360,
    fontFamily: "Segoe UI",
    fontSize: 48,
    fill: getPrimaryColor(),
    textAlign: "left"
  });
  canvas.add(object);
  object.setCoords();
  canvas.setActiveObject(object);
  object.enterEditing?.();
  object.selectAll?.();
  updateSelectionInfo();
  addTimelineItem({
    type: "text",
    layerId: object.layerId,
    source: object.layerId,
    label: makeObjectName(object),
    duration: 5
  });
  markCanvasChanged("text");
  return object;
}

function createTextAtPointer(event) {
  const point = getScenePoint(event);
  if (!point || !canvas) {
    return;
  }

  createTextObjectAt(point);
}

function startTextBoxTool(event) {
  const start = getScenePoint(event);
  if (!start || !canvas) {
    return;
  }

  const Rect = getFabricClass("Rect");
  const object = new Rect({
    left: start.x,
    top: start.y,
    width: 1,
    height: 1,
    fill: "rgba(79,143,130,0.08)",
    stroke: getPrimaryColor(),
    strokeDashArray: [6, 4],
    selectable: false,
    evented: false,
    isToolOverlay: true
  });
  activeToolPointerState = { kind: "textBox", start, object };
  canvas.add(object);
}

function finishTextBoxTool() {
  if (!activeToolPointerState?.object || activeToolPointerState.kind !== "textBox") {
    return;
  }

  const object = activeToolPointerState.object;
  const box = {
    x: Number(object.left || 0),
    y: Number(object.top || 0),
    width: Math.max(160, Number(object.width || 160))
  };
  removeToolOverlay(object);
  createTextObjectAt({ x: box.x, y: box.y }, { width: box.width });
  activeToolPointerState = null;
}

function zoomAtPointer(event) {
  if (!canvas) {
    return;
  }

  const Point = getFabricClass("Point");
  const nativeEvent = event.e || {};
  const currentZoom = canvas.getZoom();
  const zoomOut = nativeEvent.altKey || nativeEvent.button === 2;
  const nextZoom = clampValue(currentZoom * (zoomOut ? 0.8 : 1.25), MIN_ZOOM, MAX_ZOOM);
  canvas.zoomToPoint(new Point(nativeEvent.offsetX || 0, nativeEvent.offsetY || 0), nextZoom);
  syncZoomLabel();
}

function pickColorAtPointer(event) {
  const nativeEvent = event.e || {};
  const targetCanvas = canvas?.lowerCanvasEl;
  if (!targetCanvas) {
    return;
  }

  const ctx = targetCanvas.getContext("2d", { willReadFrequently: true });
  const pixel = ctx.getImageData(Math.round(nativeEvent.offsetX || 0), Math.round(nativeEvent.offsetY || 0), 1, 1).data;
  const hex = `#${[pixel[0], pixel[1], pixel[2]].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  setPrimaryColor(hex);
  showToolNotice(`Cor primaria: ${hex}`);
}

function clearVectorDraft() {
  vectorDraft.overlays.forEach(removeToolOverlay);
  vectorDraft = { points: [], overlays: [] };
  canvas?.requestRenderAll();
}

function addVectorOverlay(object) {
  object.set({
    selectable: false,
    evented: false,
    isToolOverlay: true,
    vectorRole: "draft"
  });
  vectorDraft.overlays.push(object);
  canvas.add(object);
}

function distanceBetweenPoints(a, b) {
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function addVectorPenPoint(event) {
  const point = getScenePoint(event);
  if (!point || !canvas) {
    return;
  }

  if (vectorDraft.points.length >= 3 && distanceBetweenPoints(point, vectorDraft.points[0]) < 14) {
    closeVectorShape();
    return;
  }

  const Circle = getFabricClass("Circle");
  const Line = getFabricClass("Line");
  if (vectorDraft.points.length && Line) {
    const previous = vectorDraft.points[vectorDraft.points.length - 1];
    addVectorOverlay(new Line([previous.x, previous.y, point.x, point.y], {
      stroke: getPrimaryColor(),
      strokeWidth: 2
    }));
  }

  vectorDraft.points.push(point);
  if (Circle) {
    addVectorOverlay(new Circle({
      left: point.x - 4,
      top: point.y - 4,
      radius: 4,
      fill: getPrimaryColor()
    }));
  }
}

function closeVectorShape() {
  const Polygon = getFabricClass("Polygon");
  if (!Polygon || vectorDraft.points.length < 3) {
    return;
  }

  const object = new Polygon(vectorDraft.points, {
    fill: getSecondaryColor(),
    stroke: getPrimaryColor(),
    strokeWidth: 3,
    objectCaching: false
  });
  clearVectorDraft();
  canvas.add(object);
  object.setCoords();
  canvas.setActiveObject(object);
  canvas.requestRenderAll();
  updateSelectionInfo();
  markCanvasChanged("vector");
}

function handleVectorCurvePointerDown(event) {
  const point = getScenePoint(event);
  const target = event.target && !event.target.isToolOverlay ? event.target : getCanvasObjectAtScenePoint(point);
  const object = target && !target.isArtboard ? target : getActiveEditableObject();
  if (!object) {
    showToolNotice("Clique em um ponto vetorial existente para editar curva.");
    return;
  }

  canvas.setActiveObject(object);
  drawVectorEditHandles(object);
  const nearest = point ? getNearestVectorPoint(object, point, 18) : null;
  if (!nearest) {
    showToolNotice("Pontos exibidos. Clique em um no para converter em curva.");
    return;
  }

  object.vectorCurvePoints = Array.isArray(object.vectorCurvePoints) ? object.vectorCurvePoints : [];
  if (!object.vectorCurvePoints.includes(nearest.index)) {
    object.vectorCurvePoints.push(nearest.index);
  }
  showToolNotice("No marcado como curva. Handles Bezier completos serao refinados na proxima etapa.");
  markCanvasChanged("vector-curve");
}

function updatePropertyControls(object) {
  if (!object) {
    setInputValue(propX, 0);
    setInputValue(propY, 0);
    setInputValue(propW, 0);
    setInputValue(propH, 0);
    setInputValue(propAngle, 0);
    setInputValue(propOpacity, 100);
    setInputValue(propSpeed, 1);
    setInputValue(propFill, "#20232A");
    setInputValue(propStroke, "#000000");
    setInputValue(propStrokeWidth, 0);
    renderFontOptions("Segoe UI");
    setInputValue(propFontSize, 64);
    setInputValue(propTextAlign, "center");
    setPropertyControlsDisabled(true);
    return;
  }

  setPropertyControlsDisabled(false, object);

  const scaledWidth = object.getScaledWidth ? object.getScaledWidth() : object.width || 0;
  const scaledHeight = object.getScaledHeight ? object.getScaledHeight() : object.height || 0;

  setInputValue(propX, formatNumber(object.left));
  setInputValue(propY, formatNumber(object.top));
  setInputValue(propW, formatNumber(scaledWidth));
  setInputValue(propH, formatNumber(scaledHeight));
  setInputValue(propAngle, formatNumber(object.angle));
  setInputValue(propOpacity, formatNumber((object.opacity ?? 1) * 100));
  const timelineItem = object.layerId ? timelineItems.find((item) => item.layerId === object.layerId) : null;
  setInputValue(propSpeed, timelineItem?.speed ?? 1);
  setInputValue(propFill, getObjectFillColor(object));
  setInputValue(propStroke, getObjectStrokeColor(object));
  setInputValue(propStrokeWidth, formatNumber(object.strokeWidth || 0));

  const family = object.fontFamily || "Segoe UI";
  renderFontOptions(family);
  setInputValue(propFontSize, formatNumber(object.fontSize || 64));
  setInputValue(propTextAlign, object.textAlign || "left");
}

function updateSelectionInfo() {
  if (!canvas) {
    return;
  }

  const object = canvas.getActiveObject();
  if (!object) {
    updatePropertyControls(null);
    updateLayers();
    syncInspectorContext(null);
    return;
  }
  updatePropertyControls(isMaskLayerObject(object) ? null : object);
  updateLayers();
  syncInspectorContext(object);
}

function renderBrandKitList(target, items = [], emptyText, options = {}) {
  if (!target) {
    return;
  }

  target.innerHTML = "";
  target.classList.toggle("empty-state", !items.length);

  if (!items.length) {
    target.textContent = emptyText;
    return;
  }

  items.forEach((item) => {
    const row = document.createElement(options.action ? "button" : "div");
    if (options.action) {
      row.type = "button";
      row.title = options.title || "";
      row.addEventListener("click", () => options.action(item));
    }
    row.className = "brand-kit-item";
    const title = document.createElement("span");
    const subtitle = document.createElement("small");
    title.textContent = item.name || getFileName(item.path);
    subtitle.textContent = options.subtitle?.(item) || item.path || "";
    row.appendChild(title);
    row.appendChild(subtitle);
    target.appendChild(row);
  });
}

function createArtboardObject() {
  const Rect = getFabricClass("Rect");
  const Shadow = getFabricClass("Shadow");
  return new Rect({
    left: 0,
    top: 0,
    originX: "left",
    originY: "top",
    width: artboardWidth,
    height: artboardHeight,
    fill: "#ffffff",
    stroke: "#d7dbe0",
    strokeWidth: 2,
    selectable: false,
    evented: false,
    excludeFromExport: true,
    isArtboard: true,
    shadow: Shadow ? new Shadow({
      color: "rgba(0,0,0,0.34)",
      blur: 46,
      offsetX: 0,
      offsetY: 24
    }) : null
  });
}

function addArtboardObject() {
  if (!canvas) {
    return;
  }

  artboardObject = createArtboardObject();
  canvas.add(artboardObject);
  canvas.sendObjectToBack?.(artboardObject);
}

function renderColorPreview(colors = []) {
  if (!brandColorPreview) {
    return;
  }

  brandColorPreview.innerHTML = "";
  colors.filter((color) => isValidHex(color.hex)).forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.dataset.color = color.hex;
    swatch.style.background = color.hex;
    swatch.title = `Aplicar ${color.name}: ${color.hex}`;
    swatch.setAttribute("aria-label", `Aplicar ${color.name}: ${color.hex}`);
    swatch.addEventListener("click", () => applyColorToSelection(color.hex));
    brandColorPreview.appendChild(swatch);
  });
}

function renderBrandKit(brandKit = createLocalDefaultBrandKit(), filePath = currentBrandKitFilePath) {
  currentBrandKit = normalizeBrandKitPaths(brandKit, filePath);
  currentBrandKitFilePath = filePath || null;

  if (brandKitName) {
    brandKitName.value = currentBrandKit.name || "Novo Brand Kit";
  }

  if (brandKitVoice) {
    brandKitVoice.value = currentBrandKit.identity?.voice || "";
  }

  if (brandKitColors) {
    brandKitColors.value = formatColorLines(currentBrandKit.colors || []);
  }

  if (brandXttsLanguage) {
    brandXttsLanguage.value = currentBrandKit.xtts?.language || "pt";
  }

  if (brandXttsModel) {
    brandXttsModel.value = currentBrandKit.xtts?.voiceModelPath || "";
  }

  if (brandXttsSpeaker) {
    brandXttsSpeaker.value = currentBrandKit.xtts?.speakerWavPath || "";
  }

  renderColorPreview(currentBrandKit.colors || []);
  renderBrandKitList(brandLogoList, currentBrandKit.logos || [], "Nenhum logo", {
    title: "Inserir logo no canvas",
    subtitle: (item) => item.path || item.resolvedPath || "",
    action: (item) => void insertBrandImage(item)
  });
  renderBrandKitList(brandFontList, currentBrandKit.fonts || [], "Nenhuma fonte", {
    title: "Aplicar fonte ao texto selecionado",
    subtitle: (item) => item.family || item.path || "",
    action: (item) => void applyFontToSelection(item)
  });
  renderBrandKitList(brandAssetList, currentBrandKit.assets?.global || [], "Nenhum asset", {
    title: "Inserir asset no canvas",
    subtitle: (item) => item.path || item.resolvedPath || "",
    action: (item) => void insertBrandImage(item)
  });

  if (brandKitStatus) {
    brandKitStatus.textContent = currentBrandKitFilePath
      ? `Arquivo: ${currentBrandKitFilePath}`
      : "Brand Kit ainda nao salvo";
  }

  renderFontOptions();
}

function collectBrandKitFromForm() {
  const base = currentBrandKit || createLocalDefaultBrandKit();
  return {
    ...base,
    schema: "kit.brand.v1",
    type: "brand-kit",
    version: 1,
    name: brandKitName?.value?.trim() || "Novo Brand Kit",
    identity: {
      ...(base.identity || {}),
      voice: brandKitVoice?.value?.trim() || ""
    },
    colors: parseColorLines(brandKitColors?.value || ""),
    logos: serializeBrandItems(base.logos),
    fonts: serializeBrandItems(base.fonts).map((font) => ({
      ...font,
      family: font.family || font.name?.replace(/\.[^.]+$/, "") || ""
    })),
    xtts: {
      ...(base.xtts || {}),
      language: brandXttsLanguage?.value?.trim() || "pt",
      voiceModelPath: brandXttsModel?.value?.trim() || "",
      speakerWavPath: brandXttsSpeaker?.value?.trim() || ""
    },
    assets: {
      ...(base.assets || {}),
      global: serializeBrandItems(base.assets?.global)
    }
  };
}

function serializeBrandItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const { resolvedPath, ...serializable } = item || {};
    return serializable;
  });
}

function collectProjectBrandOverrides() {
  const brandKit = collectBrandKitFromForm();
  const parentBrandKit = inheritedBrandKit ? normalizeBrandKitPaths(inheritedBrandKit, inheritedBrandKitFilePath) : null;
  const sameAsParent = (key, currentValue, parentValue) => {
    if (!parentBrandKit) {
      return false;
    }

    return JSON.stringify(currentValue || []) === JSON.stringify(parentValue || []);
  };

  const colors = brandKit.colors || [];
  const logos = serializeBrandItems(brandKit.logos || []);
  const fonts = serializeBrandItems(brandKit.fonts || []);
  const globalAssets = serializeBrandItems(brandKit.assets?.global || []);

  return {
    colors: sameAsParent("colors", colors, parentBrandKit?.colors) ? [] : colors,
    logos: sameAsParent("logos", logos, serializeBrandItems(parentBrandKit?.logos || [])) ? [] : logos,
    fonts: sameAsParent("fonts", fonts, serializeBrandItems(parentBrandKit?.fonts || [])) ? [] : fonts,
    assets: {
      global: sameAsParent("assets.global", globalAssets, serializeBrandItems(parentBrandKit?.assets?.global || [])) ? [] : globalAssets
    }
  };
}

function serializeFabricObjects() {
  if (!canvas) {
    return [];
  }

  ensureAllLayerMetadata();
  return canvas.getObjects()
    .filter((object) => !object.isArtboard && !object.isToolOverlay)
    .map((object) => {
      const serialized = object.toObject(FABRIC_CUSTOM_PROPS);
      const timelineItem = object.layerId
        ? timelineItems.find((item) => item.layerId === object.layerId)
        : null;
      if (timelineItem) {
        serialized.visible = timelineItem.visible !== false;
      }
      return serialized;
    });
}

function createTimelineSlide(overrides = {}) {
  const index = timelineSlides.length + 1;
  return {
    id: overrides.id || `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: overrides.name || `Slide ${index}`,
    startTime: Math.max(0, Number(overrides.startTime || 0)),
    duration: Math.max(0.5, Number(overrides.duration || 5)),
    fabric: {
      version: fabricApi?.version || "",
      objects: Array.isArray(overrides.fabric?.objects) ? overrides.fabric.objects : []
    },
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString()
  };
}

function updateSlideStartTimes() {
  let cursor = 0;
  timelineSlides.forEach((slide) => {
    slide.startTime = cursor;
    slide.duration = Math.max(0.5, Number(slide.duration || 5));
    cursor += slide.duration;
  });
  return cursor;
}

function normalizeTimelineSlides(project = {}) {
  const rawSlides = Array.isArray(project.timeline?.slides) ? project.timeline.slides : [];
  const slides = rawSlides.map((slide, index) => createTimelineSlide({
    ...slide,
    id: slide.id || `slide-${index + 1}`,
    name: slide.name || `Slide ${index + 1}`,
    duration: slide.duration || 5,
    fabric: {
      version: slide.fabric?.version || fabricApi?.version || "",
      objects: Array.isArray(slide.fabric?.objects) ? slide.fabric.objects : []
    }
  }));

  const normalizedSlides = slides.length ? slides : [
    createTimelineSlide({
      id: "slide-1",
      name: "Slide 1",
      duration: 5,
      fabric: {
        version: project.fabric?.version || fabricApi?.version || "",
        objects: Array.isArray(project.fabric?.objects) ? project.fabric.objects : []
      },
      createdAt: project.createdAt || new Date().toISOString()
    })
  ];

  let cursor = 0;
  normalizedSlides.forEach((slide) => {
    slide.startTime = cursor;
    slide.duration = Math.max(0.5, Number(slide.duration || 5));
    cursor += slide.duration;
  });
  return normalizedSlides;
}

function getActiveTimelineSlide() {
  return timelineSlides.find((slide) => slide.id === activeSlideId) || timelineSlides[0] || null;
}

function getSlideAtTime(time = 0) {
  updateSlideStartTimes();
  const value = Math.max(0, Number(time || 0));
  return [...timelineSlides].reverse().find((slide) => value >= Number(slide.startTime || 0)) || timelineSlides[0] || null;
}

function getTimelineIconSrc(iconName) {
  return `../assets/icones/timeline/${iconName}`;
}

function normalizeTimelineType(type = "image") {
  const value = String(type || "image").trim().toLowerCase();
  if (value === "imagem") return "image";
  if (value === "musica" || value === "música") return "music";
  if (value === "texto") return "text";
  if (value === "vídeo" || value === "video") return "video";
  return ["image", "video", "music", "text", "audio"].includes(value) ? value : "image";
}

function getDefaultTrackForType(type = "image") {
  return 0;
}

function normalizeTimelineTrackLabels(project = {}) {
  const rawLabels = Array.isArray(project.timeline?.layers) ? project.timeline.layers : [];
  return rawLabels.length
    ? rawLabels.map((label) => String(label || "").trim()).filter(Boolean)
    : [];
}

function getTimelineTrackLabel(track = 0) {
  const trackCount = Math.max(TIMELINE_MIN_TRACKS, timelineTrackLabels.length, timelineItems.reduce((max, item) => Math.max(max, Number(item.track || 0) + 1), 0));
  return timelineTrackLabels[track] || `Track ${Math.max(1, trackCount - track)}`;
}

function getTimelineItemEndTime(item) {
  return Math.max(0, Number(item?.startTime || 0)) + Math.max(0.1, Number(item?.duration || 0.1));
}

function timelineItemsOverlap(a, b) {
  if (!a || !b) {
    return false;
  }
  const aStart = Math.max(0, Number(a.startTime || 0));
  const bStart = Math.max(0, Number(b.startTime || 0));
  const aEnd = getTimelineItemEndTime(a);
  const bEnd = getTimelineItemEndTime(b);
  return aStart < bEnd && bStart < aEnd;
}

function getTimelineLayerRank(layerId) {
  if (!layerId) {
    return Number.NEGATIVE_INFINITY;
  }
  const objects = getTopLevelLayerObjects();
  const index = objects.findIndex((object) => object.layerId === layerId);
  return index >= 0 ? index : Number.NEGATIVE_INFINITY;
}

function compareTimelineItemsForTrackLayout(a, b) {
  const rankDiff = getTimelineLayerRank(b.layerId) - getTimelineLayerRank(a.layerId);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  const timeDiff = Number(a.startTime || 0) - Number(b.startTime || 0);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  const durationDiff = Number(b.duration || 0) - Number(a.duration || 0);
  if (durationDiff !== 0) {
    return durationDiff;
  }
  const trackDiff = Number(a.track || 0) - Number(b.track || 0);
  if (trackDiff !== 0) {
    return trackDiff;
  }
  return String(a.id || "").localeCompare(String(b.id || ""));
}

function ensureTimelineTrackCapacity(requiredTrackCount = 0) {
  const minimum = Math.max(requiredTrackCount, TIMELINE_MIN_TRACKS);
  while (timelineTrackLabels.length < minimum) {
    timelineTrackLabels.push("");
  }
}

function reflowTimelineTracks(options = {}) {
  const items = Array.isArray(options.items) ? options.items : timelineItems;
  if (!Array.isArray(items) || !items.length) {
    ensureTimelineTrackCapacity(TIMELINE_MIN_TRACKS);
    return;
  }

  const orderedItems = [...items].sort(compareTimelineItemsForTrackLayout);
  const tracks = [];

  orderedItems.forEach((item) => {
    let assignedTrack = -1;
    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
      const hasConflict = tracks[trackIndex].some((entry) => timelineItemsOverlap(entry, item));
      if (!hasConflict) {
        assignedTrack = trackIndex;
        break;
      }
    }

    if (assignedTrack < 0) {
      assignedTrack = tracks.length;
      tracks.push([]);
    }

    item.track = assignedTrack;
    tracks[assignedTrack].push(item);
  });

  ensureTimelineTrackCapacity(tracks.length);
}

function addTimelineLayer(position = "bottom") {
  const label = "";
  if (position === "top") {
    timelineTrackLabels.unshift(label);
    timelineItems.forEach((item) => {
      item.track = Number(item.track || 0) + 1;
    });
  } else {
    timelineTrackLabels.push(label);
  }
  reflowTimelineTracks();
  renderTimeline();
  markCanvasChanged("timeline-layer-add");
}

function getSlideNodeTitle(slide, index) {
  return `Slide ${index + 1} | ${Number(slide.startTime || 0).toFixed(1)}s ate ${(Number(slide.startTime || 0) + Math.max(0.5, Number(slide.duration || 5))).toFixed(1)}s`;
}

function normalizeTimelineItem(item = {}, index = 0) {
  const startTime = Math.max(0, Number(item.startTime ?? item.start ?? 0));
  const type = normalizeTimelineType(item.type || item.kind || "image");
  const slide = item.slideId
    ? timelineSlides.find((entry) => entry.id === item.slideId)
    : getSlideAtTime(startTime);
  return {
    id: item.id || `tl-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    startTime,
    duration: Math.max(0.1, Number(item.duration ?? item.length ?? 5)),
    track: Math.max(0, Number(item.track ?? getDefaultTrackForType(type))),
    source: item.source || item.filePath || item.url || item.layerId || "",
    label: item.label || item.name || makeTimelineItemLabel(type, item.source || item.filePath || item.url || ""),
    slideId: slide?.id || timelineSlides[0]?.id || null,
    visible: item.visible !== false,
    muted: Boolean(item.muted),
    volume: clampValue(Number(item.volume ?? 1), 0, 2),
    speed: Math.max(0.1, Number(item.speed ?? 1)),
    sourceStartTime: Math.max(0, Number(item.sourceStartTime ?? 0)),
    waveform: cloneWaveform(item.waveform),
    locked: Boolean(item.locked),
    layerId: item.layerId || null
  };
}

function normalizeTimelineItems(project = {}) {
  const rawItems = Array.isArray(project.timeline?.items)
    ? project.timeline.items
    : [
      ...(Array.isArray(project.timeline?.video) ? project.timeline.video : []),
      ...(Array.isArray(project.timeline?.audio) ? project.timeline.audio : [])
    ];
  const items = rawItems.map((item, index) => normalizeTimelineItem(item, index));
  const previousItems = timelineItems;
  timelineItems = items;
  reflowTimelineTracks();
  const normalized = timelineItems;
  timelineItems = previousItems;
  return normalized;
}

function makeTimelineItemLabel(type = "image", source = "") {
  const fileName = getFileName(source);
  if (fileName && fileName !== "arquivo") {
    return fileName;
  }
  const labels = {
    image: "Imagem",
    video: "Video",
    music: "Musica",
    text: "Texto",
    audio: "Audio"
  };
  return labels[normalizeTimelineType(type)] || "Midia";
}

function getTimelineDuration() {
  const slideDuration = updateSlideStartTimes();
  const itemDuration = timelineItems.reduce((max, item) => Math.max(max, item.startTime + item.duration), 0);
  return Math.max(5, slideDuration, itemDuration + 1);
}

function getTimelineCaptureMarkers() {
  updateSlideStartTimes();
  return timelineSlides.map((slide, index) => ({
    id: slide.id,
    label: slide.name || `Slide ${index + 1}`,
    time: Number(slide.startTime || 0)
  }));
}

function getNearestMarker(direction = 1) {
  const markers = getTimelineCaptureMarkers();
  if (!markers.length) {
    return null;
  }

  if (direction < 0) {
    return [...markers].reverse().find((marker) => marker.time < timelinePlayhead - 0.05) || markers[0];
  }

  return markers.find((marker) => marker.time > timelinePlayhead + 0.05) || markers[markers.length - 1];
}

function getSlideExportRanges() {
  updateSlideStartTimes();
  return timelineSlides.map((slide, index) => ({
    id: slide.id,
    index,
    name: slide.name || `Slide ${index + 1}`,
    startTime: Number(slide.startTime || 0),
    duration: Math.max(0.5, Number(slide.duration || 5)),
    endTime: Number(slide.startTime || 0) + Math.max(0.5, Number(slide.duration || 5))
  }));
}

function isProtectedTimelineSlide(slide) {
  return Boolean(slide && timelineSlides[0]?.id === slide.id);
}

function findTimelineItem(selector = {}) {
  const id = selector.itemId || selector.timelineItemId || selector.id || selectedTimelineItemId;
  if (id) {
    return timelineItems.find((item) => item.id === id) || null;
  }

  const source = selector.source || selector.filePath || selector.path || selector.layerId;
  if (source) {
    return timelineItems.find((item) => item.source === source || item.layerId === source) || null;
  }

  return null;
}

function addTimelineItem(input = {}) {
  const existing = input.layerId
    ? timelineItems.find((item) => item.layerId === input.layerId)
    : null;
  if (existing) {
    updateTimelineItem(existing, {
      label: input.label || existing.label,
      source: input.source || input.filePath || input.path || existing.source,
      visible: input.visible ?? existing.visible,
      sourceStartTime: input.sourceStartTime ?? existing.sourceStartTime,
      waveform: input.waveform ?? existing.waveform
    });
    if (existing.layerId) {
      const object = findCanvasObject({ layerId: existing.layerId });
      if (object) {
        object.timelineItemId = existing.id;
      }
    }
    return existing;
  }

  const activeSlide = getActiveTimelineSlide() || timelineSlides[0] || createTimelineSlide({ id: "slide-1" });
  if (!timelineSlides.length) {
    timelineSlides.push(activeSlide);
    activeSlideId = activeSlide.id;
  }
  updateSlideStartTimes();
  const item = normalizeTimelineItem({
    type: input.type || "image",
    startTime: input.startTime ?? activeSlide.startTime ?? 0,
    duration: input.duration ?? 5,
    track: input.track,
    source: input.source || input.filePath || input.path || input.layerId || "",
    label: input.label || input.name,
    slideId: input.slideId || activeSlide.id,
    visible: input.visible,
    muted: input.muted,
    volume: input.volume,
    speed: input.speed,
    sourceStartTime: input.sourceStartTime,
    waveform: input.waveform,
    locked: input.locked,
    layerId: input.layerId || null
  }, timelineItems.length);
  item.slideId = getSlideAtTime(item.startTime)?.id || item.slideId;
  timelineItems.push(item);
  if (item.layerId) {
    const object = findCanvasObject({ layerId: item.layerId });
    if (object) {
      object.timelineItemId = item.id;
    }
  }
  selectedTimelineItemId = item.id;
  reflowTimelineTracks();
  renderTimeline();
  markCanvasChanged("timeline-item-add");
  return item;
}

function inferTimelineTypeFromObject(object) {
  if (isTextObject(object)) return "text";
  if (isVideoLayer(object)) return "video";
  if (object?.type === "image") return "image";
  return "image";
}

function ensureTimelineItemForCanvasObject(object) {
  if (!object || object.isArtboard || object.isMaskPath || isMaskLayerObject(object)) {
    return null;
  }

  ensureLayerMetadata(object, getLayerObjects().length - 1);
  return addTimelineItem({
    type: inferTimelineTypeFromObject(object),
    layerId: object.layerId,
    source: object.layerId,
    label: makeObjectName(object),
    visible: object.visible !== false,
    duration: 5
  });
}

function syncTimelineWithCanvasObjects() {
  if (!canvas) {
    return;
  }

  getLayerObjects()
    .filter((object) => !object.isMaskPath && !isMaskLayerObject(object))
    .forEach((object) => ensureTimelineItemForCanvasObject(object));
  hydrateVideoLayers();
  cleanupUnusedMediaElements();
  reflowTimelineTracks();
  renderTimeline();
}

function syncLayerOrderWithTimeline() {
  reflowTimelineTracks();
  renderTimeline();
}

function selectTimelineItemForCanvasObject(object) {
  if (!object?.layerId) {
    return;
  }
  const item = timelineItems.find((entry) => entry.layerId === object.layerId);
  if (item && selectedTimelineItemId !== item.id) {
    selectedTimelineItemId = item.id;
    renderTimeline();
  }
}

function updateTimelineItem(item, patch = {}) {
  if (!item || item.locked) {
    return item;
  }
  if (patch.startTime !== undefined) {
    item.startTime = Math.max(0, Number(patch.startTime || 0));
    item.slideId = getSlideAtTime(item.startTime)?.id || item.slideId;
  }
  if (patch.duration !== undefined) {
    item.duration = Math.max(0.1, Number(patch.duration || 0.1));
  }
  if (patch.track !== undefined) {
    item.track = Math.max(0, Number(patch.track || 0));
  }
  if (patch.visible !== undefined) item.visible = Boolean(patch.visible);
  if (patch.muted !== undefined) item.muted = Boolean(patch.muted);
  if (patch.volume !== undefined) item.volume = clampValue(Number(patch.volume), 0, 2);
  if (patch.speed !== undefined) item.speed = Math.max(0.1, Number(patch.speed));
  if (patch.sourceStartTime !== undefined) item.sourceStartTime = Math.max(0, Number(patch.sourceStartTime || 0));
  if (patch.waveform !== undefined) item.waveform = cloneWaveform(patch.waveform);
  if (patch.label !== undefined) item.label = String(patch.label || item.label);
  if (patch.source !== undefined) item.source = String(patch.source || "");
  if (patch.locked !== undefined) item.locked = Boolean(patch.locked);
  if (patch.visible !== undefined && item.layerId) {
    const object = findCanvasObject({ layerId: item.layerId });
    if (object) {
      object.set("visible", item.visible);
      canvas?.requestRenderAll();
      updateLayers();
    }
  }
  if (patch.startTime !== undefined || patch.duration !== undefined || patch.track !== undefined) {
    reflowTimelineTracks();
  }
  renderTimeline();
  markCanvasChanged("timeline-item-update");
  return item;
}

function isTimelineItemActiveAt(item, time = timelinePlayhead) {
  const value = Number(time || 0);
  return item.visible !== false && value >= item.startTime && value < item.startTime + item.duration;
}

function applyTimelineVisibilityAtTime(time = timelinePlayhead) {
  if (!canvas || !timelineItems.length) {
    return;
  }

  getLayerObjects().forEach((object) => {
    if (object.isMaskPath) {
      return;
    }
    const item = object.layerId
      ? timelineItems.find((entry) => entry.layerId === object.layerId)
      : null;
    if (!item) {
      object.set("visible", true);
      return;
    }
    object.set("visible", isTimelineItemActiveAt(item, time));
  });
  syncTimelineMediaAtTime(time, { shouldPlay: timelineIsPlaying });
  canvas.requestRenderAll();
  updateLayers();
}

function cutTimelineItem(item = findTimelineItem()) {
  if (!item || item.locked) {
    return null;
  }
  const localCut = timelinePlayhead > item.startTime && timelinePlayhead < item.startTime + item.duration
    ? timelinePlayhead - item.startTime
    : item.duration / 2;
  if (localCut <= 0.1 || item.duration - localCut <= 0.1) {
    return null;
  }
  const next = normalizeTimelineItem({
    ...item,
    id: null,
    startTime: item.startTime + localCut,
    duration: item.duration - localCut,
    sourceStartTime: Math.max(0, Number(item.sourceStartTime || 0) + localCut),
    label: `${item.label} B`
  }, timelineItems.length);
  item.duration = localCut;
  timelineItems.push(next);
  selectedTimelineItemId = next.id;
  reflowTimelineTracks();
  renderTimeline();
  markCanvasChanged("timeline-item-cut");
  return next;
}

async function duplicateTimelineItem(item = findTimelineItem()) {
  if (!item || !canvas) {
    return null;
  }

  const sourceObject = item.layerId ? findCanvasObject({ layerId: item.layerId }) : null;
  if (!sourceObject) {
    return null;
  }

  const cloned = await cloneFabricObject(sourceObject);
  if (!cloned) {
    return null;
  }

  cloned.set({
    left: Number(cloned.left || 0) + 24,
    top: Number(cloned.top || 0) + 24,
    visible: true
  });
  cloned.layerId = createLayerId();
  cloned.layerName = `${makeObjectName(sourceObject)} copia`;
  canvas.add(cloned);
  cloned.setCoords();
  canvas.setActiveObject(cloned);

  const sourceMask = getMaskLayerForObject(sourceObject);
  if (sourceMask) {
    const clonedMask = await cloneFabricObject(sourceMask);
    if (clonedMask) {
      clonedMask.layerId = createLayerId();
      clonedMask.parentLayerId = cloned.layerId;
      clonedMask.affectedLayerId = cloned.layerId;
      clonedMask.visible = false;
      cloned.maskLayerId = clonedMask.layerId;
      cloned.rasterMaskSrc = clonedMask.rasterSourceSrc || null;
      canvas.add(clonedMask);
      syncMaskObjectTransform(clonedMask, cloned);
      await refreshLayerMaskComposite(cloned);
    }
  }

  const duplicated = addTimelineItem({
    ...item,
    id: null,
    layerId: cloned.layerId,
    source: cloned.layerId,
    label: cloned.layerName,
    startTime: item.startTime + 0.25,
    track: item.track
  });
  selectedTimelineItemId = duplicated.id;
  canvas.requestRenderAll();
  updateLayers();
  renderTimeline();
  markCanvasChanged("timeline-item-duplicate");
  return duplicated;
}

function removeTimelineItem(item = findTimelineItem()) {
  if (!item) {
    return false;
  }

  const object = item.layerId ? findCanvasObject({ layerId: item.layerId }) : null;
  cleanupMediaForItemOrObject(item);
  timelineItems = timelineItems.filter((entry) => entry !== item);
  if (selectedTimelineItemId === item.id) {
    selectedTimelineItemId = null;
  }
  if (object && canvas) {
    canvas.remove(object);
  }
  updateLayers();
  reflowTimelineTracks();
  renderTimeline();
  markCanvasChanged("timeline-item-remove");
  return true;
}

function removeTimelineItemsBySlide(slideId) {
  const removedItems = timelineItems.filter((item) => item.slideId === slideId);
  timelineItems = timelineItems.filter((item) => item.slideId !== slideId);
  removedItems.forEach((item) => {
    cleanupMediaForItemOrObject(item);
    const object = item.layerId ? findCanvasObject({ layerId: item.layerId }) : null;
    if (object && canvas) {
      canvas.remove(object);
    }
  });
  if (!timelineItems.some((item) => item.id === selectedTimelineItemId)) {
    selectedTimelineItemId = null;
  }
  reflowTimelineTracks();
}

function createTimelineIcon(iconName, alt = "") {
  const icon = document.createElement("img");
  icon.className = "timeline-icon";
  icon.src = getTimelineIconSrc(iconName);
  icon.alt = alt;
  return icon;
}

function createTimelineWaveformElement(item, width = 0, height = TIMELINE_TRACK_HEIGHT) {
  if (!item?.waveform?.peaks?.length || !["audio", "music", "video"].includes(item.type)) {
    return null;
  }

  const waveform = document.createElement("div");
  waveform.className = "timeline-waveform";
  const peaks = item.waveform.peaks;
  const clipDuration = Math.max(0.1, Number(item.duration || 0.1));
  const sourceStartTime = Math.max(0, Number(item.sourceStartTime || 0));
  const waveformDuration = Math.max(clipDuration, Number(item.waveform.duration || clipDuration));
  const visibleBars = Math.max(8, Math.floor(Math.max(12, width - 8) / 3));
  const maxBarHeight = Math.max(8, Math.floor(height * 0.72));
  const startRatio = Math.min(1, sourceStartTime / waveformDuration);
  const endRatio = Math.min(1, (sourceStartTime + clipDuration) / waveformDuration);
  const visibleStartIndex = Math.max(0, Math.floor(startRatio * peaks.length));
  const visibleEndIndex = Math.max(visibleStartIndex + 1, Math.min(peaks.length, Math.ceil(endRatio * peaks.length)));
  const visiblePeakCount = Math.max(1, visibleEndIndex - visibleStartIndex);
  const step = visiblePeakCount / visibleBars;

  for (let index = 0; index < visibleBars; index += 1) {
    const peakIndex = Math.min(peaks.length - 1, visibleStartIndex + Math.floor(index * step));
    const peak = peaks[peakIndex];
    if (!peak) {
      continue;
    }
    const value = Math.max(Math.abs(Number(peak.min || 0)), Math.abs(Number(peak.max || 0)));
    const bar = document.createElement("span");
    bar.className = "timeline-waveform-bar";
    bar.style.height = `${Math.max(2, Math.round(value * maxBarHeight))}px`;
    if (value >= 0.8) {
      bar.classList.add("is-peak");
    }
    waveform.appendChild(bar);
  }

  return waveform;
}

function createTimelineIconButton(iconName, title, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "timeline-icon-button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.appendChild(createTimelineIcon(iconName, ""));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    action();
  });
  return button;
}

function saveActiveSlideSnapshot() {
  const slide = getActiveTimelineSlide();
  if (!slide || !canvas) {
    return;
  }

  slide.fabric = {
    version: fabricApi?.version || "",
    objects: serializeFabricObjects()
  };
  slide.updatedAt = new Date().toISOString();
}

function collectTimelineState() {
  saveActiveSlideSnapshot();
  updateSlideStartTimes();
  return {
    slides: timelineSlides.map((slide, index) => ({
      ...slide,
      name: slide.name || `Slide ${index + 1}`,
      startTime: Number(slide.startTime || 0),
      duration: Math.max(0.5, Number(slide.duration || 5)),
      fabric: {
        version: slide.fabric?.version || fabricApi?.version || "",
        objects: Array.isArray(slide.fabric?.objects) ? slide.fabric.objects : []
      }
    })),
    items: timelineItems.map((item) => ({ ...item })),
    layers: timelineTrackLabels.slice(),
    audio: timelineItems.filter((item) => item.type === "audio" || item.type === "music").map((item) => ({ ...item })),
    video: timelineItems.filter((item) => item.type === "video").map((item) => ({ ...item })),
    activeSlideId: activeSlideId || timelineSlides[0]?.id || null
  };
}

function collectProjectFromCanvas(options = {}) {
  const base = currentProject || createLocalDefaultProject();
  const timeline = collectTimelineState();
  const shouldAppendHistory = options.appendHistory !== false;
  const history = shouldAppendHistory
    ? [
      ...(Array.isArray(base.history) ? base.history : []),
      {
        action: options.historyAction || "snapshot",
        at: new Date().toISOString()
      }
    ].slice(-50)
    : (Array.isArray(base.history) ? base.history : []);

  return {
    ...base,
    schema: "kit.project.v1",
    type: "canvas-project",
    version: 1,
    name: projectNameInput?.value?.trim() || "Novo Projeto Canvas",
    brandKitPath: currentBrandKitFilePath || base.brandKitPath || null,
    brandKitOverrides: collectProjectBrandOverrides(),
    artboard: {
      width: artboardWidth,
      height: artboardHeight,
      preset: currentArtboardPreset || "custom"
    },
    fabric: {
      version: fabricApi?.version || "",
      objects: serializeFabricObjects()
    },
    timeline,
    metadata: {
      ...(base.metadata || {}),
      updatedFromCanvasAt: new Date().toISOString()
    },
    history
  };
}

function renderProject(project = createLocalDefaultProject(), filePath = currentProjectFilePath) {
  currentProject = project;
  currentProjectFilePath = filePath || null;

  if (projectNameInput) {
    projectNameInput.value = project.name || "Novo Projeto Canvas";
  }

  updateProjectStatus();
}

function renderTimeline() {
  if (!timelineTrack) {
    return;
  }

  updateSlideStartTimes();
  timelineTrack.innerHTML = "";
  const activeMarker = getSlideAtTime(timelinePlayhead);
  if (activeMarker?.id) {
    activeSlideId = activeMarker.id;
  }
  const activeId = activeSlideId || timelineSlides[0]?.id || null;
  applyTimelineVisibilityAtTime(timelinePlayhead);
  const duration = getTimelineDuration();
  const width = TIMELINE_LABEL_WIDTH + Math.ceil(duration * TIMELINE_PIXELS_PER_SECOND) + 80;
  ensureTimelineTrackCapacity(TIMELINE_MIN_TRACKS);
  const trackCount = Math.max(
    timelineTrackLabels.length || TIMELINE_MIN_TRACKS,
    timelineItems.reduce((max, item) => Math.max(max, Number(item.track || 0) + 1), 0)
  );

  const editor = document.createElement("div");
  editor.className = "timeline-editor";
  editor.style.width = `${width}px`;

  const ruler = document.createElement("div");
  ruler.className = "timeline-ruler";
  const rulerLabel = document.createElement("div");
  rulerLabel.className = "timeline-ruler-label";
  rulerLabel.textContent = "time";
  ruler.appendChild(rulerLabel);
  for (let second = 0; second <= Math.ceil(duration); second += 1) {
    const tick = document.createElement("div");
    tick.className = "timeline-tick";
    tick.style.left = `${TIMELINE_LABEL_WIDTH + second * TIMELINE_PIXELS_PER_SECOND}px`;
    if (second % 5 === 0) {
      const label = document.createElement("span");
      label.textContent = `${second}s`;
      tick.appendChild(label);
    }
    ruler.appendChild(tick);
  }
  ruler.addEventListener("click", (event) => {
    pauseTimelinePlayback({ keepPlayhead: true });
    const bounds = ruler.getBoundingClientRect();
    timelinePlayhead = Math.max(0, (event.clientX - bounds.left - TIMELINE_LABEL_WIDTH) / TIMELINE_PIXELS_PER_SECOND);
    syncTimelineMediaAtTime(timelinePlayhead, { shouldPlay: false });
    renderTimeline();
  });

  const slidesRow = document.createElement("div");
  slidesRow.className = "timeline-slides";
  timelineSlides.forEach((slide, index) => {
    const slideNode = document.createElement("div");
    slideNode.className = "timeline-slide";
    slideNode.classList.toggle("is-current", slide.id === activeId);
    slideNode.style.left = `${TIMELINE_LABEL_WIDTH + slide.startTime * TIMELINE_PIXELS_PER_SECOND}px`;
    slideNode.style.width = `${Math.max(44, slide.duration * TIMELINE_PIXELS_PER_SECOND - 4)}px`;
    slideNode.title = getSlideNodeTitle(slide, index);
    const name = document.createElement("span");
    name.textContent = slide.name || `Slide ${index + 1}`;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0.5";
    input.step = "0.5";
    input.value = String(Math.max(0.5, Number(slide.duration || 5)));
    input.title = "Distancia ate o proximo marcador";
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", (event) => {
      event.stopPropagation();
      slide.duration = Math.max(0.5, Number(input.value || 5));
      updateSlideStartTimes();
      timelineItems.forEach((item) => {
        item.slideId = getSlideAtTime(item.startTime)?.id || item.slideId;
      });
      markCanvasChanged("timeline-slide-duration");
      renderTimeline();
    });
    slideNode.addEventListener("click", () => {
      void switchTimelineSlide(slide.id);
    });
    slideNode.appendChild(name);
    slideNode.appendChild(input);
    slidesRow.appendChild(slideNode);
  });

  const lanes = document.createElement("div");
  lanes.className = "timeline-lanes";
  lanes.style.height = `${trackCount * TIMELINE_TRACK_HEIGHT + 8}px`;
  timelineSlides.forEach((slide) => {
    const marker = document.createElement("div");
    marker.className = "timeline-slide-marker";
    marker.classList.toggle("is-current", slide.id === activeId);
    marker.style.left = `${TIMELINE_LABEL_WIDTH + slide.startTime * TIMELINE_PIXELS_PER_SECOND}px`;
    lanes.appendChild(marker);
  });
  for (let track = 0; track < trackCount; track += 1) {
    const lane = document.createElement("div");
    lane.className = "timeline-lane";
    lane.dataset.track = String(track);
    lane.style.height = `${TIMELINE_TRACK_HEIGHT}px`;
    const laneLabel = document.createElement("div");
    laneLabel.className = "timeline-lane-label";
    laneLabel.textContent = getTimelineTrackLabel(track);
    lane.appendChild(laneLabel);
    lanes.appendChild(lane);
  }

  timelineItems.forEach((item) => {
    const lane = lanes.querySelector(`[data-track="${item.track}"]`) || lanes.lastElementChild;
    if (!lane) {
      return;
    }
    const itemWidth = Math.max(28, item.duration * TIMELINE_PIXELS_PER_SECOND);
    const block = document.createElement("div");
    block.className = `timeline-item is-${item.type}`;
    block.classList.toggle("is-selected", item.id === selectedTimelineItemId);
    block.classList.toggle("is-hidden", item.visible === false);
    block.style.left = `${TIMELINE_LABEL_WIDTH + item.startTime * TIMELINE_PIXELS_PER_SECOND}px`;
    block.style.width = `${itemWidth}px`;
    block.dataset.itemId = item.id;
    block.title = `${item.label} | ${item.startTime.toFixed(1)}s - ${(item.startTime + item.duration).toFixed(1)}s`;
    const waveform = createTimelineWaveformElement(item, itemWidth, 24);
    if (waveform) {
      block.appendChild(waveform);
    }
    block.appendChild(createTimelineIcon(TIMELINE_TYPE_ICONS[item.type] || "foto.svg", item.type));
    const label = document.createElement("span");
    label.className = "timeline-item-label";
    label.textContent = item.label;
    block.appendChild(label);
    block.appendChild(createTimelineIconButton(item.visible === false ? "olhos-cruzados.svg" : "olho.svg", item.visible === false ? "Exibir" : "Ocultar", () => {
      updateTimelineItem(item, { visible: item.visible === false });
    }));
    if (item.type === "audio" || item.type === "music") {
      block.appendChild(createTimelineIconButton("volume.svg", "Volume", () => {
        const value = window.prompt("Volume (0 a 2)", String(item.volume ?? 1));
        if (value !== null) {
          updateTimelineItem(item, { volume: Number(value) });
        }
      }));
      block.appendChild(createTimelineIconButton(item.muted ? "volume.svg" : "silenciar-volume.svg", item.muted ? "Ativar som" : "Mutar", () => {
        updateTimelineItem(item, { muted: !item.muted });
      }));
    }
    ["start", "end"].forEach((side) => {
      const handle = document.createElement("span");
      handle.className = `timeline-resize ${side}`;
      handle.addEventListener("pointerdown", (event) => startTimelineResize(event, item, side));
      block.appendChild(handle);
    });
    block.addEventListener("pointerdown", (event) => startTimelineDrag(event, item));
    block.addEventListener("click", (event) => {
      event.stopPropagation();
      pauseTimelinePlayback({ keepPlayhead: true });
      selectedTimelineItemId = item.id;
      timelinePlayhead = item.startTime;
      const object = item.layerId ? findCanvasObject({ layerId: item.layerId }) : null;
      if (object) {
        selectLayerObject(object);
      }
      syncTimelineMediaAtTime(timelinePlayhead, { shouldPlay: false });
      renderTimeline();
    });
    lane.appendChild(block);
  });

  const playhead = document.createElement("div");
  playhead.className = "timeline-playhead";
  playhead.style.left = `${TIMELINE_LABEL_WIDTH + timelinePlayhead * TIMELINE_PIXELS_PER_SECOND}px`;

  editor.appendChild(ruler);
  editor.appendChild(slidesRow);
  editor.appendChild(lanes);
  editor.appendChild(playhead);
  timelineTrack.appendChild(editor);

  if (timelineStatus) {
    timelineStatus.textContent = `${timelineSlides.length} slide(s) | ${timelineItems.length} item(ns) | ${duration.toFixed(1)}s`;
  }

  const removeSlideButton = document.querySelector('[data-timeline-action="remove-slide"]');
  const activeSlide = getActiveTimelineSlide();
  removeSlideButton?.toggleAttribute("disabled", timelineSlides.length <= 1 || isProtectedTimelineSlide(activeSlide));
}

function startTimelineDrag(event, item) {
  if (!item || item.locked || event.target?.classList?.contains("timeline-resize") || event.target?.closest?.(".timeline-icon-button")) {
    return;
  }

  event.preventDefault();
  selectedTimelineItemId = item.id;
  pauseTimelinePlayback({ keepPlayhead: true });
  const startX = event.clientX;
  const startTime = item.startTime;
  const startTrack = item.track;
  const lanesElement = timelineTrack?.querySelector(".timeline-lanes");
  const laneBounds = lanesElement?.getBoundingClientRect();
  let createdTopLayer = false;
  let createdBottomLayer = false;

  const onMove = (moveEvent) => {
    const deltaSeconds = (moveEvent.clientX - startX) / TIMELINE_PIXELS_PER_SECOND;
    const patch = {
      startTime: Math.max(0, startTime + deltaSeconds)
    };
    if (laneBounds) {
      const laneOffsetY = moveEvent.clientY - laneBounds.top - 6;
      const renderedTrackCount = Math.max(TIMELINE_MIN_TRACKS, lanesElement?.querySelectorAll(".timeline-lane").length || 0, timelineTrackLabels.length);
      const rawTrack = Math.floor(laneOffsetY / TIMELINE_TRACK_HEIGHT);
      if (rawTrack < 0 && !createdTopLayer) {
        timelineTrackLabels.unshift("");
        timelineItems.forEach((entry) => {
          if (entry !== item) {
            entry.track = Number(entry.track || 0) + 1;
          }
        });
        createdTopLayer = true;
        patch.track = 0;
      } else if (rawTrack >= renderedTrackCount && !createdBottomLayer) {
        timelineTrackLabels.push("");
        createdBottomLayer = true;
        patch.track = timelineTrackLabels.length - 1;
      } else {
        patch.track = clampValue(rawTrack, 0, Math.max(0, timelineTrackLabels.length - 1));
      }
    } else {
      patch.track = startTrack;
    }
    updateTimelineItem(item, patch);
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp, { once: true });
}

function startTimelineResize(event, item, side = "end") {
  if (!item || item.locked) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  selectedTimelineItemId = item.id;
  pauseTimelinePlayback({ keepPlayhead: true });
  const startX = event.clientX;
  const startTime = item.startTime;
  const startDuration = item.duration;
  const startSourceStartTime = Number(item.sourceStartTime || 0);
  const onMove = (moveEvent) => {
    const deltaSeconds = (moveEvent.clientX - startX) / TIMELINE_PIXELS_PER_SECOND;
    if (side === "start") {
      const nextStart = Math.max(0, startTime + deltaSeconds);
      const nextEnd = startTime + startDuration;
      const clampedStart = Math.min(nextStart, nextEnd - 0.1);
      updateTimelineItem(item, {
        startTime: clampedStart,
        sourceStartTime: Math.max(0, startSourceStartTime + (clampedStart - startTime)),
        duration: Math.max(0.1, nextEnd - clampedStart)
      });
      return;
    }
    updateTimelineItem(item, {
      duration: Math.max(0.1, startDuration + deltaSeconds)
    });
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp, { once: true });
}

function pauseTimelinePlayback({ keepPlayhead = true } = {}) {
  if (timelinePlaybackFrame) {
    cancelAnimationFrame(timelinePlaybackFrame);
    timelinePlaybackFrame = null;
  }
  timelineIsPlaying = false;
  timelinePlaybackLastTime = 0;
  pauseAllTimelineMedia();
  if (!keepPlayhead) {
    timelinePlayhead = Math.max(0, Number(timelinePlayhead || 0));
  }
  syncTimelineMediaAtTime(timelinePlayhead, { shouldPlay: false });
  renderTimeline();
}

function stopTimelinePlayback({ reset = false } = {}) {
  pauseTimelinePlayback({ keepPlayhead: !reset });
  if (reset) {
    timelinePlayhead = 0;
    resetAllTimelineMediaTimes(0);
    syncTimelineMediaAtTime(0, { shouldPlay: false });
    renderTimeline();
  }
}

function playTimeline() {
  if (timelinePlaybackFrame || timelineIsPlaying) {
    return;
  }

  timelineIsPlaying = true;
  syncTimelineMediaAtTime(timelinePlayhead, { shouldPlay: true });
  timelinePlaybackLastTime = performance.now();
  const tick = (now) => {
    if (!timelineIsPlaying) {
      return;
    }
    const delta = Math.max(0, (now - timelinePlaybackLastTime) / 1000);
    timelinePlaybackLastTime = now;
    timelinePlayhead = Math.min(getTimelineDuration(), timelinePlayhead + delta);
    if (timelinePlayhead >= getTimelineDuration()) {
      stopTimelinePlayback({ reset: false });
      return;
    }
    syncTimelineMediaAtTime(timelinePlayhead, { shouldPlay: true });
    renderTimeline();
    timelinePlaybackFrame = requestAnimationFrame(tick);
  };
  timelinePlaybackFrame = requestAnimationFrame(tick);
}

function seekTimelineMarker(direction = 1) {
  const marker = getNearestMarker(direction);
  if (!marker) {
    return;
  }
  pauseTimelinePlayback({ keepPlayhead: true });
  timelinePlayhead = marker.time;
  activeSlideId = marker.id;
  syncTimelineMediaAtTime(timelinePlayhead, { shouldPlay: false });
  renderTimeline();
}

function initResizablePanels() {
  timelineResizeHandle?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    timelineResizeHandle.classList.add("is-dragging");
    const startY = event.clientY;
    const startHeight = Number.parseFloat(getComputedStyle(document.body).getPropertyValue("--timeline-height")) || 218;
    const onMove = (moveEvent) => {
      const nextHeight = clampValue(startHeight - (moveEvent.clientY - startY), 126, Math.min(420, window.innerHeight - 180));
      document.body.style.setProperty("--timeline-height", `${Math.round(nextHeight)}px`);
      resizeCanvasViewport({ keepCamera: true });
    };
    const onUp = () => {
      timelineResizeHandle.classList.remove("is-dragging");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  });

  sidePanelResizeHandle?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    sidePanelResizeHandle.classList.add("is-dragging");
    const startX = event.clientX;
    const startWidth = Number.parseFloat(getComputedStyle(document.body).getPropertyValue("--right-panel-width")) || 300;
    const onMove = (moveEvent) => {
      const nextWidth = clampValue(startWidth - (moveEvent.clientX - startX), 220, Math.min(520, window.innerWidth - 420));
      document.body.style.setProperty("--right-panel-width", `${Math.round(nextWidth)}px`);
      resizeCanvasViewport({ keepCamera: true });
    };
    const onUp = () => {
      sidePanelResizeHandle.classList.remove("is-dragging");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  });
}

function renderProjectBrandKit(project = currentProject, inherited = null) {
  const loadedBrandKit = inherited?.brandKit || null;
  const loadedFilePath = inherited?.filePath || null;
  inheritedBrandKit = loadedBrandKit;
  inheritedBrandKitFilePath = loadedFilePath;

  if (loadedBrandKit) {
    const mergedBrandKit = mergeBrandKitWithOverrides(loadedBrandKit, project?.brandKitOverrides || {});
    renderBrandKit(mergedBrandKit, loadedFilePath);
    return;
  }

  if (project?.brandKitOverrides && (
    hasItems(project.brandKitOverrides.colors) ||
    hasItems(project.brandKitOverrides.logos) ||
    hasItems(project.brandKitOverrides.fonts) ||
    hasItems(project.brandKitOverrides.assets?.global)
  )) {
    renderBrandKit(mergeBrandKitWithOverrides(createLocalDefaultBrandKit(), project.brandKitOverrides), null);
    if (project?.brandKitPath && inherited?.missing && brandKitStatus) {
      brandKitStatus.textContent = inherited.error || `Brand Kit pai nao encontrado: ${inherited.filePath}`;
    }
    return;
  }

  renderBrandKit(createLocalDefaultBrandKit(), null);
  if (project?.brandKitPath && inherited?.missing && brandKitStatus) {
    brandKitStatus.textContent = inherited.error || `Brand Kit pai nao encontrado: ${inherited.filePath}`;
  }
}

async function loadFabricObjects(objects = []) {
  if (!canvas) {
    return;
  }

  isLoadingFabricObjects = true;
  try {
    canvas.discardActiveObject();
    canvas.clear();
    canvas.backgroundColor = "transparent";

    const payload = {
      version: fabricApi?.version || "",
      objects: Array.isArray(objects) ? objects : []
    };
    const loadResult = canvas.loadFromJSON(payload);
    if (loadResult?.then) {
      await loadResult;
    }

    addArtboardObject();
    ensureAllLayerMetadata();
    refreshAllMaskComposites();
    hydrateVideoLayers();
  } finally {
    isLoadingFabricObjects = false;
  }
  syncTimelineWithCanvasObjects();
  canvas.requestRenderAll();
  updateSelectionInfo();
}

async function loadTimelineSlide(slide) {
  if (!slide) {
    return;
  }

  activeSlideId = slide.id;
  timelinePlayhead = Number(slide.startTime || 0);
  syncTimelineMediaAtTime(timelinePlayhead, { shouldPlay: false });
  renderTimeline();
}

async function switchTimelineSlide(slideId) {
  if (!slideId || slideId === activeSlideId) {
    return;
  }

  const nextSlide = timelineSlides.find((slide) => slide.id === slideId);
  if (!nextSlide) {
    return;
  }

  saveActiveSlideSnapshot();
  await loadTimelineSlide(nextSlide);
  markCanvasChanged("timeline-switch");
}

async function addTimelineSlide() {
  saveActiveSlideSnapshot();
  updateSlideStartTimes();
  const slide = createTimelineSlide({
    name: `Slide ${timelineSlides.length + 1}`,
    duration: getActiveTimelineSlide()?.duration || 5
  });
  timelineSlides.push(slide);
  updateSlideStartTimes();
  await loadTimelineSlide(slide);
  markCanvasChanged("timeline-add");
}

async function duplicateTimelineSlide() {
  const activeSlide = getActiveTimelineSlide();
  if (!activeSlide) {
    return;
  }

  saveActiveSlideSnapshot();
  const activeIndex = timelineSlides.findIndex((slide) => slide.id === activeSlide.id);
  const slide = createTimelineSlide({
    name: `${activeSlide.name || `Slide ${activeIndex + 1}`} copia`,
    duration: activeSlide.duration || 5,
    fabric: {
      version: activeSlide.fabric?.version || fabricApi?.version || "",
      objects: JSON.parse(JSON.stringify(activeSlide.fabric?.objects || []))
    }
  });
  timelineSlides.splice(activeIndex + 1, 0, slide);
  updateSlideStartTimes();
  await loadTimelineSlide(slide);
  markCanvasChanged("timeline-duplicate");
}

async function removeTimelineSlide() {
  if (timelineSlides.length <= 1) {
    return false;
  }

  const activeIndex = Math.max(0, timelineSlides.findIndex((slide) => slide.id === activeSlideId));
  if (activeIndex <= 0) {
    return false;
  }
  const [removedSlide] = timelineSlides.splice(activeIndex, 1);
  if (removedSlide?.id) {
    removeTimelineItemsBySlide(removedSlide.id);
  }
  updateSlideStartTimes();
  const nextSlide = timelineSlides[Math.min(activeIndex, timelineSlides.length - 1)];
  await loadTimelineSlide(nextSlide);
  markCanvasChanged("timeline-remove");
  return true;
}

function reorderTimelineSlide(draggedId, targetId, dropAfterTarget = false) {
  if (!draggedId || !targetId || draggedId === targetId) {
    return;
  }

  const draggedIndex = timelineSlides.findIndex((slide) => slide.id === draggedId);
  const targetIndex = timelineSlides.findIndex((slide) => slide.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) {
    return;
  }

  const [dragged] = timelineSlides.splice(draggedIndex, 1);
  const nextTargetIndex = timelineSlides.findIndex((slide) => slide.id === targetId);
  timelineSlides.splice(nextTargetIndex + (dropAfterTarget ? 1 : 0), 0, dragged);
  updateSlideStartTimes();
  timelineItems.forEach((item) => {
    item.slideId = getSlideAtTime(item.startTime)?.id || item.slideId;
  });
  renderTimeline();
  markCanvasChanged("timeline-reorder");
}

async function handleTimelineCommand(payload = {}) {
  const command = String(payload.command || payload.timelineAction || payload.action || "").trim();
  if (command === "add" || command === "create" || command === "add-item" || command === "insert-item" || command === "add-media") {
    if (!payload.layerId && !payload.source && !payload.filePath && !payload.path && !payload.url) {
      return makeCanvasCommandResult(false, "Timeline nao cria item vazio. Insira uma midia real ou um objeto no canvas.");
    }
    const item = addTimelineItem(payload);
    return makeCanvasCommandResult(true, "Item inserido na timeline.", { item });
  }

  if (command === "new-slide" || command === "add-slide") {
    await addTimelineSlide();
    return makeCanvasCommandResult(true, "Slide criado.", { activeSlideId });
  }

  if (command === "duplicate-slide") {
    await duplicateTimelineSlide();
    return makeCanvasCommandResult(true, "Slide duplicado.", { activeSlideId });
  }

  if (command === "remove" || command === "delete") {
    if (payload.itemId || payload.timelineItemId || selectedTimelineItemId) {
      const item = findTimelineItem(payload);
      const removed = removeTimelineItem(item);
      return makeCanvasCommandResult(removed, removed ? "Item removido da timeline, canvas e layers." : "Item nao encontrado.");
    }
    const removedSlide = await removeTimelineSlide();
    return makeCanvasCommandResult(removedSlide, removedSlide ? "Slide removido com seus itens filhos." : "O primeiro slide nao pode ser removido.", { activeSlideId });
  }

  if (command === "select" || command === "go-to") {
    const index = Number(payload.index ?? payload.slideIndex);
    const slideId = payload.slideId || payload.id || (Number.isInteger(index) ? timelineSlides[Math.max(0, index - 1)]?.id : null);
    await switchTimelineSlide(slideId);
    return makeCanvasCommandResult(Boolean(slideId), slideId ? "Slide selecionado." : "Slide nao encontrado.", { activeSlideId });
  }

  if (command === "duration") {
    const item = findTimelineItem(payload);
    if (item) {
      updateTimelineItem(item, { duration: payload.duration || payload.seconds });
      return makeCanvasCommandResult(true, "Duracao do item atualizada.", { item });
    }
    const slide = getActiveTimelineSlide();
    if (!slide) {
      return makeCanvasCommandResult(false, "Nenhum slide ativo.");
    }
    slide.duration = Math.max(0.5, Number(payload.duration || payload.seconds || slide.duration || 5));
    renderTimeline();
    markCanvasChanged("timeline-duration");
    return makeCanvasCommandResult(true, "Duracao do slide atualizada.", {
      activeSlideId,
      duration: slide.duration
    });
  }

  if (command === "move" || command === "move-item") {
    const item = findTimelineItem(payload);
    if (!item) {
      return makeCanvasCommandResult(false, "Item da timeline nao encontrado.");
    }
    updateTimelineItem(item, {
      startTime: payload.startTime ?? payload.time ?? item.startTime,
      track: payload.track ?? item.track
    });
    return makeCanvasCommandResult(true, "Item movido na timeline.", { item });
  }

  if (command === "cut" || command === "cut-item") {
    const item = findTimelineItem(payload);
    if (payload.time !== undefined || payload.playhead !== undefined) {
      timelinePlayhead = Number(payload.time ?? payload.playhead);
    }
    const next = cutTimelineItem(item);
    return makeCanvasCommandResult(Boolean(next), next ? "Item cortado na timeline." : "Nao foi possivel cortar o item.", { item: next });
  }

  if (command === "duplicate" || command === "duplicate-item") {
    const item = findTimelineItem(payload);
    const duplicated = await duplicateTimelineItem(item);
    return makeCanvasCommandResult(Boolean(duplicated), duplicated ? "Item duplicado na timeline, canvas e layers." : "Item nao encontrado para duplicar.", { item: duplicated });
  }

  if (command === "hide" || command === "show" || command === "visibility") {
    const item = findTimelineItem(payload);
    if (!item) {
      return makeCanvasCommandResult(false, "Item da timeline nao encontrado.");
    }
    updateTimelineItem(item, { visible: command === "show" ? true : command === "hide" ? false : payload.visible });
    return makeCanvasCommandResult(true, "Visibilidade do item atualizada.", { item });
  }

  if (command === "volume" || command === "set-volume") {
    const item = findTimelineItem(payload);
    if (!item) {
      return makeCanvasCommandResult(false, "Item da timeline nao encontrado.");
    }
    updateTimelineItem(item, {
      volume: payload.volume,
      muted: payload.muted
    });
    return makeCanvasCommandResult(true, "Volume do item atualizado.", { item });
  }

  if (command === "speed" || command === "set-speed") {
    const item = findTimelineItem(payload);
    if (!item) {
      return makeCanvasCommandResult(false, "Item da timeline nao encontrado.");
    }
    updateTimelineItem(item, { speed: payload.speed });
    return makeCanvasCommandResult(true, "Velocidade do item atualizada.", { item });
  }

  if (command === "play") {
    playTimeline();
    return makeCanvasCommandResult(true, "Timeline em reproducao.", { playhead: timelinePlayhead });
  }

  if (command === "pause") {
    pauseTimelinePlayback({ keepPlayhead: true });
    return makeCanvasCommandResult(true, "Timeline pausada.", { playhead: timelinePlayhead });
  }

  if (command === "stop") {
    stopTimelinePlayback({ reset: Boolean(payload.reset) });
    return makeCanvasCommandResult(true, "Timeline parada.", { playhead: timelinePlayhead });
  }

  if (command === "next-marker" || command === "next-slide") {
    seekTimelineMarker(1);
    return makeCanvasCommandResult(true, "Marcador seguinte selecionado.", { playhead: timelinePlayhead, activeSlideId });
  }

  if (command === "prev-marker" || command === "previous-marker" || command === "prev-slide") {
    seekTimelineMarker(-1);
    return makeCanvasCommandResult(true, "Marcador anterior selecionado.", { playhead: timelinePlayhead, activeSlideId });
  }

  return makeCanvasCommandResult(false, "Comando de timeline desconhecido.");
}

async function applyProject(project, filePath = null, inherited = null, options = {}) {
  const previousApplyingSnapshot = isApplyingSnapshot;
  isApplyingSnapshot = true;
  try {
    renderProject(project, filePath);
    artboardWidth = clampArtboardDimension(project.artboard?.width || DEFAULT_ARTBOARD_WIDTH);
    artboardHeight = clampArtboardDimension(project.artboard?.height || DEFAULT_ARTBOARD_HEIGHT);
    currentArtboardPreset = project.artboard?.preset || "custom";

    if (artboardPreset) {
      const hasPreset = Boolean(ARTBOARD_PRESETS[currentArtboardPreset]);
      artboardPreset.value = hasPreset ? currentArtboardPreset : "custom";
    }

    if (customArtboardControls) {
      customArtboardControls.hidden = artboardPreset?.value !== "custom";
    }

    timelineSlides = normalizeTimelineSlides(project);
    activeSlideId = project.timeline?.activeSlideId && timelineSlides.some((slide) => slide.id === project.timeline.activeSlideId)
      ? project.timeline.activeSlideId
      : timelineSlides[0]?.id || null;
    timelineTrackLabels = normalizeTimelineTrackLabels(project);
    timelineItems = normalizeTimelineItems(project);
    selectedTimelineItemId = null;
    timelinePlayhead = getActiveTimelineSlide()?.startTime || 0;
    syncArtboardLabel();
    renderProjectBrandKit(project, inherited);
    const globalObjects = Array.isArray(project.fabric?.objects)
      ? project.fabric.objects
      : getActiveTimelineSlide()?.fabric?.objects || [];
    await loadFabricObjects(globalObjects);
    await loadTimelineSlide(getActiveTimelineSlide());
    centerArtboardInViewport();
  } finally {
    isApplyingSnapshot = previousApplyingSnapshot;
  }

  if (options.recordHistory !== false) {
    resetHistory(collectProjectFromCanvas({ appendHistory: false }), "project-loaded");
    scheduleAutosave();
  }
}

function createHistorySnapshot(label = "alteracao") {
  return {
    label,
    project: collectProjectFromCanvas({
      appendHistory: false
    })
  };
}

function pushHistorySnapshot(label = "alteracao") {
  if (!canvas || isApplyingSnapshot) {
    return;
  }

  const snapshot = createHistorySnapshot(label);
  const snapshotHash = JSON.stringify(snapshot.project);
  const currentHash = historySnapshots[historyIndex]?.hash || "";
  if (snapshotHash === currentHash) {
    return;
  }

  historySnapshots = historySnapshots.slice(0, historyIndex + 1);
  historySnapshots.push({
    ...snapshot,
    hash: snapshotHash
  });

  if (historySnapshots.length > HISTORY_LIMIT) {
    historySnapshots = historySnapshots.slice(historySnapshots.length - HISTORY_LIMIT);
  }

  historyIndex = historySnapshots.length - 1;
  updateHistoryControls();
}

function resetHistory(project = collectProjectFromCanvas({ appendHistory: false }), label = "inicio") {
  const snapshotHash = JSON.stringify(project);
  historySnapshots = [{
    label,
    project,
    hash: snapshotHash
  }];
  historyIndex = 0;
  updateHistoryControls();
}

function scheduleHistorySnapshot(label = "alteracao") {
  if (isApplyingSnapshot) {
    return;
  }

  clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    historyTimer = null;
    pushHistorySnapshot(label);
  }, HISTORY_DEBOUNCE_MS);
}

function flushPendingHistory(label = "alteracao") {
  if (!historyTimer) {
    return;
  }

  clearTimeout(historyTimer);
  historyTimer = null;
  pushHistorySnapshot(label);
}

function scheduleAutosave() {
  if (isApplyingSnapshot) {
    return;
  }

  clearTimeout(autosaveTimer);
  updateAutosaveStatus("Autosave pendente");
  autosaveTimer = setTimeout(() => {
    void saveAutosaveSnapshot();
  }, AUTOSAVE_DEBOUNCE_MS);
}

function markCanvasChanged(label = "alteracao") {
  if (isApplyingSnapshot) {
    return;
  }

  scheduleHistorySnapshot(label);
  scheduleAutosave();
}

async function applyHistoryProject(project, label = "historico") {
  if (!project) {
    return;
  }

  await applyProject(project, currentProjectFilePath, {
    brandKit: inheritedBrandKit,
    filePath: inheritedBrandKitFilePath
  }, { recordHistory: false });
  updateAutosaveStatus(label);
  scheduleAutosave();
}

async function undoCanvasChange() {
  flushPendingHistory("alteracao");
  if (historyIndex <= 0) {
    return;
  }

  historyIndex -= 1;
  updateHistoryControls();
  await applyHistoryProject(historySnapshots[historyIndex]?.project, "Desfeito");
}

async function redoCanvasChange() {
  flushPendingHistory("alteracao");
  if (historyIndex >= historySnapshots.length - 1) {
    return;
  }

  historyIndex += 1;
  updateHistoryControls();
  await applyHistoryProject(historySnapshots[historyIndex]?.project, "Refeito");
}

async function saveAutosaveSnapshot() {
  if (!canvas) {
    return;
  }

  try {
    const project = collectProjectFromCanvas({
      appendHistory: false
    });
    const projectHash = JSON.stringify(project);
    if (projectHash === lastAutosaveProjectHash) {
      updateAutosaveStatus("Autosave atualizado");
      return;
    }

    lastAutosaveProjectHash = projectHash;
    const result = await window.kitAPI?.saveCanvasAutosave?.({
      project,
      filePath: currentProjectFilePath,
      savedAt: new Date().toISOString()
    });

    updateAutosaveStatus(result?.savedAt ? `Autosave ${new Date(result.savedAt).toLocaleTimeString()}` : "Autosave atualizado");
  } catch (err) {
    console.error("Erro no autosave do Canvas:", err);
    updateAutosaveStatus(`Erro no autosave: ${err.message || err}`);
  }
}

async function restoreLastCanvasSession() {
  try {
    const result = await window.kitAPI?.loadCanvasAutosave?.();
    if (result?.project) {
      await applyProject(result.project, result.filePath || null, result.inheritedBrandKit || null);
      updateAutosaveStatus(result.savedAt ? `Sessao recuperada ${new Date(result.savedAt).toLocaleTimeString()}` : "Sessao recuperada");
      return true;
    }
  } catch (err) {
    console.error("Erro ao recuperar autosave do Canvas:", err);
    updateAutosaveStatus(`Erro ao recuperar sessao: ${err.message || err}`);
  }

  return false;
}

async function createCanvasProject() {
  try {
    const result = await window.kitAPI?.createCanvasProject?.();
    await applyProject(result?.project || createLocalDefaultProject(), result?.filePath || null, result?.inheritedBrandKit || null);
  } catch (err) {
    console.error("Erro ao criar projeto Canvas:", err);
    await applyProject(createLocalDefaultProject(), null);
  }
}

async function openCanvasProject() {
  try {
    const result = await window.kitAPI?.openCanvasProject?.();
    if (result?.project) {
      await applyProject(result.project, result.filePath || null, result.inheritedBrandKit || null);
    }
  } catch (err) {
    console.error("Erro ao abrir projeto Canvas:", err);
    if (projectStatus) {
      projectStatus.textContent = `Erro ao abrir .kia: ${err.message || err}`;
    }
  }
}

async function saveCanvasProject() {
  try {
    const project = collectProjectFromCanvas();
    const result = await window.kitAPI?.saveCanvasProject?.({
      project,
      filePath: currentProjectFilePath
    });

    if (result?.project) {
      renderProject(result.project, result.filePath || currentProjectFilePath);
      renderProjectBrandKit(result.project, result.inheritedBrandKit || null);
      resetHistory(collectProjectFromCanvas({ appendHistory: false }), "project-saved");
      scheduleAutosave();
    }
  } catch (err) {
    console.error("Erro ao salvar projeto Canvas:", err);
    if (projectStatus) {
      projectStatus.textContent = `Erro ao salvar .kia: ${err.message || err}`;
    }
  }
}

function appendNamedFiles(targetKey, files = []) {
  const next = collectBrandKitFromForm();
  const mappedFiles = files.map((file) => ({
    name: file.name || getFileName(file.path),
    path: file.path,
    type: file.type || ""
  }));

  if (targetKey === "logos") {
    next.logos = [...(next.logos || []), ...mappedFiles];
  }

  if (targetKey === "fonts") {
    next.fonts = [
      ...(next.fonts || []),
      ...mappedFiles.map((file) => ({
        ...file,
        family: file.name.replace(/\.[^.]+$/, ""),
        role: ""
      }))
    ];
  }

  if (targetKey === "assets.global") {
    next.assets = {
      ...(next.assets || {}),
      global: [...(next.assets?.global || []), ...mappedFiles]
    };
  }

  renderBrandKit(next);
}

async function createBrandKit() {
  try {
    const result = await window.kitAPI?.createBrandKit?.();
    renderBrandKit(result?.brandKit || createLocalDefaultBrandKit(), result?.filePath || null);
  } catch (err) {
    console.error("Erro ao criar Brand Kit:", err);
    renderBrandKit(createLocalDefaultBrandKit(), null);
  }
}

async function openBrandKit() {
  try {
    const result = await window.kitAPI?.openBrandKit?.();
    if (result?.brandKit) {
      renderBrandKit(result.brandKit, result.filePath || null);
    }
  } catch (err) {
    console.error("Erro ao abrir Brand Kit:", err);
    if (brandKitStatus) {
      brandKitStatus.textContent = `Erro ao abrir .kit: ${err.message || err}`;
    }
  }
}

async function saveBrandKit() {
  try {
    const brandKit = collectBrandKitFromForm();
    const result = await window.kitAPI?.saveBrandKit?.({
      brandKit,
      filePath: currentBrandKitFilePath
    });

    if (result?.brandKit) {
      renderBrandKit(result.brandKit, result.filePath || currentBrandKitFilePath);
    }
  } catch (err) {
    console.error("Erro ao salvar Brand Kit:", err);
    if (brandKitStatus) {
      brandKitStatus.textContent = `Erro ao salvar .kit: ${err.message || err}`;
    }
  }
}

async function selectBrandKitFiles(kind, targetKey) {
  try {
    const files = await window.kitAPI?.selectBrandKitFiles?.({ kind });
    if (Array.isArray(files) && files.length) {
      appendNamedFiles(targetKey, files);
    }
  } catch (err) {
    console.error("Erro ao selecionar arquivos do Brand Kit:", err);
  }
}

function getTextSelection() {
  const object = canvas?.getActiveObject();
  if (!object) {
    return null;
  }

  if (object.type === "activeSelection") {
    return object.getObjects?.().find((item) => ["textbox", "i-text", "text"].includes(item.type)) || null;
  }

  return ["textbox", "i-text", "text"].includes(object.type) ? object : null;
}

function applyColorToSelection(hex) {
  if (!canvas || !isValidHex(hex)) {
    return;
  }

  const object = canvas.getActiveObject();
  if (!object) {
    return;
  }

  const targets = object.type === "activeSelection" ? object.getObjects() : [object];
  targets.forEach((target) => {
    if (target.type !== "image") {
      target.set("fill", hex);
    }
  });

  canvas.requestRenderAll();
  updateSelectionInfo();
}

async function insertBrandImage(item = {}) {
  if (!canvas || (!item.path && !item.resolvedPath)) {
    return;
  }

  try {
    const imageUrl = toImageUrl(item.resolvedPath || item.path, currentBrandKitFilePath || inheritedBrandKitFilePath || currentProjectFilePath);
    const image = await createFabricImageFromUrl(imageUrl);
    const maxSide = Math.min(520, Math.max(180, Math.min(artboardWidth, artboardHeight) * 0.45));
    const width = image.width || maxSide;
    const height = image.height || maxSide;
    const scale = Math.min(maxSide / width, maxSide / height, 1);
    image.set({
      scaleX: scale,
      scaleY: scale,
      name: item.name || getFileName(item.path)
    });
    centerNewObject(image);
    addTimelineItem({
      type: "image",
      layerId: image.layerId,
      source: item.resolvedPath || item.path || image.name,
      label: image.name || getFileName(item.path),
      duration: 5
    });
  } catch (err) {
    console.error("Erro ao inserir imagem do Brand Kit:", err);
    if (brandKitStatus) {
      brandKitStatus.textContent = `Erro ao inserir imagem: ${err.message || err}`;
    }
  }
}

async function loadBrandFont(font = {}) {
  const family = font.family || font.name?.replace(/\.[^.]+$/, "") || "";
  if (!family || loadedFontFamilies.has(family)) {
    return family;
  }

  if (font.resolvedPath || font.path) {
    const fontUrl = toImageUrl(font.resolvedPath || font.path, currentBrandKitFilePath || inheritedBrandKitFilePath || currentProjectFilePath);
    const face = new FontFace(family, `url("${fontUrl}")`);
    const loadedFace = await face.load();
    document.fonts.add(loadedFace);
  }

  loadedFontFamilies.add(family);
  return family;
}

async function applyFontToSelection(font = {}) {
  if (!canvas) {
    return;
  }

  const textObject = getTextSelection();
  if (!textObject) {
    return;
  }

  try {
    const family = await loadBrandFont(font);
    if (!family) {
      return;
    }

    textObject.set("fontFamily", family);
    textObject.setCoords();
    canvas.requestRenderAll();
    updateSelectionInfo();
  } catch (err) {
    console.error("Erro ao aplicar fonte do Brand Kit:", err);
    if (brandKitStatus) {
      brandKitStatus.textContent = `Erro ao aplicar fonte: ${err.message || err}`;
    }
  }
}

function getActiveEditableObject() {
  const object = canvas?.getActiveObject();
  return object && !object.isArtboard ? object : null;
}

function updateObjectCoordsAndRender(object) {
  if (!canvas || !object) {
    return;
  }

  object.setCoords();
  canvas.requestRenderAll();
  updateSelectionInfo();
  markCanvasChanged("property");
}

function forEachTargetObject(object, callback) {
  if (!object) {
    return;
  }

  const targets = object.type === "activeSelection" && object.getObjects
    ? object.getObjects()
    : [object];
  targets.filter((target) => !target.isArtboard).forEach(callback);
}

function applyGeometryProperty(property) {
  const object = getActiveEditableObject();
  if (!object) {
    return;
  }

  if (property === "left") {
    object.set("left", getNumericValue(propX, object.left || 0));
  }

  if (property === "top") {
    object.set("top", getNumericValue(propY, object.top || 0));
  }

  if (property === "angle") {
    object.set("angle", getNumericValue(propAngle, object.angle || 0));
  }

  if (property === "width") {
    const nextWidth = Math.max(1, getNumericValue(propW, object.getScaledWidth?.() || object.width || 1));
    const baseWidth = Math.max(1, Number(object.width || nextWidth));
    object.set("scaleX", nextWidth / baseWidth);
  }

  if (property === "height") {
    const nextHeight = Math.max(1, getNumericValue(propH, object.getScaledHeight?.() || object.height || 1));
    const baseHeight = Math.max(1, Number(object.height || nextHeight));
    object.set("scaleY", nextHeight / baseHeight);
  }

  updateObjectCoordsAndRender(object);
}

function applyOpacityProperty() {
  const object = getActiveEditableObject();
  if (!object) {
    return;
  }

  const opacity = clampValue(getNumericValue(propOpacity, 100), 0, 100) / 100;
  forEachTargetObject(object, (target) => target.set("opacity", opacity));
  updateObjectCoordsAndRender(object);
}

function applyTimelineSpeedProperty() {
  const object = getActiveEditableObject();
  if (!object?.layerId) {
    return;
  }
  const item = timelineItems.find((entry) => entry.layerId === object.layerId);
  if (!item) {
    return;
  }
  updateTimelineItem(item, { speed: getNumericValue(propSpeed, item.speed || 1) });
}

function applyFillProperty() {
  const object = getActiveEditableObject();
  if (!object || !isValidHex(propFill?.value || "")) {
    return;
  }

  forEachTargetObject(object, (target) => {
    if (target.type !== "image") {
      target.set("fill", propFill.value);
    }
  });
  updateObjectCoordsAndRender(object);
}

function applyStrokeProperty() {
  const object = getActiveEditableObject();
  if (!object || !isValidHex(propStroke?.value || "")) {
    return;
  }

  forEachTargetObject(object, (target) => target.set("stroke", propStroke.value));
  updateObjectCoordsAndRender(object);
}

function applyStrokeWidthProperty() {
  const object = getActiveEditableObject();
  if (!object) {
    return;
  }

  const strokeWidth = Math.max(0, getNumericValue(propStrokeWidth, 0));
  forEachTargetObject(object, (target) => target.set("strokeWidth", strokeWidth));
  updateObjectCoordsAndRender(object);
}

async function applyTextProperty(property) {
  const object = getActiveEditableObject();
  if (!isTextObject(object)) {
    return;
  }

  if (property === "fontFamily") {
    const selectedFont = (currentBrandKit?.fonts || []).find((font) => {
      const family = font.family || font.name?.replace(/\.[^.]+$/, "") || "";
      return family === propFontFamily?.value;
    });

    if (selectedFont) {
      await loadBrandFont(selectedFont);
    }

    object.set("fontFamily", propFontFamily?.value || "Segoe UI");
  }

  if (property === "fontSize") {
    object.set("fontSize", Math.max(1, getNumericValue(propFontSize, object.fontSize || 64)));
  }

  if (property === "textAlign") {
    object.set("textAlign", propTextAlign?.value || "left");
  }

  updateObjectCoordsAndRender(object);
}

function getMaskPaths() {
  return getLayerObjects().filter((object) => object.isMaskPath);
}

async function cloneFabricObject(object) {
  const cloned = object.clone?.();
  if (cloned?.then) {
    return cloned;
  }

  return cloned || null;
}

async function createMaskDataUrl() {
  const StaticCanvas = getFabricClass("StaticCanvas");
  if (!StaticCanvas) {
    throw new Error("StaticCanvas indisponivel para exportar mascara.");
  }

  const maskPaths = getMaskPaths();
  if (!maskPaths.length) {
    throw new Error("Nenhum traco de mascara para exportar.");
  }

  const maskCanvas = new StaticCanvas(null, {
    width: artboardWidth,
    height: artboardHeight,
    backgroundColor: "#000000",
    enableRetinaScaling: false
  });
  const artboardRect = getArtboardRect();

  for (const pathObject of maskPaths) {
    const cloned = await cloneFabricObject(pathObject);
    if (!cloned) {
      continue;
    }

    cloned.set({
      visible: true,
      opacity: 1,
      fill: null,
      stroke: "#FFFFFF",
      shadow: null,
      left: Number(cloned.left || 0) - artboardRect.x,
      top: Number(cloned.top || 0) - artboardRect.y,
      selectable: false,
      evented: false
    });
    maskCanvas.add(cloned);
  }

  maskCanvas.renderAll();
  const dataUrl = maskCanvas.toDataURL({
    format: "png",
    multiplier: 1,
    enableRetinaScaling: false
  });
  maskCanvas.dispose?.();
  return dataUrl;
}

function getExportConfig() {
  const format = ["png", "jpeg", "webp"].includes(exportFormat?.value)
    ? exportFormat.value
    : "png";
  const quality = clampValue(getNumericValue(exportQuality, 92), 10, 100) / 100;

  return {
    format,
    quality,
    extension: format === "jpeg" ? "jpg" : format
  };
}

async function createArtboardImageDataUrl(config = getExportConfig(), options = {}) {
  const StaticCanvas = getFabricClass("StaticCanvas");
  if (!StaticCanvas) {
    throw new Error("StaticCanvas indisponivel para exportar imagem.");
  }

  const includeMasks = options.includeMasks !== false;
  const exportTime = options.time;
  const exportCanvas = new StaticCanvas(null, {
    width: artboardWidth,
    height: artboardHeight,
    backgroundColor: "#FFFFFF",
    enableRetinaScaling: false
  });
  const artboardRect = getArtboardRect();

  for (const object of getLayerObjects()) {
    if (!includeMasks && object.isMaskPath) {
      continue;
    }
    if (exportTime !== undefined && object.layerId) {
      const timelineItem = timelineItems.find((item) => item.layerId === object.layerId);
      if (timelineItem && !isTimelineItemActiveAt(timelineItem, exportTime)) {
        continue;
      }
    }

    const cloned = await cloneFabricObject(object);
    if (!cloned) {
      continue;
    }

    cloned.set({
      visible: exportTime !== undefined ? true : object.visible !== false,
      left: Number(cloned.left || 0) - artboardRect.x,
      top: Number(cloned.top || 0) - artboardRect.y,
      selectable: false,
      evented: false
    });
    exportCanvas.add(cloned);
  }

  exportCanvas.renderAll();
  const dataUrl = exportCanvas.toDataURL({
    format: config.format,
    quality: config.quality,
    multiplier: 1,
    enableRetinaScaling: false
  });
  exportCanvas.dispose?.();
  return dataUrl;
}

async function createObjectImageDataUrl(object) {
  if (!object) {
    return null;
  }

  const bounds = object.getBoundingRect?.(true, true) || {
    left: Number(object.left || 0),
    top: Number(object.top || 0),
    width: Number(object.getScaledWidth?.() || object.width || 1),
    height: Number(object.getScaledHeight?.() || object.height || 1)
  };
  const width = Math.max(1, Math.round(bounds.width || 1));
  const height = Math.max(1, Math.round(bounds.height || 1));
  const StaticCanvas = getFabricClass("StaticCanvas");
  if (!StaticCanvas) {
    throw new Error("StaticCanvas indisponivel para exportar layer.");
  }

  const exportCanvas = new StaticCanvas(null, {
    width,
    height,
    backgroundColor: "#FFFFFF",
    enableRetinaScaling: false
  });
  const cloned = await cloneFabricObject(object);
  if (!cloned) {
    throw new Error("Nao foi possivel clonar a camada fonte.");
  }

  cloned.set({
    left: Number(cloned.left || 0) - bounds.left,
    top: Number(cloned.top || 0) - bounds.top,
    selectable: false,
    evented: false
  });
  exportCanvas.add(cloned);
  exportCanvas.renderAll();
  const dataUrl = exportCanvas.toDataURL({
    format: "png",
    multiplier: 1,
    enableRetinaScaling: false
  });
  exportCanvas.dispose?.();
  return dataUrl;
}

function normalizeStableMetadata(metadata = {}, fallback = {}) {
  return {
    ...metadata,
    prompt: metadata.prompt || fallback.prompt || "",
    negative_prompt: metadata.negative_prompt || fallback.negative_prompt || "",
    checkpoint: metadata.checkpoint || fallback.checkpoint || "",
    lora: metadata.lora || fallback.lora || "",
    scheduler: metadata.scheduler || fallback.scheduler || "",
    seed: metadata.seed ?? fallback.seed ?? -1,
    mode: metadata.mode || fallback.mode || "txt2img",
    width: metadata.width || fallback.width || null,
    height: metadata.height || fallback.height || null,
    denoising_strength: metadata.denoising_strength ?? fallback.denoising_strength ?? null,
    output_file: metadata.output_file || fallback.output_file || fallback.file || metadata.file || ""
  };
}

async function exportMaskPng() {
  try {
    const dataUrl = await createMaskDataUrl();
    const result = await window.kitAPI?.saveCanvasMaskPng?.({
      dataUrl,
      name: `${projectNameInput?.value?.trim() || "canvas"}-mascara`
    });

    if (sdMaskStatus) {
      sdMaskStatus.textContent = result?.filePath
        ? `Mascara de inpaint exportada: ${result.filePath}`
        : "Exportacao da mascara de inpaint cancelada";
    }
  } catch (err) {
    console.error("Erro ao exportar mascara:", err);
    if (sdMaskStatus) {
      sdMaskStatus.textContent = `Erro ao exportar mascara de inpaint: ${err.message || err}`;
    }
  }
}

async function exportArtboardImage() {
  try {
    syncExportLabels();
    const config = getExportConfig();
    const markers = getTimelineCaptureMarkers();
    const exportMarkers = markers.length > 1 ? markers : [{ id: "current", label: "Frame", time: timelinePlayhead }];

    if (exportStatus) {
      exportStatus.textContent = exportMarkers.length > 1 ? "Exportando frames dos marcadores..." : "Exportando artboard...";
    }

    let firstPath = "";
    let exportedCount = 0;
    for (let index = 0; index < exportMarkers.length; index += 1) {
      const marker = exportMarkers[index];
      const dataUrl = await createArtboardImageDataUrl(config, { time: marker.time });
      const baseName = `${projectNameInput?.value?.trim() || "canvas-artboard"}-${String(index + 1).padStart(2, "0")}`;
      const payload = {
        dataUrl,
        format: config.format,
        extension: config.extension,
        quality: config.quality,
        name: baseName
      };

      if (index > 0 && firstPath && nodePath) {
        const parsed = nodePath.parse(firstPath);
        payload.filePath = nodePath.join(parsed.dir, `${parsed.name.replace(/-\d+$/, "")}-${String(index + 1).padStart(2, "0")}${parsed.ext}`);
      }

      const result = await window.kitAPI?.saveCanvasImage?.(payload);
      if (!result?.filePath) {
        break;
      }
      firstPath = firstPath || result.filePath;
      exportedCount += 1;
    }

    applyTimelineVisibilityAtTime(timelinePlayhead);

    if (exportStatus) {
      exportStatus.textContent = exportedCount
        ? `${exportedCount} frame(s) exportado(s): ${firstPath}`
        : "Exportacao cancelada";
    }
  } catch (err) {
    console.error("Erro ao exportar imagem:", err);
    if (exportStatus) {
      exportStatus.textContent = `Erro ao exportar imagem: ${err.message || err}`;
    }
  }
}

async function exportCarouselSlidesAsImages() {
  try {
    const config = {
      format: "png",
      extension: "png",
      quality: 1
    };
    const slides = getSlideExportRanges();

    if (exportStatus) {
      exportStatus.textContent = "Exportando slides em imagens...";
    }

    let firstPath = "";
    let exportedCount = 0;
    for (let index = 0; index < slides.length; index += 1) {
      const slide = slides[index];
      const dataUrl = await createArtboardImageDataUrl(config, { time: slide.startTime });
      const payload = {
        dataUrl,
        format: config.format,
        extension: config.extension,
        quality: config.quality,
        name: `slide_${String(index + 1).padStart(2, "0")}`
      };

      if (index > 0 && firstPath && nodePath) {
        const parsed = nodePath.parse(firstPath);
        payload.filePath = nodePath.join(parsed.dir, `slide_${String(index + 1).padStart(2, "0")}${parsed.ext}`);
      }

      const result = await window.kitAPI?.saveCanvasImage?.(payload);
      if (!result?.filePath) {
        break;
      }
      firstPath = firstPath || result.filePath;
      exportedCount += 1;
    }

    applyTimelineVisibilityAtTime(timelinePlayhead);
    if (exportStatus) {
      exportStatus.textContent = exportedCount
        ? `${exportedCount} slide(s) exportado(s) em imagem: ${firstPath}`
        : "Exportacao de slides em imagem cancelada";
    }
  } catch (err) {
    console.error("Erro ao exportar carrossel em imagens:", err);
    if (exportStatus) {
      exportStatus.textContent = `Erro ao exportar carrossel em imagens: ${err.message || err}`;
    }
  }
}

async function exportCarouselSlidesAsVideos() {
  try {
    const slides = getSlideExportRanges();
    const fps = 12;

    if (exportStatus) {
      exportStatus.textContent = "Renderizando videos por slide...";
    }

    let firstPath = "";
    let exportedCount = 0;
    for (let slideIndex = 0; slideIndex < slides.length; slideIndex += 1) {
      const slide = slides[slideIndex];
      const frameCount = Math.max(1, Math.ceil(slide.duration * fps));
      const frames = [];

      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const time = Math.min(slide.endTime - 1 / fps, slide.startTime + frameIndex / fps);
        frames.push(await createArtboardImageDataUrl({
          format: "png",
          extension: "png",
          quality: 1
        }, { time }));
      }

      const payload = {
        frames,
        fps,
        name: `slide_${String(slideIndex + 1).padStart(2, "0")}`
      };

      if (slideIndex > 0 && firstPath && nodePath) {
        const parsed = nodePath.parse(firstPath);
        payload.filePath = nodePath.join(parsed.dir, `slide_${String(slideIndex + 1).padStart(2, "0")}.mp4`);
      }

      const result = await window.kitAPI?.saveCanvasVideoMp4?.(payload);
      if (!result?.filePath) {
        break;
      }
      firstPath = firstPath || result.filePath;
      exportedCount += 1;
    }

    applyTimelineVisibilityAtTime(timelinePlayhead);
    if (exportStatus) {
      exportStatus.textContent = exportedCount
        ? `${exportedCount} slide(s) exportado(s) em video: ${firstPath}`
        : "Exportacao de slides em video cancelada";
    }
  } catch (err) {
    console.error("Erro ao exportar carrossel em video:", err);
    if (exportStatus) {
      exportStatus.textContent = `Erro ao exportar carrossel em video: ${err.message || err}`;
    }
  }
}

async function exportCurrentArtboardImageFromCommand(config = getExportConfig()) {
  const dataUrl = await createArtboardImageDataUrl(config, { time: timelinePlayhead });
  return window.kitAPI?.saveCanvasImage?.({
    dataUrl,
    format: config.format,
    extension: config.extension,
    quality: config.quality,
    name: projectNameInput?.value?.trim() || "canvas-artboard"
  });
}

function getCanvasStateSummary() {
  return {
    project: {
      name: projectNameInput?.value?.trim() || "Novo Projeto Canvas",
      filePath: currentProjectFilePath,
      brandKitPath: currentBrandKitFilePath || currentProject?.brandKitPath || null
    },
    artboard: {
      width: artboardWidth,
      height: artboardHeight,
      preset: currentArtboardPreset || "custom"
    },
    layers: getLayerObjects().map((object, index) => ({
      id: object.layerId || null,
      name: makeObjectName(object),
      type: object.type || "object",
      index,
      visible: object.visible !== false,
      locked: Boolean(object.layerLocked),
      selected: canvas?.getActiveObject() === object
    }))
  };
}

function makeCanvasCommandResult(ok, message, data = {}) {
  return {
    ok,
    message,
    state: getCanvasStateSummary(),
    ...data
  };
}

function setStableDiffusionStatus(message) {
  if (sdStatus) {
    sdStatus.textContent = message;
  }
}

function registerCanvasAction(name, handler) {
  if (!name || typeof handler !== "function") {
    return;
  }
  CanvasActionRegistry.set(String(name), handler);
}

function getCanvasAction(name) {
  return CanvasActionRegistry.get(String(name)) || null;
}

function setSelectOptions(select, items = [], config = {}) {
  if (!select) {
    return;
  }

  const placeholder = config.placeholder || "Selecionar";
  select.innerHTML = "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = placeholder;
  select.appendChild(emptyOption);

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.path || item.id || item.name || "";
    option.textContent = item.name || item.filename || item.file || item.path || "Modelo";
    if (item.architecture && item.architecture !== "auto") {
      option.dataset.architecture = item.architecture;
    }
    if (item.preview) {
      option.dataset.preview = item.preview;
    }
    if (item.type) {
      option.dataset.modelType = item.type;
    }
    select.appendChild(option);
  });
}

function getSelectedCheckpointArchitecture() {
  const selected = sdCheckpoint?.selectedOptions?.[0];
  if (sdArchitecture?.value && sdArchitecture.value !== "auto") {
    return sdArchitecture.value;
  }
  return selected?.dataset?.architecture || "sd15";
}

function isStableImageSourceObject(object) {
  return Boolean(object && isRasterEditableImage(object) && object.layerKind !== "mask" && object.layerKind !== "video" && object.isMaskPath !== true);
}

function getSelectedStablePrimaryMode() {
  return sdMode?.value === "i2i" ? "i2i" : "txt2img";
}

function getSelectedStableI2ISubmode() {
  const value = String(sdI2IMode?.value || "img2img").trim();
  return ["img2img", "sketch", "inpaint", "inpaint-sketch"].includes(value) ? value : "img2img";
}

function getStableInsertMode() {
  const value = String(sdInpaintInsertMode?.value || "new-layer").trim();
  return ["new-layer", "replace", "variation"].includes(value) ? value : "new-layer";
}

function getStableOutputMode() {
  const insertMode = getStableInsertMode();
  if (insertMode === "replace") {
    return "replaceSelected";
  }
  if (insertMode === "variation") {
    return "variation";
  }
  return "newLayer";
}

function getStableUiMode() {
  const primaryMode = getSelectedStablePrimaryMode();
  return primaryMode === "txt2img" ? "txt2img" : getSelectedStableI2ISubmode();
}

function getStableDiffusionMode() {
  const uiMode = getStableUiMode();
  if (uiMode === "txt2img") {
    return "txt2img";
  }
  if (uiMode === "inpaint" || uiMode === "inpaint-sketch") {
    return "inpaint";
  }
  return "img2img";
}

function getStableSourceObject(options = {}) {
  if (options.sourceLayerId || options.layerId || options.id) {
    const requested = findCanvasObject({
      layerId: options.sourceLayerId || options.layerId || options.id
    });
    return isStableImageSourceObject(requested) ? requested : null;
  }

  const activeObject = canvas?.getActiveObject?.();
  if (isStableImageSourceObject(activeObject)) {
    return activeObject;
  }

  return null;
}

function getStableSketchObject(options = {}) {
  if (options.sketchLayerId) {
    const requested = findCanvasObject({ layerId: options.sketchLayerId });
    return isStableImageSourceObject(requested) ? requested : null;
  }
  return null;
}

function getStableMaskObject(options = {}) {
  if (options.maskLayerId) {
    const requested = findCanvasObject({ layerId: options.maskLayerId });
    if (requested?.layerKind === "mask" || requested?.isMaskPath) {
      return requested;
    }
  }
  return null;
}

function getStableSourceStatusMessage(options = {}) {
  const sourceObject = getStableSourceObject(options);
  if (sourceObject) {
    return `Camada ativa: ${makeObjectName(sourceObject)} pronta para I2I.`;
  }
  return "Selecione uma camada de imagem para usar img2img.";
}

function updateStableDiffusionPanelState() {
  const isI2I = getSelectedStablePrimaryMode() === "i2i";
  const sourceObject = getStableSourceObject();
  const i2iMode = getSelectedStableI2ISubmode();
  const needsMask = i2iMode === "inpaint" || i2iMode === "inpaint-sketch";
  const needsSketch = i2iMode === "sketch" || i2iMode === "inpaint-sketch";

  if (sdI2IControls) {
    sdI2IControls.hidden = !isI2I;
  }

  if (sdSourceStatus) {
    let message = getStableSourceStatusMessage();
    if (needsMask) {
      message += " Inpaint usa a mascara de inpaint do canvas.";
    }
    if (needsSketch) {
      message += " Sketch ainda esta em stub claro para a proxima etapa.";
    }
    sdSourceStatus.textContent = message;
  }

  if (sdInpaintMaskContext) {
    sdInpaintMaskContext.hidden = !needsMask;
    sdInpaintMaskContext.textContent = needsMask
      ? "Fluxo de inpaint ativo: o Stable Diffusion vai usar apenas a mascara de inpaint do canvas. A mascara da layer nao entra nesse processo."
      : "A mascara de inpaint so entra em cena quando o modo de Stable Diffusion estiver em inpaint.";
  }

  if (sdMaskStatus) {
    sdMaskStatus.textContent = needsMask
      ? "Mascara de inpaint pronta para exportacao e envio ao Stable Diffusion."
      : "Mascara de inpaint em espera. Ela so sera usada nos modos de inpaint.";
  }

  if (sdMaskBehaviorNote) {
    sdMaskBehaviorNote.textContent = needsMask
      ? "Contexto atual: inpaint. Esta mascara sera enviada ao Stable Diffusion e nao altera a transparencia da layer comum."
      : "Contexto atual: mascara reservada para inpaint/outpaint. Ela permanece separada da mascara normal da layer.";
  }

  if (sdGenerateButton) {
    const promptReady = Boolean(sdPrompt?.value?.trim());
    const checkpointReady = Boolean(sdCheckpoint?.value);
    const sourceReady = !isI2I || Boolean(sourceObject);
    sdGenerateButton.disabled = !promptReady || !checkpointReady || !sourceReady;
  }
}

async function refreshStableDiffusionModels() {
  try {
    setStableDiffusionStatus("Consultando worker SD...");
    const data = await window.kitAPI?.getStableDiffusionModels?.();
    const checkpoints = [
      ...(data?.checkpoints || []),
      ...(data?.diffusionModels || [])
    ];
    setSelectOptions(sdCheckpoint, checkpoints, {
      placeholder: checkpoints.length ? "Selecione um checkpoint/modelo" : "Nenhum modelo local"
    });
    setSelectOptions(sdLora, data?.loras || [], {
      placeholder: "Sem LoRA"
    });

    if (sdScheduler && Array.isArray(data?.schedulers) && data.schedulers.length) {
      const currentValue = sdScheduler.value;
      sdScheduler.innerHTML = "";
      data.schedulers.forEach((scheduler) => {
        const option = document.createElement("option");
        option.value = scheduler;
        option.textContent = scheduler;
        sdScheduler.appendChild(option);
      });
      sdScheduler.value = data.schedulers.includes(currentValue) ? currentValue : data.schedulers[0];
    }

    const counts = data?.counts || {};
    const warningText = data?.config?.warnings?.length ? ` Avisos: ${data.config.warnings.length}.` : "";
    setStableDiffusionStatus(
      `${counts.checkpoints ?? data?.checkpoints?.length ?? 0} checkpoint(s), ` +
      `${counts.loras ?? data?.loras?.length ?? 0} LoRA(s), ` +
      `${counts.diffusionModels ?? data?.diffusionModels?.length ?? 0} diffusion model(s).${warningText}`
    );
    updateStableDiffusionPanelState();
  } catch (err) {
    setStableDiffusionStatus(`Worker SD indisponivel: ${err.message || err}`);
    updateStableDiffusionPanelState();
  }
}

async function startStableDiffusionWorker() {
  try {
    setStableDiffusionStatus("Iniciando worker SD...");
    await window.kitAPI?.controlService?.("sd", "start");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const health = await window.kitAPI?.getStableDiffusionHealth?.().catch(() => null);
    if (health?.counts) {
      setStableDiffusionStatus(
        `Worker SD: ${health.ready ? "pronto" : "carregando"} | ` +
        `${health.counts.checkpoints} checkpoint(s), ${health.counts.loras} LoRA(s), ` +
        `${health.counts.diffusionModels} diffusion model(s).`
      );
    }
    await refreshStableDiffusionModels();
  } catch (err) {
    setStableDiffusionStatus(`Erro ao iniciar worker SD: ${err.message || err}`);
  }
}

function collectStableDiffusionPayload() {
  return {
    mode: getStableDiffusionMode(),
    uiMode: getStableUiMode(),
    prompt: sdPrompt?.value?.trim() || "",
    negative_prompt: sdNegativePrompt?.value?.trim() || "",
    checkpoint: sdCheckpoint?.value || "",
    architecture: getSelectedCheckpointArchitecture(),
    lora: sdLora?.value || "",
    scheduler: sdScheduler?.value || "DPMSolverMultistepScheduler",
    steps: getNumericValue(sdSteps, 24),
    cfg_scale: getNumericValue(sdCfgScale, 7),
    width: sdWidth?.value ? getNumericValue(sdWidth, 0) : undefined,
    height: sdHeight?.value ? getNumericValue(sdHeight, 0) : undefined,
    seed: getNumericValue(sdSeed, -1),
    denoising_strength: getNumericValue(sdDenoising, 0.55),
    batch_count: 1,
    batch_size: 1,
    artboard: getCanvasStateSummary().artboard
  };
}

function recordStableDiffusionGeneration(metadata = {}) {
  const base = currentProject || createLocalDefaultProject();
  const generation = {
    id: `sd-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    positivePrompt: metadata.prompt || "",
    negativePrompt: metadata.negative_prompt || "",
    checkpoint: metadata.checkpoint || "",
    lora: metadata.lora || "",
    seed: metadata.seed ?? -1,
    mode: metadata.mode || "txt2img",
    width: metadata.width || null,
    height: metadata.height || null,
    sampler: metadata.sampler || metadata.scheduler || "",
    scheduler: metadata.scheduler || metadata.sampler || "",
    outputFile: metadata.output_file || metadata.file || ""
  };

  currentProject = {
    ...base,
    ai: {
      ...(base.ai || {}),
      prompts: [
        ...(Array.isArray(base.ai?.prompts) ? base.ai.prompts : []),
        {
          positive: generation.positivePrompt,
          negative: generation.negativePrompt,
          mode: generation.mode,
          at: generation.createdAt
        }
      ].slice(-100),
      generations: [
        ...(Array.isArray(base.ai?.generations) ? base.ai.generations : []),
        generation
      ].slice(-100),
      inpaints: Array.isArray(base.ai?.inpaints) ? base.ai.inpaints : [],
      outpaints: Array.isArray(base.ai?.outpaints) ? base.ai.outpaints : [],
      masks: Array.isArray(base.ai?.masks) ? base.ai.masks : []
    }
  };
}

function recordStableDiffusionInpaint(metadata = {}) {
  const base = currentProject || createLocalDefaultProject();
  const createdAt = new Date().toISOString();
  const inpaint = {
    id: `inpaint-${Date.now().toString(36)}`,
    createdAt,
    positivePrompt: metadata.prompt || "",
    negativePrompt: metadata.negative_prompt || "",
    seed: metadata.seed ?? -1,
    checkpoint: metadata.checkpoint || "",
    lora: metadata.lora || "",
    mode: "inpaint",
    width: metadata.width || artboardWidth,
    height: metadata.height || artboardHeight,
    denoisingStrength: metadata.denoising_strength ?? null,
    scheduler: metadata.scheduler || metadata.sampler || "",
    maskFile: metadata.mask_path || metadata.maskFile || "",
    baseImageFile: metadata.image_path || metadata.baseImageFile || "",
    resultFile: metadata.output_file || metadata.file || "",
    targetLayerId: metadata.targetLayerId || null,
    insertMode: metadata.insertMode || "new-layer"
  };

  currentProject = {
    ...base,
    ai: {
      ...(base.ai || {}),
      prompts: [
        ...(Array.isArray(base.ai?.prompts) ? base.ai.prompts : []),
        {
          positive: inpaint.positivePrompt,
          negative: inpaint.negativePrompt,
          mode: "inpaint",
          at: createdAt
        }
      ].slice(-100),
      generations: Array.isArray(base.ai?.generations) ? base.ai.generations : [],
      inpaints: [
        ...(Array.isArray(base.ai?.inpaints) ? base.ai.inpaints : []),
        inpaint
      ].slice(-100),
      outpaints: Array.isArray(base.ai?.outpaints) ? base.ai.outpaints : [],
      masks: [
        ...(Array.isArray(base.ai?.masks) ? base.ai.masks : []),
        {
          id: `${inpaint.id}-mask`,
          createdAt,
          file: inpaint.maskFile,
          source: "canvas-mask"
        }
      ].filter((item) => item.file).slice(-100)
    }
  };
}

function recordStableDiffusionOutpaint(metadata = {}) {
  const base = currentProject || createLocalDefaultProject();
  const createdAt = new Date().toISOString();
  const outpaint = {
    id: `outpaint-${Date.now().toString(36)}`,
    createdAt,
    positivePrompt: metadata.prompt || "",
    negativePrompt: metadata.negative_prompt || "",
    seed: metadata.seed ?? -1,
    checkpoint: metadata.checkpoint || "",
    lora: metadata.lora || "",
    mode: "outpaint",
    originalFormat: metadata.originalFormat || null,
    targetFormat: metadata.targetFormat || null,
    side: metadata.side || "auto",
    expandedImageFile: metadata.image_path || metadata.expandedImageFile || "",
    maskFile: metadata.mask_path || metadata.maskFile || "",
    resultFile: metadata.output_file || metadata.file || ""
  };

  currentProject = {
    ...base,
    ai: {
      ...(base.ai || {}),
      prompts: [
        ...(Array.isArray(base.ai?.prompts) ? base.ai.prompts : []),
        {
          positive: outpaint.positivePrompt,
          negative: outpaint.negativePrompt,
          mode: "outpaint",
          at: createdAt
        }
      ].slice(-100),
      generations: Array.isArray(base.ai?.generations) ? base.ai.generations : [],
      inpaints: Array.isArray(base.ai?.inpaints) ? base.ai.inpaints : [],
      outpaints: [
        ...(Array.isArray(base.ai?.outpaints) ? base.ai.outpaints : []),
        outpaint
      ].slice(-100),
      masks: [
        ...(Array.isArray(base.ai?.masks) ? base.ai.masks : []),
        {
          id: `${outpaint.id}-mask`,
          createdAt,
          file: outpaint.maskFile,
          source: "outpaint-mask"
        }
      ].filter((item) => item.file).slice(-100)
    }
  };
}

async function insertGeneratedImageCover(filePath, metadata = {}) {
  const image = await createFabricImageFromUrl(toImageUrl(filePath));
  const imageWidth = image.width || artboardWidth;
  const imageHeight = image.height || artboardHeight;
  const scale = Math.max(artboardWidth / imageWidth, artboardHeight / imageHeight);
  image.set({
    scaleX: scale,
    scaleY: scale,
    name: `SD ${metadata.mode || "txt2img"}`
  });
  centerObjectInRect(image, getArtboardRect());
  canvas.add(image);
  image.setCoords();
  canvas.setActiveObject(image);
  canvas.requestRenderAll();
  updateSelectionInfo();
  addTimelineItem({
    type: "image",
    layerId: image.layerId,
    source: filePath,
    label: image.name,
    duration: Number(metadata.duration || 5)
  });
  markCanvasChanged("sd-generation");
  return image;
}

async function insertInpaintResult(filePath, metadata = {}, options = {}) {
  const image = await createFabricImageFromUrl(toImageUrl(filePath));
  const imageWidth = image.width || artboardWidth;
  const imageHeight = image.height || artboardHeight;
  image.set({
    scaleX: artboardWidth / imageWidth,
    scaleY: artboardHeight / imageHeight,
    name: "Inpaint resultado",
    layerName: "Inpaint resultado"
  });
  centerObjectInRect(image, getArtboardRect());

  if (options.insertMode === "replace" && options.targetObject) {
    options.targetObject.set({
      visible: false,
      inpaintOriginalPreserved: true
    });
  }

  canvas.add(image);
  image.setCoords();
  canvas.setActiveObject(image);
  canvas.requestRenderAll();
  updateSelectionInfo();
  addTimelineItem({
    type: "image",
    layerId: image.layerId,
    source: filePath,
    label: image.layerName || image.name,
    duration: Number(metadata.duration || 5)
  });
  markCanvasChanged("sd-inpaint");
  return image;
}

async function insertOutpaintResult(filePath, target, metadata = {}) {
  applyArtboardSize(target.width, target.height, {
    preset: target.preset || "custom"
  });

  const image = await createFabricImageFromUrl(toImageUrl(filePath));
  const imageWidth = image.width || target.width;
  const imageHeight = image.height || target.height;
  image.set({
    scaleX: target.width / imageWidth,
    scaleY: target.height / imageHeight,
    name: "Outpaint resultado",
    layerName: `Outpaint ${metadata.targetFormat?.label || target.label || ""}`.trim()
  });
  centerObjectInRect(image, getArtboardRect());
  canvas.add(image);
  image.setCoords();
  canvas.setActiveObject(image);
  canvas.requestRenderAll();
  updateSelectionInfo();
  addTimelineItem({
    type: "image",
    layerId: image.layerId,
    source: filePath,
    label: image.layerName || image.name,
    duration: Number(metadata.duration || 5)
  });
  markCanvasChanged("sd-outpaint");
  return image;
}

function getInpaintTargetObject(selector = {}) {
  const requested = findCanvasObject(selector);
  if (requested && !requested.isMaskPath) {
    return requested;
  }

  const activeObject = canvas?.getActiveObject();
  if (activeObject && !activeObject.isArtboard && !activeObject.isMaskPath) {
    return activeObject;
  }

  return [...getLayerObjects()].reverse().find((object) => (
    object.type === "image" && !object.isMaskPath && object.visible !== false
  )) || null;
}

function resolveOutpaintTarget(options = {}) {
  const targetKey = options.targetPreset || options.target || sdOutpaintTarget?.value || "instagram-story";
  const target = OUTPAINT_TARGETS[targetKey] || OUTPAINT_TARGETS["instagram-story"];
  const currentRatio = artboardWidth / artboardHeight;
  let width = artboardWidth;
  let height = artboardHeight;

  if (currentRatio > target.ratio) {
    height = Math.ceil(width / target.ratio);
  } else {
    width = Math.ceil(height * target.ratio);
  }

  return {
    key: targetKey,
    label: target.label,
    preset: target.preset,
    ratio: target.ratio,
    width: clampArtboardDimension(width),
    height: clampArtboardDimension(height)
  };
}

function resolveOutpaintOffset(target, side = "auto") {
  const extraX = Math.max(0, target.width - artboardWidth);
  const extraY = Math.max(0, target.height - artboardHeight);
  const normalizedSide = String(side || "auto").trim().toLowerCase();

  return {
    x: normalizedSide === "left" ? extraX : normalizedSide === "right" ? 0 : Math.round(extraX / 2),
    y: normalizedSide === "top" ? extraY : normalizedSide === "bottom" ? 0 : Math.round(extraY / 2),
    extraX,
    extraY,
    side: normalizedSide
  };
}

async function createOutpaintDataUrls(target, side = "auto") {
  const StaticCanvas = getFabricClass("StaticCanvas");
  const Rect = getFabricClass("Rect");
  if (!StaticCanvas || !Rect) {
    throw new Error("Fabric StaticCanvas/Rect indisponivel para outpaint.");
  }

  const offset = resolveOutpaintOffset(target, side);
  const artboardRect = getArtboardRect();
  if (!offset.extraX && !offset.extraY) {
    throw new Error("O formato de destino precisa expandir a lousa atual.");
  }

  const expandedCanvas = new StaticCanvas(null, {
    width: target.width,
    height: target.height,
    backgroundColor: "#FFFFFF",
    enableRetinaScaling: false
  });

  for (const object of getLayerObjects()) {
    if (object.isMaskPath || object.visible === false) {
      continue;
    }

    const cloned = await cloneFabricObject(object);
    if (!cloned) {
      continue;
    }

    cloned.set({
      left: Number(cloned.left || 0) - artboardRect.x + offset.x,
      top: Number(cloned.top || 0) - artboardRect.y + offset.y,
      selectable: false,
      evented: false
    });
    expandedCanvas.add(cloned);
  }

  expandedCanvas.renderAll();
  const baseImageDataUrl = expandedCanvas.toDataURL({
    format: "png",
    multiplier: 1,
    enableRetinaScaling: false
  });
  expandedCanvas.dispose?.();

  const maskCanvas = new StaticCanvas(null, {
    width: target.width,
    height: target.height,
    backgroundColor: "#000000",
    enableRetinaScaling: false
  });
  const addMaskRect = (left, top, width, height) => {
    if (width <= 0 || height <= 0) {
      return;
    }
    maskCanvas.add(new Rect({
      left,
      top,
      width,
      height,
      fill: "#FFFFFF",
      strokeWidth: 0,
      selectable: false,
      evented: false
    }));
  };

  addMaskRect(0, 0, target.width, offset.y);
  addMaskRect(0, offset.y + artboardHeight, target.width, target.height - offset.y - artboardHeight);
  addMaskRect(0, offset.y, offset.x, artboardHeight);
  addMaskRect(offset.x + artboardWidth, offset.y, target.width - offset.x - artboardWidth, artboardHeight);

  maskCanvas.renderAll();
  const maskImageDataUrl = maskCanvas.toDataURL({
    format: "png",
    multiplier: 1,
    enableRetinaScaling: false
  });
  maskCanvas.dispose?.();

  return {
    baseImageDataUrl,
    maskImageDataUrl,
    offset
  };
}

const CanvasStableActions = {
  async ensureStableEnabled() {
    const health = await window.kitAPI?.getStableDiffusionHealth?.().catch(() => null);
    if (health?.ready) {
      updateStableDiffusionPanelState();
      return health;
    }
    await startStableDiffusionWorker();
    return window.kitAPI?.getStableDiffusionHealth?.().catch(() => null);
  },

  openStablePanel() {
    setInspectorAccordionVisible("sd", true);
    setInspectorAccordionOpen("sd", true, { persist: false });
    updateStableDiffusionPanelState();
    return true;
  },

  setStableMode(mode) {
    const normalized = String(mode || "").trim().toLowerCase();
    if (normalized === "txt2img" || normalized === "t2i") {
      if (sdMode) {
        sdMode.value = "txt2img";
      }
    } else {
      if (sdMode) {
        sdMode.value = "i2i";
      }
      if (sdI2IMode) {
        sdI2IMode.value = ["img2img", "sketch", "inpaint", "inpaint-sketch"].includes(normalized)
          ? normalized
          : "img2img";
      }
    }
    updateStableDiffusionPanelState();
    return getStableUiMode();
  },

  async insertGeneratedImage(result, options = {}) {
    if (!result?.file) {
      throw new Error("Resultado de Stable Diffusion sem arquivo de saida.");
    }

    const outputMode = options.outputMode || options.insertMode || "newLayer";
    const metadata = normalizeStableMetadata(result.metadata || {}, {
      ...options,
      file: result.file,
      output_file: result.file
    });

    if (metadata.mode === "inpaint") {
      return insertInpaintResult(result.file, metadata, {
        insertMode: outputMode === "replaceSelected" ? "replace" : outputMode === "variation" ? "variation" : "new-layer",
        targetObject: options.targetObject || getStableSourceObject(options)
      });
    }

    if (outputMode === "replaceSelected") {
      const targetObject = options.targetObject || getStableSourceObject(options);
      if (targetObject) {
        targetObject.set({
          visible: false,
          inpaintOriginalPreserved: true
        });
      }
    }

    return insertGeneratedImageCover(result.file, {
      ...metadata,
      mode: metadata.mode || "txt2img"
    });
  },

  async generateT2I(options = {}) {
    const payload = {
      ...collectStableDiffusionPayload(),
      ...options,
      mode: "txt2img",
      uiMode: "txt2img",
      prompt: String(options.prompt ?? sdPrompt?.value ?? "").trim(),
      negative_prompt: String(options.negativePrompt ?? options.negative_prompt ?? sdNegativePrompt?.value ?? "").trim(),
      checkpoint: options.checkpoint || sdCheckpoint?.value || "",
      architecture: options.architecture || getSelectedCheckpointArchitecture(),
      lora: options.loras || options.lora || sdLora?.value || "",
      scheduler: options.scheduler || options.sampler || sdScheduler?.value || "DPMSolverMultistepScheduler",
      steps: Number(options.steps ?? getNumericValue(sdSteps, 24)),
      cfg_scale: Number(options.cfgScale ?? options.cfg_scale ?? getNumericValue(sdCfgScale, 7)),
      width: options.width ?? (sdWidth?.value ? getNumericValue(sdWidth, 0) : undefined),
      height: options.height ?? (sdHeight?.value ? getNumericValue(sdHeight, 0) : undefined),
      seed: Number(options.seed ?? getNumericValue(sdSeed, -1)),
      artboard: options.targetArtboard || getCanvasStateSummary().artboard
    };

    if (!payload.prompt) {
      throw new Error("Informe um prompt positivo antes de gerar.");
    }
    if (!payload.checkpoint) {
      throw new Error("Selecione um checkpoint local.");
    }

    await this.ensureStableEnabled();
    const result = await window.kitAPI?.txt2imgStableDiffusionImage?.(payload);
    if (!result?.file) {
      throw new Error("Worker nao retornou arquivo de saida.");
    }

    const metadata = normalizeStableMetadata(result.metadata || {}, payload);
    const inserted = await this.insertGeneratedImage({
      file: result.file,
      metadata
    }, {
      outputMode: options.insertMode === "replaceSelected" ? "replaceSelected" : "newLayer"
    });
    recordStableDiffusionGeneration({
      ...metadata,
      file: result.file,
      output_file: result.file
    });
    scheduleAutosave();
    return {
      file: result.file,
      metadata,
      insertedLayerId: inserted?.layerId || null
    };
  },

  async generateI2I(options = {}) {
    const mode = ["img2img", "sketch", "inpaint", "inpaint-sketch"].includes(String(options.mode || "").trim())
      ? String(options.mode).trim()
      : getSelectedStableI2ISubmode();
    const sourceObject = getStableSourceObject(options);
    if (!sourceObject) {
      throw new Error("I2I precisa de uma camada de imagem ativa.");
    }

    if (mode === "sketch") {
      throw new Error("Sketch ainda esta em stub claro. Base de I2I preparada para integrar sketch layer.");
    }

    const sourceImageData = options.sourceImageData || await createObjectImageDataUrl(sourceObject);
    const payload = {
      ...collectStableDiffusionPayload(),
      ...options,
      mode: mode === "inpaint" || mode === "inpaint-sketch" ? "inpaint" : "img2img",
      uiMode: mode,
      prompt: String(options.prompt ?? sdPrompt?.value ?? "").trim(),
      negative_prompt: String(options.negativePrompt ?? options.negative_prompt ?? sdNegativePrompt?.value ?? "").trim(),
      checkpoint: options.checkpoint || sdCheckpoint?.value || "",
      architecture: options.architecture || getSelectedCheckpointArchitecture(),
      lora: options.loras || options.lora || sdLora?.value || "",
      scheduler: options.scheduler || options.sampler || sdScheduler?.value || "DPMSolverMultistepScheduler",
      steps: Number(options.steps ?? getNumericValue(sdSteps, 24)),
      cfg_scale: Number(options.cfgScale ?? options.cfg_scale ?? getNumericValue(sdCfgScale, 7)),
      width: options.width ?? (sdWidth?.value ? getNumericValue(sdWidth, 0) : undefined),
      height: options.height ?? (sdHeight?.value ? getNumericValue(sdHeight, 0) : undefined),
      seed: Number(options.seed ?? getNumericValue(sdSeed, -1)),
      denoising_strength: Number(options.denoiseStrength ?? options.denoising_strength ?? getNumericValue(sdDenoising, 0.55)),
      artboard: getCanvasStateSummary().artboard,
      sourceLayerId: sourceObject.layerId,
      image_data_url: sourceImageData,
      base_image_data_url: sourceImageData
    };

    if (!payload.prompt) {
      throw new Error(`Informe um prompt positivo antes de executar ${mode}.`);
    }
    if (!payload.checkpoint) {
      throw new Error("Selecione um checkpoint local.");
    }

    if (mode === "inpaint" || mode === "inpaint-sketch") {
      if (!options.maskImageData && !getMaskPaths().length) {
        throw new Error("Inpaint precisa de mascara.");
      }
      const maskImageDataUrl = options.maskImageData || await createMaskDataUrl();
      if (!maskImageDataUrl) {
        throw new Error("Inpaint precisa de mascara.");
      }
      if (mode === "inpaint-sketch") {
        throw new Error("Inpaint Sketch precisa de mascara + sketch. Stub preparado sem quebrar.");
      }
      payload.mask_image_data_url = maskImageDataUrl;
      payload.targetLayerId = sourceObject.layerId;
    }

    await this.ensureStableEnabled();
    const result = mode === "inpaint"
      ? await window.kitAPI?.inpaintStableDiffusionImage?.(payload)
      : await window.kitAPI?.img2imgStableDiffusionImage?.(payload);
    if (!result?.file) {
      throw new Error("Worker nao retornou arquivo de saida.");
    }

    const metadata = normalizeStableMetadata(result.metadata || {}, payload);
    const outputMode = options.outputMode || getStableOutputMode();
    const inserted = await this.insertGeneratedImage({
      file: result.file,
      metadata
    }, {
      ...options,
      outputMode,
      targetObject: sourceObject
    });

    if (mode === "inpaint") {
      recordStableDiffusionInpaint({
        ...metadata,
        file: result.file,
        output_file: result.file,
        targetLayerId: sourceObject.layerId,
        insertMode: outputMode === "replaceSelected" ? "replace" : outputMode === "variation" ? "variation" : "new-layer"
      });
    } else {
      recordStableDiffusionGeneration({
        ...metadata,
        file: result.file,
        output_file: result.file,
        mode
      });
    }

    scheduleAutosave();
    return {
      file: result.file,
      metadata,
      insertedLayerId: inserted?.layerId || null,
      sourceLayerId: sourceObject.layerId
    };
  }
};

async function waitForGlobalVideoJob(jobId, timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await window.kitAPI?.getGlobalVideoJobStatus?.({ jobId });
    const job = result?.job || null;
    if (!job) {
      throw new Error("Job global de video nao encontrado.");
    }
    if (job.status === "completed") {
      return job;
    }
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(job.error || `Job de video terminou com status ${job.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error("Tempo excedido aguardando o job global de video.");
}

function getCanvasVideoPrompt(options = {}) {
  const explicit = String(options.prompt || "").trim();
  if (explicit) {
    return explicit;
  }

  const defaultPrompt = options.startImage
    ? "Anime esta imagem com movimento suave e cinematografico."
    : "Crie um video curto para este artboard.";
  return String(window.prompt("Descreva o video que deseja gerar", defaultPrompt) || "").trim();
}

async function exportCanvasObjectToTempPng(object) {
  const dataUrl = await createObjectImageDataUrl(object);
  const baseDir = currentProjectFilePath && nodePath
    ? nodePath.join(nodePath.dirname(currentProjectFilePath), ".kit-temp")
    : nodePath?.resolve?.("temp", "canvas-video") || "";
  const filePath = nodePath
    ? nodePath.join(baseDir, `canvas-video-source-${Date.now()}.png`)
    : "";

  const result = await window.kitAPI?.saveCanvasImage?.({
    dataUrl,
    format: "png",
    extension: "png",
    filePath,
    name: "canvas-video-source"
  });
  return result?.filePath || "";
}

const CanvasVideoActions = {
  async generateVideo(options = {}) {
    if (!window.kitAPI?.generateGlobalVideo || !window.kitAPI?.getGlobalVideoJobStatus) {
      throw new Error("API global de video indisponivel no preload.");
    }

    const sourceObject = options.sourceLayerId || options.layerId || options.useSelectedLayer
      ? getStableSourceObject(options)
      : (options.fromSelection ? getStableSourceObject(options) : null);
    if ((options.fromSelection || options.useSelectedLayer || options.sourceLayerId || options.layerId) && !sourceObject) {
      throw new Error("Selecione uma camada de imagem valida para animar.");
    }
    const startImage = sourceObject ? await exportCanvasObjectToTempPng(sourceObject) : "";
    const prompt = getCanvasVideoPrompt({
      ...options,
      startImage
    });

    if (!prompt && !startImage) {
      throw new Error("Informe um prompt ou selecione uma imagem para animar.");
    }

    const outputDir = currentProjectFilePath && nodePath
      ? nodePath.join(nodePath.dirname(currentProjectFilePath), `${nodePath.parse(currentProjectFilePath).name}.assets`, "generated-video")
      : nodePath?.resolve?.("output", "canvas-video") || "";

    if (projectStatus) {
      projectStatus.textContent = "Enviando job global de video...";
    }

    const created = await window.kitAPI.generateGlobalVideo({
      sessionId: "canvas",
      source: "canvas",
      saveToCanvasContext: true,
      attachToCanvas: true,
      prompt,
      negativePrompt: String(options.negativePrompt || "").trim(),
      motionPrompt: String(options.motionPrompt || "").trim(),
      startImage,
      duration: Number(options.duration || 5),
      fps: Number(options.fps || 12),
      ratio: `${artboardWidth}:${artboardHeight}`,
      width: artboardWidth,
      height: artboardHeight,
      quality: options.quality || "standard",
      preset: options.preset || "standard",
      outputDir,
      references: startImage
        ? [{
          path: startImage,
          source: "canvas-layer",
          type: "image"
        }]
        : []
    });

    const finalJob = await waitForGlobalVideoJob(created?.job?.id || "");
    let inserted = null;
    if (finalJob?.output?.path && options.insertResult !== false) {
      inserted = await insertGeneratedVideoFromPath(finalJob.output.path, {
        duration: finalJob.output.duration || finalJob.output.metadata?.duration || 5,
        label: getFileName(finalJob.output.path)
      });
    }

    if (projectStatus) {
      projectStatus.textContent = finalJob?.output?.path
        ? `Video gerado no motor global: ${finalJob.output.path}`
        : "Video gerado no motor global.";
    }

    return {
      job: finalJob,
      insertedLayerId: inserted?.layerId || null,
      insertedTimelineItemId: inserted?.timelineItemId || null
    };
  }
};

registerCanvasAction("canvas.stable.ensureEnabled", (...args) => CanvasStableActions.ensureStableEnabled(...args));
registerCanvasAction("canvas.stable.txt2img", (...args) => CanvasStableActions.generateT2I(...args));
registerCanvasAction("canvas.stable.img2img", (...args) => CanvasStableActions.generateI2I({ ...(args?.[0] || {}), mode: "img2img" }));
registerCanvasAction("canvas.stable.inpaint", (...args) => CanvasStableActions.generateI2I({ ...(args?.[0] || {}), mode: "inpaint" }));
registerCanvasAction("canvas.stable.insertResult", (...args) => CanvasStableActions.insertGeneratedImage(...args));
registerCanvasAction("canvas.video.generate", (...args) => CanvasVideoActions.generateVideo(...args));

if (typeof window !== "undefined") {
  window.CanvasStableActions = CanvasStableActions;
  window.CanvasVideoActions = CanvasVideoActions;
  window.CanvasActionRegistry = {
    register: registerCanvasAction,
    get: getCanvasAction
  };
}

async function generateStableDiffusionImage() {
  const primaryMode = getSelectedStablePrimaryMode();
  const i2iMode = getSelectedStableI2ISubmode();

  try {
    if (sdGenerateButton) {
      sdGenerateButton.disabled = true;
    }
    if (primaryMode === "txt2img") {
      setStableDiffusionStatus("Gerando imagem T2I no worker local...");
      const result = await CanvasStableActions.generateT2I();
      setStableDiffusionStatus(`Imagem gerada e inserida: ${result.file}`);
      return result;
    }

    setStableDiffusionStatus(`Executando ${i2iMode} no worker local...`);
    const result = await CanvasStableActions.generateI2I({
      mode: i2iMode,
      outputMode: getStableOutputMode()
    });
    setStableDiffusionStatus(`Resultado ${i2iMode} inserido: ${result.file}`);
    return result;
  } catch (err) {
    setStableDiffusionStatus(`Erro SD: ${err.message || err}`);
    return null;
  } finally {
    if (sdGenerateButton) {
      sdGenerateButton.disabled = false;
    }
  }
}

async function generateStableDiffusionInpaint(options = {}) {
  try {
    if (sdGenerateButton) {
      sdGenerateButton.disabled = true;
    }
    setStableDiffusionStatus("Executando inpaint no worker local...");
    const result = await CanvasStableActions.generateI2I({
      mode: "inpaint",
      sourceLayerId: options.targetObject?.layerId || options.target?.layerId || options.target?.sourceLayerId,
      outputMode: options.insertMode === "replace" ? "replaceSelected" : getStableOutputMode()
    });
    setStableDiffusionStatus(`Inpaint inserido: ${result.file}`);
    return result;
  } catch (err) {
    setStableDiffusionStatus(`Erro inpaint: ${err.message || err}`);
    return null;
  } finally {
    if (sdGenerateButton) {
      sdGenerateButton.disabled = false;
    }
  }
}

async function generateStableDiffusionOutpaint(options = {}) {
  const payload = collectStableDiffusionPayload();
  const target = resolveOutpaintTarget(options);
  const side = options.side || sdOutpaintSide?.value || "auto";

  if (!payload.prompt) {
    setStableDiffusionStatus("Informe um prompt positivo antes de executar outpaint.");
    return null;
  }
  if (!payload.checkpoint) {
    setStableDiffusionStatus("Selecione um checkpoint local.");
    return null;
  }

  try {
    if (sdGenerateButton) {
      sdGenerateButton.disabled = true;
    }

    setStableDiffusionStatus("Preparando artboard expandido e mascara de outpaint...");
    const outpaintImages = await createOutpaintDataUrls(target, side);
    const requestPayload = {
      ...payload,
      mode: "outpaint",
      uiMode: "outpaint",
      width: target.width,
      height: target.height,
      base_image_data_url: outpaintImages.baseImageDataUrl,
      mask_image_data_url: outpaintImages.maskImageDataUrl,
      artboard: {
        width: target.width,
        height: target.height,
        preset: target.preset || "custom"
      },
      outpaint: {
        side,
        offset: outpaintImages.offset,
        originalFormat: {
          width: artboardWidth,
          height: artboardHeight,
          preset: currentArtboardPreset || "custom"
        },
        targetFormat: target
      }
    };

    setStableDiffusionStatus("Executando outpaint no worker local...");
    const result = await window.kitAPI?.outpaintStableDiffusionImage?.(requestPayload);
    if (!result?.file) {
      throw new Error("Worker nao retornou arquivo de saida.");
    }

    const metadata = {
      ...(result.metadata || {}),
      file: result.file,
      output_file: result.file,
      side,
      originalFormat: requestPayload.outpaint.originalFormat,
      targetFormat: target
    };
    await insertOutpaintResult(result.file, target, metadata);
    recordStableDiffusionOutpaint(metadata);
    scheduleAutosave();
    setStableDiffusionStatus(`Outpaint inserido: ${result.file}`);
    return {
      file: result.file,
      metadata
    };
  } catch (err) {
    setStableDiffusionStatus(`Erro outpaint: ${err.message || err}`);
    return null;
  } finally {
    if (sdGenerateButton) {
      sdGenerateButton.disabled = false;
    }
  }
}

function findCanvasObject(selector = {}) {
  const objects = getLayerObjects();
  if (selector.layerId || selector.id) {
    const id = String(selector.layerId || selector.id);
    return objects.find((object) => object.layerId === id) || null;
  }

  if (selector.name) {
    const name = String(selector.name).trim().toLowerCase();
    return objects.find((object) => makeObjectName(object).toLowerCase() === name) || null;
  }

  if (selector.index !== undefined) {
    const index = Number(selector.index);
    return Number.isInteger(index) ? objects[index] || null : null;
  }

  return canvas?.getActiveObject() && !canvas.getActiveObject().isArtboard
    ? canvas.getActiveObject()
    : null;
}

async function createCanvasProjectFromCommand(payload = {}) {
  const project = createLocalDefaultProject();
  project.name = String(payload.name || project.name).trim() || project.name;
  if (payload.preset && ARTBOARD_PRESETS[payload.preset]) {
    project.artboard = {
      ...project.artboard,
      width: ARTBOARD_PRESETS[payload.preset].width,
      height: ARTBOARD_PRESETS[payload.preset].height,
      preset: payload.preset
    };
  }

  if (payload.width || payload.height) {
    project.artboard = {
      ...project.artboard,
      width: clampArtboardDimension(payload.width || project.artboard.width),
      height: clampArtboardDimension(payload.height || project.artboard.height),
      preset: "custom"
    };
  }

  await applyProject(project, null, null);
  return makeCanvasCommandResult(true, "Projeto Canvas criado por comando.");
}

async function openCanvasProjectFromCommand(payload = {}) {
  const filePath = String(payload.filePath || payload.path || "").trim();
  if (!filePath) {
    return makeCanvasCommandResult(false, "Informe filePath para abrir um projeto .kia.");
  }

  const result = await window.kitAPI?.openCanvasProjectPath?.(filePath);
  if (!result?.project) {
    return makeCanvasCommandResult(false, "Projeto nao foi aberto.");
  }

  await applyProject(result.project, result.filePath || filePath, result.inheritedBrandKit || null);
  return makeCanvasCommandResult(true, "Projeto Canvas aberto por comando.");
}

async function saveCanvasProjectFromCommand(payload = {}) {
  const project = collectProjectFromCanvas();
  const result = await window.kitAPI?.saveCanvasProject?.({
    project,
    filePath: payload.filePath || payload.path || currentProjectFilePath
  });

  if (result?.project) {
    renderProject(result.project, result.filePath || currentProjectFilePath);
    renderProjectBrandKit(result.project, result.inheritedBrandKit || null);
    resetHistory(collectProjectFromCanvas({ appendHistory: false }), "command-save");
    scheduleAutosave();
    return makeCanvasCommandResult(true, "Projeto Canvas salvo por comando.", {
      filePath: result.filePath || currentProjectFilePath
    });
  }

  return makeCanvasCommandResult(false, "Salvamento cancelado ou sem destino.");
}

function insertTextFromCommand(payload = {}) {
  const text = String(payload.text || payload.content || "").trim();
  if (!text) {
    return makeCanvasCommandResult(false, "Texto vazio para inserir no Canvas.");
  }

  const Textbox = getFabricClass("Textbox");
  const object = new Textbox(text, {
    width: Math.min(620, Math.max(260, artboardWidth * 0.55)),
    fontFamily: payload.fontFamily || "Segoe UI",
    fontSize: Math.max(10, Number(payload.fontSize || 58)),
    fill: normalizeHexColor(payload.color || payload.fill || "#20232A", "#20232A"),
    textAlign: payload.textAlign || "center"
  });

  if (payload.x !== undefined || payload.y !== undefined) {
    const artboardRect = getArtboardRect();
    const artboardCenter = getRectCenter(artboardRect);
    object.set({
      left: Number(payload.x ?? artboardCenter.x),
      top: Number(payload.y ?? artboardCenter.y),
      originX: payload.originX || "center",
      originY: payload.originY || "center"
    });
    canvas.add(object);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    updateSelectionInfo();
  } else {
    centerNewObject(object);
  }
  addTimelineItem({
    type: "text",
    layerId: object.layerId,
    source: object.layerId,
    label: makeObjectName(object),
    duration: Number(payload.duration || 5),
    track: payload.track
  });

  return makeCanvasCommandResult(true, "Texto inserido no Canvas.", {
    layerId: object.layerId
  });
}

async function insertImageFromCommand(payload = {}) {
  const source = String(payload.url || payload.filePath || payload.path || "").trim();
  if (!source) {
    return makeCanvasCommandResult(false, "Informe path, filePath ou url da imagem.");
  }

  const imageUrl = toImageUrl(source, currentProjectFilePath || currentBrandKitFilePath || "");
  const image = await createFabricImageFromUrl(imageUrl);
  const maxSide = Math.min(640, Math.max(180, Math.min(artboardWidth, artboardHeight) * 0.55));
  const width = image.width || maxSide;
  const height = image.height || maxSide;
  const scale = Math.min(maxSide / width, maxSide / height, 1);
  image.set({
    scaleX: Number(payload.scale || scale),
    scaleY: Number(payload.scale || scale),
    name: payload.name || getFileName(source)
  });
  centerNewObject(image);
  addTimelineItem({
    type: "image",
    layerId: image.layerId,
    source,
    label: image.name || getFileName(source),
    duration: Number(payload.duration || 5),
    track: payload.track
  });
  return makeCanvasCommandResult(true, "Imagem inserida no Canvas.", {
    layerId: image.layerId
  });
}

function selectLayerFromCommand(payload = {}) {
  const object = findCanvasObject(payload);
  if (!object) {
    return makeCanvasCommandResult(false, "Objeto/layer nao encontrado.");
  }

  selectLayerObject(object);
  return makeCanvasCommandResult(true, "Objeto selecionado.", {
    layerId: object.layerId
  });
}

function alignLayerFromCommand(payload = {}) {
  const object = findCanvasObject(payload);
  if (!object) {
    return makeCanvasCommandResult(false, "Objeto/layer nao encontrado para alinhamento.");
  }

  const alignment = payload.alignment || payload.align || payload.position || "center";
  canvas.setActiveObject(object);
  alignObjectToArtboard(object, alignment);
  canvas.requestRenderAll();
  return makeCanvasCommandResult(true, "Objeto alinhado no Canvas.", {
    layerId: object.layerId,
    alignment
  });
}

function applyBrandColorFromCommand(payload = {}) {
  const color = payload.color || payload.hex || currentBrandKit?.colors?.[0]?.hex;
  if (!isValidHex(color)) {
    return makeCanvasCommandResult(false, "Cor HEX invalida ou indisponivel.");
  }

  const object = findCanvasObject(payload);
  if (object) {
    canvas.setActiveObject(object);
  }

  applyColorToSelection(color);
  markCanvasChanged("command-color");
  return makeCanvasCommandResult(true, "Cor aplicada ao objeto selecionado.", {
    color
  });
}

async function insertBrandLogoFromCommand(payload = {}) {
  const logos = currentBrandKit?.logos || [];
  const requested = String(payload.name || "").trim().toLowerCase();
  const logo = requested
    ? logos.find((item) => String(item.name || "").toLowerCase().includes(requested))
    : logos[0];

  if (!logo) {
    return makeCanvasCommandResult(false, "Nenhum logo disponivel no Brand Kit.");
  }

  await insertBrandImage(logo);
  return makeCanvasCommandResult(true, "Logo inserido no Canvas.");
}

async function exportImageFromCommand(payload = {}) {
  const format = ["png", "jpeg", "webp", "jpg"].includes(String(payload.format || "").toLowerCase())
    ? String(payload.format).toLowerCase().replace("jpg", "jpeg")
    : "png";
  const quality = clampValue(Number(payload.quality || 92), 10, 100) / 100;
  const time = payload.time !== undefined ? Number(payload.time) : timelinePlayhead;
  const dataUrl = await createArtboardImageDataUrl({
    format,
    quality
  }, { time });
  const result = await window.kitAPI?.saveCanvasImage?.({
    dataUrl,
    format,
    extension: format === "jpeg" ? "jpg" : format,
    quality,
    filePath: payload.filePath || payload.path || "",
    name: payload.name || projectNameInput?.value?.trim() || "canvas-artboard"
  });

  return makeCanvasCommandResult(Boolean(result?.filePath), result?.filePath ? "Imagem exportada por comando." : "Exportacao cancelada.", {
    filePath: result?.filePath || null
  });
}

async function handleCanvasOperationalCommand(action, payload = {}) {
  const registeredAction = getCanvasAction(action);
  if (registeredAction) {
    const data = await registeredAction(payload);
    return makeCanvasCommandResult(true, `Acao registrada executada: ${action}`, {
      action,
      data
    });
  }

  switch (action) {
    case "status":
    case "get-state":
      return makeCanvasCommandResult(true, "Estado atual do Canvas consultado.");
    case "list-artboard":
      return makeCanvasCommandResult(true, "Artboard atual consultado.", {
        artboard: getCanvasStateSummary().artboard
      });
    case "list-layers":
    case "list-objects":
      return makeCanvasCommandResult(true, "Layers consultados.", {
        layers: getCanvasStateSummary().layers
      });
    case "new-project":
    case "create-project":
      return createCanvasProjectFromCommand(payload);
    case "open-project":
      return openCanvasProjectFromCommand(payload);
    case "save-project":
      return saveCanvasProjectFromCommand(payload);
    case "timeline":
    case "timeline-slide":
      return handleTimelineCommand(payload);
    case "timeline-add":
    case "add-media-to-timeline":
    case "insert-timeline-item":
      return handleTimelineCommand({ ...payload, command: "add-item" });
    case "move-timeline-item":
      return handleTimelineCommand({ ...payload, command: "move" });
    case "cut-timeline-item":
      return handleTimelineCommand({ ...payload, command: "cut" });
    case "hide-timeline-item":
      return handleTimelineCommand({ ...payload, command: "hide" });
    case "show-timeline-item":
      return handleTimelineCommand({ ...payload, command: "show" });
    case "set-timeline-duration":
      return handleTimelineCommand({ ...payload, command: "duration" });
    case "set-timeline-volume":
      return handleTimelineCommand({ ...payload, command: "volume" });
    case "set-timeline-speed":
      return handleTimelineCommand({ ...payload, command: "speed" });
    case "play-timeline":
      return handleTimelineCommand({ ...payload, command: "play" });
    case "stop-timeline":
      return handleTimelineCommand({ ...payload, command: "stop" });
    case "next-timeline-marker":
      return handleTimelineCommand({ ...payload, command: "next-marker" });
    case "prev-timeline-marker":
      return handleTimelineCommand({ ...payload, command: "prev-marker" });
    case "add-slide":
    case "create-slide":
      return handleTimelineCommand({ ...payload, command: "add-slide" });
    case "duplicate-slide":
      return handleTimelineCommand({ ...payload, command: "duplicate-slide" });
    case "duplicate-timeline-item":
      return handleTimelineCommand({ ...payload, command: "duplicate-item" });
    case "remove-slide":
    case "delete-slide":
      return handleTimelineCommand({ ...payload, command: "remove" });
    case "select-slide":
      return handleTimelineCommand({ ...payload, command: "select" });
    case "set-slide-duration":
      return handleTimelineCommand({ ...payload, command: "duration" });
    case "insert-text":
      return insertTextFromCommand(payload);
    case "insert-image":
      return insertImageFromCommand(payload);
    case "select-layer":
    case "select-object":
      return selectLayerFromCommand(payload);
    case "align-layer":
    case "align-object":
    case "layout-align":
      return alignLayerFromCommand(payload);
    case "center-layer":
    case "center-object":
      return alignLayerFromCommand({ ...payload, alignment: "center" });
    case "center-artboard":
    case "center-viewport":
      centerArtboardInViewport();
      return makeCanvasCommandResult(true, "Lousa centralizada na tela.");
    case "apply-color":
    case "apply-brand-color":
      return applyBrandColorFromCommand(payload);
    case "insert-logo":
    case "apply-logo":
      return insertBrandLogoFromCommand(payload);
    case "export-image":
      return exportImageFromCommand(payload);
    case "generate-video":
    case "video-generate":
    case "canvas.video.generate":
      {
        const result = await CanvasVideoActions.generateVideo({
          ...payload,
          fromSelection: payload.fromSelection !== false
        });
        return makeCanvasCommandResult(Boolean(result?.job), result?.job ? "Video gerado pelo motor global e inserido no Canvas." : "Falha ao gerar video.", result || {});
      }
    case "sd-generate":
    case "stable-diffusion-generate":
    case "canvas.stable.txt2img":
      if (payload.prompt && sdPrompt) {
        sdPrompt.value = payload.prompt;
      }
      if (payload.negative_prompt && sdNegativePrompt) {
        sdNegativePrompt.value = payload.negative_prompt;
      }
      if (payload.checkpoint && sdCheckpoint) {
        sdCheckpoint.value = payload.checkpoint;
      }
      {
        CanvasStableActions.openStablePanel();
        CanvasStableActions.setStableMode("txt2img");
        const result = await CanvasStableActions.generateT2I(payload);
        return makeCanvasCommandResult(Boolean(result), result ? "Imagem SD gerada e inserida." : "Falha ao gerar imagem SD.", result || {});
      }
    case "sd-inpaint":
    case "stable-diffusion-inpaint":
    case "inpaint":
    case "canvas.stable.inpaint":
      if (payload.prompt && sdPrompt) {
        sdPrompt.value = payload.prompt;
      }
      if (payload.negative_prompt && sdNegativePrompt) {
        sdNegativePrompt.value = payload.negative_prompt;
      }
      if (payload.checkpoint && sdCheckpoint) {
        sdCheckpoint.value = payload.checkpoint;
      }
      if (payload.insertMode && sdInpaintInsertMode) {
        sdInpaintInsertMode.value = payload.insertMode === "replace" ? "replace" : "new-layer";
      }
      {
        CanvasStableActions.openStablePanel();
        CanvasStableActions.setStableMode("inpaint");
        const result = await CanvasStableActions.generateI2I({
          ...payload,
          mode: "inpaint",
          outputMode: payload.insertMode === "replace" ? "replaceSelected" : getStableOutputMode()
        });
        return makeCanvasCommandResult(Boolean(result), result ? "Inpaint gerado e inserido." : "Falha ao executar inpaint.", result || {});
      }
    case "canvas.stable.img2img":
      if (payload.prompt && sdPrompt) {
        sdPrompt.value = payload.prompt;
      }
      if (payload.negative_prompt && sdNegativePrompt) {
        sdNegativePrompt.value = payload.negative_prompt;
      }
      if (payload.checkpoint && sdCheckpoint) {
        sdCheckpoint.value = payload.checkpoint;
      }
      {
        CanvasStableActions.openStablePanel();
        CanvasStableActions.setStableMode(payload.mode || "img2img");
        const result = await CanvasStableActions.generateI2I({
          ...payload,
          mode: payload.mode || "img2img",
          outputMode: payload.outputMode || getStableOutputMode()
        });
        return makeCanvasCommandResult(Boolean(result), result ? "I2I gerado e inserido." : "Falha ao executar I2I.", result || {});
      }
    case "sd-outpaint":
    case "stable-diffusion-outpaint":
    case "outpaint":
      if (payload.prompt && sdPrompt) {
        sdPrompt.value = payload.prompt;
      }
      if (payload.negative_prompt && sdNegativePrompt) {
        sdNegativePrompt.value = payload.negative_prompt;
      }
      if (payload.checkpoint && sdCheckpoint) {
        sdCheckpoint.value = payload.checkpoint;
      }
      if (payload.targetPreset && sdOutpaintTarget) {
        sdOutpaintTarget.value = OUTPAINT_TARGETS[payload.targetPreset] ? payload.targetPreset : sdOutpaintTarget.value;
      }
      if (payload.side && sdOutpaintSide) {
        sdOutpaintSide.value = ["auto", "left", "right", "top", "bottom"].includes(payload.side)
          ? payload.side
          : "auto";
      }
      {
        const result = await generateStableDiffusionOutpaint({
          targetPreset: payload.targetPreset || payload.target || sdOutpaintTarget?.value,
          side: payload.side || sdOutpaintSide?.value || "auto"
        });
        return makeCanvasCommandResult(Boolean(result), result ? "Outpaint gerado e inserido." : "Falha ao executar outpaint.", result || {});
      }
    default:
      return makeCanvasCommandResult(false, `Acao de Canvas desconhecida: ${action}`);
  }
}

function centerNewObject(object) {
  centerOnCanvas(object);
  canvas.add(object);
  object.setCoords();
  canvas.setActiveObject(object);
  canvas.requestRenderAll();
  updateSelectionInfo();
}

function centerOnCanvas(object) {
  if (!object) {
    return null;
  }

  return centerObjectInRect(object, getArtboardRect());
}

function getObjectScaledBounds(object) {
  const bounds = object?.getBoundingRect?.();
  if (bounds?.width && bounds?.height) {
    return bounds;
  }

  return {
    width: Number(object?.getScaledWidth?.() || object?.width || 0),
    height: Number(object?.getScaledHeight?.() || object?.height || 0)
  };
}

function alignObjectToArtboard(object, alignment = "center") {
  if (!object || object.isArtboard) {
    return null;
  }

  const mode = normalizeAlignment(alignment);
  if (mode === "fill-width") {
    const bounds = getObjectScaledBounds(object);
    object.set({
      scaleX: artboardWidth / Math.max(1, Number(object.width || bounds.width || 1))
    });
    alignObjectInRect(object, getArtboardRect(), "center-h");
  } else {
    alignObjectInRect(object, getArtboardRect(), mode);
  }

  object.setCoords();
  canvas?.requestRenderAll();
  updateSelectionInfo();
  markCanvasChanged("align");
  return object;
}

function getEditableVectorPoints(object) {
  if (!object) {
    return [];
  }

  if ((object.type === "polygon" || object.type === "polyline") && Array.isArray(object.points)) {
    return object.points.map((point, index) => ({ index, x: point.x, y: point.y, kind: "point" }));
  }

  if (object.type === "rect") {
    const width = Number(object.width || 0);
    const height = Number(object.height || 0);
    return [
      { index: 0, x: -width / 2, y: -height / 2, kind: "rect-corner" },
      { index: 1, x: width / 2, y: -height / 2, kind: "rect-corner" },
      { index: 2, x: width / 2, y: height / 2, kind: "rect-corner" },
      { index: 3, x: -width / 2, y: height / 2, kind: "rect-corner" }
    ];
  }

  if (object.type === "ellipse" || object.type === "circle") {
    const rx = Number(object.rx || object.radius || object.width / 2 || 0);
    const ry = Number(object.ry || object.radius || object.height / 2 || 0);
    return [
      { index: 0, x: -rx, y: 0, kind: "ellipse-point" },
      { index: 1, x: 0, y: -ry, kind: "ellipse-point" },
      { index: 2, x: rx, y: 0, kind: "ellipse-point" },
      { index: 3, x: 0, y: ry, kind: "ellipse-point" }
    ];
  }

  return [];
}

function localVectorPointToScene(object, point) {
  const Point = getFabricClass("Point");
  const transformPoint = fabricApi?.util?.transformPoint || fabricApi?.transformPoint;
  return transformPoint(new Point(point.x, point.y), object.calcTransformMatrix());
}

function scenePointToObjectLocal(object, point) {
  const Point = getFabricClass("Point");
  const invertTransform = fabricApi?.util?.invertTransform || fabricApi?.invertTransform;
  const transformPoint = fabricApi?.util?.transformPoint || fabricApi?.transformPoint;
  return transformPoint(new Point(point.x, point.y), invertTransform(object.calcTransformMatrix()));
}

function drawVectorEditHandles(object) {
  clearVectorEditOverlays();
  const Circle = getFabricClass("Circle");
  if (!Circle || !object) {
    return;
  }

  const points = getEditableVectorPoints(object);
  points.forEach((point) => {
    const scene = localVectorPointToScene(object, point);
    const handle = new Circle({
      left: scene.x - 5,
      top: scene.y - 5,
      radius: 5,
      fill: "#F2B84B",
      stroke: "#20232A",
      strokeWidth: 1,
      selectable: false,
      evented: false,
      isToolOverlay: true,
      vectorRole: "edit-handle"
    });
    handle.vectorPointIndex = point.index;
    handle.vectorPointKind = point.kind;
    canvas.add(handle);
  });
  canvas.requestRenderAll();
}

function getNearestVectorPoint(object, scenePoint, maxDistance = 14) {
  const points = getEditableVectorPoints(object);
  let best = null;
  points.forEach((point) => {
    const scene = localVectorPointToScene(object, point);
    const distance = distanceBetweenPoints(scene, scenePoint);
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { ...point, scene, distance };
    }
  });
  return best;
}

function clearVectorEditOverlays() {
  canvas?.getObjects()
    .filter((object) => object.isToolOverlay && object.vectorRole === "edit-handle")
    .forEach((object) => canvas.remove(object));
  activeVectorEdit = null;
}

function startVectorPointEdit(event) {
  const point = getScenePoint(event);
  if (!point || !canvas) {
    return;
  }

  const target = event.target && !event.target.isToolOverlay ? event.target : getCanvasObjectAtScenePoint(point);
  const object = target && !target.isArtboard ? target : getActiveEditableObject();
  if (!object) {
    showToolNotice("Clique em uma forma vetorial para editar pontos.");
    return;
  }

  canvas.setActiveObject(object);
  drawVectorEditHandles(object);
  const nearest = getNearestVectorPoint(object, point);
  if (!nearest) {
    showToolNotice("Pontos exibidos. Arraste um no para editar.");
    return;
  }

  activeVectorEdit = { object, point: nearest };
  event.e?.preventDefault?.();
}

function moveVectorPointEdit(event) {
  if (!activeVectorEdit) {
    return;
  }

  const scenePoint = getScenePoint(event);
  if (!scenePoint) {
    return;
  }

  const { object, point } = activeVectorEdit;
  const local = scenePointToObjectLocal(object, scenePoint);
  if (Array.isArray(object.points) && object.points[point.index]) {
    object.points[point.index].x = local.x;
    object.points[point.index].y = local.y;
    object.dirty = true;
  } else if (object.type === "rect") {
    const width = Math.max(1, Math.abs(local.x) * 2);
    const height = Math.max(1, Math.abs(local.y) * 2);
    object.set({ width, height });
  } else if (object.type === "circle") {
    object.set({ radius: Math.max(1, Math.hypot(local.x, local.y)) });
  } else if (object.type === "ellipse") {
    object.set({ rx: Math.max(1, Math.abs(local.x)), ry: Math.max(1, Math.abs(local.y)) });
  }

  object.setCoords();
  drawVectorEditHandles(object);
  activeVectorEdit = { object, point };
  markCanvasChanged("vector-point");
}

function finishVectorPointEdit() {
  if (activeVectorEdit?.object) {
    activeVectorEdit.object.setCoords();
    canvas?.requestRenderAll();
  }
  activeVectorEdit = null;
}

function alignSelection(alignment = "center") {
  const object = getActiveEditableObject();
  if (!object) {
    return false;
  }

  alignObjectToArtboard(object, alignment);
  return true;
}

function addRect() {
  const Rect = getFabricClass("Rect");
  centerNewObject(new Rect({
    width: 320,
    height: 220,
    fill: "#2f6fbe",
    stroke: "#1f4f8f",
    strokeWidth: 4,
    rx: 0,
    ry: 0
  }));
}

function addRoundedRect() {
  const Rect = getFabricClass("Rect");
  centerNewObject(new Rect({
    width: 320,
    height: 220,
    fill: "#2f6fbe",
    stroke: "#1f4f8f",
    strokeWidth: 4,
    rx: 28,
    ry: 28
  }));
}

function addCircle() {
  const Circle = getFabricClass("Circle");
  centerNewObject(new Circle({
    radius: 140,
    fill: "#f2b84b",
    stroke: "#9b6b18",
    strokeWidth: 4
  }));
}

function addText() {
  const Textbox = getFabricClass("Textbox");
  const object = new Textbox("Texto editavel", {
    width: 420,
    fontFamily: "Segoe UI",
    fontSize: 64,
    fill: "#20232a",
    textAlign: "center"
  });
  centerNewObject(object);
  addTimelineItem({
    type: "text",
    layerId: object.layerId,
    source: object.layerId,
    label: makeObjectName(object),
    duration: 5
  });
}

function createFabricImageFromUrl(url) {
  const FabricImage = getFabricClass("FabricImage") || getFabricClass("Image");

  if (FabricImage?.fromURL) {
    const result = FabricImage.fromURL(url);
    if (result?.then) {
      return result;
    }

    return new Promise((resolve) => {
      FabricImage.fromURL(url, (image) => resolve(image));
    });
  }

  return Promise.reject(new Error("FabricImage.fromURL indisponivel"));
}

function createVideoPreviewDataUrl(file, seekTime = 0) {
  if (!file || typeof URL === "undefined") {
    return Promise.resolve({ dataUrl: "", width: 1280, height: 720, duration: 5 });
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const cleanup = () => {
      video.pause?.();
      video.removeAttribute("src");
      video.load?.();
      URL.revokeObjectURL(objectUrl);
    };

    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(payload);
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    video.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("Nao foi possivel carregar preview do video."));
    };

    const captureFrame = () => {
      const duration = Math.max(0.5, Number(video.duration || 5));
      const canvasElement = document.createElement("canvas");
      const width = Math.max(1, Number(video.videoWidth || 1280));
      const height = Math.max(1, Number(video.videoHeight || 720));
      canvasElement.width = width;
      canvasElement.height = height;
      canvasElement.getContext("2d")?.drawImage(video, 0, 0, width, height);
      finish({
        dataUrl: canvasElement.toDataURL("image/png"),
        width,
        height,
        duration
      });
    };

    video.onloadedmetadata = () => {
      const duration = Math.max(0.5, Number(video.duration || 5));
      const targetTime = Math.max(0, Math.min(seekTime, Math.max(0, duration - 0.05)));
      if (Number.isFinite(targetTime) && Math.abs(Number(video.currentTime || 0) - targetTime) > 0.01) {
        try {
          video.currentTime = targetTime;
          return;
        } catch {
          // Fall through to capture current frame.
        }
      }
      captureFrame();
    };

    video.onseeked = () => {
      if (!settled) {
        captureFrame();
      }
    };

    video.src = objectUrl;
  });
}

function createVideoPreviewDataUrlFromSource(source = "", seekTime = 0) {
  if (!source) {
    return Promise.resolve({ dataUrl: "", width: 1280, height: 720, duration: 5 });
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;

    const cleanup = () => {
      video.pause?.();
      video.removeAttribute("src");
      video.load?.();
    };

    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(payload);
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    video.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("Nao foi possivel carregar preview do video gerado."));
    };

    const captureFrame = () => {
      const duration = Math.max(0.5, Number(video.duration || 5));
      const canvasElement = document.createElement("canvas");
      const width = Math.max(1, Number(video.videoWidth || 1280));
      const height = Math.max(1, Number(video.videoHeight || 720));
      canvasElement.width = width;
      canvasElement.height = height;
      canvasElement.getContext("2d")?.drawImage(video, 0, 0, width, height);
      finish({
        dataUrl: canvasElement.toDataURL("image/png"),
        width,
        height,
        duration
      });
    };

    video.onloadedmetadata = () => {
      const duration = Math.max(0.5, Number(video.duration || 5));
      const targetTime = Math.max(0, Math.min(seekTime, Math.max(0, duration - 0.05)));
      if (Number.isFinite(targetTime) && Math.abs(Number(video.currentTime || 0) - targetTime) > 0.01) {
        try {
          video.currentTime = targetTime;
          return;
        } catch {
          // fall through
        }
      }
      captureFrame();
    };

    video.onseeked = () => {
      if (!settled) {
        captureFrame();
      }
    };

    video.src = resolveMediaSourceUrl(source);
  });
}

async function addVideoFile(file) {
  if (!file || !canvas) {
    return null;
  }

  const preview = await createVideoPreviewDataUrl(file, 0);
  const image = await createFabricImageFromUrl(preview.dataUrl);
  const maxSide = 520;
  const width = preview.width || image.width || maxSide;
  const height = preview.height || image.height || maxSide;
  const scale = Math.min(maxSide / width, maxSide / height, 1);
  image.set({
    scaleX: scale,
    scaleY: scale,
    name: file.name || "Video",
    layerName: file.name || "Video",
    layerKind: "video",
    mediaType: "video",
    mediaSourceSrc: file.path || file.name || "",
    mediaDuration: preview.duration || 5,
    rasterSourceSrc: preview.dataUrl
  });
  centerNewObject(image);
  const timelineItem = addTimelineItem({
    type: "video",
    layerId: image.layerId,
    source: file.path || file.name || image.layerId,
    label: file.name || makeObjectName(image),
    duration: preview.duration || 5
  });
  image.timelineItemId = timelineItem?.id || null;
  const waveform = await generateWaveformFromFile(file).catch(() => null);
  if (timelineItem && waveform) {
    updateTimelineItem(timelineItem, { waveform });
  }
  primeVideoLayer(image);
  return image;
}

async function insertGeneratedVideoFromPath(filePath, metadata = {}) {
  if (!filePath || !canvas) {
    return null;
  }

  const preview = await createVideoPreviewDataUrlFromSource(filePath, 0);
  const image = await createFabricImageFromUrl(preview.dataUrl);
  const maxSide = 520;
  const width = preview.width || image.width || maxSide;
  const height = preview.height || image.height || maxSide;
  const scale = Math.min(maxSide / width, maxSide / height, 1);
  image.set({
    scaleX: scale,
    scaleY: scale,
    name: metadata.label || getFileName(filePath) || "Video gerado",
    layerName: metadata.label || getFileName(filePath) || "Video gerado",
    layerKind: "video",
    mediaType: "video",
    mediaSourceSrc: filePath,
    mediaDuration: Number(metadata.duration || preview.duration || 5),
    rasterSourceSrc: preview.dataUrl
  });
  centerNewObject(image);
  const timelineItem = addTimelineItem({
    type: "video",
    layerId: image.layerId,
    source: filePath,
    label: image.name || getFileName(filePath) || "Video gerado",
    duration: Number(metadata.duration || preview.duration || 5)
  });
  image.timelineItemId = timelineItem?.id || null;
  primeVideoLayer(image);
  markCanvasChanged("video-generation");
  scheduleAutosave();
  return {
    layerId: image.layerId,
    timelineItemId: image.timelineItemId
  };
}

async function addImageFile(file) {
  if (!file || !canvas) {
    return;
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const image = await createFabricImageFromUrl(dataUrl);
  const maxSide = 520;
  const width = image.width || maxSide;
  const height = image.height || maxSide;
  const scale = Math.min(maxSide / width, maxSide / height, 1);
  image.set({
    scaleX: scale,
    scaleY: scale,
    name: file.name || "Imagem"
  });
  centerNewObject(image);
  addTimelineItem({
    type: "image",
    layerId: image.layerId,
    source: file.path || file.name || image.layerId,
    label: file.name || makeObjectName(image),
    duration: 5
  });
}

function getMediaFileKind(file) {
  const mime = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  if (/\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name)) {
    return "image";
  }
  if (/\.(mp4|webm|mov|mkv|avi)$/i.test(name)) {
    return "video";
  }
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)) {
    return "audio";
  }
  return "unknown";
}

function loadMediaDurationFromFile(file) {
  const kind = getMediaFileKind(file);
  if (!file || !["audio", "video"].includes(kind) || typeof URL === "undefined") {
    return Promise.resolve(5);
  }

  return new Promise((resolve) => {
    const element = document.createElement(kind === "video" ? "video" : "audio");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (duration = 5) => {
      if (settled) {
        return;
      }
      settled = true;
      element.removeAttribute("src");
      element.load?.();
      URL.revokeObjectURL(objectUrl);
      resolve(Math.max(0.5, Number.isFinite(duration) ? duration : 5));
    };

    element.preload = "metadata";
    element.onloadedmetadata = () => finish(Number(element.duration || 5));
    element.onerror = () => finish(5);
    element.src = objectUrl;
  });
}

async function addTimelineMediaFile(file) {
  if (!file) {
    return;
  }

  const kind = getMediaFileKind(file);
  if (!["audio", "video"].includes(kind)) {
    showToolNotice("Formato de midia ainda nao suportado.");
    return;
  }

  const duration = await loadMediaDurationFromFile(file);
  const item = addTimelineItem({
    type: kind,
    source: file.path || file.name || "",
    label: file.name || makeTimelineItemLabel(kind, file.path || file.name || ""),
    duration
  });
  const waveform = await generateWaveformFromFile(file).catch(() => null);
  if (item && waveform) {
    updateTimelineItem(item, { waveform });
  }

  if (timelinePlayhead < item.startTime) {
    timelinePlayhead = item.startTime;
  }
  renderTimeline();
  if (projectStatus) {
    projectStatus.textContent = `${kind === "video" ? "Video" : "Audio"} inserido na timeline`;
  }
}

async function addMediaFile(file) {
  if (!file || !canvas) {
    return;
  }

  const kind = getMediaFileKind(file);
  if (kind === "image") {
    await addImageFile(file);
    return;
  }

  if (kind === "video") {
    await addVideoFile(file);
    return;
  }

  if (kind === "audio") {
    await addTimelineMediaFile(file);
    return;
  }

  showToolNotice("Selecione um arquivo de imagem, audio ou video suportado.");
}

function handleWheel(event) {
  if (!canvas) {
    return;
  }

  event.e.preventDefault();
  event.e.stopPropagation();

  const Point = getFabricClass("Point");
  const delta = event.e.deltaY;
  let zoom = canvas.getZoom();
  zoom *= 0.999 ** delta;
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  canvas.zoomToPoint(new Point(event.e.offsetX, event.e.offsetY), zoom);
  syncZoomLabel();
  updateRasterCursorOverlay();
}

function shouldStartPan(event) {
  const nativeEvent = event.e;
  return nativeEvent.button === 1 || nativeEvent.altKey || spacePressed;
}

function startPan(event) {
  isPanning = true;
  lastPanPoint = {
    x: event.e.clientX,
    y: event.e.clientY
  };
  canvas.selection = false;
  board?.classList.add("is-panning");
}

function movePan(event) {
  if (!isPanning || !lastPanPoint) {
    return;
  }

  const viewport = canvas.viewportTransform;
  viewport[4] += event.e.clientX - lastPanPoint.x;
  viewport[5] += event.e.clientY - lastPanPoint.y;
  canvas.requestRenderAll();
  lastPanPoint = {
    x: event.e.clientX,
    y: event.e.clientY
  };
}

function stopPan() {
  if (!isPanning) {
    return;
  }

  isPanning = false;
  lastPanPoint = null;
  canvas.selection = true;
  board?.classList.remove("is-panning");
}

function initFabricCanvas() {
  if (!fabricApi) {
    throw new Error("Fabric.js nao foi carregado.");
  }

  configureFabricCustomProperties();
  const Canvas = getFabricClass("Canvas");
  const viewport = getViewportSize();
  canvas = new Canvas("kitFabricCanvas", {
    width: viewport.width,
    height: viewport.height,
    backgroundColor: "transparent",
    preserveObjectStacking: true,
    selection: true
  });
  addArtboardObject();

  canvas.on("mouse:wheel", handleWheel);
  canvas.on("mouse:down", (event) => {
    if (shouldStartPan(event)) {
      event.e.preventDefault();
      startPan(event);
      return;
    }

    const handler = getToolHandler(activeTool);
    if (handler?.onPointerDown) {
      const result = handler.onPointerDown(event);
      if (result?.then) {
        void result;
      }
    }
  });
  canvas.on("mouse:move", (event) => {
    if (shouldShowRasterCursor(activeTool)) {
      setRasterCursorPositionFromEvent(event.e);
    }
    getToolHandler(activeTool)?.onPointerMove?.(event);
    movePan(event);
  });
  canvas.on("mouse:up", (event) => {
    getToolHandler(activeTool)?.onPointerUp?.(event);
    stopPan();
  });
  canvas.on("path:created", handlePathCreated);
  canvas.on("selection:created", (event) => {
    updateSelectionInfo();
    selectTimelineItemForCanvasObject(event.selected?.[0] || event.target);
  });
  canvas.on("selection:updated", (event) => {
    updateSelectionInfo();
    selectTimelineItemForCanvasObject(event.selected?.[0] || event.target);
  });
  canvas.on("selection:cleared", updateSelectionInfo);
  canvas.on("object:added", (event) => {
    if (event.target?.isToolOverlay) {
      return;
    }
    ensureLayerMetadata(event.target, getLayerObjects().length - 1);
    normalizeMaskRelationships();
    if (!isLoadingFabricObjects && !isMaskLayerObject(event.target)) {
      ensureTimelineItemForCanvasObject(event.target);
    }
    updateLayers();
    if (!isLoadingFabricObjects) {
      renderTimeline();
    }
    if (!isLoadingFabricObjects && event.target && !event.target.isArtboard) {
      markCanvasChanged("object-added");
    }
  });
  canvas.on("object:removed", (event) => {
    if (event.target?.isToolOverlay) {
      return;
    }
    cleanupMediaForItemOrObject(event.target);
    if (!isLoadingFabricObjects && event.target?.layerId && !isMaskLayerObject(event.target)) {
      timelineItems = timelineItems.filter((item) => item.layerId !== event.target.layerId);
      if (!timelineItems.some((item) => item.id === selectedTimelineItemId)) {
        selectedTimelineItemId = null;
      }
      reflowTimelineTracks();
      renderTimeline();
    }
    updateLayers();
    if (!isLoadingFabricObjects && event.target && !event.target.isArtboard) {
      markCanvasChanged("object-removed");
    }
  });
  canvas.on("object:skewing", updateSelectionInfo);
  canvas.on("object:modified", () => {
    const activeObject = getActiveEditableObject();
    if (activeObject) {
      const parentObject = getPrimaryLayerObject(activeObject);
      const maskObject = parentObject ? getMaskLayerForObject(parentObject) : null;
      if (parentObject && maskObject) {
        syncMaskObjectTransform(maskObject, parentObject);
        void refreshLayerMaskComposite(parentObject);
      }
    }
    updateSelectionInfo();
    markCanvasChanged("object-modified");
  });
  canvas.on("object:stacking", () => {
    syncLayerOrderWithTimeline();
    updateSelectionInfo();
    markCanvasChanged("layer");
  });
  ["object:moving", "object:scaling", "object:rotating"].forEach((eventName) => {
    canvas.on(eventName, (event) => {
      const parentObject = getPrimaryLayerObject(event.target);
      const maskObject = parentObject ? getMaskLayerForObject(parentObject) : null;
      if (parentObject && maskObject) {
        syncMaskObjectTransform(maskObject, parentObject);
      }
      updateSelectionInfo();
    });
  });
  canvas.upperCanvasEl?.addEventListener("mouseleave", () => {
    hideRasterCursorOverlay();
  });
  canvas.upperCanvasEl?.addEventListener("mouseenter", (event) => {
    if (shouldShowRasterCursor(activeTool)) {
      setRasterCursorPositionFromEvent(event);
    }
  });

  syncZoomLabel();
  syncArtboardLabel();
  configureDrawingMode();
  fitArtboardInViewport();
  syncMaskPreviewButton();
  syncBrushContextUi();
  updateSelectionInfo();
  syncRasterCursorMode();
}

function applyToolbarItemSettings(item = {}) {
  const settings = item.settings || {};

  if (settings.brushMode && brushMode) {
    brushMode.value = settings.brushMode;
  }

  if (settings.hardness && brushHardness) {
    brushHardness.value = String(settings.hardness);
  }

  syncBrushLabels();
}

function executeToolbarAction(action, item = {}) {
  switch (action) {
    case "add-rect":
      addRect();
      break;
    case "add-rounded-rect":
      addRoundedRect();
      break;
    case "add-circle":
      addCircle();
      break;
    case "add-text":
      addText();
      break;
    case "add-image":
      openMediaPanel();
      break;
    case "color-picker":
      toggleColorPanel();
      break;
    case "focus-brand-kit":
      brandKitName?.focus();
      updateAutosaveStatus("Kit do cliente aberto no painel lateral.");
      break;
    case "open-sticks":
      openStickersPanel();
      updateAutosaveStatus("Stiks preparado para integrar biblioteca de adesivos.");
      break;
    default:
      if (action) {
        updateAutosaveStatus(`Acao da toolbar ainda nao implementada: ${action}`);
      }
      break;
  }
}

function handleToolbarClick(event) {
  const button = event.target.closest(".tool-button");
  if (!button || button.disabled) {
    return;
  }

  if (button.classList.contains("is-group") && !button.dataset.tool && !button.dataset.action) {
    const group = button.closest(".toolbar-group");
    group?.classList.toggle("is-open");
    const submenu = group?.dataset.submenuId ? document.getElementById(group.dataset.submenuId) : null;
    submenu?.classList.toggle("is-open", Boolean(group?.classList.contains("is-open")));
    if (group?.classList.contains("is-open")) {
      positionToolbarSubmenu(group);
    }
    return;
  }

  const item = button.dataset.action
    ? getToolbarActionItem(button.dataset.action)
    : getToolbarItemByTool(button.dataset.tool) || getToolbarItemByTool(button.dataset.toolbarId);
  if (!item) {
    console.error(`Item desconhecido na ToolBox: ${button.dataset.tool || button.dataset.toolbarId || "sem-id"}`);
    showToolNotice("Item desconhecido na ToolBox.");
    return;
  }

  applyToolbarItemSettings(item);

  if (item.mouseTool) {
    setActiveTool(item.mouseTool, item.label);
  }

  if (item.action) {
    executeToolbarAction(item.action, item);
  }
}

function initMovableToolbar() {
  if (!toolbarHost) {
    return;
  }

  toolbarHost.addEventListener("pointerdown", (event) => {
    const dragHandle = event.target.closest(".toolbar-drag-handle");
    const resizeHandle = event.target.closest(".toolbar-resize-handle");
    if (!dragHandle && !resizeHandle) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const startState = clampToolbarState(loadToolbarState());
    const startX = event.clientX;
    const startY = event.clientY;
    const mode = resizeHandle ? "resize" : "drag";
    toolbarHost.setPointerCapture?.(event.pointerId);
    toolbarHost.classList.add(mode === "resize" ? "is-resizing" : "is-dragging");

    const onMove = (moveEvent) => {
      if (mode === "resize") {
        const nextState = clampToolbarState({
          ...startState,
          height: startState.height + (moveEvent.clientY - startY)
        });
        applyToolbarState(nextState);
        saveToolbarState(nextState);
        renderToolbar();
        syncToolbarActiveState();
        return;
      }

      const bounds = getToolbarMovementBounds();
      const rawX = startState.x + (moveEvent.clientX - startX);
      const rawY = startState.y + (moveEvent.clientY - startY);
      const snapDistance = 18;
      const anchor = rawX <= bounds.left + snapDistance
        ? "left"
        : rawX >= bounds.right - 44 - snapDistance
          ? "right"
          : null;
      const nextState = clampToolbarState({
        ...startState,
        x: rawX,
        y: rawY,
        anchor
      });
      applyToolbarState(nextState);
      saveToolbarState(nextState);
    };

    const onUp = (upEvent) => {
      toolbarHost.classList.remove("is-dragging", "is-resizing");
      toolbarHost.releasePointerCapture?.(upEvent.pointerId);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      renderToolbar();
      syncToolbarActiveState();
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  });
}

renderToolbar();
syncToolbarActiveState();
toolbarHost?.addEventListener("click", handleToolbarClick);
initMovableToolbar();

document.querySelector('[data-action="apply-custom-size"]')?.addEventListener("click", () => {
  applyArtboardSize(customWidthInput?.value, customHeightInput?.value);
});

inspectorAccordionToggles.forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const section = toggle.dataset.inspectorToggle;
    const accordion = toggle.closest(".inspector-accordion");
    const shouldOpen = !accordion?.classList.contains("is-open");
    if (section) {
      setInspectorAccordionOpen(section, shouldOpen);
    }
  });
});

menuTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleTopbarMenu(trigger.dataset.menuTrigger);
  });
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest(".menu-group")) {
    closeTopbarMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTopbarMenus();
  }
});

document.querySelectorAll('[data-project-action="new"]').forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenus();
    void createCanvasProject();
  });
});
document.querySelectorAll('[data-project-action="open"]').forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenus();
    void openCanvasProject();
  });
});
document.querySelectorAll('[data-project-action="save"]').forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenus();
    void saveCanvasProject();
  });
});
document.querySelectorAll('[data-app-action="widget"]').forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenus();
    window.kitAPI?.openWidget?.();
  });
});
document.querySelectorAll('[data-app-action="chat"]').forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenus();
    window.kitAPI?.openChat?.();
  });
});
document.querySelectorAll('[data-history-action="undo"]').forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenus();
    void undoCanvasChange();
  });
});
document.querySelectorAll('[data-history-action="redo"]').forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenus();
    void redoCanvasChange();
  });
});
document.querySelectorAll('[data-export-action="topbar-image"]').forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenus();
    void exportArtboardImage();
  });
});
document.querySelectorAll('[data-export-action="carousel-images"]').forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenus();
    void exportCarouselSlidesAsImages();
  });
});
document.querySelectorAll('[data-export-action="carousel-video"]').forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenus();
    void exportCarouselSlidesAsVideos();
  });
});
document.querySelectorAll('[data-view-action="fit-artboard"]').forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenus();
    fitArtboardInViewport();
  });
});
document.querySelectorAll('[data-view-action="center-artboard"]').forEach((element) => {
  element.addEventListener("click", () => {
    closeTopbarMenus();
    centerArtboardInViewport();
  });
});

document.querySelector('[data-brand-action="new"]')?.addEventListener("click", () => {
  void createBrandKit();
});
document.querySelector('[data-brand-action="open"]')?.addEventListener("click", () => {
  void openBrandKit();
});
document.querySelector('[data-brand-action="save"]')?.addEventListener("click", () => {
  void saveBrandKit();
});
document.querySelector('[data-brand-action="add-logo"]')?.addEventListener("click", () => {
  void selectBrandKitFiles("logo", "logos");
});
document.querySelector('[data-brand-action="add-font"]')?.addEventListener("click", () => {
  void selectBrandKitFiles("font", "fonts");
});
document.querySelector('[data-brand-action="add-asset"]')?.addEventListener("click", () => {
  void selectBrandKitFiles("asset", "assets.global");
});
document.querySelector('[data-brand-action="select-xtts-model"]')?.addEventListener("click", async () => {
  const files = await window.kitAPI?.selectBrandKitFiles?.({ kind: "xtts" });
  if (files?.[0] && brandXttsModel) {
    brandXttsModel.value = files[0].path;
    currentBrandKit = collectBrandKitFromForm();
  }
});
document.querySelector('[data-brand-action="select-xtts-speaker"]')?.addEventListener("click", async () => {
  const files = await window.kitAPI?.selectBrandKitFiles?.({ kind: "xtts" });
  if (files?.[0] && brandXttsSpeaker) {
    brandXttsSpeaker.value = files[0].path;
    currentBrandKit = collectBrandKitFromForm();
  }
});

function bindNumericPropertyInput(input, callback) {
  input?.addEventListener("change", callback);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
      callback();
    }
  });
}

bindNumericPropertyInput(propX, () => applyGeometryProperty("left"));
bindNumericPropertyInput(propY, () => applyGeometryProperty("top"));
bindNumericPropertyInput(propW, () => applyGeometryProperty("width"));
bindNumericPropertyInput(propH, () => applyGeometryProperty("height"));
bindNumericPropertyInput(propAngle, () => applyGeometryProperty("angle"));
bindNumericPropertyInput(propOpacity, applyOpacityProperty);
bindNumericPropertyInput(propSpeed, applyTimelineSpeedProperty);
bindNumericPropertyInput(propStrokeWidth, applyStrokeWidthProperty);
propFill?.addEventListener("input", applyFillProperty);
propStroke?.addEventListener("input", applyStrokeProperty);
propFontFamily?.addEventListener("change", () => {
  void applyTextProperty("fontFamily");
});
bindNumericPropertyInput(propFontSize, () => {
  void applyTextProperty("fontSize");
});
propTextAlign?.addEventListener("change", () => {
  void applyTextProperty("textAlign");
});

function handleBrushControlChange() {
  if (brushColor && isValidHex(brushColor.value)) {
    editorColors.primary = normalizeHexColor(brushColor.value, editorColors.primary);
  }
  syncBrushLabels();
  syncColorToolButton();
  configureBrush();
}

[brushMode, brushColor, brushSize, brushOpacity, brushHardness].filter(Boolean).forEach((input) => {
  input.addEventListener("input", handleBrushControlChange);
  input.addEventListener("change", handleBrushControlChange);
});

brushMode?.addEventListener("change", () => {
  setActiveTool("brush", "Pincel");
  syncInspectorContext();
});

addLayerButton?.addEventListener("click", () => {
  void addLayerAboveActive();
});

mergeLayerButton?.addEventListener("click", () => {
  void mergeActiveLayerDown();
});

toggleMaskPreviewButton?.addEventListener("click", () => {
  maskPreviewVisible = !maskPreviewVisible;
  syncMaskPreviewButton();
  MaskLayerManager.applyMaskPreview();
});

toggleLayerMaskEnabledButton?.addEventListener("click", () => {
  toggleLayerMaskEnabled();
});

invertLayerMaskButton?.addEventListener("click", () => {
  void invertLayerMask();
});

applyLayerMaskButton?.addEventListener("click", () => {
  void applyLayerMaskToParent();
});

deleteLayerMaskButton?.addEventListener("click", () => {
  deleteLayerMaskFromParent();
});

document.querySelector('[data-brush-action="export-mask"]')?.addEventListener("click", () => {
  void exportMaskPng();
});

document.querySelector('[data-export-action="image"]')?.addEventListener("click", () => {
  void exportArtboardImage();
});

document.querySelectorAll("[data-align-action]").forEach((button) => {
  button.addEventListener("click", () => {
    alignSelection(button.dataset.alignAction || "center");
  });
});

document.querySelector('[data-timeline-action="prev-marker"]')?.addEventListener("click", () => {
  seekTimelineMarker(-1);
});

document.querySelector('[data-timeline-action="play"]')?.addEventListener("click", () => {
  if (timelineIsPlaying) {
    pauseTimelinePlayback({ keepPlayhead: true });
    return;
  }
  playTimeline();
});

document.querySelector('[data-timeline-action="stop"]')?.addEventListener("click", () => {
  stopTimelinePlayback({ reset: true });
});

document.querySelector('[data-timeline-action="next-marker"]')?.addEventListener("click", () => {
  seekTimelineMarker(1);
});

document.querySelector('[data-timeline-action="add-slide"]')?.addEventListener("click", () => {
  void addTimelineSlide();
});

document.querySelector('[data-timeline-action="remove-slide"]')?.addEventListener("click", () => {
  void removeTimelineSlide();
});

document.querySelector('[data-sd-action="start-worker"]')?.addEventListener("click", () => {
  void startStableDiffusionWorker();
});

document.querySelector('[data-sd-action="refresh-models"]')?.addEventListener("click", () => {
  void refreshStableDiffusionModels();
});

document.querySelector('[data-sd-action="generate"]')?.addEventListener("click", () => {
  void generateStableDiffusionImage();
});

[sdMode, sdI2IMode, sdPrompt, sdNegativePrompt, sdCheckpoint, sdArchitecture, sdLora, sdScheduler, sdSteps, sdCfgScale, sdWidth, sdHeight, sdSeed, sdDenoising, sdInpaintInsertMode]
  .filter(Boolean)
  .forEach((input) => {
    input.addEventListener("input", updateStableDiffusionPanelState);
    input.addEventListener("change", updateStableDiffusionPanelState);
  });

exportQuality?.addEventListener("input", syncExportLabels);
exportQuality?.addEventListener("change", syncExportLabels);

brandKitColors?.addEventListener("input", () => {
  renderColorPreview(parseColorLines(brandKitColors.value));
  markCanvasChanged("brand-kit");
});

[projectNameInput, brandKitName, brandKitVoice, brandXttsLanguage, brandXttsModel, brandXttsSpeaker]
  .filter(Boolean)
  .forEach((input) => {
    input.addEventListener("input", () => {
      markCanvasChanged("metadata");
      updateProjectInspectorSummary();
    });
  });

artboardPreset?.addEventListener("change", () => {
  applyPreset(artboardPreset.value);
});

customWidthInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    applyArtboardSize(customWidthInput.value, customHeightInput?.value);
  }
});

customHeightInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    applyArtboardSize(customWidthInput?.value, customHeightInput.value);
  }
});

imageInput?.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  await addMediaFile(file);
  imageInput.value = "";
});

window.addEventListener("keydown", (event) => {
  const key = String(event.key || "").toLowerCase();
  const editingField = ["input", "textarea", "select"].includes(String(event.target?.tagName || "").toLowerCase());
  if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
    event.preventDefault();
    void undoCanvasChange();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && (key === "y" || (key === "z" && event.shiftKey))) {
    event.preventDefault();
    void redoCanvasChange();
    return;
  }

  if (!editingField && (event.ctrlKey || event.metaKey) && key === "c" && hasSelection()) {
    event.preventDefault();
    void copySelectionPixels();
    return;
  }

  if (!editingField && (event.ctrlKey || event.metaKey) && key === "x" && hasSelection()) {
    event.preventDefault();
    void cutSelectionPixels();
    return;
  }

  if (!editingField && (event.ctrlKey || event.metaKey) && key === "v" && rasterClipboard) {
    event.preventDefault();
    void pasteRasterClipboard();
    return;
  }

  if (!editingField && (event.ctrlKey || event.metaKey) && key === "d" && hasSelection()) {
    event.preventDefault();
    void duplicateSelectionToLayer();
    return;
  }

  if (!editingField && (event.ctrlKey || event.metaKey) && key === "d" && selectedTimelineItemId) {
    event.preventDefault();
    void duplicateTimelineItem();
    return;
  }

  if (!editingField && (event.key === "Delete" || event.key === "Backspace") && hasSelection()) {
    event.preventDefault();
    void deleteSelectionPixels();
    return;
  }

  if (!editingField && (event.key === "Delete" || event.key === "Backspace") && selectedTimelineItemId) {
    event.preventDefault();
    removeTimelineItem();
    return;
  }

  if (!editingField && event.key === "Escape" && hasSelection()) {
    event.preventDefault();
    clearSelection();
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    spacePressed = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    spacePressed = false;
    stopPan();
  }
});

window.addEventListener("blur", () => {
  spacePressed = false;
  stopPan();
});

window.addEventListener("beforeunload", () => {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }
  void saveAutosaveSnapshot();
});

window.addEventListener("resize", () => {
  resizeCanvasViewport({ keepCamera: true });
  applyToolbarState();
  renderToolbar();
  syncToolbarActiveState();
  updateRasterCursorOverlay();
});

window.kitAPI?.onCanvasCommand?.((command = {}) => {
  void (async () => {
    const action = String(command.action || "status").trim();
    try {
      const result = await handleCanvasOperationalCommand(action, command.payload || {});
      updateAutosaveStatus(result.ok ? `Comando: ${result.message}` : `Erro: ${result.message}`);
      window.kitAPI?.replyCanvasCommand?.({
        id: command.id,
        result
      });
    } catch (err) {
      const result = makeCanvasCommandResult(false, err.message || "Falha ao executar comando no Canvas.");
      updateAutosaveStatus(`Erro: ${result.message}`);
      window.kitAPI?.replyCanvasCommand?.({
        id: command.id,
        result
      });
    }
  })();
});

async function bootstrapCanvasModule() {
  initFabricCanvas();
  setActiveTool(activeTool, getToolHandler(activeTool)?.label);
  initResizablePanels();
  syncExportLabels();
  renderBrandKit(createLocalDefaultBrandKit(), null);
  setSelectOptions(sdCheckpoint, [], { placeholder: "Atualize modelos" });
  setSelectOptions(sdLora, [], { placeholder: "Sem LoRA" });
  syncInspectorContext(null);

  const restored = await restoreLastCanvasSession();
  if (!restored) {
    const project = createLocalDefaultProject();
    await applyProject(project, null, null, { recordHistory: false });
    resetHistory(collectProjectFromCanvas({ appendHistory: false }), "initial");
    scheduleAutosave();
  }

  updateHistoryControls();
}

void bootstrapCanvasModule();
