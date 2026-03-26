
//memory.short.js
// Memória de curto prazo (buffer circular)

const MAX_SHORT_MEMORY = 50;

let shortMemory = [];

export function addShortMemory(entry) {
  shortMemory.push({
    ...entry,
    timestamp: Date.now(),
  });

  if (shortMemory.length > MAX_SHORT_MEMORY) {
    shortMemory.shift();
  }
}

export function getShortMemory() {
  return shortMemory;
}

export function getLastMemory() {
  return shortMemory[shortMemory.length - 1] || null;
}