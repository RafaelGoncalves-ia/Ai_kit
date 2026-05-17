import BaseNode from "../base_node.js";
import { enqueueVideoJob, getVideoJob } from "../../services/video/videoService.js";
import { resolveWanPreset } from "../../runtimes/wan/presets/wanPresets.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WanNode extends BaseNode {
  resourceRequirements() {
    return {
      mode: "gpu_video_exclusive",
      requires: ["video"],
      stopBeforeRun: ["ollama", "sd"],
      releaseAfterRun: true,
      jobTimeoutMs: this.params.timeoutMs || Number(process.env.WAN_GENERATE_TIMEOUT_MS || process.env.VIDEO_WAN_JOB_TIMEOUT_MS || 7200000),
      maxVramMb: this.params.maxVramMb || 11000,
      maxRamMb: this.params.maxRamMb || 14000
    };
  }

  async execute({ nodeInputs, log }) {
    const prompt = nodeInputs.prompt || nodeInputs.text || "";
    const preset = resolveWanPreset(
      this.params.preset || nodeInputs.preset || "wan_low_vram_3s",
      {
        ...(this.params.width || nodeInputs.width ? { width: this.params.width || nodeInputs.width } : {}),
        ...(this.params.height || nodeInputs.height ? { height: this.params.height || nodeInputs.height } : {}),
        ...(this.params.fps || nodeInputs.fps ? { fps: this.params.fps || nodeInputs.fps } : {}),
        ...(this.params.seconds || this.params.duration || nodeInputs.seconds || nodeInputs.duration
          ? { seconds: this.params.seconds || this.params.duration || nodeInputs.seconds || nodeInputs.duration }
          : {}),
        ...(this.params.steps || nodeInputs.steps ? { steps: this.params.steps || nodeInputs.steps } : {}),
        ...(this.params.cfg ?? nodeInputs.cfg ? { cfg: this.params.cfg ?? nodeInputs.cfg } : {})
      }
    );
    const useLastFrameForChaining = Boolean(this.params.use_last_frame_for_chaining || this.params.useLastFrameForChaining || nodeInputs.use_last_frame_for_chaining);
    const chainedStartImage = useLastFrameForChaining
      ? (nodeInputs.lastFramePath || nodeInputs.previousLastFramePath || "")
      : "";
    const startImage = nodeInputs.startImage || nodeInputs.imagePath || this.params.startImage || chainedStartImage || "";
    const mode = this.params.mode || nodeInputs.mode || (startImage ? "i2v" : "t2v");
    const job = await enqueueVideoJob({
      source: "workflow",
      prompt,
      negativePrompt: nodeInputs.negativePrompt || this.params.negativePrompt || "",
      motionPrompt: nodeInputs.motionPrompt || this.params.motionPrompt || "",
      startImage,
      mode,
      duration: preset.seconds,
      fps: preset.fps,
      width: preset.width,
      height: preset.height,
      ratio: this.params.ratio || nodeInputs.ratio || "9:16",
      model: this.params.model || nodeInputs.model || "",
      seed: this.params.seed ?? nodeInputs.seed,
      steps: preset.steps,
      cfg: preset.cfg,
      sampler: preset.sampler,
      scheduler: preset.scheduler,
      shift: preset.shift,
      denoise: preset.denoise,
      useLastFrameForChaining,
      outputDir: this.params.outputDir || nodeInputs.outputDir || "",
      fileName: this.params.fileName || nodeInputs.fileName || ""
    });

    if (!job?.id) {
      throw new Error("video.wan nao recebeu jobId do videoEngine.");
    }

    log(`video.wan job criado: ${job.id}`);
    const timeoutMs = Number(this.params.timeoutMs || process.env.WAN_GENERATE_TIMEOUT_MS || process.env.VIDEO_WAN_JOB_TIMEOUT_MS || 7200000);
    const pollMs = Number(this.params.pollMs || 2000);
    const started = Date.now();
    let current = job;

    while (Date.now() - started < timeoutMs) {
      current = getVideoJob(job.id) || current;
      const status = String(current?.status || "").toLowerCase();
      if (status === "completed") {
        return {
          jobId: job.id,
          path: current.output?.path || "",
          file: current.output?.path || "",
          lastFramePath: current.output?.lastFramePath || "",
          output: current.output || null,
          job: current
        };
      }
      if (["failed", "cancelled", "timeout"].includes(status)) {
        throw new Error(current?.error || `video.wan falhou com status ${status}`);
      }
      await sleep(pollMs);
    }

    throw new Error(`video.wan timeout apos ${timeoutMs}ms.`);
  }
}

export function register(registry) {
  registry.register("video.wan", WanNode);
}
