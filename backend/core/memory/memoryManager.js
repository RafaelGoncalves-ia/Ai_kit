// backend/core/memory/memoryManager.js

const memoryStore = {
  short: [],
  long: []
};

/**
 * Salva memória simples
 */
export function saveMemory(text, type = "short") {
  const entry = {
    text,
    timestamp: Date.now()
  };

  memoryStore[type].push(entry);

  // limita memória curta
  if (memoryStore.short.length > 10) {
    memoryStore.short.shift();
  }
}

/**
 * Recupera contexto
 */
export function getMemoryContext() {
  const short = memoryStore.short.map(m => m.text).join("\n");

  return `
Memória recente:
${short}
`;
}

/**
 * Reset
 */
export function resetMemory() {
  memoryStore.short = [];
  memoryStore.long = [];
}