import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPersonalityConfig } from "../core/personalityConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configDir = path.join(__dirname, "..", "config");
const mainConfigPath = path.join(configDir, "config.json");
const skillsConfigPath = path.join(configDir, "skills.json");
const personalityManifestPath = path.join(configDir, "personality.json");
const personalityBasePath = path.join(configDir, "personality", "base.json");
const personalityResponseModesPath = path.join(configDir, "personality", "responseModes.json");
const personalityNeedsMapPath = path.join(configDir, "personality", "needs.map.json");
const personalityEmotionsMapPath = path.join(configDir, "personality", "emotions.map.json");

const DEFAULT_CONFIG = {
  version: "2.0.0",
  system: {
    aiModel: "huihui_ai/qwen3-vl-abliterated:4b",
    muted: false
  },
  voice: {
    xttsEnabled: false,
    microphoneEnabled: false
  },
  skills: {
    randomTalk: false
  }
};

const DEFAULT_PERSONALITY_MANIFEST = {
  version: "3.0.0",
  activeProfile: "base",
  files: {
    base: "personality/base.json",
    responseModes: "personality/responseModes.json",
    needsMap: "personality/needs.map.json",
    emotionsMap: "personality/emotions.map.json"
  }
};

function ensureConfigDir() {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.mkdirSync(path.dirname(personalityBasePath), { recursive: true });
}

function readJsonFile(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      return structuredClone(fallback);
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Erro ao ler JSON ${filePath}:`, err);
    return structuredClone(fallback);
  }
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function ensureConfigFile() {
  ensureConfigDir();
  if (!fs.existsSync(mainConfigPath)) {
    writeJsonFile(mainConfigPath, DEFAULT_CONFIG);
  }
}

function readConfig() {
  ensureConfigFile();
  return readJsonFile(mainConfigPath, DEFAULT_CONFIG);
}

function saveConfig(config) {
  writeJsonFile(mainConfigPath, config);
}

function getConfigBundle() {
  ensureConfigDir();

  return {
    config: readJsonFile(mainConfigPath, DEFAULT_CONFIG),
    personality: {
      manifest: readJsonFile(personalityManifestPath, DEFAULT_PERSONALITY_MANIFEST),
      base: readJsonFile(personalityBasePath, {}),
      responseModes: readJsonFile(personalityResponseModesPath, {}),
      needsMap: readJsonFile(personalityNeedsMapPath, {}),
      emotionsMap: readJsonFile(personalityEmotionsMapPath, {})
    }
  };
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} nao pode ficar vazio.`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} deve ser boolean.`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} deve ser array.`);
  }
}

function validateMainConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("config.json invalido.");
  }

  assertNonEmptyString(config?.system?.aiModel, "system.aiModel");
  if (!config.voice || typeof config.voice !== "object") {
    throw new Error("voice deve ser objeto.");
  }
  if (!config.skills || typeof config.skills !== "object") {
    throw new Error("skills deve ser objeto.");
  }
  assertBoolean(config?.system?.muted, "system.muted");
  assertBoolean(config?.voice?.xttsEnabled, "voice.xttsEnabled");
  assertBoolean(config?.voice?.microphoneEnabled, "voice.microphoneEnabled");
  assertBoolean(config?.skills?.randomTalk, "skills.randomTalk");
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("personality.json invalido.");
  }

  assertNonEmptyString(manifest.version, "personality.version");
  assertNonEmptyString(manifest.activeProfile, "personality.activeProfile");

  const files = manifest.files || {};
  assertNonEmptyString(files.base, "personality.files.base");
  assertNonEmptyString(files.responseModes, "personality.files.responseModes");
  assertNonEmptyString(files.needsMap, "personality.files.needsMap");
  assertNonEmptyString(files.emotionsMap, "personality.files.emotionsMap");
}

function validateBase(base) {
  if (!base || typeof base !== "object") {
    throw new Error("personality/base.json invalido.");
  }

  assertNonEmptyString(base.name, "base.name");
  assertNonEmptyString(base?.identity?.archetype, "base.identity.archetype");
  assertNonEmptyString(base?.identity?.style, "base.identity.style");
  assertNonEmptyString(base?.identity?.baseTone, "base.identity.baseTone");
  assertNonEmptyString(base?.identity?.presentation, "base.identity.presentation");
  assertNonEmptyString(base?.identity?.genderIdentity, "base.identity.genderIdentity");
  assertNonEmptyString(base?.identity?.pronouns, "base.identity.pronouns");
  assertNonEmptyString(base?.identity?.targetUser, "base.identity.targetUser");
  assertNonEmptyString(base?.identity?.relationship, "base.identity.relationship");

  const rules = base.rules || {};
  [
    "neverFormal",
    "allowSarcasm",
    "stickToIdentity",
    "avoidTechnicalAssistantTone",
    "avoidHashtags",
    "shortRepliesPreferred",
    "spokenDirectStyle"
  ].forEach((key) => {
    if (typeof rules[key] !== "boolean") {
      throw new Error(`base.rules.${key} deve ser boolean.`);
    }
  });

  assertArray(rules.avoidMasculineSlang, "base.rules.avoidMasculineSlang");
}

function validateResponseModes(responseModes) {
  const routeModes = responseModes?.routeModes || {};
  ["realtime", "task", "agent"].forEach((mode) => {
    const entry = routeModes[mode];
    if (!entry || typeof entry !== "object") {
      throw new Error(`responseModes.routeModes.${mode} e obrigatorio.`);
    }

    if (typeof entry.usePersona !== "boolean") {
      throw new Error(`responseModes.routeModes.${mode}.usePersona deve ser boolean.`);
    }

    assertNonEmptyString(entry.plannerRole, `responseModes.routeModes.${mode}.plannerRole`);
    assertArray(entry.instructions, `responseModes.routeModes.${mode}.instructions`);
  });
}

function validateNeedsMap(needsMap) {
  assertNonEmptyString(needsMap?.fallbackProfileId, "needsMap.fallbackProfileId");
  assertArray(needsMap?.profiles, "needsMap.profiles");

  needsMap.profiles.forEach((profile, index) => {
    if (!profile || typeof profile !== "object") {
      throw new Error(`needsMap.profiles[${index}] invalido.`);
    }

    assertNonEmptyString(profile.id, `needsMap.profiles[${index}].id`);
    assertNonEmptyString(profile.label, `needsMap.profiles[${index}].label`);
    assertNonEmptyString(profile.prompt, `needsMap.profiles[${index}].prompt`);

    if (!Number.isFinite(Number(profile.min)) || !Number.isFinite(Number(profile.max))) {
      throw new Error(`needsMap.profiles[${index}] precisa manter min/max numericos.`);
    }

    if (Number(profile.min) > Number(profile.max)) {
      throw new Error(`needsMap.profiles[${index}] tem faixa min/max invalida.`);
    }
  });
}

function validateEmotionsMap(emotionsMap) {
  const defaults = emotionsMap?.defaults || {};
  const rules = emotionsMap?.rules;

  assertNonEmptyString(defaults.type, "emotionsMap.defaults.type");
  if (!Number.isFinite(Number(defaults.intensity))) {
    throw new Error("emotionsMap.defaults.intensity deve ser numerico.");
  }
  if (!Number.isFinite(Number(defaults.decayMinutes))) {
    throw new Error("emotionsMap.defaults.decayMinutes deve ser numerico.");
  }
  assertArray(rules, "emotionsMap.rules");

  rules.forEach((rule, index) => {
    assertNonEmptyString(rule?.metric, `emotionsMap.rules[${index}].metric`);
    assertNonEmptyString(rule?.operator, `emotionsMap.rules[${index}].operator`);
    assertNonEmptyString(rule?.emotion, `emotionsMap.rules[${index}].emotion`);
    if (!Number.isFinite(Number(rule?.value))) {
      throw new Error(`emotionsMap.rules[${index}].value deve ser numerico.`);
    }
  });
}

function validatePersonalityBundle(personality) {
  validateManifest(personality?.manifest);
  validateBase(personality?.base);
  validateResponseModes(personality?.responseModes);
  validateNeedsMap(personality?.needsMap);
  validateEmotionsMap(personality?.emotionsMap);
}

function applyConfigBundleToRuntime(context, bundle) {
  context.config.system.defaultModel = bundle.config.system.aiModel;
  context.config.system.muted = bundle.config.system.muted;
  context.config.skills.randomTalk = bundle.config.skills.randomTalk;
  context.config.personality = loadPersonalityConfig(true);
}

export default function createConfigRoutes(context) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    try {
      const config = readConfig();
      config.system.aiModel = context.config.system.defaultModel;
      config.system.muted = context.config.system.muted || false;

      let skills = [];
      if (fs.existsSync(skillsConfigPath)) {
        const raw = JSON.parse(fs.readFileSync(skillsConfigPath, "utf8"));
        skills = Object.entries(raw).map(([name, active]) => ({
          name,
          active
        }));
      }

      res.json({
        ...config,
        skills
      });
    } catch (err) {
      console.error("Erro ao carregar config:", err);
      res.status(500).json({ error: "Erro ao ler config" });
    }
  });

  router.get("/bundle", async (req, res) => {
    try {
      const bundle = getConfigBundle();
      res.json({
        success: true,
        data: bundle
      });
    } catch (err) {
      console.error("Erro ao carregar bundle de config:", err);
      res.status(500).json({ success: false, error: "Erro ao ler bundle de config" });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const current = readConfig();
      const {
        aiModel,
        xttsEnabled,
        microphoneEnabled,
        muted,
        randomTalk
      } = req.body;

      if (aiModel) {
        context.config.system.defaultModel = aiModel;
        current.system.aiModel = aiModel;
      }

      if (muted !== undefined) {
        context.config.system.muted = muted;
        current.system.muted = muted;
      }

      if (randomTalk !== undefined) {
        current.skills = current.skills || {};
        current.skills.randomTalk = randomTalk;
      }

      if (xttsEnabled !== undefined) {
        current.voice.xttsEnabled = !!xttsEnabled;
      }

      if (microphoneEnabled !== undefined) {
        current.voice.microphoneEnabled = !!microphoneEnabled;
      }

      validateMainConfig(current);
      saveConfig(current);

      res.json({
        success: true,
        config: current
      });
    } catch (err) {
      console.error("Erro ao salvar config:", err);
      res.status(400).json({ error: err.message || "Erro ao salvar config" });
    }
  });

  router.post("/bundle", async (req, res) => {
    try {
      const bundle = req.body?.data;

      if (!bundle || typeof bundle !== "object") {
        throw new Error("Payload de config invalido.");
      }

      validateMainConfig(bundle.config);
      validatePersonalityBundle(bundle.personality);

      writeJsonFile(mainConfigPath, bundle.config);
      writeJsonFile(personalityManifestPath, bundle.personality.manifest);
      writeJsonFile(personalityBasePath, bundle.personality.base);
      writeJsonFile(personalityResponseModesPath, bundle.personality.responseModes);
      writeJsonFile(personalityNeedsMapPath, bundle.personality.needsMap);
      writeJsonFile(personalityEmotionsMapPath, bundle.personality.emotionsMap);

      applyConfigBundleToRuntime(context, bundle);

      res.json({
        success: true,
        data: getConfigBundle()
      });
    } catch (err) {
      console.error("Erro ao salvar bundle de config:", err);
      res.status(400).json({
        success: false,
        error: err.message || "Erro ao salvar bundle de config"
      });
    }
  });

  return router;
}
