import { normalizeAlias } from "./lolCoachUpdater.js";

const UPDATE_PATTERNS = [
  /kit,\s*atualizar dados do lol/i,
  /kit,\s*atualizar base do lol/i,
  /kit,\s*atualizar campeoes e itens do lol/i,
  /kit,\s*atualizar campeões e itens do lol/i
];

const TRIGGER_PATTERNS = [
  /\blol\b/i,
  /\bleague of legends\b/i,
  /\bcampe[aã]o\b/i,
  /\bchampion\b/i,
  /\bitem contra\b/i,
  /\bbuild contra\b/i,
  /\bcounter\b/i,
  /\bruna\b/i,
  /\brunas\b/i,
  /\bbuild\b/i,
  /\bpartida nova\b/i,
  /\bestou de\b/i,
  /\btime inimigo\b/i,
  /\binimigos s[aã]o\b/i,
  /\binimigos:/i,
  /\batualizar dados do lol\b/i,
  /\batualizar base do lol\b/i,
  /\batualizar campe[oõ]es e itens do lol\b/i
];

const LANES = ["top", "jungle", "jg", "mid", "adc", "bot", "support", "sup", "suporte"];

function stripAccents(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(text) {
  return stripAccents(text).toLowerCase();
}

export function isLolCoachText(text = "") {
  return TRIGGER_PATTERNS.some((pattern) => pattern.test(text));
}

export function isUpdateCommand(text = "") {
  return UPDATE_PATTERNS.some((pattern) => pattern.test(text));
}

function detectIntent(text, lower) {
  if (isUpdateCommand(text)) return "update_database";
  if (/\b(build criminosa|build absurda|fora do meta|off[- ]?meta|caminho alternativo)\b/i.test(lower)) return "offmeta_build_analysis";
  if (/\b(maior dano explosivo|maior burst|dano maximo|dano máximo|burst maximo|burst máximo|explodir alvo)\b/i.test(lower)) return "burst_maximization";
  if (/\b(teoria|theorycraft|combinacao improvavel|combinação improvável|sinergia oculta|matematica|matemática)\b/i.test(lower)) return "theorycraft_analysis";
  if (/\b(derreter|anti tank por inferencia|anti-tank por inferencia)\b/i.test(lower)) return "anti_tank_inference";
  if (/\b(vulnerabilidade|scan|scanner|pontos fracos do time)\b/i.test(lower)) return "vulnerability_scan";
  if (/\b(qual forma|forma do kayn|azul ou vermelho|rhaast|shadow assassin|assassino das sombras)\b/i.test(lower)) return "hybrid_path_selection";
  if (/\b(condicao de vitoria|condição de vitória|win condition|meu foco|qual meu foco)\b/i.test(lower)) return "win_condition";
  if (/\b(tank suporte|suporte tank|support tank|tank support)\b/i.test(lower)) return "counter_pick";
  if (/\b(composicao|composição|team comp|time inimigo|inimigos sao|inimigos são|inimigos:)\b/i.test(lower)) return "team_comp_analysis";
  if (/\b(como jogo essa lane|jogar essa lane|wave|wave management|controle de wave)\b/i.test(lower)) return "wave_management";
  if (/\b(lane strategy|estrategia de lane|estratégia de lane|como jogo contra)\b/i.test(lower)) return "lane_strategy";
  if (/\b(early|mid game|late game|fase do jogo|aos \d+ ?min)\b/i.test(lower)) return "phase_advice";
  if (/\b(historia|lore|me explica completo|detalhado)\b/i.test(lower)) return "lore_detailed";
  if (/\b(estudo|study|aprender a fundo|guia completo)\b/i.test(lower)) return "study_mode";
  if (/\b(analise profunda|deep analysis|detalha o matchup)\b/i.test(lower)) return "deep_analysis";
  if (/\b(anti ?heal|corta cura|cortar cura|feridas dolorosas)\b/i.test(lower)) return "anti_heal";
  if (/\b(anti ?tank|contra tank|tanque)\b/i.test(lower)) return "anti_tank";
  if (/\b(anti ?shield|escudo|quebra escudo)\b/i.test(lower)) return "anti_shield";
  if (/\b(armor|armadura|defesa fisica)\b/i.test(lower)) return "armor";
  if (/\b(resistencia magica|mr|magic resist)\b/i.test(lower)) return "magic_resist";
  if (/\b(tenacidade|tenacity|controle de grupo|cc)\b/i.test(lower)) return "tenacity";
  if (/\b(qual item|item contra|o que faco contra)\b/i.test(lower)) return "item_against_champion";
  if (/\b(qual runa|runa|runas)\b/i.test(lower)) return "rune_suggestion";
  if (/\b(build|build contra|buildo|comprar|loja)\b/i.test(lower)) return "quick_build";
  if (/\b(contra|counter|qual campeao pego|quem eu escolho|pick|ban)\b/i.test(lower)) return "counter_pick";
  if (/\b(matchup|rota contra|lane contra)\b/i.test(lower)) return "matchup_explanation";
  if (/\b(item|itens)\b/i.test(lower)) return "explain_item";
  if (/\b(campeao|champion|skill|habilidade|passiva)\b/i.test(lower)) return "explain_champion";
  return "explain_champion";
}

function extractGameTime(lower) {
  const match = lower.match(/\b(?:aos|com)?\s*(\d{1,2})\s*(?:min|m|minutos?)\b/i);
  return match ? Number(match[1]) : null;
}

function extractGamePhase(lower) {
  if (/\bearly\b|inicio|início/.test(lower)) return "early";
  if (/\bmid game\b|meio de jogo/.test(lower)) return "mid";
  if (/\blate\b|fim de jogo/.test(lower)) return "late";
  const minutes = extractGameTime(lower);
  if (minutes === null) return null;
  if (minutes < 14) return "early";
  if (minutes < 25) return "mid";
  return "late";
}

function extractImpliedEnemyProfile(lower) {
  const squishy = lower.match(/\b(\d+)\s+(?:bonecos?|alvos?|campeoes?|campeões?)\s+frageis\b/i);
  const tanks = lower.match(/\b(\d+)\s+(?:tanks?|tanques?|frontlines?)\b/i);
  return {
    squishyCount: squishy ? Number(squishy[1]) : 0,
    tankCount: tanks ? Number(tanks[1]) : 0
  };
}

function extractLane(lower) {
  for (const lane of LANES) {
    if (new RegExp(`\\b${lane}\\b`, "i").test(lower)) {
      if (lane === "jg") return "jungle";
      if (lane === "sup" || lane === "suporte") return "support";
      return lane;
    }
  }
  return null;
}

function collectKnownNames(text, aliases = {}) {
  const normalizedText = normalizeAlias(text);
  const comparableText = normalizeText(text);
  if (!normalizedText) return [];

  const matches = [];
  for (const [alias, id] of Object.entries(aliases || {})) {
    if (alias.length < 3) continue;
    const safeMatch = alias.length <= 4
      ? new RegExp(`(^|[^a-z0-9])${alias}([^a-z0-9]|$)`, "i").test(comparableText)
      : normalizedText.includes(alias);
    if (safeMatch) {
      matches.push({ id, alias, length: alias.length });
    }
  }

  return [...new Map(
    matches
      .sort((a, b) => b.length - a.length)
      .map((match) => [match.id, match.id])
  ).values()].slice(0, 8);
}

function extractAgainstSegments(text) {
  const segments = [];
  const regex = /\b(?:contra|counter de|counter para|vs\.?|versus)\s+([^?.]+)/gi;
  let match;
  while ((match = regex.exec(text))) {
    segments.push(match[1].trim());
  }
  return segments;
}

function extractListAfterMarkers(text, markers = []) {
  const escaped = markers.map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(?:${escaped})\\s*[:\\-]?\\s*([^?.]+)`, "i");
  const match = text.match(regex);
  return match ? match[1] : "";
}

export function analyze(text = "", options = {}) {
  const lower = normalizeText(text);
  const intent = detectIntent(text, lower);
  const highPressure = /\b(rapido|rápido|agora|na partida|durante o jogo|loja|fight|pick|ban)\b/i.test(text);
  const inGame = /\b(na partida|durante o jogo|loja|fight|agora)\b/i.test(text);
  const detailed = /\b(historia|lore|me explica completo|detalhado|estudo|study|analise profunda)\b/i.test(lower);
  const mode = highPressure ? "fast" : detailed ? "deep" : "normal";
  const championNames = collectKnownNames(text, options.championAliases);
  const itemNames = collectKnownNames(text, options.itemAliases);
  const enemyText = [
    extractAgainstSegments(text).join(" "),
    extractListAfterMarkers(text, ["inimigos", "inimigos sao", "inimigos são", "time inimigo"])
  ].join(" ");
  const allyText = extractListAfterMarkers(text, ["aliados", "meu time", "time aliado"]);
  const enemyChampions = collectKnownNames(enemyText, options.championAliases);
  const allyChampions = collectKnownNames(allyText, options.championAliases);
  const lowerOriginal = lower;

  return {
    intent,
    championNames,
    itemNames,
    lane: extractLane(lower),
    playerChampion: championNames.find((name) => !enemyChampions.includes(name)) || null,
    enemyChampions,
    allyChampions,
    gamePhase: extractGamePhase(lowerOriginal),
    gameTime: extractGameTime(lowerOriginal),
    impliedEnemyProfile: extractImpliedEnemyProfile(lowerOriginal),
    intendedStyle: /tank suporte|suporte tank|support tank|tank support|ad|critico|crítico|letalidade|ap|tank|burst|off[- ]?meta|fora do meta/i.exec(text)?.[0] || null,
    offMeta: /\b(off[- ]?meta|fora do meta|build criminosa|build absurda|experimental)\b/i.test(lowerOriginal),
    inGame,
    urgency: highPressure ? "high" : "normal",
    mode,
    originalText: text
  };
}

export default {
  analyze,
  isLolCoachText,
  isUpdateCommand
};
