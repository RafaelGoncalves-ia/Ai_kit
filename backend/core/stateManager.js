import fs from "fs";
import path from "path";

const STATE_FILE = path.resolve("./backend/config/kitState.json");
const AUTO_PERSIST_INTERVAL_MS = 2000;

const defaultState = {
  needs: { energy: 80, hunger: 80, mood: 80, aura: 50, hygiene: 80 },
  emotion: { type: "neutral", intensity: 0.5, lastUpdate: Date.now() },
  routine: {
    currentAction: "idle",
    startedAt: Date.now(),
    duration: 0,
    forced: null,
    lockedUntil: 0
  },
  world: { location: "room", isMoving: false },
  user: { isActive: false, lastSeen: Date.now() },
  inventory: {},
  tokens: 0,
  system: { lastTick: Date.now() }
};

let lastPersistedSerialized = "";
let pendingPersistTimer = null;
let autoPersistStarted = false;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asString(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function asBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeNeeds(rawNeeds = {}) {
  const source = rawNeeds && typeof rawNeeds === "object" ? rawNeeds : {};
  const merged = { ...defaultState.needs };

  for (const key of Object.keys({ ...defaultState.needs, ...source })) {
    const fallback = merged[key] ?? 0;
    merged[key] = asFiniteNumber(source[key], fallback);
  }

  return merged;
}

function sanitizeEmotion(rawEmotion = {}) {
  const source = rawEmotion && typeof rawEmotion === "object" ? rawEmotion : {};
  return {
    type: asString(source.type, defaultState.emotion.type),
    intensity: asFiniteNumber(source.intensity, defaultState.emotion.intensity),
    lastUpdate: asFiniteNumber(source.lastUpdate, defaultState.emotion.lastUpdate)
  };
}

function sanitizeRoutine(rawRoutine = {}) {
  const source = rawRoutine && typeof rawRoutine === "object" ? rawRoutine : {};
  return {
    currentAction: asString(source.currentAction, defaultState.routine.currentAction),
    startedAt: asFiniteNumber(source.startedAt, defaultState.routine.startedAt),
    duration: asFiniteNumber(source.duration, defaultState.routine.duration),
    forced: source.forced ?? defaultState.routine.forced,
    lockedUntil: asFiniteNumber(source.lockedUntil, defaultState.routine.lockedUntil)
  };
}

function sanitizeWorld(rawWorld = {}) {
  const source = rawWorld && typeof rawWorld === "object" ? rawWorld : {};
  return {
    location: asString(source.location, defaultState.world.location),
    isMoving: asBoolean(source.isMoving, defaultState.world.isMoving)
  };
}

function sanitizeUser(rawUser = {}) {
  const source = rawUser && typeof rawUser === "object" ? rawUser : {};
  return {
    isActive: asBoolean(source.isActive, defaultState.user.isActive),
    lastSeen: asFiniteNumber(source.lastSeen, defaultState.user.lastSeen)
  };
}

function sanitizeInventory(rawInventory = {}) {
  const source = rawInventory && typeof rawInventory === "object" ? rawInventory : {};
  const inventory = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined) continue;
    const normalizedKey = asString(key);
    const normalizedValue = asString(value);
    if (normalizedKey && normalizedValue) {
      inventory[normalizedKey] = normalizedValue;
    }
  }

  return inventory;
}

function sanitizeSystem(rawSystem = {}) {
  const source = rawSystem && typeof rawSystem === "object" ? rawSystem : {};
  return {
    lastTick: asFiniteNumber(source.lastTick, defaultState.system.lastTick)
  };
}

export function sanitizePersistedState(rawState = {}) {
  const source = rawState && typeof rawState === "object" ? rawState : {};

  return {
    needs: sanitizeNeeds(source.needs),
    emotion: sanitizeEmotion(source.emotion),
    routine: sanitizeRoutine(source.routine),
    world: sanitizeWorld(source.world),
    user: sanitizeUser(source.user),
    inventory: sanitizeInventory(source.inventory),
    tokens: asFiniteNumber(source.tokens, defaultState.tokens),
    system: sanitizeSystem(source.system)
  };
}

export function getPersistedState(state = kitState) {
  return sanitizePersistedState(state);
}

function writeSanitizedState(state) {
  try {
    const sanitized = getPersistedState(state);
    const serialized = JSON.stringify(sanitized, null, 2);

    if (serialized === lastPersistedSerialized) {
      return false;
    }

    fs.writeFileSync(STATE_FILE, serialized, "utf8");
    lastPersistedSerialized = serialized;
    return true;
  } catch (err) {
    console.error("[STATE] Erro ao salvar estado:", err);
    return false;
  }
}

function ensureStateDirectory() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
}

function loadStateFromDisk() {
  ensureStateDirectory();

  if (!fs.existsSync(STATE_FILE)) {
    const initial = clone(defaultState);
    writeSanitizedState(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    const sanitized = sanitizePersistedState(parsed);
    const hydrated = {
      ...clone(defaultState),
      ...sanitized,
      needs: sanitized.needs,
      emotion: sanitized.emotion,
      routine: sanitized.routine,
      world: sanitized.world,
      user: sanitized.user,
      inventory: sanitized.inventory,
      system: sanitized.system
    };

    const serializedSanitized = JSON.stringify(getPersistedState(hydrated), null, 2);
    if (raw.trim() !== serializedSanitized.trim()) {
      fs.writeFileSync(STATE_FILE, serializedSanitized, "utf8");
    }

    lastPersistedSerialized = serializedSanitized;
    return hydrated;
  } catch (err) {
    console.error("[STATE] Erro ao carregar estado, usando default:", err);
    const fallback = clone(defaultState);
    writeSanitizedState(fallback);
    return fallback;
  }
}

export const kitState = loadStateFromDisk();

function schedulePersist(delayMs = 150) {
  if (pendingPersistTimer) {
    return;
  }

  pendingPersistTimer = setTimeout(() => {
    pendingPersistTimer = null;
    writeSanitizedState(kitState);
  }, delayMs);

  pendingPersistTimer.unref?.();
}

export function persistStateNow() {
  if (pendingPersistTimer) {
    clearTimeout(pendingPersistTimer);
    pendingPersistTimer = null;
  }

  return writeSanitizedState(kitState);
}

export function startAutoPersist() {
  if (autoPersistStarted) {
    return;
  }

  autoPersistStarted = true;
  const timer = setInterval(() => {
    persistStateNow();
  }, AUTO_PERSIST_INTERVAL_MS);
  timer.unref?.();
}

export function updateState(key, value) {
  kitState[key] = value;
  schedulePersist();

  if (global.sendSSE) {
    global.sendSSE({ type: "state:update", payload: { [key]: value } });
  }
}

export function mergeState(patch = {}) {
  if (!patch || typeof patch !== "object") {
    return kitState;
  }

  Object.assign(kitState, patch);
  schedulePersist();
  return kitState;
}

export function reloadState() {
  const loaded = loadStateFromDisk();

  for (const key of Object.keys(kitState)) {
    if (!(key in loaded)) {
      delete kitState[key];
    }
  }

  Object.assign(kitState, loaded);
  return kitState;
}

startAutoPersist();
persistStateNow();

export default kitState;
