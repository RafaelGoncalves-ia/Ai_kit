import { initDB } from "./sqlite.js";
import { extractMemory, extractAIMemory, buildContext } from "./memory.semantic.js";

export default {
  name: "memory",

  async init() {
    initDB();
  },

  // 🔥 NÃO BLOQUEIA MAIS
  async processInput(text) {
    await extractMemory(text, this.context);
  },

  async processAIResponse(text) {
    await extractAIMemory(text, this.context);
  },

  async getContext() {
    return await buildContext();
  }
};