import kitState from "../../core/stateManager.js";
import { actions } from "./routine.actions.js";
import { NEEDS_LIMITS, clampNeed } from "../needs/needs.state.js";

/**
 * Aplica efeito da ação atual
 */
function applyCurrentAction(state) {
  const action = actions.find(a => a.name === state.routine.currentAction);
  if (!action) return;

  if (typeof action.tickEffect === "function") {
    action.tickEffect(state);
  } else if (typeof action.effect === "function") {
    action.effect(state);
  }

  // aplica tokens
  state.tokens = (state.tokens || 0) + (action.tokens || 0);

  // clamp dos needs
  for (const key in state.needs) {
    const { min, max } = NEEDS_LIMITS[key];
    state.needs[key] = clampNeed(state.needs[key], min, max);
  }
}

/**
 * Seleciona a melhor ação baseada no score
 */
function selectBestAction(state) {
  const evaluated = actions.map(a => ({ ...a, scoreValue: a.score(state) }));
  const available = evaluated.filter(a => a.scoreValue > 0);
  if (!available.length) return actions.find(a => a.name === "idle") || null;

  available.sort((a, b) => b.scoreValue - a.scoreValue);
  return available[0];
}

/**
 * State helpers
 */
function setAction(state, action, duration = 5000) {
  state.routine.currentAction = action.name;
  state.routine.startedAt = Date.now();
  state.routine.duration = duration;
  state.world = state.world || {};
  state.world.location = action.location;
}

function isActionFinished(state) {
  return Date.now() - state.routine.startedAt >= state.routine.duration;
}

/**
 * Engine principal
 */
export function updateRoutine() {
  const state = kitState;
  if (!state.routine) state.routine = { currentAction: "idle", startedAt: 0, duration: 0 };

  // aplica efeito da ação em andamento
  applyCurrentAction(state);

  // se ainda não terminou, aguarda
  if (!isActionFinished(state)) return;

  // seleciona próxima ação
  const nextAction = selectBestAction(state);
  if (!nextAction) return;

  setAction(state, nextAction, nextAction.duration);
}