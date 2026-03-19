// Serviço de IA (Ollama)
// - Lista modelos disponíveis
// - Permite trocar modelo em tempo real
// - Faz chat

import fetch from "node-fetch"

export default function createAIService(context) {
  const OLLAMA_URL = context.config.system?.ollamaUrl || "http://localhost:11434"

  let currentModel =
    context.config.system?.defaultModel ||
    "huihui_ai/qwen2.5-abliterate:14b"

  // ======================
  // LISTAR MODELOS
  // ======================
  async function listModels() {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`)
      const data = await res.json()

      return data.models?.map((m) => m.name) || []
    } catch (err) {
      console.error("Erro ao listar modelos:", err)
      return []
    }
  }

  // ======================
  // DEFINIR MODELO
  // ======================
  function setModel(modelName) {
    currentModel = modelName
  }

  function getModel() {
    return currentModel
  }

  // ======================
  // CHAT
  // ======================
  async function chat(prompt) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: currentModel,
          prompt: prompt,
          stream: false
        })
      })

      const data = await res.json()

      return {
        text: data.response || "Erro ao responder.",
        speak: true // padrão ligado (depois vamos controlar por skill)
      }
    } catch (err) {
      console.error("Erro no chat IA:", err)

      return {
        text: "Deu erro ao falar com a IA.",
        speak: false
      }
    }
  }

  return {
    chat,
    listModels,
    setModel,
    getModel
  }
}