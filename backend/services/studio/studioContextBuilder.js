import fs from "fs";
import path from "path";
import { loadOps } from "../studioMarketingOpsService.js";

const CLIENTS_ROOT = path.join(process.cwd(), "workspace", "clients");

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeId(value = "") {
  return String(value || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "cliente";
}

function normalizeActiveTab(value = "") {
  const aliases = {
    client: "client-kit",
    "client-kit": "client-kit",
    project: "monthly-project",
    planner: "monthly-project",
    "monthly-project": "monthly-project",
    calendar: "calendar",
    kanban: "kanban",
    demand: "selected-demand",
    "selected-demand": "selected-demand"
  };
  return aliases[String(value || "").trim()] || "client-kit";
}

function findClientKit({ clientId = "", clientName = "" } = {}) {
  const candidates = [
    clientId,
    clientName,
    normalizeId(clientId),
    normalizeId(clientName)
  ].filter(Boolean);

  for (const candidate of candidates) {
    const kitPath = path.join(CLIENTS_ROOT, normalizeId(candidate), "client.kit");
    const kit = readJson(kitPath, null);
    if (kit) {
      return { kitPath, kit };
    }
  }

  return { kitPath: "", kit: null };
}

function selectDemand({ selectedDemandId = "", kanban = {}, studioState = {} } = {}) {
  const cards = Array.isArray(kanban?.cards) ? kanban.cards : [];
  const fromKanban = cards.find((card) => card?.id === selectedDemandId) || null;
  if (fromKanban) return fromKanban;

  const stateDemand = studioState?.selectedDemand || studioState?.demand || null;
  if (stateDemand && typeof stateDemand === "object") return stateDemand;
  return null;
}

function compactMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-12)
    .map((message) => ({
      role: message?.role === "user" ? "user" : "assistant",
      text: String(message?.text || "").slice(0, 2000),
      at: message?.at || null
    }))
    .filter((message) => message.text);
}

function buildStudioContext(payload = {}) {
  const activeTab = normalizeActiveTab(payload.activeTab);
  const studioState = payload.studioState && typeof payload.studioState === "object" ? payload.studioState : {};
  const clientFromState = studioState.client && typeof studioState.client === "object" ? studioState.client : {};
  const clientName = String(payload.clientName || clientFromState.name || payload.clientId || "").trim();
  const clientId = String(payload.clientId || normalizeId(clientName)).trim();
  const month = /^\d{4}-\d{2}$/.test(String(payload.month || ""))
    ? String(payload.month)
    : new Date().toISOString().slice(0, 7);

  const loadedOps = clientName || clientId
    ? loadOps({ clientName: clientName || clientId, month })
    : null;
  const clientKitMatch = findClientKit({ clientId, clientName });
  const clientKit = clientKitMatch.kit || loadedOps?.clientKit || null;
  const client = {
    ...(clientKit?.raw && typeof clientKit.raw === "object" ? clientKit.raw : {}),
    ...clientFromState,
    name: clientFromState.name || clientKit?.name || clientName || ""
  };
  const monthlyProject = studioState.planner || loadedOps?.project || null;
  const calendar = studioState.planner?.items
    ? studioState.planner
    : loadedOps?.calendar || null;
  const kanban = studioState.kanban || loadedOps?.kanban || null;

  return {
    event: "user_message",
    activeTab,
    interfaceState: {
      activeTab,
      month,
      clientId,
      clientName: client.name || clientName,
      projectId: payload.projectId || monthlyProject?.id || monthlyProject?.plannerId || "",
      selectedDemandId: payload.selectedDemandId || "",
      selectedItemId: studioState.selectedItemId || "",
      conversationId: payload.conversationId || ""
    },
    client,
    clientKit,
    clientKitPath: clientKitMatch.kitPath || loadedOps?.paths?.clientKitPath || "",
    monthlyProject,
    calendar,
    kanban,
    selectedDemand: selectDemand({
      selectedDemandId: payload.selectedDemandId,
      kanban,
      studioState
    }),
    recentMessages: compactMessages(payload.history || studioState.messages || []),
    operationalGuidelines: [
      "Somente mensagens digitadas pelo usuario geram resposta no chat.",
      "tab_changed, context_changed e system_refresh apenas atualizam estado e devem ficar silenciosos.",
      "A aba ativa contextualiza a analise, mas nao obriga troca de etapa.",
      "Priorize diagnostico e sugestoes aplicaveis ao cliente aberto."
    ]
  };
}

export {
  buildStudioContext,
  normalizeActiveTab
};
