import fs from "fs";
import path from "path";

export const WORKSPACE_ROOT = path.resolve("F:/AI/Ai_kit/agent-workspace");
export const PROJECTS_ROOT = path.resolve(WORKSPACE_ROOT, "projetos");
export const DATA_ROOT = path.resolve(WORKSPACE_ROOT, "dados");
export const SESSIONS_ROOT = path.resolve(WORKSPACE_ROOT, "sessoes");

function isPathInside(basePath, targetPath) {
  const relative = path.relative(basePath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeSegment(value, fallback) {
  const normalized = String(value || fallback || "")
    .trim()
    .toLowerCase()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\.+/g, ".")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function securityError(message, meta = {}) {
  const detail = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  console.warn(`[WORKSPACE-GUARD] ${message}${detail}`);
  return new Error(message);
}

function assertSafeTarget(basePath, targetPath) {
  const resolvedBase = path.resolve(basePath);
  const candidatePath = String(targetPath || "").trim();
  const resolvedTarget = candidatePath
    ? path.resolve(resolvedBase, candidatePath)
    : resolvedBase;

  if (!isPathInside(WORKSPACE_ROOT, resolvedTarget)) {
    throw securityError("Caminho fora do agent-workspace nao permitido", {
      requestedPath: candidatePath,
      resolvedTarget
    });
  }

  if (!isPathInside(resolvedBase, resolvedTarget)) {
    throw securityError("Tentativa de sair do diretorio permitido", {
      requestedPath: candidatePath,
      resolvedBase,
      resolvedTarget
    });
  }

  return resolvedTarget;
}

export function resolveSafePath(targetPath = "") {
  return assertSafeTarget(WORKSPACE_ROOT, targetPath);
}

export function ensureWorkspace() {
  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  fs.mkdirSync(SESSIONS_ROOT, { recursive: true });

  return {
    workspaceRoot: WORKSPACE_ROOT,
    projectsRoot: PROJECTS_ROOT,
    dataRoot: DATA_ROOT,
    sessionsRoot: SESSIONS_ROOT
  };
}

export function createSessionWorkspace(sessionId) {
  ensureWorkspace();

  const safeSessionId = normalizeSegment(sessionId, `sessao-${Date.now()}`);
  const sessionPath = assertSafeTarget(SESSIONS_ROOT, `sessao-${safeSessionId}`);
  const mediaPath = assertSafeTarget(sessionPath, "media");

  fs.mkdirSync(sessionPath, { recursive: true });
  fs.mkdirSync(mediaPath, { recursive: true });

  return {
    sessionId: safeSessionId,
    sessionPath,
    mediaPath
  };
}

export function resolveSessionPath(sessionId, targetPath = "") {
  const { sessionPath } = createSessionWorkspace(sessionId);
  return assertSafeTarget(sessionPath, targetPath);
}

export function resolveSessionMediaPath(sessionId, fileName = "") {
  const { mediaPath } = createSessionWorkspace(sessionId);
  return assertSafeTarget(mediaPath, fileName);
}

export function createProjectWorkspace(executionId) {
  ensureWorkspace();

  const safeExecutionId = normalizeSegment(executionId, `exec-${Date.now()}`);
  const projectPath = assertSafeTarget(PROJECTS_ROOT, `projeto-${safeExecutionId}`);

  fs.mkdirSync(projectPath, { recursive: true });

  return {
    executionId: safeExecutionId,
    workspacePath: WORKSPACE_ROOT,
    projectPath
  };
}

export function resolveProjectPath(executionId, targetPath = "") {
  const safeExecutionId = normalizeSegment(executionId, `exec-${Date.now()}`);
  const projectPath = assertSafeTarget(PROJECTS_ROOT, `projeto-${safeExecutionId}`);

  fs.mkdirSync(projectPath, { recursive: true });

  return assertSafeTarget(projectPath, targetPath);
}

export function ensureCompanyDataStructure(companyName) {
  ensureWorkspace();

  const safeCompanyName = normalizeSegment(companyName, "empresa");
  const companyRoot = assertSafeTarget(DATA_ROOT, safeCompanyName);
  const imagesPath = assertSafeTarget(companyRoot, "imagens");
  const adsPath = assertSafeTarget(companyRoot, "anuncios");
  const documentsPath = assertSafeTarget(companyRoot, "documentos");
  const clientsFilePath = assertSafeTarget(companyRoot, "clientes.json");

  fs.mkdirSync(companyRoot, { recursive: true });
  fs.mkdirSync(imagesPath, { recursive: true });
  fs.mkdirSync(adsPath, { recursive: true });
  fs.mkdirSync(documentsPath, { recursive: true });

  if (!fs.existsSync(clientsFilePath)) {
    fs.writeFileSync(clientsFilePath, JSON.stringify({ clientes: [] }, null, 2), "utf8");
  }

  return {
    companyName: safeCompanyName,
    companyRoot,
    clientsFilePath,
    imagesPath,
    adsPath,
    documentsPath
  };
}

export function resolveDataPath(companyName, targetPath = "") {
  const { companyName: safeCompanyName, companyRoot } = ensureCompanyDataStructure(companyName);
  const resolvedPath = assertSafeTarget(companyRoot, targetPath);

  return {
    companyName: safeCompanyName,
    companyRoot,
    path: resolvedPath
  };
}
