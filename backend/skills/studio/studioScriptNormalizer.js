const { randomUUID } = require("crypto");
const {
  ALLOWED_SCENE_DURATIONS,
  DEFAULT_SCENE_DURATION
} = require("./studioScriptSchema");

function asString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function ensureArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function parseDuration(value, fallback = 30) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.max(1, Math.round(numeric));
}

function nearestAllowedDuration(value) {
  const numeric = parseDuration(value, DEFAULT_SCENE_DURATION);
  return ALLOWED_SCENE_DURATIONS.reduce((best, candidate) => {
    const currentDelta = Math.abs(candidate - numeric);
    const bestDelta = Math.abs(best - numeric);
    return currentDelta < bestDelta ? candidate : best;
  }, DEFAULT_SCENE_DURATION);
}

function normalizeContentType(briefing = {}) {
  return asString(briefing.mediaType || briefing.postType || "clip").toLowerCase();
}

function isCarousel(briefing = {}) {
  return normalizeContentType(briefing) === "carrossel";
}

function isImageOnly(briefing = {}) {
  const contentType = normalizeContentType(briefing);
  return contentType === "imagem" || contentType === "carrossel";
}

function splitDuration(totalDuration) {
  let remaining = parseDuration(totalDuration, 30);
  const durations = [];

  while (remaining > 0) {
    const target = Math.min(remaining, DEFAULT_SCENE_DURATION);
    let duration = nearestAllowedDuration(target);

    if (remaining <= 3) {
      duration = 3;
    } else if (remaining < duration) {
      duration = nearestAllowedDuration(remaining);
    }

    durations.push(duration);
    remaining -= duration;

    if (durations.length >= 20) {
      break;
    }
  }

  return durations.length ? durations : [DEFAULT_SCENE_DURATION];
}

function normalizeReference(item, index = 0) {
  if (typeof item === "string") {
    return {
      id: `ref_${index + 1}`,
      label: item,
      type: "text",
      path: "",
      role: "scene-reference"
    };
  }

  return {
    id: asString(item?.id || `ref_${index + 1}`),
    label: asString(item?.label || item?.name || item?.fileName || item?.path || `Referencia ${index + 1}`),
    type: asString(item?.type || item?.mediaType || "reference"),
    path: asString(item?.path || item?.filePath || ""),
    role: asString(item?.role || "scene-reference")
  };
}

function createFallbackScene({ briefing, duration, index, totalScenes }) {
  const carousel = isCarousel(briefing);
  const imageOnly = isImageOnly(briefing);
  const theme = asString(briefing.theme || "Tema do projeto");
  const purpose = asString(briefing.purpose || "Objetivo de comunicacao");
  const stage = totalScenes === 1
    ? "Mensagem principal"
    : index === 1
      ? "Abertura"
      : index === totalScenes
        ? "Fechamento"
        : `Desenvolvimento ${index - 1}`;

  return {
    id: `scene_${String(index).padStart(2, "0")}`,
    index,
    title: stage,
    approved: false,
    duration,
    narration: carousel ? "" : `${stage}: ${theme}.`,
    subtitle: carousel ? "" : `${theme}`,
    visualDescription: `${stage} do roteiro para ${theme}. A cena deve sustentar o objetivo: ${purpose}.`,
    visualPrompt: `Cena ${index} de ${totalScenes} para ${theme}. ${stage}. Visual coerente com ${asString(briefing.platform || "a plataforma")}, composicao clara, qualidade profissional, direcao de arte alinhada ao briefing.`,
    negativePrompt: "baixa qualidade, texto ilegivel, deformacoes, cortes estranhos, excesso de elementos, marca distorcida, anatomia ruim",
    motionPrompt: imageOnly ? "" : `${stage} com movimento suave, ritmo adequado a ${duration}s, transicao limpa e foco no assunto principal.`,
    mediaType: imageOnly ? "image" : "video",
    generationMode: imageOnly ? "t2i" : "t2v",
    references: []
  };
}

function normalizeScene(raw = {}, context = {}) {
  const { briefing, index, duration, totalScenes, references } = context;
  const fallback = createFallbackScene({ briefing, index, duration, totalScenes });
  const carousel = isCarousel(briefing);
  const imageOnly = isImageOnly(briefing);

  return {
    id: asString(raw.id || fallback.id || `scene_${randomUUID()}`),
    index,
    title: asString(raw.title || fallback.title),
    approved: false,
    duration,
    narration: carousel ? "" : asString(raw.narration || fallback.narration),
    subtitle: carousel ? "" : asString(raw.subtitle || fallback.subtitle),
    visualDescription: asString(raw.visualDescription || fallback.visualDescription),
    visualPrompt: asString(raw.visualPrompt || fallback.visualPrompt),
    negativePrompt: asString(raw.negativePrompt || fallback.negativePrompt),
    motionPrompt: imageOnly ? "" : asString(raw.motionPrompt || fallback.motionPrompt),
    mediaType: imageOnly ? "image" : asString(raw.mediaType || fallback.mediaType || "video"),
    generationMode: imageOnly ? "t2i" : asString(raw.generationMode || fallback.generationMode || "t2v"),
    references: ensureArray(raw.references).length
      ? ensureArray(raw.references).map(normalizeReference)
      : references
  };
}

function distributeReferences(briefing = {}, attachments = []) {
  const briefingReferences = [
    ...ensureArray(briefing.materialReferences),
    ...ensureArray(briefing.referenceNodeIds)
  ];
  return [
    ...briefingReferences.map(normalizeReference),
    ...ensureArray(attachments).map(normalizeReference)
  ];
}

function normalizeStudioScript(raw = {}, { briefing = {}, clientKit = null, attachments = [] } = {}) {
  const totalDuration = parseDuration(raw.totalDuration || briefing.duration, isImageOnly(briefing) ? 5 : 30);
  const durations = splitDuration(totalDuration);
  const references = distributeReferences(briefing, attachments);
  const rawScenes = ensureArray(raw.scenes);
  const scenes = durations.map((duration, index) => normalizeScene(rawScenes[index] || {}, {
    briefing,
    index: index + 1,
    duration,
    totalScenes: durations.length,
    references: references.filter((_, refIndex) => refIndex % durations.length === index)
  }));

  return {
    totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
    postCaption: asString(raw.postCaption || briefing.postCaption || `${asString(briefing.theme || "Projeto")}\n\n${asString(briefing.purpose || "")}`.trim()),
    scenes,
    clientKit: clientKit || null
  };
}

module.exports = {
  normalizeStudioScript,
  splitDuration,
  nearestAllowedDuration
};
