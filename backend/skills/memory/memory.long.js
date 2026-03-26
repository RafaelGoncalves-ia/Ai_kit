//memory.long.js
import { saveLongMemory, getLongMemory } from "./memory.repository.js";

/**
 * Memória de longo prazo
 */

export function addLongMemory(entry) {
  // só salva coisas relevantes
  if (!entry || !entry.type) return;

  saveLongMemory(entry);
}

export function fetchLongMemory() {
  return getLongMemory();
}