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
  "brushMode"
];

const ARTBOARD_PRESETS = {
  "instagram-post": { label: "Instagram Post", width: 1080, height: 1080 },
  "instagram-story": { label: "Instagram Story", width: 1080, height: 1920 },
  reels: { label: "Reels", width: 1080, height: 1920 },
  "youtube-thumb": { label: "YouTube Thumb", width: 1280, height: 720 },
  "youtube-banner": { label: "YouTube Banner", width: 2560, height: 1440 },
  "tiktok-video": { label: "TikTok Video", width: 1080, height: 1920 },
  "facebook-post": { label: "Facebook Post", width: 1200, height: 630 }
};

const toolButtons = document.querySelectorAll(".tool-button");
const activeToolLabel = document.getElementById("activeToolLabel");
const zoomLabel = document.getElementById("zoomLabel");
const imageInput = document.getElementById("imageInput");
const projectNameInput = document.getElementById("projectName");
const projectStatus = document.getElementById("projectStatus");
const autosaveStatus = document.getElementById("autosaveStatus");
const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");
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
const propertyEmpty = document.getElementById("propertyEmpty");
const propX = document.getElementById("propX");
const propY = document.getElementById("propY");
const propW = document.getElementById("propW");
const propH = document.getElementById("propH");
const propAngle = document.getElementById("propAngle");
const propOpacity = document.getElementById("propOpacity");
const propFill = document.getElementById("propFill");
const propStroke = document.getElementById("propStroke");
const propStrokeWidth = document.getElementById("propStrokeWidth");
const propFontFamily = document.getElementById("propFontFamily");
const propFontSize = document.getElementById("propFontSize");
const propTextAlign = document.getElementById("propTextAlign");
const brushMode = document.getElementById("brushMode");
const brushColor = document.getElementById("brushColor");
const brushSize = document.getElementById("brushSize");
const brushSizeValue = document.getElementById("brushSizeValue");
const brushOpacity = document.getElementById("brushOpacity");
const brushOpacityValue = document.getElementById("brushOpacityValue");
const brushHardness = document.getElementById("brushHardness");
const brushHardnessValue = document.getElementById("brushHardnessValue");
const brushStatus = document.getElementById("brushStatus");
const exportFormat = document.getElementById("exportFormat");
const exportQuality = document.getElementById("exportQuality");
const exportQualityValue = document.getElementById("exportQualityValue");
const exportStatus = document.getElementById("exportStatus");
const board = document.querySelector(".fabric-board");
const stageScroll = document.querySelector(".stage-scroll");

let canvas = null;
let artboardObject = null;
let activeTool = "select";
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
let historySnapshots = [];
let historyIndex = -1;
let isApplyingSnapshot = false;
let historyTimer = null;
let autosaveTimer = null;
let lastAutosaveProjectHash = "";

const HISTORY_LIMIT = 40;
const HISTORY_DEBOUNCE_MS = 250;
const AUTOSAVE_DEBOUNCE_MS = 2500;

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
      masks: []
    },
    timeline: {
      slides: [],
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

function updateProjectStatus() {
  if (projectStatus) {
    projectStatus.textContent = currentProjectFilePath
      ? currentProjectFilePath
      : "Projeto ainda nao salvo";
  }
}

function updateAutosaveStatus(message = "") {
  if (autosaveStatus) {
    autosaveStatus.textContent = message || "Autosave aguardando";
  }
}

function updateHistoryControls() {
  if (undoButton) {
    undoButton.disabled = historyIndex <= 0;
  }

  if (redoButton) {
    redoButton.disabled = historyIndex < 0 || historyIndex >= historySnapshots.length - 1;
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
  const panX = Math.round((viewport.width - artboardWidth * zoom) / 2);
  const panY = Math.round((viewport.height - artboardHeight * zoom) / 2);

  canvas.setViewportTransform([zoom, 0, 0, zoom, panX, panY]);
  syncZoomLabel();
}

function applyArtboardSize(width, height, options = {}) {
  artboardWidth = clampArtboardDimension(width);
  artboardHeight = clampArtboardDimension(height);
  currentArtboardPreset = options.preset || currentArtboardPreset || "custom";

  if (canvas) {
    artboardObject?.set({
      width: artboardWidth,
      height: artboardHeight
    });
    artboardObject?.setCoords();

    if (options.resetViewport !== false) {
      fitArtboardInViewport();
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

function setActiveTool(tool, label) {
  activeTool = tool || "select";
  toolButtons.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.tool === activeTool);
  });

  if (activeToolLabel) {
    activeToolLabel.textContent = label || activeTool;
  }

  configureDrawingMode();
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

function getLayerObjects() {
  return canvas ? canvas.getObjects().filter((object) => !object.isArtboard) : [];
}

function createLayerId() {
  layerIdCounter += 1;
  return `layer-${Date.now().toString(36)}-${layerIdCounter.toString(36)}`;
}

function getLayerObjectById(layerId) {
  return getLayerObjects().find((object) => object.layerId === layerId) || null;
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

  if (object.layerLocked) {
    setLayerLocked(object, true, { render: false });
  }
}

function ensureAllLayerMetadata() {
  getLayerObjects().forEach((object, index) => ensureLayerMetadata(object, index));
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
  if (object.visible !== false) {
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
  if (!canvas || !object) {
    return;
  }

  object.set("visible", object.visible === false);
  if (canvas.getActiveObject() === object && object.visible === false) {
    canvas.discardActiveObject();
  }
  object.setCoords();
  canvas.requestRenderAll();
  updateSelectionInfo();
  markCanvasChanged("property");
}

function toggleLayerLock(object) {
  if (!object) {
    return;
  }

  setLayerLocked(object, !object.layerLocked);
  markCanvasChanged("layer");
}

function moveLayer(object, direction) {
  if (!canvas || !object) {
    return;
  }

  const layerObjects = getLayerObjects();
  const layerIndex = layerObjects.indexOf(object);

  if (direction === "up" && layerIndex < layerObjects.length - 1) {
    canvas.bringObjectForward(object);
  }

  if (direction === "down" && layerIndex > 0) {
    canvas.sendObjectBackwards(object);
  }

  canvas.setActiveObject(object);
  canvas.requestRenderAll();
  updateSelectionInfo();
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

  const displayObjects = [...getLayerObjects()].reverse();
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
  });

  canvas.setActiveObject(draggedObject);
  canvas.requestRenderAll();
  updateSelectionInfo();
  markCanvasChanged("layer");
}

function removeLayer(object) {
  if (!canvas || !object) {
    return;
  }

  if (canvas.getActiveObject() === object) {
    canvas.discardActiveObject();
  }

  canvas.remove(object);
  canvas.requestRenderAll();
  updateSelectionInfo();
  markCanvasChanged("layer");
}

function createLayerIconButton(label, title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "layer-action";
  button.draggable = false;
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.addEventListener("dragstart", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function updateLayers() {
  if (!layerList || !canvas) {
    return;
  }

  ensureAllLayerMetadata();
  const objects = getLayerObjects();
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
    item.appendChild(nameInput);
    item.appendChild(actions);
    layerList.appendChild(item);
  });
}

function getPropertyInputs() {
  return [
    propX,
    propY,
    propW,
    propH,
    propAngle,
    propOpacity,
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
  const mode = brushMode?.value === "mask" ? "mask" : "paint";
  const size = clampValue(getNumericValue(brushSize, 24), 1, 160);
  const opacity = clampValue(getNumericValue(brushOpacity, 100), 5, 100);
  const hardness = clampValue(getNumericValue(brushHardness, 85), 1, 100);
  const color = mode === "mask" ? "#FFFFFF" : normalizeHexColor(brushColor?.value || "#20232A", "#20232A");

  return {
    mode,
    size,
    opacity,
    hardness,
    color,
    stroke: colorWithOpacity(color, opacity)
  };
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
      ? "Modo mascara: pinte em branco para inpainting"
      : "Modo desenho livre";
  }
}

function configureDrawingMode() {
  if (!canvas) {
    return;
  }

  canvas.isDrawingMode = activeTool === "brush";
  canvas.selection = activeTool !== "brush";
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

function updatePropertyControls(object) {
  if (!object) {
    if (propertyEmpty) {
      propertyEmpty.hidden = false;
    }
    setInputValue(propX, 0);
    setInputValue(propY, 0);
    setInputValue(propW, 0);
    setInputValue(propH, 0);
    setInputValue(propAngle, 0);
    setInputValue(propOpacity, 100);
    setInputValue(propFill, "#20232A");
    setInputValue(propStroke, "#000000");
    setInputValue(propStrokeWidth, 0);
    renderFontOptions("Segoe UI");
    setInputValue(propFontSize, 64);
    setInputValue(propTextAlign, "center");
    setPropertyControlsDisabled(true);
    return;
  }

  if (propertyEmpty) {
    propertyEmpty.hidden = true;
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
    return;
  }
  updatePropertyControls(object);
  updateLayers();
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
    .filter((object) => !object.isArtboard)
    .map((object) => object.toObject(FABRIC_CUSTOM_PROPS));
}

function collectProjectFromCanvas(options = {}) {
  const base = currentProject || createLocalDefaultProject();
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
  canvas.requestRenderAll();
  updateSelectionInfo();
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

    syncArtboardLabel();
    renderProjectBrandKit(project, inherited);
    await loadFabricObjects(project.fabric?.objects || []);
    fitArtboardInViewport();
  } finally {
    isApplyingSnapshot = previousApplyingSnapshot;
  }

  if (options.recordHistory !== false) {
    resetHistory(project, "project-loaded");
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

async function createArtboardImageDataUrl(config = getExportConfig()) {
  const StaticCanvas = getFabricClass("StaticCanvas");
  if (!StaticCanvas) {
    throw new Error("StaticCanvas indisponivel para exportar imagem.");
  }

  const exportCanvas = new StaticCanvas(null, {
    width: artboardWidth,
    height: artboardHeight,
    backgroundColor: "#FFFFFF",
    enableRetinaScaling: false
  });

  for (const object of getLayerObjects()) {
    const cloned = await cloneFabricObject(object);
    if (!cloned) {
      continue;
    }

    cloned.set({
      visible: object.visible !== false,
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

async function exportMaskPng() {
  try {
    const dataUrl = await createMaskDataUrl();
    const result = await window.kitAPI?.saveCanvasMaskPng?.({
      dataUrl,
      name: `${projectNameInput?.value?.trim() || "canvas"}-mascara`
    });

    if (brushStatus) {
      brushStatus.textContent = result?.filePath
        ? `Mascara exportada: ${result.filePath}`
        : "Exportacao de mascara cancelada";
    }
  } catch (err) {
    console.error("Erro ao exportar mascara:", err);
    if (brushStatus) {
      brushStatus.textContent = `Erro ao exportar mascara: ${err.message || err}`;
    }
  }
}

async function exportArtboardImage() {
  try {
    syncExportLabels();
    const config = getExportConfig();

    if (exportStatus) {
      exportStatus.textContent = "Exportando artboard...";
    }

    const dataUrl = await createArtboardImageDataUrl(config);
    const result = await window.kitAPI?.saveCanvasImage?.({
      dataUrl,
      format: config.format,
      extension: config.extension,
      quality: config.quality,
      name: projectNameInput?.value?.trim() || "canvas-artboard"
    });

    if (exportStatus) {
      exportStatus.textContent = result?.filePath
        ? `Imagem exportada: ${result.filePath}`
        : "Exportacao cancelada";
    }
  } catch (err) {
    console.error("Erro ao exportar imagem:", err);
    if (exportStatus) {
      exportStatus.textContent = `Erro ao exportar imagem: ${err.message || err}`;
    }
  }
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
    object.set({
      left: Number(payload.x ?? artboardWidth / 2),
      top: Number(payload.y ?? artboardHeight / 2),
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
  const dataUrl = await createArtboardImageDataUrl({
    format,
    quality
  });
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
    case "insert-text":
      return insertTextFromCommand(payload);
    case "insert-image":
      return insertImageFromCommand(payload);
    case "select-layer":
    case "select-object":
      return selectLayerFromCommand(payload);
    case "apply-color":
    case "apply-brand-color":
      return applyBrandColorFromCommand(payload);
    case "insert-logo":
    case "apply-logo":
      return insertBrandLogoFromCommand(payload);
    case "export-image":
      return exportImageFromCommand(payload);
    default:
      return makeCanvasCommandResult(false, `Acao de Canvas desconhecida: ${action}`);
  }
}

function centerNewObject(object) {
  object.set({
    left: artboardWidth / 2,
    top: artboardHeight / 2,
    originX: "center",
    originY: "center"
  });
  canvas.add(object);
  object.setCoords();
  canvas.setActiveObject(object);
  canvas.requestRenderAll();
  updateSelectionInfo();
}

function addRect() {
  const Rect = getFabricClass("Rect");
  centerNewObject(new Rect({
    width: 320,
    height: 220,
    fill: "#2f7f6f",
    stroke: "#1f4e47",
    strokeWidth: 4,
    rx: 0,
    ry: 0
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
  centerNewObject(new Textbox("Texto editavel", {
    width: 420,
    fontFamily: "Segoe UI",
    fontSize: 64,
    fill: "#20232a",
    textAlign: "center"
  }));
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
    scaleY: scale
  });
  centerNewObject(image);
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
    }
  });
  canvas.on("mouse:move", movePan);
  canvas.on("mouse:up", stopPan);
  canvas.on("path:created", handlePathCreated);
  canvas.on("selection:created", updateSelectionInfo);
  canvas.on("selection:updated", updateSelectionInfo);
  canvas.on("selection:cleared", updateSelectionInfo);
  canvas.on("object:added", (event) => {
    ensureLayerMetadata(event.target, getLayerObjects().length - 1);
    updateLayers();
    if (event.target && !event.target.isArtboard) {
      markCanvasChanged("object-added");
    }
  });
  canvas.on("object:removed", (event) => {
    updateLayers();
    if (event.target && !event.target.isArtboard) {
      markCanvasChanged("object-removed");
    }
  });
  canvas.on("object:skewing", updateSelectionInfo);
  canvas.on("object:modified", () => {
    updateSelectionInfo();
    markCanvasChanged("object-modified");
  });
  canvas.on("object:stacking", () => {
    updateSelectionInfo();
    markCanvasChanged("layer");
  });
  canvas.on("object:moving", updateSelectionInfo);
  canvas.on("object:scaling", updateSelectionInfo);
  canvas.on("object:rotating", updateSelectionInfo);

  syncZoomLabel();
  syncArtboardLabel();
  configureDrawingMode();
  fitArtboardInViewport();
  updateSelectionInfo();
}

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTool(button.dataset.tool, button.textContent.trim());
  });
});

document.querySelector('[data-action="add-rect"]')?.addEventListener("click", () => {
  setActiveTool("shapes", "Formas");
  addRect();
});
document.querySelector('[data-action="add-circle"]')?.addEventListener("click", () => {
  setActiveTool("shapes", "Formas");
  addCircle();
});
document.querySelector('[data-action="add-text"]')?.addEventListener("click", addText);
document.querySelector('[data-action="add-image"]')?.addEventListener("click", () => {
  setActiveTool("elements", "Elementos");
  imageInput?.click();
});
document.querySelector('[data-action="apply-custom-size"]')?.addEventListener("click", () => {
  applyArtboardSize(customWidthInput?.value, customHeightInput?.value);
});

document.querySelector('[data-project-action="new"]')?.addEventListener("click", () => {
  void createCanvasProject();
});
document.querySelector('[data-project-action="open"]')?.addEventListener("click", () => {
  void openCanvasProject();
});
document.querySelector('[data-project-action="save"]')?.addEventListener("click", () => {
  void saveCanvasProject();
});
document.querySelector('[data-app-action="widget"]')?.addEventListener("click", () => {
  window.kitAPI?.openWidget?.();
});
document.querySelector('[data-app-action="chat"]')?.addEventListener("click", () => {
  window.kitAPI?.openChat?.();
});
document.querySelector('[data-history-action="undo"]')?.addEventListener("click", () => {
  void undoCanvasChange();
});
document.querySelector('[data-history-action="redo"]')?.addEventListener("click", () => {
  void redoCanvasChange();
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
  syncBrushLabels();
  configureBrush();
}

[brushMode, brushColor, brushSize, brushOpacity, brushHardness].filter(Boolean).forEach((input) => {
  input.addEventListener("input", handleBrushControlChange);
  input.addEventListener("change", handleBrushControlChange);
});

brushMode?.addEventListener("change", () => {
  setActiveTool("brush", "Pincel");
});

document.querySelector('[data-brush-action="export-mask"]')?.addEventListener("click", () => {
  void exportMaskPng();
});

document.querySelector('[data-export-action="image"]')?.addEventListener("click", () => {
  void exportArtboardImage();
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
    input.addEventListener("input", () => markCanvasChanged("metadata"));
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
  await addImageFile(file);
  imageInput.value = "";
});

window.addEventListener("keydown", (event) => {
  const key = String(event.key || "").toLowerCase();
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
  syncExportLabels();
  renderBrandKit(createLocalDefaultBrandKit(), null);

  const restored = await restoreLastCanvasSession();
  if (!restored) {
    const project = createLocalDefaultProject();
    renderProject(project, null);
    resetHistory(project, "initial");
    scheduleAutosave();
  }

  updateHistoryControls();
}

void bootstrapCanvasModule();
