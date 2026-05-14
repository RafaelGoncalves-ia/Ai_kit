import BaseNode from "../base_node.js";
import { speak } from "../../services/xttsClient.js";

export class XttsNode extends BaseNode {
  resourceRequirements() {
    return {
      mode: "voice_runtime",
      requires: ["audio"],
      stopBeforeRun: ["wan", "video"],
      releaseAfterRun: false
    };
  }

  async execute({ nodeInputs }) {
    const text = nodeInputs.text || "";
    const result = await speak(
      String(text || ""),
      this.params.speaker || "Daisy Studious",
      this.params.language || "pt"
    );
    const path = result?.file || result?.path || result?.audioPath || result?.output || "";
    return { path, file: path, text, raw: result || null };
  }
}

export function register(registry) {
  registry.register("audio.xtts", XttsNode);
}
