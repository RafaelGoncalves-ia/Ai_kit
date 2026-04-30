import fs from "fs";
import path from "path";

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".m4a", ".ogg"]);

function stripAccents(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeMusicText(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeMusicText(value)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function collectAudioFiles(folder, results = []) {
  if (!folder || !fs.existsSync(folder)) {
    return results;
  }

  let entries = [];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch (err) {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);

    if (entry.isDirectory()) {
      collectAudioFiles(fullPath, results);
      continue;
    }

    if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }

  return results;
}

function buildRelativeFolders(filePath, rootFolder) {
  const relativeDir = path.relative(rootFolder, path.dirname(filePath));
  if (!relativeDir || relativeDir === ".") {
    return [];
  }

  return relativeDir
    .split(path.sep)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function scoreCandidate(query, candidate) {
  const normalizedQuery = normalizeMusicText(query);
  const queryTokens = tokenize(query);

  if (!normalizedQuery || !queryTokens.length) {
    return 0;
  }

  const fileName = normalizeMusicText(candidate.fileName);
  const folderText = normalizeMusicText(candidate.folders.join(" "));
  const combinedText = normalizeMusicText(`${candidate.fileName} ${candidate.folders.join(" ")}`);
  const combinedTokens = tokenize(combinedText);

  let score = 0;

  if (fileName === normalizedQuery) {
    score += 100;
  } else if (fileName.startsWith(normalizedQuery)) {
    score += 80;
  } else if (fileName.includes(normalizedQuery)) {
    score += 60;
  }

  if (folderText.includes(normalizedQuery)) {
    score += 40;
  }

  for (const token of queryTokens) {
    if (fileName === token) {
      score += 25;
      continue;
    }

    if (fileName.startsWith(token)) {
      score += 10;
      continue;
    }

    if (fileName.includes(token)) {
      score += token.length >= 4 ? 8 : 5;
      continue;
    }

    if (folderText.includes(token)) {
      score += token.length >= 4 ? 6 : 5;
      continue;
    }

    if (combinedTokens.some((entry) => entry.startsWith(token) || token.startsWith(entry))) {
      score += 5;
    }
  }

  return score;
}

export function searchLocalMusic(query, folders = []) {
  const normalizedQuery = normalizeMusicText(query);
  if (!normalizedQuery) {
    return [];
  }

  const validFolders = Array.isArray(folders)
    ? folders.map((folder) => String(folder || "").trim()).filter(Boolean)
    : [];

  const results = [];

  for (const rootFolder of validFolders) {
    const files = collectAudioFiles(rootFolder, []);

    for (const filePath of files) {
      const fileName = path.basename(filePath, path.extname(filePath));
      const foldersInPath = buildRelativeFolders(filePath, rootFolder);
      const score = scoreCandidate(query, { fileName, folders: foldersInPath });

      if (score < 20) {
        continue;
      }

      results.push({
        path: filePath,
        fileName,
        folders: foldersInPath,
        score
      });
    }
  }

  results.sort((a, b) => b.score - a.score || a.fileName.localeCompare(b.fileName));
  return results;
}
