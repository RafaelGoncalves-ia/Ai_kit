/**
 * Condições
 */
export function isTired(state) { return state.needs.energy < 30; }
export function isVeryTired(state) { return state.needs.energy < 15; }
export function isHungry(state) { return state.needs.hunger < 30; }
export function isVeryHungry(state) { return state.needs.hunger < 10; }
export function isBored(state) { return state.needs.mood < 40; }
export function isVeryBored(state) { return state.needs.mood < 20; }
export function isSocialHigh(state) { return state.needs.aura > 60; }
export function isSocialLow(state) { return state.needs.aura < 30; }

function scoreByNeed(need) {
  const value = Math.max(0, Math.min(100, need));
  return Math.max(0, Math.min(100, Math.round((90 - value) / 90 * 100)));
}

function scoreByExcess(value, threshold = 50) {
  if (value <= threshold) return 0;
  return Math.max(0, Math.min(100, Math.round((value - threshold) / (100 - threshold) * 100)));
}

/**
 * Ações disponíveis
 */
export const actions = [
  {
    name: "sleep",
    location: "bed",
    duration: 8 * 60 * 1000, // 8 min reais
    score: (state) => scoreByNeed(state.needs.energy),
    tickEffect: (state) => {
      state.needs.energy += 0.17; // ~80 pontos totais em 8 min
      state.needs.mood += 0.02;
    },
   // tokens: 0,
  },
  {
    name: "nap",
    location: "bed",
    duration: 60 * 1000,
    score: (state) => scoreByNeed(state.needs.energy),
    tickEffect: (state) => {
      state.needs.energy += 0.30;
      state.needs.mood += 0.03;
    },
    //tokens: 0,
  },
  {
    name: "take_bath",
    location: "shower",
    duration: 20 * 1000,
    score: (state) => scoreByNeed(state.needs.hygiene),
    tickEffect: (state) => {
      state.needs.hygiene += 2.0;
      state.needs.mood += 0.25;
      state.needs.energy -= 0.25;
    },
   // tokens: 0,
  },
  {
    name: "change_clothes",
    location: "wardrobe",
    duration: 15 * 1000,
    score: (state) => scoreByNeed(state.needs.hygiene),
    tickEffect: (state) => {
      state.needs.hygiene += 0.67;
      state.needs.mood += 0.13;
    },
   // tokens: 0,
  },
  {
    name: "eat_snack",
    location: "kitchen",
    duration: 15 * 1000,
    score: (state) => scoreByNeed(state.needs.hunger),
    tickEffect: (state) => {
      state.needs.hunger += 1.0;
      state.needs.mood += 0.13;
    },
//tokens: -2,
  },
  {
    name: "cook_meal",
    location: "kitchen",
    duration: 60 * 1000,
    score: (state) => scoreByNeed(state.needs.hunger),
    tickEffect: (state) => {
      state.needs.hunger += 0.42;
      state.needs.mood += 0.08;
      state.needs.energy -= 0.08;
    },
    //tokens: -5,
  },
  {
    name: "play_videogame",
    location: "sofa",
    duration: 2 * 60 * 1000,
    score: (state) => scoreByNeed(state.needs.mood),
    tickEffect: (state) => {
      state.needs.mood += 0.17;
      state.needs.energy -= 0.08;
    },
    //tokens: -10,
  },
  {
    name: "read",
    location: "sofa",
    duration: 60 * 1000,
    score: (state) => scoreByNeed(state.needs.mood),
    tickEffect: (state) => {
      state.needs.mood += 0.25;
      state.needs.energy -= 0.08;
      state.needs.aura += 0.08;
    },
    //tokens: 0,
  },
  {
    name: "watch_series",
    location: "sofa",
    duration: 2 * 60 * 1000,
    score: (state) => scoreByNeed(state.needs.mood),
    tickEffect: (state) => {
      state.needs.mood += 0.17;
      state.needs.energy -= 0.04;
    },
    //tokens: -5,
  },
  {
    name: "take_photos_tripod",
    location: "tripe_camera",
    duration: 30 * 1000,
    score: (state) => scoreByNeed(state.needs.aura),
    tickEffect: (state) => {
      state.needs.mood += 0.17;
      state.needs.aura += 0.17;
      state.needs.energy -= 0.10;
    },
   // tokens: 5,
  },
  {
    name: "take_selfies",
    location: "mirror",
    duration: 30 * 1000,
    score: (state) => scoreByNeed(state.needs.aura),
    tickEffect: (state) => {
      state.needs.mood += 0.17;
      state.needs.aura += 0.17;
      state.needs.energy -= 0.10;
    },
   // tokens: 5,
  },
  {
    name: "stream_live",
    location: "pc",
    duration: 60 * 1000,
    score: (state) => scoreByExcess(state.needs.energy, 50),
    tickEffect: (state) => {
      state.needs.mood += 0.25;
      state.needs.aura += 0.33;
      state.needs.energy -= 0.25;
    },
  //  tokens: 20,
  },
  {
    name: "home_office",
    location: "pc",
    duration: 8 * 60 * 1000,
    score: (state) => scoreByExcess(state.needs.energy, 50),
    tickEffect: (state) => {
      state.needs.mood -= 0.01;
      state.needs.energy -= 0.10;
    },
  //  tokens: 10,
  },
  {
    name: "meditate",
    location: "bed",
    duration: 60 * 1000,
    score: (state) => scoreByNeed(state.needs.energy),
    tickEffect: (state) => {
      state.needs.mood += 0.08;
      state.needs.energy += 0.25;
    },
   // tokens: 0,
  },
  {
    name: "relax_sofa",
    location: "sofa",
    duration: 15 * 1000,
    score: (state) => scoreByNeed(state.needs.energy),
    tickEffect: (state) => {
      state.needs.energy += 0.33;
      state.needs.mood += 0.33;
    },
   // tokens: 0,
  },
  {
    name: "relax_bed",
    location: "bed",
    duration: 15 * 1000,
    score: (state) => scoreByNeed(state.needs.energy),
    tickEffect: (state) => {
      state.needs.energy += 0.33;
      state.needs.mood += 0.33;
    },
   // tokens: 0,
  },
  // mais ações podem ser adicionadas seguindo mesmo padrão
];