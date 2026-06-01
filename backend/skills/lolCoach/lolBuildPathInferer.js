import { scanVulnerabilities } from "./lolVulnerabilityScanner.js";

const THEORY_INTENTS = new Set([
  "theorycraft_analysis",
  "burst_maximization",
  "anti_tank_inference",
  "vulnerability_scan",
  "hybrid_path_selection",
  "offmeta_build_analysis"
]);

export function inferBuildPath(queryMeta = {}, knowledge = {}, scan = null) {
  const playerChampion = queryMeta.playerChampion || queryMeta.championNames?.[0] || "";
  const archetype = knowledge.championArchetypes?.[playerChampion] || null;
  const vulnerabilityScan = scan || scanVulnerabilities(queryMeta, knowledge);
  const hybridRules = knowledge.hybridChampionRules?.[playerChampion] || null;
  const warnings = [];
  const rejectedPaths = [];

  if (!playerChampion) {
    return {
      recommendedPath: null,
      rejectedPaths,
      reasoning: ["Build needs a player champion."],
      requiredStats: [],
      forbiddenStats: [],
      confidence: "low",
      warnings: ["missing_player_champion"]
    };
  }

  if (!archetype) {
    warnings.push(`missing_archetype:${playerChampion}`);
  }

  const forbiddenStats = archetype?.forbiddenStats || [];
  const explicitOffMeta = queryMeta.offMeta === true || queryMeta.intent === "offmeta_build_analysis";
  const textStyle = String(queryMeta.intendedStyle || "").toLowerCase();
  const wantsForbidden = forbiddenStats.some((stat) => userAskedForStat(stat, textStyle, queryMeta.originalText));

  if (hybridRules?.paths) {
    return inferHybridPath({
      playerChampion,
      archetype,
      hybridRules,
      scan: vulnerabilityScan,
      explicitOffMeta,
      wantsForbidden
    });
  }

  const requiredStats = chooseDefaultStats(archetype, vulnerabilityScan, queryMeta);
  const reasoning = [
    archetype ? `${playerChampion} is classified as ${formatList(archetype.class)} with ${archetype.damageType || "unknown"} damage profile.` : `No local archetype found for ${playerChampion}.`,
    ...reasonFromScan(vulnerabilityScan)
  ];

  if (wantsForbidden) {
    warnings.push("requested_forbidden_stats");
    rejectedPaths.push({
      path: "competitive_forbidden_stats",
      reason: `${playerChampion} has forbidden stats for competitive recommendation: ${formatList(forbiddenStats)}.`
    });
  }

  return {
    recommendedPath: explicitOffMeta && wantsForbidden ? "safe_core_plus_experimental_note" : inferGenericPath(archetype, vulnerabilityScan),
    rejectedPaths,
    reasoning,
    requiredStats,
    forbiddenStats,
    confidence: warnings.length ? "medium" : "high",
    warnings: explicitOffMeta ? [...warnings, "offmeta_mark_experimental"] : warnings
  };
}

function inferHybridPath({ playerChampion, archetype, hybridRules, scan, explicitOffMeta, wantsForbidden }) {
  const strategies = new Set(scan.triggeredStrategies || []);
  const pathScores = Object.entries(hybridRules.paths || {}).map(([pathId, rule]) => {
    const score = (rule.goodAgainst || []).reduce((sum, token) => sum + (strategies.has(token) ? 2 : 0), 0);
    return { pathId, rule, score };
  }).sort((a, b) => b.score - a.score);

  const winner = pathScores[0];
  const rejectedPaths = pathScores.slice(1).map((entry) => ({
    path: entry.pathId,
    reason: entry.pathId === "rhaast" && winner?.pathId === "shadow_assassin"
      ? "Dilutes burst against mostly fragile targets."
      : entry.pathId === "shadow_assassin" && winner?.pathId === "rhaast"
        ? "Pure lethality loses efficiency into frontline, sustain or extended fights."
        : "Lower compatibility with detected enemy profile."
  }));

  return {
    recommendedPath: winner?.pathId === "shadow_assassin"
      ? "shadow_assassin_burst"
      : winner?.pathId === "rhaast"
        ? "rhaast_drain_fighter"
        : winner?.pathId || "adaptive_path",
    rejectedPaths,
    reasoning: [
      `${playerChampion} has hybrid paths.`,
      ...reasonFromScan(scan),
      winner ? `${winner.pathId} matches: ${formatList(winner.rule.goodAgainst)}.` : "No path rule matched strongly."
    ],
    requiredStats: winner?.rule?.preferredStats || archetype?.allowedStats || [],
    forbiddenStats: archetype?.forbiddenStats || [],
    confidence: winner?.score > 0 ? "high" : "medium",
    warnings: [
      ...(scan.warnings || []),
      ...(explicitOffMeta ? ["offmeta_mark_experimental"] : []),
      ...(wantsForbidden ? ["requested_forbidden_stats"] : [])
    ]
  };
}

function chooseDefaultStats(archetype, scan, queryMeta) {
  if (!archetype) return [];
  if (queryMeta.intent === "anti_tank_inference" || scan.triggeredStrategies?.includes("anti_tank_efficiency")) {
    return archetype.damageType === "AP"
      ? ["ability_power", "magic_pen", "ability_haste"]
      : ["attack_damage", "armor_pen", "ability_haste"];
  }
  return archetype.allowedStats || [];
}

function inferGenericPath(archetype, scan) {
  if (!archetype) return "low_confidence_adaptive";
  if (archetype.class?.includes("burst") && archetype.damageType === "AP") return "ap_burst_mage";
  if (scan.triggeredStrategies?.includes("frontloaded_burst") && archetype.damageType === "AD") return "ad_assassin_burst";
  if (scan.triggeredStrategies?.includes("anti_tank_efficiency")) return "anti_tank_sustained_damage";
  return "safe_core";
}

function userAskedForStat(stat, intendedStyle = "", originalText = "") {
  const text = `${intendedStyle} ${originalText}`.toLowerCase();
  const aliases = {
    attack_damage: ["attack damage", "ad", "dano fisico"],
    attack_speed: ["attack speed", "velocidade de ataque", "atk speed"],
    critical_strike: ["critico", "crítico", "crit", "critical"],
    lethality: ["letalidade", "lethality"],
    ability_power: ["ap", "ability power", "poder de habilidade"]
  };
  return [stat.replace(/_/g, " "), ...(aliases[stat] || [])].some((alias) => text.includes(alias));
}

function reasonFromScan(scan = {}) {
  const profile = scan.enemyProfile || {};
  const lines = [];
  if (profile.squishyCount >= 3) lines.push(`Enemy team has ${profile.squishyCount} fragile targets, increasing burst value.`);
  if (profile.tankCount + profile.bruiserCount >= 2) lines.push("Enemy team has enough frontline to increase percent penetration and sustain value.");
  if (profile.sustainLevel >= 2) lines.push("Enemy sustain makes anti-heal more valuable.");
  if (profile.shieldLevel >= 2) lines.push("Enemy shields make anti-shield logic relevant.");
  if (profile.mobilityLevel >= 2) lines.push("Enemy mobility increases value of reliable CC or anti-mobility tools.");
  return lines;
}

function formatList(values = []) {
  return Array.isArray(values) ? values.join(", ") : "";
}

export function shouldRunTheoryEngine(intent) {
  return THEORY_INTENTS.has(intent);
}

export default {
  inferBuildPath,
  shouldRunTheoryEngine
};
