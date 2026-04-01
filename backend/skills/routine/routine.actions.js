import {
  isTired,
  isVeryTired,
  isHungry,
  isVeryHungry,
  isBored,
  isVeryBored,
  isSocialHigh,
  isSocialLow,
} from "./routine.conditions.js";

/**
 * Ações disponíveis
 */
export const actions = [
  {
    name: "sleep",
    location: "bed",
    duration: 8 * 60 * 1000,
    score: (state) => (state.needs.energy < 20 ? 100 : 0),
    effect: (state) => {
      state.needs.energy += 0.5;
      state.needs.mood += 0.2;
    },
  },
  {
    name: "eat",
    location: "kitchen",
    duration: 30 * 1000,
    score: (state) => (state.needs.hunger > 70 ? 100 : 0),
    effect: (state) => {
      state.needs.hunger -= 1.5;
      state.needs.mood += 0.3;
    },
  },
  {
    name: "idle",
    location: "room",
    duration: 60 * 1000,
    score: () => 1,
    effect: () => {},
  },
  // adicionar outras ações com mesma lógica se quiser
];