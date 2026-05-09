const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const WORKSPACE_ROOT = path.join(ROOT_DIR, "workspace");
const GLOBAL_ROOT = path.join(WORKSPACE_ROOT, "_global");
const SHARED_PRESETS_ROOT = path.join(GLOBAL_ROOT, "shared-presets");
const GLOBAL_TEMP_ROOT = path.join(GLOBAL_ROOT, "temp");
const GLOBAL_CACHE_ROOT = path.join(GLOBAL_ROOT, "cache");
const GLOBAL_SESSIONS_ROOT = path.join(GLOBAL_TEMP_ROOT, "sessions");
const GLOBAL_EXECUTIONS_ROOT = path.join(GLOBAL_TEMP_ROOT, "executions");

const LEGACY_AGENT_WORKSPACE = path.join(ROOT_DIR, "agent-workspace");
const LEGACY_AGENT_DATA_ROOT = path.join(LEGACY_AGENT_WORKSPACE, "dados");
const LEGACY_AGENT_SESSIONS_ROOT = path.join(LEGACY_AGENT_WORKSPACE, "sessoes");
const LEGACY_STUDIO_PROJECTS_ROOT = path.join(ROOT_DIR, "projects", "studio");
const LEGACY_PRESETS_ROOT = path.join(ROOT_DIR, "backend", "data", "presets");

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
}

function exists(targetPath = "") {
  try {
    return Boolean(targetPath) && fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function slugify(value = "", fallback = "item") {
  const normalized = String(value || fallback || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || fallback;
}

function copyFileIfMissing(sourcePath, targetPath) {
  if (!exists(sourcePath) || exists(targetPath)) {
    return false;
  }
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function copyDirectoryContents(sourceDir, targetDir) {
  if (!exists(sourceDir)) {
    return;
  }

  ensureDir(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  entries.forEach((entry) => {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, targetPath);
      return;
    }
    copyFileIfMissing(sourcePath, targetPath);
  });
}

function readJsonSafe(filePath = "") {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function buildDefaultClientKit(clientName = "", clientSlug = "") {
  return {
    schemaVersion: "1.0",
    type: "client",
    id: clientSlug,
    name: clientName || clientSlug,
    segment: "",
    description: "",
    contacts: {
      phone: "",
      email: "",
      website: "",
      instagram: "",
      address: ""
    },
    brand: {
      logo: "",
      primaryColor: "",
      secondaryColor: "",
      accentColor: "",
      fonts: {
        heading: "",
        body: ""
      }
    },
    voice: {
      tone: "",
      personality: "",
      forbiddenTerms: [],
      preferredTerms: []
    },
    audience: {
      primary: "",
      secondary: "",
      painPoints: [],
      desires: []
    },
    commercial: {
      mainOffer: "",
      differentials: [],
      ctaDefault: "",
      salesChannel: ""
    },
    assets: {
      logoFiles: [],
      referenceImages: [],
      brandFiles: []
    }
  };
}

function ensureGlobalWorkspace() {
  ensureDir(WORKSPACE_ROOT);
  ensureDir(GLOBAL_ROOT);
  ensureDir(SHARED_PRESETS_ROOT);
  ensureDir(path.join(SHARED_PRESETS_ROOT, "styles"));
  ensureDir(path.join(SHARED_PRESETS_ROOT, "formats"));
  ensureDir(path.join(SHARED_PRESETS_ROOT, "clients"));
  ensureDir(GLOBAL_TEMP_ROOT);
  ensureDir(GLOBAL_CACHE_ROOT);
  ensureDir(GLOBAL_SESSIONS_ROOT);
  ensureDir(GLOBAL_EXECUTIONS_ROOT);
}

function getClientWorkspace(clientName = "") {
  const clientSlug = slugify(clientName, "cliente");
  const clientRoot = path.join(WORKSPACE_ROOT, clientSlug);
  const kitFilePath = path.join(clientRoot, `${clientSlug}.kit`);
  return {
    clientName: clientName || clientSlug,
    clientSlug,
    clientRoot,
    kitFilePath,
    assetsRoot: path.join(clientRoot, "assets"),
    documentsRoot: path.join(clientRoot, "documents"),
    calendarRoot: path.join(clientRoot, "calendar"),
    presetsRoot: path.join(clientRoot, "presets"),
    projectsRoot: path.join(clientRoot, "projects")
  };
}

function ensureClientWorkspace(clientName = "", options = {}) {
  ensureGlobalWorkspace();
  const workspace = getClientWorkspace(clientName);
  ensureDir(workspace.clientRoot);
  ensureDir(path.join(workspace.assetsRoot, "logo"));
  ensureDir(path.join(workspace.assetsRoot, "image"));
  ensureDir(path.join(workspace.assetsRoot, "video"));
  ensureDir(path.join(workspace.assetsRoot, "music"));
  ensureDir(path.join(workspace.assetsRoot, "audio"));
  ensureDir(path.join(workspace.assetsRoot, "fonts"));
  ensureDir(path.join(workspace.documentsRoot, "contracts"));
  ensureDir(path.join(workspace.documentsRoot, "pdf"));
  ensureDir(path.join(workspace.documentsRoot, "word"));
  ensureDir(path.join(workspace.documentsRoot, "txt"));
  ensureDir(path.join(workspace.documentsRoot, "spreadsheets"));
  ensureDir(workspace.calendarRoot);
  ensureDir(path.join(workspace.presetsRoot, "styles"));
  ensureDir(path.join(workspace.presetsRoot, "formats"));
  ensureDir(workspace.projectsRoot);

  const calendarFilePath = path.join(workspace.calendarRoot, `${workspace.clientSlug}.calendar.json`);
  if (!exists(calendarFilePath)) {
    fs.writeFileSync(calendarFilePath, `${JSON.stringify({ clientId: workspace.clientSlug, events: [] }, null, 2)}\n`, "utf8");
  }

  if (!exists(workspace.kitFilePath)) {
    const payload = buildDefaultClientKit(options.clientName || workspace.clientName, workspace.clientSlug);
    fs.writeFileSync(workspace.kitFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  return {
    ...workspace,
    calendarFilePath
  };
}

function ensureProjectWorkspace({ clientName = "", projectName = "", projectId = "" } = {}) {
  const clientWorkspace = ensureClientWorkspace(clientName || "cliente");
  const projectSlugBase = projectName || projectId || "projeto";
  const projectSlug = slugify(projectSlugBase, "projeto");
  const projectRoot = path.join(clientWorkspace.projectsRoot, projectSlug);

  ensureDir(projectRoot);
  ensureDir(path.join(projectRoot, "assets", "input"));
  ensureDir(path.join(projectRoot, "assets", "reference"));
  ensureDir(path.join(projectRoot, "generated", "images"));
  ensureDir(path.join(projectRoot, "generated", "videos"));
  ensureDir(path.join(projectRoot, "generated", "audio"));
  ensureDir(path.join(projectRoot, "generated", "thumbs"));
  ensureDir(path.join(projectRoot, "exports", "draft"));
  ensureDir(path.join(projectRoot, "exports", "final"));
  ensureDir(path.join(projectRoot, "logs"));

  return {
    ...clientWorkspace,
    projectSlug,
    projectRoot,
    projectFilePath: path.join(projectRoot, "project.kstudio"),
    briefingFilePath: path.join(projectRoot, "briefing.json"),
    roteiroFilePath: path.join(projectRoot, "roteiro.json"),
    productionFilePath: path.join(projectRoot, "production.json")
  };
}

function listAllWorkspaceProjectFiles() {
  const found = [];

  function walkProjects(rootDir) {
    if (!exists(rootDir)) {
      return;
    }
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    entries.forEach((entry) => {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        walkProjects(fullPath);
        return;
      }
      if (entry.isFile() && entry.name === "project.kstudio") {
        found.push(fullPath);
      }
    });
  }

  if (exists(WORKSPACE_ROOT)) {
    fs.readdirSync(WORKSPACE_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "_global")
      .forEach((entry) => {
        walkProjects(path.join(WORKSPACE_ROOT, entry.name, "projects"));
      });
  }

  if (exists(LEGACY_STUDIO_PROJECTS_ROOT)) {
    fs.readdirSync(LEGACY_STUDIO_PROJECTS_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".kstudio"))
      .forEach((entry) => {
        found.push(path.join(LEGACY_STUDIO_PROJECTS_ROOT, entry.name));
      });
  }

  return Array.from(new Set(found));
}

function migrateLegacyCompanyData() {
  if (!exists(LEGACY_AGENT_DATA_ROOT)) {
    return;
  }

  fs.readdirSync(LEGACY_AGENT_DATA_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => {
      const legacyCompanyRoot = path.join(LEGACY_AGENT_DATA_ROOT, entry.name);
      const clientWorkspace = ensureClientWorkspace(entry.name);
      copyDirectoryContents(path.join(legacyCompanyRoot, "imagens"), path.join(clientWorkspace.assetsRoot, "image"));
      copyDirectoryContents(path.join(legacyCompanyRoot, "documentos"), clientWorkspace.documentsRoot);
      copyDirectoryContents(path.join(legacyCompanyRoot, "anuncios"), clientWorkspace.projectsRoot);
      const legacyClientsJson = path.join(legacyCompanyRoot, "clientes.json");
      copyFileIfMissing(legacyClientsJson, path.join(clientWorkspace.documentsRoot, "txt", "clientes.json"));
    });
}

function migrateLegacySessions() {
  if (!exists(LEGACY_AGENT_SESSIONS_ROOT)) {
    return;
  }
  copyDirectoryContents(LEGACY_AGENT_SESSIONS_ROOT, GLOBAL_SESSIONS_ROOT);
}

function migrateLegacyPresets() {
  if (!exists(LEGACY_PRESETS_ROOT)) {
    return;
  }
  copyDirectoryContents(path.join(LEGACY_PRESETS_ROOT, "styles"), path.join(SHARED_PRESETS_ROOT, "styles"));
  copyDirectoryContents(path.join(LEGACY_PRESETS_ROOT, "formats"), path.join(SHARED_PRESETS_ROOT, "formats"));
  copyDirectoryContents(path.join(LEGACY_PRESETS_ROOT, "clients"), path.join(SHARED_PRESETS_ROOT, "clients"));
}

function migrateLegacyStudioProjects() {
  if (!exists(LEGACY_STUDIO_PROJECTS_ROOT)) {
    return;
  }

  fs.readdirSync(LEGACY_STUDIO_PROJECTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".kstudio"))
    .forEach((entry) => {
      const legacyProjectFile = path.join(LEGACY_STUDIO_PROJECTS_ROOT, entry.name);
      const parsed = readJsonSafe(legacyProjectFile);
      const clientName = parsed?.clientName || "cliente";
      const projectName = parsed?.projectName || parsed?.id || path.basename(entry.name, ".kstudio");
      const projectWorkspace = ensureProjectWorkspace({
        clientName,
        projectName,
        projectId: parsed?.id || ""
      });

      copyFileIfMissing(legacyProjectFile, projectWorkspace.projectFilePath);
      if (parsed?.briefing) {
        copyFileIfMissing(legacyProjectFile, projectWorkspace.logs ? path.join(projectWorkspace.projectRoot, "logs", `${path.basename(entry.name)}`) : projectWorkspace.projectFilePath);
        if (!exists(projectWorkspace.briefingFilePath)) {
          fs.writeFileSync(projectWorkspace.briefingFilePath, `${JSON.stringify(parsed.briefing, null, 2)}\n`, "utf8");
        }
        if (!exists(projectWorkspace.roteiroFilePath)) {
          fs.writeFileSync(projectWorkspace.roteiroFilePath, `${JSON.stringify(parsed.script || {}, null, 2)}\n`, "utf8");
        }
        if (!exists(projectWorkspace.productionFilePath)) {
          fs.writeFileSync(projectWorkspace.productionFilePath, `${JSON.stringify(parsed.production || {}, null, 2)}\n`, "utf8");
        }
      }

      const legacyAssetsRoot = path.join(
        LEGACY_STUDIO_PROJECTS_ROOT,
        `${path.basename(entry.name, ".kstudio")}.assets`
      );
      copyDirectoryContents(legacyAssetsRoot, path.join(projectWorkspace.projectRoot, "logs", "legacy-assets"));
    });
}

let migrationDone = false;

function migrateLegacyWorkspace() {
  if (migrationDone) {
    return;
  }
  ensureGlobalWorkspace();
  migrateLegacyCompanyData();
  migrateLegacySessions();
  migrateLegacyPresets();
  migrateLegacyStudioProjects();
  migrationDone = true;
}

module.exports = {
  ROOT_DIR,
  WORKSPACE_ROOT,
  GLOBAL_ROOT,
  SHARED_PRESETS_ROOT,
  GLOBAL_TEMP_ROOT,
  GLOBAL_CACHE_ROOT,
  GLOBAL_SESSIONS_ROOT,
  GLOBAL_EXECUTIONS_ROOT,
  LEGACY_AGENT_WORKSPACE,
  LEGACY_AGENT_DATA_ROOT,
  LEGACY_AGENT_SESSIONS_ROOT,
  LEGACY_STUDIO_PROJECTS_ROOT,
  slugify,
  ensureGlobalWorkspace,
  ensureClientWorkspace,
  ensureProjectWorkspace,
  listAllWorkspaceProjectFiles,
  migrateLegacyWorkspace,
  getClientWorkspace
};
