import fs from "fs";
import path from "path";

const ROOT_DIR = path.resolve(process.cwd());
const VIDEO_MODEL_ROOTS = [
  path.join(ROOT_DIR, "models", "video"),
  path.join(ROOT_DIR, "models", "wan"),
  path.join(ROOT_DIR, "models", "diffusers"),
  path.join(ROOT_DIR, "models", "stable-diffusion")
];

const KNOWN_FAMILIES = [
  {
    family: "wan",
    detector: /wan/i,
    defaultTask: "video-generation",
    recommendedModes: ["t2v", "i2v"],
    minVramGb: 12,
    notes: "Compatível com ecossistema Wan local quando instalado."
  },
  {
    family: "hunyuan",
    detector: /hunyuan/i,
    defaultTask: "video-generation",
    recommendedModes: ["t2v", "i2v"],
    minVramGb: 12,
    notes: "Compatível com Hunyuan Video local quando instalado."
  },
  {
    family: "cogvideo",
    detector: /cogvideo|cog-video/i,
    defaultTask: "video-generation",
    recommendedModes: ["t2v", "i2v"],
    minVramGb: 16,
    notes: "Compatível com CogVideo local quando instalado."
  },
  {
    family: "ltx-video",
    detector: /ltx/i,
    defaultTask: "video-generation",
    recommendedModes: ["t2v", "i2v"],
    minVramGb: 10,
    notes: "Compatível com pipelines LTX Video locais."
  },
  {
    family: "mochi",
    detector: /mochi/i,
    defaultTask: "video-generation",
    recommendedModes: ["t2v", "i2v"],
    minVramGb: 12,
    notes: "Compatível com Mochi local quando instalado."
  }
];

const MODEL_FILE_EXTENSIONS = new Set([
  ".safetensors",
  ".ckpt",
  ".bin",
  ".pt",
  ".pth"
]);

function exists(filePath = "") {
  try {
    return Boolean(filePath) && fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function detectFamily(value = "") {
  const normalized = String(value || "");
  return KNOWN_FAMILIES.find((item) => item.detector.test(normalized)) || null;
}

function listChildDirectories(rootPath = "") {
  if (!exists(rootPath)) {
    return [];
  }

  try {
    return fs.readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootPath, entry.name));
  } catch {
    return [];
  }
}

function listFilesSafe(rootPath = "") {
  if (!exists(rootPath)) {
    return [];
  }

  try {
    return fs.readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(rootPath, entry.name));
  } catch {
    return [];
  }
}

function pickFirstExisting(paths = []) {
  return ensureArray(paths).find((candidate) => exists(candidate)) || "";
}

function resolvePrecisionFromName(value = "") {
  const normalized = String(value || "").toLowerCase();
  if (/\bfp8\b/.test(normalized)) return "fp8";
  if (/\bfp16|half\b/.test(normalized)) return "fp16";
  if (/\bbf16\b/.test(normalized)) return "bf16";
  if (/\bint8|8bit\b/.test(normalized)) return "int8";
  return "auto";
}

function resolveQuantizationFromName(value = "") {
  const normalized = String(value || "").toLowerCase();
  if (/\bgguf\b/.test(normalized)) return "gguf";
  if (/\bint8|8bit\b/.test(normalized)) return "int8";
  if (/\bint4|4bit\b/.test(normalized)) return "int4";
  return "none";
}

function inferTaskFromName(value = "") {
  const normalized = String(value || "").toLowerCase();
  if (/\bimage.?to.?video|i2v\b/.test(normalized)) return "image-to-video";
  if (/\btext.?to.?video|t2v\b/.test(normalized)) return "text-to-video";
  return "video-generation";
}

function buildRegistryEntry(modelDir = "") {
  const name = path.basename(modelDir);
  const family = detectFamily(name) || detectFamily(modelDir) || {
    family: "generic-video",
    defaultTask: "video-generation",
    recommendedModes: ["t2v", "i2v"],
    minVramGb: 8,
    notes: "Modelo local detectado sem família específica mapeada."
  };

  const files = listFilesSafe(modelDir);
  const childDirs = listChildDirectories(modelDir);
  const modelFile = pickFirstExisting(files.filter((filePath) => MODEL_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase())));
  const modelIndexPath = pickFirstExisting([path.join(modelDir, "model_index.json")]);
  const vaePath = pickFirstExisting([
    path.join(modelDir, "vae"),
    path.join(modelDir, "vae.safetensors"),
    ...files.filter((filePath) => /vae/i.test(path.basename(filePath)))
  ]);
  const textEncoderPath = pickFirstExisting([
    path.join(modelDir, "text_encoder"),
    path.join(modelDir, "text_encoder_2"),
    ...childDirs.filter((dirPath) => /text[_-]?encoder/i.test(path.basename(dirPath)))
  ]);
  const clipVisionPath = pickFirstExisting([
    path.join(modelDir, "clip_vision"),
    path.join(modelDir, "image_encoder"),
    ...childDirs.filter((dirPath) => /clip|vision|image[_-]?encoder/i.test(path.basename(dirPath)))
  ]);
  const loras = childDirs
    .filter((dirPath) => /lora/i.test(path.basename(dirPath)))
    .map((dirPath) => ({
      id: normalizeId(path.basename(dirPath)),
      path: dirPath
    }));

  const modelPath = modelFile || modelIndexPath || modelDir;

  return {
    id: normalizeId(name),
    family: family.family,
    task: inferTaskFromName(name) || family.defaultTask,
    modelPath,
    vaePath: vaePath || "",
    textEncoderPath: textEncoderPath || "",
    clipVisionPath: clipVisionPath || "",
    loras,
    precision: resolvePrecisionFromName(name),
    quantization: resolveQuantizationFromName(name),
    recommendedModes: family.recommendedModes,
    minVramGb: family.minVramGb,
    notes: family.notes,
    available: exists(modelPath),
    sourceDir: modelDir
  };
}

function discoverVideoModelDirectories() {
  const directories = [];
  for (const rootPath of VIDEO_MODEL_ROOTS) {
    if (!exists(rootPath)) {
      continue;
    }

    directories.push(...listChildDirectories(rootPath).filter((dirPath) => detectFamily(dirPath)));
  }

  const seen = new Set();
  return directories.filter((dirPath) => {
    const key = path.resolve(dirPath);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function listVideoModels() {
  return discoverVideoModelDirectories()
    .map(buildRegistryEntry)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function getVideoModelRegistry() {
  return {
    roots: VIDEO_MODEL_ROOTS,
    models: listVideoModels()
  };
}

export function resolveVideoModel({ requestedModel = "", mode = "" } = {}) {
  const registry = listVideoModels();
  const requestedId = normalizeId(requestedModel);
  const requestedLower = String(requestedModel || "").toLowerCase();

  if (requestedId) {
    const direct = registry.find((entry) => entry.id === requestedId || String(entry.modelPath || "").toLowerCase() === requestedLower);
    if (direct) {
      return direct;
    }
  }

  const compatible = registry.find((entry) => ensureArray(entry.recommendedModes).includes(mode));
  return compatible || null;
}
