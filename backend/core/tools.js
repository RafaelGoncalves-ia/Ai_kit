import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import fetch from "node-fetch";
import { captureScreen } from "../services/vision.js";
import { pesquisarMundoReal } from "../services/searchService.js";
import {
  PROJECTS_ROOT,
  ensureWorkspace,
  resolveDataPath,
  ensureCompanyDataStructure,
  resolveSafePath,
  resolveSessionMediaPath
} from "./security/workspaceGuard.js";
import { initDB } from "../skills/memory/sqlite.js";
import {
  extractMemory,
  extractAIMemory,
  buildContext as buildMemoryContext
} from "../skills/memory/memory.semantic.js";
import { saveConversationMessage } from "../skills/memory/memory.repository.js";

const VOICES_FILE = path.resolve("backend/config/vozesxtts.json");
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

function resolveVisionImagePath(rawPath) {
  if (!rawPath) {
    return null;
  }

  return path.isAbsolute(rawPath)
    ? resolveSafePath(rawPath)
    : resolveSafePath(rawPath);
}

function resolveVisionCaptureTarget(input = {}) {
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

async function loadVisionPayload(input = {}) {
  let imageBase64 = input.image || input.base64 || null;
  let imagePath = null;
  let mediaType = input.mediaType || "image";

  if (input.imagePath || input.path) {
    imagePath = resolveVisionImagePath(input.imagePath || input.path);
    imageBase64 = await fsPromises.readFile(imagePath, { encoding: "base64" });
  }

  if (!imageBase64 && input.capture) {
    const captureTarget = resolveVisionCaptureTarget(input);
    const captured = await captureScreen({ outputPath: captureTarget });
    imageBase64 = captured.base64;
    imagePath = captured.path;
    mediaType = "screenshot";
  }

  return {
    imageBase64,
    imagePath,
    mediaType
  };
}

export default function createTools(context) {
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

    const response = await aiService.chat(prompt, {
      images: input.images || [],
      stream: input.stream,
      num_ctx: input.num_ctx || input.numCtx,
      num_predict: input.num_predict || input.numPredict,
      temperature: input.temperature,
      top_p: input.top_p || input.topP,
      top_k: input.top_k || input.topK,
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
    const speakText = String(response?.speakText || text || "").trim();

    return wrapOk({
      text,
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
      const played = await audio_play({ text });
      return wrapError("Falha ao gerar arquivo de audio", {
        text,
        voice: speaker,
        file: null,
        generated: false,
        fallbackPlayed: played.data?.played || false,
        error: err.message
      });
    }
  }

  async function generate_audio(input = {}) {
    return audio_generate(input);
  }

  async function analyze_image(input = {}) {
    let summary = input.summary || null;
    let payload;

    try {
      payload = await loadVisionPayload(input);
    } catch (err) {
      return wrapError(`Imagem invalida ou inacessivel: ${err.message}`, {
        goal: input.goal || null,
        imagePath: input.imagePath || input.path || null
      });
    }

    if (!payload?.imageBase64) {
      return wrapError("Nenhuma imagem valida disponivel para analise", {
        goal: input.goal || null,
        imagePath: input.imagePath || input.path || null
      });
    }

    const analysisPrompt = input.prompt || (
      input.goal
        ? `Analise a imagem de forma objetiva e sem inventar. Pedido do usuario: ${input.goal}`
        : "Descreva a imagem de forma objetiva e sem inventar."
    );

    try {
      const analysis = await ai_chat({
        prompt: analysisPrompt,
        images: [payload.imageBase64],
        source: input.source || input.meta?.source || "analyze-image",
        sessionId: input.sessionId || input.meta?.sessionId || null,
        executionId: input.executionId || input.meta?.executionId || null
      });

      if (analysis?.status !== "ok") {
        return wrapError(analysis.error || "Servico de visao indisponivel", {
          goal: input.goal || null,
          imagePath: payload.imagePath || null,
          mediaType: payload.mediaType,
          kind: analysis?.data?.kind || null,
          timeoutMs: analysis?.data?.timeoutMs || null
        });
      }

      summary = analysis.data?.text || summary;
    } catch (err) {
      return wrapError(`Servico de visao indisponivel: ${err.message}`, {
        goal: input.goal || null,
        imagePath: payload.imagePath || null,
        mediaType: payload.mediaType
      });
    }

    if (!hasMeaningfulText(summary)) {
      return wrapError("Analise de imagem sem conteudo util", {
        goal: input.goal || null,
        imagePath: payload.imagePath || null,
        mediaType: payload.mediaType
      });
    }

    return wrapOk({
      image: payload.imageBase64,
      imagePath: payload.imagePath || null,
      mediaType: payload.mediaType,
      summary: String(summary).trim()
    });
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

  async function web_search(input = {}) {
    const query = input.query || input.text || input.prompt;

    if (!query) {
      return {
        status: "need_input",
        question: "O que voce quer pesquisar?",
        key: "query",
        default: null
      };
    }

    const text = await pesquisarMundoReal(query);
    if (!hasMeaningfulText(text)) {
      return wrapError("Pesquisa sem resultado util", {
        query
      });
    }

    return wrapOk({ text: String(text).trim(), query });
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
          processed: true,
          kind: "input",
          ...(await extractMemory(input.text || "", context, memoryMeta))
        });
      case "process_ai_response":
        return wrapOk({
          processed: true,
          kind: "ai_response",
          ...(await extractAIMemory(input.text || "", context, memoryMeta))
        });
      case "get_context": {
        const contextText = await buildMemoryContext({
          sessionId: input.sessionId || input.groupId || memoryMeta.sessionId || "default",
          query: input.query || input.text || input.prompt || ""
        });
        return wrapOk({ text: contextText, context: contextText });
      }
      default:
        return wrapOk({ action, ignored: true });
    }
  }

  return {
    ai_chat,
    generate_audio,
    analyze_image,
    save_file,
    create_folder,
    read_file,
    read_data_file,
    save_data_file,
    ensure_company_data,
    list_company_assets,
    memory_access,
    audio_play,
    audio_generate,
    generate_text,
    web_search
  };
}
