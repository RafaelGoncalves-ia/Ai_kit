import { computeFrameCount } from "./computeFrameCount.js";

export function computeSequenceLength(seconds = 5, fps = 16) {
  return computeFrameCount(seconds, fps) + 1;
}

