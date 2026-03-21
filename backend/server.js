import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
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
import createConfigRoutes from "./routes/config.js"

dotenv.config()

// ======================
// CONFIGURAÇÃO
// ======================
const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// ======================
// RAIZ DO PROJETO
// ======================
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const frontendDir = path.join(projectRoot, 'frontend')

// ======================
// SERVIR ARQUIVOS ESTÁTICOS DO FRONTEND
// ======================
app.use(express.static(frontendDir))

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
context.core.skillManager.loadSkills()
context.core.skillManager.initAll(context)

// ======================
// ROTAS
// ======================
app.use("/chat", createChatRoutes(context))
// skills/config exportam routers diretamente, nao funcoes
app.use("/skills", createSkillsRoutes)
app.use("/config", createConfigRoutes)

// Rota simples para checagem
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'))
})

// ======================
// START SERVER
// ======================
app.listen(PORT, () => {
  logger.info(`Servidor rodando em http://localhost:${PORT}`)
})