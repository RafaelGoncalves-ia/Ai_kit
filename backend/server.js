import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import logger from "./utils/logger.js";
import axios from "axios";

// ======================
// IMPORT CORE & SERVICES
// ======================
import createSkillManager from "./core/skillManager.js";
import createCommandEngine from "./core/commandEngine.js";
import createBrain from "./core/brain.js";
import createScheduler from "./core/scheduler.js";
import createOrchestrator from "./core/orchestrator.js";
import createResponseQueue from "./core/responseQueue.js";

import kitState from "./core/stateManager.js";

import createAIService from "./services/ai.js";
import createTTSService from "./services/tts.js";

// ======================
// IMPORT ROUTES
// ======================
import createChatRoutes from "./routes/chat.js";
import createSkillsRoutes from "./routes/skills.js";
import createConfigRoutes from "./routes/config.js";
import sttRoute from "./routes/stt.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use("/stt", sttRoute);

// ======================
// PATHS
// ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const frontendDir = path.join(projectRoot, "frontend");

const LOG_PATH = "F:/AI/Ai_kit/logs";

app.use(express.static(frontendDir));

// ======================
// CONTEXTO GLOBAL (CRIA PRIMEIRO)
// ======================
const context = {
  config: {
    system: {
      ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
      defaultModel:
        process.env.DEFAULT_MODEL ||
        "huihui_ai/qwen3-vl-abliterated:4b",
    },
    skills: {}
  },

  state: kitState,

  services: {},

  core: {}
};

// ======================
// INIT CORE (ORDEM CORRETA)
// ======================
context.core.scheduler = createScheduler(context);
// 🔥 FIX COMPATIBILIDADE (IMPORTANTE)
context.scheduler = context.core.scheduler;

context.services.ai = createAIService(context);
context.services.tts = createTTSService(context);

context.core.commandEngine = createCommandEngine(context);
context.core.skillManager = createSkillManager(context);
context.core.brain = createBrain(context);

// 🔥 AGORA SIM pode usar context
context.core.responseQueue = createResponseQueue(context);
context.core.orchestrator = createOrchestrator(context);

// ======================
// INIT SKILLS
// ======================
await context.core.skillManager.initAll();

// ======================
// ROUTAS
// ======================
app.get("/status", (req, res) => {
  res.json({
    status: "online",
    uptime: process.uptime(),
    state: context.state
  });
});

app.get("/models", async (req, res) => {
  try {
    const response = await axios.get(
      `${context.config.system.ollamaUrl}/api/tags`
    );

    const models = response.data.models.map((m) => ({
      name: m.name,
      size: (m.size / 1024 / 1024 / 1024).toFixed(1) + "GB",
    }));

    res.json({ models });
  } catch (err) {
    logger.error("Erro ao buscar modelos:", err.message);
    res.json({
      models: [
        { name: context.config.system.defaultModel, size: "N/A" },
      ],
    });
  }
});

// ======================
// ROUTES
// ======================
app.use("/chat", createChatRoutes(context));
app.use("/skills", createSkillsRoutes(context));
app.use("/config", createConfigRoutes(context));

// ======================
// LOGS
// ======================
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.get("/logs/:name", (req, res) => {
  const fileName = `${req.params.name}.log`;
  const filePath = path.join(LOG_PATH, fileName);

  try {
    const data = fs.readFileSync(filePath, "utf8");
    res.send(data);
  } catch {
    res.status(200).send(`LOG NÃO ENCONTRADO: ${fileName}`);
  }
});

// ======================
// START SERVER
// ======================
app.listen(PORT, () => {
  logger.info(`🚀 Kit IA Rodando em http://localhost:${PORT}`);
});