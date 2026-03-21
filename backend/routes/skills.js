import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const skillsConfigPath = path.join("backend", "config", "skills.json");

// ==========================
// GET /skills - Retorna todas as skills
// ==========================
router.get("/", (req, res) => {
    try {
        const skillsConfig = JSON.parse(fs.readFileSync(skillsConfigPath, "utf8"));

        const skills = Object.entries(skillsConfig).map(([name, active]) => ({
            name,
            active,
            description: getSkillDescription(name),
            configPath: getSkillConfigPath(name)
        }));

        res.json(skills);
    } catch (err) {
        console.error("Erro ao carregar skills:", err);
        res.status(500).json({ error: "Erro interno" });
    }
});

// ==========================
// POST /skills/:name - Ativar/desativar skill específica
// ==========================
router.post("/:name", (req, res) => {
    try {
        const { name } = req.params;
        const { active } = req.body;

        if (typeof active !== "boolean") {
            return res.status(400).json({ error: "Campo 'active' deve ser boolean" });
        }

        // Carregar configuração atual
        const skillsConfig = JSON.parse(fs.readFileSync(skillsConfigPath, "utf8"));

        if (!(name in skillsConfig)) {
            return res.status(404).json({ error: "Skill não encontrada" });
        }

        // Atualizar
        skillsConfig[name] = active;

        // Salvar
        fs.writeFileSync(skillsConfigPath, JSON.stringify(skillsConfig, null, 2));

        console.log(`Skill ${name} ${active ? 'ativada' : 'desativada'}`);

        res.json({ success: true, name, active });
    } catch (err) {
        console.error("Erro ao alterar skill:", err);
        res.status(500).json({ error: "Erro interno" });
    }
});

// ==========================
// Funções auxiliares
// ==========================
function getSkillDescription(skillName) {
    const descriptions = {
        "base/ai.chat": "Processamento de mensagens de chat com IA",
        "base/tts": "Conversão de texto em fala",
        "base/xtts": "Voz natural com XTTS",
        "behavior/randomTalk": "Fala aleatória em intervalos",
        "master/commentActivity": "Monitora atividade de comentários"
    };
    return descriptions[skillName] || "Skill personalizada";
}

function getSkillConfigPath(skillName) {
    // Verificar se existe arquivo de config para a skill
    const configPaths = {
        "base/sampleSkill": "config/config.html"
    };
    return configPaths[skillName] || null;
}

export default router;