// limites de cada need
export const NEEDS_LIMITS = {
  energy: { min: 0, max: 100 },
  hunger: { min: 0, max: 100 },
  mood: { min: 0, max: 100 },
  aura: { min: 0, max: 100 },
};

// garante que o valor fique dentro do limite
export function clampNeed(value, min, max) {
  if (typeof value !== "number" || isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}