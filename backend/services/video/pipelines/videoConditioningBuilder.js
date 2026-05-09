import fs from "fs";
import path from "path";

function ensureArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
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

function normalizeReference(reference = {}, index = 0) {
  const filePath = String(reference?.path || reference?.filePath || reference?.url || "").trim();
  return {
    id: reference?.id || `reference-${index + 1}`,
    label: reference?.label || reference?.name || path.basename(filePath || `reference-${index + 1}`),
    path: filePath,
    type: reference?.type || reference?.kind || "",
    source: reference?.source || "",
    role: reference?.role || "",
    isImage: isImagePath(filePath),
    exists: exists(filePath)
  };
}

function resolveSceneAssetImage(scene = {}) {
  const candidate = String(scene.generatedMedia?.path || scene.generatedMedia?.filePath || "").trim();
  if (isImagePath(candidate) && exists(candidate)) {
    return candidate;
  }
  return "";
}

function resolveExplicitStartImage(payload = {}) {
  const candidate = String(payload.startImage || "").trim();
  if (isImagePath(candidate) && exists(candidate)) {
    return candidate;
  }
  return "";
}

function resolveReferenceStartImage(references = []) {
  const firstImage = references.find((reference) => reference.isImage && reference.exists);
  return firstImage?.path || "";
}

function resolveOptionalLoras(payload = {}, modelEntry = null) {
  const payloadLoras = ensureArray(payload.loras).map((item, index) => {
    if (typeof item === "string") {
      return {
        id: `lora-${index + 1}`,
        name: item,
        path: item,
        weight: 1
      };
    }

    return {
      id: item?.id || `lora-${index + 1}`,
      name: item?.name || item?.label || item?.path || `LoRA ${index + 1}`,
      path: item?.path || "",
      weight: Number(item?.weight || 1)
    };
  });

  if (payloadLoras.length) {
    return payloadLoras;
  }

  return ensureArray(modelEntry?.loras).map((item, index) => ({
    id: item?.id || `model-lora-${index + 1}`,
    name: item?.name || item?.label || item?.path || `Model LoRA ${index + 1}`,
    path: item?.path || "",
    weight: Number(item?.weight || 1)
  }));
}

export function buildVideoConditioning({ scene = {}, payload = {}, modelEntry = null } = {}) {
  const normalizedReferences = ensureArray(payload.references || scene.references).map(normalizeReference);
  const explicitStartImage = resolveExplicitStartImage(payload);
  const sceneAssetImage = resolveSceneAssetImage(scene);
  const referenceStartImage = resolveReferenceStartImage(normalizedReferences);
  const startImage = explicitStartImage || sceneAssetImage || referenceStartImage || "";
  const loras = resolveOptionalLoras(payload, modelEntry);
  const modeHint = String(payload.mode || scene.generationMode || "").trim().toLowerCase();
  const preferredMode = modeHint === "t2v" || modeHint === "i2v"
    ? modeHint
    : (startImage ? "i2v" : "t2v");

  const logs = [
    `preferred-mode:${preferredMode}`,
    `references:${normalizedReferences.length}`,
    `loras:${loras.length}`
  ];

  if (explicitStartImage) {
    logs.push("start-image:payload");
  } else if (sceneAssetImage) {
    logs.push("start-image:scene-asset");
  } else if (referenceStartImage) {
    logs.push("start-image:reference");
  } else {
    logs.push("start-image:none");
  }

  return {
    preferredMode,
    startImage,
    endImage: String(payload.endImage || "").trim(),
    primaryReference: normalizedReferences.find((reference) => reference.isImage && reference.exists) || null,
    references: normalizedReferences,
    loras,
    logs
  };
}

