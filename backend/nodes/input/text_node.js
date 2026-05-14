import BaseNode from "../base_node.js";

export class InputTextNode extends BaseNode {
  async execute({ inputs, nodeInputs }) {
    const key = this.params.key || "prompt";
    const value = nodeInputs.text ?? inputs[key] ?? this.params.default ?? "";
    return { text: String(value || "") };
  }
}

export function register(registry) {
  registry.register("input.text", InputTextNode);
}
