import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";
import BaseNode from "../base_node.js";

export class SttNode extends BaseNode {
  resourceRequirements() {
    return {
      mode: "voice_runtime",
      requires: ["audio"],
      stopBeforeRun: ["wan", "video"],
      releaseAfterRun: false
    };
  }

  async execute({ nodeInputs }) {
    const audioPath = nodeInputs.audioPath || nodeInputs.path || nodeInputs.file || "";
    if (!audioPath || !fs.existsSync(audioPath)) {
      throw new Error("audio.stt exige audioPath/path/file existente.");
    }
    const formData = new FormData();
    formData.append("audio", fs.createReadStream(audioPath));
    const response = await fetch("http://localhost:5006/transcribe", {
      method: "POST",
      body: formData
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `STT HTTP ${response.status}`);
    }
    return { text: data.text || "", raw: data };
  }
}

export function register(registry) {
  registry.register("audio.stt", SttNode);
}
