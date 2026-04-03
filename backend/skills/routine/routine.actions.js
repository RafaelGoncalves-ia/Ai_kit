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

/**
 * Ações disponíveis
 */
export const actions = [
  {
    name: "sleep",
    location: "bed",
    duration: 8 * 60 * 1000, // 8 min reais
    score: (state) => (state.needs.energy < 30 ? 100 : 10),
    effect: (state) => {
      state.needs.energy += 50;
      state.needs.mood += 5;
    },
   // tokens: 0,
  },
  {
    name: "nap",
    location: "bed",
    duration: 60 * 1000,
    score: (state) => (state.needs.energy < 50 ? 70 : 5),
    effect: (state) => {
      state.needs.energy += 20;
      state.needs.mood += 2;
    },
    //tokens: 0,
  },
  {
    name: "take_bath",
    location: "shower",
    duration: 20 * 1000,
    score: (state) => (state.needs.hygiene < 50 ? 80 : 5),
    effect: (state) => {
      state.needs.hygiene += 40;
      state.needs.mood += 5;
      state.needs.energy -= 5;
    },
   // tokens: 0,
  },
  {
    name: "change_clothes",
    location: "wardrobe",
    duration: 15 * 1000,
    score: (state) => 50,
    effect: (state) => {
      state.needs.hygiene += 10;
      state.needs.mood += 2;
    },
   // tokens: 0,
  },
  {
    name: "eat_snack",
    location: "kitchen",
    duration: 15 * 1000,
    score: (state) => (state.needs.hunger < 50 ? 80 : 10),
    effect: (state) => {
      state.needs.hunger += 15;
      state.needs.mood += 2;
    },
//tokens: -2,
  },
  {
    name: "cook_meal",
    location: "kitchen",
    duration: 60 * 1000,
    score: (state) => (state.needs.hunger < 40 ? 90 : 20),
    effect: (state) => {
      state.needs.hunger += 25;
      state.needs.mood += 5;
      state.needs.energy -= 5;
    },
    //tokens: -5,
  },
  {
    name: "play_videogame",
    location: "sofa",
    duration: 2 * 60 * 1000,
    score: (state) => (state.needs.mood < 50 ? 80 : 20),
    effect: (state) => {
      state.needs.mood += 20;
      state.needs.energy -= 10;
    },
    //tokens: -10,
  },
  {
    name: "read",
    location: "sofa",
    duration: 60 * 1000,
    score: (state) => (state.needs.mood < 60 ? 50 : 5),
    effect: (state) => {
      state.needs.mood += 15;
      state.needs.energy -= 5;
      state.needs.aura += 5;
    },
    //tokens: 0,
  },
  {
    name: "watch_series",
    location: "sofa",
    duration: 2 * 60 * 1000,
    score: (state) => (state.needs.mood < 50 ? 70 : 10),
    effect: (state) => {
      state.needs.mood += 20;
      state.needs.energy -= 5;
    },
    //tokens: -5,
  },
  {
    name: "take_photos_tripod",
    location: "tripe_camera",
    duration: 30 * 1000,
    score: () => 60,
    effect: (state) => {
      state.needs.mood += 5;
      state.needs.aura += 5;
      state.needs.energy -= 3;
    },
   // tokens: 5,
  },
  {
    name: "take_selfies",
    location: "mirror",
    duration: 30 * 1000,
    score: () => 50,
    effect: (state) => {
      state.needs.mood += 5;
      state.needs.aura += 5;
      state.needs.energy -= 3;
    },
   // tokens: 5,
  },
  {
    name: "stream_live",
    location: "pc",
    duration: 60 * 1000,
    score: (state) => (state.needs.energy > 50 ? 80 : 0),
    effect: (state) => {
      state.needs.mood += 15;
      state.needs.aura += 20;
      state.needs.energy -= 15;
    },
  //  tokens: 20,
  },
  {
    name: "home_office",
    location: "pc",
    duration: 8 * 60 * 1000,
    score: () => 50,
    effect: (state) => {
      state.needs.mood -= 5;
      state.needs.energy -= 20;
    },
  //  tokens: 10,
  },
  {
    name: "meditate",
    location: "bed",
    duration: 60 * 1000,
    score: () => 60,
    effect: (state) => {
      state.needs.mood += 5;
      state.needs.energy += 15;
    },
   // tokens: 0,
  },
  {
    name: "relax_sofa",
    location: "sofa",
    duration: 15 * 1000,
    score: () => 50,
    effect: (state) => {
      state.needs.energy += 5;
      state.needs.mood += 5;
    },
   // tokens: 0,
  },
  {
    name: "relax_bed",
    location: "bed",
    duration: 15 * 1000,
    score: () => 50,
    effect: (state) => {
      state.needs.energy += 5;
      state.needs.mood += 5;
    },
   // tokens: 0,
  },
  // mais ações podem ser adicionadas seguindo mesmo padrão
];