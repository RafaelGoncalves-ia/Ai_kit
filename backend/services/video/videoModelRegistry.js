import fs from "fs";
import path from "path";

const ROOT_DIR = path.resolve(process.cwd());
const MODELS_ROOT = process.env.SD_MODELS_ROOT || "F:\\AI\\models";
const VIDEO_MODEL_ROOTS = [
  path.join(MODELS_ROOT, "diffusion_models"),
  path.join(ROOT_DIR, "models", "diffusion_models")
];
const VIDEO_LORA_ROOTS = [
  path.join(MODELS_ROOT, "loras"),
  path.join(MODELS_ROOT, "loras", "Wan"),
  path.join(MODELS_ROOT, "loras", "wan"),
  path.join(ROOT_DIR, "models", "loras")
];
const PREVIEW_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
const MODEL_FILE_EXTENSIONS = new Set([
  ".safetensors",
  ".gguf",
  ".ckpt",
  ".bin",
  ".pt",
  ".pth"
]);
const IMAGE_MODEL_SEGMENT_REGEX = /[\\/](checkpoints|sd15|sdxl)([\\/]|$)/i;
const DIFFUSERS_MARKERS = ["model_index.json", "scheduler", "text_encoder", "tokenizer", "unet", "vae"];

const KNOWN_FAMILIES = [
  {
    family: "wan",
    detector: /wan/i,
    defaultTask: "video-generation",
    recommendedModes: ["t2v", "i2v"],
    minVramGb: 12,
    notes: "Compatível com pipelines Wan para vídeo local."
  },
  {
    family: "hunyuan",
    detector: /hunyuan/i,
    defaultTask: "video-generation",
    recommendedModes: ["t2v", "i2v"],
    minVramGb: 12,
    notes: "Compatível com Hunyuan Video local."
  },
  {
    family: "cogvideo",
    detector: /cogvideo|cog-video/i,
    defaultTask: "video-generation",
    recommendedModes: ["t2v", "i2v"],
    minVramGb: 16,
    notes: "Compatível com CogVideo local."
  },
  {
    family: "ltx-video",
    detector: /ltx/i,
    defaultTask: "video-generation",
    recommendedModes: ["t2v", "i2v"],
    minVramGb: 10,
    notes: "Compatível com LTX Video local."
  },
  {
    family: "mochi",
    detector: /mochi/i,
    defaultTask: "video-generation",
    recommendedModes: ["t2v", "i2v"],
    minVramGb: 12,
    notes: "Compatível com Mochi local."
  }
];

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

function uniquePaths(paths = []) {
  const seen = new Set();
  return ensureArray(paths)
    .map((item) => path.resolve(String(item)))
    .filter((item) => {
      if (!item || seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
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

function pickPreviewForPath(filePath = "") {
  const parsed = path.parse(filePath);
  for (const extension of PREVIEW_EXTENSIONS) {
    const candidate = path.join(parsed.dir, `${parsed.name}${extension}`);
    if (exists(candidate)) {
      return candidate;
    }
  }
  return "";
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

function isDiffusersModelDirectory(directory = "") {
  if (!exists(directory)) {
    return false;
  }
  const markerCount = DIFFUSERS_MARKERS.reduce((count, marker) => (
    count + (exists(path.join(directory, marker)) ? 1 : 0)
  ), 0);
  return markerCount >= 2 || exists(path.join(directory, "model_index.json"));
}

function createFamilyFallback(value = "") {
  return detectFamily(value) || {
    family: "generic-video",
    defaultTask: "video-generation",
    recommendedModes: ["t2v", "i2v"],
    minVramGb: 8,
    notes: "Modelo de vídeo local detectado sem família mapeada."
  };
}

function buildModelEntry(modelPath = "", sourceRoot = "") {
  const modelName = path.basename(modelPath, path.extname(modelPath));
  const family = createFamilyFallback(modelName || modelPath);
  return {
    id: normalizeId(modelName || modelPath),
    name: modelName || path.basename(modelPath),
    family: family.family,
    task: inferTaskFromName(modelName) || family.defaultTask,
    modelPath,
    preview: pickPreviewForPath(modelPath),
    precision: resolvePrecisionFromName(modelName),
    quantization: resolveQuantizationFromName(modelName),
    recommendedModes: family.recommendedModes,
    minVramGb: family.minVramGb,
    notes: family.notes,
    available: exists(modelPath),
    sourceDir: path.dirname(modelPath),
    sourceRoot,
    type: "video-model"
  };
}

function buildDiffusersEntry(modelDir = "", sourceRoot = "") {
  const name = path.basename(modelDir);
  const family = createFamilyFallback(name || modelDir);
  const modelIndexPath = path.join(modelDir, "model_index.json");
  const preview = PREVIEW_EXTENSIONS
    .map((extension) => path.join(modelDir, `${name}${extension}`))
    .find((candidate) => exists(candidate)) || "";
  return {
    id: normalizeId(name),
    name,
    family: family.family,
    task: inferTaskFromName(name) || family.defaultTask,
    modelPath: exists(modelIndexPath) ? modelIndexPath : modelDir,
    preview,
    precision: resolvePrecisionFromName(name),
    quantization: resolveQuantizationFromName(name),
    recommendedModes: family.recommendedModes,
    minVramGb: family.minVramGb,
    notes: family.notes,
    available: true,
    sourceDir: modelDir,
    sourceRoot,
    type: "video-model"
  };
}

function walkVideoModels(rootPath = "", items = []) {
  if (!exists(rootPath)) {
    return items;
  }
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      if (isDiffusersModelDirectory(fullPath)) {
        items.push(buildDiffusersEntry(fullPath, rootPath));
        continue;
      }
      walkVideoModels(fullPath, items);
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (!MODEL_FILE_EXTENSIONS.has(extension)) {
      continue;
    }
    items.push(buildModelEntry(path.resolve(fullPath), rootPath));
  }
  return items;
}

function listVideoLoraFiles() {
  const items = [];
  const seen = new Set();
  for (const rootPath of uniquePaths(VIDEO_LORA_ROOTS).filter((item) => exists(item))) {
    const walk = (directory) => {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        const extension = path.extname(entry.name).toLowerCase();
        if (!MODEL_FILE_EXTENSIONS.has(extension)) {
          continue;
        }
        const resolved = path.resolve(fullPath);
        if (seen.has(resolved)) {
          continue;
        }
        seen.add(resolved);
        const name = path.basename(entry.name, extension);
        const isWan = /[\\/]wan([\\/]|$)/i.test(resolved) || /\bwan\b/i.test(name);
        items.push({
          id: normalizeId(name),
          name,
          path: resolved,
          preview: pickPreviewForPath(resolved),
          originRoot: rootPath,
          originLabel: rootPath.toLowerCase().includes(`${path.sep}wan`) ? "Wan" : "Geral",
          familyHint: isWan ? "wan" : "generic",
          compatibilityWarning: isWan
            ? ""
            : "Esta LoRA pode nao ser compativel com todos os motores de video.",
          type: "lora"
        });
      }
    };
    walk(rootPath);
  }
  return items.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

export function isImageModelPath(value = "") {
  return IMAGE_MODEL_SEGMENT_REGEX.test(String(value || ""));
}

export function listVideoModels() {
  const entries = [];
  const seen = new Set();
  for (const rootPath of uniquePaths(VIDEO_MODEL_ROOTS).filter((item) => exists(item))) {
    for (const entry of walkVideoModels(rootPath, [])) {
      const key = path.resolve(entry.modelPath || entry.sourceDir || entry.name || "");
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      entries.push(entry);
    }
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

export function getVideoModelRegistry() {
  return {
    roots: uniquePaths(VIDEO_MODEL_ROOTS),
    loraRoots: uniquePaths(VIDEO_LORA_ROOTS),
    models: listVideoModels(),
    loras: listVideoLoraFiles()
  };
}

export function resolveVideoModel({ requestedModel = "", mode = "" } = {}) {
  const registry = listVideoModels();
  const requestedId = normalizeId(requestedModel);
  const requestedLower = String(requestedModel || "").trim().toLowerCase();

  if (requestedId) {
    const direct = registry.find((entry) => (
      entry.id === requestedId ||
      String(entry.modelPath || "").trim().toLowerCase() === requestedLower ||
      String(entry.name || "").trim().toLowerCase() === requestedLower
    ));
    if (direct) {
      return direct;
    }
    return null;
  }

  const compatible = registry.find((entry) => ensureArray(entry.recommendedModes).includes(mode));
  return compatible || registry[0] || null;
}
