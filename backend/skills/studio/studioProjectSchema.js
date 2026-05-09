const { randomUUID } = require("crypto");

const STUDIO_PROJECT_SCHEMA = "kit.studio.project.v1";
const DEFAULT_PROJECT_STATUS = "draft";
const DEFAULT_CURRENT_STEP = "briefing";
const DEFAULT_CURRENT_TAB = "briefing";
const DEFAULT_TAB_IDS = ["briefing", "script"];
const DEFAULT_SCENE_DURATION = 5;

function nowIso() {
  return new Date().toISOString();
}

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(100, numeric));
}

function makeId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeResourceUsage(value = {}) {
  return {
    vram: value?.vram ?? "--",
    ram: value?.ram ?? "--",
    gpu: value?.gpu ?? "--",
    cpu: value?.cpu ?? "--",
    disk: value?.disk ?? "--"
  };
}

function normalizeProgress(value = {}) {
  return {
    currentTask: String(value?.currentTask || "Aguardando briefing").trim(),
    percent: clampPercent(value?.percent),
    completedSteps: Math.max(0, Number(value?.completedSteps || 0)),
    totalSteps: Math.max(1, Number(value?.totalSteps || 2)),
    elapsedMs: Math.max(0, Number(value?.elapsedMs || 0))
  };
}

function normalizeBriefing(value = {}) {
  return {
    approved: Boolean(value?.approved),
    theme: String(value?.theme || "").trim(),
    purpose: String(value?.purpose || "").trim(),
    audience: String(value?.audience || "").trim(),
    visualMaterial: value?.visualMaterial ?? "",
    duration: value?.duration ?? "",
    mediaType: value?.mediaType ?? "",
    ratio: value?.ratio ?? "",
    platform: value?.platform ?? "",
    postType: value?.postType ?? "",
    videoContent: value?.videoContent ?? "",
    videoNarration: value?.videoNarration ?? "",
    bgmStyle: value?.bgmStyle ?? "",
    bgmId: value?.bgmId ?? "",
    subtitleInfo: value?.subtitleInfo ?? "",
    postCaption: String(value?.postCaption || "").trim(),
    characters: ensureArray(value?.characters),
    materialReferences: ensureArray(value?.materialReferences),
    ttsList: ensureArray(value?.ttsList),
    digitalHumanList: ensureArray(value?.digitalHumanList),
    styleList: ensureArray(value?.styleList),
    referenceNodeIds: ensureArray(value?.referenceNodeIds),
    rawReferences: value?.rawReferences ?? "",
    defaultsFromClientKit: value?.defaultsFromClientKit ?? null
  };
}

function normalizeGenerationSettings(value = {}) {
  return {
    preset: String(value?.preset || "standard").trim(),
    model: String(value?.model || "").trim(),
    quality: String(value?.quality || "standard").trim(),
    mode: String(value?.mode || "auto").trim(),
    duration: Math.max(1, Number(value?.duration || DEFAULT_SCENE_DURATION)),
    fps: Math.max(1, Number(value?.fps || 12)),
    ratio: String(value?.ratio || "").trim(),
    width: Math.max(0, Number(value?.width || 0)),
    height: Math.max(0, Number(value?.height || 0)),
    seed: String(value?.seed || "").trim(),
    lora: String(value?.lora || "").trim(),
    steps: Math.max(0, Number(value?.steps || 24)),
    cfg: Number.isFinite(Number(value?.cfg)) ? Number(value.cfg) : 7,
    sampler: String(value?.sampler || "").trim(),
    scheduler: String(value?.scheduler || "").trim(),
    denoise: Number.isFinite(Number(value?.denoise)) ? Number(value.denoise) : 0.55,
    startImage: String(value?.startImage || "").trim(),
    endImage: String(value?.endImage || "").trim(),
    interpolationReady: Boolean(value?.interpolationReady),
    useProjectPersona: Boolean(value?.useProjectPersona)
  };
}

function createStudioScene(overrides = {}) {
  return normalizeStudioScene({
    id: makeId("scene"),
    index: 1,
    title: "Nova cena",
    approved: false,
    duration: DEFAULT_SCENE_DURATION,
    narration: "",
    subtitle: "",
    visualDescription: "",
    visualPrompt: "",
    negativePrompt: "",
    motionPrompt: "",
    mediaType: "image",
    generationMode: "t2i",
    references: [],
    clientMediaRefs: [],
    aiMediaRefs: [],
    uploadedRefs: [],
    generatedMedia: null,
    audioAsset: null,
    subtitleAsset: null,
    status: "draft",
    productionStatus: "aguardando",
    generationSettings: normalizeGenerationSettings(),
    history: [],
    ...overrides
  });
}

function normalizeStudioScene(value = {}) {
  return {
    id: String(value?.id || makeId("scene")),
    index: Math.max(1, Number(value?.index || 1)),
    title: String(value?.title || `Cena ${value?.index || 1}`).trim(),
    approved: Boolean(value?.approved),
    duration: Math.max(1, Number(value?.duration || DEFAULT_SCENE_DURATION)),
    narration: String(value?.narration || "").trim(),
    subtitle: String(value?.subtitle || "").trim(),
    visualDescription: String(value?.visualDescription || "").trim(),
    visualPrompt: String(value?.visualPrompt || "").trim(),
    negativePrompt: String(value?.negativePrompt || "").trim(),
    motionPrompt: String(value?.motionPrompt || "").trim(),
    mediaType: String(value?.mediaType || "image").trim(),
    generationMode: String(value?.generationMode || "t2i").trim(),
    references: ensureArray(value?.references),
    clientMediaRefs: ensureArray(value?.clientMediaRefs),
    aiMediaRefs: ensureArray(value?.aiMediaRefs),
    uploadedRefs: ensureArray(value?.uploadedRefs),
    generatedMedia: value?.generatedMedia ?? null,
    audioAsset: value?.audioAsset ?? null,
    subtitleAsset: value?.subtitleAsset ?? null,
    status: String(value?.status || "draft").trim(),
    productionStatus: String(value?.productionStatus || "").trim(),
    generationSettings: normalizeGenerationSettings({
      duration: value?.duration || DEFAULT_SCENE_DURATION,
      ratio: value?.ratio || "",
      ...value?.generationSettings
    }),
    history: ensureArray(value?.history)
  };
}

function normalizeScript(value = {}) {
  return {
    approved: Boolean(value?.approved),
    totalDuration: Math.max(0, Number(value?.totalDuration || 0)),
    scenes: ensureArray(value?.scenes).map((scene, index) => normalizeStudioScene({
      index: index + 1,
      ...scene
    }))
  };
}

function normalizeProduction(value = {}) {
  return {
    status: String(value?.status || "idle").trim(),
    jobs: ensureArray(value?.jobs),
    outputs: ensureArray(value?.outputs),
    errors: ensureArray(value?.errors)
  };
}

function normalizeCanvasExport(value = {}) {
  return {
    kiaPath: value?.kiaPath ?? null,
    ready: Boolean(value?.ready)
  };
}

function normalizeFinalRender(value = {}) {
  return {
    mp4Path: value?.mp4Path ?? null,
    ready: Boolean(value?.ready)
  };
}

function normalizeStudioProject(raw = {}) {
  const timestamp = nowIso();
  const unlockedTabs = ensureArray(raw?.unlockedTabs)
    .map((tab) => String(tab || "").trim())
    .filter(Boolean);

  return {
    schema: STUDIO_PROJECT_SCHEMA,
    id: String(raw?.id || makeId("studio")),
    source: String(raw?.source || "studio").trim(),
    clientId: raw?.clientId ?? null,
    clientName: String(raw?.clientName || "Cliente nao definido").trim(),
    productName: String(raw?.productName || "").trim(),
    projectName: String(raw?.projectName || "Projeto Studio").trim(),
    status: String(raw?.status || DEFAULT_PROJECT_STATUS).trim(),
    currentStep: String(raw?.currentStep || DEFAULT_CURRENT_STEP).trim(),
    currentTab: String(raw?.currentTab || DEFAULT_CURRENT_TAB).trim(),
    unlockedTabs: unlockedTabs.length ? unlockedTabs : [...DEFAULT_TAB_IDS],
    inputCommand: String(raw?.inputCommand || "").trim(),
    postCaption: String(raw?.postCaption || "").trim(),
    attachments: ensureArray(raw?.attachments),
    createdAt: raw?.createdAt || timestamp,
    updatedAt: raw?.updatedAt || timestamp,
    resourceUsage: normalizeResourceUsage(raw?.resourceUsage),
    progress: normalizeProgress(raw?.progress),
    briefing: normalizeBriefing(raw?.briefing),
    briefingApproved: Boolean(raw?.briefingApproved || raw?.briefing?.approved),
    script: normalizeScript(raw?.script),
    production: normalizeProduction(raw?.production),
    canvasExport: normalizeCanvasExport(raw?.canvasExport),
    finalRender: normalizeFinalRender(raw?.finalRender)
  };
}

function createStudioProject(overrides = {}) {
  return normalizeStudioProject({
    source: "studio",
    projectName: "Projeto Studio",
    status: DEFAULT_PROJECT_STATUS,
    currentStep: DEFAULT_CURRENT_STEP,
    currentTab: DEFAULT_CURRENT_TAB,
    unlockedTabs: [...DEFAULT_TAB_IDS],
    resourceUsage: normalizeResourceUsage(),
    progress: normalizeProgress({
      currentTask: "Aguardando briefing",
      percent: 0,
      completedSteps: 0,
      totalSteps: 2,
      elapsedMs: 0
    }),
    briefing: normalizeBriefing(),
    script: normalizeScript(),
    production: normalizeProduction(),
    canvasExport: normalizeCanvasExport(),
    finalRender: normalizeFinalRender(),
    ...overrides
  });
}

function updateStudioProject(project, patch = {}) {
  return normalizeStudioProject({
    ...project,
    ...patch,
    updatedAt: nowIso()
  });
}

function updateBriefing(project, briefingPatch = {}) {
  return updateStudioProject(project, {
    briefing: {
      ...project.briefing,
      ...briefingPatch
    }
  });
}

function approveBriefing(project) {
  const unlockedTabs = Array.from(new Set([...(project.unlockedTabs || []), "script"]));
  return updateStudioProject(project, {
    currentStep: "script",
    currentTab: "script",
    unlockedTabs,
    progress: {
      ...project.progress,
      currentTask: "Briefing aprovado",
      completedSteps: Math.max(project.progress?.completedSteps || 0, 1)
    }
  });
}

function setScript(project, script = {}) {
  return updateStudioProject(project, {
    script: normalizeScript(script),
    currentStep: "script"
  });
}

function approveScene(project, sceneId, approved = true) {
  const scenes = ensureArray(project?.script?.scenes).map((scene) => {
    if (scene.id !== sceneId) {
      return scene;
    }

    return normalizeStudioScene({
      ...scene,
      approved,
      status: approved ? "approved" : scene.status
    });
  });

  return updateStudioProject(project, {
    script: {
      ...project.script,
      approved: scenes.length > 0 && scenes.every((scene) => scene.approved),
      scenes
    }
  });
}

function updateScene(project, sceneId, scenePatch = {}) {
  const scenes = ensureArray(project?.script?.scenes).map((scene) => {
    if (scene.id !== sceneId) {
      return scene;
    }

    return normalizeStudioScene({
      ...scene,
      ...scenePatch
    });
  });

  return updateStudioProject(project, {
    script: {
      ...project.script,
      scenes
    }
  });
}

function setSceneMedia(project, sceneId, generatedMedia) {
  return updateScene(project, sceneId, {
    generatedMedia,
    status: generatedMedia ? "media-ready" : "draft"
  });
}

function setSceneAudio(project, sceneId, audioAsset) {
  return updateScene(project, sceneId, {
    audioAsset,
    status: audioAsset ? "audio-ready" : "draft"
  });
}

function setProductionStatus(project, status, patch = {}) {
  return updateStudioProject(project, {
    production: {
      ...project.production,
      ...patch,
      status: String(status || patch?.status || project.production?.status || "idle").trim()
    }
  });
}

function unlockTab(project, tabId) {
  const safeTabId = String(tabId || "").trim();
  if (!safeTabId) {
    return normalizeStudioProject(project);
  }

  return updateStudioProject(project, {
    unlockedTabs: Array.from(new Set([...(project.unlockedTabs || []), safeTabId]))
  });
}

function validateStudioProject(project = {}) {
  const errors = [];

  if (project.schema !== STUDIO_PROJECT_SCHEMA) {
    errors.push(`Schema invalido: esperado ${STUDIO_PROJECT_SCHEMA}.`);
  }

  if (!project.id) {
    errors.push("Projeto Studio precisa de id.");
  }

  if (!project.projectName) {
    errors.push("Projeto Studio precisa de projectName.");
  }

  if (!project.briefing || typeof project.briefing !== "object") {
    errors.push("Projeto Studio precisa de briefing.");
  }

  if (!project.script || !Array.isArray(project.script.scenes)) {
    errors.push("Projeto Studio precisa de script.scenes.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  STUDIO_PROJECT_SCHEMA,
  createStudioProject,
  createStudioScene,
  normalizeStudioProject,
  normalizeStudioScene,
  updateStudioProject,
  updateBriefing,
  approveBriefing,
  setScript,
  approveScene,
  updateScene,
  setSceneMedia,
  setSceneAudio,
  setProductionStatus,
  unlockTab,
  validateStudioProject
};
