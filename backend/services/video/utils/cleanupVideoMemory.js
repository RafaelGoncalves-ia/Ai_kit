import fs from "fs";

function safeRemove(filePath = "") {
  if (!filePath) {
    return false;
  }

  try {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { recursive: true, force: true });
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function cleanupVideoMemory({ transientFiles = [], transientDirs = [], runGc = true } = {}) {
  const removedFiles = transientFiles.filter(Boolean).filter((filePath) => safeRemove(filePath));
  const removedDirs = transientDirs.filter(Boolean).filter((dirPath) => safeRemove(dirPath));

  if (runGc && typeof global.gc === "function") {
    try {
      global.gc();
    } catch {
      // ignore optional gc failures
    }
  }

  return {
    removedFiles,
    removedDirs
  };
}

