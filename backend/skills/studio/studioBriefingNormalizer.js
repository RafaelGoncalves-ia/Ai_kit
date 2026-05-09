const { createEmptyBriefing } = require("./studioBriefingSchema");

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function asString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeIntentLabel(value = "") {
  const normalized = asString(value);
  const labels = {
    publicacao_social: "Criar conteudo adequado para publicacao em rede social.",
    conversao: "Gerar conversao e venda.",
    divulgacao: "Divulgar a mensagem principal e gerar interesse.",
    educacao: "Educar o publico e construir autoridade.",
    engajamento: "Aumentar alcance e engajamento.",
    relacionamento: "Fortalecer relacionamento e conexao com o publico."
  };
  return labels[normalized] || normalized;
}

function normalizeVisualMaterial(value = "", variables = {}) {
  const normalized = asString(value).toLowerCase();
  if (["user", "aigc", "user + aigc"].includes(normalized)) {
    return normalized;
  }

  const attachments = variables.attachments || [];
  const needsAigc = variables.mediaNeeds?.needsAigc !== false;
  if (attachments.length && needsAigc) return "user + aigc";
  if (attachments.length) return "user";
  return "aigc";
}

function normalizeMediaType(value = "", variables = {}) {
  const normalized = asString(value || variables.contentType || "clip").toLowerCase();
  if (["clip", "imagem", "carrossel", "stories"].includes(normalized)) {
    return normalized;
  }
  return "clip";
}

function normalizeRatio(value = "", mediaType = "clip", variables = {}, clientKit = null) {
  const candidate = asString(value || variables.ratio || clientKit?.metadata?.defaultRatio || clientKit?.metadata?.ratio);
  if (["9:16", "3:4", "1:1", "16:9"].includes(candidate)) {
    return candidate;
  }
  return mediaType === "imagem" ? "3:4" : "9:16";
}

function normalizePlatform(value = "", variables = {}, clientKit = null) {
  return asString(
    value ||
    variables.platform ||
    clientKit?.metadata?.defaultPlatform ||
    clientKit?.metadata?.platform ||
    clientKit?.metadata?.socialPlatform ||
    (variables.contentType === "imagem" ? "Instagram" : "Reels")
  );
}

function normalizeBriefing(raw = {}, { command = "", variables = {}, client = {}, clientKit = null } = {}) {
  const base = createEmptyBriefing();
  const mediaType = normalizeMediaType(raw.mediaType, variables);
  const platform = normalizePlatform(raw.platform, variables, clientKit);
  const ratio = normalizeRatio(raw.ratio, mediaType, variables, clientKit);
  const theme = asString(raw.theme || variables.productName || command || "Tema nao definido");
  const purpose = asString(raw.purpose || normalizeIntentLabel(variables.probableIntent) || "Definir objetivo de comunicacao para o projeto.");
  const audience = asString(raw.audience || clientKit?.metadata?.audience || clientKit?.metadata?.targetAudience || "Publico-alvo a definir.");
  const postCaption = asString(raw.postCaption || "");

  return {
    ...base,
    theme,
    purpose,
    audience,
    visualMaterial: normalizeVisualMaterial(raw.visualMaterial, variables),
    duration: asString(raw.duration || variables.duration || clientKit?.metadata?.defaultDuration || clientKit?.metadata?.duration || (mediaType === "imagem" ? "" : "30")),
    mediaType,
    ratio,
    platform,
    postType: asString(raw.postType || (mediaType === "imagem" ? "post" : mediaType)),
    videoContent: asString(raw.videoContent || command),
    videoNarration: asString(raw.videoNarration),
    bgmStyle: asString(raw.bgmStyle || clientKit?.metadata?.bgmStyle),
    bgmId: asString(raw.bgmId || clientKit?.metadata?.bgmId),
    subtitleInfo: asString(raw.subtitleInfo || clientKit?.metadata?.subtitleInfo),
    postCaption,
    characters: ensureArray(raw.characters),
    materialReferences: ensureArray(raw.materialReferences),
    ttsList: ensureArray(raw.ttsList),
    digitalHumanList: ensureArray(raw.digitalHumanList),
    styleList: ensureArray(raw.styleList),
    referenceNodeIds: ensureArray(raw.referenceNodeIds),
    rawReferences: asString(raw.rawReferences || (variables.attachments || []).map((item) => item.path || item.fileName).filter(Boolean).join("\n")),
    defaultsFromClientKit: raw.defaultsFromClientKit || (clientKit ? {
      name: clientKit.name,
      voice: clientKit.identity?.voice || "",
      description: clientKit.identity?.description || "",
      colors: clientKit.colors || [],
      logos: clientKit.logos || [],
      fonts: clientKit.fonts || [],
      assets: clientKit.assets || {},
      metadata: clientKit.metadata || {}
    } : null),
    detected: {
      clientName: client?.name || variables.clientName || "",
      productName: variables.productName || "",
      contentType: mediaType,
      duration: variables.duration || "",
      platform,
      ratio,
      objective: variables.probableIntent || "",
      needsImage: Boolean(variables.mediaNeeds?.needsImage),
      needsVideo: Boolean(variables.mediaNeeds?.needsVideo),
      attachedFiles: variables.attachments || []
    }
  };
}

module.exports = {
  normalizeBriefing
};
