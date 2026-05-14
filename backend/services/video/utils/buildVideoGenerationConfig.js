import { computeFrameCount } from "./computeFrameCount.js";
import { computeSequenceLength } from "./computeSequenceLength.js";

const ALLOWED_VIDEO_DURATIONS = [1, 3, 5, 7, 10, 12, 15];
const VIDEO_SIZE_TABLE = {
  "1:1": { width: 768, height: 768 },
  "4:5": { width: 768, height: 960 },
  "3:4": { width: 768, height: 1024 },
  "9:16": { width: 720, height: 1280 },
  "16:9": { width: 1280, height: 720 }
};

export function normalizeVideoDuration(value, fallback = 5) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  const clamped = Math.max(0, Math.min(15, Math.round(numericValue)));
  if (ALLOWED_VIDEO_DURATIONS.includes(clamped)) {
    return clamped;
  }

  return ALLOWED_VIDEO_DURATIONS.reduce((closest, candidate) => {
    if (Math.abs(candidate - clamped) < Math.abs(closest - clamped)) {
      return candidate;
    }
    return closest;
  }, fallback);
}

export function resolveVideoSize(ratio = "9:16") {
  const normalizedRatio = String(ratio || "9:16").trim() || "9:16";
  return {
    ...(VIDEO_SIZE_TABLE[normalizedRatio] || VIDEO_SIZE_TABLE["9:16"]),
    ratio: normalizedRatio
  };
}

export function buildVideoGenerationConfig({
  duration = 5,
  fps = 16,
  ratio = "9:16",
  width,
  height,
  preset = "standard",
  quality = "standard",
  exportSettings = {}
} = {}) {
  const normalizedDuration = normalizeVideoDuration(duration, 5);
  const normalizedFps = Number.isFinite(Number(fps)) ? Math.max(1, Math.round(Number(fps))) : 16;
  const resolvedSize = resolveVideoSize(ratio);
  const resolvedWidth = Number.isFinite(Number(width)) ? Math.max(64, Math.round(Number(width))) : resolvedSize.width;
  const resolvedHeight = Number.isFinite(Number(height)) ? Math.max(64, Math.round(Number(height))) : resolvedSize.height;
  const frames = computeFrameCount(normalizedDuration, normalizedFps);
  const sequenceLength = computeSequenceLength(normalizedDuration, normalizedFps);

  return {
    duration: normalizedDuration,
    fps: normalizedFps,
    frames,
    sequenceLength,
    ratio: resolvedSize.ratio,
    width: resolvedWidth,
    height: resolvedHeight,
    preset: String(preset || quality || "standard").trim() || "standard",
    quality: String(quality || preset || "standard").trim() || "standard",
    exportSettings: {
      format: "mp4",
      videoCodec: "libx264",
      pixelFormat: "yuv420p",
      ...exportSettings
    }
  };
}

export { ALLOWED_VIDEO_DURATIONS };
