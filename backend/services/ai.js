import fetch from "node-fetch";

export default function createAIService(context) {
  const OLLAMA_URL = context.config.system?.ollamaUrl || "http://localhost:11434";
  
  let currentModel = 
    context.config.system?.defaultModel || 
    "huihui_ai/qwen3.5-abliterated:4b";

  /**
   * Limpa texto para TTS
   */
  function cleanTextForSpeech(text) {
    return text
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/#/g, "")
      .replace(/`/g, "")
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .trim();
  }

  async function listModels() {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`);
      const data = await res.json();
      return data.models?.map((m) => m.name) || [];
    } catch (err) {
      console.error("Erro ao listar modelos:", err);
      return [];
    }
  }

  function setModel(modelName) {
    currentModel = modelName;
  }

  function getModel() {
    return currentModel;
  }

  /**
   * CHAT LIMPO (sem memória, sem visão)
   */
  async function chat(prompt, options = {}) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: currentModel,
          stream: false,
          messages: [
            {
              role: "user",
              content: prompt,
              images: options.images?.length ? options.images : undefined
            }
          ]
        })
      });

      if (!res.ok) throw new Error(`Erro Ollama: ${res.status}`);

      const data = await res.json();
      const responseText = data.message?.content || "Sem resposta.";

      return { 
        text: responseText,
        speakText: cleanTextForSpeech(responseText),
        speak: true
      };

    } catch (err) {
      console.error("Erro no chat:", err);
      return { text: "Erro técnico no chat.", speak: false };
    }
  }

  return { chat, listModels, setModel, getModel };
}