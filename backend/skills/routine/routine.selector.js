import { actions } from "./routine.actions.js";

function evaluateActions(state) {
  return actions.map(a => ({ ...a, scoreValue: a.score(state) }));
}

export function selectBestAction(state) {
  const evaluated = evaluateActions(state);
  evaluated.sort((a, b) => b.scoreValue - a.scoreValue);
  return evaluated[0];
}