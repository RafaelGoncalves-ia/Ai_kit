const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const PRESETS_ROOT = path.join(ROOT_DIR, "backend", "data", "presets");
const SCHEMA_VERSION = "1.0";

const TYPE_CONFIGS = {
  client: {
    type: "client",
    title: "Clientes",
    subtitle: "Cliente / Marca",
    directory: path.join(PRESETS_ROOT, "clients"),
    extension: ".client.kit",
    filters: [{ name: "Cliente KIT", extensions: ["kit"] }],
    template: {
      schemaVersion: SCHEMA_VERSION,
      type: "client",
      id: "",
      name: "",
      segment: "",
      description: "",
      contacts: {
        phone: "",
        email: "",
        website: "",
        instagram: "",
        address: ""
      },
      brand: {
        logo: "",
        primaryColor: "",
        secondaryColor: "",
        accentColor: "",
        fonts: {
          heading: "",
          body: ""
        }
      },
      voice: {
        tone: "",
        personality: "",
        forbiddenTerms: [""],
        preferredTerms: [""]
      },
      audience: {
        primary: "",
        secondary: "",
        painPoints: [""],
        desires: [""]
      },
      commercial: {
        mainOffer: "",
        differentials: [""],
        ctaDefault: "",
        salesChannel: ""
      },
      assets: {
        logoFiles: [""],
        referenceImages: [""],
        brandFiles: [""]
      }
    },
    sections: [
      { id: "identification", title: "Identificacao", fields: ["id", "name", "segment", "description"] },
      { id: "contacts", title: "Contatos", fields: ["contacts.phone", "contacts.email", "contacts.website", "contacts.instagram", "contacts.address"] },
      { id: "brand", title: "Identidade Visual", fields: ["brand.logo", "brand.primaryColor", "brand.secondaryColor", "brand.accentColor", "brand.fonts.heading", "brand.fonts.body"] },
      { id: "voice", title: "Voz da Marca", fields: ["voice.tone", "voice.personality", "voice.forbiddenTerms", "voice.preferredTerms"] },
      { id: "audience", title: "Publico", fields: ["audience.primary", "audience.secondary", "audience.painPoints", "audience.desires"] },
      { id: "commercial", title: "Comercial", fields: ["commercial.mainOffer", "commercial.differentials", "commercial.ctaDefault", "commercial.salesChannel"] },
      { id: "assets", title: "Assets", fields: ["assets.logoFiles", "assets.referenceImages", "assets.brandFiles"] }
    ],
    fields: {
      id: { label: "ID", kind: "text", placeholder: "ex.: minha-marca" },
      name: { label: "Nome", kind: "text", placeholder: "Nome do cliente ou marca" },
      segment: { label: "Segmento", kind: "text" },
      description: { label: "Descricao", kind: "textarea" },
      "contacts.phone": { label: "Telefone", kind: "text" },
      "contacts.email": { label: "E-mail", kind: "text" },
      "contacts.website": { label: "Website", kind: "text" },
      "contacts.instagram": { label: "Instagram", kind: "text" },
      "contacts.address": { label: "Endereco", kind: "textarea" },
      "brand.logo": { label: "Logo", kind: "file", selection: "image" },
      "brand.primaryColor": { label: "Cor Primaria", kind: "text", placeholder: "#000000" },
      "brand.secondaryColor": { label: "Cor Secundaria", kind: "text", placeholder: "#000000" },
      "brand.accentColor": { label: "Cor de Destaque", kind: "text", placeholder: "#000000" },
      "brand.fonts.heading": { label: "Fonte Titulo", kind: "text" },
      "brand.fonts.body": { label: "Fonte Corpo", kind: "text" },
      "voice.tone": { label: "Tom", kind: "text" },
      "voice.personality": { label: "Personalidade", kind: "textarea" },
      "voice.forbiddenTerms": { label: "Termos Proibidos", kind: "string-array" },
      "voice.preferredTerms": { label: "Termos Preferidos", kind: "string-array" },
      "audience.primary": { label: "Publico Primario", kind: "text" },
      "audience.secondary": { label: "Publico Secundario", kind: "text" },
      "audience.painPoints": { label: "Dores", kind: "string-array" },
      "audience.desires": { label: "Desejos", kind: "string-array" },
      "commercial.mainOffer": { label: "Oferta Principal", kind: "text" },
      "commercial.differentials": { label: "Diferenciais", kind: "string-array" },
      "commercial.ctaDefault": { label: "CTA Padrao", kind: "text" },
      "commercial.salesChannel": { label: "Canal de Vendas", kind: "text" },
      "assets.logoFiles": { label: "Arquivos de Logo", kind: "file-array", selection: "file" },
      "assets.referenceImages": { label: "Imagens de Referencia", kind: "file-array", selection: "image" },
      "assets.brandFiles": { label: "Arquivos de Marca", kind: "file-array", selection: "file" }
    }
  },
  style: {
    type: "style",
    title: "Estilos IA",
    subtitle: "Estilo / Pipeline IA",
    directory: path.join(PRESETS_ROOT, "styles"),
    extension: ".style.json",
    filters: [{ name: "Preset de Estilo", extensions: ["json"] }],
    template: {
      schemaVersion: SCHEMA_VERSION,
      type: "style",
      id: "",
      name: "",
      description: "",
      tags: [""],
      previewImage: "",
      imagePipeline: {
        model: "",
        checkpoint: "",
        loras: [{ name: "", path: "", weight: 1 }],
        embeddingsPositive: [""],
        embeddingsNegative: [""],
        sampler: "",
        scheduler: "",
        steps: 30,
        cfgScale: 7,
        denoise: 0.75,
        positivePromptBase: "",
        negativePromptBase: ""
      },
      videoPipeline: {
        model: "",
        loras: [{ name: "", path: "", weight: 1 }],
        duration: 5,
        fps: 24,
        motionStrength: 0.6,
        positivePromptBase: "",
        negativePromptBase: ""
      },
      compatibility: {
        goals: [""],
        funnels: [""],
        emotions: [""],
        segments: [""],
        mediaTypes: [""]
      }
    },
    sections: [
      { id: "identification", title: "Identificacao", fields: ["id", "name", "description", "tags"] },
      { id: "preview", title: "Preview", fields: ["previewImage"] },
      { id: "imagePipeline", title: "Pipeline de Imagem", fields: ["imagePipeline.model", "imagePipeline.checkpoint", "imagePipeline.loras", "imagePipeline.embeddingsPositive", "imagePipeline.embeddingsNegative", "imagePipeline.sampler", "imagePipeline.scheduler", "imagePipeline.steps", "imagePipeline.cfgScale", "imagePipeline.denoise", "imagePipeline.positivePromptBase", "imagePipeline.negativePromptBase"] },
      { id: "videoPipeline", title: "Pipeline de Video", fields: ["videoPipeline.model", "videoPipeline.loras", "videoPipeline.duration", "videoPipeline.fps", "videoPipeline.motionStrength", "videoPipeline.positivePromptBase", "videoPipeline.negativePromptBase"] },
      { id: "compatibility", title: "Compatibilidade", fields: ["compatibility.goals", "compatibility.funnels", "compatibility.emotions", "compatibility.segments", "compatibility.mediaTypes"] }
    ],
    fields: {
      id: { label: "ID", kind: "text", placeholder: "ex.: cinematic-clean" },
      name: { label: "Nome", kind: "text" },
      description: { label: "Descricao", kind: "textarea" },
      tags: { label: "Tags", kind: "string-array" },
      previewImage: { label: "Imagem de Preview", kind: "file", selection: "image" },
      "imagePipeline.model": { label: "Modelo", kind: "text" },
      "imagePipeline.checkpoint": { label: "Checkpoint", kind: "text" },
      "imagePipeline.loras": { label: "LoRAs", kind: "lora-array" },
      "imagePipeline.embeddingsPositive": { label: "Embeddings Positivos", kind: "string-array" },
      "imagePipeline.embeddingsNegative": { label: "Embeddings Negativos", kind: "string-array" },
      "imagePipeline.sampler": { label: "Sampler", kind: "text" },
      "imagePipeline.scheduler": { label: "Scheduler", kind: "text" },
      "imagePipeline.steps": { label: "Steps", kind: "number", min: 0, step: 1 },
      "imagePipeline.cfgScale": { label: "CFG Scale", kind: "number", min: 0, step: 0.1 },
      "imagePipeline.denoise": { label: "Denoise", kind: "number", min: 0, max: 1, step: 0.01 },
      "imagePipeline.positivePromptBase": { label: "Prompt Base Positivo", kind: "textarea" },
      "imagePipeline.negativePromptBase": { label: "Prompt Base Negativo", kind: "textarea" },
      "videoPipeline.model": { label: "Modelo", kind: "text" },
      "videoPipeline.loras": { label: "LoRAs", kind: "lora-array" },
      "videoPipeline.duration": { label: "Duracao", kind: "number", min: 1, step: 1 },
      "videoPipeline.fps": { label: "FPS", kind: "number", min: 1, step: 1 },
      "videoPipeline.motionStrength": { label: "Forca de Movimento", kind: "number", min: 0, max: 1, step: 0.01 },
      "videoPipeline.positivePromptBase": { label: "Prompt Base Positivo", kind: "textarea" },
      "videoPipeline.negativePromptBase": { label: "Prompt Base Negativo", kind: "textarea" },
      "compatibility.goals": { label: "Goals", kind: "string-array" },
      "compatibility.funnels": { label: "Funnels", kind: "string-array" },
      "compatibility.emotions": { label: "Emotions", kind: "string-array" },
      "compatibility.segments": { label: "Segments", kind: "string-array" },
      "compatibility.mediaTypes": { label: "Media Types", kind: "string-array" }
    }
  },
  format: {
    type: "format",
    title: "Formatos",
    subtitle: "Formato / Midia",
    directory: path.join(PRESETS_ROOT, "formats"),
    extension: ".format.json",
    filters: [{ name: "Preset de Formato", extensions: ["json"] }],
    template: {
      schemaVersion: SCHEMA_VERSION,
      type: "format",
      id: "",
      name: "",
      platform: "",
      mediaType: "",
      aspectRatio: "",
      width: 1080,
      height: 1080,
      defaultSlides: 3,
      minSlides: 1,
      maxSlides: 10,
      recommendedFor: {
        funnels: [""],
        goals: [""],
        metrics: [""]
      }
    },
    sections: [
      { id: "identification", title: "Identificacao", fields: ["id", "name"] },
      { id: "platform", title: "Plataforma e midia", fields: ["platform", "mediaType", "aspectRatio"] },
      { id: "dimensions", title: "Dimensoes", fields: ["width", "height", "defaultSlides", "minSlides", "maxSlides"] },
      { id: "recommended", title: "Recomendacao estrategica", fields: ["recommendedFor.funnels", "recommendedFor.goals", "recommendedFor.metrics"] }
    ],
    fields: {
      id: { label: "ID", kind: "text", placeholder: "ex.: instagram-feed-square" },
      name: { label: "Nome", kind: "text" },
      platform: { label: "Plataforma", kind: "text" },
      mediaType: { label: "Tipo de Midia", kind: "text" },
      aspectRatio: { label: "Aspect Ratio", kind: "text", placeholder: "1:1" },
      width: { label: "Largura", kind: "number", min: 1, step: 1 },
      height: { label: "Altura", kind: "number", min: 1, step: 1 },
      defaultSlides: { label: "Slides Padrao", kind: "number", min: 1, step: 1 },
      minSlides: { label: "Slides Minimos", kind: "number", min: 1, step: 1 },
      maxSlides: { label: "Slides Maximos", kind: "number", min: 1, step: 1 },
      "recommendedFor.funnels": { label: "Funnels", kind: "string-array" },
      "recommendedFor.goals": { label: "Goals", kind: "string-array" },
      "recommendedFor.metrics": { label: "Metrics", kind: "string-array" }
    }
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensurePresetDirectories() {
  fs.mkdirSync(PRESETS_ROOT, { recursive: true });
  Object.values(TYPE_CONFIGS).forEach((config) => {
    fs.mkdirSync(config.directory, { recursive: true });
  });
  return PRESETS_ROOT;
}

function getTypeConfig(type) {
  const config = TYPE_CONFIGS[String(type || "").trim()];
  if (!config) {
    throw new Error(`Tipo de preset invalido: ${type || "desconhecido"}.`);
  }
  return config;
}

function slugify(value = "", fallback = "preset") {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeScalar(value, template) {
  if (typeof template === "number") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : template;
  }

  if (typeof template === "string") {
    return typeof value === "string" ? value : value == null ? "" : String(value);
  }

  return value ?? template;
}

function normalizeByTemplate(template, rawValue) {
  if (Array.isArray(template)) {
    const itemTemplate = template[0];
    return ensureArray(rawValue).map((entry) => normalizeByTemplate(itemTemplate, entry));
  }

  if (template && typeof template === "object") {
    const next = {};
    const source = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) ? rawValue : {};
    Object.keys(template).forEach((key) => {
      next[key] = normalizeByTemplate(template[key], source[key]);
    });
    return next;
  }

  return normalizeScalar(rawValue, template);
}

function findUnexpectedPaths(template, value, currentPath = "") {
  const errors = [];

  if (Array.isArray(template)) {
    const itemTemplate = template[0];
    if (!Array.isArray(value)) {
      return errors;
    }
    value.forEach((entry, index) => {
      errors.push(...findUnexpectedPaths(itemTemplate, entry, `${currentPath}[${index}]`));
    });
    return errors;
  }

  if (!template || typeof template !== "object") {
    return errors;
  }

  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  Object.keys(source).forEach((key) => {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    if (!Object.prototype.hasOwnProperty.call(template, key)) {
      errors.push(`Campo fora do schema: ${nextPath}`);
      return;
    }
    errors.push(...findUnexpectedPaths(template[key], source[key], nextPath));
  });

  return errors;
}

function validateByTemplate(template, value, currentPath = "") {
  const errors = [];

  if (Array.isArray(template)) {
    if (!Array.isArray(value)) {
      errors.push(`${currentPath || "root"} deve ser uma lista.`);
      return errors;
    }

    const itemTemplate = template[0];
    value.forEach((entry, index) => {
      const itemPath = `${currentPath}[${index}]`;
      if (typeof itemTemplate === "string" && typeof entry !== "string") {
        errors.push(`${itemPath} deve ser texto.`);
        return;
      }
      if (typeof itemTemplate === "number" && !Number.isFinite(Number(entry))) {
        errors.push(`${itemPath} deve ser numerico.`);
        return;
      }
      errors.push(...validateByTemplate(itemTemplate, entry, itemPath));
    });

    return errors;
  }

  if (template && typeof template === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${currentPath || "root"} deve ser um objeto.`);
      return errors;
    }

    Object.keys(template).forEach((key) => {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      errors.push(...validateByTemplate(template[key], value[key], nextPath));
    });
    return errors;
  }

  if (typeof template === "string" && typeof value !== "string") {
    errors.push(`${currentPath} deve ser texto.`);
  }

  if (typeof template === "number" && !Number.isFinite(Number(value))) {
    errors.push(`${currentPath} deve ser numerico.`);
  }

  return errors;
}

function createEmptyPreset(type) {
  const config = getTypeConfig(type);
  return normalizeByTemplate(config.template, {});
}

function normalizePreset(type, rawPreset = {}) {
  const config = getTypeConfig(type);
  const normalized = normalizeByTemplate(config.template, rawPreset);
  normalized.schemaVersion = SCHEMA_VERSION;
  normalized.type = config.type;
  return normalized;
}

function validatePreset(type, rawPreset = {}) {
  const config = getTypeConfig(type);
  const source = rawPreset && typeof rawPreset === "object" ? rawPreset : {};
  const errors = [];

  if (source.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion invalido. Esperado ${SCHEMA_VERSION}.`);
  }

  if (source.type !== config.type) {
    errors.push(`type invalido. Esperado ${config.type}.`);
  }

  errors.push(...findUnexpectedPaths(config.template, source));
  errors.push(...validateByTemplate(config.template, source));

  const normalized = normalizePreset(type, source);

  if (type === "format") {
    const minSlides = Number(normalized.minSlides);
    const maxSlides = Number(normalized.maxSlides);
    const defaultSlides = Number(normalized.defaultSlides);
    if (minSlides > maxSlides) {
      errors.push("minSlides nao pode ser maior que maxSlides.");
    }
    if (defaultSlides < minSlides || defaultSlides > maxSlides) {
      errors.push("defaultSlides precisa ficar entre minSlides e maxSlides.");
    }
  }

  if (type === "style") {
    normalized.imagePipeline.loras.forEach((item, index) => {
      if (!Number.isFinite(Number(item.weight))) {
        errors.push(`imagePipeline.loras[${index}].weight deve ser numerico.`);
      }
    });
    normalized.videoPipeline.loras.forEach((item, index) => {
      if (!Number.isFinite(Number(item.weight))) {
        errors.push(`videoPipeline.loras[${index}].weight deve ser numerico.`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized
  };
}

function readPresetFile(filePath, expectedType = "") {
  const resolvedPath = path.resolve(String(filePath || ""));
  const rawText = fs.readFileSync(resolvedPath, "utf8");
  const parsed = JSON.parse(rawText);
  const presetType = expectedType || String(parsed?.type || "").trim();
  const validation = validatePreset(presetType, parsed);

  if (!validation.valid) {
    const error = new Error(validation.errors.join("\n"));
    error.validation = validation;
    error.filePath = resolvedPath;
    throw error;
  }

  return {
    type: presetType,
    filePath: resolvedPath,
    preset: validation.normalized
  };
}

function makeManagedFilePath(type, preset, preferredName = "") {
  const config = getTypeConfig(type);
  ensurePresetDirectories();
  const baseName = preferredName || preset?.name || preset?.id || `${type}-preset`;
  const stem = slugify(baseName, `${type}-preset`);
  const fileName = stem.endsWith(config.extension) ? stem : `${stem}${config.extension}`;
  return path.join(config.directory, fileName);
}

function savePresetToPath(type, preset, targetPath) {
  const config = getTypeConfig(type);
  const validation = validatePreset(type, {
    ...preset,
    type,
    schemaVersion: SCHEMA_VERSION
  });

  if (!validation.valid) {
    const error = new Error(validation.errors.join("\n"));
    error.validation = validation;
    throw error;
  }

  const rawTargetPath = path.resolve(String(targetPath || ""));
  const resolvedPath = rawTargetPath.endsWith(config.extension)
    ? rawTargetPath
    : `${rawTargetPath}${config.extension}`;
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(validation.normalized, null, 2)}\n`, "utf8");

  return {
    type,
    filePath: resolvedPath,
    preset: validation.normalized
  };
}

function listPresets(type) {
  const config = getTypeConfig(type);
  ensurePresetDirectories();

  return fs.readdirSync(config.directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(config.extension))
    .map((entry) => {
      const absolutePath = path.join(config.directory, entry.name);
      const stats = fs.statSync(absolutePath);
      try {
        const loaded = readPresetFile(absolutePath, type);
        return {
          fileName: entry.name,
          filePath: absolutePath,
          id: loaded.preset.id || "",
          name: loaded.preset.name || path.basename(entry.name, config.extension),
          description: loaded.preset.description || "",
          updatedAt: stats.mtime.toISOString()
        };
      } catch (error) {
        return {
          fileName: entry.name,
          filePath: absolutePath,
          id: "",
          name: path.basename(entry.name, config.extension),
          description: error.message || "Arquivo invalido.",
          updatedAt: stats.mtime.toISOString(),
          invalid: true
        };
      }
    })
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pt-BR"));
}

function duplicatePreset(type, filePath) {
  const loaded = readPresetFile(filePath, type);
  const duplicated = normalizePreset(type, loaded.preset);
  duplicated.name = duplicated.name ? `${duplicated.name} Copia` : `${type} Copia`;
  duplicated.id = slugify(duplicated.name, `${type}-copia`);
  const targetPath = makeManagedFilePath(type, duplicated, duplicated.name);
  return savePresetToPath(type, duplicated, targetPath);
}

function deletePreset(type, filePath) {
  getTypeConfig(type);
  const resolvedPath = path.resolve(String(filePath || ""));
  if (!fs.existsSync(resolvedPath)) {
    return { success: true, filePath: resolvedPath };
  }
  fs.unlinkSync(resolvedPath);
  return { success: true, filePath: resolvedPath };
}

function getPresetManagerMeta() {
  return {
    schemaVersion: SCHEMA_VERSION,
    rootDir: PRESETS_ROOT,
    types: Object.fromEntries(
      Object.entries(TYPE_CONFIGS).map(([type, config]) => [
        type,
        {
          type,
          title: config.title,
          subtitle: config.subtitle,
          extension: config.extension,
          sections: clone(config.sections),
          fields: clone(config.fields),
          template: clone(config.template)
        }
      ])
    )
  };
}

module.exports = {
  PRESETS_ROOT,
  TYPE_CONFIGS,
  SCHEMA_VERSION,
  ensurePresetDirectories,
  getPresetManagerMeta,
  createEmptyPreset,
  normalizePreset,
  validatePreset,
  readPresetFile,
  listPresets,
  makeManagedFilePath,
  savePresetToPath,
  duplicatePreset,
  deletePreset
};
