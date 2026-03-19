// Registry central de todas as skills disponíveis no sistema
// Define quais skills existem fisicamente no projeto
// (ativação/desativação é feita via config/skills.json)

export default [
  // ======================
  // BASE
  // ======================
  "base/ai.chat",
  "base/tts",

  // ======================
  // BEHAVIOR
  // ======================
  "behavior/randomTalk",

  // ======================
  // MASTER
  // ======================
  "master/commentActivity"
]