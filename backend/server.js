import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import logger from "./utils/logger.js"

// ======================
// IMPORT CORE & SERVICES
// ======================
import createSkillManager from "./core/skillManager.js"
import createCommandEngine from "./core/commandEngine.js"
import createBrain from "./core/brain.js"
import createScheduler from "./core/scheduler.js"

import createAIService from "./services/ai.js"
import createTTSService from "./services/tts.js"

// ======================
// IMPORT SKILLS REGISTRY
// ======================
import skillsRegistry from "./skills/registry.js"

// ======================
// IMPORT ROUTES
// =====================
import createChatRoutes from "./routes/chat.js"
import createSkillsRoutes from "./routes/skills.js"

dotenv.config()

// ======================
// CONFIGURAÇÃO
// ======================
const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// ======================
// CONTEXTO GLOBAL
// ======================
const context = {
  config: {
    system: {
      ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
      defaultModel: process.env.DEFAULT_MODEL || "huihui_ai/qwen2.5-abliterate:14b"
    }
  },
  core: {},
  services: {},
  skills: {}
}

// ======================
// INICIALIZAÇÃO SERVICES
// ======================
context.services.ai = createAIService(context)
context.services.tts = createTTSService(context)

// ======================
// INICIALIZAÇÃO CORE
// ======================
context.core.commandEngine = createCommandEngine(context)
context.core.scheduler = createScheduler(context)
context.core.skillManager = createSkillManager(context)
context.core.brain = createBrain(context)

// ======================
// CARREGAR SKILLS
// ======================
context.core.skillManager.loadSkills(skillsRegistry)
context.core.skillManager.initAll(context)

// ======================
// ROTAS
// ======================
app.use("/chat", createChatRoutes(context))
app.use("/skills", createSkillsRoutes(context))

// Rota simples para checagem
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Kit-IA backend rodando 🚀"
  })
})

// ======================
// START SERVER
// ======================
app.listen(PORT, () => {
  logger.info(`Servidor rodando em http://localhost:${PORT}`)
})