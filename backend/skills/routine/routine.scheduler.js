import { actions } from "./routine.actions.js";

/**
 * Aplica efeitos da ação atual a cada tick
 */

export function applyCurrentAction(state) {
  const action = actions[state.routine.currentAction];

  if (!action) return;

  action.effect(state);
}