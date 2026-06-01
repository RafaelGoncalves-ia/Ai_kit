import { normalizeAlias } from "../../skills/lolCoach/lolCoachUpdater.js";
import { analyze as analyzeLol } from "../../skills/lolCoach/lolCoachAnalyzer.js";

const LANES = new Set(["top", "jungle", "mid", "adc", "bot", "support"]);

function ensureEntityState(session) {
  session.activeEntities = session.activeEntities && typeof session.activeEntities === "object"
    ? session.activeEntities
    : {};
  session.activeEntities.league_of_legends = session.activeEntities.league_of_legends || {};
  return session.activeEntities;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function findMentionPositions(text, aliases = {}) {
  const normalizedText = normalizeAlias(text);
  const positions = [];

  for (const [alias, id] of Object.entries(aliases || {})) {
    if (alias.length < 3) continue;
    const index = normalizedText.indexOf(alias);
    if (index >= 0) {
      positions.push({ id, alias, index, length: alias.length });
    }
  }

  return [...new Map(
    positions
      .sort((a, b) => a.index - b.index || b.length - a.length)
      .map((item) => [item.id, item])
  ).values()];
}

function inferPlayerChampionFromText(text, championPositions = []) {
  const normalizedText = normalizeAlias(text);
  const selfMarkers = ["estoude", "jogandode", "voudejogar", "voujogar", "peguei", "pickei", "sou"];

  for (const marker of selfMarkers) {
    const markerIndex = normalizedText.indexOf(marker);
    if (markerIndex < 0) continue;

    const after = championPositions
      .filter((item) => item.index >= markerIndex)
      .sort((a, b) => a.index - b.index)[0];
    if (after) return after.id;
  }

  return null;
}

function inferEnemyFromText(text, championPositions = []) {
  const normalizedText = normalizeAlias(text);
  const enemyMarkers = ["contra", "vs", "versus", "counterde", "counterpara"];

  for (const marker of enemyMarkers) {
    const markerIndex = normalizedText.indexOf(marker);
    if (markerIndex < 0) continue;

    const after = championPositions
      .filter((item) => item.index >= markerIndex)
      .sort((a, b) => a.index - b.index)[0];
    if (after) return after.id;
  }

  return null;
}

function extractListAfterMarkers(text, markers = []) {
  const escaped = markers.map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(?:${escaped})\\s*[:\\-]?\\s*([^?.]+)`, "i");
  const match = text.match(regex);
  return match ? match[1] : "";
}

function buildLolQueryFromEntities(text, entities = {}) {
  const parts = [text];
  const hasChampion = Boolean(entities.currentChampion);
  const enemyChampions = entities.enemyChampions?.length ? entities.enemyChampions : (entities.currentEnemyChampion ? [entities.currentEnemyChampion] : []);
  const hasEnemy = enemyChampions.length > 0;
  const hasLane = Boolean(entities.currentLane);

  if (hasChampion || hasEnemy || hasLane) {
    const matchup = [
      hasChampion ? `estou de ${entities.currentChampion}` : "",
      hasEnemy ? `contra ${enemyChampions.join(", ")}` : "",
      hasLane ? `no ${entities.currentLane}` : ""
    ].filter(Boolean).join(" ");
    parts.push(`Contexto atual de LoL: ${matchup}.`);
  }

  return parts.join("\n");
}

export function updateActiveEntities({ session, text, themeId, lolCoachService } = {}) {
  const state = ensureEntityState(session);
  const now = Date.now();

  if (themeId !== "league_of_legends") {
    return state;
  }

  const lol = state.league_of_legends;
  const championAliases = lolCoachService?.flash?.championAliases || {};
  const itemAliases = lolCoachService?.flash?.itemAliases || {};
  const meta = analyzeLol(text, { championAliases, itemAliases });
  const championPositions = findMentionPositions(text, championAliases);
  const playerChampion = meta.playerChampion || inferPlayerChampionFromText(text, championPositions);
  const manualEnemyText = extractListAfterMarkers(text, ["inimigos", "inimigos sao", "inimigos são", "time inimigo"]);
  const manualEnemies = manualEnemyText ? analyzeLol(manualEnemyText, { championAliases, itemAliases }).championNames : [];
  const enemyChampions = unique([...(meta.enemyChampions || []), ...manualEnemies]);
  const enemyChampion = enemyChampions[0] || inferEnemyFromText(text, championPositions);

  lol.currentGame = "lol";
  lol.lastUpdated = now;
  lol.currentIntent = meta.intent || lol.currentIntent || null;

  if (playerChampion) {
    lol.currentChampion = playerChampion;
    lol.playerChampion = playerChampion;
  } else if (!lol.currentChampion && meta.championNames?.length === 1 && !enemyChampion) {
    lol.currentChampion = meta.championNames[0];
    lol.playerChampion = meta.championNames[0];
  }

  if (enemyChampion) {
    lol.currentEnemyChampion = enemyChampion;
  }

  if (enemyChampions.length) {
    lol.enemyChampions = enemyChampions;
    lol.currentEnemyChampion = enemyChampions[0];
  }

  if (meta.allyChampions?.length) {
    lol.allyChampions = meta.allyChampions;
  }

  if (meta.lane && LANES.has(meta.lane)) {
    lol.currentLane = meta.lane;
    lol.lane = meta.lane;
  }

  if (meta.gamePhase) lol.gamePhase = meta.gamePhase;
  if (meta.gameTime !== null && meta.gameTime !== undefined) lol.gameTime = meta.gameTime;

  if (meta.itemNames?.length) {
    lol.currentItems = unique([...(lol.currentItems || []), ...meta.itemNames]).slice(-6);
  }

  lol.lastMentionedChampions = unique([
    ...(meta.championNames || []),
    ...enemyChampions
  ]);

  return state;
}

export function getThemeEntities(session, themeId) {
  const state = ensureEntityState(session);
  return state[themeId] || {};
}

export function enrichLeagueQueryWithEntities(text, session) {
  const entities = getThemeEntities(session, "league_of_legends");
  return buildLolQueryFromEntities(text, entities);
}

export default {
  updateActiveEntities,
  getThemeEntities,
  enrichLeagueQueryWithEntities
};
