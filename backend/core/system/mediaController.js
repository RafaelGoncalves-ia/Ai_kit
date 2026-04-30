import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { searchLocalMusic } from "./musicSearch.js";

const CONFIG_PATH = path.resolve("backend/config/player.music.json");
const MEDIA_PATHS_CONFIG = path.resolve("backend/config/mediaPaths.json");

function stripAccents(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalize(text) {
  return stripAccents(text).toLowerCase().trim();
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    return {
      defaultProvider: "local",
      providers: {
        local: { enabled: true, folders: [] },
        youtube: { enabled: true }
      }
    };
  }
}

function loadMediaPaths() {
  try {
    const raw = JSON.parse(fs.readFileSync(MEDIA_PATHS_CONFIG, "utf8"));
    const folders = Array.isArray(raw?.musicFolders)
      ? raw.musicFolders
      : Array.isArray(raw?.folders)
        ? raw.folders
        : Array.isArray(raw?.media?.music)
          ? raw.media.music
          : [];

    return folders.map((folder) => String(folder || "").trim()).filter(Boolean);
  } catch (err) {
    return [];
  }
}

function runDetachedStart(command) {
  const child = spawn("cmd.exe", ["/d", "/s", "/c", command], {
    detached: true,
    stdio: "ignore",
    windowsVerbatimArguments: true
  });
  child.unref();
}

function openLocalFile(filePath) {
  const rawFilePath = String(filePath || "").trim().replace(/"/g, "");
  if (!rawFilePath) {
    return;
  }

  runDetachedStart(`start "" "${rawFilePath}"`);
}

function openExternalUrl(url) {
  const rawUrl = String(url || "").trim().replace(/"/g, "");
  if (!rawUrl) {
    return;
  }

  runDetachedStart(`start "" "${rawUrl}"`);
}

function cleanSearchQuery(query) {
  return normalize(query)
    .replace(/\b(kita|kit)\b/g, "")
    .replace(/\b(toca|tocar|toque|coloca|colocar|coloque|ouvir|ouve|escutar|escute)\b/g, "")
    .replace(/\b(musica|som|faixa|playlist)\b/g, "")
    .replace(/\b(no|na)\s+youtube\b/g, "")
    .replace(/\byoutube\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findLocalMusic(query, folders) {
  const cleanedQuery = cleanSearchQuery(query);
  if (!cleanedQuery) {
    return null;
  }

  const matches = searchLocalMusic(cleanedQuery, folders);
  return matches[0] || null;
}

function openYoutube(query) {
  const cleaned = cleanSearchQuery(query) || normalize(query);
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleaned)}`;
  openExternalUrl(url);
}

export async function playMedia(input = {}) {
  const query = input.query || input.text || input.prompt;
  const cleanedQuery = cleanSearchQuery(query);

  if (!query || !cleanedQuery) {
    return {
      status: "need_input",
      success: false,
      question: "O que voce quer tocar?",
      key: "query"
    };
  }

  const config = loadConfig();
  const mediaFolders = loadMediaPaths();
  const localFolders = mediaFolders.length
    ? mediaFolders
    : (config.providers?.local?.folders || []);

  if (config.providers?.local?.enabled) {
    const match = findLocalMusic(query, localFolders);

    if (match?.path) {
      openLocalFile(match.path);
      return {
        status: "ok",
        success: true,
        provider: "local",
        type: "local",
        file: match.path,
        score: match.score,
        message: `Tocando local: ${match.fileName}`
      };
    }
  }

  if (config.providers?.youtube?.enabled) {
    openYoutube(query);
    return {
      status: "ok",
      success: true,
      provider: "youtube",
      type: "youtube",
      query: cleanSearchQuery(query) || String(query || "").trim(),
      message: "Abrindo busca no YouTube."
    };
  }

  return {
    status: "error",
    success: false,
    error: "NO_PROVIDER_AVAILABLE"
  };
}
