export class BaseNode {
  constructor(definition = {}) {
    this.id = definition.id || "";
    this.type = definition.type || "";
    this.name = definition.name || this.type || this.id;
    this.inputs = definition.inputs || {};
    this.outputs = definition.outputs || {};
    this.params = definition.params || {};
    this.definition = definition;
  }

  validate() {
    if (!this.id) {
      throw new Error("Node sem id.");
    }
    if (!this.type) {
      throw new Error(`Node ${this.id} sem type.`);
    }
    return true;
  }

  resourceRequirements() {
    return {
      mode: "default",
      requires: [],
      stopBeforeRun: [],
      releaseAfterRun: false
    };
  }

  async execute() {
    throw new Error(`Node ${this.type} nao implementa execute(context).`);
  }
}

export default BaseNode;
