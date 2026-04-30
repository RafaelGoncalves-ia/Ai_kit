import { loadConfig } from "../configLoader.js";
import { getDB, initDB } from "../../skills/memory/sqlite.js";
import { extractSearchTerms, normalizeMemoryKey } from "./memoryValidator.js";

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildCategoryMap(memoryConfig = {}) {
  const categories = Array.isArray(memoryConfig.categories) ? memoryConfig.categories : [];
  return new Map(categories.map((category) => [String(category.id || "").trim(), category]).filter(([id]) => id));
}

export function loadMemoryConfig() {
  return loadConfig("config.memory.json");
}

export default class MemoryRepository {
  constructor({ config = loadMemoryConfig(), logger = console } = {}) {
    this.config = config;
    this.logger = logger;
    this.settings = config.settings || {};
    this.categoryMap = buildCategoryMap(config);
  }

  ensureReady() {
    initDB();
    return getDB();
  }

  getCheckpoint() {
    const row = this.ensureReady().prepare(`
      SELECT id, last_message_id, updated_at
      FROM memory_checkpoints
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `).get();

    if (!row) {
      return null;
    }

    return {
      id: Number(row.id),
      lastMessageId: row.last_message_id || null,
      updatedAt: Number(row.updated_at || 0)
    };
  }

  updateCheckpoint(lastMessageId, updatedAt = Date.now()) {
    const database = this.ensureReady();
    const checkpoint = this.getCheckpoint();

    if (!checkpoint) {
      database.prepare(`
        INSERT INTO memory_checkpoints (last_message_id, updated_at)
        VALUES (?, ?)
      `).run(lastMessageId ? String(lastMessageId) : null, Number(updatedAt));
      return;
    }

    database.prepare(`
      UPDATE memory_checkpoints
      SET last_message_id = ?, updated_at = ?
      WHERE id = ?
    `).run(lastMessageId ? String(lastMessageId) : null, Number(updatedAt), checkpoint.id);
  }

  getLatestConversationMessage() {
    const row = this.ensureReady().prepare(`
      SELECT id, group_id, role, content, created_at
      FROM conversations
      ORDER BY id DESC
      LIMIT 1
    `).get();

    if (!row) {
      return null;
    }

    return {
      id: Number(row.id),
      groupId: row.group_id || "default",
      role: String(row.role || "user"),
      content: String(row.content || ""),
      createdAt: Number(row.created_at || 0)
    };
  }

  countConversationMessagesSince(lastMessageId = null) {
    const row = this.ensureReady().prepare(`
      SELECT COUNT(*) AS total
      FROM conversations
      WHERE (? IS NULL OR id > ?)
    `).get(lastMessageId ? Number(lastMessageId) : null, lastMessageId ? Number(lastMessageId) : null);

    return Number(row?.total || 0);
  }

  getConversationMessagesSince(lastMessageId = null) {
    const rows = this.ensureReady().prepare(`
      SELECT id, group_id, role, content, created_at
      FROM conversations
      WHERE (? IS NULL OR id > ?)
      ORDER BY id ASC
    `).all(lastMessageId ? Number(lastMessageId) : null, lastMessageId ? Number(lastMessageId) : null);

    return rows.map((row) => ({
      id: Number(row.id),
      groupId: row.group_id || "default",
      role: String(row.role || "user").toLowerCase(),
      content: normalizeText(row.content || ""),
      createdAt: Number(row.created_at || 0)
    }));
  }

  getMemoryByCategoryAndKey(category, key) {
    const normalizedCategory = String(category || "").trim();
    const normalizedKey = normalizeMemoryKey(key || "");
    if (!normalizedCategory || !normalizedKey) {
      return null;
    }

    const row = this.ensureReady().prepare(`
      SELECT *
      FROM memory
      WHERE category = ? AND key = ?
      LIMIT 1
    `).get(normalizedCategory, normalizedKey);

    return row ? this.parseMemoryRow(row) : null;
  }

  listRecentMemories(limit = 10) {
    const rows = this.ensureReady().prepare(`
      SELECT *
      FROM memory
      ORDER BY updated_at DESC, weight DESC, confidence DESC
      LIMIT ?
    `).all(Math.max(1, Number(limit || 10)));

    return rows.map((row) => this.parseMemoryRow(row));
  }

  listMemoriesByCategory(category, limit = 10) {
    const rows = this.ensureReady().prepare(`
      SELECT *
      FROM memory
      WHERE category = ?
      ORDER BY weight DESC, updated_at DESC
      LIMIT ?
    `).all(String(category || "").trim(), Math.max(1, Number(limit || 10)));

    return rows.map((row) => this.parseMemoryRow(row));
  }

  listMemoriesForPrompt(query = "", limit = 12) {
    const matchedCategories = this.matchCategories(query);
    if (matchedCategories.length > 0) {
      const placeholders = matchedCategories.map(() => "?").join(", ");
      const rows = this.ensureReady().prepare(`
        SELECT *
        FROM memory
        WHERE category IN (${placeholders})
        ORDER BY updated_at DESC, weight DESC
        LIMIT ?
      `).all(...matchedCategories, Math.max(1, Number(limit || 12)));

      return rows.map((row) => this.parseMemoryRow(row));
    }

    return this.listRecentMemories(limit);
  }

  matchCategories(query = "") {
    const normalizedQuery = normalizeComparableText(query);
    if (!normalizedQuery) {
      return [];
    }

    const matched = [];
    for (const [categoryId, category] of this.categoryMap.entries()) {
      const aliases = Array.isArray(category.aliases) ? category.aliases : [];
      const hasAliasMatch = aliases.some((alias) => {
        const normalizedAlias = normalizeComparableText(alias);
        return normalizedAlias && normalizedQuery.includes(normalizedAlias);
      });

      if (hasAliasMatch) {
        matched.push(categoryId);
      }
    }

    return matched;
  }

  findRelevantMemories(query = "", limit = 3) {
    const rows = this.ensureReady().prepare(`
      SELECT *
      FROM memory
      ORDER BY updated_at DESC
    `).all().map((row) => this.parseMemoryRow(row));

    if (!rows.length) {
      return [];
    }

    const normalizedQuery = normalizeComparableText(query);
    const queryTerms = extractSearchTerms(query, 10);
    const matchedCategories = new Set(this.matchCategories(query));

    const scored = rows.map((row) => {
      const keyText = normalizeComparableText(row.key);
      const contentText = normalizeComparableText(row.content);
      let score = Number(row.weight || 0) * 10 + Number(row.confidence || 0) * 5;

      if (!normalizedQuery) {
        score += 1;
      }

      if (matchedCategories.has(row.category)) {
        score += 20;
      }

      if (normalizedQuery && keyText && normalizedQuery.includes(keyText)) {
        score += 18;
      }

      for (const term of queryTerms) {
        if (keyText.includes(term)) {
          score += 8;
        }
        if (contentText.includes(term)) {
          score += 3;
        }
      }

      return { row, score };
    });

    scored.sort((a, b) => b.score - a.score || b.row.updatedAt - a.row.updatedAt);
    return scored
      .filter((entry) => entry.score > 0)
      .slice(0, Math.max(1, Number(limit || 3)))
      .map((entry) => entry.row);
  }

  buildContextText({ query = "", limit = 3 } = {}) {
    const memories = this.findRelevantMemories(query, Math.max(1, Math.min(Number(limit || 3), 3)));
    if (!memories.length) {
      return "";
    }

    return memories
      .map((memory) => `- ${memory.category}/${memory.key}: ${memory.content}`)
      .join("\n");
  }

  upsertMemory(item = {}) {
    const database = this.ensureReady();
    const now = Number(item.updatedAt || Date.now());
    const existing = this.getMemoryByCategoryAndKey(item.category, item.key);
    const initialWeight = Number(this.settings.initial_weight || 0.3);
    const weightIncrement = Number(this.settings.weight_increment || 0.1);
    const maxWeight = Number.isFinite(Number(this.settings.max_weight))
      ? Number(this.settings.max_weight)
      : null;

    if (!existing) {
      const result = database.prepare(`
        INSERT INTO memory (category, key, content, weight, confidence, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(item.category),
        normalizeMemoryKey(item.key),
        normalizeText(item.content),
        initialWeight,
        Number(item.confidence || this.settings.min_confidence || 0.8),
        now,
        now
      );

      return {
        action: "inserted",
        id: Number(result.lastInsertRowid)
      };
    }

    const nextWeightRaw = Number(existing.weight || initialWeight) + weightIncrement;
    const nextWeight = maxWeight !== null ? Math.min(nextWeightRaw, maxWeight) : nextWeightRaw;

    database.prepare(`
      UPDATE memory
      SET content = ?, weight = ?, confidence = ?, updated_at = ?
      WHERE id = ?
    `).run(
      normalizeText(item.content),
      nextWeight,
      Number(item.confidence || existing.confidence || this.settings.min_confidence || 0.8),
      now,
      existing.id
    );

    return {
      action: "updated",
      id: existing.id
    };
  }

  parseMemoryRow(row) {
    return {
      id: Number(row.id),
      category: String(row.category || "").trim(),
      key: String(row.key || "").trim(),
      content: String(row.content || "").trim(),
      weight: Number(row.weight || 0),
      confidence: Number(row.confidence || 0),
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0)
    };
  }
}
