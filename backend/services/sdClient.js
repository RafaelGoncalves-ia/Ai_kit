import fetch from "node-fetch";

const DEFAULT_SD_URL = process.env.SD_WORKER_URL || "http://127.0.0.1:5010";

const SD15_RESOLUTIONS = {
  "1:1": { width: 512, height: 512 },
  "4:5": { width: 512, height: 640 },
  "9:16": { width: 512, height: 912 },
  "16:9": { width: 768, height: 432 }
};

const SDXL_RESOLUTIONS = {
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 1024, height: 1280 },
  "9:16": { width: 1024, height: 1792 },
  "16:9": { width: 1344, height: 768 }
};

const PRESET_RATIOS = {
  "instagram-post": "1:1",
  instagram_post: "1:1",
  "instagram-story": "9:16",
  instagram_story: "9:16",
  reels: "9:16",
  instagram_reels: "9:16",
  "tiktok-video": "9:16",
  "youtube-thumb": "16:9",
  youtube_thumb: "16:9",
  "facebook-post": "1:1",
  facebook_post: "1:1"
};

const DIFFUSERS_SCHEDULERS = [
  "DPMSolverMultistepScheduler",
  "DPM++ 2M SDE",
  "DPM++ 3M SDE",
  "UniPCMultistepScheduler",
  "UniPC",
  "EulerDiscreteScheduler",
  "EulerAncestralDiscreteScheduler",
  "DDIMScheduler",
  "LMSDiscreteScheduler"
];

const SD_SAMPLERS = [
  "DPM++ 2M SDE",
  "DPM++ 3M SDE",
  "UniPC",
  "Euler",
  "Euler a",
  "DPM++ 2M"
];

const SDXL_SCHEDULER_MODES = ["Karras", "Exponential", "SGM Uniform"];

function gcd(a, b) {
  let x = Math.abs(Math.round(a || 0));
  let y = Math.abs(Math.round(b || 0));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function nearestKnownRatio(width, height) {
  const ratio = Number(width || 1) / Number(height || 1);
  const candidates = [
    ["1:1", 1],
    ["4:5", 4 / 5],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9]
  ];
  candidates.sort((a, b) => Math.abs(a[1] - ratio) - Math.abs(b[1] - ratio));
  return candidates[0][0];
}

function resolveRatio(artboard = {}) {
  const preset = String(artboard.preset || "").trim();
  if (PRESET_RATIOS[preset]) {
    return PRESET_RATIOS[preset];
  }

  const width = Number(artboard.width || 1);
  const height = Number(artboard.height || 1);
  const divisor = gcd(width, height);
  const exact = `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
  if (SD15_RESOLUTIONS[exact]) {
    return exact;
  }

  return nearestKnownRatio(width, height);
}

function normalizeArchitecture(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (text === "sdxl" || text === "xl") return "sdxl";
  return "sd15";
}

function resolveGenerationSize({ artboard = {}, architecture = "sd15", width, height } = {}) {
  const explicitWidth = Number(width || 0);
  const explicitHeight = Number(height || 0);
  if (explicitWidth > 0 && explicitHeight > 0) {
    return {
      width: Math.round(explicitWidth),
      height: Math.round(explicitHeight),
      ratio: resolveRatio(artboard)
    };
  }

  const ratio = resolveRatio(artboard);
  const table = normalizeArchitecture(architecture) === "sdxl" ? SDXL_RESOLUTIONS : SD15_RESOLUTIONS;
  return {
    ...(table[ratio] || table["1:1"]),
    ratio
  };
}

async function parseWorkerResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status === "error") {
    throw new Error(data?.error || data?.message || `SD worker HTTP ${response.status}`);
  }
  return data;
}

export function createStableDiffusionClient(options = {}) {
  const baseUrl = String(options.baseUrl || DEFAULT_SD_URL).replace(/\/+$/, "");

  async function request(path, init = {}) {
    const response = await fetch(`${baseUrl}${path}`, init);
    return parseWorkerResponse(response);
  }

  return {
    baseUrl,
    schedulers: DIFFUSERS_SCHEDULERS,
    samplers: SD_SAMPLERS,
    schedulerModes: SDXL_SCHEDULER_MODES,
    resolveGenerationSize,
    async health() {
      return request("/health");
    },
    async models() {
      return request("/models");
    },
    async progress() {
      return request("/progress");
    },
    async unload() {
      return request("/unload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
    },
    async generate(mode, payload = {}) {
      const normalizedMode = ["txt2img", "img2img", "inpaint"].includes(mode) ? mode : "txt2img";
      return request(`/${normalizedMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
  };
}

export { resolveGenerationSize, resolveRatio };
