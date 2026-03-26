// Gerenciador central de Skills - AI KIT

import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import logger from "../utils/logger.js";

export class SkillManager {
  constructor(context) {
    this.context = context;
    this.skills = new Map();
    this.enabledSkills = new Map();
  }

  // INIT
  async init() {
    logger.info("Inicializando SkillManager (Modo Dinâmico)...");

    await this.loadSkills();
    this.applyConfig();
    this.validateDependencies();

    logger.info(
      `Busca concluída. Disponíveis: ${this.skills.size} | Ativas: ${this.enabledSkills.size}`
    );
  }

  // LOAD SKILLS (AUTO-SCAN FLEXÍVEL)
  async loadSkills() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const skillsRoot = path.resolve(__dirname, "../skills");

    const categories = fs.readdirSync(skillsRoot);

    for (const category of categories) {
      const categoryPath = path.join(skillsRoot, category);

      if (!fs.statSync(categoryPath).isDirectory()) continue;

      // 🔥 CASO 1: skill direta (ex: skills/needs/index.js)
      const directIndex = path.join(categoryPath, "index.js");
      const directSkill = path.join(categoryPath, "skill.js");

      if (fs.existsSync(directIndex) || fs.existsSync(directSkill)) {
        await this.loadSkillFromPath(categoryPath, category);
      }

      // 🔥 CASO 2: subpastas (ex: skills/base/ai.chat)
      const folders = fs.readdirSync(categoryPath);

      for (const folder of folders) {
        const skillDir = path.join(categoryPath, folder);

        if (!fs.statSync(skillDir).isDirectory()) continue;

        await this.loadSkillFromPath(skillDir, folder);
      }
    }
  }

  // LOAD INDIVIDUAL SKILL
  async loadSkillFromPath(skillDir, folderName) {
    try {
      const indexPath = path.join(skillDir, "index.js");
      const skillPathFile = path.join(skillDir, "skill.js");

      const fullPath = fs.existsSync(indexPath)
        ? indexPath
        : fs.existsSync(skillPathFile)
        ? skillPathFile
        : null;

      if (!fullPath) return;

      const fileUrl = pathToFileURL(fullPath).href;
      const module = await import(fileUrl);
      const skill = module.default;

      if (!skill || !skill.name) {
        logger.warn(`Skill inválida em: ${folderName}`);
        return;
      }

      // evita duplicação
      if (this.skills.has(skill.name)) {
        logger.warn(`Skill duplicada ignorada: ${skill.name}`);
        return;
      }

      skill.context = this.context;
      skill.__initialized = false;

      this.skills.set(skill.name, skill);

      logger.debug(`Skill carregada: ${skill.name}`);
    } catch (err) {
      logger.error(`Erro ao carregar skill [${folderName}]:`, err.message);
    }
  }

  // APPLY CONFIG
  applyConfig() {
    const config = this.context.config.skills || {};

    for (const [name, skill] of this.skills.entries()) {
      const isEnabled = config[name] !== false;

      if (isEnabled) {
        skill.enabled = true;
        this.enabledSkills.set(name, skill);
      } else {
        skill.enabled = false;
        logger.info(`Skill desativada: ${name}`);
      }
    }
  }

  // TOGGLE SKILL
  async toggleSkill(name, active) {
    try {
      const skill = this.skills.get(name);

      if (!skill) {
        logger.warn(`Skill não encontrada: ${name}`);
        return false;
      }

      if (active) {
        skill.enabled = true;
        this.enabledSkills.set(name, skill);

        if (typeof skill.init === "function" && !skill.__initialized) {
          await skill.init(this.context);
          skill.__initialized = true;
        }
      } else {
        skill.enabled = false;
        this.enabledSkills.delete(name);

        if (typeof skill.shutdown === "function") {
          await skill.shutdown(this.context);
        }

        skill.__initialized = false;
      }

      logger.info(`Skill ${name} ${active ? "ON" : "OFF"}`);
      return true;
    } catch (err) {
      logger.error(`Erro toggle skill ${name}:`, err);
      return false;
    }
  }

  // DEPENDENCIES
  validateDependencies() {
    for (const [name, skill] of this.enabledSkills.entries()) {
      if (!skill.dependsOn) continue;

      for (const dep of skill.dependsOn) {
        if (!this.enabledSkills.has(dep)) {
          logger.warn(
            `Skill [${name}] depende de [${dep}] que está inativa`
          );
        }
      }
    }
  }

  // INIT ALL
  async initAll() {
    await this.init();

    if (!this.context.scheduler) {
      throw new Error("Scheduler não encontrado no context");
    }

    if (!this.context.state) {
      throw new Error("StateManager não encontrado no context");
    }

    for (const skill of this.enabledSkills.values()) {
      try {
        if (typeof skill.init === "function" && !skill.__initialized) {
          await skill.init(this.context);
          skill.__initialized = true;

          logger.debug(`Skill inicializada: ${skill.name}`);
        }
      } catch (err) {
        logger.error(`Erro ao iniciar skill ${skill.name}:`, err);
      }
    }
  }

  // UTILS
  get(name) {
    return this.enabledSkills.get(name);
  }

  getAll() {
    return Array.from(this.enabledSkills.values());
  }

  async run(name, input = {}) {
    const skill = this.get(name);

    if (!skill || typeof skill.execute !== "function") return null;

    try {
      return await skill.execute({
        input,
        context: this.context,
        services: this.context.services,
        skills: this,
      });
    } catch (err) {
      logger.error(`Erro na skill ${name}:`, err);
      return null;
    }
  }

  getAllCommands() {
    const commands = [];

    for (const skill of this.enabledSkills.values()) {
      if (skill.commands) {
        commands.push({
          skill: skill.name,
          commands: skill.commands,
        });
      }
    }

    return commands;
  }
}

export default function createSkillManager(context) {
  return new SkillManager(context);
}