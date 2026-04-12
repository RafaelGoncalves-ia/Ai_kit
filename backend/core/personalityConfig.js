import { loadConfig } from "./configLoader.js";

let cachedConfig = null;

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function compareMetric(left, operator, right) {
  switch (operator) {
    case "lt":
      return Number(left) < Number(right);
    case "lte":
      return Number(left) <= Number(right);
    case "gt":
      return Number(left) > Number(right);
    case "gte":
      return Number(left) >= Number(right);
    case "eq":
      return left === right;
    default:
      return false;
  }
}

export function loadPersonalityConfig(forceReload = false) {
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }

  const manifest = loadConfig("personality.json");
  const files = manifest?.files || {};

  const base = loadConfig(files.base || "personality/base.json");
  const responseModes = loadConfig(files.responseModes || "personality/responseModes.json");
  const needsMap = loadConfig(files.needsMap || "personality/needs.map.json");
  const emotionsMap = loadConfig(files.emotionsMap || "personality/emotions.map.json");

  cachedConfig = {
    manifest,
    base,
    responseModes,
    needsMap,
    emotionsMap
  };

  return cachedConfig;
}

export function getRouteBehavior(mode = "realtime") {
  const config = loadPersonalityConfig();
  return config.responseModes?.routeModes?.[mode] || {
    usePersona: mode === "realtime",
    plannerRole: "",
    instructions: []
  };
}

function normalizeAura(aura, fallback = 50) {
  const value = Number(aura);
  if (!Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function getAuraProfile(aura) {
  const config = loadPersonalityConfig();
  const profiles = normalizeArray(config.needsMap?.profiles);
  const safeAura = normalizeAura(aura);

  return (
    profiles.find((profile) => safeAura >= Number(profile.min) && safeAura <= Number(profile.max)) ||
    profiles.find((profile) => profile.id === config.needsMap?.fallbackProfileId) ||
    profiles[0] ||
    { id: "neutral", label: "Neutra", prompt: "" }
  );
}

export function listAuraProfiles() {
  const config = loadPersonalityConfig();
  return normalizeArray(config.needsMap?.profiles).map((profile) => ({
    id: profile.id,
    label: profile.label,
    range: `${profile.min}-${profile.max}`
  }));
}

export function resolveResponseTypeFromConfig({ emotion, action, aura }) {
  const config = loadPersonalityConfig();
  const ruleSet = config.responseModes?.responseTypeRules || {};
  const rules = normalizeArray(ruleSet.rules);

  const match = rules.find((rule) => {
    const when = rule?.when || {};

    if (when.action && when.action !== action) return false;
    if (when.emotion && when.emotion !== emotion) return false;
    if (when.emotionIn && !normalizeArray(when.emotionIn).includes(emotion)) return false;

    if (when.aura) {
      const metric = normalizeAura(aura);
      if (!compareMetric(metric, when.aura.operator, when.aura.value)) {
        return false;
      }
    }

    return true;
  });

  return match?.type || ruleSet.fallback || "neutral_vibe";
}

export function deriveEmotionFromState(state = {}) {
  const config = loadPersonalityConfig();
  const needs = state?.needs || {};
  const emotionState = state?.emotion || {};
  const defaults = config.emotionsMap?.defaults || {};
  const rules = normalizeArray(config.emotionsMap?.rules);

  let nextEmotion = defaults.type || "neutral";
  let nextIntensity = Number(defaults.intensity ?? 0.5);

  for (const rule of rules) {
    const metricValue = Number(needs?.[rule.metric]);
    if (!Number.isFinite(metricValue)) {
      continue;
    }

    if (compareMetric(metricValue, rule.operator, rule.value)) {
      nextEmotion = rule.emotion || nextEmotion;
      nextIntensity = Number(rule.intensity ?? nextIntensity);
    }
  }

  const now = Date.now();
  const lastUpdate = Number(emotionState.lastUpdate || 0);
  const decayMinutes = Number(defaults.decayMinutes || 5);
  const decayMs = decayMinutes * 60 * 1000;

  if (lastUpdate > 0 && now - lastUpdate > decayMs) {
    nextEmotion = defaults.decayType || defaults.type || "neutral";
    nextIntensity = Number(defaults.decayIntensity ?? nextIntensity);
  }

  return {
    type: nextEmotion,
    intensity: nextIntensity,
    lastUpdate: now
  };
}
