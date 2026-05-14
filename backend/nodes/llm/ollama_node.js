import BaseNode from "../base_node.js";

export class OllamaNode extends BaseNode {
  resourceRequirements() {
    return {
      mode: "chat_runtime",
      requires: ["llm"],
      stopBeforeRun: [],
      releaseAfterRun: false
    };
  }

  async execute({ kit, nodeInputs }) {
    const prompt = nodeInputs.prompt || nodeInputs.text || "";
    const result = await kit.services?.ai?.chat?.(
      String(prompt),
      {
        emitEvents: this.params.emitEvents !== false,
        timeoutMs: this.params.timeoutMs || 120000,
        think: this.params.think === true
      },
      {
        source: "workflow.llm.ollama"
      }
    );
    return {
      text: result?.text || "",
      raw: result || null
    };
  }
}

export function register(registry) {
  registry.register("llm.ollama", OllamaNode);
}
