const fs = require("fs");
const path = require("path");

const KIA_SCHEMA = "kit.project.v1";

function nowIso() {
  return new Date().toISOString();
}

function createDefaultProject(overrides = {}) {
  const timestamp = nowIso();
  return normalizeProject({
    schema: KIA_SCHEMA,
    type: "canvas-project",
    version: 1,
    name: "Novo Projeto Canvas",
    createdAt: timestamp,
    updatedAt: timestamp,
    brandKitPath: null,
    brandKitOverrides: {
      colors: [],
      logos: [],
      fonts: [],
      assets: {
        global: []
      }
    },
    artboard: {
      width: 1080,
      height: 1080,
      preset: "instagram-post"
    },
    fabric: {
      version: "",
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
      activeSlideId: null,
      audio: [],
      video: []
    },
    history: [
      {
        action: "created",
        at: timestamp
      }
    ],
    ...overrides
  });
}

function normalizeProject(raw = {}) {
  const timestamp = nowIso();
  return {
    schema: KIA_SCHEMA,
    type: "canvas-project",
    version: Number(raw.version || 1),
    name: String(raw.name || "Novo Projeto Canvas").trim(),
    createdAt: raw.createdAt || timestamp,
    updatedAt: raw.updatedAt || timestamp,
    brandKitPath: raw.brandKitPath ? String(raw.brandKitPath) : null,
    brandKitOverrides: normalizeBrandKitOverrides(raw.brandKitOverrides),
    artboard: {
      width: Number(raw.artboard?.width || 1080),
      height: Number(raw.artboard?.height || 1080),
      preset: String(raw.artboard?.preset || "custom")
    },
    fabric: {
      version: String(raw.fabric?.version || ""),
      objects: Array.isArray(raw.fabric?.objects) ? raw.fabric.objects : []
    },
    metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
    ai: {
      prompts: Array.isArray(raw.ai?.prompts) ? raw.ai.prompts : [],
      generations: Array.isArray(raw.ai?.generations) ? raw.ai.generations : [],
      inpaints: Array.isArray(raw.ai?.inpaints) ? raw.ai.inpaints : [],
      outpaints: Array.isArray(raw.ai?.outpaints) ? raw.ai.outpaints : [],
      masks: Array.isArray(raw.ai?.masks) ? raw.ai.masks : []
    },
    timeline: {
      slides: Array.isArray(raw.timeline?.slides) ? raw.timeline.slides : [],
      activeSlideId: raw.timeline?.activeSlideId ? String(raw.timeline.activeSlideId) : null,
      audio: Array.isArray(raw.timeline?.audio) ? raw.timeline.audio : [],
      video: Array.isArray(raw.timeline?.video) ? raw.timeline.video : []
    },
    history: Array.isArray(raw.history) ? raw.history : []
  };
}

function normalizeNamedPathList(value) {
  return Array.isArray(value)
    ? value.map((item, index) => {
      const filePath = String(item?.path || "").trim();
      return {
        name: String(item?.name || (filePath ? path.basename(filePath) : `Asset ${index + 1}`)).trim(),
        path: filePath,
        type: String(item?.type || "").trim()
      };
    }).filter((item) => item.path)
    : [];
}

function normalizeColors(value) {
  return Array.isArray(value)
    ? value.map((item, index) => ({
      name: String(item?.name || `Cor ${index + 1}`).trim(),
      hex: String(item?.hex || "").trim().toUpperCase()
    })).filter((item) => /^#[0-9a-fA-F]{6}$/.test(item.hex))
    : [];
}

function normalizeFonts(value) {
  return Array.isArray(value)
    ? value.map((item, index) => ({
      name: String(item?.name || `Fonte ${index + 1}`).trim(),
      family: String(item?.family || item?.name || "").trim(),
      path: String(item?.path || "").trim(),
      role: String(item?.role || "").trim()
    })).filter((item) => item.name || item.family || item.path)
    : [];
}

function normalizeBrandKitOverrides(overrides = {}) {
  return {
    colors: normalizeColors(overrides.colors),
    logos: normalizeNamedPathList(overrides.logos),
    fonts: normalizeFonts(overrides.fonts),
    assets: {
      global: normalizeNamedPathList(overrides.assets?.global)
    }
  };
}

function validateProject(project = {}) {
  const errors = [];

  if (project.schema !== KIA_SCHEMA) {
    errors.push(`Schema invalido: esperado ${KIA_SCHEMA}.`);
  }

  if (!project.name) {
    errors.push("Nome do projeto e obrigatorio.");
  }

  if (!project.artboard || project.artboard.width <= 0 || project.artboard.height <= 0) {
    errors.push("Artboard precisa de largura e altura validas.");
  }

  if (!project.fabric || !Array.isArray(project.fabric.objects)) {
    errors.push("Fabric precisa conter uma lista de objetos.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function loadProjectFromFile(filePath) {
  const rawText = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(rawText);
  const project = normalizeProject(parsed);
  const validation = validateProject(project);

  if (!validation.valid) {
    const error = new Error(validation.errors.join("\n"));
    error.validation = validation;
    throw error;
  }

  return {
    project,
    filePath
  };
}

function saveProjectToFile(filePath, project) {
  const normalized = normalizeProject({
    ...project,
    updatedAt: nowIso(),
    history: [
      ...(Array.isArray(project.history) ? project.history : []),
      {
        action: "saved",
        at: nowIso()
      }
    ].slice(-50)
  });
  const validation = validateProject(normalized);

  if (!validation.valid) {
    const error = new Error(validation.errors.join("\n"));
    error.validation = validation;
    throw error;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return {
    project: normalized,
    filePath
  };
}

module.exports = {
  KIA_SCHEMA,
  createDefaultProject,
  loadProjectFromFile,
  normalizeProject,
  saveProjectToFile,
  validateProject
};
