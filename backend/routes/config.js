// Rota de configurações
// Gerencia configurações globais do sistema

import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

// Caminhos dos arquivos de configuração
const configDir = path.resolve("backend/config");
const skillsConfigPath = path.join(configDir, "skills.json");

// ==========================
// GET /config - Retorna configuração atual
// ==========================
router.get("/", async (req, res) => {
    try {
        // Carregar skills
        const skillsConfig = JSON.parse(fs.readFileSync(skillsConfigPath, "utf8"));

        // Carregar configuração do .env ou defaults
        const config = {
            version: "1.0.0",
            aiModel: process.env.DEFAULT_MODEL || "llama3",
            xttsEnabled: process.env.XTTS_ENABLED === "true",
            microphoneEnabled: false,
            muted: false,
            skills: Object.entries(skillsConfig).map(([name, active]) => ({
                name,
                active,
                description: getSkillDescription(name),
                configPath: getSkillConfigPath(name)
            }))
        };

        res.json(config);
    } catch (err) {
        console.error("Erro ao carregar configuração:", err);
        res.status(500).json({ error: "Erro interno" });
    }
});

// ==========================
// POST /config - Salva configuração
// ==========================
router.post("/", async (req, res) => {
    try {
        const { aiModel, xttsEnabled, microphoneEnabled, muted } = req.body;

        // Aqui você pode salvar no .env ou em um arquivo de config
        // Por enquanto, apenas valida e retorna sucesso

        console.log("Configuração recebida:", { aiModel, xttsEnabled, microphoneEnabled, muted });

        res.json({ success: true });
    } catch (err) {
        console.error("Erro ao salvar configuração:", err);
        res.status(500).json({ error: "Erro interno" });
    }
});

// ==========================
// GET /models - Lista modelos disponíveis
// ==========================
router.get("/models", async (req, res) => {
    try {
        // Simular lista de modelos (deve vir do serviço de IA)
        const models = [
            { name: "llama3", size: "8B" },
            { name: "llama3:70b", size: "70B" },
            { name: "codellama", size: "13B" },
            { name: "mistral", size: "7B" }
        ];

        res.json({ models });
    } catch (err) {
        console.error("Erro ao listar modelos:", err);
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