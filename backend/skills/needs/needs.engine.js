import kitState from "../../core/stateManager.js";
import { applyDecay } from "./needs.decay.js";
import { evaluateNeeds } from "./needs.rules.js";
import { NEEDS_LIMITS, clampNeed } from "./needs.state.js";

/**
 * Atualiza Needs com base no deltaTime
 */
export default function updateNeeds(deltaTime = 1000) {
  // aplica decaimento
  const decay = applyDecay(kitState.needs, deltaTime);

  for (const key in decay) {
    const { min, max } = NEEDS_LIMITS[key];
    decay[key] = clampNeed(decay[key], min, max);
  }

  kitState.needs = decay;

  // calcula efeitos das necessidades
  kitState.needsEffects = evaluateNeeds(decay);

  // envia SSE para o frontend
  if (global.sendSSE) {
    global.sendSSE({
      type: "needs:update",
      payload: kitState.needs
    });
  }
  

  // atualiza timestamp do tick
  kitState.system.lastTick = Date.now();
}