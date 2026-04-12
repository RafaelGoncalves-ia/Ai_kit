import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { addMessage } from "../utils/conversationStore.js";
import {
  resolveSafePath,
  resolveSessionMediaPath
} from "../core/security/workspaceGuard.js";
import { setLastSessionId } from "../utils/runtimeState.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

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

function resolveSessionMediaTarget(sessionId, fileName, session) {
  const safeFileName = sanitizeFileName(fileName);
  const projectPath =
    session?.activeExecution?.projectPath ||
    session?.memory?.lastProjectPath ||
    null;

  if (projectPath) {
    return resolveSafePath(path.join(projectPath, "media", safeFileName));
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

function resolveBodyMedia(req, sessionId, session) {
  const body = req.body || {};
  const uploadedFile = getUploadedImageFile(req);

  if (uploadedFile) {
    if (!isLikelyImage({ mimeType: uploadedFile.mimetype, fileName: uploadedFile.originalname })) {
      throw new Error("O arquivo enviado nao parece ser uma imagem valida.");
    }

    return {
      path: saveBufferToSessionMedia(sessionId, uploadedFile.buffer, uploadedFile.originalname || "upload.png", session),
      mediaType: "image",
      fileName: uploadedFile.originalname || "upload.png",
      mimeType: uploadedFile.mimetype || "application/octet-stream"
    };
  }

  if (body.fileBase64 || body.imageBase64) {
    const fileName = body.fileName || body.imageName || "upload-base64.png";
    const savedPath = saveBase64ToSessionMedia(sessionId, body.fileBase64 || body.imageBase64, fileName, session);

    if (!savedPath) {
      throw new Error("Payload de imagem base64 vazio.");
    }

    return {
      path: savedPath,
      mediaType: body.mediaType || "image",
      fileName,
      mimeType: body.mimeType || "image/png"
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
    return {
      path: resolvedPath,
      mediaType: body.mediaType || "image",
      fileName: body.fileName || path.basename(resolvedPath),
      mimeType: body.mimeType || "application/octet-stream"
    };
  }

  return null;
}

export default function createChatRoutes(context) {
  const router = express.Router();

  router.post("/", upload.any(), async (req, res) => {
    try {
      const text = typeof req.body?.text === "string" ? req.body.text : "";
      const activeSessionId = req.body?.sessionId || req.body?.conversationId || "default";
      const session = ensureSession(context, activeSessionId);
      const media = resolveBodyMedia(req, activeSessionId, session);

      if (!text.trim() && !media) {
        return res.status(400).json({
          success: false,
          error: "Texto ou imagem obrigatorios."
        });
      }

      if (media?.path) {
        registerSessionMedia(session, media);
      }

      addMessage({
        role: "user",
        text: text.trim() || `<Imagem enviada: ${media?.fileName || media?.path || "sem-nome"}>`,
        timestamp: new Date().toISOString(),
        groupId: activeSessionId
      });

      if (text.trim()) {
        void context.invokeTool("memory_access", {
          action: "process_input",
          text: text.trim(),
          source: "realtime.memory-input",
          sessionId: activeSessionId
        }).catch((err) => {
          console.warn("[CHAT] Falha nao bloqueante ao consolidar memoria do usuario:", err?.message || err);
        });
      }

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

      const orchestrator = context.core.orchestrator;
      if (!orchestrator) {
        return res.status(500).json({
          success: false,
          error: "Orchestrator nao inicializado."
        });
      }

      const orchestration = await orchestrator.handle({
        input: text.trim(),
        filePath: media?.mediaType === "image" ? media.path : null,
        screenshotPath: media?.mediaType === "screenshot" ? media.path : null,
        mediaType: media?.mediaType || null,
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
