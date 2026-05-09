const fs = require("fs");
const path = require("path");

const MODEL_FILE_EXTENSIONS = new Set([".safetensors", ".ckpt"]);
const PREVIEW_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".mp4"];
const DIFFUSERS_MARKERS = [
  "model_index.json",
  "scheduler",
  "text_encoder",
  "tokenizer",
  "unet",
  "vae"
];

function toModelName(fileName) {
  return path.basename(fileName, path.extname(fileName));
}

function findPreviewForFile(filePath) {
  const parsed = path.parse(filePath);
  for (const ext of PREVIEW_EXTENSIONS) {
    const candidate = path.join(parsed.dir, `${parsed.name}${ext}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function scanModelFiles(rootPath, type) {
  const items = [];
  const seen = new Set();

  function walk(directory) {
    if (!fs.existsSync(directory)) {
      return;
    }

    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!MODEL_FILE_EXTENSIONS.has(ext)) {
        continue;
      }

      const normalizedPath = path.resolve(fullPath);
      if (seen.has(normalizedPath)) {
        continue;
      }

      seen.add(normalizedPath);
      items.push({
        name: toModelName(entry.name),
        type,
        path: normalizedPath,
        preview: findPreviewForFile(normalizedPath),
        filename: entry.name,
        ext
      });
    }
  }

  walk(rootPath);
  return items.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function isDiffusersModelDirectory(directory) {
  if (!fs.existsSync(directory)) {
    return false;
  }

  const markerCount = DIFFUSERS_MARKERS.reduce((count, marker) => {
    return count + (fs.existsSync(path.join(directory, marker)) ? 1 : 0);
  }, 0);

  return markerCount >= 2 || fs.existsSync(path.join(directory, "model_index.json"));
}

function scanDiffusionModelDirs(rootPath) {
  const items = [];
  if (!fs.existsSync(rootPath)) {
    return items;
  }

  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = path.resolve(rootPath, entry.name);
    if (!isDiffusersModelDirectory(fullPath)) {
      continue;
    }

    items.push({
      name: entry.name,
      type: "diffusion_model",
      path: fullPath,
      preview: null,
      filename: entry.name,
      ext: ""
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function scanStableDiffusionModels(config) {
  return {
    checkpoints: scanModelFiles(config.checkpointsPath, "checkpoint"),
    loras: scanModelFiles(config.lorasPath, "lora"),
    diffusionModels: scanDiffusionModelDirs(config.diffusionModelsPath)
  };
}

module.exports = {
  MODEL_FILE_EXTENSIONS,
  PREVIEW_EXTENSIONS,
  scanDiffusionModelDirs,
  scanModelFiles,
  scanStableDiffusionModels
};
