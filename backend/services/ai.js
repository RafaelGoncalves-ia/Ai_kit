import fetch from "node-fetch";
import { getMemoryContext, saveMemory } from "../core/memory/memoryManager.js";
import { captureScreen } from "./vision.js";

export default function createAIService(context) {
  const OLLAMA_URL =
    context.config.system?.ollamaUrl || "http://localhost:11434";

  let currentModel =
    context.config.system?.defaultModel ||
    "huihui_ai/qwen3.5-abliterated:4b";

  // ======================
  // LISTAR MODELOS
  // ======================
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

  // ======================
  // DEFINIR MODELO
  // ======================
  function setModel(modelName) {
    currentModel = modelName;
  }

  function getModel() {
    return currentModel;
  }

  // ======================
  // DETECTAR VISÃO
  // ======================
  function detectVisionCommand(text) {
    const triggers = ["olha", "ve", "ver", "analisa", "tela"];

    return triggers.some((t) => text.toLowerCase().includes(t));
  }

  // ======================
  // CHAT
  // ======================
  async function chat(userMessage) {
    try {
      const memoryContext = getMemoryContext();

      const finalPrompt = `
${memoryContext}

Usuário: ${userMessage}
`;

      let images = [];

      // 👁️ visão
      if (detectVisionCommand(userMessage)) {
        console.log("[VISION] capturando tela...");
        const img = await captureScreen();
        images.push(img);
      }

      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: currentModel,
          messages: [
            {
              role: "user",
              content: finalPrompt
            }
          ],
          images
        })
      });

      const data = await res.json();

      const responseText =
        data.message?.content || "Erro ao responder.";

      // 🧠 salva memória
      saveMemory(`Usuário: ${userMessage}`);
      saveMemory(`IA: ${responseText}`);

      return {
        text: responseText,
        speak: true
      };
    } catch (err) {
      console.error("Erro no chat IA:", err);

      return {
        text: "Deu erro ao falar com a IA.",
        speak: false
      };
    }
  }

  return {
    chat,
    listModels,
    setModel,
    getModel
  };
}