import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const OUTPUT_DIR = path.resolve(process.cwd(), "output", "animatediff");

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

export default function createAnimateDiffService(context = {}) {
  async function generate(payload = {}) {
    console.log("[ANIMATEDIFF] request received", {
      baseModel: payload.baseModel || "",
      motionModule: payload.motionModule || "",
      output: payload.output || "gif"
    });

    ensureOutputDir();
    const output = String(payload.output || "gif").toLowerCase() === "mp4" ? "mp4" : "gif";
    const jobId = randomUUID();
    const targetPath = path.join(OUTPUT_DIR, `animatediff-${jobId}.${output}`);

    const error = new Error("Modelo detectado, mas motor AnimateDiff ainda nao implementado.");
    error.code = "ANIMATEDIFF_NOT_IMPLEMENTED";
    error.details = {
      jobId,
      targetPath,
      expectedPayload: {
        prompt: payload.prompt || "",
        negativePrompt: payload.negativePrompt || "",
        baseModel: payload.baseModel || "",
        motionModule: payload.motionModule || "",
        loras: Array.isArray(payload.loras) ? payload.loras : [],
        width: Number(payload.width || 512),
        height: Number(payload.height || 512),
        frames: Number(payload.frames || 16),
        fps: Number(payload.fps || 8),
        steps: Number(payload.steps || 20),
        cfg: Number(payload.cfg || 7),
        sampler: payload.sampler || "Euler a",
        seed: Number(payload.seed ?? -1),
        output
      }
    };
    throw error;
  }

  return {
    outputDir: OUTPUT_DIR,
    generate
  };
}
