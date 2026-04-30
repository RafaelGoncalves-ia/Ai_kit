import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import logger from "../../utils/logger.js";
import { ensureLongTermMemorySchema } from "../../core/memory/memorySchema.js";

let db;

const DB_DIR = path.resolve("backend/database");
const DB_PATH = path.join(DB_DIR, "memory.db");

function tableExists(database, tableName) {
  const row = database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName);

  return !!row;
}

function getColumnNames(database, tableName) {
  if (!tableExists(database, tableName)) {
    return [];
  }

  return database.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function createConversationTable(database) {
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

function createConversationIndexes(database) {
  const statements = [
    `CREATE INDEX IF NOT EXISTS idx_conversations_group_created ON conversations (group_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_conversations_role_created ON conversations (role, created_at DESC)`
  ];

  for (const statement of statements) {
    database.prepare(statement).run();
  }
}

function migrateLegacyConversationRows(database) {
  const memoryColumns = new Set(getColumnNames(database, "memory"));
  if (!memoryColumns.has("type") || !memoryColumns.has("content")) {
    return;
  }

  const legacyConversationRows = database.prepare(`
    SELECT id, content, created_at
    FROM memory
    WHERE type = 'conversation'
    ORDER BY created_at ASC
  `).all();

  if (!legacyConversationRows.length) {
    return;
  }

  const insertConversation = database.prepare(`
    INSERT INTO conversations (group_id, role, content, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const deleteMemoryRow = database.prepare(`DELETE FROM memory WHERE id = ?`);

  const transaction = database.transaction(() => {
    for (const row of legacyConversationRows) {
      const content = String(row.content || "").replace(/\s+/g, " ").trim();
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
  });

  transaction();
  logger.info(`[Memory] ${legacyConversationRows.length} mensagens legacy migradas para conversations`);
}

export function initDB() {
  if (db) {
    return db;
  }

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  createConversationTable(db);
  migrateLegacyConversationRows(db);
  ensureLongTermMemorySchema(db, logger);
  createConversationIndexes(db);

  logger.info("[Memory] SQLite inicializado");
  return db;
}

export function getDB() {
  return db || initDB();
}
