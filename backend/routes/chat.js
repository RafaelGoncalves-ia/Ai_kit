import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { addMessage } from "../utils/conversationStore.js";
import studioLaunchService from "../skills/studio/studioLaunchService.js";
import { enqueueVideoJob } from "../services/video/videoService.js";
import {
  resolveSafePath,
  resolveSessionMediaPath
} from "../core/security/workspaceGuard.js";
import { getLastSessionId, setLastSessionId } from "../utils/runtimeState.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 40 * 1024 * 1024
  }
});

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
const { createStudioProjectFromCommand, detectStudioIntent } = studioLaunchService;

function getUploadedImageFile(req) {
  if (req.file) {
    return req.file;
  }

  if (Array.isArray(req.files) && req.files.length > 0) {
    return req.files.find((file) => isLikelyImage({
      mimeType: file.mimetype,
      fileName: file.originalname
    })) || req.files[0];
  }

  return null;
}

function getUploadedMediaFile(req) {
  if (req.file) {
    return req.file;
  }

  if (Array.isArray(req.files) && req.files.length > 0) {
    return req.files[0];
  }

  return null;
}

function onUserReply(context) {
  context.lastRandomTalkTime = null;
}

function ensureSession(context, sessionId) {
  context.sessions = context.sessions || {};
  context.sessions[sessionId] = context.sessions[sessionId] || {
    id: sessionId,
    memory: {},
    questions: {},
    executions: []
  };

  return context.sessions[sessionId];
}

function sanitizeFileName(fileName, fallback = "imagem.png") {
  return String(fileName || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-") || fallback;
}

function isLikelyImage({ mimeType, fileName }) {
  const normalizedMime = String(mimeType || "").toLowerCase();
  const ext = path.extname(String(fileName || "")).toLowerCase();

  return (
    normalizedMime.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(ext)
  );
}

function detectMediaType({ mimeType, fileName, declaredType } = {}) {
  const normalizedDeclared = String(declaredType || "").toLowerCase();
  const normalizedMime = String(mimeType || "").toLowerCase();
  const ext = path.extname(String(fileName || "")).toLowerCase();

  if (normalizedDeclared === "audio" || normalizedMime.startsWith("audio/")) {
    return "audio";
  }

  if (normalizedDeclared === "video" || normalizedMime.startsWith("video/")) {
    return "video";
  }

  if (normalizedDeclared === "screenshot") {
    return "screenshot";
  }

  if (
    normalizedDeclared === "image" ||
    normalizedMime.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(ext)
  ) {
    return "image";
  }

  return "file";
}

function getMediaLimitBytes(mediaType = "file") {
  if (mediaType === "image" || mediaType === "screenshot") return MAX_IMAGE_BYTES;
  if (mediaType === "audio") return MAX_AUDIO_BYTES;
  if (mediaType === "video") return MAX_VIDEO_BYTES;
  return MAX_AUDIO_BYTES;
}

function validateMediaSize({ mediaType, sizeBytes, fileName }) {
  const limitBytes = getMediaLimitBytes(mediaType);
  if (Number(sizeBytes || 0) > limitBytes) {
    const limitMb = Math.round(limitBytes / 1024 / 1024);
    throw new Error(`${mediaType} excede o limite de ${limitMb}MB: ${fileName || "arquivo"}`);
  }
}

function resolveSessionMediaTarget(sessionId, fileName, session) {
  const safeFileName = sanitizeFileName(fileName);
  const projectPath =
    session?.activeExecution?.projectPath ||
    session?.memory?.lastProjectPath ||
    null;

  if (projectPath) {
    return resolveSafePath(path.join(projectPath, "assets", "input", safeFileName));
  }

  return resolveSessionMediaPath(sessionId, safeFileName);
}

function saveBufferToSessionMedia(sessionId, buffer, fileName, session) {
  const targetPath = resolveSessionMediaTarget(sessionId, fileName, session);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, buffer);
  return targetPath;
}

function saveBase64ToSessionMedia(sessionId, base64Payload, fileName, session) {
  const cleaned = String(base64Payload || "").replace(/^data:[^;]+;base64,/, "").trim();
  if (!cleaned) {
    return null;
  }

  return saveBufferToSessionMedia(sessionId, Buffer.from(cleaned, "base64"), fileName, session);
}

function registerSessionMedia(session, media = {}) {
  session.memory = session.memory || {};

  const timestamp = Date.now();
  const mediaType = media.mediaType || "image";

  session.memory.lastMediaPath = media.path || null;
  session.memory.lastMediaType = mediaType;
  session.memory.lastMediaAt = timestamp;
  session.memory.pendingMedia = Boolean(media.path);

  if (mediaType === "screenshot") {
    session.memory.lastScreenshotPath = media.path || null;
    session.memory.lastScreenshotAt = timestamp;
  } else {
    session.memory.lastImagePath = media.path || null;
    session.memory.lastImageAt = timestamp;
  }
}

function normalizeCommandText(text = "") {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extractQuotedText(text = "") {
  const match = String(text || "").match(/["“”'`](.+?)["“”'`]/);
  return match?.[1]?.trim() || "";
}

function detectCanvasPreset(normalizedText = "") {
  if (/\b(story|stories)\b/.test(normalizedText)) return "instagram-story";
  if (/\breels?\b/.test(normalizedText)) return "reels";
  if (/\b(youtube|thumb|thumbnail)\b/.test(normalizedText)) return "youtube-thumb";
  if (/\bbanner\b/.test(normalizedText)) return "youtube-banner";
  if (/\btiktok\b/.test(normalizedText)) return "tiktok-video";
  if (/\bfacebook\b/.test(normalizedText)) return "facebook-post";
  if (/\b(instagram|post)\b/.test(normalizedText)) return "instagram-post";
  return null;
}

function detectCanvasAlignment(normalizedText = "") {
  if (/\b(centro total|centraliza tudo|centralizar tudo)\b/.test(normalizedText)) return "center";
  if (/\b(centro horizontal|horizontalmente|centro h)\b/.test(normalizedText)) return "center-h";
  if (/\b(centro vertical|verticalmente|centro v)\b/.test(normalizedText)) return "center-v";
  if (/\b(esquerda)\b/.test(normalizedText)) return "left";
  if (/\b(direita)\b/.test(normalizedText)) return "right";
  if (/\b(topo|cima)\b/.test(normalizedText)) return "top";
  if (/\b(base|baixo|rodape)\b/.test(normalizedText)) return "bottom";
  if (/\b(centro|centraliza|centralizar)\b/.test(normalizedText)) return "center";
  return null;
}

function detectOutpaintTarget(normalizedText = "") {
  if (/\b(9:16|story|stories|reels?|vertical)\b/.test(normalizedText)) return "instagram-story";
  if (/\b(4:5|retrato|portrait)\b/.test(normalizedText)) return "instagram-portrait";
  if (/\b(1:1|quadrado|square|post)\b/.test(normalizedText)) return "instagram-post";
  if (/\b(16:9|horizontal|youtube|thumb|thumbnail)\b/.test(normalizedText)) return "youtube-thumb";
  return "instagram-story";
}

function detectOutpaintSide(normalizedText = "") {
  if (/\b(esquerda|left)\b/.test(normalizedText)) return "left";
  if (/\b(direita|right)\b/.test(normalizedText)) return "right";
  if (/\b(topo|cima|top)\b/.test(normalizedText)) return "top";
  if (/\b(base|baixo|bottom)\b/.test(normalizedText)) return "bottom";
  return "auto";
}

function resolveCanvasCommand(text = "", media = null) {
  const normalized = normalizeCommandText(text);
  if (!/\b(canvas|arte|artboard|camadas?|layers?|objetos?|slides?|timeline|carrossel)\b/.test(normalized)) {
    return null;
  }

  if (/\b(abre|abrir|abra|mostra|mostrar)\b.*\bcanvas\b/.test(normalized)) {
    return { action: "open", payload: {} };
  }

  if (/\b(foca|focar|foque)\b.*\bcanvas\b/.test(normalized)) {
    return { action: "focus", payload: {} };
  }

  if (/\b(estado|status|situacao)\b/.test(normalized)) {
    return { action: "get-state", payload: {} };
  }

  if (/\b(lista|listar|mostra|mostrar)\b.*\b(camadas?|layers?|objetos?)\b/.test(normalized)) {
    return { action: "list-layers", payload: {} };
  }

  if (/\b(lista|listar|mostra|mostrar|consulta|consultar)\b.*\bartboard\b/.test(normalized)) {
    return { action: "list-artboard", payload: {} };
  }

  if (/\b(slide|timeline|carrossel)\b/.test(normalized)) {
    const timelineTimeMatch = normalized.match(/(\d+(?:[\.,]\d+)?)\s*(?:s|segundos?)/);
    const timelineTrackMatch = normalized.match(/\b(?:trilha|track)\s+(\d+)\b/);
    const timelineItemMatch = normalized.match(/\b(?:item|midia|m[ií]dia)\s+([\w-]+)\b/);
    const timelinePayload = {
      ...(timelineTimeMatch ? { startTime: Number(timelineTimeMatch[1].replace(",", ".")) } : {}),
      ...(timelineTrackMatch ? { track: Math.max(0, Number(timelineTrackMatch[1]) - 1) } : {}),
      ...(timelineItemMatch ? { itemId: timelineItemMatch[1] } : {})
    };

    if (/\btimeline\b/.test(normalized) && /\b(adiciona|adicionar|insere|inserir|coloca|colocar)\b/.test(normalized)) {
      const type = /\b(video|v[ií]deo|filme)\b/.test(normalized)
        ? "video"
        : /\b(musica|m[uú]sica|trilha sonora)\b/.test(normalized)
          ? "music"
          : /\b(audio|[aá]udio|narracao|narra[cç][aã]o)\b/.test(normalized)
            ? "audio"
            : /\b(texto|legenda)\b/.test(normalized)
              ? "text"
              : "image";
      return {
        action: "timeline-add",
        payload: {
          ...timelinePayload,
          type,
          label: extractQuotedText(text) || undefined
        }
      };
    }

    if (/\btimeline\b/.test(normalized) && /\b(move|mover|reposiciona|reposicionar)\b/.test(normalized)) {
      return { action: "move-timeline-item", payload: timelinePayload };
    }

    if (/\btimeline\b/.test(normalized) && /\b(corta|cortar|divide|dividir)\b/.test(normalized)) {
      return {
        action: "cut-timeline-item",
        payload: {
          ...timelinePayload,
          ...(timelineTimeMatch ? { time: Number(timelineTimeMatch[1].replace(",", ".")) } : {})
        }
      };
    }

    if (/\btimeline\b/.test(normalized) && /\b(oculta|ocultar|esconde|esconder)\b/.test(normalized)) {
      return { action: "hide-timeline-item", payload: timelinePayload };
    }

    if (/\btimeline\b/.test(normalized) && /\b(exibe|exibir|mostra|mostrar)\b/.test(normalized)) {
      return { action: "show-timeline-item", payload: timelinePayload };
    }

    if (/\btimeline\b/.test(normalized) && /\b(volume)\b/.test(normalized)) {
      const volumeMatch = normalized.match(/\bvolume\s+(\d+(?:[\.,]\d+)?)\b/);
      return {
        action: "set-timeline-volume",
        payload: {
          ...timelinePayload,
          ...(volumeMatch ? { volume: Number(volumeMatch[1].replace(",", ".")) } : {})
        }
      };
    }

    if (/\btimeline\b/.test(normalized) && /\b(velocidade|speed)\b/.test(normalized)) {
      const speedMatch = normalized.match(/\b(?:velocidade|speed)\s+(\d+(?:[\.,]\d+)?)\b/);
      return {
        action: "set-timeline-speed",
        payload: {
          ...timelinePayload,
          ...(speedMatch ? { speed: Number(speedMatch[1].replace(",", ".")) } : {})
        }
      };
    }

    if (/\btimeline\b/.test(normalized) && /\b(duracao|duraÃ§Ã£o|tempo)\b/.test(normalized) && /\b(item|midia|m[ií]dia)\b/.test(normalized)) {
      const durationMatch = normalized.match(/(\d+(?:[\.,]\d+)?)\s*(?:s|segundos?)/);
      return {
        action: "set-timeline-duration",
        payload: {
          ...timelinePayload,
          ...(durationMatch ? { duration: Number(durationMatch[1].replace(",", ".")) } : {})
        }
      };
    }

    if (/\btimeline\b/.test(normalized) && /\b(play|reproduz|reproduzir|toca|tocar)\b/.test(normalized)) {
      return { action: "play-timeline", payload: {} };
    }

    if (/\btimeline\b/.test(normalized) && /\b(stop|para|parar)\b/.test(normalized)) {
      return { action: "stop-timeline", payload: {} };
    }

    if (/\btimeline\b/.test(normalized) && /\b(proximo|pr[oó]ximo|avanca|avan[cç]ar)\b/.test(normalized)) {
      return { action: "next-timeline-marker", payload: {} };
    }

    if (/\btimeline\b/.test(normalized) && /\b(anterior|volta|voltar)\b/.test(normalized)) {
      return { action: "prev-timeline-marker", payload: {} };
    }

    if (/\b(cria|criar|novo|nova|adiciona|adicionar)\b/.test(normalized)) {
      return { action: "add-slide", payload: {} };
    }
    if (/\b(duplica|duplicar|copia|copiar)\b/.test(normalized)) {
      return { action: "duplicate-slide", payload: {} };
    }
    if (/\b(remove|remover|apaga|apagar|deleta|deletar)\b/.test(normalized)) {
      return { action: "remove-slide", payload: {} };
    }
    if (/\b(seleciona|selecionar|vai para|ir para)\b/.test(normalized)) {
      const indexMatch = normalized.match(/\bslide\s+(\d+)\b/);
      return {
        action: "select-slide",
        payload: indexMatch ? { index: Number(indexMatch[1]) } : {}
      };
    }
    if (/\b(duracao|duração|tempo)\b/.test(normalized)) {
      const durationMatch = normalized.match(/(\d+(?:[\.,]\d+)?)\s*(?:s|segundos?)/);
      return {
        action: "set-slide-duration",
        payload: durationMatch ? { duration: Number(durationMatch[1].replace(",", ".")) } : {}
      };
    }
  }

  if (/\b(outpaint|outpainting|expandir|expande|aumentar formato|adaptar formato)\b/.test(normalized)) {
    const quoted = extractQuotedText(text);
    const prompt = quoted || String(text || "")
      .replace(/.*\b(?:outpaint|outpainting|expandir|expande|adaptar formato)\b/i, "")
      .trim();
    return {
      action: "outpaint",
      payload: {
        prompt,
        targetPreset: detectOutpaintTarget(normalized),
        side: detectOutpaintSide(normalized)
      }
    };
  }

  if (/\b(inpaint|inpainting|mascara|editar area|area mascarada)\b/.test(normalized)) {
    const quoted = extractQuotedText(text);
    const prompt = quoted || String(text || "")
      .replace(/.*\b(?:inpaint|inpainting|mascara)\b/i, "")
      .trim();
    return {
      action: "inpaint",
      payload: {
        prompt,
        insertMode: /\b(substitui|substituir|troca|trocar)\b/.test(normalized) ? "replace" : "new-layer"
      }
    };
  }

  if (/\b(video|videos|vídeo|vídeos|anime|animar|movimento)\b/.test(normalized) && /\b(gera|gerar|cria|criar|faz|fazer|anime|animar)\b/.test(normalized)) {
    return {
      action: "generate-video",
      payload: {
        prompt: String(text || "").trim(),
        duration: extractRequestedDuration(text),
        ratio: detectVideoRatio(normalized),
        fromSelection: /\b(selecao|seleção|camada|layer|imagem atual|foto atual)\b/.test(normalized)
      }
    };
  }

  if (/\b(cria|criar|novo|nova)\b.*\b(projeto|arte|canvas)\b/.test(normalized)) {
    return {
      action: "create-project",
      payload: {
        preset: detectCanvasPreset(normalized) || "instagram-post"
      }
    };
  }

  if (/\b(salva|salvar|grave|gravar)\b.*\b(projeto|canvas|arte)\b/.test(normalized)) {
    return { action: "save-project", payload: {} };
  }

  if (/\b(exporta|exportar)\b/.test(normalized)) {
    const format = /\bwebp\b/.test(normalized)
      ? "webp"
      : /\b(jpg|jpeg)\b/.test(normalized)
        ? "jpeg"
        : "png";
    return {
      action: "export-image",
      payload: { format }
    };
  }

  if (/\b(seleciona|selecionar)\b.*\b(camada|layer|objeto)\b/.test(normalized)) {
    const indexMatch = normalized.match(/\b(?:camada|layer|objeto)\s+(\d+)\b/);
    return {
      action: "select-layer",
      payload: indexMatch ? { index: Math.max(0, Number(indexMatch[1]) - 1) } : {}
    };
  }

  if (/\b(alinha|alinhar|centraliza|centralizar|posiciona|posicionar)\b/.test(normalized)) {
    const alignment = detectCanvasAlignment(normalized);
    if (alignment) {
      const indexMatch = normalized.match(/\b(?:camada|layer|objeto)\s+(\d+)\b/);
      return {
        action: "align-object",
        payload: {
          alignment,
          ...(indexMatch ? { index: Math.max(0, Number(indexMatch[1]) - 1) } : {})
        }
      };
    }
  }

  if (/\b(cor|pinta|pintar|aplica)\b/.test(normalized)) {
    const colorMatch = String(text || "").match(/#[0-9a-fA-F]{6}/);
    if (colorMatch) {
      return {
        action: "apply-color",
        payload: { color: colorMatch[0] }
      };
    }
  }

  if (/\b(logo|marca)\b/.test(normalized) && /\b(insere|inserir|coloca|colocar|aplica|aplicar)\b/.test(normalized)) {
    return { action: "insert-logo", payload: {} };
  }

  if (media?.path && media.mediaType === "image" && /\b(imagem|foto|arquivo|midia)\b/.test(normalized)) {
    return {
      action: "insert-image",
      payload: {
        filePath: media.path,
        name: media.fileName
      }
    };
  }

  if (/\b(insere|inserir|coloca|colocar|adicione|adicionar)\b.*\btexto\b/.test(normalized)) {
    const quoted = extractQuotedText(text);
    const fallback = String(text || "")
      .replace(/.*\btexto\b/i, "")
      .replace(/\b(no|na|para|pro|no canvas|na arte)\b/gi, "")
      .trim();
    return {
      action: "insert-text",
      payload: {
        text: quoted || fallback
      }
    };
  }

  return null;
}

function formatCanvasCommandResponse(result = {}) {
  const data = result?.data || {};
  const message = data.message || result.error || "Comando enviado ao Canvas.";
  const layers = data.state?.layers;
  const artboard = data.state?.artboard;

  if (Array.isArray(layers) && /Layers consultados|camadas/i.test(message)) {
    const layerLines = layers.length
      ? layers.map((layer, index) => `${index + 1}. ${layer.name} (${layer.type})`).join("\n")
      : "Nenhuma camada no Canvas.";
    return `${message}\n${layerLines}`;
  }

  if (artboard && /Artboard|Estado/i.test(message)) {
    return `${message}\nArtboard: ${artboard.width} x ${artboard.height} (${artboard.preset || "custom"}).`;
  }

  return message;
}

function buildPersistedUserText(text = "", media = null) {
  const normalizedText = String(text || "").trim();
  if (!media?.fileName) {
    return normalizedText;
  }

  const marker = `[Midia enviada: ${media.fileName}]`;
  const comment = `<!--kit-attachment:${JSON.stringify({
    kind: media.mediaType || "file",
    name: media.fileName
  })}-->`;

  if (!normalizedText) {
    return `${marker}\n${comment}`;
  }

  return `${normalizedText}\n\n${marker}\n${comment}`;
}

function buildStudioAttachments(media = null) {
  if (!media?.path) {
    return [];
  }

  return [{
    path: media.path,
    mediaType: media.mediaType || "file",
    fileName: media.fileName || path.basename(media.path),
    mimeType: media.mimeType || "application/octet-stream"
  }];
}

function resolveStudioSource(sessionId = "default") {
  return sessionId === "widget" ? "widget" : "chat";
}

function detectVideoRatio(normalizedText = "") {
  if (/\b(16:9|horizontal|youtube|landscape)\b/.test(normalizedText)) return "16:9";
  if (/\b(1:1|quadrado|square)\b/.test(normalizedText)) return "1:1";
  if (/\b(4:5|retrato|portrait)\b/.test(normalizedText)) return "4:5";
  if (/\b(9:16|vertical|reels?|story|stories|tiktok)\b/.test(normalizedText)) return "9:16";
  return "9:16";
}

function extractRequestedDuration(text = "") {
  const match = String(text || "").match(/(\d+(?:[\.,]\d+)?)\s*(?:s|segundos?)/i);
  if (!match?.[1]) {
    return 5;
  }
  return Number(match[1].replace(",", ".")) || 5;
}

function detectGlobalVideoIntent(text = "", media = null, session = {}, source = "chat") {
  const normalized = normalizeCommandText(text);
  if (/\b(canvas|artboard|camada|layer|timeline|slide|carrossel)\b/.test(normalized)) {
    return null;
  }
  const hasVideoWords = /\b(video|videos|vídeo|vídeos|animar|anime|anima|animação|movimento)\b/.test(normalized);
  const hasGenerateVerb = /\b(gera|gerar|cria|criar|faz|fazer|transforma|transformar|converte|converter)\b/.test(normalized);
  const referencesCurrentImage = /\b(disso|isso|esta imagem|essa imagem|essa foto|esta foto|imagem atual|foto atual)\b/.test(normalized);
  const canUseImage = media?.path && (media.mediaType === "image" || media.mediaType === "screenshot");
  const rememberedImage = String(session?.memory?.lastImagePath || "").trim();
  const startImage = canUseImage
    ? media.path
    : ((referencesCurrentImage || /\b(anime|animar)\b/.test(normalized)) && rememberedImage ? rememberedImage : "");

  if (!hasVideoWords && !(startImage && /\b(anime|animar|movimento|movimenta|movimentar)\b/.test(normalized))) {
    return null;
  }

  if (!hasGenerateVerb && !/\b(anime|animar)\b/.test(normalized)) {
    return null;
  }

  return {
    source,
    sessionId: session?.id || "default",
    prompt: String(text || "").trim(),
    duration: extractRequestedDuration(text),
    fps: 16,
    steps: 4,
    cfg: 1.5,
    sampler: "euler_ancestral",
    scheduler: "beta",
    shift: 8,
    denoise: 0.7,
    motionStrength: 0.5,
    imageStrength: 0.65,
    preset: startImage ? "standard-I2V" : "standard-T2V",
    quality: startImage ? "standard-I2V" : "standard-T2V",
    mode: startImage ? "i2v" : "t2v",
    ratio: detectVideoRatio(normalized),
    startImage,
    references: startImage
      ? [{
        path: startImage,
        source: canUseImage ? "chat-upload" : "session-memory",
        type: "image"
      }]
      : []
  };
}

function resolveBodyMedia(req, sessionId, session) {
  const body = req.body || {};
  const uploadedFile = getUploadedMediaFile(req);

  if (uploadedFile) {
    const mediaType = detectMediaType({
      mimeType: uploadedFile.mimetype,
      fileName: uploadedFile.originalname,
      declaredType: body.mediaType
    });
    validateMediaSize({
      mediaType,
      sizeBytes: uploadedFile.size,
      fileName: uploadedFile.originalname
    });

    return {
      path: saveBufferToSessionMedia(sessionId, uploadedFile.buffer, uploadedFile.originalname || "upload.png", session),
      mediaType,
      fileName: uploadedFile.originalname || "upload.png",
      mimeType: uploadedFile.mimetype || "application/octet-stream"
    };
  }

  if (body.fileBase64 || body.imageBase64 || body.audioBase64 || body.videoBase64) {
    const fileName = body.fileName || body.imageName || body.audioName || body.videoName || "upload-base64.bin";
    const base64Payload = body.fileBase64 || body.imageBase64 || body.audioBase64 || body.videoBase64;
    const savedPath = saveBase64ToSessionMedia(sessionId, base64Payload, fileName, session);

    if (!savedPath) {
      throw new Error("Payload de midia base64 vazio.");
    }

    const mediaType = detectMediaType({
      mimeType: body.mimeType,
      fileName,
      declaredType: body.mediaType
    });
    validateMediaSize({
      mediaType,
      sizeBytes: Buffer.from(String(base64Payload).replace(/^data:[^;]+;base64,/, "").trim(), "base64").length,
      fileName
    });

    return {
      path: savedPath,
      mediaType,
      fileName,
      mimeType: body.mimeType || "application/octet-stream"
    };
  }

  if (body.screenshotPath) {
    return {
      path: resolveSafePath(body.screenshotPath),
      mediaType: "screenshot",
      fileName: path.basename(String(body.screenshotPath)),
      mimeType: "image/png"
    };
  }

  if (body.file && typeof body.file === "string" && body.file.trim()) {
    const resolvedPath = resolveSafePath(body.file.trim());
    const fileName = body.fileName || path.basename(resolvedPath);
    const mediaType = detectMediaType({
      mimeType: body.mimeType,
      fileName,
      declaredType: body.mediaType
    });
    const stats = fs.statSync(resolvedPath);
    validateMediaSize({
      mediaType,
      sizeBytes: stats.size,
      fileName
    });
    return {
      path: resolvedPath,
      mediaType,
      fileName,
      mimeType: body.mimeType || "application/octet-stream"
    };
  }

  return null;
}

export default function createChatRoutes(context) {
  const router = express.Router();

  function parseBooleanFlag(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "on", "yes"].includes(normalized)) return true;
      if (["false", "0", "off", "no"].includes(normalized)) return false;
    }
    return fallback;
  }

  function resolveActiveSessionId(req) {
    const requestedSessionId = req.body?.sessionId || req.body?.conversationId || null;

    if (requestedSessionId === "widget") {
      return getLastSessionId(context);
    }

    return requestedSessionId || getLastSessionId(context) || "default";
  }

  router.post("/", upload.any(), async (req, res) => {
    try {
      const text = typeof req.body?.text === "string" ? req.body.text : "";
      const realtimeThinkingEnabled = parseBooleanFlag(req.body?.realtimeThinkingEnabled, false);
      const webSearchEnabled = parseBooleanFlag(req.body?.webSearchEnabled, true);
      const activeSessionId = resolveActiveSessionId(req);
      const session = ensureSession(context, activeSessionId);
      const media = resolveBodyMedia(req, activeSessionId, session);
      const persistedUserText = buildPersistedUserText(text, media);

      if (!text.trim() && !media) {
        return res.status(400).json({
          success: false,
          error: "Texto ou midia obrigatorios."
        });
      }

      if (media?.path) {
        registerSessionMedia(session, media);
      }

      addMessage({
        role: "user",
        text: persistedUserText,
        timestamp: new Date().toISOString(),
        groupId: activeSessionId
      });

      onUserReply(context);

      context.lastUserInteraction = Date.now();
      setLastSessionId(context, activeSessionId);

      if (text.trim() && context.core?.eventBus) {
        context.core.eventBus.emit("user:response", {
          sessionId: activeSessionId,
          text: text.trim(),
          timestamp: Date.now()
        });
      }

      context.core?.eventBus?.emit("user:message", {
        sessionId: activeSessionId,
        role: "user",
        text: persistedUserText,
        timestamp: Date.now(),
        origin: "chat.route"
      });

      const studioIntent = detectStudioIntent(text);
      if (text.trim() && studioIntent.matches) {
        const launch = await createStudioProjectFromCommand({
          command: text,
          source: resolveStudioSource(activeSessionId),
          attachments: buildStudioAttachments(media),
          context
        });
        const responseText = launch.initialState?.launch?.assistantMessage || "KIT Studio aberto com briefing inicial.";

        context.core?.responseQueue?.enqueue({
          text: responseText,
          speak: false,
          priority: 1,
          source: "studio-launch",
          userFacing: true,
          sessionId: activeSessionId
        });

        return res.json({
          success: true,
          sessionId: activeSessionId,
          handled: true,
          route: "studio-launch",
          studio: launch,
          media: media ? {
            path: media.path,
            mediaType: media.mediaType,
            fileName: media.fileName
          } : null
        });
      }

      const globalVideoIntent = detectGlobalVideoIntent(text, media, session, resolveStudioSource(req.body?.sessionId || activeSessionId));
      if (text.trim() && globalVideoIntent) {
        const job = await enqueueVideoJob(globalVideoIntent, context);
        const responseText = job?.mode === "i2v"
          ? "Iniciei um job de video a partir da imagem atual. Vou usar o motor global da KIT."
          : "Iniciei um job global de video com esse prompt.";

        context.core?.responseQueue?.enqueue({
          text: responseText,
          speak: false,
          priority: 1,
          source: "global-video",
          userFacing: true,
          sessionId: activeSessionId
        });

        return res.json({
          success: true,
          sessionId: activeSessionId,
          handled: true,
          route: "global-video",
          job,
          media: media ? {
            path: media.path,
            mediaType: media.mediaType,
            fileName: media.fileName
          } : null
        });
      }

      const canvasCommand = resolveCanvasCommand(text, media);
      if (canvasCommand) {
        const result = await context.invokeTool("canvas_control", {
          ...canvasCommand,
          payload: canvasCommand.payload || {}
        });
        const responseText = formatCanvasCommandResponse(result);

        context.core?.responseQueue?.enqueue({
          text: responseText,
          speak: false,
          priority: 1,
          source: "canvas-bridge",
          userFacing: true,
          sessionId: activeSessionId
        });

        return res.json({
          success: result?.status === "ok",
          sessionId: activeSessionId,
          handled: true,
          route: "canvas-bridge",
          canvas: result?.data || null,
          error: result?.status === "ok" ? null : result?.error || "Falha ao executar comando no Canvas.",
          media: media ? {
            path: media.path,
            mediaType: media.mediaType,
            fileName: media.fileName
          } : null
        });
      }

      const orchestrator = context.core.orchestrator;
      if (!orchestrator) {
        return res.status(500).json({
          success: false,
          error: "Orchestrator nao inicializado."
        });
      }

      const orchestration = await orchestrator.handle({
        input: text.trim(),
        filePath: media?.path || null,
        screenshotPath: media?.mediaType === "screenshot" ? media.path : null,
        mediaType: media?.mediaType || null,
        mimeType: media?.mimeType || null,
        realtimeThinkingEnabled,
        webSearchEnabled,
        sessionId: activeSessionId,
        source: "user"
      });

      return res.json({
        success: true,
        sessionId: activeSessionId,
        handled: orchestration?.handled ?? false,
        route: orchestration?.type || null,
        taskId: orchestration?.taskId || null,
        busy: orchestration?.busy || false,
        error: orchestration?.error || null,
        media: media ? {
          path: media.path,
          mediaType: media.mediaType,
          fileName: media.fileName
        } : null
      });
    } catch (err) {
      console.error("Erro critico na rota /chat:", err);

      return res.status(500).json({
        success: false,
        error: err.message || "Erro interno ao processar a mensagem de chat."
      });
    }
  });

  router.get("/queue", (req, res) => {
    try {
      const completed = context.core?.routes?.task?.listRecentCompleted?.() || [];

      return res.json({
        success: true,
        data: completed
      });
    } catch (err) {
      console.error("Erro ao buscar fila de processamento:", err);
      return res.status(500).json({
        success: false,
        error: "Erro ao acessar fila de tarefas."
      });
    }
  });

  return router;
}
