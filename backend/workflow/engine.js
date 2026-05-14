import fs from "fs";
import path from "path";
import { defaultNodeRegistry } from "./registry.js";
import { assertWorkflowShape, normalizeWorkflowId } from "./schemas.js";
import { WorkflowExecutor } from "./executor.js";

const WORKFLOWS_DIR = path.resolve(process.cwd(), "backend", "workflow", "workflows");

export class WorkflowEngine {
  constructor(context = {}, options = {}) {
    this.context = context;
    this.registry = options.registry || defaultNodeRegistry;
    this.workflowsDir = options.workflowsDir || WORKFLOWS_DIR;
  }

  async initialize() {
    await this.registry.loadFromDirectory();
  }

  loadWorkflow(workflowId = "") {
    const id = normalizeWorkflowId(workflowId);
    const filePath = path.join(this.workflowsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Workflow nao encontrado: ${id}`);
    }
    const workflow = JSON.parse(fs.readFileSync(filePath, "utf8"));
    assertWorkflowShape(workflow);
    for (const node of workflow.nodes) {
      if (!this.registry.has(node.type)) {
        throw new Error(`Workflow ${id} usa node nao registrado: ${node.type}`);
      }
    }
    return workflow;
  }

  async run(workflowId = "", inputs = {}) {
    await this.initialize();
    const workflow = this.loadWorkflow(workflowId);
    const executor = new WorkflowExecutor({
      context: this.context,
      registry: this.registry
    });
    return executor.run(workflow, inputs || {});
  }
}

export default WorkflowEngine;
