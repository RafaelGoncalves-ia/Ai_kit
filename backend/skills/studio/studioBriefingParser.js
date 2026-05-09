const path = require("path");

function stripAccents(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value = "") {
  return stripAccents(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cleanName(value = "") {
  return String(value || "")
    .replace(/[.!?;,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickMatch(text = "", patterns = []) {
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (match?.[1]) {
      return cleanName(match[1]);
    }
  }
  return "";
}

function detectClient(command = "") {
  return pickMatch(command, [
    /\bcliente\s+([^,.;\n]+?)(?:\s+sobre|\s+com|\s+para|\s+no|\s+na|\s+em|\s+de\s+\d|\s+\d|$)/i,
    /\bpara\s+(?:o|a|os|as)?\s*cliente\s+([^,.;\n]+?)(?:\s+sobre|\s+com|\s+no|\s+na|\s+em|$)/i,
    /\bda\s+([^,.;\n]+?)(?:\s+sobre|\s+com|\s+no|\s+na|\s+em|$)/i,
    /\bdo\s+([^,.;\n]+?)(?:\s+sobre|\s+com|\s+no|\s+na|\s+em|$)/i,
    /\bpara\s+(?!postar\b|publicar\b|divulgar\b|gerar\b|criar\b|fazer\b)([^,.;\n]+?)(?:\s+sobre|\s+com|\s+no|\s+na|\s+em|$)/i
  ]);
}

function detectProduct(command = "") {
  const product = pickMatch(command, [
    /\bproduto\s+([^,.;\n]+)/i,
    /\bservico\s+([^,.;\n]+)/i,
    /\bserviço\s+([^,.;\n]+)/i,
    /\bsobre\s+(?:o|a|os|as)?\s*(?:produto|servico|serviço)\s+([^,.;\n]+)/i,
    /\bsobre\s+([^,.;\n]+)/i,
    /\btema\s+([^,.;\n]+)/i
  ]);
  return cleanName(product.replace(/\s+(?:no|na|para|em)\s+(?:reels?|stories|story|tiktok|instagram|youtube|shorts?|facebook|linkedin)\b.*$/i, ""));
}

function detectContentType(command = "") {
  const normalized = normalizeText(command);
  if (/\b(carrossel|carousel)\b/.test(normalized)) return "carrossel";
  if (/\b(story|stories)\b/.test(normalized)) return "stories";
  if (/\b(reels?|shorts?|tiktok|video|videos|filme|clip)\b/.test(normalized)) return "clip";
  if (/\b(imagem|imagens|foto|fotos|post|arte|criativo|banner)\b/.test(normalized)) return "imagem";
  return "";
}

function detectPlatform(command = "") {
  const normalized = normalizeText(command);
  if (/\btiktok\b/.test(normalized)) return "TikTok";
  if (/\bshorts?|youtube\b/.test(normalized)) return "YouTube Shorts";
  if (/\bstory|stories\b/.test(normalized)) return "Stories";
  if (/\breels?\b/.test(normalized)) return "Reels";
  if (/\binstagram|feed|postar no instagram|post no instagram\b/.test(normalized)) return "Instagram";
  if (/\bfacebook\b/.test(normalized)) return "Facebook";
  if (/\blinkedin\b/.test(normalized)) return "LinkedIn";
  return "";
}

function detectDuration(command = "") {
  const normalized = normalizeText(command);
  const match = normalized.match(/(\d{1,3})\s*(?:s|seg|segundos?|min|minutos?)/);
  if (!match?.[1]) {
    if (/\b(curto|rapido|rapida|short|reel)\b/.test(normalized)) return "15";
    return "";
  }

  const value = Number(match[1]);
  const isMinute = /\bmin|minutos?\b/.test(match[0]);
  return String(Math.max(1, Math.min(300, isMinute ? value * 60 : value)));
}

function detectRatio(command = "") {
  const normalized = normalizeText(command);
  if (/\b16:9|horizontal|wide|youtube\b/.test(normalized)) return "16:9";
  if (/\b9:16|vertical|reels?|shorts?|tiktok|story|stories\b/.test(normalized)) return "9:16";
  if (/\b1:1|quadrado|square\b/.test(normalized)) return "1:1";
  if (/\b(?:3:4|4:5|feed|post|retrato|portrait)\b/.test(normalized)) return "3:4";
  return "";
}

function detectProbableIntent(command = "") {
  const normalized = normalizeText(command);
  if (/\b(postar|publicar|post|redes sociais|instagram|tiktok|facebook|linkedin)\b/.test(normalized)) return "publicacao_social";
  if (/\b(vender|venda|oferta|promocao|promoção|conversao|conversão)\b/.test(normalized)) return "conversao";
  if (/\b(lancamento|lançamento|divulgar|anunciar)\b/.test(normalized)) return "divulgacao";
  if (/\b(autoridade|educar|explicar|tutorial|dica|dicas)\b/.test(normalized)) return "educacao";
  if (/\b(engajamento|viral|alcance|chamar atencao|chamar atenção)\b/.test(normalized)) return "engajamento";
  if (/\b(homenagem|comemorativa|campanha|data)\b/.test(normalized)) return "relacionamento";
  return "";
}

function normalizeAttachments(attachments = []) {
  return Array.isArray(attachments) ? attachments.map((attachment) => {
    const filePath = String(attachment?.path || attachment?.filePath || "").trim();
    const fileName = String(attachment?.fileName || attachment?.name || (filePath ? path.basename(filePath) : "anexo")).trim();
    return {
      path: filePath,
      fileName,
      mediaType: String(attachment?.mediaType || attachment?.kind || "").trim(),
      mimeType: String(attachment?.mimeType || "").trim()
    };
  }) : [];
}

function detectMediaNeeds(contentType = "", attachments = []) {
  const normalizedAttachments = normalizeAttachments(attachments);
  const hasImage = normalizedAttachments.some((item) => /image|screenshot/i.test(item.mediaType) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(item.fileName));
  const hasVideo = normalizedAttachments.some((item) => /video/i.test(item.mediaType) || /\.(mp4|webm|mov|mkv|avi)$/i.test(item.fileName));
  const needsVideo = ["clip", "stories"].includes(contentType);
  const needsImage = ["imagem", "carrossel", "stories"].includes(contentType);

  return {
    hasImage,
    hasVideo,
    needsImage,
    needsVideo,
    needsAigc: (needsVideo && !hasVideo) || (needsImage && !hasImage) || (!hasImage && !hasVideo)
  };
}

function parseInitialCommand({ command = "", attachments = [] } = {}) {
  const safeCommand = String(command || "").trim();
  const warnings = [];
  const normalizedAttachments = normalizeAttachments(attachments);
  const contentType = detectContentType(safeCommand);

  if (!safeCommand) {
    warnings.push("Comando vazio.");
  }

  return {
    command: safeCommand,
    variables: {
      clientName: detectClient(safeCommand),
      productName: detectProduct(safeCommand),
      contentType,
      platform: detectPlatform(safeCommand),
      duration: detectDuration(safeCommand),
      ratio: detectRatio(safeCommand),
      probableIntent: detectProbableIntent(safeCommand),
      attachments: normalizedAttachments,
      mediaNeeds: detectMediaNeeds(contentType, normalizedAttachments)
    },
    warnings
  };
}

module.exports = {
  parseInitialCommand,
  detectClient,
  detectProduct,
  detectContentType,
  detectPlatform,
  detectDuration,
  detectRatio,
  detectProbableIntent,
  normalizeAttachments
};
