export function calculatePhysicalMultiplier(armor = 0) {
  const value = Number(armor);
  if (!Number.isFinite(value)) {
    return { multiplier: null, warnings: ["missing_armor_value"] };
  }
  return { multiplier: 100 / (100 + Math.max(0, value)), warnings: [] };
}

export function calculateMagicMultiplier(magicResist = 0) {
  const value = Number(magicResist);
  if (!Number.isFinite(value)) {
    return { multiplier: null, warnings: ["missing_magic_resist_value"] };
  }
  return { multiplier: 100 / (100 + Math.max(0, value)), warnings: [] };
}

export function applyLethality(armor = 0, lethality = 0) {
  const armorValue = Number(armor);
  const lethalityValue = Number(lethality);
  if (!Number.isFinite(armorValue) || !Number.isFinite(lethalityValue)) {
    return { effectiveArmor: null, warnings: ["missing_lethality_or_armor_value"] };
  }
  return { effectiveArmor: Math.max(0, armorValue - Math.max(0, lethalityValue)), warnings: [] };
}

export function applyPercentPen(resistance = 0, percentPen = 0) {
  const resistanceValue = Number(resistance);
  const penValue = Number(percentPen);
  if (!Number.isFinite(resistanceValue) || !Number.isFinite(penValue)) {
    return { effectiveResistance: null, warnings: ["missing_percent_pen_or_resistance_value"] };
  }
  const normalizedPen = penValue > 1 ? penValue / 100 : penValue;
  return {
    effectiveResistance: Math.max(0, resistanceValue * (1 - Math.max(0, Math.min(1, normalizedPen)))),
    warnings: []
  };
}

export function estimateFlatBurstValue(targetProfile = {}) {
  const squishyCount = Number(targetProfile.squishyCount || 0);
  const tankCount = Number(targetProfile.tankCount || 0);
  const score = squishyCount * 2 - tankCount;
  return {
    score,
    label: score >= 4 ? "high" : score >= 2 ? "medium" : "low",
    warnings: targetProfile.confidence === "low" ? ["low_confidence_target_profile"] : []
  };
}

export function estimatePercentDamageValue(targetProfile = {}) {
  const tankCount = Number(targetProfile.tankCount || 0);
  const bruiserCount = Number(targetProfile.bruiserCount || 0);
  const score = tankCount * 2 + bruiserCount;
  return {
    score,
    label: score >= 4 ? "high" : score >= 2 ? "medium" : "low",
    warnings: targetProfile.confidence === "low" ? ["low_confidence_target_profile"] : []
  };
}

export function compareDamagePath(pathA = {}, pathB = {}, targetProfile = {}) {
  const flat = estimateFlatBurstValue(targetProfile);
  const percent = estimatePercentDamageValue(targetProfile);
  const pathAScore = scorePath(pathA, flat, percent);
  const pathBScore = scorePath(pathB, flat, percent);

  return {
    winner: pathAScore === pathBScore ? "tie" : pathAScore > pathBScore ? pathA.id || "pathA" : pathB.id || "pathB",
    scores: {
      [pathA.id || "pathA"]: pathAScore,
      [pathB.id || "pathB"]: pathBScore
    },
    warnings: [...flat.warnings, ...percent.warnings]
  };
}

function scorePath(path, flat, percent) {
  const stats = new Set([...(path.preferredStats || []), ...(path.requiredStats || [])]);
  let score = 0;
  if (stats.has("lethality") || stats.has("flat_pen") || stats.has("magic_pen")) score += flat.score;
  if (stats.has("armor_pen") || stats.has("percent_pen") || stats.has("max_health_damage")) score += percent.score;
  if (stats.has("sustain") || stats.has("health")) score += Number(percent.score > flat.score ? 1 : 0);
  return score;
}

export default {
  calculatePhysicalMultiplier,
  calculateMagicMultiplier,
  applyLethality,
  applyPercentPen,
  estimateFlatBurstValue,
  estimatePercentDamageValue,
  compareDamagePath
};
