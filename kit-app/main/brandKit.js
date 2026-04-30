const fs = require("fs");
const path = require("path");

const KIT_SCHEMA = "kit.brand.v1";

function nowIso() {
  return new Date().toISOString();
}

function createDefaultBrandKit(overrides = {}) {
  const timestamp = nowIso();
  return normalizeBrandKit({
    schema: KIT_SCHEMA,
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
    metadata: {},
    ...overrides
  });
}

function isValidHex(value = "") {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeNamedPathList(value) {
  return normalizeList(value).map((item, index) => {
    const filePath = String(item?.path || "").trim();
    return {
      name: String(item?.name || (filePath ? path.basename(filePath) : `Asset ${index + 1}`)).trim(),
      path: filePath,
      type: String(item?.type || "").trim()
    };
  }).filter((item) => item.path);
}

function normalizeColors(value) {
  return normalizeList(value)
    .map((item, index) => ({
      name: String(item?.name || `Cor ${index + 1}`).trim(),
      hex: String(item?.hex || "").trim().toUpperCase()
    }))
    .filter((item) => isValidHex(item.hex));
}

function normalizeFonts(value) {
  return normalizeList(value).map((item, index) => ({
    name: String(item?.name || `Fonte ${index + 1}`).trim(),
    family: String(item?.family || item?.name || "").trim(),
    path: String(item?.path || "").trim(),
    role: String(item?.role || "").trim()
  })).filter((item) => item.name || item.family || item.path);
}

function normalizeBrandKit(raw = {}) {
  const base = createPlainBrandKit(raw);
  return {
    ...base,
    colors: normalizeColors(base.colors),
    logos: normalizeNamedPathList(base.logos),
    fonts: normalizeFonts(base.fonts),
    assets: {
      global: normalizeNamedPathList(base.assets?.global),
      frames: normalizeNamedPathList(base.assets?.frames),
      watermarks: normalizeNamedPathList(base.assets?.watermarks),
      recurring: normalizeNamedPathList(base.assets?.recurring)
    }
  };
}

function createPlainBrandKit(raw = {}) {
  return {
    schema: KIT_SCHEMA,
    type: "brand-kit",
    version: Number(raw.version || 1),
    name: String(raw.name || "Novo Brand Kit").trim(),
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
    identity: {
      voice: String(raw.identity?.voice || "").trim(),
      description: String(raw.identity?.description || "").trim()
    },
    colors: raw.colors,
    logos: raw.logos,
    fonts: raw.fonts,
    xtts: {
      language: String(raw.xtts?.language || "pt").trim(),
      voiceModelPath: String(raw.xtts?.voiceModelPath || "").trim(),
      speakerWavPath: String(raw.xtts?.speakerWavPath || "").trim(),
      notes: String(raw.xtts?.notes || "").trim()
    },
    assets: raw.assets || {},
    metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {}
  };
}

function validateBrandKit(brandKit = {}) {
  const errors = [];

  if (brandKit.schema !== KIT_SCHEMA) {
    errors.push(`Schema invalido: esperado ${KIT_SCHEMA}.`);
  }

  if (!brandKit.name) {
    errors.push("Nome do Brand Kit e obrigatorio.");
  }

  if (!Array.isArray(brandKit.colors)) {
    errors.push("Paleta de cores deve ser uma lista.");
  } else {
    brandKit.colors.forEach((color, index) => {
      if (!isValidHex(color.hex)) {
        errors.push(`Cor ${index + 1} possui HEX invalido.`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function loadBrandKitFromFile(filePath) {
  const rawText = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(rawText);
  const brandKit = normalizeBrandKit(parsed);
  const validation = validateBrandKit(brandKit);

  if (!validation.valid) {
    const error = new Error(validation.errors.join("\n"));
    error.validation = validation;
    throw error;
  }

  return {
    brandKit,
    filePath
  };
}

function saveBrandKitToFile(filePath, brandKit) {
  const normalized = normalizeBrandKit({
    ...brandKit,
    updatedAt: nowIso()
  });
  const validation = validateBrandKit(normalized);

  if (!validation.valid) {
    const error = new Error(validation.errors.join("\n"));
    error.validation = validation;
    throw error;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return {
    brandKit: normalized,
    filePath
  };
}

module.exports = {
  KIT_SCHEMA,
  createDefaultBrandKit,
  loadBrandKitFromFile,
  normalizeBrandKit,
  saveBrandKitToFile,
  validateBrandKit
};
