import { actions } from "./routine.actions.js";

export function applyCurrentAction(state) {
  const action = actions.find(a => a.name === state.routine.currentAction);
  if (!action) return;
  action.effect(state);
}