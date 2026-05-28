from flask import Flask, request, jsonify
from PIL import Image, ImageFilter
import gc
import importlib.util
import json
import os
import random
import sys
import time
import uuid
import warnings
import inspect
import threading

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
warnings.filterwarnings("ignore", category=FutureWarning, module=r"transformers\.utils\.hub")

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS_ROOT = os.path.abspath(os.environ.get("SD_MODELS_ROOT", os.path.join(ROOT_DIR, "models")))
CHECKPOINTS_PATH = os.path.abspath(os.environ.get("SD_CHECKPOINTS_PATH", os.path.join(MODELS_ROOT, "checkpoints")))
LORAS_PATH = os.path.abspath(os.environ.get("SD_LORAS_PATH", os.path.join(MODELS_ROOT, "loras")))
DIFFUSION_MODELS_PATH = os.path.abspath(
    os.environ.get("SD_DIFFUSION_MODELS_PATH", os.path.join(MODELS_ROOT, "diffusion_models"))
)
ORIGINAL_CONFIGS_PATH = os.path.abspath(os.environ.get("SD_ORIGINAL_CONFIGS_PATH", os.path.join(MODELS_ROOT, "configs")))
OUTPUT_DIR = os.path.abspath(os.environ.get("SD_OUTPUT_PATH", os.path.join(ROOT_DIR, "output", "sd")))
HF_HOME = os.path.abspath(os.environ.get("HF_HOME", os.path.join(ROOT_DIR, "cache", "huggingface")))
HF_HUB_CACHE = os.path.abspath(os.environ.get("HUGGINGFACE_HUB_CACHE", os.path.join(HF_HOME, "hub")))
TRANSFORMERS_CACHE = os.path.abspath(os.environ.get("TRANSFORMERS_CACHE", os.path.join(HF_HOME, "transformers")))

os.environ.setdefault("HF_HOME", HF_HOME)
os.environ.setdefault("HUGGINGFACE_HUB_CACHE", HF_HUB_CACHE)
os.environ.setdefault("TRANSFORMERS_CACHE", TRANSFORMERS_CACHE)
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

HF_SYMLINKS_FORCED_OFF = False
try:
    import huggingface_hub.file_download as hf_file_download

    hf_file_download.are_symlinks_supported = lambda cache_dir=None: False
    if hasattr(hf_file_download, "_are_symlinks_supported_in_dir"):
        hf_file_download._are_symlinks_supported_in_dir.clear()
    HF_SYMLINKS_FORCED_OFF = True
except Exception:
    hf_file_download = None

try:
    import torch
except Exception:
    torch = None

try:
    from safetensors import safe_open
except Exception:
    safe_open = None

try:
    import diffusers

    AutoPipelineForText2Image = getattr(diffusers, "AutoPipelineForText2Image", None)
    DDIMScheduler = getattr(diffusers, "DDIMScheduler", None)
    DPMSolverMultistepScheduler = getattr(diffusers, "DPMSolverMultistepScheduler", None)
    EulerAncestralDiscreteScheduler = getattr(diffusers, "EulerAncestralDiscreteScheduler", None)
    EulerDiscreteScheduler = getattr(diffusers, "EulerDiscreteScheduler", None)
    LMSDiscreteScheduler = getattr(diffusers, "LMSDiscreteScheduler", None)
    UniPCMultistepScheduler = getattr(diffusers, "UniPCMultistepScheduler", None)
    StableDiffusionImg2ImgPipeline = getattr(diffusers, "StableDiffusionImg2ImgPipeline", None)
    StableDiffusionInpaintPipeline = getattr(diffusers, "StableDiffusionInpaintPipeline", None)
    StableDiffusionPipeline = getattr(diffusers, "StableDiffusionPipeline", None)
    StableDiffusionXLImg2ImgPipeline = getattr(diffusers, "StableDiffusionXLImg2ImgPipeline", None)
    StableDiffusionXLInpaintPipeline = getattr(diffusers, "StableDiffusionXLInpaintPipeline", None)
    StableDiffusionXLPipeline = getattr(diffusers, "StableDiffusionXLPipeline", None)
except Exception:
    diffusers = None
    AutoPipelineForText2Image = None
    DDIMScheduler = None
    DPMSolverMultistepScheduler = None
    EulerAncestralDiscreteScheduler = None
    EulerDiscreteScheduler = None
    LMSDiscreteScheduler = None
    UniPCMultistepScheduler = None
    StableDiffusionImg2ImgPipeline = None
    StableDiffusionInpaintPipeline = None
    StableDiffusionPipeline = None
    StableDiffusionXLImg2ImgPipeline = None
    StableDiffusionXLInpaintPipeline = None
    StableDiffusionXLPipeline = None


MODEL_EXTENSIONS = (".safetensors", ".ckpt")
PREVIEW_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".mp4")
SCHEDULERS = {
    "DPMSolverMultistepScheduler": DPMSolverMultistepScheduler,
    "EulerDiscreteScheduler": EulerDiscreteScheduler,
    "EulerAncestralDiscreteScheduler": EulerAncestralDiscreteScheduler,
    "DDIMScheduler": DDIMScheduler,
    "LMSDiscreteScheduler": LMSDiscreteScheduler,
    "UniPCMultistepScheduler": UniPCMultistepScheduler,
    "DPM++ 2M SDE": DPMSolverMultistepScheduler,
    "DPM++ 3M SDE": DPMSolverMultistepScheduler,
    "UniPC": UniPCMultistepScheduler,
    "Euler": EulerDiscreteScheduler,
    "Euler a": EulerAncestralDiscreteScheduler,
    "DPM++ 2M": DPMSolverMultistepScheduler,
}

SAMPLERS = ["DPM++ 2M SDE", "DPM++ 3M SDE", "UniPC", "Euler", "Euler a", "DPM++ 2M"]
SCHEDULER_MODES = ["Karras", "Exponential", "SGM Uniform"]

app = Flask(__name__)

loaded = {
    "pipeline": None,
    "checkpoint": None,
    "architecture": None,
    "mode": None,
    "effective_mode": None,
    "capabilities": None,
    "lora": None,
}

pipe = None
current_model = None
current_pipeline_type = None
idle_unload_timer = None
last_generation_completed_at = None
IDLE_UNLOAD_MS = int(os.environ.get("SD_IDLE_UNLOAD_MS", str(30 * 60 * 1000)))

progress_state = {
    "active": False,
    "phase": "idle",
    "percent": 0,
    "step": None,
    "total": None,
    "message": "Pronto",
    "updatedAt": None,
}


def update_progress(phase, percent=None, step=None, total=None, message=None, active=True):
    safe_percent = progress_state["percent"] if percent is None else max(0, min(100, int(percent)))
    progress_state.update({
        "active": bool(active),
        "phase": phase,
        "percent": safe_percent,
        "step": step,
        "total": total,
        "message": message or phase,
        "updatedAt": time.time(),
    })
    print(f"[SD][progress] {phase} {safe_percent}% {step or ''}/{total or ''} {message or ''}", flush=True)


def reset_progress(message="Pronto"):
    update_progress("idle", 0, None, None, message, False)


def cuda_available():
    return bool(torch and torch.cuda.is_available())


def get_device():
    return "cuda" if cuda_available() else "cpu"


def get_dtype():
    return torch.float16 if cuda_available() else torch.float32


def clean_cuda_cache():
    if cuda_available():
        torch.cuda.empty_cache()
        if hasattr(torch.cuda, "ipc_collect"):
            torch.cuda.ipc_collect()
    gc.collect()


def cancel_idle_unload_timer():
    global idle_unload_timer
    if idle_unload_timer is not None:
        try:
            idle_unload_timer.cancel()
        except Exception:
            pass
        idle_unload_timer = None


def schedule_idle_unload():
    global idle_unload_timer, last_generation_completed_at
    cancel_idle_unload_timer()
    if IDLE_UNLOAD_MS <= 0:
        print("[SD][idle] idle unload disabled", flush=True)
        return

    last_generation_completed_at = time.time()

    def unload_if_still_idle(expected_completed_at):
        if loaded.get("pipeline") is None:
            return
        if last_generation_completed_at != expected_completed_at:
            return
        print(f"[SD][idle] unloading model after {IDLE_UNLOAD_MS}ms idle", flush=True)
        unload_model()

    idle_unload_timer = threading.Timer(IDLE_UNLOAD_MS / 1000, unload_if_still_idle, [last_generation_completed_at])
    idle_unload_timer.daemon = True
    idle_unload_timer.start()
    print(f"[SD][idle] model will stay loaded for {IDLE_UNLOAD_MS}ms idle", flush=True)


def unload_model():
    global pipe, current_model, current_pipeline_type
    cancel_idle_unload_timer()
    pipeline = loaded.get("pipeline")
    print("[SD][unload] deleting pipeline", flush=True)
    loaded["pipeline"] = None
    loaded["checkpoint"] = None
    loaded["architecture"] = None
    loaded["mode"] = None
    loaded["effective_mode"] = None
    loaded["capabilities"] = None
    loaded["lora"] = None
    pipe = None
    current_model = None
    current_pipeline_type = None
    if pipeline is not None:
        print("[SD][unload] deleting components", flush=True)
        for component_name in (
            "text_encoder",
            "text_encoder_2",
            "vae",
            "unet",
            "scheduler",
            "tokenizer",
            "tokenizer_2",
            "image_encoder",
            "controlnet",
            "adapter",
            "adapters",
        ):
            try:
                if hasattr(pipeline, component_name):
                    setattr(pipeline, component_name, None)
            except Exception:
                pass
        try:
            if hasattr(pipeline, "components"):
                pipeline.components.clear()
        except Exception:
            pass
        try:
            pipeline._all_hooks = []
        except Exception:
            pass
        del pipeline
    clean_cuda_cache()
    print("[SD][unload] cuda cache cleared", flush=True)
    print("[SD][unload] completed", flush=True)


def log_cuda_memory(label):
    if not cuda_available():
        print(f"[SD][memory] {label} cuda=false", flush=True)
        return
    try:
        free_bytes, total_bytes = torch.cuda.mem_get_info()
        used_mb = (total_bytes - free_bytes) / (1024 * 1024)
        free_mb = free_bytes / (1024 * 1024)
        allocated_mb = torch.cuda.memory_allocated() / (1024 * 1024)
        reserved_mb = torch.cuda.memory_reserved() / (1024 * 1024)
        print(
            f"[SD][memory] {label} usedMb={used_mb:.2f} freeMb={free_mb:.2f} allocatedMb={allocated_mb:.2f} reservedMb={reserved_mb:.2f}",
            flush=True,
        )
    except Exception as exc:
        print(f"[SD][memory] {label} error={exc}", flush=True)


def find_preview_for_model(model_path):
    base, _ = os.path.splitext(model_path)
    for extension in PREVIEW_EXTENSIONS:
        candidate = base + extension
        if os.path.exists(candidate):
            return candidate
    return None


def make_model_item(model_path, model_type):
    file_name = os.path.basename(model_path)
    ext = os.path.splitext(file_name)[1].lower()
    return {
        "name": os.path.splitext(file_name)[0],
        "type": model_type,
        "path": os.path.abspath(model_path),
        "preview": find_preview_for_model(model_path),
        "filename": file_name,
        "ext": ext,
        "architecture": detect_architecture_from_name(model_path),
    }


def scan_model_dir(directory, model_type):
    items = []
    seen = set()
    if not os.path.isdir(directory):
        return items

    for root, _, files in os.walk(directory):
        for file_name in files:
            if not file_name.lower().endswith(MODEL_EXTENSIONS):
                continue
            full_path = os.path.abspath(os.path.join(root, file_name))
            if full_path in seen:
                continue
            seen.add(full_path)
            items.append(make_model_item(full_path, model_type))
    return sorted(items, key=lambda item: item["name"].lower())


def is_diffusers_model_dir(directory):
    if not os.path.isdir(directory):
        return False
    markers = ["model_index.json", "scheduler", "text_encoder", "tokenizer", "unet", "vae"]
    count = sum(1 for marker in markers if os.path.exists(os.path.join(directory, marker)))
    return count >= 2 or os.path.exists(os.path.join(directory, "model_index.json"))


def scan_diffusion_model_dirs(directory):
    items = []
    if not os.path.isdir(directory):
        return items

    for entry in os.listdir(directory):
        full_path = os.path.abspath(os.path.join(directory, entry))
        if not os.path.isdir(full_path) or not is_diffusers_model_dir(full_path):
            continue
        items.append({
            "name": entry,
            "type": "diffusion_model",
            "path": full_path,
            "preview": None,
            "filename": entry,
            "ext": "",
            "architecture": detect_architecture_from_name(full_path),
        })
    return sorted(items, key=lambda item: item["name"].lower())


def scan_all_models():
    return {
        "checkpoints": scan_model_dir(CHECKPOINTS_PATH, "checkpoint"),
        "loras": scan_model_dir(LORAS_PATH, "lora"),
        "diffusionModels": scan_diffusion_model_dirs(DIFFUSION_MODELS_PATH),
    }


def detect_architecture_from_name(value):
    text = str(value or "").lower()
    if "sdxl" in text or "xl" in os.path.basename(text):
        return "sdxl"
    if "1.5" in text or "sd15" in text or "sd_15" in text:
        return "sd15"
    return "auto"


def normalize_architecture(value, checkpoint):
    selected = str(value or "").lower().strip()
    if selected in ("sdxl", "xl"):
        return "sdxl"
    if selected in ("sd15", "sd1.5", "sd-1.5", "1.5"):
        return "sd15"
    guessed = detect_architecture_from_name(checkpoint)
    return "sdxl" if guessed == "sdxl" else "sd15"


def read_unet_in_channels_from_dir(directory):
    config_path = os.path.join(directory, "unet", "config.json")
    if not os.path.isfile(config_path):
        return None
    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
        value = config.get("in_channels")
        return int(value) if value is not None else None
    except Exception:
        return None


def read_unet_in_channels_from_safetensors(model_path):
    if safe_open is None:
        return None
    candidate_keys = [
        "model.diffusion_model.input_blocks.0.0.weight",
        "diffusion_model.input_blocks.0.0.weight",
        "unet.conv_in.weight",
        "conv_in.weight",
    ]
    try:
        with safe_open(model_path, framework="pt", device="cpu") as handle:
            keys = set(handle.keys())
            for key in candidate_keys:
                if key in keys:
                    return int(handle.get_tensor(key).shape[1])
            for key in keys:
                if key.endswith("conv_in.weight") or key.endswith("input_blocks.0.0.weight"):
                    tensor = handle.get_tensor(key)
                    if len(tensor.shape) >= 2:
                        return int(tensor.shape[1])
    except Exception:
        return None
    return None


def read_unet_in_channels_from_checkpoint(model_path):
    if torch is None:
        return None
    candidate_keys = [
        "model.diffusion_model.input_blocks.0.0.weight",
        "diffusion_model.input_blocks.0.0.weight",
        "unet.conv_in.weight",
        "conv_in.weight",
    ]
    try:
        payload = torch.load(model_path, map_location="cpu")
        state_dict = payload.get("state_dict", payload) if isinstance(payload, dict) else payload
        if not isinstance(state_dict, dict):
            return None
        for key in candidate_keys:
            tensor = state_dict.get(key)
            if tensor is not None and hasattr(tensor, "shape") and len(tensor.shape) >= 2:
                return int(tensor.shape[1])
        for key, tensor in state_dict.items():
            if (str(key).endswith("conv_in.weight") or str(key).endswith("input_blocks.0.0.weight")) and hasattr(tensor, "shape") and len(tensor.shape) >= 2:
                return int(tensor.shape[1])
    except Exception:
        return None
    return None


def detectSdModelCapabilities(modelPath):
    model_path = resolve_checkpoint(modelPath)
    model_type = normalize_architecture(None, model_path)
    file_name = os.path.basename(str(model_path or "")).lower()
    unet_in_channels = None

    if os.path.isdir(model_path):
        unet_in_channels = read_unet_in_channels_from_dir(model_path)
    elif model_path.lower().endswith(".safetensors"):
        unet_in_channels = read_unet_in_channels_from_safetensors(model_path)
    elif model_path.lower().endswith(".ckpt"):
        unet_in_channels = read_unet_in_channels_from_checkpoint(model_path)

    name_says_inpaint = "inpaint" in file_name or "inpainting" in file_name
    supports_native_inpaint = unet_in_channels == 9 or (unet_in_channels is None and name_says_inpaint)
    return {
        "modelType": model_type,
        "supportsNativeInpaint": bool(supports_native_inpaint),
        "unetInChannels": unet_in_channels,
    }


def resolve_checkpoint(value):
    requested = os.path.abspath(str(value or "").strip())
    if requested and DIFFUSION_MODELS_PATH.lower() in requested.lower():
        raise ValueError("Modelo de video detectado em diffusion_models. O motor de imagem aceita apenas checkpoints SD15/SDXL.")
    if requested and os.path.exists(requested):
        return requested
    scanned = scan_all_models()
    models = scanned["checkpoints"]
    for item in models:
        if value and (value == item["path"] or value == item["name"] or value == item["filename"]):
            return item["path"]
    raise ValueError("Checkpoint local nao encontrado.")


def normalize_scheduler_request(scheduler_name, sampler_name=None):
    raw_scheduler = str(scheduler_name or "").strip()
    raw_sampler = str(sampler_name or "").strip()
    sampler = raw_sampler or raw_scheduler
    scheduler_mode = raw_scheduler if raw_scheduler in SCHEDULER_MODES else ""

    if raw_scheduler in SCHEDULERS and raw_scheduler not in SCHEDULER_MODES:
        sampler = raw_scheduler
    elif scheduler_mode and not raw_sampler:
        sampler = "DPMSolverMultistepScheduler"

    return sampler, scheduler_mode


def build_scheduler_options(sampler_name, scheduler_mode):
    options = {}
    sampler = str(sampler_name or "").strip()
    mode = str(scheduler_mode or "").strip()

    if sampler == "DPM++ 2M SDE":
        options.update({"algorithm_type": "sde-dpmsolver++", "solver_order": 2})
    elif sampler == "DPM++ 3M SDE":
        options.update({"algorithm_type": "sde-dpmsolver++", "solver_order": 3})

    if mode == "Karras":
        options["use_karras_sigmas"] = True
    elif mode == "Exponential":
        options["use_exponential_sigmas"] = True
    elif mode == "SGM Uniform":
        options["timestep_spacing"] = "trailing"

    return options


def apply_scheduler(pipe, scheduler_name, sampler_name=None):
    sampler, scheduler_mode = normalize_scheduler_request(scheduler_name, sampler_name)
    scheduler_class = SCHEDULERS.get(sampler)
    if scheduler_class is None or pipe is None:
        return pipe
    options = build_scheduler_options(sampler, scheduler_mode)
    try:
        pipe.scheduler = scheduler_class.from_config(pipe.scheduler.config, **options)
    except Exception:
        pipe.scheduler = scheduler_class.from_config(pipe.scheduler.config)
        for key, value in options.items():
            if hasattr(pipe.scheduler.config, key):
                setattr(pipe.scheduler.config, key, value)
    return pipe


def enable_memory_optimizations(pipe):
    if not pipe:
        return pipe
    try:
        pipe.enable_attention_slicing()
    except Exception:
        pass
    try:
        pipe.enable_vae_slicing()
    except Exception:
        pass
    try:
        pipe.enable_xformers_memory_efficient_attention()
    except Exception:
        pass
    return pipe


def ensure_pipeline_class(pipeline_class, pipeline_name):
    if pipeline_class is None:
        raise RuntimeError(f"Pipeline diffusers indisponivel: {pipeline_name}")
    return pipeline_class


def loader_pipeline_name(architecture, effective_mode):
    prefix = "SDXL" if architecture == "sdxl" else "SD15"
    if effective_mode == "img2img":
        return f"{prefix}_IMG2IMG"
    if effective_mode == "inpaint":
        return f"{prefix}_INPAINT"
    return f"{prefix}_TXT2IMG"


def get_pipeline_class(architecture, effective_mode):
    if effective_mode == "txt2img":
        if architecture == "sdxl":
            return ensure_pipeline_class(StableDiffusionXLPipeline, "StableDiffusionXLPipeline")
        return ensure_pipeline_class(StableDiffusionPipeline or AutoPipelineForText2Image, "StableDiffusionPipeline")

    if effective_mode == "img2img":
        if architecture == "sdxl":
            return ensure_pipeline_class(StableDiffusionXLImg2ImgPipeline, "StableDiffusionXLImg2ImgPipeline")
        return ensure_pipeline_class(StableDiffusionImg2ImgPipeline, "StableDiffusionImg2ImgPipeline")

    if architecture == "sdxl":
        return ensure_pipeline_class(StableDiffusionXLInpaintPipeline, "StableDiffusionXLInpaintPipeline")
    return ensure_pipeline_class(StableDiffusionInpaintPipeline, "StableDiffusionInpaintPipeline")


def load_pipeline_from_checkpoint(checkpoint, architecture, effective_mode, kwargs):
    pipeline_name = loader_pipeline_name(architecture, effective_mode)
    print(f"[SD][loader] pipeline={pipeline_name}", flush=True)
    pipeline_class = get_pipeline_class(architecture, effective_mode)
    if os.path.isdir(checkpoint):
        return pipeline_class.from_pretrained(checkpoint, **kwargs)
    return pipeline_class.from_single_file(checkpoint, **kwargs)


def create_pipeline(checkpoint, architecture, mode, capabilities=None):
    if diffusers is None:
        raise RuntimeError("Diffusers nao esta instalado no ambiente Python do worker.")
    capabilities = capabilities or detectSdModelCapabilities(checkpoint)
    effective_mode = "img2img" if mode == "inpaint" and not capabilities.get("supportsNativeInpaint") else mode
    if mode == "inpaint":
        print(f"[SD][inpaint] selected model {checkpoint}", flush=True)
        print(f"[SD][inpaint] model supports native inpaint: {str(bool(capabilities.get('supportsNativeInpaint'))).lower()}", flush=True)
        print(f"[SD][inpaint] unet in_channels {capabilities.get('unetInChannels')}", flush=True)

    kwargs = {
        "torch_dtype": get_dtype(),
        "local_files_only": True,
        "cache_dir": HF_HUB_CACHE,
    }
    if accelerate_available():
        kwargs["low_cpu_mem_usage"] = True

    if os.path.isdir(checkpoint):
        if mode == "inpaint" and effective_mode == "img2img":
            print("[SD][inpaint] using img2img masked fallback", flush=True)
            print("[SD][inpaint] fallback=masked_img2img", flush=True)
        elif effective_mode == "inpaint":
            print("[SD][inpaint] using native inpaint pipeline", flush=True)
        pipe = load_pipeline_from_checkpoint(checkpoint, architecture, effective_mode, kwargs)
        setattr(pipe, "_kit_effective_mode", effective_mode)
        setattr(pipe, "_kit_inpaint_fallback", mode == "inpaint" and effective_mode == "img2img")
        pipe = enable_memory_optimizations(pipe)
        return pipe.to(get_device())

    kwargs["use_safetensors"] = checkpoint.lower().endswith(".safetensors")
    original_config = resolve_original_config(checkpoint, architecture, effective_mode)
    local_diffusers_config = resolve_local_diffusers_config(architecture)
    if original_config:
        kwargs["original_config"] = original_config
    if local_diffusers_config:
        kwargs["config"] = local_diffusers_config
    if architecture == "sd15":
        kwargs["safety_checker"] = None
        kwargs["feature_extractor"] = None
        kwargs["requires_safety_checker"] = False

    if mode == "inpaint" and effective_mode == "img2img":
        print("[SD][inpaint] using img2img masked fallback", flush=True)
        print("[SD][inpaint] fallback=masked_img2img", flush=True)
    elif effective_mode == "inpaint":
        print("[SD][inpaint] using native inpaint pipeline", flush=True)

    pipe = load_pipeline_from_checkpoint(checkpoint, architecture, effective_mode, kwargs)

    setattr(pipe, "_kit_effective_mode", effective_mode)
    setattr(pipe, "_kit_inpaint_fallback", mode == "inpaint" and effective_mode == "img2img")
    pipe = enable_memory_optimizations(pipe)
    return pipe.to(get_device())


def write_json_if_missing(file_path, payload):
    if os.path.exists(file_path):
        return False
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    return True


def find_cached_diffusers_snapshot(repo_folder_name):
    repo_root = os.path.join(HF_HUB_CACHE, repo_folder_name, "snapshots")
    if not os.path.isdir(repo_root):
        return None

    candidates = []
    for snapshot_name in os.listdir(repo_root):
        snapshot_path = os.path.join(repo_root, snapshot_name)
        if os.path.isdir(snapshot_path) and os.path.exists(os.path.join(snapshot_path, "model_index.json")):
            candidates.append(snapshot_path)
    candidates.sort(key=lambda item: os.path.getmtime(item), reverse=True)
    return candidates[0] if candidates else None


def ensure_sd15_diffusers_config(snapshot_path):
    write_json_if_missing(os.path.join(snapshot_path, "text_encoder", "config.json"), {
        "architectures": ["CLIPTextModel"],
        "attention_dropout": 0.0,
        "bos_token_id": 49406,
        "eos_token_id": 49407,
        "hidden_act": "quick_gelu",
        "hidden_size": 768,
        "initializer_factor": 1.0,
        "initializer_range": 0.02,
        "intermediate_size": 3072,
        "layer_norm_eps": 1e-05,
        "max_position_embeddings": 77,
        "model_type": "clip_text_model",
        "num_attention_heads": 12,
        "num_hidden_layers": 12,
        "pad_token_id": 1,
        "projection_dim": 768,
        "torch_dtype": "float32",
        "transformers_version": "4.46.1",
        "vocab_size": 49408
    })
    write_json_if_missing(os.path.join(snapshot_path, "scheduler", "scheduler_config.json"), {
        "_class_name": "PNDMScheduler",
        "_diffusers_version": "0.31.0",
        "beta_end": 0.012,
        "beta_schedule": "scaled_linear",
        "beta_start": 0.00085,
        "num_train_timesteps": 1000,
        "prediction_type": "epsilon",
        "set_alpha_to_one": False,
        "skip_prk_steps": True,
        "steps_offset": 1,
        "timestep_spacing": "leading",
        "trained_betas": None
    })
    return snapshot_path


def resolve_local_diffusers_config(architecture):
    if architecture != "sd15":
        return None

    snapshot = find_cached_diffusers_snapshot("models--stable-diffusion-v1-5--stable-diffusion-v1-5")
    if not snapshot:
        return None

    required_tokenizer_files = ["merges.txt", "vocab.json"]
    tokenizer_dir = os.path.join(snapshot, "tokenizer")
    if not all(os.path.exists(os.path.join(tokenizer_dir, file_name)) for file_name in required_tokenizer_files):
        return None

    return ensure_sd15_diffusers_config(snapshot)


def resolve_original_config(checkpoint, architecture, mode):
    if architecture == "sdxl":
        return None

    file_name = os.path.basename(str(checkpoint or "")).lower()
    candidates = []

    if mode == "inpaint" or "inpaint" in file_name or "inpainting" in file_name:
        candidates.append("v1-inpainting-inference.yaml")

    if "v2" in file_name or "768" in file_name:
        candidates.extend(["v2-inference-v.yaml", "v2-inference.yaml"])
    else:
        candidates.extend(["v1-inference.yaml", "v1-inference_fp16.yaml"])

    for candidate in candidates:
        config_path = os.path.join(ORIGINAL_CONFIGS_PATH, candidate)
        if os.path.isfile(config_path):
            return config_path

    return None


def load_pipeline(checkpoint_value, architecture_value, mode, scheduler_name=None, lora_path=None, sampler_name=None):
    global pipe, current_model, current_pipeline_type
    checkpoint = resolve_checkpoint(checkpoint_value)
    architecture = normalize_architecture(architecture_value, checkpoint)
    capabilities = detectSdModelCapabilities(checkpoint)
    effective_mode = "img2img" if mode == "inpaint" and not capabilities.get("supportsNativeInpaint") else mode
    lora_path = str(lora_path or "").strip() or None
    if lora_path:
        lora_path = os.path.abspath(lora_path)
    cancel_idle_unload_timer()

    needs_reload = (
        loaded["pipeline"] is None
        or loaded["checkpoint"] != checkpoint
        or loaded["architecture"] != architecture
        or loaded["mode"] != mode
        or loaded["effective_mode"] != effective_mode
        or loaded["lora"] != lora_path
    )

    if needs_reload:
        unload_model()
        update_progress("loading_model", 2, None, None, "Carregando modelo SD")
        loaded["pipeline"] = create_pipeline(checkpoint, architecture, mode, capabilities)
        pipe = loaded["pipeline"]
        update_progress("loading_model", 24, None, None, "Modelo SD carregado")
        loaded["checkpoint"] = checkpoint
        loaded["architecture"] = architecture
        loaded["mode"] = mode
        loaded["effective_mode"] = effective_mode
        loaded["capabilities"] = capabilities
        loaded["lora"] = lora_path
        current_model = checkpoint
        current_pipeline_type = mode

        if lora_path and os.path.exists(lora_path):
            update_progress("loading_model", 28, None, None, "Aplicando LoRA")
            loaded["pipeline"].load_lora_weights(lora_path)

    apply_scheduler(loaded["pipeline"], scheduler_name, sampler_name)
    return loaded["pipeline"], checkpoint, architecture, lora_path


def request_json():
    return request.get_json(silent=True) or {}


def get_seed(value):
    seed = int(value if value is not None else -1)
    if seed < 0:
        seed = random.randint(0, 2**31 - 1)
    return seed


def get_generator(seed):
    if torch is None:
        return None
    return torch.Generator(device=get_device()).manual_seed(seed)


def load_image(path_value, mode="RGB"):
    image_path = os.path.abspath(str(path_value or "").strip())
    if not image_path or not os.path.exists(image_path):
        raise ValueError("Imagem de entrada nao encontrada.")
    return Image.open(image_path).convert(mode)


def normalize_inpaint_area(value):
    text = str(value or "").strip()
    if text in ("whole_picture", "whole-picture", "full"):
        return "whole_picture"
    return "only_masked"


def normalize_masked_content(value):
    text = str(value or "").strip()
    if text in ("fill", "original", "latent_noise", "latent_nothing"):
        return text
    return "fill"


def normalize_inpaint_output_mode(value):
    text = str(value or "").strip()
    if text in ("replace", "replaceSelected", "active-layer"):
        return "replace_original"
    if text in ("new-layer", "full-layer", "newLayer"):
        return "new_full_layer"
    if text in ("cropped-layer", "patch"):
        return "patch_layer"
    if text in ("replace_original", "new_full_layer", "patch_layer"):
        return text
    return "new_full_layer"


def apply_masked_content(image, mask_image, masked_content):
    mode = normalize_masked_content(masked_content)
    if mode == "original":
        return image

    if mode == "latent_nothing":
        replacement = Image.new("RGB", image.size, (0, 0, 0))
    elif mode == "latent_noise":
        replacement = Image.effect_noise(image.size, 100).convert("RGB")
    else:
        radius = max(8, min(image.size) // 16)
        replacement = image.filter(ImageFilter.GaussianBlur(radius=radius))

    return Image.composite(replacement, image, mask_image)


def prepare_inpaint_inputs(data, width, height):
    inpaint_area = normalize_inpaint_area(data.get("inpaint_area") or data.get("inpaintArea"))
    masked_content = normalize_masked_content(data.get("masked_content") or data.get("maskedContent"))
    init_image = load_image(data.get("initImagePath") or data.get("image_path") or data.get("imagePath")).resize((width, height))
    mask_image = load_image(data.get("mask_path") or data.get("maskPath"), "L").resize((width, height))
    prepared_image = apply_masked_content(init_image, mask_image, masked_content)
    return {
        "init_image": init_image,
        "call_image": prepared_image,
        "call_mask": mask_image,
        "compose_mask": mask_image,
        "inpaint_area": inpaint_area,
        "masked_content": masked_content,
        "call_size": (width, height),
    }


def compose_inpaint_result(generated_image, prepared):
    image = generated_image.convert("RGB")
    init_image = prepared["init_image"]
    resized = image.resize(init_image.size)
    if prepared.get("inpaint_area") == "only_masked":
        return Image.composite(resized, init_image, prepared["compose_mask"])
    return resized


def save_output(image, metadata):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    file_name = f"sd_{int(time.time())}_{uuid.uuid4().hex[:8]}.png"
    output_path = os.path.join(OUTPUT_DIR, file_name)
    image.save(output_path)
    return {
        "file": output_path,
        "metadata": metadata,
    }


def output_url_for_path(output_path):
    try:
        if output_path and os.path.abspath(output_path).startswith(os.path.abspath(OUTPUT_DIR)):
            return f"/output/{os.path.basename(output_path)}"
    except Exception:
        pass
    return ""


def supports_parameter(callable_value, parameter_name):
    try:
        parameters = inspect.signature(callable_value).parameters
        if parameter_name in parameters:
            return True
        return any(param.kind == inspect.Parameter.VAR_KEYWORD for param in parameters.values())
    except Exception:
        return False


def build_progress_callback(total_steps):
    safe_steps = max(1, int(total_steps or 1))

    def publish_step(step_index):
        step_number = max(1, min(safe_steps, int(step_index) + 1))
        ratio = step_number / safe_steps
        percent = 25 + round(ratio * 70)
        print(f"[SD][progress] generating {step_number}/{safe_steps}", flush=True)
        update_progress(
            "generating",
            percent,
            step_number,
            safe_steps,
            f"Gerando imagem {step_number}/{safe_steps}"
        )

    def callback(step, timestep=None, latents=None):
        publish_step(step)

    def callback_on_step_end(pipe, step, timestep, callback_kwargs):
        publish_step(step)
        return callback_kwargs

    return callback, callback_on_step_end


def make_generation_callbacks(steps):
    return build_progress_callback(steps)


@app.route("/output/<path:file_name>", methods=["GET"])
def output_file(file_name):
    from flask import send_from_directory

    safe_name = os.path.basename(str(file_name or ""))
    return send_from_directory(OUTPUT_DIR, safe_name)


def xformers_available():
    return importlib.util.find_spec("xformers") is not None


def accelerate_available():
    return importlib.util.find_spec("accelerate") is not None


def directory_writable_status(directory_path):
    try:
        os.makedirs(directory_path, exist_ok=True)
        probe_path = os.path.join(directory_path, f".kit-write-test-{os.getpid()}-{int(time.time() * 1000)}")
        with open(probe_path, "w", encoding="utf-8") as handle:
            handle.write("ok")
        os.remove(probe_path)
        return {"path": directory_path, "writable": True, "error": None}
    except Exception as exc:
        return {"path": directory_path, "writable": False, "error": str(exc)}


def cache_status():
    caches = {
        "hfHome": directory_writable_status(HF_HOME),
        "hfHubCache": directory_writable_status(HF_HUB_CACHE),
        "transformersCache": directory_writable_status(TRANSFORMERS_CACHE),
        "outputPath": directory_writable_status(OUTPUT_DIR),
    }
    warnings = [
        f"{name} sem permissao de escrita: {status['path']} ({status['error']})"
        for name, status in caches.items()
        if not status["writable"]
    ]
    return caches, warnings


def generate(mode):
    data = request_json()
    update_progress("loading_model", 1, None, None, "Preparando geracao SD")
    seed = get_seed(data.get("seed", -1))
    width = int(data.get("width") or 512)
    height = int(data.get("height") or 512)
    prompt = str(data.get("prompt") or data.get("positive_prompt") or "").strip()
    negative_prompt = str(data.get("negative_prompt") or data.get("negativePrompt") or "").strip()
    steps = int(data.get("steps") or data.get("sampling_steps") or 24)
    cfg_scale = float(data.get("cfg_scale") or data.get("guidance_scale") or 7)
    scheduler = str(data.get("scheduler") or data.get("schedule_type") or "DPMSolverMultistepScheduler")
    sampler = str(data.get("sampler") or "")
    denoising_strength = float(data.get("denoising_strength") or data.get("strength") or 0.55)
    inpaint_output_mode = normalize_inpaint_output_mode(data.get("inpaint_output_mode") or data.get("inpaintOutputMode"))
    if mode == "inpaint":
        print(f"[SD][inpaint] output_mode={inpaint_output_mode}", flush=True)
    print(f"[SD][generate] steps={steps} width={width} height={height}", flush=True)
    log_cuda_memory("before_generation")

    pipe, checkpoint, architecture, lora_path = load_pipeline(
        data.get("checkpoint") or data.get("model"),
        data.get("architecture") or data.get("model_type"),
        mode,
        scheduler,
        data.get("lora"),
        sampler,
    )
    generator = get_generator(seed)
    progress_steps = steps
    if mode in ("img2img", "inpaint"):
        strength = max(0.0, min(1.0, float(denoising_strength)))
        progress_steps = max(1, int(steps * strength))
    update_progress("generating", 25, 0, progress_steps, f"Gerando imagem 0/{progress_steps}")

    common = {
        "prompt": prompt,
        "negative_prompt": negative_prompt or None,
        "num_inference_steps": steps,
        "guidance_scale": cfg_scale,
        "generator": generator,
    }
    callback, callback_on_step_end = make_generation_callbacks(progress_steps)
    if supports_parameter(pipe.__call__, "callback_on_step_end"):
        common["callback_on_step_end"] = callback_on_step_end
    elif supports_parameter(pipe.__call__, "callback"):
        common["callback"] = callback
        common["callback_steps"] = 1

    result = None
    image = None
    init_image = None
    mask_image = None
    generated_image = None
    composite_image = None
    prepared = None
    call_image = None
    output = None
    try:
        if mode == "txt2img":
            result = pipe(width=width, height=height, **common)
        elif mode == "img2img":
            init_image = load_image(data.get("initImagePath") or data.get("image_path") or data.get("imagePath")).resize((width, height))
            result = pipe(image=init_image, strength=denoising_strength, **common)
        else:
            prepared = prepare_inpaint_inputs(data, width, height)
            init_image = prepared["init_image"]
            call_image = prepared["call_image"]
            mask_image = prepared["call_mask"]
            print(
                f"[SD][inpaint] area={prepared['inpaint_area']} masked_content={prepared['masked_content']} full_image=true",
                flush=True,
            )
            if getattr(pipe, "_kit_inpaint_fallback", False):
                result = pipe(image=call_image, strength=denoising_strength, **common)
                generated_image = result.images[0].convert("RGB").resize(prepared["call_size"])
                composite_image = Image.composite(generated_image, call_image, mask_image)
                update_progress("compositing", 96, progress_steps, progress_steps, "Compondo mascara")
                result.images[0] = compose_inpaint_result(composite_image, prepared)
                print("[SD][inpaint] mask composite done", flush=True)
            else:
                result = pipe(image=call_image, mask_image=mask_image, strength=denoising_strength, **common)
                update_progress("compositing", 96, progress_steps, progress_steps, "Compondo mascara")
                result.images[0] = compose_inpaint_result(result.images[0], prepared)

        image = result.images[0]
        metadata = {
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "checkpoint": checkpoint,
            "lora": lora_path,
            "seed": seed,
            "mode": mode,
            "width": width,
            "height": height,
            "sampler": sampler or scheduler,
            "scheduler": scheduler,
            "steps": steps,
            "effective_steps": progress_steps,
            "cfg_scale": cfg_scale,
            "denoising_strength": denoising_strength if mode != "txt2img" else None,
            "inpaint_area": normalize_inpaint_area(data.get("inpaint_area") or data.get("inpaintArea")) if mode == "inpaint" else None,
            "masked_content": normalize_masked_content(data.get("masked_content") or data.get("maskedContent")) if mode == "inpaint" else None,
            "inpaint_output_mode": inpaint_output_mode if mode == "inpaint" else None,
            "architecture": architecture,
            "device": get_device(),
        }
        update_progress("saving", 98, progress_steps, progress_steps, "Salvando imagem")
        output = save_output(image, metadata)
        image_path = output.get("file") or ""
        if not image_path or not os.path.isfile(image_path):
            update_progress("error", 100, progress_steps, progress_steps, "Imagem gerada, mas arquivo ausente.", False)
            return jsonify({
                "status": "error",
                "ok": False,
                "success": False,
                "error": "Imagem gerada, mas o backend nao retornou o arquivo.",
            }), 500

        clean_cuda_cache()
        log_cuda_memory("after_generation")
        if data.get("autoUnload", data.get("auto_unload", False)):
            unload_model()
            log_cuda_memory("after_unload")
        else:
            schedule_idle_unload()

        update_progress("completed", 100, progress_steps, progress_steps, "Imagem gerada", False)
        image_url = output_url_for_path(image_path)
        return jsonify({
            "status": "ok",
            "ok": True,
            "success": True,
            "file": image_path,
            "imagePath": image_path,
            "imageUrl": image_url,
            "outputMode": inpaint_output_mode if mode == "inpaint" else None,
            "width": width,
            "height": height,
            **output,
        })
    finally:
        try:
            if result is not None and hasattr(result, "images"):
                result.images = []
        except Exception:
            pass
        del init_image
        del mask_image
        del generated_image
        del composite_image
        del prepared
        del call_image
        del result
        del image
        clean_cuda_cache()


@app.route("/health", methods=["GET"])
def health():
    scanned = scan_all_models()
    caches, cache_warnings = cache_status()
    sd15_config = resolve_local_diffusers_config("sd15")
    return jsonify({
        "status": "ok",
        "service": "stable-diffusion-worker",
        "ready": AutoPipelineForText2Image is not None,
        "pythonPath": sys.executable,
        "modelsRoot": MODELS_ROOT,
        "checkpointsPath": CHECKPOINTS_PATH,
        "lorasPath": LORAS_PATH,
        "diffusionModelsPath": DIFFUSION_MODELS_PATH,
        "originalConfigsPath": ORIGINAL_CONFIGS_PATH,
        "sd15LocalDiffusersConfig": sd15_config,
        "outputPath": OUTPUT_DIR,
        "cache": {
            "hfHome": HF_HOME,
            "hfHubCache": HF_HUB_CACHE,
            "transformersCache": TRANSFORMERS_CACHE,
            "symlinksForcedOff": HF_SYMLINKS_FORCED_OFF,
            "status": caches,
            "warnings": cache_warnings,
        },
        "warnings": cache_warnings,
        "counts": {
            "checkpoints": len(scanned["checkpoints"]),
            "loras": len(scanned["loras"]),
            "diffusionModels": len(scanned["diffusionModels"]),
        },
        "device": get_device(),
        "cuda": cuda_available(),
        "xformers": xformers_available(),
        "diffusers": AutoPipelineForText2Image is not None,
        "loaded": {
            "checkpoint": loaded["checkpoint"],
            "architecture": loaded["architecture"],
            "mode": loaded["mode"],
            "effectiveMode": loaded["effective_mode"],
            "capabilities": loaded["capabilities"],
            "lora": loaded["lora"],
        },
        "progress": progress_state,
    })


@app.route("/models", methods=["GET"])
def models():
    scanned = scan_all_models()
    return jsonify({
        "status": "ok",
        **scanned,
        "schedulers": list(SCHEDULERS.keys()),
        "samplers": SAMPLERS,
        "schedulerModes": SCHEDULER_MODES,
        "paths": {
            "modelsRoot": MODELS_ROOT,
            "checkpointsPath": CHECKPOINTS_PATH,
            "lorasPath": LORAS_PATH,
            "diffusionModelsPath": DIFFUSION_MODELS_PATH,
            "originalConfigsPath": ORIGINAL_CONFIGS_PATH,
            "outputPath": OUTPUT_DIR,
        },
    })


@app.route("/progress", methods=["GET"])
def progress():
    return jsonify({"status": "ok", **progress_state})


@app.route("/unload", methods=["POST"])
def unload():
    unload_model()
    return jsonify({
        "status": "ok",
        "message": "Stable Diffusion model unloaded"
    })


@app.route("/cleanup", methods=["POST"])
def cleanup():
    clean_cuda_cache()
    log_cuda_memory("cleanup")
    return jsonify({
        "status": "ok",
        "message": "Stable Diffusion cache cleaned",
        "loaded": loaded.get("pipeline") is not None,
    })


@app.route("/txt2img", methods=["POST"])
def txt2img():
    try:
        return generate("txt2img")
    except Exception as exc:
        update_progress("error", 100, None, None, str(exc), False)
        print("[SD] txt2img erro:", exc)
        return jsonify({"status": "error", "error": str(exc)}), 500


@app.route("/img2img", methods=["POST"])
def img2img():
    try:
        return generate("img2img")
    except Exception as exc:
        update_progress("error", 100, None, None, str(exc), False)
        print("[SD] img2img erro:", exc)
        return jsonify({"status": "error", "error": str(exc)}), 500


@app.route("/inpaint", methods=["POST"])
def inpaint():
    try:
        return generate("inpaint")
    except Exception as exc:
        update_progress("error", 100, None, None, str(exc), False)
        print("[SD] inpaint erro:", exc)
        return jsonify({"status": "error", "error": str(exc)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("SD_PORT", 5010))
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"[SD] Worker em http://127.0.0.1:{port}")
    print(f"[SD] Python: {sys.executable}")
    print(f"[SD] Modelos raiz: {MODELS_ROOT}")
    print(f"[SD] Checkpoints: {CHECKPOINTS_PATH}")
    print(f"[SD] LoRAs: {LORAS_PATH}")
    print(f"[SD] Diffusers: {DIFFUSION_MODELS_PATH}")
    print(f"[SD] Original configs: {ORIGINAL_CONFIGS_PATH}")
    print(f"[SD] Output: {OUTPUT_DIR}")
    app.run(host="127.0.0.1", port=port)
