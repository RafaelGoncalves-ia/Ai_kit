export function computeFrameCount(seconds = 5, fps = 16) {
  const safeSeconds = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 5;
  const safeFps = Number.isFinite(Number(fps)) ? Math.max(1, Math.round(Number(fps))) : 16;
  return Math.max(1, Math.round(safeSeconds * safeFps));
}

