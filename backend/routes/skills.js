import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillsConfigPath = path.join(__dirname, "..", "config", "skills.json");

export default function createSkillsRoutes(context) {
  const router = express.Router();

  router.get("/", (req, res) => {
    try {
      const skillsConfig = JSON.parse(fs.readFileSync(skillsConfigPath, "utf8"));

      const skills = Object.entries(skillsConfig).map(([name, active]) => {
        const loadedSkill = context.core.skillManager.skills?.get?.(name) || {};

        return {
          id: name,
          name: name.split("/").pop(),
          fullName: name,
          active,
          description: loadedSkill.description || getSkillDescription(name),
          configPath: getSkillConfigPath(name)
        };
      });

      res.json(skills);
    } catch (err) {
      console.error("Erro ao carregar skills:", err);
      res.status(500).json({ error: "Erro interno ao ler skills.json" });
    }
  });

  router.post("/:name", async (req, res) => {
    try {
      const { name } = req.params;
      const { active } = req.body;
      const skillFullName = decodeURIComponent(name);

      if (typeof active !== "boolean") {
        return res.status(400).json({ error: "Campo 'active' deve ser boolean" });
      }

      const skillsConfig = JSON.parse(fs.readFileSync(skillsConfigPath, "utf8"));

      if (!(skillFullName in skillsConfig)) {
        return res.status(404).json({ error: "Skill nao encontrada no registro" });
      }

      skillsConfig[skillFullName] = active;
      fs.writeFileSync(skillsConfigPath, JSON.stringify(skillsConfig, null, 2));

      if (context.core.skillManager) {
        await context.core.skillManager.toggleSkill(skillFullName, active);
      }

      if (active) {
        console.log(`[SkillSystem] Ativando ${skillFullName}...`);
      } else {
        console.log(`[SkillSystem] Desativando ${skillFullName}...`);
      }

      res.json({ success: true, name: skillFullName, active });
    } catch (err) {
      console.error("Erro ao alterar skill:", err);
      res.status(500).json({ error: "Erro ao salvar alteracao da skill" });
    }
  });

  return router;
}

function getSkillDescription(skillName) {
  const descriptions = {
    randomTalk: "Permite que a KIT inicie conversas sozinha",
    audio: "Gera audio usando tool generate_audio",
    memory: "Memoria semantica da conversa",
    tasks: "Gerencia lembretes, tarefas e recorrencia do sistema",
    needs: "Camada de decisao de necessidades",
    personality: "Camada de identidade e estilo"
  };

  return descriptions[skillName] || "Funcionalidade adicional do sistema KIT";
}

function getSkillConfigPath(skillName) {
  const hasConfig = ["randomTalk"];
  if (hasConfig.includes(skillName)) {
    return `../skills/${skillName.split("/").pop()}/config.html`;
  }
  return null;
}
