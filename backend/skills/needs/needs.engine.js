import kitState from "../../core/stateManager.js";
import { applyDecay } from "./needs.decay.js";
import { evaluateNeeds } from "./needs.rules.js";
import { NEEDS_LIMITS, clampNeed } from "./needs.state.js";

/**
 * Engine principal dos Needs
 */

export default function updateNeeds(context) {
  const now = Date.now();
  const lastTick = kitState.system.lastTick;

  const deltaTime = (now - lastTick) / 1000; // segundos

  // aplica decay
  let updated = applyDecay(kitState.needs, deltaTime);

  // clamp (limites)
  for (const key in updated) {
    const { min, max } = NEEDS_LIMITS[key];
    updated[key] = clampNeed(updated[key], min, max);
  }

  // salva no estado global
  kitState.needs = updated;

  // avalia efeitos
  const effects = evaluateNeeds(updated);

  // salva sugestões (não força nada)
  kitState.needsEffects = effects;

  // atualiza tempo
  kitState.system.lastTick = now;
}