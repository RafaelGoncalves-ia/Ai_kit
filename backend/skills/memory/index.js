import { initDB } from "./sqlite.js";
import { extractMemory, buildContext } from "./memory.semantic.js";

export default {
  name: "memory",

  async init() {
    initDB();
  },

  // 🔥 NÃO BLOQUEIA MAIS
  processInput(text) {
    extractMemory(text);
  },

  async getContext() {
    return await buildContext();
  }
};