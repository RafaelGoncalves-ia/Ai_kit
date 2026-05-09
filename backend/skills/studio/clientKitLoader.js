const fs = require("fs");
const path = require("path");
const workspaceLayout = require("../../services/workspaceLayout.cjs");

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const SEARCH_ROOTS = [
  workspaceLayout.WORKSPACE_ROOT,
  path.join(ROOT_DIR, "projects"),
  path.join(ROOT_DIR, "agent-workspace"),
  path.join(ROOT_DIR, "backend", "config"),
  ROOT_DIR
];
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "package-lock.json",
  "venv",
  ".venv",
  "__pycache__"
]);

function stripAccents(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeKey(value = "") {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactKey(value = "") {
  return normalizeKey(value).replace(/\s+/g, "");
}

function isKitFile(filePath = "") {
  return path.extname(String(filePath || "")).toLowerCase() === ".kit";
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    return null;
  }
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeAssetList(value) {
  return normalizeList(value).map((item, index) => {
    const filePath = String(item?.path || "").trim();
    return {
      name: String(item?.name || (filePath ? path.basename(filePath) : `Asset ${index + 1}`)).trim(),
      path: filePath,
      type: String(item?.type || "").trim()
    };
  }).filter((item) => item.path || item.name);
}

function normalizeClientKit(raw = {}, filePath = "") {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  if (String(raw.type || "").trim() === "client") {
    return {
      schema: String(raw.schemaVersion || "").trim(),
      type: "client",
      name: String(raw.name || path.basename(filePath, path.extname(filePath))).trim(),
      filePath,
      identity: {
        voice: String(raw.voice?.tone || "").trim(),
        description: String(raw.description || raw.voice?.personality || "").trim()
      },
      colors: [
        raw.brand?.primaryColor ? { name: "primary", hex: String(raw.brand.primaryColor).trim() } : null,
        raw.brand?.secondaryColor ? { name: "secondary", hex: String(raw.brand.secondaryColor).trim() } : null,
        raw.brand?.accentColor ? { name: "accent", hex: String(raw.brand.accentColor).trim() } : null
      ].filter(Boolean),
      logos: normalizeAssetList([
        raw.brand?.logo ? { path: raw.brand.logo, name: "logo" } : null,
        ...(Array.isArray(raw.assets?.logoFiles) ? raw.assets.logoFiles.map((item) => ({ path: item })) : [])
      ].filter(Boolean)),
      fonts: [
        raw.brand?.fonts?.heading ? { name: "heading", family: raw.brand.fonts.heading, role: "heading" } : null,
        raw.brand?.fonts?.body ? { name: "body", family: raw.brand.fonts.body, role: "body" } : null
      ].filter(Boolean),
      xtts: {
        language: "pt-BR",
        voiceModelPath: "",
        speakerWavPath: "",
        notes: String(raw.voice?.personality || "").trim()
      },
      assets: {
        global: normalizeAssetList([
          ...(Array.isArray(raw.assets?.referenceImages) ? raw.assets.referenceImages.map((item) => ({ path: item })) : []),
          ...(Array.isArray(raw.assets?.brandFiles) ? raw.assets.brandFiles.map((item) => ({ path: item })) : [])
        ]),
        frames: [],
        watermarks: [],
        recurring: []
      },
      metadata: {
        clientName: raw.name || "",
        client: raw.name || "",
        company: raw.name || "",
        slug: raw.id || "",
        segment: raw.segment || "",
        audiencePrimary: raw.audience?.primary || ""
      }
    };
  }

  return {
    schema: String(raw.schema || "").trim(),
    type: String(raw.type || "brand-kit").trim(),
    name: String(raw.name || path.basename(filePath, path.extname(filePath))).trim(),
    filePath,
    identity: {
      voice: String(raw.identity?.voice || "").trim(),
      description: String(raw.identity?.description || "").trim()
    },
    colors: normalizeList(raw.colors).map((color) => ({
      name: String(color?.name || "").trim(),
      hex: String(color?.hex || "").trim()
    })).filter((color) => color.hex),
    logos: normalizeAssetList(raw.logos),
    fonts: normalizeList(raw.fonts).map((font) => ({
      name: String(font?.name || "").trim(),
      family: String(font?.family || font?.name || "").trim(),
      path: String(font?.path || "").trim(),
      role: String(font?.role || "").trim()
    })).filter((font) => font.name || font.family || font.path),
    xtts: {
      language: String(raw.xtts?.language || "").trim(),
      voiceModelPath: String(raw.xtts?.voiceModelPath || "").trim(),
      speakerWavPath: String(raw.xtts?.speakerWavPath || "").trim(),
      notes: String(raw.xtts?.notes || "").trim()
    },
    assets: {
      global: normalizeAssetList(raw.assets?.global),
      frames: normalizeAssetList(raw.assets?.frames),
      watermarks: normalizeAssetList(raw.assets?.watermarks),
      recurring: normalizeAssetList(raw.assets?.recurring)
    },
    metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {}
  };
}

function listKitFiles(rootDir, depth = 0, found = []) {
  if (depth > 6 || !fs.existsSync(rootDir)) {
    return found;
  }

  let entries = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      listKitFiles(fullPath, depth + 1, found);
      continue;
    }

    if (entry.isFile() && isKitFile(fullPath)) {
      found.push(fullPath);
    }
  }

  return found;
}

function getCandidateNames(clientName = "", kit = {}, filePath = "") {
  const metadata = kit.metadata || {};
  return [
    clientName,
    kit.name,
    metadata.clientName,
    metadata.client,
    metadata.brand,
    metadata.company,
    metadata.slug,
    path.basename(filePath, path.extname(filePath))
  ].filter(Boolean);
}

function scoreKitMatch(clientName = "", kit = {}, filePath = "") {
  const wanted = normalizeKey(clientName);
  const wantedCompact = compactKey(clientName);
  if (!wanted) {
    return 0;
  }

  return getCandidateNames("", kit, filePath).reduce((score, candidate) => {
    const normalized = normalizeKey(candidate);
    const compact = compactKey(candidate);
    if (!normalized) return score;
    if (normalized === wanted || compact === wantedCompact) return Math.max(score, 100);
    if (normalized.includes(wanted) || wanted.includes(normalized)) return Math.max(score, 75);
    if (compact.includes(wantedCompact) || wantedCompact.includes(compact)) return Math.max(score, 65);
    return score;
  }, 0);
}

function loadKitFromFile(filePath, warnings = []) {
  const parsed = safeReadJson(filePath);
  if (!parsed) {
    warnings.push(`Nao consegui ler .kit: ${filePath}`);
    return null;
  }

  const normalized = normalizeClientKit(parsed, path.resolve(filePath));
  if (!normalized?.name) {
    warnings.push(`Arquivo .kit sem nome valido: ${filePath}`);
    return null;
  }

  return normalized;
}

function findAttachedKit(attachments = [], warnings = []) {
  for (const attachment of normalizeList(attachments)) {
    const filePath = String(attachment?.path || attachment?.filePath || "").trim();
    if (filePath && isKitFile(filePath) && fs.existsSync(filePath)) {
      return loadKitFromFile(filePath, warnings);
    }
  }

  return null;
}

function findClientKit(clientName = "", attachments = []) {
  const warnings = [];
  const attachedKit = findAttachedKit(attachments, warnings);
  if (attachedKit) {
    return {
      client: {
        name: clientName || attachedKit.name,
        detected: Boolean(clientName),
        kitPath: attachedKit.filePath
      },
      clientKit: attachedKit,
      warnings
    };
  }

  const allKitFiles = Array.from(new Set(
    SEARCH_ROOTS.flatMap((root) => listKitFiles(root))
  ));
  let best = null;

  for (const filePath of allKitFiles) {
    const kit = loadKitFromFile(filePath, warnings);
    if (!kit) {
      continue;
    }

    const score = scoreKitMatch(clientName, kit, filePath);
    if (!best || score > best.score) {
      best = { kit, score };
    }
  }

  if (best?.kit && best.score > 0) {
    return {
      client: {
        name: clientName || best.kit.name,
        detected: Boolean(clientName),
        kitPath: best.kit.filePath
      },
      clientKit: best.kit,
      warnings
    };
  }

  if (clientName) {
    warnings.push(`Nenhum .kit encontrado para o cliente "${clientName}".`);
  } else {
    warnings.push("Cliente nao identificado no comando e nenhum .kit anexado.");
  }

  return {
    client: {
      name: clientName || "Cliente nao definido",
      detected: Boolean(clientName),
      kitPath: null
    },
    clientKit: null,
    warnings
  };
}

module.exports = {
  findClientKit,
  normalizeClientKit,
  normalizeKey
};
