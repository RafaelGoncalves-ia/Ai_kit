import BaseNode from "../base_node.js";

export class ResourceProfileNode extends BaseNode {
  async execute({ resourceManager, nodeInputs, log }) {
    const profile = nodeInputs.profile || this.params.profile || "chat_runtime";
    const policy = await resourceManager.applyProfile(profile, log);
    return { profile, policy };
  }
}

export function register(registry) {
  registry.register("system.resource_profile", ResourceProfileNode);
}
