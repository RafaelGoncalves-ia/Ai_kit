const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const CONFIG_DIR = __dirname;
const LOCAL_CONFIG_PATH = path.join(CONFIG_DIR, "stable-diffusion.local.json");
const EXAMPLE_CONFIG_PATH = path.join(CONFIG_DIR, "stable-diffusion.example.json");
const KIT_PYTHON_PATH = path.join(ROOT_DIR, "venv", "Scripts", "python.exe");

const DEFAULT_CONFIG = {
  pythonPath: KIT_PYTHON_PATH,
  modelsRoot: "models",
  checkpointsPath: path.join("models", "stable-diffusion"),
  lorasPath: path.join("models", "lora"),
  diffusionModelsPath: path.join("models", "diffusers"),
  originalConfigsPath: path.join("models", "configs"),
  outputPath: path.join("output", "sd"),
  hfHome: path.join("cache", "huggingface"),
  hfHubCache: path.join("cache", "huggingface", "hub"),
  transformersCache: path.join("cache", "huggingface", "transformers")
};

const REQUIRED_FIELDS = [
  "pythonPath",
  "modelsRoot",
  "checkpointsPath",
  "lorasPath",
  "diffusionModelsPath",
  "originalConfigsPath",
  "outputPath",
  "hfHome",
  "hfHubCache",
  "transformersCache"
];

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function resolveProjectPath(value, fallback) {
  const selected = String(value || fallback || "").trim();
  if (!selected) {
    return "";
  }

  return path.resolve(ROOT_DIR, selected);
}

function resolveExecutablePath(value, fallback) {
  const selected = String(value || fallback || "").trim();
  if (!selected) {
    return "python";
  }

  if (path.isAbsolute(selected) || /^[a-zA-Z]:[\\/]/.test(selected)) {
    return path.normalize(selected);
  }

  if (selected.includes("\\") || selected.includes("/")) {
    return path.resolve(ROOT_DIR, selected);
  }

  return selected;
}

function pathStatus(filePath) {
  if (!filePath || filePath === "python") {
    return {
      exists: false,
      kind: "command"
    };
  }

  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      kind: "missing"
    };
  }

  const stats = fs.statSync(filePath);
  return {
    exists: true,
    kind: stats.isDirectory() ? "directory" : "file"
  };
}

function directoryWritableStatus(directoryPath) {
  if (!directoryPath) {
    return {
      writable: false,
      error: "Caminho vazio."
    };
  }

  try {
    fs.mkdirSync(directoryPath, { recursive: true });
    const probePath = path.join(directoryPath, `.kit-write-test-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probePath, "ok", "utf8");
    fs.unlinkSync(probePath);
    return {
      writable: true,
      error: null
    };
  } catch (err) {
    return {
      writable: false,
      error: err.message || String(err)
    };
  }
}

function loadRawStableDiffusionConfig() {
  const localConfig = readJsonFile(LOCAL_CONFIG_PATH);
  if (localConfig) {
    return {
      source: LOCAL_CONFIG_PATH,
      data: localConfig
    };
  }

  const exampleConfig = readJsonFile(EXAMPLE_CONFIG_PATH);
  if (exampleConfig) {
    return {
      source: EXAMPLE_CONFIG_PATH,
      data: exampleConfig
    };
  }

  return {
    source: "defaults",
    data: DEFAULT_CONFIG
  };
}

function normalizeStableDiffusionConfig(rawConfig = {}) {
  const merged = {
    ...DEFAULT_CONFIG,
    ...(rawConfig || {})
  };

  const config = {
    pythonPath: resolveExecutablePath(KIT_PYTHON_PATH, DEFAULT_CONFIG.pythonPath),
    modelsRoot: resolveProjectPath(process.env.SD_MODELS_ROOT || merged.modelsRoot, DEFAULT_CONFIG.modelsRoot),
    checkpointsPath: resolveProjectPath(process.env.SD_CHECKPOINTS_PATH || merged.checkpointsPath, DEFAULT_CONFIG.checkpointsPath),
    lorasPath: resolveProjectPath(process.env.SD_LORAS_PATH || merged.lorasPath, DEFAULT_CONFIG.lorasPath),
    diffusionModelsPath: resolveProjectPath(
      process.env.SD_DIFFUSION_MODELS_PATH || merged.diffusionModelsPath,
      DEFAULT_CONFIG.diffusionModelsPath
    ),
    originalConfigsPath: resolveProjectPath(
      process.env.SD_ORIGINAL_CONFIGS_PATH || merged.originalConfigsPath,
      DEFAULT_CONFIG.originalConfigsPath
    ),
    outputPath: resolveProjectPath(process.env.SD_OUTPUT_PATH || merged.outputPath, DEFAULT_CONFIG.outputPath),
    hfHome: resolveProjectPath(process.env.HF_HOME || merged.hfHome, DEFAULT_CONFIG.hfHome),
    hfHubCache: resolveProjectPath(
      process.env.HUGGINGFACE_HUB_CACHE || merged.hfHubCache,
      DEFAULT_CONFIG.hfHubCache
    ),
    transformersCache: resolveProjectPath(
      process.env.TRANSFORMERS_CACHE || merged.transformersCache,
      DEFAULT_CONFIG.transformersCache
    )
  };

  const errors = REQUIRED_FIELDS
    .filter((field) => !String(config[field] || "").trim())
    .map((field) => `Campo obrigatorio ausente: ${field}`);

  const warnings = [];
  for (const field of REQUIRED_FIELDS) {
    const status = pathStatus(config[field]);
    const isCreatableDirectory = ["outputPath", "hfHome", "hfHubCache", "transformersCache"].includes(field);
    if (!status.exists && field !== "pythonPath" && !isCreatableDirectory) {
      warnings.push(`Caminho nao encontrado: ${field}=${config[field]}`);
    }
    if (!status.exists && field === "pythonPath" && status.kind !== "command") {
      warnings.push(`Python do SD nao encontrado: ${config[field]}`);
    }
  }

  const cacheWritable = {
    hfHome: directoryWritableStatus(config.hfHome),
    hfHubCache: directoryWritableStatus(config.hfHubCache),
    transformersCache: directoryWritableStatus(config.transformersCache),
    outputPath: directoryWritableStatus(config.outputPath)
  };

  for (const [field, status] of Object.entries(cacheWritable)) {
    if (!status.writable) {
      warnings.push(`Diretorio sem permissao de escrita: ${field}=${config[field]} (${status.error})`);
    }
  }

  return {
    ...config,
    valid: errors.length === 0,
    errors,
    warnings,
    exists: {
      pythonPath: pathStatus(config.pythonPath),
      modelsRoot: pathStatus(config.modelsRoot),
      checkpointsPath: pathStatus(config.checkpointsPath),
      lorasPath: pathStatus(config.lorasPath),
      diffusionModelsPath: pathStatus(config.diffusionModelsPath),
      originalConfigsPath: pathStatus(config.originalConfigsPath),
      outputPath: pathStatus(config.outputPath),
      hfHome: pathStatus(config.hfHome),
      hfHubCache: pathStatus(config.hfHubCache),
      transformersCache: pathStatus(config.transformersCache)
    },
    writable: cacheWritable
  };
}

function loadStableDiffusionConfig() {
  const raw = loadRawStableDiffusionConfig();
  const normalized = normalizeStableDiffusionConfig(raw.data);
  return {
    ...normalized,
    source: raw.source,
    localConfigPath: LOCAL_CONFIG_PATH,
    exampleConfigPath: EXAMPLE_CONFIG_PATH
  };
}

function buildStableDiffusionWorkerEnv(config = loadStableDiffusionConfig()) {
  return {
    SD_PYTHON_PATH: config.pythonPath,
    SD_MODELS_ROOT: config.modelsRoot,
    SD_CHECKPOINTS_PATH: config.checkpointsPath,
    SD_LORAS_PATH: config.lorasPath,
    SD_DIFFUSION_MODELS_PATH: config.diffusionModelsPath,
    SD_ORIGINAL_CONFIGS_PATH: config.originalConfigsPath,
    SD_OUTPUT_PATH: config.outputPath,
    HF_HOME: config.hfHome,
    HUGGINGFACE_HUB_CACHE: config.hfHubCache,
    TRANSFORMERS_CACHE: config.transformersCache
  };
}

module.exports = {
  DEFAULT_CONFIG,
  EXAMPLE_CONFIG_PATH,
  LOCAL_CONFIG_PATH,
  ROOT_DIR,
  buildStableDiffusionWorkerEnv,
  loadStableDiffusionConfig,
  normalizeStableDiffusionConfig
};
