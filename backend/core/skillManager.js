// backend/core/skillManager.js
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

  async init() {
    logger.info("Inicializando SkillManager (Modo Dinamico)...");
    await this.loadSkills();
    this.applyConfig();
    this.validateDependencies();
    logger.info(`Skills carregadas: Disponiveis=${this.skills.size}, Ativas=${this.enabledSkills.size}`);
  }

  async loadSkills() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const skillsRoot = path.resolve(__dirname, "../skills");

    if (!fs.existsSync(skillsRoot)) return;

    const categories = fs.readdirSync(skillsRoot);

    for (const category of categories) {
      // Categoria descontinuada: runtime ignora esse namespace.
      if (category === "base") continue;

      const categoryPath = path.join(skillsRoot, category);
      if (!fs.statSync(categoryPath).isDirectory()) continue;

      const directIndex = path.join(categoryPath, "index.js");
      const directSkill = path.join(categoryPath, "skill.js");
      if (fs.existsSync(directIndex) || fs.existsSync(directSkill)) {
        await this.loadSkillFromPath(categoryPath, category);
      }

      const subfolders = fs.readdirSync(categoryPath);
      for (const folder of subfolders) {
        const skillDir = path.join(categoryPath, folder);
        if (!fs.statSync(skillDir).isDirectory()) continue;
        await this.loadSkillFromPath(skillDir, folder);
      }
    }
  }

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
      if (!skill || !skill.name) return logger.warn(`Skill invalida em: ${folderName}`);

      if (this.skills.has(skill.name)) return logger.warn(`Skill duplicada ignorada: ${skill.name}`);

      skill.context = this.context;
      skill.__initialized = false;
      this.skills.set(skill.name, skill);
      logger.debug(`Skill carregada: ${skill.name}`);
    } catch (err) {
      logger.error(`Erro ao carregar skill [${folderName}]:`, err.message);
    }
  }

  applyConfig() {
    const config = this.context.config.skills || {};
    for (const [name, skill] of this.skills.entries()) {
      const isEnabled = config[name] !== false;
      skill.enabled = isEnabled;
      if (isEnabled) this.enabledSkills.set(name, skill);
      else logger.info(`Skill desativada: ${name}`);
    }
  }

  async toggleSkill(name, active) {
    try {
      const skill = this.skills.get(name);
      if (!skill) return logger.warn(`Skill nao encontrada: ${name}`);

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
        if (typeof skill.shutdown === "function") await skill.shutdown(this.context);
        skill.__initialized = false;
      }

      logger.info(`Skill ${name} ${active ? "ON" : "OFF"}`);
      return true;
    } catch (err) {
      logger.error(`Erro toggle skill ${name}:`, err);
      return false;
    }
  }

  validateDependencies() {
    for (const [name, skill] of this.enabledSkills.entries()) {
      if (!skill.dependsOn) continue;
      for (const dep of skill.dependsOn) {
        if (!this.enabledSkills.has(dep)) {
          logger.warn(`Skill [${name}] depende de [${dep}] que esta inativa`);
        }
      }
    }
  }

  async initAll() {
    await this.init();
    if (!this.context.scheduler) throw new Error("Scheduler nao encontrado no context");
    if (!this.context.state) throw new Error("StateManager nao encontrado no context");

    for (const skill of this.enabledSkills.values()) {
      if (typeof skill.init === "function" && !skill.__initialized) {
        try {
          await skill.init(this.context);
          skill.__initialized = true;
          logger.debug(`Skill inicializada: ${skill.name}`);
        } catch (err) {
          logger.error(`Erro ao iniciar skill ${skill.name}:`, err);
        }
      }
    }
  }

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
        tools: this.context.tools,
        invokeTool: this.context.invokeTool,
        skills: this
      });
    } catch (err) {
      logger.error(`Erro na skill ${name}:`, err);
      return null;
    }
  }

  getAllCommands() {
    const commands = [];
    for (const skill of this.enabledSkills.values()) {
      if (skill.commands) commands.push({ skill: skill.name, commands: skill.commands });
    }
    return commands;
  }
}

export default function createSkillManager(context) {
  return new SkillManager(context);
}
