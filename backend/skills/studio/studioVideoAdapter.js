const fs = require("fs");
const path = require("path");
const studioProjectStore = require("./studioProjectStore");
const studioProjectSchema = require("./studioProjectSchema");

const { saveStudioProject, findStudioProjectRecordById } = studioProjectStore;
const { normalizeStudioProject, updateStudioProject } = studioProjectSchema;

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

function exists(filePath = "") {
  try {
    return Boolean(filePath) && fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function isImagePath(filePath = "") {
  return [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"].includes(path.extname(String(filePath || "")).toLowerCase());
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

function getSceneRecord(project = {}, sceneId = "") {
  return ensureArray(project?.script?.scenes).find((scene) => scene?.id === sceneId) || null;
}

function resolveSceneStartImage(scene = {}) {
  const generatedMediaPath = String(scene.generatedMedia?.path || scene.generatedMedia?.filePath || "").trim();
  if (isImagePath(generatedMediaPath)) {
    return generatedMediaPath;
  }

  const imageReference = ensureArray(scene.references).find((reference) => {
    const referencePath = String(reference?.path || reference?.filePath || "").trim();
    return isImagePath(referencePath);
  });

  return String(imageReference?.path || imageReference?.filePath || "").trim();
}

function appendSceneHistory(scene = {}, entry = {}) {
  return [
    ...ensureArray(scene.history),
    {
      at: new Date().toISOString(),
      type: String(entry.type || "video").trim() || "video",
      message: String(entry.message || "").trim(),
      jobId: entry.jobId || "",
      status: entry.status || ""
    }
  ].slice(-30);
}

function updateSceneInProject(project = {}, sceneId = "", patch = {}) {
  const scenes = ensureArray(project?.script?.scenes).map((scene) => {
    if (scene?.id !== sceneId) {
      return scene;
    }

    return {
      ...scene,
      ...patch
    };
  });

  return updateStudioProject(project, {
    script: {
      ...project.script,
      scenes
    }
  });
}

function persistScenePatch(projectRecord = null, sceneId = "", patch = {}) {
  if (!projectRecord?.project || !projectRecord?.filePath) {
    return null;
  }

  const updatedProject = updateSceneInProject(projectRecord.project, sceneId, patch);
  const saved = saveStudioProject(updatedProject, projectRecord.filePath);
  return {
    project: saved.project,
    filePath: saved.filePath,
    scene: getSceneRecord(saved.project, sceneId)
  };
}

function buildGeneratedMediaFromJob(job = {}, scene = {}) {
  return {
    id: job?.output?.mediaId || job?.id || "",
    mediaId: job?.output?.mediaId || job?.id || "",
    label: scene?.title ? `${scene.title} - video` : `Video ${scene?.index || ""}`.trim(),
    type: job?.output?.type || "video",
    kind: job?.output?.type || "video",
    path: job?.output?.path || "",
    filePath: job?.output?.path || "",
    thumbnailPath: job?.output?.thumbnailPath || "",
    source: "ai-media",
    metadata: job?.output?.metadata || {}
  };
}

function buildStudioVideoPayload(input = {}) {
  const projectId = String(input.projectId || "").trim();
  const sceneId = String(input.sceneId || "").trim();
  if (!projectId || !sceneId) {
    throw new Error("projectId e sceneId sao obrigatorios para o adaptador do Studio.");
  }

  const projectRecord = loadStudioProjectRecordById(projectId);
  if (!projectRecord?.project) {
    throw new Error("Projeto Studio nao encontrado.");
  }

  const scene = getSceneRecord(projectRecord.project, sceneId);
  if (!scene) {
    throw new Error("Cena nao encontrada no projeto Studio.");
  }

  const references = ensureArray(input.references || scene.references);
  const startImage = String(input.startImage || "").trim() || resolveSceneStartImage({
    ...scene,
    references
  });

  return {
    projectRecord,
    scene,
    payload: {
      projectId,
      sceneId,
      sessionId: `studio-${projectId}`,
      source: "studio",
      mode: String(input.mode || "").trim(),
      prompt: String(input.prompt || scene.visualPrompt || scene.visualDescription || scene.title || "").trim(),
      negativePrompt: String(input.negativePrompt || scene.negativePrompt || "").trim(),
      motionPrompt: String(input.motionPrompt || scene.motionPrompt || "").trim(),
      startImage,
      endImage: String(input.endImage || "").trim(),
      duration: Number(input.duration || scene.duration || 5),
      fps: Number(input.fps || 12),
      ratio: String(input.ratio || projectRecord.project?.briefing?.ratio || "9:16").trim(),
      width: input.width,
      height: input.height,
      model: String(input.model || "").trim(),
      preset: String(input.preset || input.quality || "standard").trim() || "standard",
      quality: String(input.quality || input.preset || "standard").trim() || "standard",
      references
    }
  };
}

async function enqueueStudioVideoJob(input = {}, videoService = {}) {
  if (typeof videoService.enqueueVideoJob !== "function") {
    throw new Error("enqueueVideoJob indisponivel no videoService global.");
  }

  const prepared = buildStudioVideoPayload(input);
  const startedPatch = persistScenePatch(prepared.projectRecord, prepared.scene.id, {
    status: "gerando mídia",
    productionStatus: "gerando mídia",
    history: appendSceneHistory(prepared.scene, {
      type: "video-job",
      message: "Geracao de video iniciada pelo motor global.",
      status: "started"
    })
  });

  const job = await videoService.enqueueVideoJob(prepared.payload);

  if (startedPatch?.scene) {
    persistScenePatch(startedPatch, prepared.scene.id, {
      history: appendSceneHistory(startedPatch.scene, {
        type: "video-job",
        message: `Job ${job.id} enfileirado pelo adaptador do Studio.`,
        jobId: job.id,
        status: job.status || "queued"
      })
    });
  }

  return job;
}

async function getStudioVideoJobStatus(jobId = "", videoService = {}) {
  if (!jobId) {
    throw new Error("jobId obrigatorio.");
  }

  if (typeof videoService.getVideoJob !== "function") {
    throw new Error("getVideoJob indisponivel no videoService global.");
  }

  const job = await videoService.getVideoJob(jobId);
  if (!job) {
    return null;
  }

  if (!job.projectId || !job.sceneId) {
    return job;
  }

  const projectRecord = loadStudioProjectRecordById(job.projectId);
  const scene = getSceneRecord(projectRecord?.project, job.sceneId);
  if (!projectRecord?.project || !scene) {
    return job;
  }

  if (job.status === "completed" && job.output?.path) {
    persistScenePatch(projectRecord, scene.id, {
      generatedMedia: buildGeneratedMediaFromJob(job, scene),
      generationMode: job.output?.metadata?.mode || scene.generationMode,
      status: "media-ready",
      productionStatus: "pronto",
      history: appendSceneHistory(scene, {
        type: "video-job",
        message: `Video concluido pelo motor global (${job.output?.metadata?.mode || "auto"}).`,
        jobId: job.id,
        status: "completed"
      })
    });
    return job;
  }

  if (job.status === "failed" || job.status === "cancelled") {
    persistScenePatch(projectRecord, scene.id, {
      status: job.status === "cancelled" ? "cancelado" : "erro",
      productionStatus: job.status === "cancelled" ? "cancelado" : "erro",
      history: appendSceneHistory(scene, {
        type: "video-job",
        message: job.error || `Job de video finalizado com status ${job.status}.`,
        jobId: job.id,
        status: job.status
      })
    });
  }

  return job;
}

module.exports = {
  buildStudioVideoPayload,
  enqueueStudioVideoJob,
  getStudioVideoJobStatus
};
