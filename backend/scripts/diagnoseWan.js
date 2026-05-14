import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import {
  buildWanWorkerEnv,
  getWanDiagnostics,
  resolveWanPython,
  WAN_CONFIG
} from "../services/video/wanMemoryManager.js";

const RUNTIME_ROOT = path.join(process.cwd(), "backend", "runtimes", "wan");
const manifestPath = path.join(RUNTIME_ROOT, "manifests", "runtime.json");
const legacyRoot = path.join(RUNTIME_ROOT, "legacy");

const checks = [
  ["Wan runtime manifest", manifestPath],
  ["Wan legacy comfy_core", path.join(legacyRoot, "comfy_core")],
  ["Wan legacy gguf_nodes", path.join(legacyRoot, "gguf_nodes")],
  ["Wan legacy extra_nodes", path.join(legacyRoot, "extra_nodes")],
  ["Wan GGUF", process.env.VIDEO_WAN_MODEL_PATH || "F:\\AI\\models\\diffusion_models\\wan2.2-t2v-rapid-aio-v10-nsfw-Q4_K.gguf"],
  ["Text encoder GGUF", process.env.VIDEO_WAN_TEXT_ENCODER_PATH || "F:\\AI\\models\\text_encoders\\umt5-xxl-encoder-Q3_K_S.gguf"],
  ["Wan VAE", process.env.VIDEO_WAN_VAE_PATH || "F:\\AI\\models\\vae\\wan_2.1_vae.safetensors"],
  ["Wan LoRA root", process.env.VIDEO_WAN_LORA_ROOT || "F:\\AI\\models\\loras\\Wan"]
];

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function validateInternalPythonModules() {
  const python = resolveWanPython();
  const probe = [
    "import json, importlib, sys",
    "from pathlib import Path",
    "import backend.runtimes.wan.engine.legacy_comfy as lc",
    "lc._insert_internal_paths()",
    "import folder_paths, execution, comfy",
    "nodes = lc._import_comfy_core_nodes()",
    "gguf_nodes = lc._import_vendor_gguf_nodes(nodes)",
    "import torch, gguf, os",
    "payload = {",
    " 'python': sys.executable,",
    " 'pythonpath': os.environ.get('PYTHONPATH', ''),",
    " 'folder_paths': getattr(folder_paths, '__file__', ''),",
    " 'execution': getattr(execution, '__file__', ''),",
    " 'comfy': getattr(comfy, '__file__', '') or next(iter(getattr(comfy, '__path__', []) or ['']), ''),",
    " 'comfy_nodes': getattr(nodes, '__file__', ''),",
    " 'nodes': getattr(sys.modules.get('nodes'), '__file__', ''),",
    " 'gguf_nodes': getattr(gguf_nodes, '__file__', ''),",
    " 'torch': getattr(torch, '__file__', ''),",
    " 'gguf': getattr(gguf, '__file__', ''),",
    "}",
    "print(json.dumps(payload))"
  ].join("\n");
  const result = spawnSync(python, ["-c", probe], {
    cwd: process.cwd(),
    env: buildWanWorkerEnv(),
    encoding: "utf8",
    timeout: 60000,
    windowsHide: true
  });
  if (result.error) {
    return { ok: false, error: result.error.message, modules: null };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      error: String(result.stderr || result.stdout || `python exited ${result.status}`).trim(),
      modules: null
    };
  }
  const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  const parsed = JSON.parse(lines[lines.length - 1] || "{}");
  return { ok: true, error: "", modules: parsed };
}

function isInside(childPath, parentPath) {
  if (!childPath || !parentPath) {
    return false;
  }
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const diagnostics = getWanDiagnostics();
console.log("[WAN][DIAG] python", diagnostics.python);
console.log("[WAN][DIAG] PYTHONPATH", diagnostics.pythonpath || process.env.PYTHONPATH || "");
console.log("[WAN][DIAG] torch", diagnostics.torch, diagnostics.torch_file || "");
console.log("[WAN][DIAG] CUDA", {
  available: diagnostics.cuda_available,
  gpu: diagnostics.gpu,
  vram_total_mb: diagnostics.vram_total_mb,
  vram_free_mb: diagnostics.vram_free_mb
});
console.log("[WAN][DIAG] gguf", {
  available: diagnostics.gguf,
  origin: diagnostics.gguf_file || ""
});
console.log("[WAN][DIAG]", JSON.stringify(diagnostics, null, 2));

let failed = false;
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest?.base?.comfyui_commit || !manifest?.base?.gguf_commit) {
    console.error("[WAN][DIAG] commits nao documentados em runtime.json (comfyui_commit/gguf_commit).");
    failed = true;
  }
} catch (err) {
  console.error(`[WAN][DIAG] manifest invalido: ${err.message}`);
  failed = true;
}

for (const [label, filePath] of checks) {
  const ok = exists(filePath);
  console.log(`[WAN][DIAG] ${ok ? "ok" : "missing"} ${label}: ${filePath}`);
  failed = failed || !ok;
}

const runtime = WAN_CONFIG.runtime === "comfy_gguf" ? "kit_wan_legacy" : WAN_CONFIG.runtime;
if (runtime !== "kit_wan_legacy") {
  console.error(`[WAN][DIAG] runtime esperado kit_wan_legacy/comfy_gguf, recebido ${WAN_CONFIG.runtime}.`);
  failed = true;
}

if (String(process.env.COMFYUI_ROOT || "").trim()) {
  console.error(`[WAN][DIAG] COMFYUI_ROOT externo detectado; o runtime interno nao deve depender dele: ${process.env.COMFYUI_ROOT}`);
  failed = true;
}

const moduleValidation = validateInternalPythonModules();
if (!moduleValidation.ok) {
  console.error(`[WAN][DIAG] falha ao validar imports internos: ${moduleValidation.error}`);
  failed = true;
} else {
  const modules = moduleValidation.modules;
  console.log("[WAN][DIAG] module origins", JSON.stringify(modules, null, 2));
  const expected = [
    ["comfy", modules.comfy, path.join(legacyRoot, "comfy_core", "comfy")],
    ["comfy_nodes", modules.comfy_nodes, path.join(legacyRoot, "comfy_core")],
    ["nodes", modules.nodes, path.join(legacyRoot, "gguf_nodes")],
    ["gguf_nodes", modules.gguf_nodes, path.join(legacyRoot, "gguf_nodes")]
  ];
  for (const [label, modulePath, expectedRoot] of expected) {
    if (!isInside(modulePath, expectedRoot)) {
      console.error(`[WAN][DIAG] ${label} externo/invalido: ${modulePath} esperado dentro de ${expectedRoot}`);
      failed = true;
    }
    if (/C:\\GitHub\\ComfyUI/i.test(modulePath) || /site-packages/i.test(modulePath)) {
      console.error(`[WAN][DIAG] ${label} veio de origem proibida: ${modulePath}`);
      failed = true;
    }
  }
}

if (!diagnostics.cuda_available && !WAN_CONFIG.allowCpuFallback) {
  console.error("WAN_CUDA_NOT_AVAILABLE: geracao Wan2.2 requer CUDA. Runtime atual esta em CPU.");
  failed = true;
}
if (!diagnostics.gguf) {
  console.error("WAN_GGUF_NOT_AVAILABLE: modulo Python gguf nao encontrado no runtime Wan.");
  failed = true;
}
if (diagnostics.vram_free_mb < WAN_CONFIG.minFreeVramMb) {
  console.error(`WAN_INSUFFICIENT_VRAM: livre=${diagnostics.vram_free_mb}MB minimo=${WAN_CONFIG.minFreeVramMb}MB.`);
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log("[WAN][DIAG] pronto: diagnostico leve concluido sem carregar o modelo completo.");
