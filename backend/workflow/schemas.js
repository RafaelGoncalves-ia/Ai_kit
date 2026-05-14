export const WORKFLOW_SCHEMA_VERSION = "1.0";

export function assertWorkflowShape(workflow = {}) {
  if (!workflow || typeof workflow !== "object") {
    throw new Error("Workflow invalido: esperado objeto JSON.");
  }
  if (!workflow.id) {
    throw new Error("Workflow invalido: campo id obrigatorio.");
  }
  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    throw new Error(`Workflow ${workflow.id} invalido: nodes deve ser uma lista nao vazia.`);
  }
  const ids = new Set();
  for (const node of workflow.nodes) {
    if (!node?.id || !node?.type) {
      throw new Error(`Workflow ${workflow.id} contem node sem id/type.`);
    }
    if (ids.has(node.id)) {
      throw new Error(`Workflow ${workflow.id} contem node duplicado: ${node.id}.`);
    }
    ids.add(node.id);
  }
  return true;
}

export function isConnection(value) {
  return Boolean(value && typeof value === "object" && value.node && value.output);
}

export function normalizeWorkflowId(value = "") {
  return String(value || "").trim().replace(/\.json$/i, "");
}
