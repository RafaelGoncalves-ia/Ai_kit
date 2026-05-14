const fs = require("fs");
const path = require("path");
const studioProjectStore = require("./studioProjectStore");
const studioProjectSchema = require("./studioProjectSchema");

const { saveStudioProject, findStudioProjectRecordById } = studioProjectStore;
const { normalizeStudioProject, updateStudioProject } = studioProjectSchema;
const WAN_PRESETS_PATH = path.resolve(process.cwd(), "backend", "runtimes", "wan", "presets", "wan_presets.json");

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

function resolveWanPresetForStudio(name = "wan_wide_5s", overrides = {}) {
  const presets = safeReadJson(WAN_PRESETS_PATH) || {};
  const preset = presets[name] || presets.wan_low_vram_3s || {};
  const merged = {
    ...preset,
    ...overrides
  };
  const seconds = Math.max(1, Math.round(Number(merged.seconds ?? merged.duration ?? 5)));
  const fps = Math.max(1, Math.round(Number(merged.fps ?? 16)));
  const length = seconds * fps + 1;
  return {
    ...merged,
    seconds,
    duration: seconds,
    fps,
    length,
    sequenceLength: length,
    frames: Math.max(1, length - 1)
  };
}

function resolveWanSizeFromRatio(ratio = "") {
  const normalized = String(ratio || "").trim();
  if (normalized === "16:9") {
    return { width: 832, height: 480, ratio: "16:9" };
  }
  if (["9:16", "3:4", "4:5"].includes(normalized)) {
    return { width: 480, height: 832, ratio: "9:16" };
  }
  return { width: 512, height: 512, ratio: "1:1" };
}

function normalizeStudioWanMode(value = "", hasStartImage = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["i2v", "image_to_video", "image-to-video", "standard-i2v"].includes(normalized)) {
    return "i2v";
  }
  if (["t2v", "text_to_video", "text-to-video", "standard-t2v"].includes(normalized)) {
    return "t2v";
  }
  return hasStartImage ? "i2v" : "t2v";
}

function normalizeStudioWanLoras(input = {}) {
  const explicit = ensureArray(input.loras);
  const legacy = String(input.lora || "").trim();
  const loras = explicit.length ? explicit : (legacy ? [{ path: legacy, name: path.basename(legacy), weight: 1 }] : []);
  return loras
    .filter((item) => item && (typeof item === "string" || item.enabled !== false))
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          id: `studio-wan-lora-${index + 1}`,
          name: path.basename(item),
          path: item,
          enabled: true,
          strength_model: 1,
          strength_clip: 1,
          weight: 1
        };
      }
      const strengthModel = Number(item.strength_model ?? item.strengthModel ?? item.weight ?? 1);
      const strengthClip = Number(item.strength_clip ?? item.strengthClip ?? item.weight ?? strengthModel);
      return {
        id: item.id || `studio-wan-lora-${index + 1}`,
        name: item.name || item.label || path.basename(item.path || "") || `LoRA ${index + 1}`,
        path: item.path || "",
        enabled: item.enabled !== false,
        strength_model: Number.isFinite(strengthModel) ? strengthModel : 1,
        strength_clip: Number.isFinite(strengthClip) ? strengthClip : 1,
        weight: Number.isFinite(strengthModel) ? strengthModel : 1
      };
    })
    .filter((item) => item.path)
    .slice(0, 3);
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
  const mode = normalizeStudioWanMode(input.mode || scene.generationMode || "", Boolean(startImage));
  const requestedRatio = String(input.ratio || projectRecord.project?.briefing?.ratio || "9:16").trim();
  const wanSize = resolveWanSizeFromRatio(requestedRatio);
  const presetId = String(input.presetId || input.preset_id || "wan_wide_5s").trim() || "wan_wide_5s";
  const wanPreset = resolveWanPresetForStudio(presetId, {
    seconds: input.durationSeconds ?? input.duration ?? scene.duration ?? 5,
    width: wanSize.width,
    height: wanSize.height,
    ratio: wanSize.ratio
  });

  return {
    projectRecord,
    scene,
    payload: {
      projectId,
      sceneId,
      sessionId: `studio-${projectId}`,
      source: "studio",
      mode,
      prompt: String(input.prompt || scene.visualPrompt || scene.visualDescription || scene.title || "").trim(),
      negativePrompt: String(input.negativePrompt || scene.negativePrompt || "").trim(),
      motionPrompt: String(input.motionPrompt || scene.motionPrompt || "").trim(),
      startImage,
      inputImagePath: startImage,
      endImage: String(input.endImage || "").trim(),
      duration: wanPreset.seconds,
      durationSeconds: wanPreset.seconds,
      fps: wanPreset.fps,
      frames: wanPreset.frames,
      sequenceLength: wanPreset.sequenceLength,
      ratio: wanPreset.ratio || wanSize.ratio,
      width: wanPreset.width,
      height: wanPreset.height,
      model: String(input.model || "").trim(),
      loras: normalizeStudioWanLoras(input),
      seed: Number(input.seed ?? -1),
      steps: Number(wanPreset.steps ?? 4),
      cfg: Number(wanPreset.cfg ?? 1.5),
      sampler: String(wanPreset.sampler || "euler_ancestral").trim(),
      scheduler: String(wanPreset.scheduler || "beta").trim(),
      shift: Number(wanPreset.shift ?? 8),
      denoise: Number(wanPreset.denoise ?? 0.7),
      motionStrength: Number(input.motionStrength ?? 0.5),
      imageStrength: Number(input.imageStrength ?? 0.65),
      presetId,
      preset: presetId,
      quality: presetId,
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

  if (job.status === "failed" || job.status === "cancelled" || job.status === "timeout") {
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
