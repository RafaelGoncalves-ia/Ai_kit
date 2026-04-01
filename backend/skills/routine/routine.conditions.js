export function isTired(state) { return state.needs.energy < 30; }
export function isVeryTired(state) { return state.needs.energy < 15; }
export function isHungry(state) { return state.needs.hunger > 60; }
export function isVeryHungry(state) { return state.needs.hunger > 80; }
export function isBored(state) { return state.needs.mood < 40; }
export function isVeryBored(state) { return state.needs.mood < 20; }
export function isSocialHigh(state) { return state.needs.aura > 60; }
export function isSocialLow(state) { return state.needs.aura < 30; }