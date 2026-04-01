import fs from "fs";
import path from "path";

const STATE_FILE = path.resolve("./backend/config/kitState.json");

// ======================
// Função para salvar no disco
// ======================
function saveStateToDisk(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    // console.log("[STATE] Salvo no disco");
  } catch (err) {
    console.error("[STATE] Erro ao salvar estado:", err);
  }
}

// ======================
// Função para carregar do disco
// ======================
function loadStateFromDisk(defaultState) {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const raw = fs.readFileSync(STATE_FILE, "utf8");
      if (!raw.trim()) throw new Error("Arquivo vazio");
      const data = JSON.parse(raw);
      console.log("[STATE] Estado carregado do disco");
      return Object.assign(defaultState, data);
    } catch (err) {
      console.error("[STATE] Erro ao carregar estado, usando default:", err);
      return defaultState;
    }
  } else {
    // Cria arquivo se não existir
    saveStateToDisk(defaultState);
    return defaultState;
  }
}

// ======================
// Estado inicial
// ======================
const defaultState = {
  needs: { energy: 80, hunger: 80, mood: 80, aura: 50 },
  emotion: { type: "neutral", intensity: 0.5, lastUpdate: Date.now() },
  routine: { currentAction: "idle", startedAt: Date.now(), duration: 0, forced: null, lockedUntil: 0 },
  world: { location: "room", isMoving: false },
  user: { isActive: false, lastSeen: Date.now() },
  orchestrator: { currentTask: null, queue: [], isProcessing: false },
  system: { lastTick: Date.now() }
};

// ======================
// Estado global
// ======================
export const kitState = loadStateFromDisk(defaultState);

// ======================
// Atualiza uma chave do estado
// ======================
export function updateState(key, value) {
  kitState[key] = value;
  saveStateToDisk(kitState);

  // SSE para front
  if (global.sendSSE) {
    global.sendSSE({ type: "state:update", payload: { [key]: value } });
  }
}

// ======================
// Recarrega estado do disco
// ======================
export function reloadState() {
  const data = loadStateFromDisk(defaultState);
  Object.assign(kitState, data);
}

export default kitState;