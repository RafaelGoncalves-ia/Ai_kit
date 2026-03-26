// backend/skills/base/randomTalk/index.js
export default function createRandomTalkSkill(context) {
  return {
    name: "randomTalk",
    commands: ["falar", "perguntar"],
    init() {
      console.log("Skill Talk Aleatório inicializada")
    }
  }
}