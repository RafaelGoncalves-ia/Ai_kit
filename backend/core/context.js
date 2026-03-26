// Contexto global da aplicação
// Aqui vamos centralizar tudo que o sistema usa:
// - config
// - services
// - core (brain, skillManager, etc)

import fs from "fs"
import path from "path"

export function createContext() {
  const context = {}

  // CONFIGURAÇÕES
  context.config = loadConfigs()

  // SERVIÇOS (vazio por enquanto)
  context.services = {}

  // CORE (será preenchido depois)
  context.core = {
    brain: null,
    skillManager: null,
    commandEngine: null,
    scheduler: null
  }

  return context
}

// CARREGAR CONFIGS
function loadConfigs() {
  const configPath = path.resolve("backend/config")

  const readJSON = (file) => {
    try {
      const fullPath = path.join(configPath, file)
      if (!fs.existsSync(fullPath)) return {}
      const raw = fs.readFileSync(fullPath, "utf-8")
      return JSON.parse(raw)
    } catch (err) {
      console.error(`Erro ao carregar config: ${file}`, err)
      return {}
    }
  }

  return {
    skills: readJSON("skills.json"),
    system: readJSON("system.json"),
    personality: readJSON("personality.json")
  }
}