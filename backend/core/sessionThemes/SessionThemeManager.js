import { detectTopic, isStrongDomainShift } from "./TopicDetector.js";

const DEFAULT_THEME_TTL_MS = 30 * 60 * 1000;
const MIN_CONFIDENCE = 0.25;

function ensureThemeState(session) {
  session.sessionTheme = session.sessionTheme && typeof session.sessionTheme === "object"
    ? session.sessionTheme
    : {};
  session.sessionTheme.activeThemes = Array.isArray(session.sessionTheme.activeThemes)
    ? session.sessionTheme.activeThemes
    : [];
  return session.sessionTheme;
}

function pruneExpiredThemes(state, now = Date.now(), ttlMs = DEFAULT_THEME_TTL_MS) {
  state.activeThemes = state.activeThemes.filter((theme) => {
    const lastMention = Number(theme.lastMention || theme.startedAt || 0);
    return lastMention && now - lastMention <= ttlMs && Number(theme.confidence || 0) >= MIN_CONFIDENCE;
  });
}

function sortThemes(state) {
  state.activeThemes.sort((a, b) => {
    const confidenceDelta = Number(b.confidence || 0) - Number(a.confidence || 0);
    if (Math.abs(confidenceDelta) > 0.05) return confidenceDelta;
    return Number(b.lastMention || 0) - Number(a.lastMention || 0);
  });
}

export function updateSessionThemes({ session, text, now = Date.now(), ttlMs = DEFAULT_THEME_TTL_MS } = {}) {
  const state = ensureThemeState(session);
  pruneExpiredThemes(state, now, ttlMs);

  const detected = detectTopic(text);

  for (const theme of state.activeThemes) {
    if (detected.theme !== theme.id && isStrongDomainShift(text, theme.id)) {
      theme.confidence = Math.max(0, Number(theme.confidence || 0) - 0.28);
      theme.sticky = false;
    }
  }

  if (detected.theme !== "general") {
    const existing = state.activeThemes.find((theme) => theme.id === detected.theme);
    if (existing) {
      existing.lastMention = now;
      existing.confidence = Math.min(0.99, Math.max(Number(existing.confidence || 0), detected.confidence));
      existing.activeSkills = detected.activeSkills || existing.activeSkills || [];
      existing.sticky = true;
    } else {
      state.activeThemes.push({
        id: detected.theme,
        sticky: true,
        startedAt: now,
        lastMention: now,
        confidence: detected.confidence,
        activeSkills: detected.activeSkills || []
      });
    }
  } else {
    for (const theme of state.activeThemes) {
      const ageMs = now - Number(theme.lastMention || now);
      const passiveDecay = ageMs > 5 * 60 * 1000 ? 0.04 : 0.01;
      theme.confidence = Math.max(0, Number(theme.confidence || 0) - passiveDecay);
    }
  }

  pruneExpiredThemes(state, now, ttlMs);
  sortThemes(state);

  return {
    detected,
    activeThemes: state.activeThemes,
    primaryTheme: state.activeThemes[0] || null
  };
}

export function getActiveTheme(session, themeId) {
  const state = ensureThemeState(session);
  pruneExpiredThemes(state);
  return state.activeThemes.find((theme) => theme.id === themeId) || null;
}

export function isThemeActive(session, themeId) {
  return Boolean(getActiveTheme(session, themeId));
}

export default {
  updateSessionThemes,
  getActiveTheme,
  isThemeActive
};
