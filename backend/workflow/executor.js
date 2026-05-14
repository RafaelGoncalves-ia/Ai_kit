import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { isConnection } from "./schemas.js";
import { ResourceManager } from "./resource_manager.js";

const STATE_DIR = path.resolve(process.cwd(), "temp", "workflow-runs");

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveInputValue(value, outputs, workflowInputs) {
  if (isConnection(value)) {
    const nodeOutput = outputs[value.node] || {};
    return nodeOutput[value.output];
  }
  if (value && typeof value === "object" && value.input) {
    return workflowInputs[value.input];
  }
  return value;
}

function resolveNodeInputs(node, outputs, workflowInputs) {
  const resolved = {};
  for (const [key, value] of Object.entries(node.inputs || {})) {
    resolved[key] = resolveInputValue(value, outputs, workflowInputs);
  }
  return resolved;
}

function collectDependencies(node) {
  const deps = new Set();
  const visit = (value) => {
    if (isConnection(value)) {
      deps.add(value.node);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(node.inputs || {});
  return Array.from(deps);
}

function resolveExecutionOrder(nodes = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const deps = new Map(nodes.map((node) => [node.id, collectDependencies(node)]));
  const order = [];
  const visiting = new Set();
  const visited = new Set();

  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Dependencia circular detectada no workflow em ${id}.`);
    }
    if (!byId.has(id)) {
      throw new Error(`Dependencia aponta para node inexistente: ${id}.`);
    }
    visiting.add(id);
    for (const dep of deps.get(id) || []) {
      visit(dep);
    }
    visiting.delete(id);
    visited.add(id);
    order.push(byId.get(id));
  };

  for (const node of nodes) {
    visit(node.id);
  }
  return order;
}

function withTimeout(promise, timeoutMs, label = "node") {
  if (!Number.isFinite(Number(timeoutMs)) || Number(timeoutMs) <= 0) {
    return promise;
  }
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout apos ${timeoutMs}ms.`)), Number(timeoutMs));
    })
  ]).finally(() => clearTimeout(timer));
}

export class WorkflowExecutor {
  constructor({ context, registry }) {
    this.context = context;
    this.registry = registry;
    this.resourceManager = new ResourceManager(context);
  }

  async run(workflow = {}, inputs = {}) {
    const runId = `workflow-${Date.now()}-${randomUUID()}`;
    const logs = [];
    const outputs = {};
    const statePath = path.join(STATE_DIR, `${runId}.json`);
    const log = (message, extra = {}) => {
      const entry = {
        at: new Date().toISOString(),
        message,
        ...extra
      };
      logs.push(entry);
      this.context.core?.eventBus?.emit?.("workflow:log", {
        workflow_id: workflow.id,
        run_id: runId,
        ...entry
      });
      this.saveState(statePath, { runId, workflow_id: workflow.id, status: "running", outputs, logs });
    };

    fs.mkdirSync(STATE_DIR, { recursive: true });
    log("workflow iniciado");

    const orderedNodes = resolveExecutionOrder(workflow.nodes || []);
    for (const definition of orderedNodes) {
      const node = this.registry.create(definition);
      node.validate();
      const nodeInputs = resolveNodeInputs(definition, outputs, inputs);
      const nodeContext = {
        kit: this.context,
        workflow,
        runId,
        inputs,
        nodeInputs,
        outputs,
        resourceManager: this.resourceManager,
        log: (message, extra = {}) => log(message, { node_id: node.id, node_type: node.type, ...extra })
      };

      const requirements = node.resourceRequirements?.() || {};
      let releaseGpuLock = null;
      if (ensureArray(requirements.requires).length || ensureArray(requirements.stopBeforeRun).length) {
        if (requirements.mode === "gpu_exclusive" || ensureArray(requirements.requires).some((item) => ["video", "image", "wan", "sd"].includes(item))) {
          releaseGpuLock = await this.resourceManager.acquireGpuLock({
            owner: `${workflow.id}:${node.id}:${node.type}`,
            timeoutMs: Number(requirements.lockTimeoutMs || workflow.gpuLockTimeoutMs || 900000)
          }, (message) => nodeContext.log(message));
          this.resourceManager.logVram("before_prepare", (message) => nodeContext.log(message));
          this.resourceManager.logRam("before_prepare", (message) => nodeContext.log(message));
        }
        await this.resourceManager.applyPolicy(requirements, (message) => nodeContext.log(message));
        if (releaseGpuLock) {
          this.resourceManager.logVram("before_execute", (message) => nodeContext.log(message));
          this.resourceManager.logRam("before_execute", (message) => nodeContext.log(message));
        }
      }

      try {
        log("node iniciado", { node_id: node.id, node_type: node.type });
        const result = await withTimeout(
          node.execute(nodeContext),
          requirements.jobTimeoutMs || requirements.timeoutMs || 0,
          `${node.type}:${node.id}`
        );
        outputs[node.id] = result && typeof result === "object" ? result : { value: result };
        log("node finalizado", { node_id: node.id, node_type: node.type });
        if (requirements.releaseAfterRun) {
          this.resourceManager.logVram("after_execute", (message) => nodeContext.log(message));
          this.resourceManager.logRam("after_execute", (message) => nodeContext.log(message));
          this.resourceManager.cleanupMemory((message) => nodeContext.log(message));
          this.resourceManager.logVram("after_cleanup", (message) => nodeContext.log(message));
          this.resourceManager.logRam("after_cleanup", (message) => nodeContext.log(message));
        }
      } catch (err) {
        log(`erro do node: ${err.message}`, { node_id: node.id, node_type: node.type, level: "error" });
        this.saveState(statePath, {
          runId,
          workflow_id: workflow.id,
          status: "failed",
          error: err.message,
          outputs,
          logs
        });
        throw err;
      } finally {
        if (releaseGpuLock) {
          releaseGpuLock();
        }
      }
    }

    log("workflow concluido");
    this.saveState(statePath, {
      runId,
      workflow_id: workflow.id,
      status: "completed",
      outputs,
      logs
    });
    return {
      ok: true,
      run_id: runId,
      workflow_id: workflow.id,
      status: "completed",
      outputs,
      logs
    };
  }

  saveState(filePath, state = {}) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }
}
