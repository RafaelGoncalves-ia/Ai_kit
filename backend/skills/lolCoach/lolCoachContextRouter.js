const FLASH_INTENTS = new Set([
  "item_against_champion",
  "counter_pick",
  "quick_build",
  "anti_heal",
  "anti_tank",
  "anti_shield",
  "armor",
  "magic_resist",
  "tenacity",
  "rune_suggestion",
  "hybrid_path_selection"
]);

const COMPACT_INTENTS = new Set([
  "explain_champion",
  "explain_item",
  "matchup_explanation",
  "lane_strategy",
  "wave_management",
  "phase_advice",
  "team_comp_analysis",
  "win_condition"
]);

const DETAILED_INTENTS = new Set([
  "lore_detailed",
  "deep_analysis",
  "study_mode",
  "theorycraft_analysis",
  "burst_maximization",
  "anti_tank_inference",
  "vulnerability_scan",
  "offmeta_build_analysis"
]);

export function selectContextLayer({ mode, inGame, intent, urgency } = {}) {
  const fastHighPressure = inGame === true && mode === "fast" && urgency === "high";

  if (fastHighPressure) {
    return "flash";
  }

  if (FLASH_INTENTS.has(intent)) {
    return fastHighPressure ? "flash" : "compact";
  }

  if (COMPACT_INTENTS.has(intent)) {
    return "compact";
  }

  if (DETAILED_INTENTS.has(intent)) {
    return "detailed";
  }

  return "compact";
}

export default {
  selectContextLayer
};
