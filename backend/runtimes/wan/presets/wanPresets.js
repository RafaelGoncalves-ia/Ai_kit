import fs from "fs";
import path from "path";

const PRESETS_PATH = path.resolve(process.cwd(), "backend", "runtimes", "wan", "presets", "wan_presets.json");

function readPresets() {
  return JSON.parse(fs.readFileSync(PRESETS_PATH, "utf8"));
}

export function resolveWanPreset(name = "wan_low_vram_3s", overrides = {}) {
  const presets = readPresets();
  const preset = presets[name] || presets.wan_low_vram_3s;
  const merged = {
    ...preset,
    ...overrides
  };
  const seconds = Math.max(1, Math.round(Number(merged.seconds ?? merged.duration ?? 3)));
  const fps = Math.max(1, Math.round(Number(merged.fps ?? 16)));
  const length = seconds * fps + 1;
  return {
    ...merged,
    seconds,
    duration: seconds,
    fps,
    length,
    sequenceLength: length,
    frames: Math.max(1, length - 1)
  };
}

export function listWanPresets() {
  return readPresets();
}
