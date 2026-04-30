import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";
import { captureScreen } from "../services/vision.js";
import {
  normalizeVisionDetailTokenBudget,
  resolveVisionDetailTokenBudget,
  logVisionDetailSelection
} from "./visionDetail.js";
import { launchApp } from "./system/appLauncher.js";
import { playMedia } from "./system/mediaController.js";
import { processBatchRequest } from "./batch/processBatch.js";
import { createWebSearchTool } from "../tools/webSearch/index.js";
import {
  WORKSPACE_ROOT,
  PROJECTS_ROOT,
  ensureWorkspace,
  resolveDataPath,
  ensureCompanyDataStructure,
  resolveSafePath,
  resolveSessionMediaPath
} from "./security/workspaceGuard.js";
import { initDB } from "../skills/memory/sqlite.js";
import {
  getRecentConversationMessages,
  getRelevantMemory,
  saveConversationMessage
} from "../skills/memory/memory.repository.js";

const VOICES_FILE = path.resolve("backend/config/vozesxtts.json");
const GENERATED_AUDIO_DIR = path.resolve("output");
const CANVAS_BRIDGE_URL = process.env.KIT_CANVAS_BRIDGE_URL || "http://127.0.0.1:31977/canvas-command";
const DEFAULT_VOICES = [
  { genre: "feminina", function: "locutora", voice: "Daisy Studious" },
  { genre: "masculina", function: "locutor", voice: "Alex Narrator" },
  { genre: "feminina", function: "narradora", voice: "Luna Story" },
  { genre: "masculina", function: "apresentador", voice: "Mateus Prime" },
  { genre: "feminina", function: "assistente", voice: "Clara Smart" }
];

function normalizeSafeName(value, fallback) {
  const normalized = String(value || fallback || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-");

  return normalized || fallback;
}

function getRawService(context, name) {
  return context.rawServices?.[name] || context.services?.[name];
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeAudioText(text) {
  return String(text || "")
    .replace(/[`]/g, "")
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, "")
    .trim();
}

function normalizeVisionGoal(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isDifferenceComparisonGoal(text) {
  const normalized = normalizeVisionGoal(text);
  return (
    /\b(diferenca|diferencas|compare|comparar|comparacao|mudanca|mudancas)\b/.test(normalized) &&
    /\b(cima|baixo|superior|inferior|duas imagens|imagem de cima|imagem de baixo)\b/.test(normalized)
  );
}

function isOCRLikeGoal(text) {
  const normalized = normalizeVisionGoal(text);
  if (!normalized) {
    return false;
  }

  return [
    "ocr",
    "texto",
    "ler",
    "leia",
    "escrito",
    "documento",
    "planilha",
    "pdf",
    "nota",
    "comprovante",
    "email",
    "campo",
    "label",
    "rotulo",
    "numero",
    "placa",
    "transcreva",
    "transcricao",
    "parse",
    "extrair",
    "extrai"
  ].some((term) => normalized.includes(term));
}

function isDetailedVisionGoal(text) {
  const normalized = normalizeVisionGoal(text);
  if (!normalized) {
    return false;
  }

  return [
    "detalh",
    "completa",
    "completo",
    "profunda",
    "profundo",
    "elabore",
    "elaborada",
    "descreva",
    "descricao",
    "analise",
    "liste",
    "todos",
    "todas",
    "sete erros",
    "7 erros"
  ].some((term) => normalized.includes(term));
}

function resolveImageTokenBudget(context, input = {}, payload = {}) {
  const explicitBudget = Number(
    input.imageTokenBudget ??
    input.image_token_budget ??
    0
  );

  if (explicitBudget > 0) {
    const normalizedExplicit = normalizeVisionDetailTokenBudget(explicitBudget);
    return normalizedExplicit === "auto" ? 280 : normalizedExplicit;
  }

  const selection = resolveVisionDetailTokenBudget(context.config, {
    source: input.source || input.meta?.source || "analyze-image",
    prompt: input.goal || input.prompt || "",
    mediaType: payload.mediaType || input.mediaType || "image"
  });
  logVisionDetailSelection(selection);
  return selection.selected;
}

function buildVisionAnalysisPrompt(goal) {
  if (!goal) {
    return "Descreva a imagem de forma objetiva e sem inventar.";
  }

  if (isOCRLikeGoal(goal)) {
    return `Analise a imagem com foco em leitura visual precisa.

Regras obrigatorias:
- Leia textos, numeros, labels, campos e elementos pequenos com o maximo de fidelidade possivel
- Se houver duvida em algum trecho, marque como "incerto" em vez de inventar
- Preserve nomes, codigos, valores, datas e identificadores exatamente como aparecem quando legiveis
- Se o pedido envolver OCR, documento, comprovante, planilha ou tela com texto, priorize isso acima de descricao geral

Pedido do usuario: ${goal}`;
  }

  if (isDifferenceComparisonGoal(goal)) {
    return `Compare cuidadosamente as duas imagens visiveis e liste todas as diferencas reais.

Regras obrigatorias:
- Compare a imagem de cima com a de baixo por regioes, da esquerda para a direita e de cima para baixo
- Procure mudancas de personagem, animal, objeto, quantidade, roupa, textura, cor, detalhe e elementos que sumiram ou apareceram
- Nao pare cedo; continue procurando ate esgotar as diferencas visiveis
- Se encontrar varias diferencas, liste todas
- Nao invente nem resuma em uma frase generica
- Se algo estiver incerto, marque como "incerto"

Formato da resposta:
1. [elemento/regiao]: Cima: ... | Baixo: ...
2. [elemento/regiao]: Cima: ... | Baixo: ...

Pedido do usuario: ${goal}`;
  }

  if (isDetailedVisionGoal(goal)) {
    return `Analise a imagem de forma objetiva, completa e sem inventar.

Regras obrigatorias:
- Nao resuma cedo; continue observando antes de concluir
- Descreva os elementos relevantes com o maximo de detalhe util
- Se o usuario pediu analise completa, cubra a cena inteira por partes
- Se houver multiplos itens, diferencas, objetos ou textos, liste o maximo que conseguir confirmar
- Se algo estiver incerto, marque como "incerto" em vez de inventar

Pedido do usuario: ${goal}`;
  }

  return `Analise a imagem de forma objetiva e sem inventar. Pedido do usuario: ${goal}`;
}

function buildAudioAnalysisPrompt(goal, transcript = "") {
  return [
    "Analise o audio de forma objetiva e sem inventar.",
    transcript
      ? "Use prioritariamente a transcricao abaixo como fonte da resposta. Se algo nao estiver presente nela, diga que nao foi possivel confirmar em vez de inventar."
      : "Use o audio anexado como fonte principal. Se este modelo/backend nao conseguir analisar audio nativamente com seguranca, diga isso explicitamente em vez de inventar.",
    goal ? `Pedido do usuario: ${goal}` : "Pedido do usuario: descreva o conteudo do audio.",
    transcript ? `Transcricao de apoio:\n${transcript}` : ""
  ].filter(Boolean).join("\n\n");
}

function buildVideoAnalysisPrompt(goal) {
  return [
    "Analise o video de forma objetiva e sem inventar.",
    "Descreva acao, contexto, elementos importantes e eventuais falas/sons perceptiveis.",
    goal ? `Pedido do usuario: ${goal}` : "Pedido do usuario: descreva o conteudo do video."
  ].join("\n\n");
}

function guessMimeTypeFromPath(filePath = "", fallback = "application/octet-stream") {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  const table = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".webm": "video/webm",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo"
  };

  return table[ext] || fallback;
}

function resolveMimeTypeForRequestedMedia(requestedType = "", detectedMimeType = "", filePath = "") {
  const normalizedRequestedType = String(requestedType || "").toLowerCase();
  const normalizedDetectedMimeType = String(detectedMimeType || "").toLowerCase();
  const ext = path.extname(String(filePath || "")).toLowerCase();

  if (normalizedRequestedType === "audio") {
    if (ext === ".webm" && normalizedDetectedMimeType === "video/webm") {
      return "audio/webm";
    }

    if (!normalizedDetectedMimeType || normalizedDetectedMimeType === "application/octet-stream") {
      if (ext === ".webm") return "audio/webm";
      if (ext === ".mp4" || ext === ".m4a") return "audio/mp4";
    }
  }

  if (normalizedRequestedType === "video") {
    if (ext === ".webm" && (!normalizedDetectedMimeType || normalizedDetectedMimeType === "application/octet-stream")) {
      return "video/webm";
    }
  }

  return detectedMimeType;
}

function normalizeMediaKind(inputType = "", mimeType = "", filePath = "") {
  const source = `${inputType} ${mimeType} ${filePath}`.toLowerCase();
  if (source.includes("audio")) return "audio";
  if (source.includes("video")) return "video";
  if (source.includes("screenshot")) return "screenshot";
  if (source.includes("image")) return "image";
  return "file";
}

function loadVoices() {
  try {
    if (fs.existsSync(VOICES_FILE)) {
      const raw = fs.readFileSync(VOICES_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("[TOOLS] Falha ao carregar vozes:", err.message);
  }

  return DEFAULT_VOICES;
}

function findVoiceMatch(query, voices) {
  const lowerQuery = normalize(query);
  if (!lowerQuery) return null;

  return (
    voices.find((voice) => normalize(voice.voice) === lowerQuery) ||
    voices.find((voice) => normalize(voice.voice).includes(lowerQuery)) ||
    voices.find((voice) => normalize(voice.function).includes(lowerQuery)) ||
    voices.find((voice) => normalize(voice.genre).includes(lowerQuery)) ||
    null
  );
}

function selectVoice(input = {}) {
  const voices = loadVoices();

  if (input.voice) {
    return findVoiceMatch(input.voice, voices) || { voice: input.voice };
  }

  if (input.voiceName) {
    return findVoiceMatch(input.voiceName, voices) || { voice: input.voiceName };
  }

  if (input.voiceFunction) {
    const byFunction = voices.find((voice) =>
      normalize(voice.function).includes(normalize(input.voiceFunction))
    );
    if (byFunction) return byFunction;
  }

  if (input.voiceGenre) {
    const byGenre = voices.find((voice) =>
      normalize(voice.genre).includes(normalize(input.voiceGenre))
    );
    if (byGenre) return byGenre;
  }

  return voices[0];
}

function getXTTSUrl() {
  const port = process.env.XTTS_PORT || 5005;
  return `http://localhost:${port}`;
}

async function speakXTTS(text, speaker, language = "pt") {
  const url = `${getXTTSUrl()}/speak`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speaker, language })
  });

  if (!response.ok) {
    throw new Error(`XTTS server HTTP ${response.status}`);
  }

  return response.json();
}

function getSTTUrl() {
  const port = process.env.STT_PORT || 5006;
  return `http://localhost:${port}`;
}

async function transcribeAudioFile(filePath) {
  const formData = new FormData();
  formData.append("audio", fs.createReadStream(filePath));

  const response = await fetch(`${getSTTUrl()}/transcribe`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`STT server HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  return String(data?.text || "").trim();
}

function wrapOk(data = {}) {
  return {
    status: "ok",
    data
  };
}

function wrapError(message, data = {}) {
  return {
    status: "error",
    error: message,
    data
  };
}

function hasMeaningfulText(value) {
  const text = String(value || "").trim();
  return text.length >= 3;
}

function shouldUseExternalAudioTranscriptionFallback(context, input = {}, payload = {}) {
  if (input.allowExternalTranscriptionFallback === true) {
    return true;
  }

  if (input.allowExternalTranscriptionFallback === false) {
    return false;
  }

  if (context.config?.system?.multimodal?.audioTranscriptionFallback === false) {
    return false;
  }

  const source = normalizeComparableText(input.source || input.meta?.source || "");
  const mediaPath = normalizeComparableText(payload.mediaPath || "");

  return (
    source.includes("wake") ||
    source.includes("listening") ||
    source.includes("microphone") ||
    source.includes("mic") ||
    mediaPath.includes("wake-audio")
  );
}

function normalizeComparableText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function dedupeTextLines(lines = []) {
  const seen = new Set();
  const output = [];

  for (const line of lines) {
    const normalized = normalizeComparableText(line);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(String(line || "").trim());
  }

  return output;
}

function detectMemoryContextType({ query = "", shortMessages = [] } = {}) {
  const queryText = normalizeComparableText(query);
  const historyText = normalizeComparableText(
    shortMessages
      .map((message) => message.content || message.text || "")
      .join(" ")
  );

  const workKeywords = [
    "trabalho", "trabalhar", "cliente", "empresa", "negocio", "projeto", "projetos",
    "codigo", "programacao", "arquitetura", "memoria", "banco", "deploy", "bug",
    "ticket", "demanda", "marketing", "site", "app", "adsune", "nity", "luzisol",
    "imobiliaria", "produtividade", "rotina"
  ];
  const leisureKeywords = [
    "lazer", "anime", "animes", "jogo", "jogos", "game", "games", "musica", "filme",
    "filmes", "serie", "series", "diversao", "entretenimento", "bleach", "naruto",
    "banda", "artista"
  ];

  const countMatches = (text, keywords = []) =>
    keywords.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0);

  const queryWorkHits = countMatches(queryText, workKeywords);
  const queryLeisureHits = countMatches(queryText, leisureKeywords);

  if (queryWorkHits > queryLeisureHits && queryWorkHits > 0) {
    return "trabalho";
  }

  if (queryLeisureHits > queryWorkHits && queryLeisureHits > 0) {
    return "lazer";
  }

  if (queryText) {
    return "neutro";
  }

  const historyWorkHits = countMatches(historyText, workKeywords);
  const historyLeisureHits = countMatches(historyText, leisureKeywords);

  if (historyWorkHits > historyLeisureHits && historyWorkHits > 0) {
    return "trabalho";
  }

  if (historyLeisureHits > historyWorkHits && historyLeisureHits > 0) {
    return "lazer";
  }

  return "neutro";
}

function isVisualMemorySensitiveQuery(query = "") {
  const text = normalizeComparableText(query);
  if (!text) {
    return false;
  }

  return [
    "tela",
    "print",
    "screenshot",
    "imagem",
    "foto",
    "veja",
    "olha",
    "descreva a imagem",
    "descreva a tela",
    "analise a imagem",
    "analise a tela",
    "diferenca",
    "diferencas",
    "compare",
    "comparar"
  ].some((term) => text.includes(term));
}

function resolveMemoryBucket(category = "", memoryConfig = {}) {
  const categoryId = normalizeComparableText(category);
  const configCategories = Array.isArray(memoryConfig.categories) ? memoryConfig.categories : [];
  const matchedConfig = configCategories.find(
    (entry) => normalizeComparableText(entry.id) === categoryId
  );

  const haystack = normalizeComparableText([
    category,
    matchedConfig?.description || "",
    ...(Array.isArray(matchedConfig?.aliases) ? matchedConfig.aliases : [])
  ].join(" "));

  const leisureSignals = [
    "anime", "animes", "jogo", "jogos", "game", "games", "musica", "banda", "artista"
  ];
  if (leisureSignals.some((signal) => haystack.includes(signal))) {
    return "lazer";
  }

  return "trabalho";
}

function formatShortMemoryContext(messages = [], limit = 3, allowedRoles = ["user"]) {
  const allowed = new Set(
    (Array.isArray(allowedRoles) ? allowedRoles : ["user"])
      .map((role) => normalizeComparableText(role))
      .filter(Boolean)
  );
  const filtered = messages.filter((message) => {
    if (!allowed.size) {
      return true;
    }
    return allowed.has(normalizeComparableText(message.role || "user"));
  });

  const selected = filtered.slice(-Math.max(1, Number(limit || 3)));
  if (!selected.length) {
    return "";
  }

  const lines = selected
    .map((message) => {
      const role = message.role === "assistant" ? "assistant" : "user";
      const content = String(message.content || message.text || "").replace(/\s+/g, " ").trim();
      return content ? `- ${role}: ${content}` : "";
    })
    .filter(Boolean);

  if (!lines.length) {
    return "";
  }

  return [
    "Conversa ativa recente (referencia leve; use so para manter o assunto atual):",
    ...lines
  ].join("\n");
}

function formatLongMemoryContext(memories = []) {
  const lines = dedupeTextLines(
    memories.map((memory) => `- ${memory.type}/${memory.key}: ${memory.content}`)
  );

  if (!lines.length) {
    return "";
  }

  return [
    "Memoria longa relevante (use apenas se realmente combinar com o assunto atual):",
    ...lines
  ].join("\n");
}

function findRecentGeneratedAudio(sinceMs = 0) {
  try {
    if (!fs.existsSync(GENERATED_AUDIO_DIR)) {
      return null;
    }

    const candidates = fs.readdirSync(GENERATED_AUDIO_DIR)
      .filter((fileName) => fileName.toLowerCase().endsWith(".wav"))
      .map((fileName) => {
        const fullPath = path.join(GENERATED_AUDIO_DIR, fileName);
        const stats = fs.statSync(fullPath);
        return {
          path: fullPath,
          mtimeMs: stats.mtimeMs
        };
      })
      .filter((entry) => entry.mtimeMs >= Math.max(0, sinceMs - 5000))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    return candidates[0]?.path || null;
  } catch (err) {
    console.warn("[TOOLS] Falha ao localizar audio gerado recentemente:", err.message);
    return null;
  }
}

function logSecurity(message, meta = {}) {
  const detail = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  console.warn(`[TOOLS][SECURITY] ${message}${detail}`);
}

function getExecutionProjectPath(input = {}) {
  return (
    input.execution?.projectPath ||
    input.session?.activeExecution?.projectPath ||
    input.session?.memory?.lastProjectPath ||
    null
  );
}

function buildProjectScopedPath(projectPath, requestedPath = "") {
  if (!requestedPath) {
    return resolveSafePath(projectPath);
  }

  if (path.isAbsolute(requestedPath)) {
    return resolveSafePath(requestedPath);
  }

  return resolveSafePath(path.join(projectPath, requestedPath));
}

function resolveProjectFileTarget(input = {}, fileNameFallback = "resultado.txt") {
  ensureWorkspace();

  const safeFileName = normalizeSafeName(input.fileName, fileNameFallback);
  const explicitFolder = input.folderPath || input.basePath || "";
  const projectPath = getExecutionProjectPath(input);

  try {
    if (projectPath) {
      const basePath = explicitFolder ? buildProjectScopedPath(projectPath, explicitFolder) : resolveSafePath(projectPath);
      return {
        projectPath,
        targetPath: resolveSafePath(path.join(basePath, safeFileName)),
        fileName: safeFileName
      };
    }

    const fallbackBase = explicitFolder
      ? (path.isAbsolute(explicitFolder) ? resolveSafePath(explicitFolder) : resolveSafePath(path.join(PROJECTS_ROOT, explicitFolder)))
      : PROJECTS_ROOT;

    return {
      projectPath: fallbackBase,
      targetPath: resolveSafePath(path.join(fallbackBase, safeFileName)),
      fileName: safeFileName
    };
  } catch (err) {
    logSecurity("Tentativa bloqueada ao resolver caminho de arquivo", {
      requestedPath: explicitFolder,
      fileName: safeFileName,
      projectPath
    });
    throw err;
  }
}

function resolveProjectFolderTarget(input = {}, folderNameFallback = "workspace") {
  ensureWorkspace();

  const safeFolderName = normalizeSafeName(input.folderName, folderNameFallback);
  const explicitBase = input.basePath || input.folderPath || "";
  const projectPath = getExecutionProjectPath(input);

  try {
    if (projectPath) {
      const basePath = explicitBase ? buildProjectScopedPath(projectPath, explicitBase) : resolveSafePath(projectPath);
      return {
        projectPath,
        targetPath: resolveSafePath(path.join(basePath, safeFolderName)),
        folderName: safeFolderName
      };
    }

    const fallbackBase = explicitBase
      ? (path.isAbsolute(explicitBase) ? resolveSafePath(explicitBase) : resolveSafePath(path.join(PROJECTS_ROOT, explicitBase)))
      : PROJECTS_ROOT;

    return {
      projectPath: fallbackBase,
      targetPath: resolveSafePath(path.join(fallbackBase, safeFolderName)),
      folderName: safeFolderName
    };
  } catch (err) {
    logSecurity("Tentativa bloqueada ao resolver pasta de projeto", {
      requestedPath: explicitBase,
      folderName: safeFolderName,
      projectPath
    });
    throw err;
  }
}

function resolveReadTarget(input = {}) {
  ensureWorkspace();

  try {
    if (input.companyName) {
      const dataTarget = resolveDataPath(input.companyName, input.path || "");
      return {
        targetPath: dataTarget.path,
        companyName: dataTarget.companyName,
        scope: "data"
      };
    }

    const projectPath = getExecutionProjectPath(input);
    const rawPath = input.path || "";

    if (projectPath) {
      return {
        targetPath: buildProjectScopedPath(projectPath, rawPath),
        companyName: null,
        scope: "project"
      };
    }

    return {
      targetPath: rawPath ? resolveSafePath(rawPath) : resolveSafePath(PROJECTS_ROOT),
      companyName: null,
      scope: "workspace"
    };
  } catch (err) {
    logSecurity("Tentativa bloqueada ao ler arquivo", {
      requestedPath: input.path || "",
      companyName: input.companyName || null
    });
    throw err;
  }
}

function resolveMediaPath(rawPath) {
  if (!rawPath) {
    return null;
  }

  return path.isAbsolute(rawPath)
    ? resolveSafePath(rawPath)
    : resolveSafePath(rawPath);
}

function resolveCaptureTarget(input = {}) {
  const fileName = normalizeSafeName(
    input.fileName,
    `${input.capture ? "screenshot" : "imagem"}-${Date.now()}.png`
  );
  const projectPath = getExecutionProjectPath(input);

  if (projectPath) {
    return buildProjectScopedPath(projectPath, path.join("media", fileName));
  }

  if (input.sessionId) {
    return resolveSessionMediaPath(input.sessionId, fileName);
  }

  return resolveSafePath(path.join("sessoes", "sem-sessao", "media", fileName));
}

async function loadMediaPayload(input = {}) {
  const requestedType = input.mediaType || input.type || "image";
  const inlineBase64 =
    input.base64 ||
    input.image ||
    input.audio ||
    input.video ||
    input.fileBase64 ||
    null;
  let mediaBase64 = inlineBase64;
  let mediaPath = null;
  let mediaType = requestedType;
  let mimeType = input.mimeType || null;

  if (input.imagePath || input.audioPath || input.videoPath || input.path) {
    mediaPath = resolveMediaPath(input.imagePath || input.audioPath || input.videoPath || input.path);
    mediaBase64 = await fsPromises.readFile(mediaPath, { encoding: "base64" });
    mimeType = resolveMimeTypeForRequestedMedia(
      requestedType,
      mimeType || guessMimeTypeFromPath(mediaPath),
      mediaPath
    );
    mediaType = normalizeMediaKind(requestedType, mimeType, mediaPath);
  }

  if (!mediaBase64 && input.capture) {
    const captureTarget = resolveCaptureTarget(input);
    const captured = await captureScreen({ outputPath: captureTarget });
    mediaBase64 = captured.base64;
    mediaPath = captured.path;
    mediaType = "screenshot";
    mimeType = "image/png";
  }

  return {
    mediaBase64,
    mediaPath,
    mediaType,
    mimeType: mimeType || guessMimeTypeFromPath(mediaPath, "application/octet-stream")
  };
}

export default function createTools(context) {
  const web_search = createWebSearchTool(context);

  ensureWorkspace();

  async function ai_chat(input = {}) {
    const prompt = input.prompt || input.text || input.goal;

    if (!prompt) {
      return {
        status: "need_input",
        question: "Qual prompt eu devo usar?",
        key: "prompt",
        default: null
      };
    }

    const aiService = getRawService(context, "ai");
    if (!aiService?.chat) {
      throw new Error("Servico de AI indisponivel");
    }

    const meta = {
      source: input.source || input.meta?.source || "unknown",
      sessionId: input.sessionId || input.meta?.sessionId || input.session?.id || null,
      executionId: input.executionId || input.meta?.executionId || input.execution?.id || null,
      preview: input.preview || input.meta?.preview || null
    };

    const hasImageInput = (
      (Array.isArray(input.images) && input.images.length > 0) ||
      (Array.isArray(input.media) && input.media.some((part) => {
        const type = String(part?.type || part?.mediaType || "").toLowerCase();
        return type === "image" || type === "screenshot";
      }))
    );
    const imageTokenBudget = hasImageInput
      ? resolveImageTokenBudget(context, input, {
        mediaType: input.mediaType || "image"
      })
      : (input.image_token_budget || input.imageTokenBudget);

    const response = await aiService.chat(prompt, {
      images: input.images || [],
      media: input.media || [],
      stream: input.stream,
      think: input.think,
      emitEvents: input.emitEvents,
      timeoutMs: input.timeoutMs,
      num_ctx: input.num_ctx || input.numCtx,
      num_predict: input.num_predict || input.numPredict,
      temperature: input.temperature,
      top_p: input.top_p || input.topP,
      top_k: input.top_k || input.topK,
      image_token_budget: imageTokenBudget,
      video_token_budget: input.video_token_budget || input.videoTokenBudget,
      repeat_penalty: input.repeat_penalty || input.repeatPenalty,
      keep_alive: input.keep_alive || input.keepAlive,
      stop: input.stop,
      hasTools: input.hasTools,
      document: input.document,
      ...input.options,
      meta
    }, meta);

    if (response?.error) {
      return wrapError(response.message || "Falha ao chamar AI", {
        text: String(response.text || "").trim(),
        speakText: String(response.speakText || "").trim(),
        speak: response?.speak ?? false,
        kind: response.error,
        timeoutMs: response.timeoutMs || null,
        raw: response
      });
    }

    const text = String(response?.text || "").trim();
    const thought = String(response?.thought || "").trim();
    const speakText = String(response?.speakText || text || "").trim();

    return wrapOk({
      text,
      thought,
      speakText,
      speak: response?.speak ?? true,
      raw: response
    });
  }

  async function generate_text(input = {}) {
    const result = await ai_chat(input);
    const text = String(result?.data?.text || "").trim();

    if (!hasMeaningfulText(text)) {
      return wrapError("Texto insuficiente para continuar", {
        text
      });
    }

    return wrapOk({
      ...result.data,
      text
    });
  }

  async function canvas_control(input = {}) {
    const action = String(input.action || input.command || "status").trim();
    const payload = input.payload && typeof input.payload === "object"
      ? input.payload
      : { ...input };
    delete payload.action;
    delete payload.command;

    const response = await fetch(CANVAS_BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        payload,
        timeoutMs: input.timeoutMs
      })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.ok === false) {
      return wrapError(data?.message || "Falha ao controlar o Canvas.", {
        action,
        response: data
      });
    }

    return wrapOk({
      action,
      ...data
    });
  }

  async function audio_play(input = {}) {
    const text = sanitizeAudioText(input.text || input.prompt);
    if (!text) {
      return {
        status: "need_input",
        question: "Qual texto eu devo falar?",
        key: "text",
        default: null
      };
    }

    const ttsService = getRawService(context, "tts");
    if (!ttsService?.speak) {
      throw new Error("Servico de TTS indisponivel");
    }

    await ttsService.speak(text);

    return wrapOk({
      text,
      played: true
    });
  }

  async function audio_generate(input = {}) {
    const text = sanitizeAudioText(input.text || input.prompt);
    const startedAt = Date.now();
    if (!text) {
      return {
        status: "need_input",
        question: "Qual texto eu devo transformar em audio?",
        key: "text",
        default: null
      };
    }

    const selectedVoice = selectVoice(input);
    const speaker = selectedVoice?.voice || input.voice || input.voiceName;

    if (!speaker) {
      return {
        status: "need_input",
        question: "Qual voz usar?",
        key: "voice",
        default: null
      };
    }

    try {
      const result = await speakXTTS(text, speaker, input.language || "pt");
      const filePath = result?.file ? path.resolve(result.file) : null;

      return wrapOk({
        text,
        voice: speaker,
        file: filePath ? path.relative(process.cwd(), filePath) : null,
        generated: true
      });
    } catch (err) {
      const recoveredFile = findRecentGeneratedAudio(startedAt);
      if (recoveredFile) {
        console.warn(
          `[TOOLS] XTTS falhou apos gerar arquivo. Recuperando audio em ${recoveredFile}. error=${err.message}`
        );

        return wrapOk({
          text,
          voice: speaker,
          file: path.relative(process.cwd(), recoveredFile),
          generated: true,
          recoveredFromError: true,
          warning: err.message
        });
      }

      const played = await audio_play({ text });
      return wrapError(
        played?.data?.played
          ? "Nao consegui salvar o arquivo de audio, mas consegui reproduzir o audio."
          : "Falha ao gerar arquivo de audio",
        {
        text,
        voice: speaker,
        file: null,
        generated: false,
        fallbackPlayed: played.data?.played || false,
        error: err.message
        }
      );
    }
  }

  async function generate_audio(input = {}) {
    return audio_generate(input);
  }

  async function analyze_image(input = {}) {
    let summary = input.summary || null;
    let payload;
    const aiService = getRawService(context, "ai");

    try {
      payload = await loadMediaPayload({
        ...input,
        mediaType: input.mediaType || "image"
      });
    } catch (err) {
      return wrapError(`Imagem invalida ou inacessivel: ${err.message}`, {
        goal: input.goal || null,
        imagePath: input.imagePath || input.path || null
      });
    }

    if (!payload?.mediaBase64) {
      return wrapError("Nenhuma imagem valida disponivel para analise", {
        goal: input.goal || null,
        imagePath: input.imagePath || input.path || null
      });
    }

    const isComparison = isDifferenceComparisonGoal(input.goal);
    const isDetailed = isDetailedVisionGoal(input.goal);
    const analysisPrompt = input.prompt || buildVisionAnalysisPrompt(input.goal);
    const resolvedImageTokenBudget = resolveImageTokenBudget(context, input, payload);
    const baseTimeoutMs = input.timeoutMs || (isComparison ? 180000 : isDetailed ? 150000 : 120000);
    const baseNumPredict = input.numPredict || (isComparison ? 520 : isDetailed ? 420 : 260);

    try {
      let analysis = await ai_chat({
        prompt: analysisPrompt,
        images: [payload.mediaBase64],
        media: [{
          type: "image",
          data: payload.mediaBase64,
          mimeType: payload.mimeType,
          tokenBudget: resolvedImageTokenBudget
        }],
        source: input.source || input.meta?.source || "analyze-image",
        sessionId: input.sessionId || input.meta?.sessionId || null,
        executionId: input.executionId || input.meta?.executionId || null,
        stream: input.stream ?? true,
        think: input.think,
        emitEvents: false,
        timeoutMs: baseTimeoutMs,
        numPredict: baseNumPredict,
        temperature: input.temperature,
        imageTokenBudget: resolvedImageTokenBudget
      });

      if (
        analysis?.status !== "ok" &&
        analysis?.data?.kind === "timeout" &&
        aiService?.warmup
      ) {
        await aiService.warmup().catch(() => {});
        analysis = await ai_chat({
          prompt: analysisPrompt,
          images: [payload.mediaBase64],
          media: [{
            type: "image",
            data: payload.mediaBase64,
            mimeType: payload.mimeType,
            tokenBudget: resolvedImageTokenBudget
          }],
          source: input.source || input.meta?.source || "analyze-image",
          sessionId: input.sessionId || input.meta?.sessionId || null,
          executionId: input.executionId || input.meta?.executionId || null,
          stream: input.stream ?? true,
          think: input.think,
          emitEvents: false,
          timeoutMs: Math.max(baseTimeoutMs + 30000, Math.round(baseTimeoutMs * 1.25)),
          numPredict: Math.max(baseNumPredict, isComparison ? 560 : isDetailed ? 460 : 300),
          temperature: input.temperature,
          imageTokenBudget: resolvedImageTokenBudget
        });
      }

      if (analysis?.status !== "ok") {
        return wrapError(analysis.error || "Servico de visao indisponivel", {
          goal: input.goal || null,
          imagePath: payload.mediaPath || null,
          mediaType: payload.mediaType,
          kind: analysis?.data?.kind || null,
          timeoutMs: analysis?.data?.timeoutMs || null
        });
      }

      summary = analysis.data?.text || summary;
    } catch (err) {
      return wrapError(`Servico de visao indisponivel: ${err.message}`, {
        goal: input.goal || null,
        imagePath: payload.mediaPath || null,
        mediaType: payload.mediaType
      });
    }

    if (!hasMeaningfulText(summary)) {
      return wrapError("Analise de imagem sem conteudo util", {
        goal: input.goal || null,
        imagePath: payload.mediaPath || null,
        mediaType: payload.mediaType
      });
    }

    return wrapOk({
      image: payload.mediaBase64,
      imagePath: payload.mediaPath || null,
      mediaType: payload.mediaType,
      imageTokenBudget: resolvedImageTokenBudget,
      summary: String(summary).trim()
    });
  }

  async function analyze_audio(input = {}) {
    let payload;

    try {
      payload = await loadMediaPayload({
        ...input,
        mediaType: "audio"
      });
    } catch (err) {
      return wrapError(`Audio invalido ou inacessivel: ${err.message}`, {
        goal: input.goal || null,
        audioPath: input.audioPath || input.path || null
      });
    }

    if (!payload?.mediaBase64) {
      return wrapError("Nenhum audio valido disponivel para analise", {
        goal: input.goal || null,
        audioPath: input.audioPath || input.path || null
      });
    }

    let transcript = String(input.transcript || "").trim();
    let transcriptionAttempted = false;
    let transcriptionError = "";

    if (!transcript && payload.mediaPath && shouldUseExternalAudioTranscriptionFallback(context, input, payload)) {
      transcriptionAttempted = true;
      try {
        transcript = await transcribeAudioFile(payload.mediaPath);
      } catch (err) {
        transcriptionError = err.message;
        console.warn("[TOOLS] Falha ao transcrever audio para fallback:", err.message);
      }
    }

    const analysis = await ai_chat({
      prompt: input.prompt || buildAudioAnalysisPrompt(input.goal, transcript),
      media: [{
        type: "audio",
        data: payload.mediaBase64,
        mimeType: payload.mimeType,
        transcript
      }],
      source: input.source || input.meta?.source || "analyze-audio",
      sessionId: input.sessionId || input.meta?.sessionId || null,
      executionId: input.executionId || input.meta?.executionId || null,
      stream: input.stream ?? true,
      think: input.think,
      emitEvents: false,
      timeoutMs: input.timeoutMs || 120000
    });

    if (analysis?.status !== "ok") {
      return wrapError(analysis.error || "Servico de audio indisponivel", {
        goal: input.goal || null,
        audioPath: payload.mediaPath || null,
        mediaType: payload.mediaType,
        transcript,
        mimeType: payload.mimeType,
        transcriptionAttempted,
        transcriptionError,
        kind: analysis?.data?.kind || null,
        timeoutMs: analysis?.data?.timeoutMs || null
      });
    }

    const summary = String(analysis.data?.text || "").trim();
    if (!hasMeaningfulText(summary)) {
      return wrapError("Analise de audio sem conteudo util", {
        goal: input.goal || null,
        audioPath: payload.mediaPath || null,
        mediaType: payload.mediaType,
        transcript,
        mimeType: payload.mimeType,
        transcriptionAttempted,
        transcriptionError
      });
    }

    return wrapOk({
      audio: payload.mediaBase64,
      audioPath: payload.mediaPath || null,
      mediaType: payload.mediaType,
      mimeType: payload.mimeType,
      transcript,
      transcriptionAttempted,
      summary
    });
  }

  async function analyze_video(input = {}) {
    let payload;

    try {
      payload = await loadMediaPayload({
        ...input,
        mediaType: "video"
      });
    } catch (err) {
      return wrapError(`Video invalido ou inacessivel: ${err.message}`, {
        goal: input.goal || null,
        videoPath: input.videoPath || input.path || null
      });
    }

    if (!payload?.mediaBase64) {
      return wrapError("Nenhum video valido disponivel para analise", {
        goal: input.goal || null,
        videoPath: input.videoPath || input.path || null
      });
    }

    const analysis = await ai_chat({
      prompt: input.prompt || buildVideoAnalysisPrompt(input.goal),
      media: [{
        type: "video",
        data: payload.mediaBase64,
        mimeType: payload.mimeType,
        tokenBudget: input.videoTokenBudget || context.config?.system?.multimodal?.videoTokenBudget || 140
      }],
      source: input.source || input.meta?.source || "analyze-video",
      sessionId: input.sessionId || input.meta?.sessionId || null,
      executionId: input.executionId || input.meta?.executionId || null,
      stream: input.stream ?? true,
      think: input.think,
      emitEvents: false,
      timeoutMs: input.timeoutMs || 90000,
      videoTokenBudget: input.videoTokenBudget || context.config?.system?.multimodal?.videoTokenBudget || 140
    });

    if (analysis?.status !== "ok") {
      return wrapError(analysis.error || "Servico de video indisponivel", {
        goal: input.goal || null,
        videoPath: payload.mediaPath || null,
        mediaType: payload.mediaType,
        mimeType: payload.mimeType,
        kind: analysis?.data?.kind || null,
        timeoutMs: analysis?.data?.timeoutMs || null
      });
    }

    const summary = String(analysis.data?.text || "").trim();
    if (!hasMeaningfulText(summary)) {
      return wrapError("Analise de video sem conteudo util", {
        goal: input.goal || null,
        videoPath: payload.mediaPath || null,
        mediaType: payload.mediaType
      });
    }

    return wrapOk({
      video: payload.mediaBase64,
      videoPath: payload.mediaPath || null,
      mediaType: payload.mediaType,
      mimeType: payload.mimeType,
      summary
    });
  }

  async function analyze_media(input = {}) {
    const type = normalizeMediaKind(input.mediaType || input.type || "", input.mimeType || "", input.path || "");
    if (type === "file") {
      return wrapError("Tipo de midia ainda nao suportado. Envie imagem, audio ou video.", {
        mediaType: input.mediaType || input.type || "file",
        path: input.path || null
      });
    }
    if (type === "audio") {
      return analyze_audio(input);
    }
    if (type === "video") {
      return analyze_video(input);
    }
    return analyze_image(input);
  }

  async function save_file(input = {}) {
    const content = String(input.content || input.text || "").trim();
    const target = resolveProjectFileTarget(input, "resultado.txt");

    if (!hasMeaningfulText(content)) {
      return wrapError("Conteudo vazio ou insuficiente para salvar arquivo", {
        fileName: target.fileName
      });
    }

    await fsPromises.mkdir(path.dirname(target.targetPath), { recursive: true });
    await fsPromises.writeFile(target.targetPath, content, "utf8");

    let savedBytes = 0;

    try {
      const stats = await fsPromises.stat(target.targetPath);
      savedBytes = Number(stats.size || 0);
    } catch (err) {
      return wrapError(`Arquivo nao confirmado apos escrita: ${err.message}`, {
        path: target.targetPath,
        fileName: target.fileName
      });
    }

    if (!savedBytes || savedBytes <= 0 || !fs.existsSync(target.targetPath)) {
      return wrapError("Arquivo nao foi salvo com conteudo util", {
        path: target.targetPath,
        fileName: target.fileName,
        bytes: savedBytes
      });
    }

    return wrapOk({
      path: target.targetPath,
      bytes: savedBytes
    });
  }

  async function create_folder(input = {}) {
    const target = resolveProjectFolderTarget(input, "workspace");

    await fsPromises.mkdir(target.targetPath, { recursive: true });

    return wrapOk({
      path: target.targetPath
    });
  }

  async function read_file(input = {}) {
    const resolved = resolveReadTarget(input);
    const content = await fsPromises.readFile(resolved.targetPath, input.encoding || "utf8");

    return wrapOk({
      path: resolved.targetPath,
      content
    });
  }

  async function search_files(input = {}) {
    ensureWorkspace();

    const query = normalizeComparableText(input.query || input.text || input.goal || "");
    const maxResults = Math.max(1, Math.min(50, Number(input.maxResults || 20)));
    const basePath = input.basePath || input.folderPath || WORKSPACE_ROOT;
    const root = resolveSafePath(basePath);
    const terms = query
      .split(/\s+/)
      .filter((term) => term.length >= 3)
      .slice(0, 8);
    const files = [];

    async function walk(dir, depth = 0) {
      if (files.length >= maxResults || depth > 6) return;

      let entries = [];
      try {
        entries = await fsPromises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (files.length >= maxResults) break;
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
          continue;
        }

        const haystack = normalizeComparableText(`${entry.name} ${fullPath}`);
        const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        if (score > 0 || !terms.length) {
          let stats = null;
          try {
            stats = await fsPromises.stat(fullPath);
          } catch {}
          files.push({
            path: resolveSafePath(fullPath),
            name: entry.name,
            size: stats?.size || 0,
            score
          });
        }
      }
    }

    await walk(root);

    files.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    return wrapOk({
      root,
      query,
      files: files.slice(0, maxResults)
    });
  }

  async function write_file(input = {}) {
    return save_file(input);
  }

  async function edit_file(input = {}) {
    const resolved = resolveReadTarget(input);
    const current = await fsPromises.readFile(resolved.targetPath, input.encoding || "utf8");
    const search = String(input.search || input.find || "");
    const replacement = String(input.replacement ?? input.replace ?? input.content ?? "");

    if (!search) {
      return wrapError("Informe o trecho a substituir em search/find.", {
        path: resolved.targetPath
      });
    }

    if (!String(current).includes(search)) {
      return wrapError("Trecho nao encontrado no arquivo.", {
        path: resolved.targetPath
      });
    }

    const next = String(current).replace(search, replacement);
    await fsPromises.writeFile(resolved.targetPath, next, input.encoding || "utf8");

    return wrapOk({
      path: resolved.targetPath,
      edited: true,
      bytes: Buffer.byteLength(next, input.encoding || "utf8")
    });
  }

  async function create_txt(input = {}) {
    return save_file({
      ...input,
      fileName: input.fileName || "resultado.txt"
    });
  }

  async function create_csv(input = {}) {
    const rows = Array.isArray(input.rows) ? input.rows : [];
    let content = String(input.content || input.text || "");

    if (!content && rows.length) {
      const columns = Object.keys(rows[0] || {});
      const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      content = [
        columns.map(escapeCell).join(","),
        ...rows.map((row) => columns.map((column) => escapeCell(row[column])).join(","))
      ].join("\n");
    }

    return save_file({
      ...input,
      fileName: input.fileName || "resultado.csv",
      content
    });
  }

  async function create_doc(input = {}) {
    return save_file({
      ...input,
      fileName: input.fileName || "documento.md"
    });
  }

  async function create_table(input = {}) {
    const rows = Array.isArray(input.rows) ? input.rows : [];
    const columns = Array.isArray(input.columns) && input.columns.length
      ? input.columns
      : Object.keys(rows[0] || {});
    const content = rows.length && columns.length
      ? [
          `| ${columns.join(" | ")} |`,
          `| ${columns.map(() => "---").join(" | ")} |`,
          ...rows.map((row) => `| ${columns.map((column) => String(row[column] ?? "")).join(" | ")} |`)
        ].join("\n")
      : String(input.content || input.text || "");

    return wrapOk({
      text: content,
      rows,
      columns
    });
  }

  async function ensure_company_data(input = {}) {
    const companyName = input.companyName || input.company || input.empresa;
    if (!companyName) {
      return {
        status: "need_input",
        question: "Qual empresa eu devo preparar no workspace?",
        key: "companyName",
        default: null
      };
    }

    const structure = ensureCompanyDataStructure(companyName);
    return wrapOk(structure);
  }

  async function save_data_file(input = {}) {
    const companyName = input.companyName || input.company || input.empresa;
    const content = String(input.content || input.text || "").trim();
    const fileName = normalizeSafeName(input.fileName, "dados.txt");

    if (!companyName) {
      return {
        status: "need_input",
        question: "Qual empresa recebe esse arquivo?",
        key: "companyName",
        default: null
      };
    }

    if (!hasMeaningfulText(content)) {
      return wrapError("Conteudo vazio ou insuficiente para salvar dado persistente", {
        companyName,
        fileName
      });
    }

    const relativeTarget = input.path || fileName;
    const resolved = resolveDataPath(companyName, relativeTarget);

    await fsPromises.mkdir(path.dirname(resolved.path), { recursive: true });
    await fsPromises.writeFile(resolved.path, content, "utf8");

    return wrapOk({
      companyName: resolved.companyName,
      path: resolved.path,
      bytes: Buffer.byteLength(content, "utf8")
    });
  }

  async function read_data_file(input = {}) {
    const companyName = input.companyName || input.company || input.empresa;

    if (!companyName) {
      return {
        status: "need_input",
        question: "De qual empresa eu devo ler os dados?",
        key: "companyName",
        default: null
      };
    }

    const resolved = resolveDataPath(companyName, input.path || "clientes.json");
    const content = await fsPromises.readFile(resolved.path, input.encoding || "utf8");

    return wrapOk({
      companyName: resolved.companyName,
      path: resolved.path,
      content
    });
  }

  async function list_company_assets(input = {}) {
    const companyName = input.companyName || input.company || input.empresa;

    if (!companyName) {
      return {
        status: "need_input",
        question: "Qual empresa eu devo listar?",
        key: "companyName",
        default: null
      };
    }

    const relativeTarget = input.path || ".";
    const resolved = resolveDataPath(companyName, relativeTarget);
    const entries = await fsPromises.readdir(resolved.path, { withFileTypes: true });

    return wrapOk({
      companyName: resolved.companyName,
      path: resolved.path,
      items: entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file"
      }))
    });
  }

  async function open_app(input = {}) {
    return launchApp(input);
  }

  async function play_music(input = {}) {
    return playMedia(input);
  }

  async function play_media(input = {}) {
    return play_music(input);
  }

  async function process_batch(input = {}) {
    return processBatchRequest(input, {
      dataRoot: DATA_ROOT,
      resolveDataPath,
      aiChat: ai_chat
    });
  }

  async function memory_access(input = {}) {
    const action = input.action || "get_context";
    initDB();

    const memoryMeta = {
      source: input.source || input.meta?.source || `memory.${action}`,
      sessionId: input.sessionId || input.meta?.sessionId || null,
      executionId: input.executionId || input.meta?.executionId || null
    };

    switch (action) {
      case "init":
        return wrapOk({ initialized: true });
      case "log_conversation": {
        const content = input.text || input.content || input.message || "";
        if (!hasMeaningfulText(content)) {
          return wrapOk({ saved: false, ignored: true });
        }

        saveConversationMessage({
          groupId: input.sessionId || input.groupId || memoryMeta.sessionId || "default",
          role: input.role || "user",
          content
        });

        return wrapOk({ saved: true });
      }
      case "process_input":
        return wrapOk({
          processed: false,
          kind: "input",
          deferred: true
        });
      case "process_ai_response":
        return wrapOk({
          processed: false,
          kind: "ai_response",
          deferred: true
        });
      case "get_context": {
        const sessionId = input.sessionId || input.groupId || memoryMeta.sessionId || "default";
        const query = input.query || input.text || input.prompt || "";
        const includeShortContext = input.includeShortContext !== false && !isVisualMemorySensitiveQuery(query);
        const shortLimit = includeShortContext ? Math.max(1, Number(input.shortLimit || 2)) : 0;
        const shortMessages = getRecentConversationMessages({
          groupId: sessionId,
          limit: includeShortContext ? Math.max(shortLimit * 3, 6) : 1
        });
        const shortContext = includeShortContext
          ? formatShortMemoryContext(shortMessages, shortLimit, input.shortRoles || ["user"])
          : "";
        const contextType = detectMemoryContextType({
          query,
          shortMessages
        });
        const contextBlocks = [];

        if (shortContext) {
          console.log("[MEMORY][SHORT] active conversation context enabled");
          contextBlocks.push(shortContext);
        } else {
          console.log("[MEMORY][SHORT] skipped");
        }

        let longContext = "";
        if (contextType === "neutro") {
          console.log("[MEMORY][LONG] skipped: neutral context");
        } else {
          const rawLongMemories = getRelevantMemory({
            groupId: sessionId,
            query,
            limit: 6
          });

          let selectedLongMemories = rawLongMemories;
          if (contextType === "lazer") {
            const leisureMemories = rawLongMemories.filter(
              (memory) => resolveMemoryBucket(memory.type, context.config?.memory || {}) === "lazer"
            );
            const hadWorkMemory = rawLongMemories.some(
              (memory) => resolveMemoryBucket(memory.type, context.config?.memory || {}) === "trabalho"
            );

            selectedLongMemories = leisureMemories;

            if (hadWorkMemory) {
              console.log("[MEMORY][LONG] blocked: work memory in leisure");
            } else {
              console.log("[MEMORY][LONG] allowed");
            }
          } else {
            console.log("[MEMORY][LONG] allowed");
          }

          longContext = formatLongMemoryContext(selectedLongMemories);
          if (longContext) {
            contextBlocks.push(longContext);
          }
        }

        const contextText = contextBlocks.filter(Boolean).join("\n\n");
        return wrapOk({
          text: contextText,
          context: contextText,
          shortContext,
          longContext,
          contextType,
          sessionId
        });
      }
      default:
        return wrapOk({ action, ignored: true });
    }
  }

  return {
    ai_chat,
    generate_audio,
    analyze_image,
    analyze_audio,
    analyze_video,
    analyze_media,
    save_file,
    write_file,
    edit_file,
    search_files,
    create_table,
    create_doc,
    create_csv,
    create_txt,
    create_folder,
    read_file,
    read_data_file,
    save_data_file,
    ensure_company_data,
    list_company_assets,
    open_app,
    process_batch,
    play_music,
    play_media,
    memory_access,
    audio_play,
    audio_generate,
    generate_text,
    canvas_control,
    web_search
  };
}
