// backend/skills/base/tts/index.js
export default function createttsSkill(context) {
  return {
    name: "tts",
    commands: ["falar", "perguntar"],
    init() {
      console.log("Skill TTS inicializada")
    }
  }
}