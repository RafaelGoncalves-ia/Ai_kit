import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import { getDB, initDB } from "../memory/sqlite.js";

const REQUIRED_COLUMNS = [
  "id",
  "term",
  "synonyms",
  "meaning",
  "weight",
  "group_name",
  "source",
  "row_index",
  "created_at",
  "updated_at"
];

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeWeight(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeLike(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}

function pickColumn(row, aliases = []) {
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias).toLowerCase();
    const match = entries.find(([key]) => normalizeText(key).toLowerCase() === normalizedAlias);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

class VocabularySkill {
  constructor() {
    this.database = null;
    this.isReady = false;
  }

  get db() {
    if (!this.database) {
      initDB();
      this.database = getDB();
    }
    return this.database;
  }

  init() {
    if (this.isReady) {
      return this;
    }

    this.ensureVocabularySchema();
    this.ensureRuntimeFlags();
    this.ensureIndexes();
    this.ensureTriggers();
    this.isReady = true;

    return this;
  }

  ensureVocabularySchema() {
    const tableExists = this.db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'vocabulary'
    `).get();

    if (!tableExists) {
      this.createVocabularyTable();
      return;
    }

    const columns = this.db.prepare(`PRAGMA table_info(vocabulary)`).all();
    const columnNames = columns.map((column) => column.name);
    const hasExpectedSchema = REQUIRED_COLUMNS.every((columnName) => columnNames.includes(columnName));

    if (hasExpectedSchema) {
      return;
    }

    const backupName = `vocabulary_legacy_${Date.now()}`;
    this.db.prepare(`ALTER TABLE vocabulary RENAME TO ${backupName}`).run();
    this.createVocabularyTable();
  }

  createVocabularyTable() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS vocabulary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term TEXT NOT NULL,
        synonyms TEXT,
        meaning TEXT,
        weight INTEGER DEFAULT 0,
        group_name TEXT,
        source TEXT,
        row_index INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();
  }

  ensureRuntimeFlags() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS vocabulary_runtime_flags (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `).run();

    this.db.prepare(`
      INSERT INTO vocabulary_runtime_flags (key, value)
      VALUES ('import_mode', '0')
      ON CONFLICT(key) DO NOTHING
    `).run();
  }

  ensureIndexes() {
    const statements = [
      `CREATE INDEX IF NOT EXISTS idx_vocabulary_term ON vocabulary (term)`,
      `CREATE INDEX IF NOT EXISTS idx_vocabulary_group_name ON vocabulary (group_name)`,
      `CREATE INDEX IF NOT EXISTS idx_vocabulary_weight ON vocabulary (weight DESC)`
    ];

    for (const sql of statements) {
      this.db.prepare(sql).run();
    }
  }

  ensureTriggers() {
    const triggers = [
      {
        name: "trg_vocabulary_block_insert",
        event: "INSERT"
      },
      {
        name: "trg_vocabulary_block_update",
        event: "UPDATE"
      },
      {
        name: "trg_vocabulary_block_delete",
        event: "DELETE"
      }
    ];

    for (const trigger of triggers) {
      this.db.prepare(`DROP TRIGGER IF EXISTS ${trigger.name}`).run();
      this.db.prepare(`
        CREATE TRIGGER ${trigger.name}
        BEFORE ${trigger.event} ON vocabulary
        FOR EACH ROW
        WHEN COALESCE(
          (SELECT value FROM vocabulary_runtime_flags WHERE key = 'import_mode'),
          '0'
        ) != '1'
        BEGIN
          SELECT RAISE(ABORT, 'vocabulary is read-only outside import mode');
        END
      `).run();
    }
  }

  setImportMode(enabled) {
    this.init();
    this.db.prepare(`
      INSERT INTO vocabulary_runtime_flags (key, value)
      VALUES ('import_mode', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(enabled ? "1" : "0");
  }

  importFromExcel(filePath) {
    this.init();

    const resolvedPath = path.resolve(String(filePath || ""));
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      throw new Error("Arquivo Excel nao encontrado.");
    }

    const workbook = XLSX.readFile(resolvedPath);
    const firstSheetName = workbook.SheetNames?.[0];

    if (!firstSheetName) {
      throw new Error("A planilha nao possui abas.");
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false
    });

    const now = new Date().toISOString();
    const normalizedRows = rows
      .map((row, index) => ({
        term: normalizeText(pickColumn(row, ["Termo", "termo"])),
        synonyms: normalizeNullableText(pickColumn(row, ["Sinônimos", "Sinonimos", "sinônimos", "sinonimos"])),
        meaning: normalizeNullableText(pickColumn(row, ["Significado", "significado"])),
        weight: normalizeWeight(pickColumn(row, ["Peso", "peso"])),
        group_name: normalizeNullableText(pickColumn(row, ["grupo", "Grupo", "group_name"])),
        source: path.basename(resolvedPath),
        row_index: index + 2,
        created_at: now,
        updated_at: now
      }))
      .filter((row) => row.term);

    const clearVocabulary = this.db.prepare(`DELETE FROM vocabulary`);
    const insertVocabulary = this.db.prepare(`
      INSERT INTO vocabulary (
        term,
        synonyms,
        meaning,
        weight,
        group_name,
        source,
        row_index,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      clearVocabulary.run();

      for (const row of normalizedRows) {
        insertVocabulary.run(
          row.term,
          row.synonyms,
          row.meaning,
          row.weight,
          row.group_name,
          row.source,
          row.row_index,
          row.created_at,
          row.updated_at
        );
      }
    });

    this.setImportMode(true);
    try {
      transaction();
    } finally {
      this.setImportMode(false);
    }

    return {
      imported: normalizedRows.length,
      filePath: resolvedPath,
      sheetName: firstSheetName
    };
  }

  getByTerm(term) {
    this.init();
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) {
      return null;
    }

    return this.db.prepare(`
      SELECT *
      FROM vocabulary
      WHERE LOWER(term) = LOWER(?)
      ORDER BY weight DESC, id ASC
      LIMIT 1
    `).get(normalizedTerm) || null;
  }

  search(query = "", limit = 20) {
    this.init();
    const normalizedQuery = normalizeText(query);
    const safeLimit = Math.max(1, Math.min(Number(limit || 20), 100));

    if (!normalizedQuery) {
      return this.db.prepare(`
        SELECT *
        FROM vocabulary
        ORDER BY weight DESC, term COLLATE NOCASE ASC
        LIMIT ?
      `).all(safeLimit);
    }

    const like = `%${escapeLike(normalizedQuery.toLowerCase())}%`;
    return this.db.prepare(`
      SELECT *
      FROM vocabulary
      WHERE LOWER(term) LIKE ? ESCAPE '\\'
         OR LOWER(COALESCE(synonyms, '')) LIKE ? ESCAPE '\\'
         OR LOWER(COALESCE(meaning, '')) LIKE ? ESCAPE '\\'
         OR LOWER(COALESCE(group_name, '')) LIKE ? ESCAPE '\\'
      ORDER BY weight DESC, term COLLATE NOCASE ASC
      LIMIT ?
    `).all(like, like, like, like, safeLimit);
  }

  getMeta() {
    this.init();
    const totalRow = this.db.prepare(`SELECT COUNT(*) AS total FROM vocabulary`).get();
    const groups = this.db.prepare(`
      SELECT COALESCE(group_name, 'sem-grupo') AS name, COUNT(*) AS total
      FROM vocabulary
      GROUP BY COALESCE(group_name, 'sem-grupo')
      ORDER BY total DESC, name ASC
    `).all();

    return {
      total: Number(totalRow?.total || 0),
      groups: groups.map((group) => ({
        name: group.name,
        total: Number(group.total || 0)
      }))
    };
  }
}

let vocabularySkillInstance = null;

export function getVocabularySkill() {
  if (!vocabularySkillInstance) {
    vocabularySkillInstance = new VocabularySkill().init();
  }
  return vocabularySkillInstance;
}

export default VocabularySkill;
