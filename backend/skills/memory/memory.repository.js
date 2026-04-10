import { getDB } from "./sqlite.js";

/**
 * Salva memória estruturada
 */
export function saveMemory({ type, key, value, relevance = 0.5 }) {
  if (!type || !value) {
    console.warn("[Memory] inválido:", { type, key, value });
    return;
  }

  const db = getDB();

  const stmt = db.prepare(`
    INSERT INTO memory (type, content, relevance, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const content = key ? `${key}: ${value}` : value;

  stmt.run(type, content, relevance, Date.now());
}

/**
 * Busca memória recente
 */
export function getRecentMemory(limit = 10) {
  const db = getDB();

  const stmt = db.prepare(`
    SELECT content, type, relevance, created_at
    FROM memory
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return stmt.all(limit);
}

/**
 * Busca por tipo
 */
export function getMemoryByType(type, limit = 10) {
  const db = getDB();

  const stmt = db.prepare(`
    SELECT content, relevance
    FROM memory
    WHERE type = ?
    ORDER BY relevance DESC, created_at DESC
    LIMIT ?
  `);

  return stmt.all(type, limit).map(r => ({ content: r.content, relevance: r.relevance }));
}