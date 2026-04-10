import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

let db;

export function initDB() {
  const dbDir = path.resolve("F:/AI/Ai_kit/backend/database");

  // 🔥 garante que a pasta existe
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, "memory.db");

  db = new Database(dbPath);

  // ======================
  // TABELA: MEMÓRIA
  // ======================
  db.prepare(`
    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      content TEXT,
      relevance REAL DEFAULT 0.5,
      created_at INTEGER
    )
  `).run();

  // Adicionar coluna relevance se não existir
  try {
    db.prepare(`ALTER TABLE memory ADD COLUMN relevance REAL DEFAULT 0.5`).run();
  } catch (e) {
    // Coluna já existe
  }

  // ======================
  // TABELA: VOCABULÁRIO
  // ======================
  db.prepare(`
    CREATE TABLE IF NOT EXISTS vocabulary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phrase TEXT,
      created_at INTEGER
    )
  `).run();

  // ======================
  // TABELA: HISTÓRICO
  // ======================
  db.prepare(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT,
      role TEXT,
      content TEXT,
      created_at INTEGER
    )
  `).run();

  console.log("[Memory] SQLite inicializado");
}

export function getDB() {
  return db;
}