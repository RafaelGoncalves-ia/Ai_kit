// Gerenciador central de Skills
// Responsável por:
// - carregar skills do registry
// - aplicar config (ativar/desativar)
// - validar dependências
// - executar skills
// - servir como ponte entre brain e skills

import path from "path"
import { pathToFileURL } from "url"

import registry from "../skills/registry.js"
import logger from "../utils/logger.js"

export class SkillManager {
  constructor(context) {
    this.context = context

    this.skills = new Map()        // todas carregadas
    this.enabledSkills = new Map() // apenas ativas
  }

  // ======================
  // INIT
  // ======================
  async init() {
    logger.info("Inicializando SkillManager...")
    
    await this.loadSkills()
    this.applyConfig()
    this.validateDependencies()

    logger.info(`Skills carregadas: ${this.skills.size}`)
    logger.info(`Skills ativas: ${this.enabledSkills.size}`)
  }

  // ======================
  // LOAD SKILLS
  // ======================
  async loadSkills() {
    for (const skillPath of registry) {
      try {
        const fullPath = path.resolve(`backend/skills/${skillPath}/index.js`)
        const fileUrl = pathToFileURL(fullPath).href

        const module = await import(fileUrl)
        const skill = module.default

        if (!skill || !skill.name) {
          logger.warn(`Skill inválida em ${skillPath}`)
          continue
        }

        // referência ao contexto
        skill.context = this.context

        this.skills.set(skill.name, skill)

        logger.debug(`Skill carregada: ${skill.name}`)
      } catch (err) {
        logger.error(`Erro ao carregar skill: ${skillPath}`, err)
      }
    }
  }

  // ======================
  // APPLY CONFIG
  // ======================
  applyConfig() {
    const config = this.context.config.skills || {}

    for (const [name, skill] of this.skills.entries()) {
      const enabled = config[name]

      if (enabled === false) {
        logger.info(`Skill desativada via config: ${name}`)
        continue
      }

      skill.enabled = true
      this.enabledSkills.set(name, skill)
    }
  }

  // ======================
  // DEPENDENCIES
  // ======================
  validateDependencies() {
    for (const [name, skill] of this.enabledSkills.entries()) {
      if (!skill.dependsOn) continue

      for (const dep of skill.dependsOn) {
        if (!this.enabledSkills.has(dep)) {
          logger.warn(`Skill ${name} depende de ${dep} que não está ativa`)
        }
      }
    }
  }

  // ======================
  // GET
  // ======================
  get(name) {
    return this.enabledSkills.get(name)
  }

  getAll() {
    return Array.from(this.enabledSkills.values())
  }

  // ======================
  // EXECUTE
  // ======================
  async run(name, input = {}) {
    const skill = this.get(name)

    if (!skill) {
      logger.warn(`Skill não encontrada ou desativada: ${name}`)
      return null
    }

    if (typeof skill.execute !== "function") {
      logger.warn(`Skill ${name} não possui execute()`)
      return null
    }

    try {
      return await skill.execute({
        input,
        context: this.context,
        services: this.context.services,
        skills: this // permite encadeamento
      })
    } catch (err) {
      logger.error(`Erro ao executar skill: ${name}`, err)
      return null
    }
  }

  // ======================
  // COMMANDS (coleta global)
  // ======================
  getAllCommands() {
    const commands = []

    for (const skill of this.enabledSkills.values()) {
      if (skill.commands) {
        commands.push({
          skill: skill.name,
          commands: skill.commands
        })
      }
    }

    return commands
  }
}

// Compatibilidade com import padrão em server.js
export default function createSkillManager(context) {
  return new SkillManager(context)
}

// Alias de método esperado por server.js (inicializar após carregar skills)
SkillManager.prototype.initAll = async function () {
  await this.init()
}
