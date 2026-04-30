const VALID_STATES = new Set([
  "disabled",
  "passive_listening",
  "wake_check",
  "confirmation",
  "active_listening",
  "processing",
  "cooldown"
]);

export default class PassiveAudioState {
  constructor({ initialState = "disabled", onTransition = null } = {}) {
    this.state = VALID_STATES.has(initialState) ? initialState : "disabled";
    this.onTransition = typeof onTransition === "function" ? onTransition : null;
  }

  getState() {
    return this.state;
  }

  is(state) {
    return this.state === state;
  }

  canEnter(state) {
    return VALID_STATES.has(state);
  }

  transition(nextState, meta = {}) {
    if (!this.canEnter(nextState)) {
      throw new Error(`Estado de wake invalido: ${nextState}`);
    }

    const previousState = this.state;
    this.state = nextState;

    if (this.onTransition) {
      this.onTransition({
        previousState,
        nextState,
        meta
      });
    }

    return this.state;
  }
}
