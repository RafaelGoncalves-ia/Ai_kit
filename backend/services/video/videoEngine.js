import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import studioProjectStore from "../../skills/studio/studioProjectStore.js";
import studioProjectSchema from "../../skills/studio/studioProjectSchema.js";
import { resolveVideoModel } from "./videoModelRegistry.js";
import { selectVideoPipeline } from "./pipelines/selectVideoPipeline.js";
import { buildVideoGenerationConfig } from "./utils/buildVideoGenerationConfig.js";
import { buildVideoOutputMetadata } from "./utils/buildVideoOutputMetadata.js";
import { cleanupVideoMemory } from "./utils/cleanupVideoMemory.js";
import { extractLastFrameFromVideo } from "./utils/extractLastFrameFromVideo.js";
import { resolveVideoPaths, resolveProjectVideoAssetDir } from "./utils/resolveVideoPaths.js";

const {
  STUDIO_PROJECTS_DIR,
  saveStudioProject,
  findStudioProjectRecordById
} = studioProjectStore;
const { normalizeStudioProject } = studioProjectSchema;
const ROOT_DIR = path.resolve(process.cwd());
const VIDEO_WORKER_PATH = path.join(ROOT_DIR, "backend", "workers", "video_worker.py");
const JOBS_DIR = path.join(ROOT_DIR, "temp", "studio-video-jobs");

function ensureArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function safeReadJson(filePath = "") {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function sanitizeSegment(value = "", fallback = "video") {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-");
  return normalized || fallback;
}

function exists(filePath = "") {
  try {
    return Boolean(filePath) && fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function resolveStandaloneAssetDir(payload = {}) {
  const requestedDir = String(payload.outputDir || payload.saveDir || "").trim();
  if (requestedDir) {
    return path.isAbsolute(requestedDir)
      ? requestedDir
      : path.resolve(ROOT_DIR, requestedDir);
  }

  const sessionSegment = sanitizeSegment(payload.sessionId || payload.source || "global-video", "global-video");
  return path.join(ROOT_DIR, "output", "video", sessionSegment);
}

function loadStudioProjectRecordById(projectId = "") {
  const found = findStudioProjectRecordById(projectId);
  if (!found) {
    return null;
  }
  return {
    project: normalizeStudioProject(found.project),
    filePath: found.filePath
  };
}

function updateSceneMedia(project = {}, sceneId = "", generatedMedia = null) {
  return {
    ...project,
    script: {
      ...project.script,
      scenes: ensureArray(project.script?.scenes).map((scene) => {
        if (scene?.id !== sceneId) {
          return scene;
        }

        return {
          ...scene,
          generatedMedia,
          status: generatedMedia ? "media-ready" : scene.status,
          productionStatus: generatedMedia ? "pronto" : scene.productionStatus
        };
      })
    }
  };
}

export function createVideoEngine() {
  const jobs = new Map();

  function serializeJob(job = {}) {
    if (!job) {
      return null;
    }
    const { childProcess, ...rest } = job || {};
    return rest;
  }

  function finalizeCompletedJob(jobId = "") {
    const latest = jobs.get(jobId);
    if (!latest || latest.status !== "completed" || latest.finalized || !latest.output?.path) {
      return latest || null;
    }

    const projectRecord = latest.projectId ? loadStudioProjectRecordById(latest.projectId) : null;
    const scene = projectRecord?.project
      ? ensureArray(projectRecord.project.script?.scenes).find((item) => item?.id === latest.sceneId)
      : null;

    const lastFrameResult = extractLastFrameFromVideo({
      inputPath: latest.output.path,
      outputPath: latest.input?.lastFramePath || ""
    });
    const standardizedMetadata = buildVideoOutputMetadata({
      input: latest.input || {},
      output: {
        ...(latest.output || {}),
        lastFramePath: lastFrameResult.success ? lastFrameResult.outputPath : "",
        exportSettings: latest.input?.exportSettings || {}
      },
      conditioning: latest.input?.conditioning || {},
      pipeline: latest.input?.pipeline || null
    });
    const mediaId = `${projectRecord?.project ? "studio-video" : "global-video"}-${randomUUID()}`;
    const generatedMedia = {
      id: mediaId,
      mediaId,
      label: scene?.title
        ? `${scene.title} - video`
        : (latest.input?.fileName || latest.input?.prompt || `Video ${jobId}`),
      type: "video",
      kind: "video",
      path: latest.output.path,
      filePath: latest.output.path,
      thumbnailPath: latest.output.thumbnailPath || null,
      source: "ai-media",
      metadata: standardizedMetadata
    };

    if (projectRecord?.project && scene) {
      const updatedProject = updateSceneMedia(projectRecord.project, latest.sceneId, generatedMedia);
      saveStudioProject(updatedProject, projectRecord.filePath);
    }
    const transientFiles = [
      ...ensureArray(latest.input?.temporaryFiles),
      latest.output?.sourceImage && String(latest.output.sourceImage).startsWith(String(latest.input?.workingDir || ""))
        ? latest.output.sourceImage
        : ""
    ].filter(Boolean);
    cleanupVideoMemory({
      transientFiles,
      runGc: true
    });
    return updateJob(jobId, {
      finalized: true,
      output: {
        ...(latest.output || {}),
        mediaId,
        type: "video",
        path: latest.output.path,
        thumbnailPath: latest.output.thumbnailPath || null,
        duration: standardizedMetadata.duration || 0,
        fps: standardizedMetadata.fps || 0,
        width: standardizedMetadata.width || 0,
        height: standardizedMetadata.height || 0,
        ratio: standardizedMetadata.ratio || "",
        frames: standardizedMetadata.frames || 0,
        sequenceLength: standardizedMetadata.sequenceLength || 0,
        lastFramePath: lastFrameResult.success ? lastFrameResult.outputPath : "",
        metadata: generatedMedia.metadata
      }
    });
  }

  function getJob(jobId = "") {
    const current = jobs.get(jobId) || null;
    if (current?.status === "cancelled") {
      return serializeJob(current);
    }
    if (!current?.statusPath || !exists(current.statusPath)) {
      return serializeJob(current);
    }

    const latest = safeReadJson(current.statusPath);
    if (!latest) {
      return serializeJob(current);
    }

    const merged = {
      ...current,
      ...latest
    };
    jobs.set(jobId, merged);
    return serializeJob(finalizeCompletedJob(jobId) || merged);
  }

  function updateJob(jobId = "", patch = {}) {
    const current = jobs.get(jobId) || {};
    const next = {
      ...current,
      ...patch
    };
    jobs.set(jobId, next);
    return next;
  }

  async function enqueue(payload = {}) {
    const projectId = String(payload.projectId || "").trim();
    const sceneId = String(payload.sceneId || "").trim();
    const projectRecord = projectId ? loadStudioProjectRecordById(projectId) : null;
    if (projectId && !projectRecord?.project) {
      throw new Error("Projeto Studio nao encontrado.");
    }

    const scene = projectRecord?.project
      ? ensureArray(projectRecord.project.script?.scenes).find((item) => item?.id === sceneId)
      : null;
    if (projectRecord?.project && !sceneId) {
      throw new Error("sceneId obrigatorio para projeto Studio.");
    }
    if (projectRecord?.project && !scene) {
      throw new Error("Cena nao encontrada no projeto.");
    }

    const generationConfig = buildVideoGenerationConfig({
      duration: payload.duration || scene?.duration || 5,
      fps: payload.fps || 16,
      ratio: payload.ratio || projectRecord?.project?.briefing?.ratio || "9:16",
      width: payload.width,
      height: payload.height,
      preset: payload.preset || payload.quality || "standard",
      quality: payload.quality || payload.preset || "standard"
    });
    const resolvedModel = resolveVideoModel({
      requestedModel: payload.model || "",
      mode: String(payload.mode || scene?.generationMode || "").trim().toLowerCase() || undefined
    });
    const jobId = `video-job-${randomUUID()}`;
    const jobDir = path.join(JOBS_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    const statusPath = path.join(jobDir, "status.json");
    const payloadPath = path.join(jobDir, "payload.json");
    const standaloneAssetDir = !projectRecord?.filePath
      ? resolveStandaloneAssetDir(payload)
      : "";
    const outputs = resolveVideoPaths({
      projectFilePath: projectRecord?.filePath || "",
      assetDir: standaloneAssetDir || undefined,
      fallbackRoot: STUDIO_PROJECTS_DIR,
      sceneId: scene?.id || payload.fileName || payload.name || "video",
      jobId,
      ratio: generationConfig.ratio
    });

    const baseWorkerPayload = {
      id: jobId,
      projectId,
      sceneId,
      sessionId: String(payload.sessionId || "").trim(),
      source: String(payload.source || "studio").trim() || "studio",
      fileName: String(payload.fileName || payload.name || "").trim(),
      prompt: payload.prompt || scene?.visualPrompt || scene?.visualDescription || scene?.title || "",
      negativePrompt: payload.negativePrompt || scene?.negativePrompt || "",
      motionPrompt: payload.motionPrompt || scene?.motionPrompt || "",
      duration: generationConfig.duration,
      fps: generationConfig.fps,
      frames: generationConfig.frames,
      sequenceLength: generationConfig.sequenceLength,
      width: generationConfig.width,
      height: generationConfig.height,
      ratio: generationConfig.ratio,
      preset: generationConfig.preset,
      model: resolvedModel?.id || String(payload.model || "").trim(),
      modelPath: resolvedModel?.modelPath || "",
      modelFamily: resolvedModel?.family || "",
      modelRegistryEntry: resolvedModel || null,
      quality: generationConfig.quality,
      exportSettings: generationConfig.exportSettings,
      references: ensureArray(payload.references || scene?.references),
      startImage: String(payload.startImage || "").trim(),
      endImage: payload.endImage || "",
      outputPath: outputs.outputPath,
      thumbnailPath: outputs.thumbnailPath,
      lastFramePath: outputs.lastFramePath,
      projectAssetDir: resolveProjectVideoAssetDir(projectRecord?.filePath || "", STUDIO_PROJECTS_DIR),
      workingDir: jobDir
    };

    const selectedPipeline = selectVideoPipeline({
      scene: scene || {},
      payload: baseWorkerPayload,
      modelEntry: resolvedModel || null,
      output: outputs
    });
    const workerPayload = {
      ...selectedPipeline.workerInput,
      mode: selectedPipeline.mode,
      summaryLogs: selectedPipeline.summaryLogs,
      conditioning: selectedPipeline.conditioning
    };

    fs.writeFileSync(payloadPath, `${JSON.stringify(workerPayload, null, 2)}\n`, "utf8");

    updateJob(jobId, {
      id: jobId,
      projectId,
      sceneId,
      sessionId: baseWorkerPayload.sessionId,
      source: baseWorkerPayload.source,
      mode: workerPayload.mode,
      status: "queued",
      progress: 0,
      input: workerPayload,
      output: null,
      error: null,
      model: resolvedModel || null,
      statusPath,
      payloadPath,
      projectFilePath: projectRecord?.filePath || ""
    });

    const child = spawn("python", [VIDEO_WORKER_PATH, payloadPath, statusPath], {
      cwd: ROOT_DIR,
      windowsHide: true,
      stdio: "ignore"
    });
    updateJob(jobId, {
      childProcess: child
    });

    child.on("error", (err) => {
      updateJob(jobId, {
        status: "failed",
        progress: 100,
        error: err.message || String(err)
      });
    });

    child.on("exit", () => {
      void getJob(jobId);
    });

    return getJob(jobId);
  }

  function listJobs(filters = {}) {
    const source = String(filters.source || "").trim();
    const sessionId = String(filters.sessionId || "").trim();
    return Array.from(jobs.values())
      .map((job) => serializeJob(job))
      .filter((job) => (!source || job.source === source) && (!sessionId || job.sessionId === sessionId))
      .sort((a, b) => String(b.id || "").localeCompare(String(a.id || "")));
  }

  function cancelJob(jobId = "") {
    const current = jobs.get(jobId);
    if (!current) {
      return null;
    }

    if (current.status === "completed" || current.status === "failed" || current.status === "cancelled") {
      return serializeJob(current);
    }

    try {
      current.childProcess?.kill?.();
    } catch {
      // ignore kill failures
    }

    const cancelled = updateJob(jobId, {
      status: "cancelled",
      progress: 100,
      error: "Job cancelado pelo usuario."
    });
    return serializeJob(cancelled);
  }

  return {
    enqueue,
    getJob,
    listJobs,
    cancelJob
  };
}
