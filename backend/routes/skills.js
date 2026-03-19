import express from "express";

export default function createSkillsRoutes(context) {
    const router = express.Router();

    // Retorna todas as skills carregadas
    router.get("/", (req, res) => {
        const skills = context.core.skillManager.getAllSkills().map(skill => ({
            name: skill.name,
            description: skill.description,
            active: skill.active,
            configPath: skill.configPath
        }));
        res.json(skills);
    });

    return router;
}