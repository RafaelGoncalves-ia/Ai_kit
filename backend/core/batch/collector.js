import fs from "fs";
import path from "path";

const DEFAULT_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);

function walkFiles(basePath, files = [], extensions = DEFAULT_EXTENSIONS) {
  if (!basePath || !fs.existsSync(basePath)) {
    return files;
  }

  let entries = [];
  try {
    entries = fs.readdirSync(basePath, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(basePath, entry.name);

    if (entry.isDirectory()) {
      walkFiles(fullPath, files, extensions);
      continue;
    }

    if (extensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

export function collectBatchFiles(rootPath, options = {}) {
  const extensions = new Set(
    (Array.isArray(options.extensions) && options.extensions.length > 0
      ? options.extensions
      : [...DEFAULT_EXTENSIONS]
    ).map((value) => String(value || "").toLowerCase())
  );

  const files = walkFiles(rootPath, [], extensions);

  files.sort((a, b) => a.localeCompare(b, "pt-BR"));
  return files;
}
