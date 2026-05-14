from flask import Flask, request, jsonify
from PIL import Image
import gc
import importlib.util
import json
import os
import random
import sys
import time
import uuid
import warnings

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
    from diffusers import (
        AutoPipelineForImage2Image,
        AutoPipelineForInpainting,
        AutoPipelineForText2Image,
        DDIMScheduler,
        DPMSolverMultistepScheduler,
        EulerAncestralDiscreteScheduler,
        EulerDiscreteScheduler,
        LMSDiscreteScheduler,
        StableDiffusionImg2ImgPipeline,
        StableDiffusionInpaintPipeline,
        StableDiffusionPipeline,
        StableDiffusionXLPipeline,
    )
except Exception:
    AutoPipelineForImage2Image = None
    AutoPipelineForInpainting = None
    AutoPipelineForText2Image = None
    DDIMScheduler = None
    DPMSolverMultistepScheduler = None
    EulerAncestralDiscreteScheduler = None
    EulerDiscreteScheduler = None
    LMSDiscreteScheduler = None
    StableDiffusionImg2ImgPipeline = None
    StableDiffusionInpaintPipeline = None
    StableDiffusionPipeline = None
    StableDiffusionXLPipeline = None


MODEL_EXTENSIONS = (".safetensors", ".ckpt")
PREVIEW_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".mp4")
SCHEDULERS = {
    "DPMSolverMultistepScheduler": DPMSolverMultistepScheduler,
    "EulerDiscreteScheduler": EulerDiscreteScheduler,
    "EulerAncestralDiscreteScheduler": EulerAncestralDiscreteScheduler,
    "DDIMScheduler": DDIMScheduler,
    "LMSDiscreteScheduler": LMSDiscreteScheduler,
}

app = Flask(__name__)

loaded = {
    "pipeline": None,
    "checkpoint": None,
    "architecture": None,
    "mode": None,
    "lora": None,
}


def cuda_available():
    return bool(torch and torch.cuda.is_available())


def get_device():
    return "cuda" if cuda_available() else "cpu"


def get_dtype():
    return torch.float16 if cuda_available() else torch.float32


def clean_cuda_cache():
    gc.collect()
    if cuda_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()


def unload_model():
    loaded["pipeline"] = None
    loaded["checkpoint"] = None
    loaded["architecture"] = None
    loaded["mode"] = None
    loaded["lora"] = None
    clean_cuda_cache()


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


def apply_scheduler(pipe, scheduler_name):
    scheduler_class = SCHEDULERS.get(str(scheduler_name or "").strip())
    if scheduler_class is None or pipe is None:
        return pipe
    pipe.scheduler = scheduler_class.from_config(pipe.scheduler.config)
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


def create_pipeline(checkpoint, architecture, mode):
    if AutoPipelineForText2Image is None:
        raise RuntimeError("Diffusers nao esta instalado no ambiente Python do worker.")

    kwargs = {
        "torch_dtype": get_dtype(),
        "local_files_only": True,
        "cache_dir": HF_HUB_CACHE,
    }

    if os.path.isdir(checkpoint):
        if mode == "txt2img":
            pipe = AutoPipelineForText2Image.from_pretrained(checkpoint, **kwargs)
        elif mode == "img2img":
            pipe = AutoPipelineForImage2Image.from_pretrained(checkpoint, **kwargs)
        else:
            pipe = AutoPipelineForInpainting.from_pretrained(checkpoint, **kwargs)
        pipe = enable_memory_optimizations(pipe)
        return pipe.to(get_device())

    kwargs["use_safetensors"] = checkpoint.lower().endswith(".safetensors")
    original_config = resolve_original_config(checkpoint, architecture, mode)
    local_diffusers_config = resolve_local_diffusers_config(architecture)
    if original_config:
        kwargs["original_config"] = original_config
    if local_diffusers_config:
        kwargs["config"] = local_diffusers_config
    if architecture == "sd15":
        kwargs["safety_checker"] = None
        kwargs["feature_extractor"] = None
        kwargs["requires_safety_checker"] = False

    if mode == "txt2img":
        if architecture == "sdxl":
            pipe = StableDiffusionXLPipeline.from_single_file(checkpoint, **kwargs)
        elif StableDiffusionPipeline is not None:
            pipe = StableDiffusionPipeline.from_single_file(checkpoint, **kwargs)
        else:
            pipe = AutoPipelineForText2Image.from_single_file(checkpoint, **kwargs)
    elif mode == "img2img":
        if StableDiffusionImg2ImgPipeline is not None and architecture == "sd15":
            pipe = StableDiffusionImg2ImgPipeline.from_single_file(checkpoint, **kwargs)
        else:
            pipe = AutoPipelineForImage2Image.from_single_file(checkpoint, **kwargs)
    else:
        if StableDiffusionInpaintPipeline is not None and architecture == "sd15":
            pipe = StableDiffusionInpaintPipeline.from_single_file(checkpoint, **kwargs)
        else:
            pipe = AutoPipelineForInpainting.from_single_file(checkpoint, **kwargs)

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


def load_pipeline(checkpoint_value, architecture_value, mode, scheduler_name=None, lora_path=None):
    checkpoint = resolve_checkpoint(checkpoint_value)
    architecture = normalize_architecture(architecture_value, checkpoint)
    lora_path = str(lora_path or "").strip() or None
    if lora_path:
        lora_path = os.path.abspath(lora_path)

    needs_reload = (
        loaded["pipeline"] is None
        or loaded["checkpoint"] != checkpoint
        or loaded["architecture"] != architecture
        or loaded["mode"] != mode
        or loaded["lora"] != lora_path
    )

    if needs_reload:
        unload_model()
        loaded["pipeline"] = create_pipeline(checkpoint, architecture, mode)
        loaded["checkpoint"] = checkpoint
        loaded["architecture"] = architecture
        loaded["mode"] = mode
        loaded["lora"] = lora_path

        if lora_path and os.path.exists(lora_path):
            loaded["pipeline"].load_lora_weights(lora_path)

    apply_scheduler(loaded["pipeline"], scheduler_name)
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


def save_output(image, metadata):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    file_name = f"sd_{int(time.time())}_{uuid.uuid4().hex[:8]}.png"
    output_path = os.path.join(OUTPUT_DIR, file_name)
    image.save(output_path)
    return {
        "file": output_path,
        "metadata": metadata,
    }


def xformers_available():
    return importlib.util.find_spec("xformers") is not None


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
    seed = get_seed(data.get("seed", -1))
    width = int(data.get("width") or 512)
    height = int(data.get("height") or 512)
    prompt = str(data.get("prompt") or data.get("positive_prompt") or "").strip()
    negative_prompt = str(data.get("negative_prompt") or data.get("negativePrompt") or "").strip()
    steps = int(data.get("steps") or data.get("sampling_steps") or 24)
    cfg_scale = float(data.get("cfg_scale") or data.get("guidance_scale") or 7)
    scheduler = str(data.get("scheduler") or data.get("schedule_type") or "DPMSolverMultistepScheduler")
    denoising_strength = float(data.get("denoising_strength") or data.get("strength") or 0.55)

    pipe, checkpoint, architecture, lora_path = load_pipeline(
        data.get("checkpoint") or data.get("model"),
        data.get("architecture") or data.get("model_type"),
        mode,
        scheduler,
        data.get("lora"),
    )
    generator = get_generator(seed)

    common = {
        "prompt": prompt,
        "negative_prompt": negative_prompt or None,
        "num_inference_steps": steps,
        "guidance_scale": cfg_scale,
        "generator": generator,
    }

    if mode == "txt2img":
        result = pipe(width=width, height=height, **common)
    elif mode == "img2img":
        init_image = load_image(data.get("image_path") or data.get("imagePath")).resize((width, height))
        result = pipe(image=init_image, strength=denoising_strength, **common)
    else:
        init_image = load_image(data.get("image_path") or data.get("imagePath")).resize((width, height))
        mask_image = load_image(data.get("mask_path") or data.get("maskPath"), "L").resize((width, height))
        result = pipe(image=init_image, mask_image=mask_image, strength=denoising_strength, **common)

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
        "sampler": scheduler,
        "scheduler": scheduler,
        "steps": steps,
        "cfg_scale": cfg_scale,
        "denoising_strength": denoising_strength if mode != "txt2img" else None,
        "architecture": architecture,
        "device": get_device(),
    }
    output = save_output(image, metadata)

    if data.get("free_vram_after", True):
        clean_cuda_cache()

    return jsonify({"status": "ok", **output})


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
            "lora": loaded["lora"],
        },
    })


@app.route("/models", methods=["GET"])
def models():
    scanned = scan_all_models()
    return jsonify({
        "status": "ok",
        **scanned,
        "schedulers": list(SCHEDULERS.keys()),
        "paths": {
            "modelsRoot": MODELS_ROOT,
            "checkpointsPath": CHECKPOINTS_PATH,
            "lorasPath": LORAS_PATH,
            "diffusionModelsPath": DIFFUSION_MODELS_PATH,
            "originalConfigsPath": ORIGINAL_CONFIGS_PATH,
            "outputPath": OUTPUT_DIR,
        },
    })


@app.route("/unload", methods=["POST"])
def unload():
    unload_model()
    return jsonify({
        "status": "ok",
        "message": "Stable Diffusion model unloaded"
    })


@app.route("/txt2img", methods=["POST"])
def txt2img():
    try:
        return generate("txt2img")
    except Exception as exc:
        print("[SD] txt2img erro:", exc)
        return jsonify({"status": "error", "error": str(exc)}), 500


@app.route("/img2img", methods=["POST"])
def img2img():
    try:
        return generate("img2img")
    except Exception as exc:
        print("[SD] img2img erro:", exc)
        return jsonify({"status": "error", "error": str(exc)}), 500


@app.route("/inpaint", methods=["POST"])
def inpaint():
    try:
        return generate("inpaint")
    except Exception as exc:
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
