import kitState from "../../core/stateManager.js";
import { actions } from "./routine.actions.js";
import { setAction, isActionFinished } from "./routine.state.js";
import { applyCurrentAction } from "./routine.scheduler.js";

/**
 * Decide e executa rotina
 */

export default function updateRoutine(context) {
  const state = kitState;

  // aplica efeito da ação atual
  applyCurrentAction(state);

  // verifica se terminou
  if (!isActionFinished(state)) {
    return;
  }

  // DECISÃO

  const { needs } = state;

  let nextAction = "idle";

  if (needs.energy < 20) {
    nextAction = "sleep";
  } else if (needs.hunger > 70) {
    nextAction = "eat";
  } else if (needs.mood < 30) {
    nextAction = "taking_photos";
  } else if (needs.aura < 30) {
    nextAction = "use_phone";
  } else {
    // comportamento padrão
    const randomActions = ["working_pc", "idle"];
    nextAction =
      randomActions[Math.floor(Math.random() * randomActions.length)];
  }

  const actionConfig = actions[nextAction];

  setAction(state, nextAction, actionConfig.duration);
}