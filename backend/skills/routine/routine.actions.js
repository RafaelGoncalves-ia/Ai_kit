/**
 * Ações com sistema de score dinâmico
 */

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

export const actions = [
  // ======================
  // 😴 DORMIR
  // ======================
  {
    name: "sleep",
    location: "bed",
    duration: 180000, // 3 min

    score: (state) => {
      let score = 0;

      if (isVeryTired(state)) score += 80;
      if (isTired(state)) score += 40;

      if (state.needs.mood < 30) score += 10;

      return score;
    },

    effect: (state) => {
      state.needs.energy += 1.5;
      state.needs.mood += 0.2;
    },
  },

  // ======================
  // 🍔 COMER
  // ======================
  {
    name: "eat",
    location: "kitchen",
    duration: 60000,

    score: (state) => {
      let score = 0;

      if (isVeryHungry(state)) score += 90;
      if (isHungry(state)) score += 50;

      if (state.needs.energy < 30) score += 10;

      return score;
    },

    effect: (state) => {
      state.needs.hunger -= 2;
      state.needs.mood += 0.3;
    },
  },

  // ======================
  // 💻 TRABALHAR
  // ======================
  {
    name: "working_pc",
    location: "pc",
    duration: 300000, // 5 min

    score: (state) => {
      let score = 20; // base

      if (state.needs.energy > 60) score += 20;
      if (state.needs.mood > 50) score += 10;

      if (isVeryHungry(state)) score -= 40;
      if (isVeryTired(state)) score -= 50;

      return score;
    },

    effect: (state) => {
      state.needs.energy -= 0.5;
      state.needs.mood -= 0.2;
      state.needs.aura += 0.5;
    },
  },

  // ======================
  // 📸 TIRAR FOTO
  // ======================
  {
    name: "taking_photos",
    location: "photo_spot",
    duration: 120000,

    score: (state) => {
      let score = 10;

      if (isBored(state)) score += 40;
      if (isVeryBored(state)) score += 70;

      if (isSocialHigh(state)) score += 20;

      if (state.needs.energy > 50) score += 10;

      return score;
    },

    effect: (state) => {
      state.needs.mood += 0.8;
      state.needs.energy -= 0.4;
      state.needs.aura += 0.3;
    },
  },

  // ======================
  // 📱 CELULAR / SOFÁ
  // ======================
  {
    name: "use_phone",
    location: "sofa",
    duration: 90000,

    score: (state) => {
      let score = 15;

      if (isBored(state)) score += 30;
      if (isSocialLow(state)) score += 20;

      if (state.needs.energy < 40) score += 10;

      return score;
    },

    effect: (state) => {
      state.needs.mood += 0.5;
      state.needs.aura += 0.2;
    },
  },

  // ======================
  // 📺 VER TV
  // ======================
  {
    name: "watch_tv",
    location: "sofa",
    duration: 120000,

    score: (state) => {
      let score = 10;

      if (isBored(state)) score += 25;
      if (state.needs.energy < 50) score += 10;

      return score;
    },

    effect: (state) => {
      state.needs.mood += 0.6;
    },
  },

  // ======================
  // 🧘 EXERCÍCIO
  // ======================
  {
    name: "exercise",
    location: "yoga_mat",
    duration: 150000,

    score: (state) => {
      let score = 5;

      if (state.needs.energy > 70) score += 30;
      if (state.needs.mood < 40) score += 15;

      return score;
    },

    effect: (state) => {
      state.needs.energy -= 1;
      state.needs.mood += 0.7;
    },
  },

  // ======================
  // 🚿 BANHO
  // ======================
  {
    name: "shower",
    location: "bathroom",
    duration: 90000,

    score: (state) => {
      let score = 5;

      if (state.needs.mood < 40) score += 20;

      return score;
    },

    effect: (state) => {
      state.needs.mood += 0.5;
    },
  },

  // ======================
  // 👗 TROCAR ROUPA
  // ======================
  {
    name: "change_clothes",
    location: "wardrobe",
    duration: 60000,

    score: (state) => {
      let score = 5;

      if (isSocialHigh(state)) score += 15;

      return score;
    },

    effect: (state) => {
      state.needs.mood += 0.3;
    },
  },

  // ======================
  // 📚 LER
  // ======================
  {
    name: "read",
    location: "bookshelf",
    duration: 180000,

    score: (state) => {
      let score = 10;

      if (state.needs.mood < 50) score += 10;
      if (state.needs.energy > 40) score += 10;

      return score;
    },

    effect: (state) => {
      state.needs.mood += 0.4;
    },
  },

  // ======================
  // 🧍 IDLE
  // ======================
  {
    name: "idle",
    location: "room",
    duration: 60000,

    score: () => 1, // fallback

    effect: () => {},
  },
];