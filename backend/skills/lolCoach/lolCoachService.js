import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { updateData as runUpdate, normalizeAlias } from "./lolCoachUpdater.js";
import { selectContextLayer } from "./lolCoachContextRouter.js";
import { scanVulnerabilities } from "./lolVulnerabilityScanner.js";
import { inferBuildPath } from "./lolBuildPathInferer.js";
import { runTheorycraftAnalysis } from "./lolTheoryEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
const FLASH_DIR = path.join(DATA_DIR, "normalized", "flash");
const COMPACT_DIR = path.join(DATA_DIR, "normalized", "compact");
const DETAILED_DIR = path.join(DATA_DIR, "normalized", "detailed");
const KNOWLEDGE_DIR = path.join(DATA_DIR, "knowledge");
const SCHEMA_VERSION = 1;
const KNOWLEDGE_FILES = [
  "champion_archetypes.json",
  "lane_rules.json",
  "phase_rules.json",
  "matchup_rules.json",
  "item_decision_rules.json",
  "team_comp_rules.json",
  "win_condition_rules.json",
  "rune_decision_rules.json",
  "mechanic_matrix.json",
  "damage_laws.json",
  "class_vulnerability_rules.json",
  "build_path_rules.json",
  "hybrid_champion_rules.json",
  "theorycraft_rules.json",
  "item_logic_rules.json",
  "role_rules.json",
  "threat_rules.json"
];

const EMPTY_CACHE = Object.freeze({});

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function firstPresent(values) {
  return values.find((value) => typeof value === "string" && value.trim()) || null;
}

function formatList(value, limit = 5) {
  if (!Array.isArray(value) || value.length === 0) return "";
  return value.slice(0, limit).join(", ");
}

class LolCoachService {
  constructor() {
    this.manifest = null;
    this.flash = {
      champions: EMPTY_CACHE,
      items: EMPTY_CACHE,
      championAliases: EMPTY_CACHE,
      itemAliases: EMPTY_CACHE
    };
    this.knowledge = {};
    this.runtimeCache = new Map();
    this.compactCache = null;
    this.detailedCache = null;
    this.schemaError = null;
  }

  isReady() {
    return Boolean(this.manifest?.offlineReady) && !this.schemaError;
  }

  getStatus() {
    if (!this.manifest) {
      return {
        ready: false,
        message: "Base do LoL ainda não existe. Use: Kit, atualizar dados do LoL."
      };
    }

    if (this.schemaError) {
      return {
        ready: false,
        patch: this.manifest.patch || null,
        message: "Base do LoL precisa ser regenerada antes de uso.",
        error: this.schemaError
      };
    }

    return {
      ready: true,
      patch: this.manifest.patch,
      lastUpdate: this.manifest.lastUpdate,
      message: `Base do LoL pronta. Patch atual: ${this.manifest.patch}. Última atualização: ${this.manifest.lastUpdate}.`
    };
  }

  async updateData() {
    const result = await runUpdate();

    if (["updated", "already_updated", "success"].includes(result?.status)) {
      try {
        await this.reloadCache();
      } catch (err) {
        return {
          ...result,
          warning: `Base atualizada, mas o reload em RAM falhou: ${err.message}`
        };
      }
    }

    return result;
  }

  async reloadCache() {
    this.clearRuntimeCache();
    this.compactCache = null;
    this.detailedCache = null;
    this.schemaError = null;

    this.manifest = await readJson(MANIFEST_PATH, null);
    if (this.manifest?.schemaVersion && this.manifest.schemaVersion !== SCHEMA_VERSION) {
      this.schemaError = `schemaVersion ${this.manifest.schemaVersion} incompatível com ${SCHEMA_VERSION}`;
      return false;
    }

    await this.loadKnowledgeCache();
    if (this.manifest?.offlineReady) {
      await this.loadFlashCache();
      if (
        Object.keys(this.flash.champions || {}).length === 0 ||
        Object.keys(this.flash.items || {}).length === 0
      ) {
        this.schemaError = "cache flash minimo ausente ou vazio";
        return false;
      }
    }

    return this.isReady();
  }

  async loadFlashCache() {
    const [champions, items, championAliases, itemAliases] = await Promise.all([
      readJson(path.join(FLASH_DIR, "champions_flash.json"), {}),
      readJson(path.join(FLASH_DIR, "items_flash.json"), {}),
      readJson(path.join(FLASH_DIR, "champion_aliases.json"), {}),
      readJson(path.join(FLASH_DIR, "item_aliases.json"), {})
    ]);

    this.flash = {
      champions: champions || {},
      items: items || {},
      championAliases: championAliases || {},
      itemAliases: itemAliases || {}
    };

    return this.flash;
  }

  async loadKnowledgeCache() {
    const entries = await Promise.all(KNOWLEDGE_FILES.map(async (fileName) => {
      const key = fileName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()).replace(/\.json$/, "");
      return [key, await readJson(path.join(KNOWLEDGE_DIR, fileName), {}) || {}];
    }));

    this.knowledge = Object.fromEntries(entries);

    return this.knowledge;
  }

  clearRuntimeCache() {
    this.runtimeCache.clear();
  }

  async loadCompactCache() {
    if (this.compactCache) return this.compactCache;

    const [champions, items, matchup] = await Promise.all([
      readJson(path.join(COMPACT_DIR, "champions_compact.json"), {}),
      readJson(path.join(COMPACT_DIR, "items_compact.json"), {}),
      readJson(path.join(COMPACT_DIR, "matchup_compact.json"), {})
    ]);

    this.compactCache = { champions: champions || {}, items: items || {}, matchup: matchup || {} };
    return this.compactCache;
  }

  async loadDetailedCache() {
    if (this.detailedCache) return this.detailedCache;

    const [champions, items, runes, spells] = await Promise.all([
      readJson(path.join(DETAILED_DIR, "champions_detailed.json"), {}),
      readJson(path.join(DETAILED_DIR, "items_detailed.json"), {}),
      readJson(path.join(DETAILED_DIR, "runes_detailed.json"), []),
      readJson(path.join(DETAILED_DIR, "spells_detailed.json"), {})
    ]);

    this.detailedCache = {
      champions: champions || {},
      items: items || {},
      runes: runes || [],
      spells: spells || {}
    };
    return this.detailedCache;
  }

  resolveChampionAlias(name) {
    return this.resolveAlias(name, this.flash.championAliases);
  }

  resolveItemAlias(name) {
    return this.resolveAlias(name, this.flash.itemAliases);
  }

  resolveAlias(name, aliases = {}) {
    const normalized = normalizeAlias(name);
    if (!normalized) return { id: null, confidence: "none", candidates: [] };

    if (aliases[normalized]) {
      return { id: aliases[normalized], confidence: "high", candidates: [aliases[normalized]] };
    }

    const candidates = Object.entries(aliases)
      .filter(([alias]) => alias.includes(normalized) || normalized.includes(alias))
      .map(([, id]) => id);
    const unique = [...new Set(candidates)];

    if (unique.length === 1) {
      return { id: unique[0], confidence: "medium", candidates: unique };
    }

    return {
      id: null,
      confidence: unique.length > 1 ? "low" : "none",
      candidates: unique.slice(0, 8)
    };
  }

  async findChampion(name, layer = "flash") {
    const resolved = this.resolveChampionAlias(name);
    if (!resolved.id) return { resolved, data: null };
    const cache = await this.getLayerCache(layer);
    return { resolved, data: cache.champions?.[resolved.id] || null };
  }

  async findItem(name, layer = "flash") {
    const resolved = this.resolveItemAlias(name);
    if (!resolved.id) return { resolved, data: null };
    const cache = await this.getLayerCache(layer);
    return { resolved, data: cache.items?.[resolved.id] || null };
  }

  async getLayerCache(layer) {
    if (layer === "detailed") return this.loadDetailedCache();
    if (layer === "compact") return this.loadCompactCache();
    return this.flash;
  }

  getChampionArchetype(championId) {
    return this.knowledge.championArchetypes?.[championId] || null;
  }

  getLaneRules(lane) {
    return this.knowledge.laneRules?.[lane] || null;
  }

  getPhaseRules(gameTimeOrPhase) {
    if (typeof gameTimeOrPhase === "number") {
      if (gameTimeOrPhase < 14) return this.knowledge.phaseRules?.early || null;
      if (gameTimeOrPhase < 25) return this.knowledge.phaseRules?.mid || null;
      return this.knowledge.phaseRules?.late || null;
    }
    return this.knowledge.phaseRules?.[gameTimeOrPhase] || null;
  }

  getMatchupRule(playerChampion, enemyChampion, lane = null) {
    const rule = this.knowledge.matchupRules?.[playerChampion]?.[enemyChampion] || null;
    if (!rule) return null;
    if (lane && rule.lane && rule.lane !== lane) {
      return { ...rule, confidenceWarning: "matchup_rule_lane_mismatch" };
    }
    return rule;
  }

  getItemDecisionContext(queryMeta = {}) {
    const rules = this.knowledge.itemDecisionRules || {};
    const intent = queryMeta.intent;
    const keys = [];
    if (intent === "anti_heal") keys.push("anti_heal");
    if (intent === "anti_tank" || intent === "anti_tank_inference") keys.push("anti_tank");
    if (intent === "anti_shield") keys.push("anti_shield");
    if (intent === "quick_build" || intent === "item_against_champion") keys.push("burst_survival", "snowball_damage", "anti_tank");
    return Object.fromEntries(keys.filter((key) => rules[key]).map((key) => [key, rules[key]]));
  }

  getTeamCompContext(enemyChampions = [], allyChampions = []) {
    const scan = this.runVulnerabilityScan({ enemyChampions, allyChampions });
    const rules = this.knowledge.teamCompRules || {};
    const matched = {};
    for (const strategy of scan.triggeredStrategies || []) {
      if (rules[strategy]) matched[strategy] = rules[strategy];
    }
    if (scan.triggeredStrategies?.includes("squishy_comp") && rules.squishy_comp) matched.squishy_comp = rules.squishy_comp;
    if (scan.triggeredStrategies?.includes("tank_comp") && rules.tank_comp) matched.tank_comp = rules.tank_comp;
    return { scan, rules: matched };
  }

  getWinConditionContext(queryMeta = {}) {
    const rules = this.knowledge.winConditionRules || {};
    const scan = this.runVulnerabilityScan(queryMeta);
    const matched = {};
    if (scan.triggeredStrategies?.includes("frontloaded_burst") && rules.pick_before_objective) {
      matched.pick_before_objective = rules.pick_before_objective;
    }
    if (queryMeta.lane && rules.snowball_lane) matched.snowball_lane = rules.snowball_lane;
    if (rules.front_to_back && scan.enemyProfile?.engageLevel >= 2) matched.front_to_back = rules.front_to_back;
    return matched;
  }

  getRuneDecisionContext(playerChampion, enemyChampion, lane) {
    const archetype = this.getChampionArchetype(playerChampion);
    const matchup = this.getMatchupRule(playerChampion, enemyChampion, lane);
    const rules = this.knowledge.runeDecisionRules || {};
    const matched = {};
    for (const [key, rule] of Object.entries(rules)) {
      const classes = new Set(archetype?.class || []);
      if ((rule.archetype || []).some((token) => classes.has(token) || archetype?.tradingPattern === token)) {
        matched[key] = rule;
      }
    }
    if (Array.isArray(matchup?.runes)) {
      for (const key of matchup.runes) {
        if (rules[key]) matched[key] = rules[key];
      }
    }
    return matched;
  }

  runVulnerabilityScan(queryMeta = {}) {
    return scanVulnerabilities(queryMeta, this.knowledge);
  }

  inferBuildPath(queryMeta = {}) {
    return inferBuildPath(queryMeta, this.knowledge);
  }

  runTheorycraftAnalysis(queryMeta = {}) {
    return runTheorycraftAnalysis(queryMeta, this.knowledge);
  }

  buildMatchKnowledgeContext(queryMeta = {}) {
    const playerChampion = queryMeta.playerChampion || queryMeta.championNames?.[0] || null;
    const enemyChampion = queryMeta.enemyChampions?.[0] || null;
    const lane = queryMeta.lane || null;
    const phase = queryMeta.gamePhase || queryMeta.gameTime || null;

    const context = {
      championArchetype: playerChampion ? this.getChampionArchetype(playerChampion) : null,
      enemyArchetypes: Object.fromEntries((queryMeta.enemyChampions || []).map((id) => [id, this.getChampionArchetype(id)]).filter(([, value]) => value)),
      laneRules: lane ? this.getLaneRules(lane) : null,
      phaseRules: phase ? this.getPhaseRules(phase) : null,
      matchupRule: playerChampion && enemyChampion ? this.getMatchupRule(playerChampion, enemyChampion, lane) : null,
      itemDecision: this.getItemDecisionContext(queryMeta),
      teamComp: queryMeta.enemyChampions?.length ? this.getTeamCompContext(queryMeta.enemyChampions, queryMeta.allyChampions || []) : null,
      winCondition: this.getWinConditionContext(queryMeta),
      runeDecision: playerChampion ? this.getRuneDecisionContext(playerChampion, enemyChampion, lane) : {}
    };

    if (/tank suporte|suporte tank|support tank|tank support/i.test(String(queryMeta.intendedStyle || queryMeta.originalText || ""))) {
      context.supportTankCandidates = Object.values(this.knowledge.championArchetypes || {})
        .filter((entry) => entry?.primaryRoles?.includes("support") && entry?.class?.includes("support_tank"))
        .map((entry) => entry.id);
    }

    return context;
  }

  buildTheoryContext(queryMeta = {}) {
    const theoryIntents = new Set([
      "theorycraft_analysis",
      "burst_maximization",
      "anti_tank_inference",
      "vulnerability_scan",
      "hybrid_path_selection",
      "offmeta_build_analysis",
      "quick_build",
      "rune_suggestion",
      "win_condition",
      "team_comp_analysis"
    ]);

    if (!theoryIntents.has(queryMeta.intent)) {
      return null;
    }

    if (["quick_build", "rune_suggestion", "win_condition", "team_comp_analysis"].includes(queryMeta.intent)) {
      return {
        vulnerabilityScan: this.runVulnerabilityScan(queryMeta),
        buildPath: this.inferBuildPath(queryMeta)
      };
    }

    return this.runTheorycraftAnalysis(queryMeta);
  }

  async getFlashContext(queryMeta = {}) {
    return this.buildContextForLayer("flash", queryMeta);
  }

  async getCompactContext(queryMeta = {}) {
    return this.buildContextForLayer("compact", queryMeta);
  }

  async getDetailedContext(queryMeta = {}) {
    return this.buildContextForLayer("detailed", queryMeta);
  }

  async getContextForQuery(queryMeta = {}) {
    const layer = selectContextLayer(queryMeta);
    if (layer === "detailed") return this.getDetailedContext(queryMeta);
    if (layer === "flash") return this.getFlashContext(queryMeta);
    return this.getCompactContext(queryMeta);
  }

  async buildRuntimeContext(queryMeta = {}) {
    if (!this.isReady()) {
      return {
        skill: "lolCoach",
        ready: false,
        message: this.getStatus().message
      };
    }

    return this.getContextForQuery(queryMeta);
  }

  async buildContextForLayer(layer, queryMeta = {}) {
    const cache = await this.getLayerCache(layer);
    const championNames = [...new Set([
      queryMeta.playerChampion,
      ...(queryMeta.enemyChampions || []),
      ...(queryMeta.championNames || [])
    ].filter(Boolean))];
    const itemNames = [...new Set([...(queryMeta.itemNames || [])].filter(Boolean))];

    const champions = [];
    for (const name of championNames) {
      const found = await this.findChampion(name, layer);
      if (found.data) champions.push(found.data);
    }

    const items = [];
    for (const name of itemNames) {
      const found = await this.findItem(name, layer);
      if (found.data) items.push(found.data);
    }

    const entities = {
      championNames,
      itemNames,
      lane: queryMeta.lane || null,
      playerChampion: queryMeta.playerChampion || null,
      enemyChampions: queryMeta.enemyChampions || [],
      allyChampions: queryMeta.allyChampions || [],
      gamePhase: queryMeta.gamePhase || null,
      gameTime: queryMeta.gameTime ?? null,
      intendedStyle: queryMeta.intendedStyle || null,
      impliedEnemyProfile: queryMeta.impliedEnemyProfile || null
    };

    const matchKnowledge = this.buildMatchKnowledgeContext(queryMeta);
    const theoryContext = this.buildTheoryContext(queryMeta);
    const validation = this.validateTacticalQuery(queryMeta);
    const contextText = this.renderContextText({
      layer,
      intent: queryMeta.intent,
      champions,
      items,
      cache,
      entities,
      matchKnowledge,
      theoryContext,
      validation
    });

    return {
      skill: "lolCoach",
      layer,
      intent: queryMeta.intent || "unknown",
      entities,
      contextText,
      matchKnowledge,
      theoryContext,
      validation,
      responseConstraints: this.getResponseConstraints(layer),
      sourcePatch: this.manifest?.patch || null,
      personalityPolicy: "use_current_kit_route_personality"
    };
  }

  getResponseConstraints(layer) {
    if (layer === "flash") {
      return {
        maxSentences: 2,
        preferShortAnswer: true,
        avoidLongExplanation: true
      };
    }

    if (layer === "detailed") {
      return {
        allowLongAnswer: true
      };
    }

    return {
      maxSentences: 6,
      preferShortAnswer: false
    };
  }

  validateTacticalQuery(queryMeta = {}) {
    const warnings = [];
    const requiresChampion = new Set(["quick_build", "rune_suggestion", "hybrid_path_selection", "offmeta_build_analysis", "burst_maximization"]);
    const requiresLane = new Set(["counter_pick", "matchup_explanation", "lane_strategy", "wave_management"]);
    const playerChampion = queryMeta.playerChampion || queryMeta.championNames?.[0] || null;

    if (requiresChampion.has(queryMeta.intent) && !playerChampion) {
      warnings.push({
        code: "missing_player_champion",
        message: "Build/rune/path question needs the current champion or should be answered with low confidence."
      });
    }

    if (requiresLane.has(queryMeta.intent) && !queryMeta.lane) {
      warnings.push({
        code: "missing_lane",
        message: "Counter or lane advice without lane should ask for lane or mark low confidence."
      });
    }

    const archetype = playerChampion ? this.getChampionArchetype(playerChampion) : null;
    if (archetype?.forbiddenStats?.length && queryMeta.intendedStyle) {
      const style = String(queryMeta.intendedStyle).toLowerCase();
      const forbiddenHit = archetype.forbiddenStats.find((stat) => this.userAskedForStat(stat, `${style} ${queryMeta.originalText || ""}`));
      if (forbiddenHit) {
        warnings.push({
          code: "forbidden_stat_collision",
          message: `${playerChampion} has ${forbiddenHit} as forbidden competitive stat. Treat as experimental/off-meta only.`
        });
      }
    }

    return {
      confidence: warnings.length ? "low_or_conditional" : "normal",
      warnings
    };
  }

  userAskedForStat(stat, text = "") {
    const lower = String(text || "").toLowerCase();
    const aliases = {
      attack_damage: ["attack damage", "ad", "dano fisico"],
      attack_speed: ["attack speed", "velocidade de ataque", "atk speed"],
      critical_strike: ["critico", "crítico", "crit", "critical"],
      lethality: ["letalidade", "lethality"],
      ability_power: ["ap", "ability power", "poder de habilidade"]
    };
    return [stat.replace(/_/g, " "), ...(aliases[stat] || [])].some((alias) => lower.includes(alias));
  }

  renderContextText({ layer, intent, champions, items, cache, entities, matchKnowledge, theoryContext, validation }) {
    const lines = [
      `Contexto tecnico local de League of Legends (${layer}).`,
      `Patch Data Dragon: ${this.manifest?.patch || "desconhecido"}.`,
      `Intent detectada: ${intent || "unknown"}.`
    ];

    if (entities.lane) lines.push(`Rota/lane mencionada: ${entities.lane}.`);
    if (entities.playerChampion) lines.push(`Campeao do usuario: ${entities.playerChampion}.`);
    if (entities.enemyChampions?.length) lines.push(`Inimigos conhecidos: ${formatList(entities.enemyChampions, 8)}.`);

    for (const champion of champions) {
      lines.push(this.renderChampionLine(champion, layer));
    }

    for (const item of items) {
      lines.push(this.renderItemLine(item, layer));
    }

    if (layer === "detailed") {
      const runeCount = Array.isArray(cache.runes) ? cache.runes.length : 0;
      const spellCount = Object.keys(cache.spells || {}).length;
      lines.push(`Base detalhada disponivel: ${runeCount} arvores de runas e ${spellCount} summoner spells.`);
    }

    if (matchKnowledge?.championArchetype) {
      const archetype = matchKnowledge.championArchetype;
      lines.push(`Arquetipo local: dano=${archetype.damageType || "n/a"} classe=${formatList(archetype.class, 8)} stats permitidos=${formatList(archetype.allowedStats, 8)} stats proibidos=${formatList(archetype.forbiddenStats, 8)}.`);
    }

    if (matchKnowledge?.matchupRule) {
      const rule = matchKnowledge.matchupRule;
      lines.push(`Matchup rule: dificuldade=${rule.difficulty || "n/a"} conselho=${rule.shortAdvice || ""} evitar=${formatList(rule.avoid, 5)}.`);
    }

    if (matchKnowledge?.laneRules) {
      lines.push(`Lane rules (${matchKnowledge.laneRules.lane}): objetivos=${formatList(matchKnowledge.laneRules.goals, 5)} erros comuns=${formatList(matchKnowledge.laneRules.commonMistakes, 4)}.`);
    }

    if (matchKnowledge?.supportTankCandidates?.length) {
      lines.push(`Candidatos locais de tank suporte: ${formatList(matchKnowledge.supportTankCandidates, 8)}. Se sugerir off-role como Sejuani/Malphite suporte, marcar como off-meta e pedir contexto.`);
    }

    if (theoryContext?.recommendedPath || theoryContext?.buildPath?.recommendedPath) {
      const build = theoryContext.buildPath || theoryContext;
      lines.push(`Inferencia de build: caminho=${build.recommendedPath || "n/a"} stats=${formatList(build.requiredStats, 8)} rejeitados=${formatList((build.rejectedPaths || []).map((item) => item.path), 5)} confianca=${build.confidence || "n/a"}.`);
      if (build.forbiddenStats?.length) lines.push(`Validacao tatica: nao apresentar como competitivo stats proibidos: ${formatList(build.forbiddenStats, 8)}.`);
    }

    if (theoryContext?.triggeredStrategies?.length || theoryContext?.vulnerabilityScan?.triggeredStrategies?.length) {
      const strategies = theoryContext.triggeredStrategies || theoryContext.vulnerabilityScan.triggeredStrategies;
      lines.push(`Estrategias detectadas: ${formatList(strategies, 8)}.`);
    }

    if (validation?.warnings?.length) {
      for (const warning of validation.warnings) {
        lines.push(`Aviso de validacao: ${warning.code} - ${warning.message}`);
      }
    }

    lines.push("Use apenas este contexto local para LoL quando ele for suficiente; nao assuma dados atuais fora do patch informado.");
    return lines.filter(Boolean).join("\n");
  }

  renderChampionLine(champion, layer) {
    if (layer === "detailed") {
      return [
        `Campeao ${champion.name} (${champion.id}): ${champion.title}.`,
        `Tags: ${formatList(champion.tags)}. Recurso: ${champion.partype || "n/a"}.`,
        `Passiva: ${champion.passive?.name || "n/a"}. Skills: ${formatList((champion.spells || []).map((spell) => spell.name), 6)}.`,
        champion.blurb ? `Resumo: ${champion.blurb}` : ""
      ].filter(Boolean).join(" ");
    }

    if (layer === "compact") {
      return `Campeao ${champion.name} (${champion.id}): ${champion.title}. Tags: ${formatList(champion.tags)}. Passiva: ${champion.passiveName || "n/a"}. Skills: ${formatList(champion.spellNames, 6)}. ${champion.shortDescription || ""}`.trim();
    }

    return [
      `Campeao ${champion.name} (${champion.id}).`,
      `Tags: ${formatList(champion.tags)}.`,
      `Roles provaveis: ${formatList(champion.likelyRoles)}.`,
      `Dano: ${champion.damageProfile || "n/a"}.`,
      firstPresent([
        formatList(champion.threatHints),
        formatList(champion.weaknessHints),
        champion.shortAdvice
      ])
    ].filter(Boolean).join(" ");
  }

  renderItemLine(item, layer) {
    if (layer === "detailed") {
      return `Item ${item.name} (${item.id}): ${item.plaintext || item.description || ""} Ouro: ${item.gold?.total ?? "n/a"}. Tags: ${formatList(item.tags)}.`;
    }

    if (layer === "compact") {
      return `Item ${item.name} (${item.id}): ${item.plaintext || ""} Ouro: ${item.goldTotal ?? "n/a"}. Tags: ${formatList(item.tags)}.`;
    }

    return `Item ${item.name} (${item.id}): ${item.quickUse || ""} Ouro: ${item.goldTotal ?? "n/a"}. Contra/uso rapido: ${formatList(item.countersHints)}.`;
  }
}

const service = new LolCoachService();
export default service;
