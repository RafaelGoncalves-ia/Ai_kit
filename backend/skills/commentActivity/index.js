// backend/skills/base/commentActivity/index.js
export default function createCommentActivitySkill(context) {
  return {
    name: "commentActivity",
    commands: ["falar", "perguntar"],
    init() {
      console.log("Skill Comentário de Atividade inicializada")
    }
  }
}