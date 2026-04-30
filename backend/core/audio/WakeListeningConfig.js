import fs from "fs";
import path from "path";

export const WAKE_LISTENING_CONFIG_PATH = path.resolve("backend/config/wake-listening.json");

export const DEFAULT_WAKE_LISTENING_CONFIG = {
  enabled: false,
  wakeWords: ["sune", "kit sune"],
  wakeWordVariants: [
    "kit",
    "quiti",
    "kite",
    "quite",
    "kiti",
    "kity",
    "sun",
    "tsune",
    "zune",
    "sane",
    "sani",
    "suni",
    "suny",
    "suno"
  ],
  confirmationMode: "voice",
  confirmationAudio: "F:/AI/Ai_kit/voz/kit/fala.wav",
  fallbackAudio: "F:/AI/Ai_kit/voz/kit/bip.wav",
  continuousListening: true,
  bypassWakeWordOnNoise: false,
  passiveCaptureMs: 2200,
  activeMaxDurationMs: 12000,
  silenceTimeoutMs: 1000,
  cooldownMs: 1500,
  minVoiceDurationMs: 180,
  ignoreWhileTts: true,
  stripWakeWordFromCommand: true,
  debugLogs: true,
  voiceActivityThreshold: 0.02,
  activeVoiceThreshold: 0.015,
  maxInitialSilenceMs: 4000
};

function ensureStringArray(value, fallback = []) {
  if (!Array.isArray(value)) {
    return fallback.slice();
  }

  const normalized = value
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return normalized.length ? normalized : fallback.slice();
}

function ensurePositiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function ensureBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function ensureMode(value, fallback = "voice") {
  const normalized = String(value || "").trim().toLowerCase();
  return ["voice", "beep", "silent"].includes(normalized) ? normalized : fallback;
}

function ensurePath(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function normalizeWakeListeningConfig(raw = {}) {
  const config = raw && typeof raw === "object" ? raw : {};

  return {
    enabled: ensureBoolean(config.enabled, DEFAULT_WAKE_LISTENING_CONFIG.enabled),
    wakeWords: ensureStringArray(config.wakeWords, DEFAULT_WAKE_LISTENING_CONFIG.wakeWords),
    wakeWordVariants: ensureStringArray(config.wakeWordVariants, DEFAULT_WAKE_LISTENING_CONFIG.wakeWordVariants),
    confirmationMode: ensureMode(config.confirmationMode, DEFAULT_WAKE_LISTENING_CONFIG.confirmationMode),
    confirmationAudio: ensurePath(config.confirmationAudio, DEFAULT_WAKE_LISTENING_CONFIG.confirmationAudio),
    fallbackAudio: ensurePath(config.fallbackAudio, DEFAULT_WAKE_LISTENING_CONFIG.fallbackAudio),
    continuousListening: ensureBoolean(
      config.continuousListening,
      DEFAULT_WAKE_LISTENING_CONFIG.continuousListening
    ),
    bypassWakeWordOnNoise: ensureBoolean(
      config.bypassWakeWordOnNoise,
      DEFAULT_WAKE_LISTENING_CONFIG.bypassWakeWordOnNoise
    ),
    passiveCaptureMs: ensurePositiveNumber(
      config.passiveCaptureMs,
      DEFAULT_WAKE_LISTENING_CONFIG.passiveCaptureMs
    ),
    activeMaxDurationMs: ensurePositiveNumber(
      config.activeMaxDurationMs,
      DEFAULT_WAKE_LISTENING_CONFIG.activeMaxDurationMs
    ),
    silenceTimeoutMs: ensurePositiveNumber(
      config.silenceTimeoutMs,
      DEFAULT_WAKE_LISTENING_CONFIG.silenceTimeoutMs
    ),
    cooldownMs: ensurePositiveNumber(config.cooldownMs, DEFAULT_WAKE_LISTENING_CONFIG.cooldownMs),
    minVoiceDurationMs: ensurePositiveNumber(
      config.minVoiceDurationMs,
      DEFAULT_WAKE_LISTENING_CONFIG.minVoiceDurationMs
    ),
    ignoreWhileTts: ensureBoolean(config.ignoreWhileTts, DEFAULT_WAKE_LISTENING_CONFIG.ignoreWhileTts),
    stripWakeWordFromCommand: ensureBoolean(
      config.stripWakeWordFromCommand,
      DEFAULT_WAKE_LISTENING_CONFIG.stripWakeWordFromCommand
    ),
    debugLogs: ensureBoolean(config.debugLogs, DEFAULT_WAKE_LISTENING_CONFIG.debugLogs),
    voiceActivityThreshold: ensurePositiveNumber(
      config.voiceActivityThreshold,
      DEFAULT_WAKE_LISTENING_CONFIG.voiceActivityThreshold
    ),
    activeVoiceThreshold: ensurePositiveNumber(
      config.activeVoiceThreshold,
      config.voiceActivityThreshold || DEFAULT_WAKE_LISTENING_CONFIG.activeVoiceThreshold
    ),
    maxInitialSilenceMs: ensurePositiveNumber(
      config.maxInitialSilenceMs,
      DEFAULT_WAKE_LISTENING_CONFIG.maxInitialSilenceMs
    )
  };
}

export function loadWakeListeningConfig() {
  try {
    if (!fs.existsSync(WAKE_LISTENING_CONFIG_PATH)) {
      saveWakeListeningConfig(DEFAULT_WAKE_LISTENING_CONFIG);
      return { ...DEFAULT_WAKE_LISTENING_CONFIG };
    }

    const raw = JSON.parse(fs.readFileSync(WAKE_LISTENING_CONFIG_PATH, "utf8"));
    return normalizeWakeListeningConfig(raw);
  } catch (err) {
    console.error("[WAKE] Erro ao carregar wake-listening.json:", err);
    return { ...DEFAULT_WAKE_LISTENING_CONFIG };
  }
}

export function saveWakeListeningConfig(input = {}) {
  const normalized = normalizeWakeListeningConfig(input);
  fs.mkdirSync(path.dirname(WAKE_LISTENING_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(WAKE_LISTENING_CONFIG_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

export function patchWakeListeningConfig(patch = {}) {
  const current = loadWakeListeningConfig();
  return saveWakeListeningConfig({
    ...current,
    ...(patch && typeof patch === "object" ? patch : {})
  });
}

export function isWakeListeningEnabled(config = {}) {
  const normalized = normalizeWakeListeningConfig(config);
  return normalized.enabled === true && normalized.continuousListening === true;
}
