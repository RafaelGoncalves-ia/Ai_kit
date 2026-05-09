const fs = require("fs");
const path = require("path");
const {
  createStudioProject,
  normalizeStudioProject,
  validateStudioProject
} = require("./studioProjectSchema");
const workspaceLayout = require("../../services/workspaceLayout.cjs");

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const STUDIO_PROJECTS_DIR = workspaceLayout.WORKSPACE_ROOT;
const STUDIO_EXTENSION = ".kstudio";

function ensureStudioProjectsDir() {
  workspaceLayout.migrateLegacyWorkspace();
  fs.mkdirSync(STUDIO_PROJECTS_DIR, { recursive: true });
  return STUDIO_PROJECTS_DIR;
}

function sanitizeFileStem(value = "") {
  return String(value || "studio-project")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "studio-project";
}

function resolveStudioProjectPath(projectOrId) {
  ensureStudioProjectsDir();

  if (typeof projectOrId === "string") {
    const found = findStudioProjectRecordById(projectOrId);
    if (found?.filePath) {
      return found.filePath;
    }
    const fallbackWorkspace = workspaceLayout.ensureProjectWorkspace({
      clientName: "cliente",
      projectName: projectOrId,
      projectId: projectOrId
    });
    return fallbackWorkspace.projectFilePath;
  }

  const project = normalizeStudioProject(projectOrId || createStudioProject());
  const workspace = workspaceLayout.ensureProjectWorkspace({
    clientName: project.clientName || "cliente",
    projectName: `${project.projectName || project.id}-${project.id}`,
    projectId: project.id
  });
  return workspace.projectFilePath;
}

function relativizeIfInside(basePath, targetPath) {
  const absoluteBase = path.resolve(basePath);
  const absoluteTarget = path.resolve(targetPath);
  const relative = path.relative(absoluteBase, absoluteTarget);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return relative.replace(/\\/g, "/") || path.basename(absoluteTarget);
  }
  return absoluteTarget;
}

function reviveIfRelative(basePath, targetPath) {
  const rawPath = String(targetPath || "").trim();
  if (!rawPath) {
    return rawPath;
  }
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  return path.resolve(basePath, rawPath);
}

function mapProjectPaths(project = {}, mapper = (value) => value) {
  const next = JSON.parse(JSON.stringify(project));

  const rewriteMedia = (media) => {
    if (!media || typeof media !== "object") {
      return media;
    }
    if (media.path) media.path = mapper(media.path);
    if (media.filePath) media.filePath = mapper(media.filePath);
    if (media.thumbnailPath) media.thumbnailPath = mapper(media.thumbnailPath);
    return media;
  };

  next.attachments = Array.isArray(next.attachments)
    ? next.attachments.map((item) => {
      if (item?.path) item.path = mapper(item.path);
      if (item?.filePath) item.filePath = mapper(item.filePath);
      return item;
    })
    : [];

  if (next.briefing?.materialReferences && Array.isArray(next.briefing.materialReferences)) {
    next.briefing.materialReferences = next.briefing.materialReferences.map((item) => item);
  }

  next.script = next.script || {};
  next.script.scenes = Array.isArray(next.script.scenes)
    ? next.script.scenes.map((scene) => {
      if (Array.isArray(scene.references)) {
        scene.references = scene.references.map((ref) => {
          if (ref?.path) ref.path = mapper(ref.path);
          if (ref?.filePath) ref.filePath = mapper(ref.filePath);
          return ref;
        });
      }
      scene.generatedMedia = rewriteMedia(scene.generatedMedia);
      scene.audioAsset = rewriteMedia(scene.audioAsset);
      scene.uploadedRefs = Array.isArray(scene.uploadedRefs)
        ? scene.uploadedRefs.map((ref) => {
          if (ref?.path) ref.path = mapper(ref.path);
          if (ref?.filePath) ref.filePath = mapper(ref.filePath);
          return ref;
        })
        : [];
      return scene;
    })
    : [];

  return next;
}

function writeProjectSidecars(project, projectFilePath) {
  const projectRoot = path.dirname(projectFilePath);
  const saveProjectPayload = mapProjectPaths(project, (value) => {
    const revived = reviveIfRelative(projectRoot, value);
    return fs.existsSync(revived)
      ? relativizeIfInside(projectRoot, revived)
      : value;
  });

  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(projectFilePath, `${JSON.stringify(saveProjectPayload, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(projectRoot, "briefing.json"), `${JSON.stringify(project.briefing || {}, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(projectRoot, "roteiro.json"), `${JSON.stringify(project.script || {}, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(projectRoot, "production.json"), `${JSON.stringify(project.production || {}, null, 2)}\n`, "utf8");
}

function listStudioProjectFiles() {
  ensureStudioProjectsDir();
  return workspaceLayout.listAllWorkspaceProjectFiles();
}

function findStudioProjectRecordById(projectId = "") {
  const safeProjectId = String(projectId || "").trim();
  if (!safeProjectId) {
    return null;
  }

  const projectFiles = listStudioProjectFiles();
  for (const filePath of projectFiles) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (raw?.id === safeProjectId) {
        return {
          project: normalizeStudioProject(mapProjectPaths(raw, (value) => reviveIfRelative(path.dirname(filePath), value))),
          filePath: path.resolve(filePath)
        };
      }
    } catch {}
  }

  return null;
}

function saveStudioProject(project, filePath = "") {
  const normalized = normalizeStudioProject(project);
  const validation = validateStudioProject(normalized);
  if (!validation.valid) {
    const error = new Error(validation.errors.join("\n"));
    error.validation = validation;
    throw error;
  }

  const targetPath = filePath ? path.resolve(filePath) : resolveStudioProjectPath(normalized);
  writeProjectSidecars(normalized, targetPath);
  return {
    project: normalized,
    filePath: targetPath
  };
}

function loadStudioProject(filePath) {
  const rawText = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(rawText);
  const project = normalizeStudioProject(mapProjectPaths(parsed, (value) => reviveIfRelative(path.dirname(filePath), value)));
  const validation = validateStudioProject(project);
  if (!validation.valid) {
    const error = new Error(validation.errors.join("\n"));
    error.validation = validation;
    throw error;
  }

  return {
    project,
    filePath: path.resolve(filePath)
  };
}

module.exports = {
  STUDIO_EXTENSION,
  STUDIO_PROJECTS_DIR,
  ensureStudioProjectsDir,
  resolveStudioProjectPath,
  listStudioProjectFiles,
  findStudioProjectRecordById,
  saveStudioProject,
  loadStudioProject
};
