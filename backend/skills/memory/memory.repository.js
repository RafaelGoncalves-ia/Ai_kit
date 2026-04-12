import { getDB, initDB } from "./sqlite.js";

const MEMORY_DUPLICATE_WINDOW_MS = 1000 * 60 * 60 * 24 * 30;
const VOCAB_DUPLICATE_WINDOW_MS = 1000 * 60 * 60 * 24 * 30;
const STOPWORDS = new Set([
  "a", "o", "e", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "por", "para", "com", "sem", "um", "uma", "uns", "umas", "me", "te", "se", "eu",
  "voce", "voces", "kit", "pra", "pro", "que", "isso", "essa", "esse", "como", "mais",
  "menos", "muito", "muita", "muitos", "muitas", "ser", "estar", "ta", "to", "estou"
]);

function db() {
  return getDB() || initDB();
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeRole(role) {
  const normalized = normalizeText(role).toLowerCase();
  if (["assistant", "system", "tool"].includes(normalized)) {
    return normalized;
  }
  return "user";
}

function normalizeGroupId(groupId) {
  const normalized = normalizeText(groupId);
  return normalized || "default";
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function parseMemoryRow(row) {
  return {
    id: row.id,
    type: row.type,
    key: row.key || null,
    content: row.content,
    source: row.source || null,
    confidence: Number(row.confidence || 0.5),
    relevance: Number(row.relevance || 0.5),
    groupId: row.group_id || null,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || row.created_at || 0)
  };
}

function parseConversationRow(row) {
  return {
    id: row.id,
    groupId: row.group_id || "default",
    role: normalizeRole(row.role),
    content: row.content,
    createdAt: Number(row.created_at || 0)
  };
}

function parseVocabularyRow(row) {
  return {
    id: row.id,
    phrase: row.phrase,
    groupId: row.group_id || null,
    source: row.source || null,
    weight: Number(row.weight || 0.5),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || row.created_at || 0)
  };
}

function extractSearchTerms(text = "", limit = 6) {
  const terms = normalizeText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length >= 3 && !STOPWORDS.has(term));

  return Array.from(new Set(terms)).slice(0, limit);
}

export function saveConversationMessage({ groupId = "default", role = "user", content, createdAt = Date.now() }) {
  const normalizedContent = normalizeText(content);
  if (!normalizedContent) {
    return null;
  }

  const result = db().prepare(`
    INSERT INTO conversations (group_id, role, content, created_at)
    VALUES (?, ?, ?, ?)
  `).run(
    normalizeGroupId(groupId),
    normalizeRole(role),
    normalizedContent,
    Number(createdAt || Date.now())
  );

  return result.lastInsertRowid;
}

export function getConversationMessages({ groupId = "default", limit = 20, newestFirst = false } = {}) {
  const rows = db().prepare(`
    SELECT id, group_id, role, content, created_at
    FROM conversations
    WHERE group_id = ?
    ORDER BY created_at ${newestFirst ? "DESC" : "ASC"}
    LIMIT ?
  `).all(normalizeGroupId(groupId), Math.max(1, Number(limit || 20)));

  return rows.map(parseConversationRow);
}

export function getRecentConversationMessages({ groupId = "default", limit = 6 } = {}) {
  const rows = getConversationMessages({
    groupId,
    limit,
    newestFirst: true
  });

  return rows.reverse();
}

export function listConversationGroups(limit = 50) {
  const rows = db().prepare(`
    SELECT group_id, MAX(created_at) AS last_message_at, COUNT(*) AS message_count
    FROM conversations
    GROUP BY group_id
    ORDER BY last_message_at DESC
    LIMIT ?
  `).all(Math.max(1, Number(limit || 50)));

  return rows.map((row) => {
    const previewRow = db().prepare(`
      SELECT content
      FROM conversations
      WHERE group_id = ?
      ORDER BY created_at ASC
      LIMIT 1
    `).get(row.group_id);

    const preview = normalizeText(previewRow?.content || "");
    return {
      id: row.group_id,
      groupId: row.group_id,
      title: preview ? preview.slice(0, 60) : row.group_id,
      lastMessageAt: Number(row.last_message_at || 0),
      messageCount: Number(row.message_count || 0)
    };
  });
}

export function deleteConversationGroup(groupId) {
  const result = db().prepare(`DELETE FROM conversations WHERE group_id = ?`).run(normalizeGroupId(groupId));
  return result.changes > 0;
}

export function saveMemory({
  type,
  key = null,
  value,
  relevance = 0.5,
  confidence = 0.5,
  source = "rule",
  groupId = null,
  createdAt = Date.now()
}) {
  const normalizedType = normalizeText(type).toLowerCase();
  const normalizedContent = normalizeText(value);
  const normalizedKey = normalizeNullableText(key);
  const normalizedSource = normalizeNullableText(source);
  const normalizedGroupId = normalizeNullableText(groupId);
  const timestamp = Number(createdAt || Date.now());

  if (!normalizedType || !normalizedContent) {
    return null;
  }

  const existing = db().prepare(`
    SELECT id, relevance, confidence
    FROM memory
    WHERE type = ?
      AND COALESCE(key, '') = COALESCE(?, '')
      AND content = ?
      AND COALESCE(group_id, '') = COALESCE(?, '')
      AND updated_at >= ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(
    normalizedType,
    normalizedKey,
    normalizedContent,
    normalizedGroupId,
    timestamp - MEMORY_DUPLICATE_WINDOW_MS
  );

  if (existing) {
    db().prepare(`
      UPDATE memory
      SET relevance = ?, confidence = ?, source = ?, updated_at = ?
      WHERE id = ?
    `).run(
      Math.max(Number(existing.relevance || 0.5), Number(relevance || 0.5)),
      Math.max(Number(existing.confidence || 0.5), Number(confidence || 0.5)),
      normalizedSource,
      timestamp,
      existing.id
    );

    return existing.id;
  }

  const result = db().prepare(`
    INSERT INTO memory (type, key, content, source, confidence, relevance, group_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    normalizedType,
    normalizedKey,
    normalizedContent,
    normalizedSource,
    Number(confidence || 0.5),
    Number(relevance || 0.5),
    normalizedGroupId,
    timestamp,
    timestamp
  );

  return result.lastInsertRowid;
}

export function saveVocabulary({
  phrase,
  groupId = null,
  source = "rule",
  weight = 0.5,
  createdAt = Date.now()
}) {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) {
    return null;
  }

  const normalizedGroupId = normalizeNullableText(groupId);
  const normalizedSource = normalizeNullableText(source);
  const timestamp = Number(createdAt || Date.now());

  const existing = db().prepare(`
    SELECT id, weight
    FROM vocabulary
    WHERE phrase = ?
      AND COALESCE(group_id, '') = COALESCE(?, '')
      AND updated_at >= ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(
    normalizedPhrase,
    normalizedGroupId,
    timestamp - VOCAB_DUPLICATE_WINDOW_MS
  );

  if (existing) {
    db().prepare(`
      UPDATE vocabulary
      SET weight = ?, source = ?, updated_at = ?
      WHERE id = ?
    `).run(
      Math.max(Number(existing.weight || 0.5), Number(weight || 0.5)),
      normalizedSource,
      timestamp,
      existing.id
    );

    return existing.id;
  }

  const result = db().prepare(`
    INSERT INTO vocabulary (phrase, group_id, source, weight, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    normalizedPhrase,
    normalizedGroupId,
    normalizedSource,
    Number(weight || 0.5),
    timestamp,
    timestamp
  );

  return result.lastInsertRowid;
}

export function getRecentMemory(limit = 10) {
  const rows = db().prepare(`
    SELECT *
    FROM memory
    WHERE type != 'conversation'
    ORDER BY updated_at DESC, relevance DESC
    LIMIT ?
  `).all(Math.max(1, Number(limit || 10)));

  return rows.map(parseMemoryRow);
}

export function getMemoryByType(type, limit = 10, options = {}) {
  const normalizedType = normalizeText(type).toLowerCase();
  const normalizedGroupId = options.groupId ? normalizeGroupId(options.groupId) : null;

  const rows = db().prepare(`
    SELECT *
    FROM memory
    WHERE type = ?
      AND type != 'conversation'
      AND (? IS NULL OR group_id = ? OR group_id IS NULL)
    ORDER BY relevance DESC, updated_at DESC
    LIMIT ?
  `).all(
    normalizedType,
    normalizedGroupId,
    normalizedGroupId,
    Math.max(1, Number(limit || 10))
  );

  return rows.map(parseMemoryRow);
}

export function getRelevantMemory({ groupId = null, query = "", limit = 8 } = {}) {
  const normalizedGroupId = groupId ? normalizeGroupId(groupId) : null;
  const terms = extractSearchTerms(query);
  const conditions = [];
  const params = [];

  if (normalizedGroupId) {
    conditions.push("(group_id = ? OR group_id IS NULL)");
    params.push(normalizedGroupId);
  }

  if (terms.length > 0) {
    const termClause = terms
      .map(() => "(LOWER(content) LIKE ? OR LOWER(COALESCE(key, '')) LIKE ?)")
      .join(" OR ");
    conditions.push(`(${termClause})`);
    for (const term of terms) {
      const like = `%${term}%`;
      params.push(like, like);
    }
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db().prepare(`
    SELECT *
    FROM memory
    ${whereClause}
    ${whereClause ? "AND" : "WHERE"} type != 'conversation'
    ORDER BY relevance DESC, updated_at DESC
    LIMIT ?
  `).all(...params, Math.max(1, Number(limit || 8)));

  const parsed = rows.map(parseMemoryRow);
  if (parsed.length >= limit || terms.length === 0) {
    return parsed.slice(0, limit);
  }

  const fallbackRows = db().prepare(`
    SELECT *
    FROM memory
    WHERE (? IS NULL OR group_id = ? OR group_id IS NULL)
      AND type != 'conversation'
    ORDER BY relevance DESC, updated_at DESC
    LIMIT ?
  `).all(
    normalizedGroupId,
    normalizedGroupId,
    Math.max(1, Number(limit || 8))
  );

  const combined = [...parsed];
  for (const row of fallbackRows.map(parseMemoryRow)) {
    if (!combined.some((item) => item.id === row.id)) {
      combined.push(row);
    }
    if (combined.length >= limit) {
      break;
    }
  }

  return combined.slice(0, limit);
}

export function getVocabulary(limit = 10, options = {}) {
  const normalizedGroupId = options.groupId ? normalizeGroupId(options.groupId) : null;
  const query = normalizeText(options.query).toLowerCase();
  const terms = extractSearchTerms(query);
  const conditions = [];
  const params = [];

  if (normalizedGroupId) {
    conditions.push("(group_id = ? OR group_id IS NULL)");
    params.push(normalizedGroupId);
  }

  if (terms.length > 0) {
    const clause = terms.map(() => "LOWER(phrase) LIKE ?").join(" OR ");
    conditions.push(`(${clause})`);
    for (const term of terms) {
      params.push(`%${term}%`);
    }
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db().prepare(`
    SELECT *
    FROM vocabulary
    ${whereClause}
    ORDER BY weight DESC, updated_at DESC
    LIMIT ?
  `).all(...params, Math.max(1, Number(limit || 10)));

  return rows.map(parseVocabularyRow);
}
