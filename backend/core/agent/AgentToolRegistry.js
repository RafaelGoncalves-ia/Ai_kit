import { createAgentWebSearchAdapter } from "./tools/AgentWebSearchAdapter.js";

export function createAgentToolRegistry(context, config = {}) {
  const allowedTools = Array.isArray(config.allowedTools) ? config.allowedTools : ["web_search"];
  const handlers = new Map();

  if (allowedTools.includes("web_search")) {
    handlers.set("web_search", createAgentWebSearchAdapter(context, config));
  }

  function has(toolName) {
    return allowedTools.includes(toolName) && handlers.has(toolName);
  }

  async function run(toolName, input = {}) {
    if (!has(toolName)) {
      throw new Error(`Ferramenta nao permitida: ${toolName}`);
    }

    return handlers.get(toolName)(input);
  }

  return {
    allowedTools,
    has,
    run
  };
}

