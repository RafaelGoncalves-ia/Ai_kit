import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import path from "path"
import fs from "fs"
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
// ======================
import createChatRoutes from "./routes/chat.js"
import createSkillsRoutes from "./routes/skills.js"
import createConfigRoutes from "./routes/config.js"
import sttRoute from "./routes/stt.js"

dotenv.config()

// ======================
// CONFIGURAÇÃO
// ======================
const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())
app.use("/stt", sttRoute)

// ======================
// PATHS
// ======================
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, "..")
const frontendDir = path.join(projectRoot, "frontend")

const LOG_PATH = "F:/AI/Ai_kit/logs"

// ======================
// STATIC FRONTEND
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
// SERVICES
// ======================
context.services.ai = createAIService(context)
context.services.tts = createTTSService(context)

// ======================
// CORE
// ======================
context.core.commandEngine = createCommandEngine(context)
context.core.scheduler = createScheduler(context)
context.core.skillManager = createSkillManager(context)
context.core.brain = createBrain(context)

// ======================
// SKILLS
// ======================
context.core.skillManager.loadSkills()
context.core.skillManager.initAll(context)

// ======================
// ROUTES
// ======================
app.use("/chat", createChatRoutes(context))
app.use("/skills", createSkillsRoutes)
app.use("/config", createConfigRoutes)

// ======================
// HOME
// ======================
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"))
})

// ======================
// LOGS (CORRIGIDO E ÚNICO)
// ======================
app.get("/logs/:name", (req, res) => {
  const fileName = `${req.params.name}.log`
  const filePath = path.join(LOG_PATH, fileName)

  try {
    const data = fs.readFileSync(filePath, "utf8")
    res.send(data)
  } catch (err) {
    res.status(200).send(`LOG NÃO ENCONTRADO: ${fileName}`)
  }
})

// ======================
// START SERVER
// ======================
app.listen(PORT, () => {
  logger.info(`Servidor rodando em http://localhost:${PORT}`)
})