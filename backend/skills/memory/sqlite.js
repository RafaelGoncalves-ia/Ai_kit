import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

let db;

const DB_DIR = path.resolve("backend/database");
const DB_PATH = path.join(DB_DIR, "memory.db");

function ensureColumn(database, tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    database.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
}

function createIndexes(database) {
  const statements = [
    `CREATE INDEX IF NOT EXISTS idx_conversations_group_created ON conversations (group_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_conversations_role_created ON conversations (role, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_memory_group_updated ON memory (group_id, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_memory_type_relevance ON memory (type, relevance DESC, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_memory_key ON memory (key)`,
    `CREATE INDEX IF NOT EXISTS idx_vocabulary_group_updated ON vocabulary (group_id, updated_at DESC)`
  ];

  for (const sql of statements) {
    database.prepare(sql).run();
  }
}

function migrateLegacyRows(database) {
  const legacyConversationRows = database.prepare(`
    SELECT id, content, created_at
    FROM memory
    WHERE type = 'conversation'
    ORDER BY created_at ASC
  `).all();

  const legacyVocabularyRows = database.prepare(`
    SELECT id, content, created_at
    FROM memory
    WHERE type = 'vocabulary'
    ORDER BY created_at ASC
  `).all();

  const insertConversation = database.prepare(`
    INSERT INTO conversations (group_id, role, content, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const insertVocabulary = database.prepare(`
    INSERT INTO vocabulary (phrase, group_id, source, weight, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const deleteMemoryRow = database.prepare(`DELETE FROM memory WHERE id = ?`);

  const transaction = database.transaction(() => {
    for (const row of legacyConversationRows) {
      const content = String(row.content || "").trim();
      const match = content.match(/^(user|assistant|system)\s*:\s*(.+)$/i);
      const role = match?.[1]?.toLowerCase() || "user";
      const body = match?.[2] || content;

      insertConversation.run(
        "legacy-import",
        role,
        body,
        Number(row.created_at || Date.now())
      );
      deleteMemoryRow.run(row.id);
    }

    for (const row of legacyVocabularyRows) {
      const phrase = String(row.content || "").trim();
      if (phrase) {
        const timestamp = Number(row.created_at || Date.now());
        insertVocabulary.run(
          phrase,
          null,
          "legacy-import",
          0.5,
          timestamp,
          timestamp
        );
      }
      deleteMemoryRow.run(row.id);
    }
  });

  transaction();
}

function createTables(database) {
  database.prepare(`
    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      key TEXT,
      content TEXT NOT NULL,
      source TEXT,
      confidence REAL DEFAULT 0.5,
      relevance REAL DEFAULT 0.5,
      group_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS vocabulary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phrase TEXT NOT NULL,
      group_id TEXT,
      source TEXT,
      weight REAL DEFAULT 0.5,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT,
      role TEXT,
      content TEXT,
      created_at INTEGER
    )
  `).run();
}

function migrateTables(database) {
  ensureColumn(database, "memory", "key", "TEXT");
  ensureColumn(database, "memory", "source", "TEXT");
  ensureColumn(database, "memory", "confidence", "REAL DEFAULT 0.5");
  ensureColumn(database, "memory", "relevance", "REAL DEFAULT 0.5");
  ensureColumn(database, "memory", "group_id", "TEXT");
  ensureColumn(database, "memory", "updated_at", "INTEGER");

  database.prepare(`
    UPDATE memory
    SET updated_at = COALESCE(updated_at, created_at, CAST(strftime('%s','now') AS INTEGER) * 1000)
    WHERE updated_at IS NULL
  `).run();

  ensureColumn(database, "vocabulary", "group_id", "TEXT");
  ensureColumn(database, "vocabulary", "source", "TEXT");
  ensureColumn(database, "vocabulary", "weight", "REAL DEFAULT 0.5");
  ensureColumn(database, "vocabulary", "updated_at", "INTEGER");

  database.prepare(`
    UPDATE vocabulary
    SET updated_at = COALESCE(updated_at, created_at, CAST(strftime('%s','now') AS INTEGER) * 1000)
    WHERE updated_at IS NULL
  `).run();
}

export function initDB() {
  if (db) {
    return db;
  }

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  createTables(db);
  migrateTables(db);
  migrateLegacyRows(db);
  createIndexes(db);

  console.log("[Memory] SQLite inicializado");
  return db;
}

export function getDB() {
  return db || initDB();
}
