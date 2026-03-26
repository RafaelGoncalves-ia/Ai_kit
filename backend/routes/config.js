import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caminho para o skills.json (ajustado para subir da pasta routes)
const skillsConfigPath = path.join(__dirname, "..", "config", "skills.json");

export default function createConfigRoutes(context) {
    const router = express.Router();

    // GET /config - Retorna configuração atual
    router.get("/", async (req, res) => {
        try {
            const skillsConfig = JSON.parse(fs.readFileSync(skillsConfigPath, "utf8"));

            // Pegamos os valores atuais direto do objeto context (memória do servidor)
            const config = {
                version: "1.1.0",
                aiModel: context.config.system.defaultModel,
                xttsEnabled: context.core.skillManager.skills?.["base/xtts"]?.active || false,
                microphoneEnabled: context.core.skillManager.skills?.["base/stt"]?.active || false,
                muted: context.config.system.muted || false,
                // Opcional: listar skills aqui também se o frontend pedir
                skills: Object.entries(skillsConfig).map(([name, active]) => ({
                    name,
                    active
                }))
            };

            res.json(config);
        } catch (err) {
            console.error("Erro ao carregar configuração:", err);
            res.status(500).json({ error: "Erro ao ler configurações" });
        }
    });

    // POST /config - Salva e aplica configuração
    router.post("/", async (req, res) => {
        try {
            const { aiModel, xttsEnabled, microphoneEnabled, muted } = req.body;

            // 1. Atualiza o Cérebro (IA) em tempo real
            if (aiModel) {
                console.log(`[Config] Trocando modelo para: ${aiModel}`);
                context.config.system.defaultModel = aiModel;
                // Se o seu serviço de AI precisar ser reiniciado ou avisado:
                // context.services.ai.updateModel(aiModel);
            }

            // 2. Atualiza Status de Voz e Microfone no SkillManager
            // Isso envia o comando de ligar/desligar para as skills base
            if (context.core.skillManager) {
                if (xttsEnabled !== undefined) {
                    await context.core.skillManager.toggleSkill("base/xtts", xttsEnabled);
                }
                if (microphoneEnabled !== undefined) {
                    await context.core.skillManager.toggleSkill("base/stt", microphoneEnabled);
                }
            }

            context.config.system.muted = muted;

            res.json({ success: true, message: "Configurações aplicadas com sucesso" });
        } catch (err) {
            console.error("Erro ao salvar configuração:", err);
            res.status(500).json({ error: "Erro ao aplicar configurações" });
        }
    });

    return router;
}