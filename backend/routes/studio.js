import express from "express";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import studioLaunchService from "../skills/studio/studioLaunchService.js";
import studioBriefingBuilder from "../skills/studio/studioBriefingBuilder.js";
import studioScriptGenerator from "../skills/studio/studioScriptGenerator.js";
import studioSceneInstruction from "../skills/studio/studioSceneInstruction.js";
import clientKitLoader from "../skills/studio/clientKitLoader.js";
import studioProjectStore from "../skills/studio/studioProjectStore.js";
import { createStableDiffusionClient } from "../services/sdClient.js";
import stableDiffusionConfigModule from "../config/stableDiffusionConfig.cjs";
import workspaceLayout from "../services/workspaceLayout.cjs";

const { createStudioProjectFromCommand, detectStudioIntent } = studioLaunchService;
const { buildStudioBriefingFromCommand } = studioBriefingBuilder;
const { generateStudioScript } = studioScriptGenerator;
const { applyStudioSceneInstruction } = studioSceneInstruction;
const { findClientKit, normalizeKey } = clientKitLoader;
const {
  STUDIO_PROJECTS_DIR,
  saveStudioProject,
  findStudioProjectRecordById,
  listStudioProjectFiles,
  loadStudioProject
} = studioProjectStore;
const { loadStableDiffusionConfig } = stableDiffusionConfigModule;
const ROOT_DIR = path.resolve(process.cwd());
const MEDIA_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".svg",
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".avi",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a"
]);

function normalizeAttachments(value) {
  return Array.isArray(value) ? value : [];
}

function ensureArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function exists(filePath = "") {
  try {
    return Boolean(filePath) && fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function resolveMaybePath(filePath = "") {
  if (!filePath) {
    return "";
  }

  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(ROOT_DIR, filePath);
  return exists(absolute) ? absolute : "";
}

function getMediaKind(filePath = "", explicitType = "") {
  const extension = path.extname(String(filePath || "")).toLowerCase();
  const type = String(explicitType || "").toLowerCase();

  if (/\b(image|foto|img)\b/.test(type) || [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"].includes(extension)) {
    return "image";
  }

  if (/\b(video|clip)\b/.test(type) || [".mp4", ".webm", ".mov", ".mkv", ".avi"].includes(extension)) {
    return "video";
  }

  if (/\b(audio|voz|voice)\b/.test(type) || [".mp3", ".wav", ".ogg", ".m4a"].includes(extension)) {
    return "audio";
  }

  return "file";
}

function normalizeMediaItem(item = {}, defaults = {}) {
  const rawPath = String(item.path || item.filePath || defaults.path || "").trim();
  const resolvedPath = resolveMaybePath(rawPath);
  const finalPath = resolvedPath || rawPath;
  const explicitLabel = String(item.label || item.name || item.fileName || defaults.label || "").trim();
  const label = explicitLabel || (finalPath ? path.basename(finalPath) : "Referencia");
  const type = getMediaKind(finalPath, item.type || defaults.type);

  return {
    id: String(item.id || defaults.id || `${defaults.source || "media"}:${finalPath || label}`),
    label,
    path: finalPath,
    fileName: finalPath ? path.basename(finalPath) : label,
    kind: type,
    type: String(item.type || defaults.type || type),
    role: String(item.role || defaults.role || "scene-reference"),
    source: String(item.source || defaults.source || "unknown"),
    sceneId: item.sceneId || defaults.sceneId || null,
    projectId: item.projectId || defaults.projectId || null,
    clientName: item.clientName || defaults.clientName || "",
    exists: exists(finalPath)
  };
}

function dedupeItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.source}::${item.path || item.label}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function loadStudioProjectRecordById(projectId = "") {
  return findStudioProjectRecordById(projectId);
}

function loadStudioProjectById(projectId = "") {
  return loadStudioProjectRecordById(projectId)?.project || null;
}

function listStudioProjects() {
  return listStudioProjectFiles()
    .map((filePath) => {
      try {
        return loadStudioProject(filePath)?.project || null;
      } catch {
        return null;
      }
    })
    .filter((project) => project && typeof project === "object");
}

function getProjectContext(req) {
  const projectId = String(req.query?.projectId || "").trim();
  const project = projectId ? loadStudioProjectById(projectId) : null;
  const clientName = String(req.query?.clientName || project?.clientName || "").trim();
  const clientId = String(req.query?.clientId || project?.clientId || "").trim();
  return { projectId, project, clientName, clientId };
}

function collectClientMedia({ clientName = "", attachments = [] } = {}) {
  const match = findClientKit(clientName, attachments);
  const clientKit = match?.clientKit || null;
  const clientWorkspace = clientName ? workspaceLayout.ensureClientWorkspace(clientName) : null;
  if (!clientKit) {
    return dedupeItems(
      collectClientWorkspaceMedia(clientWorkspace, clientName)
        .map((asset, index) => normalizeMediaItem(asset, {
          id: `client-workspace:${index + 1}`,
          source: "client-workspace",
          clientName
        }))
        .filter((item) => item.path && item.exists)
    );
  }

  const clientAssets = [
    ...(Array.isArray(clientKit.logos) ? clientKit.logos : []),
    ...(Array.isArray(clientKit.assets?.global) ? clientKit.assets.global : []),
    ...(Array.isArray(clientKit.assets?.frames) ? clientKit.assets.frames : []),
    ...(Array.isArray(clientKit.assets?.watermarks) ? clientKit.assets.watermarks : []),
    ...(Array.isArray(clientKit.assets?.recurring) ? clientKit.assets.recurring : [])
  ];

  return dedupeItems(
    [
      ...clientAssets,
      ...collectClientWorkspaceMedia(clientWorkspace, clientName)
    ]
      .map((asset, index) => normalizeMediaItem(asset, {
        id: `client-media:${index + 1}`,
        source: "client-media",
        clientName
      }))
      .filter((item) => item.path && item.exists)
  );
}

function collectClientWorkspaceMedia(clientWorkspace = null, clientName = "") {
  if (!clientWorkspace?.assetsRoot || !exists(clientWorkspace.assetsRoot)) {
    return [];
  }

  const items = [];
  const folders = ["logo", "image", "video", "music", "audio", "fonts"];
  folders.forEach((folder) => {
    const folderPath = path.join(clientWorkspace.assetsRoot, folder);
    if (!exists(folderPath)) {
      return;
    }
    fs.readdirSync(folderPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .forEach((entry) => {
        items.push({
          path: path.join(folderPath, entry.name),
          name: entry.name,
          type: folder,
          source: "client-workspace",
          clientName
        });
      });
  });

  return items;
}

function collectAiMedia({ projectId = "", clientName = "" } = {}) {
  const projects = listStudioProjects();
  const clientKey = normalizeKey(clientName);
  const filteredProjects = projects.filter((project) => {
    if (projectId && project.id === projectId) {
      return true;
    }

    if (!clientKey) {
      return false;
    }

    return normalizeKey(project.clientName || "") === clientKey;
  });

  const items = [];
  filteredProjects.forEach((project) => {
    const scenes = Array.isArray(project.script?.scenes) ? project.script.scenes : [];
    scenes.forEach((scene) => {
      if (scene.generatedMedia?.path || scene.generatedMedia?.filePath) {
        items.push(normalizeMediaItem(scene.generatedMedia, {
          id: `ai-media:${project.id}:${scene.id}:media`,
          source: "ai-media",
          role: "scene-reference",
          sceneId: scene.id,
          projectId: project.id,
          clientName: project.clientName || "",
          type: scene.mediaType || "image"
        }));
      }

      if (scene.audioAsset?.path || scene.audioAsset?.filePath) {
        items.push(normalizeMediaItem(scene.audioAsset, {
          id: `ai-media:${project.id}:${scene.id}:audio`,
          source: "ai-media",
          role: "scene-reference",
          sceneId: scene.id,
          projectId: project.id,
          clientName: project.clientName || "",
          type: "audio"
        }));
      }
    });
  });

  return dedupeItems(items.filter((item) => item.path && item.exists));
}

function collectProjectAttachments(project = null) {
  if (!project) {
    return [];
  }

  return dedupeItems(
    normalizeAttachments(project.attachments)
      .map((attachment, index) => normalizeMediaItem(attachment, {
        id: `project-attachment:${project.id}:${index + 1}`,
        source: "project-attachments",
        projectId: project.id,
        clientName: project.clientName || ""
      }))
      .filter((item) => {
        if (item.path && item.exists) {
          return true;
        }
        const extension = path.extname(item.fileName || item.path || "").toLowerCase();
        return MEDIA_EXTENSIONS.has(extension);
      })
  );
}

function resolveGenerationMode({ mode = "", references = [] } = {}) {
  const requestedMode = String(mode || "auto").trim().toLowerCase();
  if (requestedMode === "inpaint") {
    return "inpaint";
  }
  if (requestedMode === "img2img") {
    return "img2img";
  }
  if (requestedMode === "txt2img") {
    return "txt2img";
  }

  const hasVisualReference = ensureArray(references).some((reference) => {
    const mediaPath = resolveMaybePath(reference?.path || reference?.filePath || "");
    const extension = path.extname(mediaPath).toLowerCase();
    return [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"].includes(extension);
  });

  return hasVisualReference ? "img2img" : "txt2img";
}

function pickBaseImageReference(references = []) {
  return ensureArray(references)
    .map((reference) => resolveMaybePath(reference?.path || reference?.filePath || ""))
    .find((mediaPath) => [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"].includes(path.extname(mediaPath).toLowerCase())) || "";
}

function resolveSceneImageSize({ ratio = "", width = 0, height = 0, client = null } = {}) {
  const explicitWidth = Number(width || 0);
  const explicitHeight = Number(height || 0);
  if (explicitWidth > 0 && explicitHeight > 0) {
    return client.resolveGenerationSize({
      artboard: {
        width: explicitWidth,
        height: explicitHeight,
        preset: ""
      },
      width: explicitWidth,
      height: explicitHeight,
      architecture: "sd15"
    });
  }

  const normalizedRatio = String(ratio || "1:1").trim();
  const ratioMap = {
    "1:1": { width: 512, height: 512 },
    "4:5": { width: 512, height: 640 },
    "3:4": { width: 512, height: 682 },
    "9:16": { width: 512, height: 912 },
    "16:9": { width: 768, height: 432 }
  };
  return {
    ...(ratioMap[normalizedRatio] || ratioMap["1:1"]),
    ratio: normalizedRatio
  };
}

function getStudioProjectAssetDir(projectId = "", filePath = "") {
  const safeProjectId = String(projectId || "").trim() || "studio-project";
  const normalizedFilePath = String(filePath || "").trim();
  if (normalizedFilePath) {
    return path.join(path.dirname(normalizedFilePath), "generated", "images");
  }

  return path.join(STUDIO_PROJECTS_DIR, "generated", safeProjectId, "images");
}

function copyGeneratedAssetToProject({ sourcePath = "", projectId = "", sceneId = "", filePath = "" } = {}) {
  const resolvedSource = resolveMaybePath(sourcePath);
  if (!resolvedSource) {
    throw new Error("Arquivo gerado pelo worker SD nao encontrado.");
  }

  const assetDir = getStudioProjectAssetDir(projectId, filePath);
  fs.mkdirSync(assetDir, { recursive: true });
  const extension = path.extname(resolvedSource) || ".png";
  const targetPath = path.join(
    assetDir,
    `${sceneId || "scene"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`
  );
  fs.copyFileSync(resolvedSource, targetPath);
  return targetPath;
}

function updateSceneGeneratedMedia(project = {}, sceneId = "", generatedMedia = null) {
  const scenes = ensureArray(project?.script?.scenes).map((scene) => {
    if (scene?.id !== sceneId) {
      return scene;
    }

    return {
      ...scene,
      generatedMedia,
      status: generatedMedia ? "media-ready" : scene.status,
      productionStatus: generatedMedia ? "pronto" : scene.productionStatus
    };
  });

  return {
    ...project,
    script: {
      ...project.script,
      scenes
    }
  };
}

export default function createStudioRoutes(context = {}) {
  const router = express.Router();
  const sdClient = createStableDiffusionClient();

  router.post("/launch", async (req, res) => {
    try {
      const command = String(req.body?.command || "").trim();
      const source = String(req.body?.source || "api").trim();
      const attachments = normalizeAttachments(req.body?.attachments);

      if (!command) {
        return res.status(400).json({
          success: false,
          error: "command obrigatorio."
        });
      }

      const detectedIntent = detectStudioIntent(command);
      const launch = await createStudioProjectFromCommand({
        command,
        source,
        attachments,
        context
      });

      return res.json({
        success: true,
        ...launch,
        detectedIntent
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao iniciar Studio."
      });
    }
  });

  router.post("/briefing/from-command", async (req, res) => {
    try {
      const command = String(req.body?.command || "").trim();
      const attachments = normalizeAttachments(req.body?.attachments);
      const parsed = await buildStudioBriefingFromCommand({
        command,
        attachments,
        context
      });

      return res.json({
        success: true,
        ...parsed
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao gerar briefing a partir do comando.",
        client: null,
        clientKit: null,
        briefing: null,
        warnings: [err.message || "Erro inesperado no parser."]
      });
    }
  });

  router.post("/script/generate", async (req, res) => {
    try {
      const projectId = String(req.body?.projectId || "").trim();
      const briefing = req.body?.briefing && typeof req.body.briefing === "object" ? req.body.briefing : {};
      const clientKit = req.body?.clientKit && typeof req.body.clientKit === "object" ? req.body.clientKit : null;
      const script = await generateStudioScript({
        projectId,
        briefing,
        clientKit,
        context
      });

      return res.json({
        success: true,
        ...script
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao gerar roteiro do Studio.",
        totalDuration: 0,
        postCaption: "",
        scenes: [],
        warnings: [err.message || "Erro inesperado no gerador de roteiro."]
      });
    }
  });

  router.post("/scene/instruction", async (req, res) => {
    try {
      const projectId = String(req.body?.projectId || "").trim();
      const sceneId = String(req.body?.sceneId || "").trim();
      const instruction = String(req.body?.instruction || "").trim();
      const briefing = req.body?.briefing && typeof req.body.briefing === "object" ? req.body.briefing : {};
      let scene = req.body?.scene && typeof req.body.scene === "object" ? req.body.scene : null;

      if (!sceneId) {
        return res.status(400).json({
          success: false,
          error: "sceneId obrigatorio."
        });
      }

      if (!instruction) {
        return res.status(400).json({
          success: false,
          error: "instruction obrigatoria."
        });
      }

      if (!scene && projectId) {
        const project = loadStudioProjectById(projectId);
        scene = Array.isArray(project?.script?.scenes)
          ? project.script.scenes.find((item) => item?.id === sceneId) || null
          : null;
      }

      if (!scene) {
        return res.status(404).json({
          success: false,
          error: "Cena nao encontrada."
        });
      }

      const result = await applyStudioSceneInstruction({
        projectId,
        sceneId,
        instruction,
        scene,
        briefing,
        context
      });

      return res.json({
        success: true,
        ...result
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao aplicar instrucao contextual na cena.",
        updatedScene: null,
        assistantMessage: "Nao consegui ajustar a cena agora."
      });
    }
  });

  router.post("/media/generate-image", async (req, res) => {
    try {
      const projectId = String(req.body?.projectId || "").trim();
      const sceneId = String(req.body?.sceneId || "").trim();
      const prompt = String(req.body?.prompt || "").trim();
      const negativePrompt = String(req.body?.negativePrompt || "").trim();
      const ratio = String(req.body?.ratio || "").trim();
      const model = String(req.body?.model || "").trim();
      const quality = String(req.body?.quality || "standard").trim();
      const references = ensureArray(req.body?.references);
      const requestedMode = resolveGenerationMode({
        mode: req.body?.mode,
        references
      });

      if (!projectId) {
        return res.status(400).json({
          success: false,
          error: "projectId obrigatorio."
        });
      }

      if (!sceneId) {
        return res.status(400).json({
          success: false,
          error: "sceneId obrigatorio."
        });
      }

      if (!prompt) {
        return res.status(400).json({
          success: false,
          error: "prompt obrigatorio."
        });
      }

      if (requestedMode === "inpaint") {
        return res.status(501).json({
          success: false,
          error: "Stub preparado para inpaint futuro. Use txt2img ou img2img por enquanto."
        });
      }

      const projectRecord = loadStudioProjectRecordById(projectId);
      if (!projectRecord?.project) {
        return res.status(404).json({
          success: false,
          error: "Projeto Studio nao encontrado."
        });
      }

      const project = projectRecord.project;
      const scene = ensureArray(project.script?.scenes).find((item) => item?.id === sceneId);
      if (!scene) {
        return res.status(404).json({
          success: false,
          error: "Cena nao encontrada no projeto."
        });
      }

      const config = loadStableDiffusionConfig();
      if (!config.valid) {
        return res.status(500).json({
          success: false,
          error: config.errors?.join(" | ") || "Configuracao SD invalida."
        });
      }

      const baseImagePath = pickBaseImageReference(references);
      const mode = requestedMode === "img2img" && !baseImagePath ? "txt2img" : requestedMode;
      const resolvedSize = resolveSceneImageSize({
        ratio: ratio || project?.briefing?.ratio || "1:1",
        width: Number(req.body?.width || 0),
        height: Number(req.body?.height || 0),
        client: sdClient
      });

      const sdPayload = {
        prompt,
        negative_prompt: negativePrompt,
        checkpoint: model || undefined,
        width: resolvedSize.width,
        height: resolvedSize.height,
        steps: quality === "high" ? 32 : 24,
        cfg_scale: quality === "high" ? 7.5 : 7,
        image_path: mode === "img2img" ? baseImagePath : null,
        denoising_strength: mode === "img2img" ? 0.55 : undefined
      };

      const result = await sdClient.generate(mode, sdPayload);
      const projectAssetPath = copyGeneratedAssetToProject({
        sourcePath: result?.file || "",
        projectId,
        sceneId,
        filePath: projectRecord.filePath
      });

      const mediaId = `studio-media-${randomUUID()}`;
      const generatedMedia = {
        id: mediaId,
        mediaId,
        label: `${scene.title || `Cena ${scene.index}`} - imagem`,
        type: "image",
        kind: "image",
        path: projectAssetPath,
        filePath: projectAssetPath,
        thumbnailPath: projectAssetPath,
        source: "ai-media",
        metadata: {
          ...(result?.metadata || {}),
          mode,
          prompt,
          negativePrompt,
          ratio: ratio || project?.briefing?.ratio || result?.metadata?.ratio || "",
          width: resolvedSize.width,
          height: resolvedSize.height,
          model: model || "",
          quality,
          references,
          baseImagePath: baseImagePath || null
        }
      };

      const updatedProject = updateSceneGeneratedMedia(project, sceneId, generatedMedia);
      saveStudioProject(updatedProject, projectRecord.filePath);

      return res.json({
        success: true,
        mediaId,
        type: "image",
        path: projectAssetPath,
        thumbnailPath: projectAssetPath,
        metadata: generatedMedia.metadata
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao gerar imagem da cena no Studio."
      });
    }
  });

  router.get("/client-media", async (req, res) => {
    try {
      const { project, clientName } = getProjectContext(req);
      const items = collectClientMedia({
        clientName,
        attachments: project?.attachments || []
      });

      return res.json({
        success: true,
        items
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao listar midia do cliente.",
        items: []
      });
    }
  });

  router.get("/ai-media", async (req, res) => {
    try {
      const { projectId, clientName } = getProjectContext(req);
      const items = collectAiMedia({ projectId, clientName });

      return res.json({
        success: true,
        items
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao listar midia de IA.",
        items: []
      });
    }
  });

  router.get("/project-attachments", async (req, res) => {
    try {
      const { project } = getProjectContext(req);
      const items = collectProjectAttachments(project);

      return res.json({
        success: true,
        items
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || "Falha ao listar anexos do projeto.",
        items: []
      });
    }
  });

  return router;
}
