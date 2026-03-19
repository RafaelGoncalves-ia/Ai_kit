// backend/skills/base/ai.chat/index.js
export default function createAIChatSkill(context) {
  return {
    name: "ai.chat",
    commands: ["falar", "perguntar"],
    init() {
      console.log("Skill AI Chat inicializada")
    }
  }
}