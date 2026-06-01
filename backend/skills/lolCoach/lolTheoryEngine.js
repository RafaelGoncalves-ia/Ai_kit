import { scanVulnerabilities } from "./lolVulnerabilityScanner.js";
import { inferBuildPath } from "./lolBuildPathInferer.js";
import {
  estimateFlatBurstValue,
  estimatePercentDamageValue
} from "./lolDamageModel.js";

export function runTheorycraftAnalysis(queryMeta = {}, knowledge = {}) {
  const scan = scanVulnerabilities(queryMeta, knowledge);
  const build = inferBuildPath(queryMeta, knowledge, scan);
  const flatBurst = estimateFlatBurstValue(scan.enemyProfile);
  const percentDamage = estimatePercentDamageValue(scan.enemyProfile);
  const playerChampion = queryMeta.playerChampion || queryMeta.championNames?.[0] || null;
  const archetype = playerChampion ? knowledge.championArchetypes?.[playerChampion] : null;

  return {
    playerChampion,
    enemyChampions: queryMeta.enemyChampions || [],
    detectedEnemyProfile: scan.enemyProfile,
    triggeredStrategies: scan.triggeredStrategies,
    recommendedPath: build.recommendedPath,
    rejectedPaths: build.rejectedPaths,
    requiredStats: build.requiredStats,
    forbiddenStats: build.forbiddenStats,
    reasoning: [
      ...(build.reasoning || []),
      `Flat burst value: ${flatBurst.label}.`,
      `Percent damage value: ${percentDamage.label}.`
    ],
    warnings: [
      ...(scan.warnings || []),
      ...(build.warnings || []),
      ...(!archetype && playerChampion ? [`missing_archetype:${playerChampion}`] : [])
    ],
    confidence: mergeConfidence(scan.confidence, build.confidence)
  };
}

function mergeConfidence(a, b) {
  if (a === "low" || b === "low") return "low";
  if (a === "medium" || b === "medium") return "medium";
  return "high";
}

export default {
  runTheorycraftAnalysis
};
