import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "backend", "database", "production.db");
const CLIENT_PRESETS_DIR = path.join(process.cwd(), "backend", "data", "presets", "clients");

const STATUS_VALUES = [
  "idea",
  "briefing",
  "script",
  "production",
  "review",
  "scheduled",
  "published",
  "done"
];

const TYPE_VALUES = ["feed", "stories", "reels", "carousel", "ads", "script"];

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeNullableText(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeEnum(value, values, fallback) {
  const normalized = normalizeText(value).toLowerCase();
  return values.includes(normalized) ? normalized : fallback;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => normalizeText(item)).filter(Boolean));
  }

  const text = normalizeText(value);
  if (!text) return "[]";

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return JSON.stringify(parsed.map((item) => normalizeText(item)).filter(Boolean));
    }
  } catch {}

  return JSON.stringify(text.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean));
}

function parseReferences(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToDemand(row) {
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name || row.client_id || "Cliente",
    title: row.title,
    type: row.type,
    status: row.status,
    plannedDate: row.planned_date,
    publishDate: row.publish_date,
    platform: row.platform,
    responsible: row.responsible,
    priority: row.priority,
    description: row.description,
    references: parseReferences(row.reference_data),
    studioProjectId: row.studio_project_id,
    canvasProjectId: row.canvas_project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function readClientPresets() {
  if (!fs.existsSync(CLIENT_PRESETS_DIR)) return [];

  return fs.readdirSync(CLIENT_PRESETS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".client.kit"))
    .map((entry) => {
      const filePath = path.join(CLIENT_PRESETS_DIR, entry.name);
      try {
        const preset = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const id = normalizeText(preset.id) || path.basename(entry.name, ".client.kit");
        const name = normalizeText(preset.name) || id;
        return {
          id,
          name,
          segment: normalizeText(preset.segment),
          filePath
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

export default class ProductionDemandService {
  constructor() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.ensureSchema();
  }

  ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS production_demands (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        client_name TEXT,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        planned_date TEXT,
        publish_date TEXT,
        platform TEXT,
        responsible TEXT,
        priority TEXT,
        description TEXT,
        reference_data TEXT NOT NULL DEFAULT '[]',
        studio_project_id TEXT,
        canvas_project_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_production_demands_client ON production_demands(client_id);
      CREATE INDEX IF NOT EXISTS idx_production_demands_status ON production_demands(status);
      CREATE INDEX IF NOT EXISTS idx_production_demands_planned_date ON production_demands(planned_date);
      CREATE INDEX IF NOT EXISTS idx_production_demands_type ON production_demands(type);
    `);
  }

  listClients() {
    const presets = readClientPresets();
    const byId = new Map(presets.map((client) => [client.id, client]));

    const demandClients = this.db.prepare(`
      SELECT DISTINCT client_id AS id, COALESCE(NULLIF(client_name, ''), client_id) AS name
      FROM production_demands
      ORDER BY name COLLATE NOCASE
    `).all();

    demandClients.forEach((client) => {
      if (!byId.has(client.id)) {
        byId.set(client.id, { id: client.id, name: client.name || client.id, segment: "", filePath: null });
      }
    });

    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }

  normalizePayload(payload = {}, existing = {}) {
    const clientName = normalizeText(payload.clientName, existing.clientName || "");
    const clientId = normalizeText(payload.clientId, existing.clientId || clientName || "cliente-geral");

    return {
      clientId,
      clientName: clientName || clientId,
      title: normalizeText(payload.title, existing.title || "Nova demanda"),
      type: normalizeEnum(payload.type, TYPE_VALUES, existing.type || "feed"),
      status: normalizeEnum(payload.status, STATUS_VALUES, existing.status || "idea"),
      plannedDate: normalizeDate(payload.plannedDate ?? existing.plannedDate),
      publishDate: normalizeDate(payload.publishDate ?? existing.publishDate),
      platform: normalizeNullableText(payload.platform ?? existing.platform),
      responsible: normalizeNullableText(payload.responsible ?? existing.responsible),
      priority: normalizeText(payload.priority, existing.priority || "normal").toLowerCase(),
      description: normalizeNullableText(payload.description ?? existing.description),
      references: normalizeJsonArray(payload.references ?? existing.references),
      studioProjectId: normalizeNullableText(payload.studioProjectId ?? existing.studioProjectId),
      canvasProjectId: normalizeNullableText(payload.canvasProjectId ?? existing.canvasProjectId)
    };
  }

  buildWhere(filters = {}) {
    const clauses = [];
    const params = {};

    if (filters.clientId) {
      clauses.push("client_id = @clientId");
      params.clientId = normalizeText(filters.clientId);
    }
    if (filters.status) {
      clauses.push("status = @status");
      params.status = normalizeEnum(filters.status, STATUS_VALUES, "");
    }
    if (filters.type) {
      clauses.push("type = @type");
      params.type = normalizeEnum(filters.type, TYPE_VALUES, "");
    }
    if (filters.platform) {
      clauses.push("platform = @platform");
      params.platform = normalizeText(filters.platform);
    }
    if (filters.responsible) {
      clauses.push("responsible = @responsible");
      params.responsible = normalizeText(filters.responsible);
    }
    if (filters.from) {
      clauses.push("COALESCE(planned_date, publish_date) >= @from");
      params.from = normalizeDate(filters.from);
    }
    if (filters.to) {
      clauses.push("COALESCE(planned_date, publish_date) <= @to");
      params.to = normalizeDate(filters.to);
    }
    if (filters.month && /^\d{4}-\d{2}$/.test(String(filters.month))) {
      clauses.push("COALESCE(planned_date, publish_date) BETWEEN @monthStart AND @monthEnd");
      params.monthStart = `${filters.month}-01`;
      const monthEnd = new Date(`${filters.month}-01T00:00:00.000Z`);
      monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
      monthEnd.setUTCDate(0);
      params.monthEnd = monthEnd.toISOString().slice(0, 10);
    }
    if (filters.search) {
      clauses.push("(title LIKE @search OR description LIKE @search OR client_name LIKE @search OR platform LIKE @search)");
      params.search = `%${normalizeText(filters.search)}%`;
    }

    return {
      where: clauses.length ? `WHERE ${clauses.filter(Boolean).join(" AND ")}` : "",
      params
    };
  }

  list(filters = {}) {
    const { where, params } = this.buildWhere(filters);
    return this.db.prepare(`
      SELECT *
      FROM production_demands
      ${where}
      ORDER BY COALESCE(planned_date, publish_date, created_at), client_name COLLATE NOCASE, created_at
    `).all(params).map(rowToDemand);
  }

  get(id) {
    return rowToDemand(this.db.prepare("SELECT * FROM production_demands WHERE id = ?").get(id));
  }

  create(payload = {}) {
    const demand = this.normalizePayload(payload);
    const id = normalizeText(payload.id) || `prod_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const timestamp = nowIso();

    this.db.prepare(`
      INSERT INTO production_demands (
        id, client_id, client_name, title, type, status, planned_date, publish_date,
        platform, responsible, priority, description, reference_data, studio_project_id,
        canvas_project_id, created_at, updated_at
      ) VALUES (
        @id, @clientId, @clientName, @title, @type, @status, @plannedDate, @publishDate,
        @platform, @responsible, @priority, @description, @references, @studioProjectId,
        @canvasProjectId, @createdAt, @updatedAt
      )
    `).run({
      id,
      ...demand,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    return this.get(id);
  }

  update(id, payload = {}) {
    const current = this.get(id);
    if (!current) return null;
    const demand = this.normalizePayload(payload, current);

    this.db.prepare(`
      UPDATE production_demands
      SET client_id = @clientId,
          client_name = @clientName,
          title = @title,
          type = @type,
          status = @status,
          planned_date = @plannedDate,
          publish_date = @publishDate,
          platform = @platform,
          responsible = @responsible,
          priority = @priority,
          description = @description,
          reference_data = @references,
          studio_project_id = @studioProjectId,
          canvas_project_id = @canvasProjectId,
          updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id,
      ...demand,
      updatedAt: nowIso()
    });

    return this.get(id);
  }

  moveStatus(id, status) {
    const normalizedStatus = normalizeEnum(status, STATUS_VALUES, "");
    if (!normalizedStatus) {
      throw new Error("Status invalido.");
    }

    const result = this.db.prepare(`
      UPDATE production_demands
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(normalizedStatus, nowIso(), id);

    if (!result.changes) return null;
    return this.get(id);
  }

  markPublished(id) {
    const publishedAt = new Date().toISOString().slice(0, 10);
    const result = this.db.prepare(`
      UPDATE production_demands
      SET status = 'published',
          publish_date = COALESCE(publish_date, ?),
          updated_at = ?
      WHERE id = ?
    `).run(publishedAt, nowIso(), id);

    if (!result.changes) return null;
    return this.get(id);
  }

  delete(id) {
    const result = this.db.prepare("DELETE FROM production_demands WHERE id = ?").run(id);
    return result.changes > 0;
  }
}

export { STATUS_VALUES, TYPE_VALUES };
