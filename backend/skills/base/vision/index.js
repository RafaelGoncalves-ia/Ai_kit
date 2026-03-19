// backend/skills/base/vision/index.js
export default function createVisionSkill(context) {
  return {
    name: "vision",
    commands: ["falar", "perguntar"],
    init() {
      console.log("Skill Visão Inicializada")
    }
  }
}