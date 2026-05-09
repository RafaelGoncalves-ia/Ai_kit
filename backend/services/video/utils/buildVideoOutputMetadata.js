import { computeFrameCount } from "./computeFrameCount.js";
import { computeSequenceLength } from "./computeSequenceLength.js";

export function buildVideoOutputMetadata({
  input = {},
  output = {},
  conditioning = {},
  pipeline = null
} = {}) {
  const duration = Number(output.duration || input.duration || 5);
  const fps = Number(output.fps || input.fps || 16);
  const frames = Number(output.frames || input.frames || computeFrameCount(duration, fps));
  const sequenceLength = Number(output.sequenceLength || input.sequenceLength || computeSequenceLength(duration, fps));

  return {
    mode: output.metadata?.mode || input.mode || "t2v",
    duration,
    fps,
    frames,
    sequenceLength,
    width: Number(output.width || input.width || 0),
    height: Number(output.height || input.height || 0),
    ratio: output.ratio || input.ratio || "",
    model: input.model || "",
    modelPath: input.modelPath || "",
    modelFamily: input.modelFamily || "",
    preset: input.preset || input.quality || "standard",
    quality: input.quality || input.preset || "standard",
    prompt: input.prompt || "",
    negativePrompt: input.negativePrompt || "",
    motionPrompt: input.motionPrompt || "",
    prompts: {
      prompt: input.prompt || "",
      negativePrompt: input.negativePrompt || "",
      motionPrompt: input.motionPrompt || ""
    },
    references: conditioning.references || input.references || [],
    loras: conditioning.loras || input.loras || [],
    startImage: input.startImage || "",
    endImage: input.endImage || "",
    sourceImage: output.sourceImage || output.metadata?.sourceImage || "",
    pipeline,
    pipelineLogs: output.logs || output.metadata?.logs || input.summaryLogs || [],
    exportSettings: {
      format: "mp4",
      videoCodec: "libx264",
      pixelFormat: "yuv420p",
      ...(input.exportSettings || {})
    }
  };
}
