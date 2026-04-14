function normalizeWhitespace(text = "") {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function stripCodeBlocks(text = "") {
  return String(text || "").replace(/```[\s\S]*?```/g, " ");
}

function stripBasicMarkdown(text = "") {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/~~/g, "")
    .replace(/`/g, "");
}

function stripUrls(text = "") {
  return String(text || "").replace(/https?:\/\/\S+/gi, " ");
}

function stripEmojiArtifacts(text = "") {
  return String(text || "")
    .replace(/[\u200D\uFE0F]/g, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "");
}

export function sanitizeSpeechText(text = "") {
  let sanitized = String(text || "");
  sanitized = stripCodeBlocks(sanitized);
  sanitized = stripBasicMarkdown(sanitized);
  sanitized = stripUrls(sanitized);
  sanitized = stripEmojiArtifacts(sanitized);
  sanitized = normalizeWhitespace(sanitized);
  return sanitized.trim();
}

export function buildSpeechPayload({
  uiText = "",
  speakText = "",
  source = "unknown"
} = {}) {
  const baseText = String(speakText || uiText || "");
  const cleaned = sanitizeSpeechText(baseText);

  return {
    shouldSpeak: cleaned.length >= 1,
    text: cleaned,
    reason: cleaned.length >= 1 ? "ok" : "empty_after_cleanup",
    source
  };
}
