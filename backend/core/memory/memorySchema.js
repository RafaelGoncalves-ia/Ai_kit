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

function isLegacyMemoryTable(columnNames = []) {
  const columns = new Set(columnNames);
  return columns.has("type") || columns.has("relevance") || columns.has("group_id") || !columns.has("category");
}

function backupLegacyMemoryTable(database, logger) {
  const columnNames = getColumnNames(database, "memory");
  if (!columnNames.length || !isLegacyMemoryTable(columnNames)) {
    return;
  }

  let backupName = "memory_legacy_semantic_backup";
  let suffix = 1;
  while (tableExists(database, backupName)) {
    backupName = `memory_legacy_semantic_backup_${suffix}`;
    suffix += 1;
  }

  database.prepare(`ALTER TABLE memory RENAME TO ${backupName}`).run();
  logger?.warn?.(`[Memory] tabela legacy renomeada para ${backupName}`);
}

export function ensureLongTermMemorySchema(database, logger = console) {
  backupLegacyMemoryTable(database, logger);

  database.prepare(`
    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      content TEXT NOT NULL,
      weight REAL DEFAULT 0.3,
      confidence REAL DEFAULT 0.8,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(category, key)
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS memory_checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      last_message_id TEXT,
      updated_at INTEGER NOT NULL
    )
  `).run();

  const indexStatements = [
    `CREATE INDEX IF NOT EXISTS idx_memory_category_updated ON memory (category, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_memory_key ON memory (key)`,
    `CREATE INDEX IF NOT EXISTS idx_memory_updated ON memory (updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_memory_checkpoints_updated ON memory_checkpoints (updated_at DESC)`
  ];

  for (const statement of indexStatements) {
    database.prepare(statement).run();
  }
}
