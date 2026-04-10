// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import axios from "axios";
import logger from "./utils/logger.js";

import {
  listConversations,
  loadConversationById,
  createNewConversation,
  deleteConversation,
  addMessage
} from "./utils/conversationStore.js";

// ======================
// IMPORT CORE & SERVICES
// ======================
import createSkillManager from "./core/skillManager.js";
import createCommandEngine from "./core/commandEngine.js";
import createBrain from "./core/brain.js";
import createScheduler from "./core/scheduler.js";
import createOrchestrator from "./core/orchestrator.js";
import createResponseQueue from "./core/responseQueue.js";
import createTools from "./core/tools.js";
import kitState from "./core/stateManager.js";
import createAIService from "./services/ai.js";
import createTTSService from "./services/tts.js";
import { loadConfig } from "./core/configLoader.js";
import { eventBus } from "./core/eventBus.js";

// ======================
// IMPORT ROUTES
// ======================
import createChatRoutes from "./routes/chat.js";
import createSkillsRoutes from "./routes/skills.js";
import createConfigRoutes from "./routes/config.js";
import createTasksRoutes from "./routes/tasks.js";
import sttRoute from "./routes/stt.js";
import { initSkills } from "./skills/needs/startup.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/stt", sttRoute);

// ======================
// LOG PATH
// ======================
const LOG_PATH = "F:/AI/Ai_kit/logs";

// ======================
// CONTEXTO GLOBAL
// ======================
const context = {
  config: {
    system: {
      ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
      defaultModel: process.env.DEFAULT_MODEL || "huihui_ai/qwen3-vl-abliterated:4b",
      maxConcurrentTasks: 1
    },
    skills: {},
    personality: loadConfig("personality.json")
  },
  state: kitState,
  sessions: {},
  services: {},
  core: { eventBus }
};

// ======================
// INIT CORE
// ======================
context.core.scheduler = createScheduler(context);
context.scheduler = context.core.scheduler;

context.services.ai = createAIService(context);
context.services.tts = createTTSService(context);
context.llm = async (prompt, options = {}) => context.services.ai.chat(prompt, options);
context.tools = createTools(context);
context.core.commandEngine = createCommandEngine(context);
context.core.skillManager = createSkillManager(context);
context.core.brain = createBrain(context);
context.core.responseQueue = createResponseQueue(context);
context.core.orchestrator = createOrchestrator(context);

// ======================
// INIT SKILLS & HISTÓRICO
// ======================
await context.core.skillManager.initAll();
initSkills(context.core.scheduler, context);

// ======================
// INIT ORCHESTRATOR V2
// ======================
await context.core.orchestrator.initialize();
console.log("✅ Orchestrator V2 inicializado com 3 rotas independentes");

// Start scheduler com AgentRoute jobs já registrados
context.scheduler.start(1000);
console.log("✅ Scheduler iniciado com 4 AgentRoute jobs registrados");

// ======================
// SSE
// ======================
let sseClients = [];

function sendSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(client => {
    try {
      client.res.write(payload);
      return true;
    } catch {
      return false;
    }
  });
}

global.sendSSE = sendSSE;

context.core.eventBus.on("task:completed", (data) => {
  logger.info("📢 [SSE] Evento recebido via eventBus");
  sendSSE({ type: "task:completed", payload: data.payload || data });
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const clientId = Date.now();
  const client = { id: clientId, res };
  sseClients.push(client);
  logger.info("🔌 SSE conectado:", clientId);

  req.on("close", () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
    logger.info("❌ SSE desconectado:", clientId);
  });
});

// ======================
// ROTAS API
// ======================
app.get("/status", (req, res) => {
  res.json({ status: "online", uptime: process.uptime(), state: context.state });
});

app.get("/models", async (req, res) => {
  try {
    const response = await axios.get(`${context.config.system.ollamaUrl}/api/tags`);
    const models = response.data.models.map((m) => ({
      name: m.name,
      size: (m.size / 1024 / 1024 / 1024).toFixed(1) + "GB",
    }));
    res.json({ models });
  } catch (err) {
    logger.error("Erro ao buscar modelos:", err.message);
    res.json({ models: [{ name: context.config.system.defaultModel, size: "N/A" }] });
  }
});

app.get("/conversations", (req, res) => res.json(listConversations()));
app.get("/conversations/:id", (req, res) => res.json(loadConversationById(req.params.id)));
app.post("/conversations/new", (req, res) => { createNewConversation(); res.json({ ok: true }); });
app.delete("/conversations/:id", (req, res) => { deleteConversation(req.params.id); res.json({ ok: true }); });

app.use("/chat", createChatRoutes(context));
app.use("/skills", createSkillsRoutes(context));
app.use("/config", createConfigRoutes(context));
app.use("/tasks", createTasksRoutes(context));

app.get("/history", (req, res) => {
  const conversations = listConversations();
  if (!conversations.length) return res.json(null);
  const last = conversations[conversations.length - 1];
  const conv = loadConversationById(last.id);
  res.json(conv);
});

// ======================
// SHOP ROUTER
// ======================
const shopRouter = express.Router();
const statePath = path.join(process.cwd(), "backend/config/kitState.json");
const catalogPath = path.join(process.cwd(), "backend/config/catalog.json");

// GET /shop → retorna todos os itens da loja
shopRouter.get("/", (req, res) => {
  try {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
    res.json(catalog);
  } catch (err) {
    console.error("Erro ao ler catálogo:", err);
    res.status(500).json({ error: "Erro ao ler catálogo" });
  }
});

// POST /shop/gift → comprar ou presentear item
shopRouter.post("/gift", (req, res) => {
  try {
    // 🔹 lê o estado atual do arquivo
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));

    // 🔹 encontra o item pelo ID
    const item = catalog.find(i => i.id === req.body.id);
    if (!item) return res.status(404).json({ error: "Item não encontrado" });

    const price = Number(item.valor) || 0;
    if (state.tokens < price) return res.status(400).json({ error: "Tokens insuficientes" });

    // 🔹 desconta tokens
    state.tokens -= price;

    // 🔹 consumível → aplica efeito nas necessidades
    if (item.tipo === "consumivel") {
      Object.keys(item.efeito || {}).forEach(key => {
        if (state.needs[key] !== undefined) {
          state.needs[key] += item.efeito[key];
          if (state.needs[key] > 100) state.needs[key] = 100;
          if (state.needs[key] < 0) state.needs[key] = 0;
        }
      });
    }

    // 🔹 skin (visual) → adiciona ao inventário
    if (item.tipo === "skin") {
      if (!state.inventory) state.inventory = {};
      state.inventory[item.slot] = item.id;
    }

    // 🔹 ATUALIZA kitState em memória
    Object.assign(kitState, state);

    // 🔹 salva o estado atualizado no arquivo
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    console.log("✅ COMPRA OK:", item.id);

    // 🔹 envia SSE (opcional)
    if (global.sendSSE) {
      global.sendSSE({
        type: "state:update",
        payload: state
      });
    }

    res.json(state);

  } catch (err) {
    console.error("Erro /shop/gift:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

app.use("/shop", shopRouter);

// ======================
// LOGS
// ======================
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
const server = app.listen(PORT, () => {
  logger.info(`🚀 Kit IA Rodando em http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ PORTA ${PORT} EM USO.`);
    process.exit(1);
  }
});
