/**
 * Estado inicial e limites dos Needs
 */

export const NEEDS_LIMITS = {
  energy: { min: 0, max: 100 },
  hunger: { min: 0, max: 100 },
  mood: { min: 0, max: 100 },
  aura: { min: 0, max: 100 },
};

export function clampNeed(value, min, max) {
  return Math.max(min, Math.min(max, value));
}