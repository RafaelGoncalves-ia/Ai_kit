import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { buildWanWorkerEnv, resolveWanPython } from "../services/video/wanMemoryManager.js";
import { resolveWanPreset } from "../runtimes/wan/presets/wanPresets.js";

if (String(process.env.VIDEO_ALLOW_HEAVY_TEST || "").trim().toLowerCase() !== "true") {
  console.error("WAN_HEAVY_TEST_BLOCKED: defina VIDEO_ALLOW_HEAVY_TEST=true para permitir geracao real Wan2.2.");
  process.exit(1);
}

const rootDir = process.cwd();
const jobDir = path.join(rootDir, "temp", "wan-tiny-test");
fs.mkdirSync(jobDir, { recursive: true });

const payloadPath = path.join(jobDir, "payload.json");
const statusPath = path.join(jobDir, "status.json");
const outputPath = path.join(jobDir, "kit-wan-kitten-tiny.mp4");
const preset = resolveWanPreset(process.env.VIDEO_WAN_TEST_PRESET || "wan_tiny_test", {
  ...(process.env.VIDEO_WAN_TINY_FPS ? { fps: Number(process.env.VIDEO_WAN_TINY_FPS) } : {}),
  ...(process.env.VIDEO_WAN_TINY_DURATION ? { seconds: Number(process.env.VIDEO_WAN_TINY_DURATION) } : {}),
  ...(process.env.VIDEO_WAN_TINY_STEPS ? { steps: Number(process.env.VIDEO_WAN_TINY_STEPS) } : {}),
  ...(process.env.VIDEO_WAN_TINY_CFG ? { cfg: Number(process.env.VIDEO_WAN_TINY_CFG) } : {})
});
const payload = {
  id: "wan-tiny-test",
  mode: "t2v",
  prompt: "Video of a kitten walking.",
  negativePrompt: "",
  duration: preset.seconds,
  fps: preset.fps,
  frames: preset.frames,
  sequenceLength: preset.sequenceLength,
  width: preset.width,
  height: preset.height,
  modelFamily: "wan",
  modelPath: process.env.VIDEO_WAN_MODEL_PATH || "F:\\AI\\models\\diffusion_models\\wan2.2-t2v-rapid-aio-v10-nsfw-Q4_K.gguf",
  seed: 12345,
  steps: preset.steps,
  cfg: preset.cfg,
  sampler: preset.sampler,
  scheduler: preset.scheduler,
  shift: preset.shift,
  denoise: preset.denoise,
  loras: [],
  conditioning: { loras: [] },
  outputPath,
  workingDir: jobDir
};

fs.writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}${os.EOL}`, "utf8");

const python = resolveWanPython();
console.log(`[WAN][TEST] python=${python}`);
console.log(`[WAN][TEST] output=${outputPath}`);

const result = spawnSync(python, [path.join(rootDir, "backend", "workers", "video_worker.py"), payloadPath, statusPath], {
  cwd: rootDir,
  env: buildWanWorkerEnv(),
  encoding: "utf8",
  stdio: "inherit",
  windowsHide: true,
  timeout: Number(process.env.VIDEO_WAN_JOB_TIMEOUT_MS || 900000)
});

if (result.error) {
  console.error(`[WAN][TEST] erro ao executar worker: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status || 0);
