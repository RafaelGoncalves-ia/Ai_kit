import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPersonalityConfig } from "../core/personalityConfig.js";
import {
  loadWakeListeningConfig,
  normalizeWakeListeningConfig,
  saveWakeListeningConfig
} from "../core/audio/WakeListeningConfig.js";
import { normalizeVisionDetailTokenBudget } from "../core/visionDetail.js";

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
    aiModel: "fredrezones55/Gemma-4-Uncensored-HauhauCS-Aggressive:e4b",
    muted: false,
    thinkingEnabled: true,
    realtimeStreamingEnabled: true,
    sampling: {
      temperature: 1,
      topP: 0.95,
      topK: 64
    },
    multimodal: {
      visionTokenBudget: 280,
      screenshotTokenBudget: 560,
      ocrTokenBudget: 1120,
      videoTokenBudget: 140,
      autoOcrBoost: true,
      audioTranscriptionFallback: true
    }
  },
  vision: {
    detailTokenBudget: "auto"
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
  return normalizeMainConfig(readJsonFile(mainConfigPath, DEFAULT_CONFIG));
}

function saveConfig(config) {
  writeJsonFile(mainConfigPath, config);
}

function getConfigBundle() {
  ensureConfigDir();

  return {
    config: normalizeMainConfig(readJsonFile(mainConfigPath, DEFAULT_CONFIG)),
    personality: {
      manifest: readJsonFile(personalityManifestPath, DEFAULT_PERSONALITY_MANIFEST),
      base: readJsonFile(personalityBasePath, {}),
      responseModes: readJsonFile(personalityResponseModesPath, {}),
      needsMap: readJsonFile(personalityNeedsMapPath, {}),
      emotionsMap: readJsonFile(personalityEmotionsMapPath, {})
    }
  };
}

function normalizeMainConfig(config = {}) {
  const next = {
    ...structuredClone(DEFAULT_CONFIG),
    ...(config && typeof config === "object" ? config : {})
  };

  next.system = {
    ...DEFAULT_CONFIG.system,
    ...(config?.system || {})
  };
  next.system.sampling = {
    ...DEFAULT_CONFIG.system.sampling,
    ...(config?.system?.sampling || {})
  };
  next.system.multimodal = {
    ...DEFAULT_CONFIG.system.multimodal,
    ...(config?.system?.multimodal || {})
  };
  next.vision = {
    ...DEFAULT_CONFIG.vision,
    ...(config?.vision || {})
  };
  next.vision.detailTokenBudget = normalizeVisionDetailTokenBudget(next.vision.detailTokenBudget);
  next.voice = {
    ...DEFAULT_CONFIG.voice,
    ...(config?.voice || {})
  };
  next.skills = {
    ...DEFAULT_CONFIG.skills,
    ...(config?.skills || {})
  };

  return next;
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
  if (config.system.thinkingEnabled !== undefined) {
    assertBoolean(config.system.thinkingEnabled, "system.thinkingEnabled");
  }
  if (config.system.realtimeStreamingEnabled !== undefined) {
    assertBoolean(config.system.realtimeStreamingEnabled, "system.realtimeStreamingEnabled");
  }
  if (config.system.sampling !== undefined) {
    if (!config.system.sampling || typeof config.system.sampling !== "object") {
      throw new Error("system.sampling deve ser objeto.");
    }
  }
  if (config.system.multimodal !== undefined) {
    if (!config.system.multimodal || typeof config.system.multimodal !== "object") {
      throw new Error("system.multimodal deve ser objeto.");
    }
    const multimodal = config.system.multimodal;
    [
      "visionTokenBudget",
      "screenshotTokenBudget",
      "ocrTokenBudget",
      "videoTokenBudget"
    ].forEach((key) => {
      if (multimodal[key] !== undefined && !Number.isFinite(Number(multimodal[key]))) {
        throw new Error(`system.multimodal.${key} deve ser numerico.`);
      }
    });
    if (multimodal.autoOcrBoost !== undefined) {
      assertBoolean(multimodal.autoOcrBoost, "system.multimodal.autoOcrBoost");
    }
    if (multimodal.audioTranscriptionFallback !== undefined) {
      assertBoolean(multimodal.audioTranscriptionFallback, "system.multimodal.audioTranscriptionFallback");
    }
  }
  if (config.vision !== undefined) {
    if (!config.vision || typeof config.vision !== "object") {
      throw new Error("vision deve ser objeto.");
    }
    const normalizedBudget = normalizeVisionDetailTokenBudget(config.vision.detailTokenBudget);
    if (normalizedBudget !== config.vision.detailTokenBudget) {
      throw new Error("vision.detailTokenBudget deve ser auto, 70, 140, 280, 560 ou 1120.");
    }
  }
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
  context.config.system.thinkingEnabled = bundle.config.system.thinkingEnabled !== false;
  context.config.system.realtimeStreamingEnabled = bundle.config.system.realtimeStreamingEnabled !== false;
  context.config.system.sampling = {
    ...bundle.config.system.sampling
  };
  context.config.system.multimodal = {
    ...bundle.config.system.multimodal
  };
  context.config.vision = {
    ...bundle.config.vision,
    detailTokenBudget: normalizeVisionDetailTokenBudget(bundle.config.vision?.detailTokenBudget)
  };
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
      config.system.thinkingEnabled = context.config.system.thinkingEnabled !== false;
      config.system.sampling = {
        ...(config.system.sampling || DEFAULT_CONFIG.system.sampling)
      };
      config.system.multimodal = {
        ...(config.system.multimodal || DEFAULT_CONFIG.system.multimodal)
      };
      config.vision = {
        ...(config.vision || DEFAULT_CONFIG.vision),
        detailTokenBudget: normalizeVisionDetailTokenBudget(config.vision?.detailTokenBudget)
      };

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
        randomTalk,
        thinkingEnabled,
        sampling,
        multimodal,
        vision
      } = req.body;

      if (aiModel) {
        context.config.system.defaultModel = aiModel;
        current.system.aiModel = aiModel;
      }

      if (muted !== undefined) {
        context.config.system.muted = muted;
        current.system.muted = muted;
      }

      if (thinkingEnabled !== undefined) {
        context.config.system.thinkingEnabled = !!thinkingEnabled;
        current.system.thinkingEnabled = !!thinkingEnabled;
      }

      if (sampling && typeof sampling === "object") {
        current.system.sampling = {
          ...(current.system.sampling || DEFAULT_CONFIG.system.sampling),
          ...sampling
        };
        context.config.system.sampling = {
          ...current.system.sampling
        };
      }

      if (multimodal && typeof multimodal === "object") {
        current.system.multimodal = {
          ...(current.system.multimodal || DEFAULT_CONFIG.system.multimodal),
          ...multimodal
        };
        context.config.system.multimodal = {
          ...current.system.multimodal
        };
      }

      if (vision && typeof vision === "object") {
        current.vision = {
          ...(current.vision || DEFAULT_CONFIG.vision),
          ...vision
        };
        current.vision.detailTokenBudget = normalizeVisionDetailTokenBudget(current.vision.detailTokenBudget);
        context.config.vision = {
          ...current.vision
        };
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

      const normalizedCurrent = normalizeMainConfig(current);
      validateMainConfig(normalizedCurrent);
      saveConfig(normalizedCurrent);

      res.json({
        success: true,
        config: normalizedCurrent
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

      bundle.config = normalizeMainConfig(bundle.config);
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

  router.get("/wake-listening", async (req, res) => {
    try {
      const config = loadWakeListeningConfig();
      context.config.wakeListening = config;

      res.json({
        success: true,
        data: config
      });
    } catch (err) {
      console.error("Erro ao carregar wake listening:", err);
      res.status(500).json({
        success: false,
        error: "Erro ao ler wake listening"
      });
    }
  });

  router.post("/wake-listening", async (req, res) => {
    try {
      const currentWakeConfig = loadWakeListeningConfig();
      const nextConfig = normalizeWakeListeningConfig({
        ...currentWakeConfig,
        ...(req.body?.data || req.body || {})
      });
      const saved = saveWakeListeningConfig(nextConfig);
      context.config.wakeListening = saved;

      res.json({
        success: true,
        data: saved
      });
    } catch (err) {
      console.error("Erro ao salvar wake listening:", err);
      res.status(400).json({
        success: false,
        error: err.message || "Erro ao salvar wake listening"
      });
    }
  });

  return router;
}
