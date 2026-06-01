import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const RAW_DIR = path.join(DATA_DIR, "raw");
const NORMALIZED_DIR = path.join(DATA_DIR, "normalized");
const KNOWLEDGE_DIR = path.join(DATA_DIR, "knowledge");
const TMP_DIR = path.join(DATA_DIR, ".tmp_update");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
const LOCALE = "pt_BR";
const SOURCE = "riot-datadragon";
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

const RAW_ENDPOINTS = {
  "champion.json": (version) => `https://ddragon.leagueoflegends.com/cdn/${version}/data/${LOCALE}/champion.json`,
  "item.json": (version) => `https://ddragon.leagueoflegends.com/cdn/${version}/data/${LOCALE}/item.json`,
  "runesReforged.json": (version) => `https://ddragon.leagueoflegends.com/cdn/${version}/data/${LOCALE}/runesReforged.json`,
  "summoner.json": (version) => `https://ddragon.leagueoflegends.com/cdn/${version}/data/${LOCALE}/summoner.json`
};

export function normalizeAlias(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''.\-]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function sanitizeRiotText(input) {
  let text = String(input || "");
  if (!text) return "";

  text = text
    .replace(/<\s*br\s*\/?\s*>/gi, ". ")
    .replace(/<\s*\/?\s*(li|p|div)\s*[^>]*>/gi, ". ")
    .replace(/<\s*\/?\s*(mainText|stats|attention|passive|active|rarityGeneric|speed|scaleLevel)\s*[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const entities = {
    "&nbsp;": " ",
    "&#160;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#34;": "\"",
    "&apos;": "'",
    "&#39;": "'"
  };

  text = text.replace(/&(nbsp|amp|lt|gt|quot|apos);|&#(160|34|39);/gi, (match) => {
    const lower = match.toLowerCase();
    return entities[lower] ?? match;
  });

  return text
    .replace(/\s*([.!?])\s*(?=[.!?])/g, "$1 ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?])\s*([A-ZÀ-Ý])/g, "$1 $2")
    .replace(/^\s*[.]\s*/, "")
    .trim();
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function ensureKnowledgeFiles() {
  await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
  for (const fileName of KNOWLEDGE_FILES) {
    const filePath = path.join(KNOWLEDGE_DIR, fileName);
    if (!(await exists(filePath))) {
      await writeJson(filePath, {});
    }
  }
}

async function loadKnowledge() {
  await ensureKnowledgeFiles();
  const entries = await Promise.all(KNOWLEDGE_FILES.map(async (fileName) => {
    const key = fileName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()).replace(/\.json$/, "");
    return [key, await readJson(path.join(KNOWLEDGE_DIR, fileName), {})];
  }));

  return Object.fromEntries(entries);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, attempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "accept": "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Falha HTTP ${response.status} em ${url}`);
      }

      return response.json();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await wait(500 * attempt);
      }
    }
  }

  throw lastError;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchChampionDataset(version) {
  const championList = await fetchJson(RAW_ENDPOINTS["champion.json"](version));
  const championIds = Object.keys(championList?.data || {});

  const detailedEntries = await mapWithConcurrency(championIds, 6, async (championId) => {
    const detailUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/data/${LOCALE}/champion/${championId}.json`;
    const detail = await fetchJson(detailUrl);
    return [championId, detail?.data?.[championId] || championList.data[championId]];
  });

  return {
    ...championList,
    data: Object.fromEntries(detailedEntries)
  };
}

async function getLatestVersion() {
  const versions = await fetchJson("https://ddragon.leagueoflegends.com/api/versions.json");
  if (!Array.isArray(versions) || !versions[0]) {
    throw new Error("Lista de versoes do Data Dragon invalida.");
  }
  return versions[0];
}

function inferDamageProfile(champion) {
  const info = champion.info || {};
  const attack = Number(info.attack || 0);
  const magic = Number(info.magic || 0);
  if (attack >= magic + 2) return "physical";
  if (magic >= attack + 2) return "magic";
  return "mixed";
}

function inferLikelyRoles(champion) {
  const tags = new Set(champion.tags || []);
  const roles = [];
  if (tags.has("Marksman")) roles.push("adc");
  if (tags.has("Support")) roles.push("support");
  if (tags.has("Mage")) roles.push("mid");
  if (tags.has("Assassin")) roles.push("mid");
  if (tags.has("Fighter")) roles.push("top", "jungle");
  if (tags.has("Tank")) roles.push("top", "support", "jungle");
  return [...new Set(roles)].slice(0, 3);
}

function buildChampionLayers(championJson, knowledge) {
  const championsFlash = {};
  const championsCompact = {};
  const championsDetailed = {};
  const championAliases = {};

  for (const champion of Object.values(championJson.data || {})) {
    const id = champion.id;
    const spellNames = (champion.spells || []).map((spell) => spell.name).filter(Boolean);
    const passive = champion.passive || {};

    championsDetailed[id] = {
      id,
      key: champion.key,
      name: champion.name,
      title: champion.title,
      tags: champion.tags || [],
      partype: champion.partype || "",
      stats: champion.stats || {},
      passive: {
        name: passive.name || "",
        description: sanitizeRiotText(passive.description || "")
      },
      spells: (champion.spells || []).map((spell) => ({
        id: spell.id,
        name: spell.name,
        description: sanitizeRiotText(spell.description || ""),
        tooltip: sanitizeRiotText(spell.tooltip || ""),
        cooldown: spell.cooldown,
        cost: spell.cost,
        range: spell.range,
        maxrank: spell.maxrank
      })),
      lore: sanitizeRiotText(champion.lore || ""),
      blurb: sanitizeRiotText(champion.blurb || "")
    };

    const riotChampionCompactData = {
      id,
      name: champion.name,
      title: champion.title,
      tags: champion.tags || [],
      partype: champion.partype || "",
      shortDescription: sanitizeRiotText(champion.blurb || ""),
      passiveName: passive.name || "",
      spellNames
    };

    championsCompact[id] = {
      ...riotChampionCompactData,
      ...(knowledge.championArchetypes?.[id] || {}),
      ...(knowledge.matchupRules[id] || {}),
      ...(knowledge.roleRules[id] || {}),
      ...(knowledge.threatRules[id] || {})
    };

    const riotChampionFlashData = {
      id,
      name: champion.name,
      tags: champion.tags || [],
      likelyRoles: inferLikelyRoles(champion),
      damageProfile: inferDamageProfile(champion),
      threatHints: [],
      weaknessHints: [],
      shortAdvice: sanitizeRiotText(champion.blurb || "").slice(0, 220)
    };

    championsFlash[id] = {
      ...riotChampionFlashData,
      ...(knowledge.championArchetypes?.[id] || {}),
      ...(knowledge.matchupRules[id] || {}),
      ...(knowledge.roleRules[id] || {}),
      ...(knowledge.threatRules[id] || {})
    };

    championAliases[normalizeAlias(champion.name)] = id;
    championAliases[normalizeAlias(id)] = id;
  }

  championAliases.wukong = "MonkeyKing";
  championAliases.monkeyking = "MonkeyKing";

  return { championsFlash, championsCompact, championsDetailed, championAliases };
}

function buildItemLayers(itemJson, knowledge) {
  const itemsFlash = {};
  const itemsCompact = {};
  const itemsDetailed = {};
  const itemAliases = {};

  for (const [id, item] of Object.entries(itemJson.data || {})) {
    const name = item.name || id;
    const description = sanitizeRiotText(item.description || "");
    const plaintext = sanitizeRiotText(item.plaintext || "");
    const tags = item.tags || [];
    const goldTotal = Number(item.gold?.total || 0);

    itemsDetailed[id] = {
      id,
      name,
      description,
      plaintext,
      gold: item.gold || {},
      tags,
      stats: item.stats || {},
      maps: item.maps || {},
      into: item.into || [],
      from: item.from || []
    };

    const riotItemCompactData = {
      id,
      name,
      plaintext,
      tags,
      goldTotal,
      stats: item.stats || {}
    };

    itemsCompact[id] = {
      ...riotItemCompactData,
      ...(knowledge.itemDecisionRules?.[id] || {}),
      ...(knowledge.itemLogicRules[id] || {})
    };

    const riotItemFlashData = {
      id,
      name,
      tags,
      goldTotal,
      quickUse: plaintext || description.slice(0, 180),
      countersHints: []
    };

    itemsFlash[id] = {
      ...riotItemFlashData,
      ...(knowledge.itemDecisionRules?.[id] || {}),
      ...(knowledge.itemLogicRules[id] || {})
    };

    itemAliases[normalizeAlias(name)] = id;
    itemAliases[normalizeAlias(id)] = id;
  }

  return { itemsFlash, itemsCompact, itemsDetailed, itemAliases };
}

async function generateNormalized(tmpRawDir, tmpNormalizedDir) {
  const knowledge = await loadKnowledge();
  const championJson = await readJson(path.join(tmpRawDir, "champion.json"));
  const itemJson = await readJson(path.join(tmpRawDir, "item.json"));
  const runesJson = await readJson(path.join(tmpRawDir, "runesReforged.json"), []);
  const summonerJson = await readJson(path.join(tmpRawDir, "summoner.json"), {});

  if (!championJson?.data || !itemJson?.data) {
    throw new Error("Raw Data Dragon incompleto.");
  }

  const championLayers = buildChampionLayers(championJson, knowledge);
  const itemLayers = buildItemLayers(itemJson, knowledge);

  await writeJson(path.join(tmpNormalizedDir, "flash", "champions_flash.json"), championLayers.championsFlash);
  await writeJson(path.join(tmpNormalizedDir, "flash", "items_flash.json"), itemLayers.itemsFlash);
  await writeJson(path.join(tmpNormalizedDir, "flash", "champion_aliases.json"), championLayers.championAliases);
  await writeJson(path.join(tmpNormalizedDir, "flash", "item_aliases.json"), itemLayers.itemAliases);

  await writeJson(path.join(tmpNormalizedDir, "compact", "champions_compact.json"), championLayers.championsCompact);
  await writeJson(path.join(tmpNormalizedDir, "compact", "items_compact.json"), itemLayers.itemsCompact);
  await writeJson(path.join(tmpNormalizedDir, "compact", "matchup_compact.json"), knowledge.matchupRules || {});

  await writeJson(path.join(tmpNormalizedDir, "detailed", "champions_detailed.json"), championLayers.championsDetailed);
  await writeJson(path.join(tmpNormalizedDir, "detailed", "items_detailed.json"), itemLayers.itemsDetailed);
  await writeJson(path.join(tmpNormalizedDir, "detailed", "runes_detailed.json"), runesJson);
  await writeJson(path.join(tmpNormalizedDir, "detailed", "spells_detailed.json"), summonerJson.data || {});
}

async function validateUpdate(tmpRawDir, tmpNormalizedDir) {
  const required = [
    path.join(tmpRawDir, "champion.json"),
    path.join(tmpRawDir, "item.json"),
    path.join(tmpNormalizedDir, "flash", "champions_flash.json"),
    path.join(tmpNormalizedDir, "flash", "items_flash.json"),
    path.join(tmpNormalizedDir, "detailed", "champions_detailed.json"),
    path.join(tmpNormalizedDir, "detailed", "items_detailed.json")
  ];

  for (const filePath of required) {
    const data = await readJson(filePath);
    if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
      throw new Error(`Arquivo minimo invalido: ${filePath}`);
    }
  }
}

async function moveIfExists(source, target) {
  if (await exists(source)) {
    await fs.rm(target, { recursive: true, force: true });
    await fs.rename(source, target);
  }
}

async function replaceDataDirectories(tmpRawDir, tmpNormalizedDir, nextManifest) {
  const backupDir = path.join(DATA_DIR, ".backup_update");
  const backupRawDir = path.join(backupDir, "raw");
  const backupNormalizedDir = path.join(backupDir, "normalized");

  await fs.rm(backupDir, { recursive: true, force: true });
  await fs.mkdir(backupDir, { recursive: true });

  try {
    await moveIfExists(RAW_DIR, backupRawDir);
    await moveIfExists(NORMALIZED_DIR, backupNormalizedDir);

    await fs.rename(tmpRawDir, RAW_DIR);
    await fs.rename(tmpNormalizedDir, NORMALIZED_DIR);
    await writeJson(MANIFEST_PATH, nextManifest);
    await fs.rm(backupDir, { recursive: true, force: true });
  } catch (err) {
    await fs.rm(RAW_DIR, { recursive: true, force: true }).catch(() => {});
    await fs.rm(NORMALIZED_DIR, { recursive: true, force: true }).catch(() => {});
    await moveIfExists(backupRawDir, RAW_DIR).catch(() => {});
    await moveIfExists(backupNormalizedDir, NORMALIZED_DIR).catch(() => {});
    throw err;
  }
}

export async function updateData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await ensureKnowledgeFiles();

  let latestVersion;
  try {
    latestVersion = await getLatestVersion();
    const currentManifest = await readJson(MANIFEST_PATH, null);

    if (currentManifest?.patch === latestVersion && currentManifest?.offlineReady === true) {
      return { status: "already_updated", patch: latestVersion, manifest: currentManifest };
    }

    await fs.rm(TMP_DIR, { recursive: true, force: true });
    const tmpRawDir = path.join(TMP_DIR, "raw");
    const tmpNormalizedDir = path.join(TMP_DIR, "normalized");
    await fs.mkdir(tmpRawDir, { recursive: true });
    await fs.mkdir(tmpNormalizedDir, { recursive: true });

    for (const [fileName, buildUrl] of Object.entries(RAW_ENDPOINTS)) {
      const json = fileName === "champion.json"
        ? await fetchChampionDataset(latestVersion)
        : await fetchJson(buildUrl(latestVersion));
      await writeJson(path.join(tmpRawDir, fileName), json);
    }

    await generateNormalized(tmpRawDir, tmpNormalizedDir);
    await validateUpdate(tmpRawDir, tmpNormalizedDir);

    const nextManifest = {
      skill: "lolCoach",
      schemaVersion: SCHEMA_VERSION,
      locale: LOCALE,
      patch: latestVersion,
      lastUpdate: new Date().toISOString(),
      source: SOURCE,
      offlineReady: true
    };

    await replaceDataDirectories(tmpRawDir, tmpNormalizedDir, nextManifest);
    await fs.rm(TMP_DIR, { recursive: true, force: true });

    return { status: "updated", patch: latestVersion, manifest: nextManifest };
  } catch (err) {
    await fs.rm(TMP_DIR, { recursive: true, force: true }).catch(() => {});
    const currentManifest = await readJson(MANIFEST_PATH, null);
    return {
      status: "error",
      error: err.message,
      patch: currentManifest?.patch || null,
      hasValidLocalBase: currentManifest?.offlineReady === true
    };
  }
}

export default {
  updateData,
  normalizeAlias,
  sanitizeRiotText
};
