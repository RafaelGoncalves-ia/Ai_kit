import BaseNode from "../base_node.js";
import { createStableDiffusionClient } from "../../services/sdClient.js";

export class StableDiffusionNode extends BaseNode {
  resourceRequirements() {
    return {
      mode: "gpu_image_exclusive",
      requires: ["image"],
      stopBeforeRun: ["wan", "video", "ollama", "xtts", "stt"],
      releaseAfterRun: true,
      jobTimeoutMs: this.params.timeoutMs || Number(process.env.SD_JOB_TIMEOUT_MS || 600000),
      maxVramMb: this.params.maxVramMb || 9000,
      maxRamMb: this.params.maxRamMb || 12000
    };
  }

  async execute({ nodeInputs }) {
    const client = createStableDiffusionClient();
    const mode = this.params.mode || "txt2img";
    const prompt = nodeInputs.prompt || nodeInputs.text || "";
    const result = await client.generate(mode, {
      prompt,
      negative_prompt: nodeInputs.negativePrompt || this.params.negativePrompt || "",
      checkpoint: this.params.checkpoint || this.params.model || "",
      architecture: this.params.architecture || "sd15",
      scheduler: this.params.scheduler || "DPMSolverMultistepScheduler",
      steps: this.params.steps || 24,
      cfg_scale: this.params.cfg_scale || this.params.cfgScale || 7,
      seed: this.params.seed ?? -1,
      width: this.params.width,
      height: this.params.height,
      image_path: nodeInputs.imagePath || "",
      mask_path: nodeInputs.maskPath || "",
      denoising_strength: this.params.denoising_strength || this.params.denoisingStrength || 0.55,
      inpaint_area: this.params.inpaint_area || this.params.inpaintArea || "only_masked",
      masked_content: this.params.masked_content || this.params.maskedContent || "fill",
      inpaint_output_mode: this.params.inpaint_output_mode || this.params.inpaintOutputMode || "new_full_layer"
    });
    return {
      path: result.file || result.path || "",
      file: result.file || result.path || "",
      metadata: result.metadata || {},
      raw: result
    };
  }
}

export function register(registry) {
  registry.register("image.stable_diffusion", StableDiffusionNode);
}
