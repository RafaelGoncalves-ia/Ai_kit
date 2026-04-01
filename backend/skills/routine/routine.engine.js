import kitState from "../../core/stateManager.js";
import { applyCurrentAction } from "./routine.scheduler.js";
import { selectBestAction } from "./routine.selector.js";
import { setAction, isActionFinished } from "./routine.state.js";

/**
 * Engine principal
 */
export function updateRoutine() {
  const state = kitState;
  const now = Date.now();

  if (!state.routine) state.routine = { currentAction: "idle" };

  applyCurrentAction(state);

  if (!isActionFinished(state)) return;

  const nextAction = selectBestAction(state);
  if (!nextAction) return;

  setAction(state, nextAction.name, nextAction.duration);

  state.world = state.world || {};
  state.world.location = nextAction.location;
}