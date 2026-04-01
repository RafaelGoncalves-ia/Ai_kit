import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ======================
// PATHS
// ======================
const configDir = path.join(__dirname, "..", "config");
const mainConfigPath = path.join(configDir, "config.json");
const skillsConfigPath = path.join(configDir, "skills.json");

// ======================
// DEFAULT CONFIG
// ======================
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

  identity: {
    name: "KIT",
    description: "Assistente inteligente local",
    personality: "Sarcástica, rápida e eficiente"
  }
};

// ======================
// UTIL
// ======================
function ensureConfigFile() {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (!fs.existsSync(mainConfigPath)) {
    fs.writeFileSync(
      mainConfigPath,
      JSON.stringify(DEFAULT_CONFIG, null, 2)
    );
  }
}

function readConfig() {
  ensureConfigFile();
  return JSON.parse(fs.readFileSync(mainConfigPath, "utf8"));
}

function saveConfig(config) {
  fs.writeFileSync(
    mainConfigPath,
    JSON.stringify(config, null, 2)
  );
}

// ======================
// ROUTES
// ======================
export default function createConfigRoutes(context) {
  const router = express.Router();

  // ======================
  // GET /config
  // ======================
  router.get("/", async (req, res) => {
    try {
      const config = readConfig();

      // sincroniza com runtime
      config.system.aiModel = context.config.system.defaultModel;
      config.system.muted = context.config.system.muted || false;

      // skills
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

  // ======================
  // POST /config
  // ======================
  router.post("/", async (req, res) => {
    try {
      const current = readConfig();

      const {
        aiModel,
        xttsEnabled,
        microphoneEnabled,
        muted,
        identity
      } = req.body;

      // ======================
      // SYSTEM
      // ======================
      if (aiModel) {
        context.config.system.defaultModel = aiModel;
        current.system.aiModel = aiModel;
      }

      if (muted !== undefined) {
        context.config.system.muted = muted;
        current.system.muted = muted;
      }

      // ======================
      // VOICE
      // ======================
      if (context.core.skillManager) {
        if (xttsEnabled !== undefined) {
          await context.core.skillManager.toggleSkill("base/xtts", xttsEnabled);
          current.voice.xttsEnabled = xttsEnabled;
        }

        if (microphoneEnabled !== undefined) {
          await context.core.skillManager.toggleSkill("base/stt", microphoneEnabled);
          current.voice.microphoneEnabled = microphoneEnabled;
        }
      }

      // ======================
      // IDENTITY (🔥 NOVO)
      // ======================
      if (identity) {
        current.identity = {
          ...current.identity,
          ...identity
        };
      }

      // ======================
      // SAVE
      // ======================
      saveConfig(current);

      res.json({
        success: true,
        config: current
      });

    } catch (err) {
      console.error("Erro ao salvar config:", err);
      res.status(500).json({ error: "Erro ao salvar config" });
    }
  });

  return router;
}