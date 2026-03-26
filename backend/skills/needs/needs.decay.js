/**
 * Regras de variação natural dos Needs (por tick)
 */

export function applyDecay(needs, deltaTime) {
  // deltaTime em segundos
  const decay = { ...needs };

  // energia cai devagar
  decay.energy -= 0.5 * deltaTime;

  // fome sobe
  decay.hunger += 0.7 * deltaTime;

  // mood cai se nada interessante acontece
  decay.mood -= 0.3 * deltaTime;

  // aura cai lentamente sem interação
  decay.aura -= 0.1 * deltaTime;

  return decay;
}