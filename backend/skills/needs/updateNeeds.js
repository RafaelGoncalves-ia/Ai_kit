import kitState, { updateState } from "../../core/stateManager.js";
import { applyDecay } from "./needs.decay.js";
import { evaluateNeeds } from "./needs.rules.js";
import { NEEDS_LIMITS, clampNeed } from "./needs.state.js";

/**
 * Atualiza Needs a cada tick (deltaTime fixo = 1s por tick)
 */
export default function updateNeeds() {
  const currentNeeds = { ...kitState.needs }; // Clona o objeto

  // Aplica decay baseado nos valores atuais
  const decay = applyDecay(currentNeeds, 1);

  // Garante que valores fiquem dentro dos limites
  for (const key in decay) {
    const { min, max } = NEEDS_LIMITS[key];
    currentNeeds[key] = clampNeed(decay[key], min, max);
  }

  // Atualiza kitState usando clone
  updateState("needs", { ...currentNeeds });

  // Calcula efeitos das necessidades
  const effects = evaluateNeeds(currentNeeds);
  updateState("needsEffects", { ...effects });

  // Atualiza timestamp do tick
  updateState("system", { ...kitState.system, lastTick: Date.now() });
}