import kitState from "../../core/stateManager.js";
import { setAction, isActionFinished } from "./routine.state.js";
import { applyCurrentAction } from "./routine.scheduler.js";
import { selectBestAction } from "./routine.selector.js";

/**
 * ============================
 * FORCE ACTION (EXTERNO)
 * ============================
 */
export function forceAction(actionName, duration = 60000) {
  const state = kitState;

  state.routine = state.routine || {};

  state.routine.forced = {
    name: actionName,
    duration,
    startedAt: Date.now()
  };

  state.routine.lockedUntil = Date.now() + duration;
}

/**
 * ============================
 * ENGINE PRINCIPAL
 * ============================
 */
export default function updateRoutine(context) {
  const state = kitState;
  const now = Date.now();

  // aplica efeito da ação atual
  applyCurrentAction(state);

  // se existe ação forçada
  if (state.routine?.forced) {
    const forced = state.routine.forced;

    // se ainda está no tempo forçado → mantém
    if (now < state.routine.lockedUntil) {
      if (state.action !== forced.name) {
        setAction(state, forced.name, forced.duration);
        state.world.location = resolveLocation(forced.name);
      }
      return;
    }

    // terminou ação forçada
    state.routine.forced = null;
  }

  // respeita duração mínima da ação atual
  if (!isActionFinished(state)) {
    return;
  }

  // AI decide próxima ação
  const next = selectBestAction(state);

  if (!next) return;

  setAction(state, next.name, next.duration);

  // localização (3D)
  state.world = state.world || {};
  state.world.location = next.location;
}

/**
 * RESOLVE LOCAL (fallback)
 */
function resolveLocation(action) {
  const map = {
    sleeping: "bed",
    eating: "kitchen",
    working: "pc",
    streaming: "pc",
    relaxing: "sofa",
    exercising: "yoga",
    bathing: "bathroom",
    dressing: "wardrobe",
    reading: "shelf",
    photoshoot: "studio"
  };

  return map[action] || "room";
}