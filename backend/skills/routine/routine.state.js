export function setAction(state, action, duration = 5000) {
  state.routine.currentAction = action;
  state.routine.startedAt = Date.now();
  state.routine.duration = duration;
}

export function isActionFinished(state) {
  return Date.now() - state.routine.startedAt >= state.routine.duration;
}