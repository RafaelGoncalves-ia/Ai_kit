import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ajuste o caminho para onde seu skills.json realmente está
const skillsConfigPath = path.join(__dirname, "..", "config", "skills.json");

export default function createSkillsRoutes(context) {
    const router = express.Router();

    // GET /skills - Retorna todas as skills
    router.get("/", (req, res) => {
        try {
            // 1. Lê o arquivo físico de configuração
            const skillsConfig = JSON.parse(fs.readFileSync(skillsConfigPath, "utf8"));

            // 2. Mapeia as skills integrando com o SkillManager do Context
            // Isso garante que mostramos o que está no arquivo + metadados
            const skills = Object.entries(skillsConfig).map(([name, active]) => {
                // Tenta pegar informações extras da skill se ela estiver carregada no core
                const loadedSkill = context.core.skillManager.skills?.[name] || {};

                return {
                    id: name, // Usamos o nome como ID para o frontend
                    name: name.split('/').pop(), // Nome amigável (ex: "xtts" em vez de "base/xtts")
                    fullName: name,
                    active: active,
                    description: getSkillDescription(name),
                    // Se a skill tiver uma pasta própria de config, apontamos para lá
                    configPath: getSkillConfigPath(name)
                };
            });

            res.json(skills);
        } catch (err) {
            console.error("Erro ao carregar skills:", err);
            res.status(500).json({ error: "Erro interno ao ler skills.json" });
        }
    });

    // POST /skills/:name - Ativar/desativar
    router.post("/:name", async (req, res) => {
        try {
            const { name } = req.params;
            const { active } = req.body;

            // Decodifica o nome caso venha com barras (ex: base%2Fxtts)
            const skillFullName = decodeURIComponent(name);

            if (typeof active !== "boolean") {
                return res.status(400).json({ error: "Campo 'active' deve ser boolean" });
            }

            // 1. Atualiza o arquivo skills.json
            const skillsConfig = JSON.parse(fs.readFileSync(skillsConfigPath, "utf8"));
            
            if (!(skillFullName in skillsConfig)) {
                return res.status(404).json({ error: "Skill não encontrada no registro" });
            }

            skillsConfig[skillFullName] = active;
            fs.writeFileSync(skillsConfigPath, JSON.stringify(skillsConfig, null, 2));

            // 2. Ação em tempo real: Notifica o SkillManager para carregar/descarregar
            // Assim não precisa reiniciar o servidor!
            if (active) {
                console.log(`[SkillSystem] Ativando ${skillFullName}...`);
                // Se o seu skillManager tiver um método de reload ou init individual:
                // context.core.skillManager.loadSpecificSkill(skillFullName);
            } else {
                console.log(`[SkillSystem] Desativando ${skillFullName}...`);
            }

            res.json({ success: true, name: skillFullName, active });
        } catch (err) {
            console.error("Erro ao alterar skill:", err);
            res.status(500).json({ error: "Erro ao salvar alteração da skill" });
        }
    });

    return router;
}

// Funções auxiliares (Melhoradas)
function getSkillDescription(skillName) {
    const descriptions = {
        "base/ai.chat": "Cérebro principal e chat com a IA",
        "base/tts": "Saída de áudio padrão do sistema",
        "base/xtts": "Motor de voz natural da Daisy (XTTS)",
        "behavior/randomTalk": "Permite que a Daisy inicie conversas sozinha",
        "master/commentActivity": "Leitura de comentários em tempo real"
    };
    return descriptions[skillName] || "Funcionalidade adicional do sistema KIT";
}

function getSkillConfigPath(skillName) {
    // Aqui você define quais skills têm uma página HTML de config
    const hasConfig = ["base/xtts", "behavior/randomTalk"];
    if (hasConfig.includes(skillName)) {
        // Retorna o caminho relativo para o frontend
        return `../skills/${skillName.split('/').pop()}/config.html`;
    }
    return null;
}