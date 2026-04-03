/**
 * Aplica a variação natural dos needs por tick
 * deltaTime em segundos
 */
export function applyDecay(needs, deltaTime = 1) {
  const decayRates = {
    energy: -0.05, // por segundo
    hunger: -0.03,
    mood: -0.02,
    aura: -0.01,    // aura só muda via interações
    hygiene: -0.01, // novo
  };

  const newNeeds = {};

  for (const key in needs) {
    const current = needs[key];
    const rate = decayRates[key] ?? 0;

    // Garante que current é um número válido
    const baseValue = typeof current === "number" ? current : 50;

    // Aplica decay sem sobrescrever valores válidos com null/undefined
    newNeeds[key] = baseValue + rate * deltaTime;
  }

  return newNeeds;
}