import crypto from "crypto";
import fs from "fs";
import path from "path";

const DEFAULT_MODEL_ROOT = "F:\\AI\\models";
const CACHE_DIR = path.resolve(process.cwd(), "backend", "cache");
const CACHE_PATH = path.join(CACHE_DIR, "model-registry.json");
const CACHE_TTL_MS = 30000;

const MODEL_EXTENSIONS = new Set([
  ".safetensors",
  ".ckpt",
  ".gguf",
  ".bin",
  ".pt",
  ".pth",
  ".onnx"
]);
const AUXILIARY_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".json", ".txt", ".civitai.info"];
const PREVIEW_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
const METADATA_EXTENSIONS = [".json", ".civitai.info"];
const NOTES_EXTENSIONS = [".txt"];

const CAPABILITIES = {
  sd15: {
    txt2img: true, img2img: true, batchImg2Img: true, inpaint: true, controlnet: true,
    lora: true, vae: true, negativePrompt: true, sampler: true, cfg: true, gif: false, video: false
  },
  sdxl: {
    txt2img: true, img2img: true, batchImg2Img: true, inpaint: true, controlnet: true,
    lora: true, vae: true, negativePrompt: true, sampler: true, cfg: true, highResolution: true, gif: false, video: false
  },
  zit: {
    txt2img: true, img2img: false, batchImg2Img: false, inpaint: false, controlnet: false,
    lora: false, vae: false, negativePrompt: false, sampler: false, cfg: "limited", turbo: true, gif: false, video: false
  },
  zib: {
    txt2img: true, img2img: false, batchImg2Img: false, inpaint: false, controlnet: false,
    lora: false, vae: false, negativePrompt: false, sampler: false, cfg: "limited", turbo: true, gif: false, video: false
  },
  flux: {
    txt2img: true, img2img: true, batchImg2Img: false, inpaint: false, controlnet: false,
    lora: true, vae: true, negativePrompt: "limited", sampler: "engine-specific", cfg: "engine-specific", gif: false, video: false
  },
  wan: {
    t2v: true, i2v: true, video: true, lora: true, negativePrompt: true, temporal: true,
    sampler: "engine-specific", cfg: "engine-specific", gif: false
  },
  animatediff: {
    txt2gif: true, img2gif: true, txt2videoLite: true, img2videoLite: true, gif: true, mp4: true,
    video: "lite", baseModelRequired: true, motionModuleRequired: true, compatibleBaseModels: ["sd15", "sdxl"],
    lora: true, controlnet: true, negativePrompt: true, sampler: true, cfg: true
  },
  svd: {
    i2v: true, video: true, gif: false, baseImageRequired: true, temporal: true,
    sampler: "engine-specific", cfg: "engine-specific"
  },
  hunyuan: {
    t2v: true, i2v: true, video: true, temporal: true, lora: true, negativePrompt: true,
    sampler: "engine-specific", cfg: "engine-specific"
  }
};

const RECOMMENDED_PARAMS = {
  sd15: { steps: 20, cfg: 7, width: 512, height: 512, sampler: "Euler a" },
  sdxl: { steps: 30, cfg: 6, width: 1024, height: 1024, sampler: "DPM++ 2M Karras" },
  zit: { steps: 4, cfg: 1, width: 1024, height: 1024, mode: "turbo" },
  zib: { steps: 4, cfg: 1, width: 1024, height: 1024, mode: "turbo" },
  flux: { steps: 20, cfg: 1, width: 1024, height: 1024, mode: "flux" },
  wan: { steps: 20, cfg: 5, durationSeconds: 5, fps: 16, width: 512, height: 512 },
  animatediff: { steps: 20, cfg: 7, frames: 16, fps: 8, width: 512, height: 512, output: "gif", sampler: "Euler a" },
  svd: { frames: 14, fps: 7, width: 576, height: 1024, motionBucketId: 127, condAug: 0.02 },
  hunyuan: { steps: 20, cfg: 6, durationSeconds: 5, fps: 16, width: 512, height: 512 }
};

function resolveModelRoot() {
  return path.resolve(process.env.MODEL_ROOT || process.env.SD_MODELS_ROOT || DEFAULT_MODEL_ROOT);
}

function normalizeComparable(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\\/g, "/");
}

function hashId(value = "") {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 16);
}

function sizeLabel(bytes = 0) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index >= 2 ? 2 : 0)} ${units[index]}`;
}

function isInsideRoot(filePath = "", root = "") {
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function cleanName(fileName = "") {
  return path.basename(fileName, path.extname(fileName)).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function findSibling(filePath = "", extensions = []) {
  const parsed = path.parse(filePath);
  for (const extension of extensions) {
    const candidate = path.join(parsed.dir, `${parsed.name}${extension}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function logFound(entry) {
  if (entry.type === "video") console.log(`[MODEL_REGISTRY] found video model ${entry.relativePath}`);
  else if (entry.type === "motion-module") console.log(`[MODEL_REGISTRY] found animatediff motion module ${entry.relativePath}`);
  else if (entry.type === "lora") console.log(`[MODEL_REGISTRY] found lora ${entry.relativePath}`);
  else if (entry.type === "vae") console.log(`[MODEL_REGISTRY] found vae ${entry.relativePath}`);
  else if (entry.type === "image") console.log(`[MODEL_REGISTRY] found image model ${entry.relativePath}`);
}

function defaultEntry({ filePath, root, stat, type = "unknown", engine = "unknown", family = "asset", category = "auxiliary", compatibleWith = [], warning = null }) {
  const relativePath = path.relative(root, filePath);
  const extension = path.extname(filePath).toLowerCase();
  const previewPath = findSibling(filePath, PREVIEW_EXTENSIONS);
  const metadataPath = findSibling(filePath, METADATA_EXTENSIONS);
  const notesPath = findSibling(filePath, NOTES_EXTENSIONS);
  const entry = {
    id: hashId(relativePath.toLowerCase()),
    name: cleanName(path.basename(filePath)),
    fileName: path.basename(filePath),
    path: filePath,
    relativePath,
    extension,
    sizeBytes: Number(stat?.size || 0),
    sizeLabel: sizeLabel(stat?.size || 0),
    type,
    engine,
    family,
    category,
    compatibleWith,
    capabilities: CAPABILITIES[engine] ? { ...CAPABILITIES[engine] } : {},
    recommendedParams: RECOMMENDED_PARAMS[engine] ? { ...RECOMMENDED_PARAMS[engine] } : {},
    previewPath,
    metadataPath,
    notesPath,
    source: "global-models",
    isShared: true,
    lastModified: stat?.mtime ? stat.mtime.toISOString() : "",
    isUsableInCanvas: ["image", "video", "gif"].includes(type) && !["unknown"].includes(engine),
    warning
  };
  if (previewPath) console.log(`[MODEL_REGISTRY] linked preview ${path.relative(root, previewPath)}`);
  return entry;
}

function classifyByPath(filePath = "", root = "", stat = null) {
  const relativePath = path.relative(root, filePath);
  const normalized = normalizeComparable(relativePath);
  const name = normalizeComparable(path.basename(filePath));
  const extension = path.extname(filePath).toLowerCase();

  if (/^checkpoints\/sd15\//.test(normalized) && [".safetensors", ".ckpt"].includes(extension)) {
    return defaultEntry({ filePath, root, stat, type: "image", engine: "sd15", family: "stable-diffusion", category: "checkpoint", compatibleWith: ["sd15"] });
  }
  if (/^checkpoints\/sdxl\//.test(normalized) && [".safetensors", ".ckpt"].includes(extension)) {
    return defaultEntry({ filePath, root, stat, type: "image", engine: "sdxl", family: "stable-diffusion-xl", category: "checkpoint", compatibleWith: ["sdxl"] });
  }
  if (/^checkpoints\/zit\//.test(normalized) && [".safetensors", ".gguf", ".bin"].includes(extension)) {
    const engine = name.includes("zib") ? "zib" : "zit";
    return defaultEntry({ filePath, root, stat, type: "image", engine, family: "z-image", category: "checkpoint", compatibleWith: [engine] });
  }
  if (/^diffusion_models\//.test(normalized)) {
    if (/(wan|wan2|wan2\.1|wan2\.2|t2v|i2v)/i.test(name)) {
      return defaultEntry({ filePath, root, stat, type: "video", engine: "wan", family: "wan", category: "diffusion-model", compatibleWith: ["wan"] });
    }
    if (/(svd|stable-video|stable_video)/i.test(name)) {
      return defaultEntry({ filePath, root, stat, type: "video", engine: "svd", family: "svd", category: "diffusion-model", compatibleWith: ["svd"] });
    }
    if (/(hunyuan|hyvideo|hunyuanvideo)/i.test(name)) {
      return defaultEntry({ filePath, root, stat, type: "video", engine: "hunyuan", family: "hunyuan", category: "diffusion-model", compatibleWith: ["hunyuan"] });
    }
    if (/flux/i.test(name)) {
      return defaultEntry({ filePath, root, stat, type: "image", engine: "flux", family: "flux", category: "diffusion-model", compatibleWith: ["flux"] });
    }
  }
  if (/^loras\/sd15\//.test(normalized)) {
    return defaultEntry({ filePath, root, stat, type: "lora", engine: "lora", family: "asset", category: "lora", compatibleWith: ["sd15"] });
  }
  if (/^loras\/sdxl\//.test(normalized)) {
    return defaultEntry({ filePath, root, stat, type: "lora", engine: "lora", family: "asset", category: "lora", compatibleWith: ["sdxl"] });
  }
  if (/^loras\/wan\//.test(normalized)) {
    return defaultEntry({ filePath, root, stat, type: "lora", engine: "lora", family: "asset", category: "lora", compatibleWith: ["wan"] });
  }
  if (/^loras\/animdif\//.test(normalized)) {
    return defaultEntry({ filePath, root, stat, type: "lora", engine: "lora", family: "asset", category: "lora", compatibleWith: ["animatediff", "sd15", "sdxl"] });
  }
  if (/^loras\/(flux1d|flux2)\//.test(normalized)) {
    return defaultEntry({ filePath, root, stat, type: "lora", engine: "lora", family: "asset", category: "lora", compatibleWith: ["flux"] });
  }
  if (/^loras\/ilustrator\//.test(normalized)) {
    return defaultEntry({ filePath, root, stat, type: "lora", engine: "lora", family: "asset", category: "lora", compatibleWith: ["sd15", "sdxl", "zit"], warning: "mixed compatibility" });
  }
  if (/^loras\//.test(normalized)) {
    return defaultEntry({ filePath, root, stat, type: "lora", engine: "lora", family: "asset", category: "lora", compatibleWith: [] });
  }
  if (/^vae\//.test(normalized)) {
    return defaultEntry({ filePath, root, stat, type: "vae", engine: "vae", family: "asset", category: "vae", compatibleWith: ["sd15", "sdxl", "zit"] });
  }
  if (/^motion_modules\/animatediff\//.test(normalized) && [".ckpt", ".safetensors", ".pt"].includes(extension)) {
    return defaultEntry({ filePath, root, stat, type: "motion-module", engine: "animatediff", family: "animatediff", category: "motion-module", compatibleWith: ["sd15", "sdxl"] });
  }
  if (/^controlnet\//.test(normalized)) {
    return defaultEntry({ filePath, root, stat, type: "controlnet", engine: "unknown", family: "asset", category: "auxiliary", compatibleWith: ["sd15", "sdxl"] });
  }
  if (/^upscale_models\//.test(normalized) || /^latent_upscale_models\//.test(normalized)) {
    return defaultEntry({ filePath, root, stat, type: "upscale", engine: "unknown", family: "asset", category: "auxiliary", compatibleWith: [] });
  }
  if (/^(text_encoders|clip)\//.test(normalized)) {
    return defaultEntry({ filePath, root, stat, type: "text-encoder", engine: "unknown", family: "asset", category: "auxiliary", compatibleWith: [] });
  }
  if (/^clip_vision\//.test(normalized)) {
    return defaultEntry({ filePath, root, stat, type: "vision-encoder", engine: "unknown", family: "asset", category: "auxiliary", compatibleWith: [] });
  }
  return defaultEntry({ filePath, root, stat, warning: "unknown model type" });
}

function shouldIncludeFile(fileName = "") {
  const extension = path.extname(fileName).toLowerCase();
  return MODEL_EXTENSIONS.has(extension);
}

function walkModelFiles(root = "", directory = root, output = []) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (!isInsideRoot(path.resolve(fullPath), root)) continue;
    if (entry.isDirectory()) {
      walkModelFiles(root, fullPath, output);
      continue;
    }
    if (!shouldIncludeFile(entry.name)) continue;
    output.push(path.resolve(fullPath));
  }
  return output;
}

function buildCounts(models = []) {
  return models.reduce((acc, item) => {
    acc.total += 1;
    acc.byType[item.type] = (acc.byType[item.type] || 0) + 1;
    acc.byEngine[item.engine] = (acc.byEngine[item.engine] || 0) + 1;
    return acc;
  }, { total: 0, byType: {}, byEngine: {} });
}

export default class ModelRegistryService {
  constructor({ modelRoot = resolveModelRoot(), cachePath = CACHE_PATH, logger = console } = {}) {
    this.modelRoot = path.resolve(modelRoot || DEFAULT_MODEL_ROOT);
    this.cachePath = cachePath;
    this.logger = logger;
    this.memoryCache = null;
    this.memoryCacheAt = 0;
  }

  getModelRoot() {
    this.modelRoot = path.resolve(process.env.MODEL_ROOT || process.env.SD_MODELS_ROOT || this.modelRoot || DEFAULT_MODEL_ROOT);
    return this.modelRoot;
  }

  readCache() {
    try {
      if (!fs.existsSync(this.cachePath)) return null;
      const raw = fs.readFileSync(this.cachePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed?.modelRoot || !Array.isArray(parsed?.models)) return null;
      if (parsed.modelRoot !== this.getModelRoot()) return null;
      return parsed;
    } catch (err) {
      this.logger.warn?.(`[MODEL_REGISTRY][WARN] cache read failed ${err.message}`);
      return null;
    }
  }

  writeCache(registry) {
    fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
    fs.writeFileSync(this.cachePath, JSON.stringify(registry, null, 2), "utf8");
    console.log(`[MODEL_REGISTRY] cache updated ${this.cachePath}`);
  }

  isFresh(registry) {
    const scannedAt = Date.parse(registry?.scannedAt || "");
    return Number.isFinite(scannedAt) && Date.now() - scannedAt <= CACHE_TTL_MS;
  }

  async getRegistry({ refresh = false, reason = "read" } = {}) {
    const root = this.getModelRoot();
    if (!refresh && this.memoryCache && this.isFresh(this.memoryCache)) {
      return this.memoryCache;
    }
    const diskCache = !refresh ? this.readCache() : null;
    if (diskCache && this.isFresh(diskCache)) {
      this.memoryCache = diskCache;
      this.memoryCacheAt = Date.now();
      return diskCache;
    }
    return this.scan({ reason });
  }

  async scan({ reason = "manual" } = {}) {
    const root = this.getModelRoot();
    console.log(`[MODEL_REGISTRY] scanning ${root}`);
    if (!fs.existsSync(root)) {
      console.warn(`[MODEL_REGISTRY][WARN] path not found ${root}`);
      const empty = {
        success: true,
        modelRoot: root,
        scannedAt: new Date().toISOString(),
        reason,
        models: [],
        counts: buildCounts([]),
        warnings: [`Model root not found: ${root}`]
      };
      this.memoryCache = empty;
      this.writeCache(empty);
      return empty;
    }

    const files = walkModelFiles(root);
    const seen = new Set();
    const models = [];
    for (const filePath of files) {
      const resolved = path.resolve(filePath);
      if (seen.has(resolved) || !isInsideRoot(resolved, root)) continue;
      seen.add(resolved);
      const stat = fs.statSync(resolved);
      const entry = classifyByPath(resolved, root, stat);
      models.push(entry);
      logFound(entry);
    }

    models.sort((a, b) => a.type.localeCompare(b.type, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"));
    const registry = {
      success: true,
      modelRoot: root,
      scannedAt: new Date().toISOString(),
      reason,
      models,
      counts: buildCounts(models),
      warnings: []
    };
    this.memoryCache = registry;
    this.memoryCacheAt = Date.now();
    this.writeCache(registry);
    return registry;
  }

  async list(filter = {}, options = {}) {
    const registry = await this.getRegistry(options);
    const engine = String(filter.engine || "").toLowerCase();
    const type = String(filter.type || "").toLowerCase();
    const category = String(filter.category || "").toLowerCase();
    const compatible = String(filter.compatibleWith || "").toLowerCase();
    const context = String(filter.context || "").toLowerCase();
    let models = registry.models || [];
    if (engine) models = models.filter((item) => item.engine === engine || item.compatibleWith?.includes(engine));
    if (type) models = models.filter((item) => item.type === type);
    if (category) models = models.filter((item) => item.category === category);
    if (compatible) models = models.filter((item) => item.engine === compatible || item.compatibleWith?.includes(compatible));
    if (context === "image") {
      models = models.filter((item) => item.type === "image" || item.engine === "animatediff");
    }
    if (context === "video") {
      models = models.filter((item) => item.type === "video");
    }
    if (context === "gif") {
      models = models.filter((item) => item.engine === "animatediff" || item.type === "motion-module");
    }
    return { ...registry, models, counts: buildCounts(models) };
  }

  async findByEngine(engine, options = {}) {
    return this.list({ engine }, options);
  }

  async compatible(engine, options = {}) {
    return this.list({ compatibleWith: engine }, options);
  }
}

export {
  CAPABILITIES,
  RECOMMENDED_PARAMS,
  resolveModelRoot,
  AUXILIARY_EXTENSIONS
};
