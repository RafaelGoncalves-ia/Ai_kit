export default {
  name: "memory",

  async init(context) {
    this.context = context;
    await context.invokeTool("memory_access", { action: "init" });
  },

  async processInput(text) {
    await this.context.invokeTool("memory_access", {
      action: "log_conversation",
      role: "user",
      text
    });

    await this.context.invokeTool("memory_access", {
      action: "process_input",
      text
    });
  },

  async processAIResponse(text) {
    await this.context.invokeTool("memory_access", {
      action: "log_conversation",
      role: "assistant",
      text
    });

    await this.context.invokeTool("memory_access", {
      action: "process_ai_response",
      text
    });
  },

  async getContext() {
    const result = await this.context.invokeTool("memory_access", {
      action: "get_context"
    });

    return result?.data?.text || "";
  }
};
