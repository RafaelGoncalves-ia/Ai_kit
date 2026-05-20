import fs from "fs";
import path from "path";
import workspaceLayout from "./workspaceLayout.cjs";

const ROOT_DIR = path.resolve(process.cwd());
const OPS_ROOT = path.join(ROOT_DIR, "workspace", "clients");
const DEFAULT_STAGES = ["Projeto", "Execucao", "Agendamento", "Postado"];

function nowIso() {
  return new Date().toISOString();
}

function slugify(value = "", fallback = "cliente") {
  return workspaceLayout.slugify(value || fallback, fallback);
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

function appendLog(projectDir, action, payload = {}) {
  ensureDir(projectDir);
  fs.appendFileSync(
    path.join(projectDir, "log.jsonl"),
    `${JSON.stringify({ at: nowIso(), action, payload })}\n`,
    "utf8"
  );
}

function pathsFor(clientName = "", month = "") {
  const clientSlug = slugify(clientName, "cliente");
  const safeMonth = /^\d{4}-\d{2}$/.test(String(month || "")) ? month : nowIso().slice(0, 7);
  const clientDir = path.join(OPS_ROOT, clientSlug);
  const projectDir = path.join(clientDir, "projects", safeMonth);
  return {
    clientSlug,
    month: safeMonth,
    clientDir,
    projectDir,
    clientKitPath: path.join(clientDir, "client.kit"),
    assetsDir: path.join(clientDir, "assets"),
    projectPath: path.join(projectDir, "project.json"),
    calendarPath: path.join(projectDir, "calendar.json"),
    kanbanPath: path.join(projectDir, "kanban.json"),
    logPath: path.join(projectDir, "log.jsonl")
  };
}

function normalizeClientKit(client = {}) {
  const name = client.name || client.client?.name || "Cliente";
  const accountType = client.accountType || (String(name).toLowerCase().includes("adsune") ? "internal" : "client");
  return {
    schema: "kit.studio.client.ops.v1",
    type: accountType === "internal" ? "internal-kit" : "client-kit",
    accountType,
    businessModel: client.businessModel || "",
    id: slugify(name),
    name,
    logo: client.logo || "",
    segment: client.segment || "",
    niche: client.niche || "",
    subniche: client.subniche || "",
    region: client.region || client.cityRegion || "",
    audience: client.audience || "",
    commercialGoals: client.recurringCommercialGoals || client.commercialGoals || [],
    socialNetworks: client.channels || client.socialNetworks || [],
    plan: client.plan || "",
    tone: client.toneOfVoice || client.tone || [],
    positioning: client.positioning || client.brandRules || "",
    products: client.mainProducts || client.products || "",
    differentials: client.differentials || "",
    colors: client.brand?.colors || [],
    strategicNotes: client.strategicNotes || "",
    raw: client,
    updatedAt: nowIso()
  };
}

function normalizeCalendar(planner = {}) {
  const items = Array.isArray(planner.items) ? planner.items : [];
  return {
    schema: "kit.studio.calendar.ops.v1",
    id: planner.id || `calendar_${Date.now()}`,
    clientName: planner.clientName || "",
    month: planner.month || "",
    status: planner.status || "rascunho",
    items: items.map((item) => ({
      id: item.id,
      title: item.theme || item.title || "Item sem titulo",
      type: item.type || "post",
      objective: item.objective || "",
      funnel: item.funnel || "",
      emotion: item.emotion || item.primaryEmotion || "",
      cta: item.cta || "",
      captionDraft: item.caption || "",
      visualIdea: item.visualDirection || "",
      dueDate: item.date || item.dueDate || "",
      status: item.approvalStatus || item.status || "rascunho",
      priority: item.priority || "normal",
      notes: item.productionNotes || item.notes || "",
      kanbanCardId: item.kanbanCardId || null,
      raw: item
    })),
    updatedAt: nowIso()
  };
}

function normalizeKanban(kanban = {}) {
  const stages = Array.isArray(kanban.stages) && kanban.stages.length
    ? kanban.stages
    : DEFAULT_STAGES.map((name, index) => ({ id: slugify(name, `stage-${index + 1}`), name, order: index }));

  return {
    schema: "kit.studio.kanban.ops.v1",
    stages: stages.map((stage, index) => ({
      id: stage.id || slugify(stage.name, `stage-${index + 1}`),
      name: stage.name || `Etapa ${index + 1}`,
      order: Number.isFinite(Number(stage.order)) ? Number(stage.order) : index
    })).sort((a, b) => a.order - b.order),
    cards: Array.isArray(kanban.cards) ? kanban.cards : [],
    updatedAt: nowIso()
  };
}

function normalizeProject({ client = {}, month = "", planner = {} } = {}) {
  return {
    schema: "kit.studio.monthly-project.ops.v1",
    clientName: client.name || planner.clientName || "Cliente",
    clientId: slugify(client.name || planner.clientName || "cliente"),
    month,
    status: planner.status || "rascunho",
    plannerId: planner.id || null,
    diagnosis: planner.diagnosis || "",
    macroObjective: planner.macroObjective || "",
    updatedAt: nowIso()
  };
}

function ensureOpsWorkspace(clientName = "", month = "") {
  const paths = pathsFor(clientName, month);
  ensureDir(paths.clientDir);
  ensureDir(paths.assetsDir);
  ensureDir(paths.projectDir);
  return paths;
}

function saveOps({ client = {}, month = "", planner = {}, kanban = {}, action = "studio.ops.save" } = {}) {
  const paths = ensureOpsWorkspace(client.name || planner.clientName || "cliente", month || planner.month);
  const clientKit = normalizeClientKit(client);
  const project = normalizeProject({ client, month: paths.month, planner });
  const calendar = normalizeCalendar({ ...planner, month: paths.month, clientName: project.clientName });
  const normalizedKanban = normalizeKanban(kanban);

  writeJson(paths.clientKitPath, clientKit);
  writeJson(paths.projectPath, project);
  writeJson(paths.calendarPath, calendar);
  writeJson(paths.kanbanPath, normalizedKanban);
  appendLog(paths.projectDir, action, {
    clientName: project.clientName,
    month: paths.month,
    calendarItems: calendar.items.length,
    kanbanCards: normalizedKanban.cards.length
  });

  return {
    paths,
    clientKit,
    project,
    calendar,
    kanban: normalizedKanban
  };
}

function loadOps({ clientName = "", month = "" } = {}) {
  const paths = pathsFor(clientName, month);
  return {
    paths,
    exists: fs.existsSync(paths.projectDir),
    clientKit: readJson(paths.clientKitPath, null),
    project: readJson(paths.projectPath, null),
    calendar: readJson(paths.calendarPath, null),
    kanban: normalizeKanban(readJson(paths.kanbanPath, null) || {})
  };
}

export {
  DEFAULT_STAGES,
  ensureOpsWorkspace,
  saveOps,
  loadOps
};
