/**
 * Regras e catálogo de ações de rotina.
 *
 * Objetivos desta versão:
 * - Separar descanso leve, cochilo e sono profundo por faixa de energia.
 * - Evitar loop de ações de recuperação.
 * - Permitir interrupção automática quando o need alvo atingir 95.
 * - Manter API simples para o seletor de rotina.
 */

/* =========================
 * LIMITES / THRESHOLDS
 * ========================= */
export const NEED_MIN = 0;
export const NEED_MAX = 100;
export const NEED_STOP_THRESHOLD = 95;

export const ENERGY_SLEEP_MAX = 15;     // sono pesado
export const ENERGY_NAP_MIN = 16;       // cochilo
export const ENERGY_NAP_MAX = 40;
export const ENERGY_RELAX_MIN = 41;     // relaxar / recuperar
export const ENERGY_RELAX_MAX = 70;

export const HUNGER_SNACK_MIN = 15;     // lanche rápido
export const HUNGER_SNACK_MAX = 35;
export const HUNGER_MEAL_MAX = 14;      // refeição mais pesada

export const HYGIENE_BATH_MAX = 20;
export const HYGIENE_CLOTHES_MIN = 21;
export const HYGIENE_CLOTHES_MAX = 45;

export const MOOD_FUN_MAX = 35;
export const MOOD_LIGHT_FUN_MIN = 36;
export const MOOD_LIGHT_FUN_MAX = 55;

export const AURA_LOW_MAX = 35;
export const AURA_HIGH_MIN = 70;

/* =========================
 * HELPERS
 * ========================= */
function clamp(value, min = NEED_MIN, max = NEED_MAX) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function getNeed(state, key, fallback = 50) {
  return clamp(state?.needs?.[key] ?? fallback);
}

function positiveRecoveryScore(currentValue, minValue, maxValue) {
  const value = clamp(currentValue);

  if (value < minValue || value > maxValue) {
    return 0;
  }

  const range = Math.max(1, maxValue - minValue);
  return Math.round(((maxValue - value) / range) * 100);
}

function criticalLowScore(currentValue, maxValue) {
  const value = clamp(currentValue);

  if (value > maxValue) {
    return 0;
  }

  return Math.round(((maxValue - value) / Math.max(1, maxValue)) * 100);
}

function excessScore(currentValue, threshold = 50) {
  const value = clamp(currentValue);

  if (value <= threshold) {
    return 0;
  }

  return Math.round(((value - threshold) / Math.max(1, 100 - threshold)) * 100);
}

function boostIfCurrentAction(state, actionName, boost = 8) {
  return state?.routine?.currentAction === actionName ? boost : 0;
}

function penalizeIfCurrentAction(state, actionName, penalty = 12) {
  return state?.routine?.currentAction === actionName ? penalty : 0;
}

function applyDelta(state, key, delta) {
  if (!state?.needs) return;
  state.needs[key] = clamp((state.needs[key] ?? 50) + delta);
}

/* =========================
 * CONDIÇÕES
 * ========================= */
export function isTired(state) {
  return getNeed(state, "energy") < 30;
}

export function isVeryTired(state) {
  return getNeed(state, "energy") <= ENERGY_SLEEP_MAX;
}

export function isHungry(state) {
  return getNeed(state, "hunger") < 30;
}

export function isVeryHungry(state) {
  return getNeed(state, "hunger") <= HUNGER_MEAL_MAX;
}

export function isBored(state) {
  return getNeed(state, "mood") < 40;
}

export function isVeryBored(state) {
  return getNeed(state, "mood") < 20;
}

export function isSocialHigh(state) {
  return getNeed(state, "aura") >= 60;
}

export function isSocialLow(state) {
  return getNeed(state, "aura") < 30;
}

/* =========================
 * INTERRUPÇÃO AUTOMÁTICA
 * ========================= */

/**
 * Mapeia qual need principal uma ação recupera.
 * Se esse need alcançar 95, a ação pode ser interrompida.
 */
export function getPrimaryRecoveredNeed(actionName) {
  switch (actionName) {
    case "sleep":
    case "nap":
    case "meditate":
    case "relax_sofa":
    case "relax_bed":
      return "energy";

    case "eat_snack":
    case "cook_meal":
      return "hunger";

    case "take_bath":
    case "change_clothes":
      return "hygiene";

    case "play_videogame":
    case "read":
    case "watch_series":
      return "mood";

    case "take_photos_tripod":
    case "take_selfies":
    case "stream_live":
      return "aura";

    default:
      return null;
  }
}

/**
 * Retorna true quando a ação atual deve ser interrompida
 * porque o need principal já chegou ao limite desejado.
 */
export function shouldInterruptActionByNeed(state, actionName) {
  const primaryNeed = getPrimaryRecoveredNeed(actionName);
  if (!primaryNeed) return false;

  const value = getNeed(state, primaryNeed);
  return value >= NEED_STOP_THRESHOLD;
}

/**
 * Pode ser chamada pelo seletor de rotina antes de manter a ação atual.
 */
export function shouldStopCurrentAction(state) {
  const currentAction = state?.routine?.currentAction;
  if (!currentAction) return false;

  return shouldInterruptActionByNeed(state, currentAction);
}
/* =========================
 * AÇÕES DISPONÍVEIS
 * ========================= */
export const actions = [
  {
    name: "sleep",
    location: "bed",
    duration: 8 * 60 * 1000,
    score: (state) => {
      const energy = getNeed(state, "energy");
      return criticalLowScore(energy, ENERGY_SLEEP_MAX) + boostIfCurrentAction(state, "sleep", 10);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "sleep"),
    tickEffect: (state) => {
      applyDelta(state, "energy", 0.22);
      applyDelta(state, "mood", 0.03);
    }
  },

  {
    name: "nap",
    location: "bed",
    duration: 60 * 1000,
    score: (state) => {
      const energy = getNeed(state, "energy");
      return positiveRecoveryScore(energy, ENERGY_NAP_MIN, ENERGY_NAP_MAX)
        - penalizeIfCurrentAction(state, "sleep", 18);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "nap"),
    tickEffect: (state) => {
      applyDelta(state, "energy", 0.30);
      applyDelta(state, "mood", 0.04);
    }
  },

  {
    name: "take_bath",
    location: "shower",
    duration: 20 * 1000,
    score: (state) => {
      const hygiene = getNeed(state, "hygiene");
      return criticalLowScore(hygiene, HYGIENE_BATH_MAX);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "take_bath"),
    tickEffect: (state) => {
      applyDelta(state, "hygiene", 2.0);
      applyDelta(state, "mood", 0.25);
      applyDelta(state, "energy", -0.25);
    }
  },

  {
    name: "change_clothes",
    location: "wardrobe",
    duration: 15 * 1000,
    score: (state) => {
      const hygiene = getNeed(state, "hygiene");
      return positiveRecoveryScore(hygiene, HYGIENE_CLOTHES_MIN, HYGIENE_CLOTHES_MAX);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "change_clothes"),
    tickEffect: (state) => {
      applyDelta(state, "hygiene", 0.67);
      applyDelta(state, "mood", 0.13);
    }
  },

  {
    name: "eat_snack",
    location: "kitchen",
    duration: 15 * 1000,
    score: (state) => {
      const hunger = getNeed(state, "hunger");
      return positiveRecoveryScore(hunger, HUNGER_SNACK_MIN, HUNGER_SNACK_MAX);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "eat_snack"),
    tickEffect: (state) => {
      applyDelta(state, "hunger", 1.0);
      applyDelta(state, "mood", 0.13);
    }
  },

  {
    name: "cook_meal",
    location: "kitchen",
    duration: 60 * 1000,
    score: (state) => {
      const hunger = getNeed(state, "hunger");
      return criticalLowScore(hunger, HUNGER_MEAL_MAX) + boostIfCurrentAction(state, "cook_meal", 6);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "cook_meal"),
    tickEffect: (state) => {
      applyDelta(state, "hunger", 0.42);
      applyDelta(state, "mood", 0.08);
      applyDelta(state, "energy", -0.08);
    }
  },

  {
    name: "play_videogame",
    location: "sofa",
    duration: 2 * 60 * 1000,
    score: (state) => {
      const mood = getNeed(state, "mood");
      return criticalLowScore(mood, MOOD_FUN_MAX);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "play_videogame"),
    tickEffect: (state) => {
      applyDelta(state, "mood", 0.17);
      applyDelta(state, "energy", -0.08);
    }
  },

  {
    name: "read",
    location: "sofa",
    duration: 60 * 1000,
    score: (state) => {
      const mood = getNeed(state, "mood");
      const aura = getNeed(state, "aura");

      return positiveRecoveryScore(mood, MOOD_LIGHT_FUN_MIN, MOOD_LIGHT_FUN_MAX) +
        (aura < 60 ? 8 : 0);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "read"),
    tickEffect: (state) => {
      applyDelta(state, "mood", 0.25);
      applyDelta(state, "energy", -0.08);
      applyDelta(state, "aura", 0.08);
    }
  },

  {
    name: "watch_series",
    location: "sofa",
    duration: 2 * 60 * 1000,
    score: (state) => {
      const mood = getNeed(state, "mood");
      return positiveRecoveryScore(mood, MOOD_LIGHT_FUN_MIN, MOOD_LIGHT_FUN_MAX);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "watch_series"),
    tickEffect: (state) => {
      applyDelta(state, "mood", 0.17);
      applyDelta(state, "energy", -0.04);
    }
  },

  {
    name: "take_photos_tripod",
    location: "tripe_camera",
    duration: 30 * 1000,
    score: (state) => {
      const aura = getNeed(state, "aura");
      return positiveRecoveryScore(aura, 0, AURA_LOW_MAX);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "take_photos_tripod"),
    tickEffect: (state) => {
      applyDelta(state, "mood", 0.17);
      applyDelta(state, "aura", 0.17);
      applyDelta(state, "energy", -0.10);
    }
  },

  {
    name: "take_selfies",
    location: "mirror",
    duration: 30 * 1000,
    score: (state) => {
      const aura = getNeed(state, "aura");
      return positiveRecoveryScore(aura, 0, AURA_LOW_MAX);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "take_selfies"),
    tickEffect: (state) => {
      applyDelta(state, "mood", 0.17);
      applyDelta(state, "aura", 0.17);
      applyDelta(state, "energy", -0.10);
    }
  },

  {
    name: "stream_live",
    location: "pc",
    duration: 60 * 1000,
    score: (state) => {
      const energy = getNeed(state, "energy");
      const aura = getNeed(state, "aura");
      return excessScore(energy, 60) + (aura < AURA_HIGH_MIN ? 10 : 0);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "stream_live"),
    tickEffect: (state) => {
      applyDelta(state, "mood", 0.25);
      applyDelta(state, "aura", 0.33);
      applyDelta(state, "energy", -0.25);
    }
  },

  {
    name: "home_office",
    location: "pc",
    duration: 8 * 60 * 1000,
    score: (state) => {
      const energy = getNeed(state, "energy");
      return excessScore(energy, 55);
    },
    shouldInterrupt: () => false,
    tickEffect: (state) => {
      applyDelta(state, "mood", -0.01);
      applyDelta(state, "energy", -0.10);
    }
  },

  {
    name: "meditate",
    location: "bed",
    duration: 60 * 1000,
    score: (state) => {
      const energy = getNeed(state, "energy");
      return positiveRecoveryScore(energy, ENERGY_NAP_MIN, 55) - 8;
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "meditate"),
    tickEffect: (state) => {
      applyDelta(state, "mood", 0.08);
      applyDelta(state, "energy", 0.25);
    }
  },

  {
    name: "relax_sofa",
    location: "sofa",
    duration: 15 * 1000,
    score: (state) => {
      const energy = getNeed(state, "energy");
      return positiveRecoveryScore(energy, ENERGY_RELAX_MIN, ENERGY_RELAX_MAX);
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "relax_sofa"),
    tickEffect: (state) => {
      applyDelta(state, "energy", 0.33);
      applyDelta(state, "mood", 0.33);
    }
  },

  {
    name: "relax_bed",
    location: "bed",
    duration: 15 * 1000,
    score: (state) => {
      const energy = getNeed(state, "energy");
      return positiveRecoveryScore(energy, ENERGY_RELAX_MIN, ENERGY_RELAX_MAX) - 5;
    },
    shouldInterrupt: (state) => shouldInterruptActionByNeed(state, "relax_bed"),
    tickEffect: (state) => {
      applyDelta(state, "energy", 0.33);
      applyDelta(state, "mood", 0.33);
    }
  }
];

/* =========================
 * HELPERS DO MOTOR DE ROTINA
 * ========================= */

/**
 * Busca uma ação pelo nome.
 */
export function getActionByName(name) {
  return actions.find((action) => action.name === name) || null;
}

/**
 * Retorna score seguro de uma ação.
 */
export function getActionScore(action, state) {
  if (!action || typeof action.score !== "function") {
    return 0;
  }

  const value = Number(action.score(state));
  if (!Number.isFinite(value)) {
    return 0;
  }

  return clamp(value, 0, 100);
}

/**
 * Diz se uma ação ainda pode continuar ativa.
 * O seletor pode usar isso antes de manter a rotina atual.
 */
export function canKeepCurrentAction(state) {
  const currentActionName = state?.routine?.currentAction;
  const action = getActionByName(currentActionName);

  if (!action) {
    return false;
  }

  if (typeof action.shouldInterrupt === "function" && action.shouldInterrupt(state)) {
    return false;
  }

  return true;
}