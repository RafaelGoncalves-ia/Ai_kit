import asyncio
import gc
import importlib
import json
import os
import platform
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path


RUNTIME_ROOT = Path(__file__).resolve().parents[1]
LEGACY_ROOT = RUNTIME_ROOT / "legacy"
COMFY_ROOT = LEGACY_ROOT / "comfy_core"
GGUF_ROOT = LEGACY_ROOT / "gguf_nodes"
EXTRA_ROOT = LEGACY_ROOT / "extra_nodes"

MODEL_ROOT = Path(os.environ.get("VIDEO_MODEL_ROOT", r"F:\AI\models\diffusion_models"))
TEXT_ENCODER_ROOT = Path(os.environ.get("VIDEO_TEXT_ENCODER_ROOT", r"F:\AI\models\text_encoders"))
VAE_ROOT = Path(os.environ.get("VIDEO_VAE_ROOT", r"F:\AI\models\vae"))
CLIP_VISION_ROOT = Path(os.environ.get("VIDEO_CLIP_VISION_ROOT", r"F:\AI\models\clip_vision"))
LORA_ROOTS = [
    Path(os.environ.get("VIDEO_LORA_ROOT", r"F:\AI\models\loras")),
    Path(os.environ.get("VIDEO_WAN_LORA_ROOT", r"F:\AI\models\loras\Wan")),
]
COMFY_WORKFLOW_PATH = Path(os.environ.get("WAN_COMFY_WORKFLOW_PATH", "WAN2.2.json"))
SAFE_RESOLUTIONS = {(512, 512), (480, 832), (832, 480)}
EXPECTED_5S = {
    "fps": 16,
    "length": 81,
    "steps": 4,
    "cfg": 1.5,
    "sampler": "euler_ancestral",
    "scheduler": "beta",
    "shift": 8.0,
    "denoise": 0.7,
}

COMFY_PATH = [
    "Inicializa ComfyUI com cudaMallocAsync.",
    "Define VRAM state NORMAL_VRAM.",
    "Ativa async weight offloading com 2 streams.",
    "Ativa pinned memory 7347 MB.",
    "Carrega VAE em cuda:0 com offload CPU e dtype bfloat16.",
    "Carrega CLIP GGUF type wan em cuda:0 com offload CPU, current cpu e dtype float16.",
    "Recria tokenizer sentencepiece a partir do GGUF.",
    "Carrega/aplica LoRA DR34ML4Y_I2V_14B_LOW_V2 com strength 0.6.",
    "Carrega WanTEModel completamente.",
    "Carrega WAN21 parcialmente: parte em VRAM, parte offloaded para RAM.",
    "Aplica ModelSamplingSD3 shift=8.",
    "Prepara latent com width=512, height=512, length=81.",
    "Executa KSampler Efficient com 4 steps, cfg=1.5, euler_ancestral, beta, denoise=0.7.",
    "Mostra progresso real 1/4, 2/4, 3/4, 4/4.",
    "Carrega/usa WanVAE.",
    "Faz VAE decode tiled.",
    "Combina video h264-mp4 fps=16 yuv420p crf=19.",
    "Entrega video em ~11:22.",
]

KIT_PATH = [
    "Resolve paths e registrar roots internos do Comfy",
    "Load UnetLoaderGGUF",
    "Load CLIPLoaderGGUF type wan",
    "Load VAELoader",
    "Apply LoRA chain via LoraLoader",
    "Apply ModelSamplingSD3",
    "Encode positive prompt",
    "Encode negative prompt",
    "Preparar latent EmptyHunyuanVideo15Latent ou WanImageToVideo",
    "KSampler separado",
    "VAEDecodeTiled separado",
    "KitVideoOutput ffmpeg h264 mp4 yuv420p",
    "Cleanup via model_management unload_all_models/cleanup_models_gc",
]


class ComfyWanRuntimeError(RuntimeError):
    pass


class _KitComfyServer:
    def __init__(self, logger=None):
        self.client_id = None
        self.last_node_id = None
        self.sockets_metadata = {}
        self.logger = logger or (lambda _message: None)
        self.last_progress = {}
        self.sampling_started_at = None
        self.sampling_last_step_at = None

    def send_sync(self, event=None, data=None, *_args, **_kwargs):
        if event == "executing" and isinstance(data, dict):
            node = str(data.get("node") or "")
            self.last_node_id = node
            self.logger(f"[WAN][PROGRESS] node_start={node}")
            return None
        if event == "executed" and isinstance(data, dict):
            node = str(data.get("node") or "")
            self.logger(f"[WAN][PROGRESS] node_done={node}")
            return None
        if event == "progress_state" and isinstance(data, dict):
            for node, state in (data.get("nodes") or {}).items():
                value = int(float(state.get("value") or 0))
                maximum = int(float(state.get("max") or 0))
                key = (str(node), value, maximum, state.get("state"))
                if self.last_progress.get(str(node)) == key:
                    continue
                self.last_progress[str(node)] = key
                if maximum > 0:
                    self.logger(f"[WAN][PROGRESS] sample_step {value}/{maximum} node={node} state={state.get('state')}")
                    if value > 0:
                        now = time.perf_counter()
                        if self.sampling_started_at is None:
                            self.sampling_started_at = now
                            self.sampling_last_step_at = now
                        step_seconds = now - (self.sampling_last_step_at or now)
                        elapsed = now - self.sampling_started_at
                        self.sampling_last_step_at = now
                        self.logger(
                            f"[WAN][SAMPLING] step={value}/{maximum} "
                            f"elapsed={_fmt_seconds(elapsed)} step_seconds={_fmt_seconds(step_seconds)}"
                        )
        return None


class KitVideoOutput:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "fps": ("INT", {"default": 16, "min": 1, "max": 120}),
                "output_path": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "KIT/video"

    def save(self, images, fps, output_path):
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        frame_dir = output.with_suffix("")
        frame_dir.mkdir(parents=True, exist_ok=True)

        from PIL import Image

        tensor = images.detach().cpu().clamp(0, 1)
        try:
            for index, frame in enumerate(tensor, start=1):
                array = (frame.numpy() * 255.0).round().astype("uint8")
                Image.fromarray(array).save(frame_dir / f"frame_{index:05d}.png")
        finally:
            del tensor

        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-framerate",
                str(int(fps)),
                "-i",
                str(frame_dir / "frame_%05d.png"),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-crf",
                "19",
                str(output),
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return {"ui": {"gifs": [{"filename": output.name, "fullpath": str(output), "frame_rate": fps}]}}


def _assert_runtime_files():
    required = [
        COMFY_ROOT / "folder_paths.py",
        COMFY_ROOT / "nodes.py",
        COMFY_ROOT / "execution.py",
        GGUF_ROOT / "nodes.py",
    ]
    missing = [str(item) for item in required if not item.exists()]
    if missing:
        raise ComfyWanRuntimeError(
            "WAN_LEGACY_RUNTIME_INCOMPLETE: runtime interno nao contem os componentes ComfyUI/GGUF necessarios: "
            + "; ".join(missing)
        )


def _insert_internal_paths():
    _assert_runtime_files()
    for item in (COMFY_ROOT,):
        item_str = str(item)
        if item.exists() and item_str not in sys.path:
            sys.path.insert(0, item_str)


def _assert_internal_module(module, expected_root, label):
    module_file_value = getattr(module, "__file__", "") or ""
    if not module_file_value and getattr(module, "__path__", None):
        module_file_value = next(iter(module.__path__), "")
    module_file = Path(module_file_value or "").resolve()
    expected = Path(expected_root).resolve()
    try:
        module_file.relative_to(expected)
    except ValueError as exc:
        raise ComfyWanRuntimeError(
            f"WAN_EXTERNAL_MODULE_DETECTED: {label} veio de {module_file}, esperado dentro de {expected}"
        ) from exc


def _import_comfy_core_nodes():
    existing = sys.modules.get("nodes")
    if existing is not None:
        try:
            _assert_internal_module(existing, COMFY_ROOT, "nodes")
            return existing
        except ComfyWanRuntimeError:
            del sys.modules["nodes"]

    nodes_module = importlib.import_module("nodes")
    _assert_internal_module(nodes_module, COMFY_ROOT, "nodes")
    return nodes_module


def _import_vendor_gguf_nodes(comfy_nodes):
    sys.modules["nodes"] = comfy_nodes
    gguf_module = importlib.import_module("backend.runtimes.wan.legacy.gguf_nodes.nodes")
    _assert_internal_module(gguf_module, GGUF_ROOT, "gguf_nodes.nodes")
    sys.modules["nodes"] = gguf_module
    return gguf_module


def _register_model_roots(folder_paths):
    pairs = [
        ("diffusion_models", MODEL_ROOT),
        ("unet", MODEL_ROOT),
        ("text_encoders", TEXT_ENCODER_ROOT),
        ("clip", TEXT_ENCODER_ROOT),
        ("vae", VAE_ROOT),
        ("clip_vision", CLIP_VISION_ROOT),
    ]
    for key, root in pairs:
        if root.exists():
            folder_paths.add_model_folder_path(key, str(root))
    for root in LORA_ROOTS:
        if root.exists():
            folder_paths.add_model_folder_path("loras", str(root))


def _relative_to_any(path, roots):
    path = Path(path).resolve()
    for root in roots:
        try:
            return str(path.relative_to(Path(root).resolve()))
        except ValueError:
            continue
    return path.name


def _find_first(root, names):
    for name in names:
        if not name:
            continue
        path = Path(name)
        candidate = path if path.is_absolute() else Path(root) / name
        if candidate.exists():
            return candidate
    return None


def _bool_env(name, default=False):
    value = str(os.environ.get(name, "true" if default else "")).strip().lower()
    return value in {"1", "true", "yes", "on"}


def _fmt_ms(value):
    return str(int(round(float(value or 0) * 1000)))


def _fmt_seconds(value):
    try:
        return f"{float(value):.2f}"
    except Exception:
        return "0.00"


def _unknown(value="UNKNOWN"):
    return value


def _env_snapshot():
    snapshot = {
        "python_version": platform.python_version(),
        "torch_version": "UNKNOWN",
        "cuda_version": "UNKNOWN",
        "cuda_allocator": os.environ.get("PYTORCH_CUDA_ALLOC_CONF", "UNKNOWN"),
        "device": "cpu",
        "total_vram_mb": 0,
        "total_ram_mb": 0,
    }
    try:
        import psutil

        snapshot["total_ram_mb"] = int(psutil.virtual_memory().total / 1024 / 1024)
    except Exception:
        pass
    try:
        import torch

        snapshot["torch_version"] = str(getattr(torch, "__version__", "UNKNOWN"))
        snapshot["cuda_version"] = str(getattr(torch.version, "cuda", "UNKNOWN"))
        if torch.cuda.is_available():
            free, total = torch.cuda.mem_get_info()
            snapshot["device"] = f"cuda:0 {torch.cuda.get_device_name(0)}"
            snapshot["total_vram_mb"] = int(total / 1024 / 1024)
    except Exception:
        pass
    return snapshot


def _memory_strategy_snapshot():
    strategy = {
        "vram_state": "UNKNOWN",
        "async_weight_offloading_enabled": "UNKNOWN",
        "async_weight_offloading_streams": "UNKNOWN",
        "pinned_memory_mb": "UNKNOWN",
        "attention_backend": "pytorch attention",
        "allocator": os.environ.get("PYTORCH_CUDA_ALLOC_CONF", "UNKNOWN"),
    }
    try:
        import comfy.model_management as model_management

        strategy["vram_state"] = str(getattr(model_management, "vram_state", "UNKNOWN")).split(".")[-1]
        streams = getattr(model_management, "NUM_STREAMS", "UNKNOWN")
        strategy["async_weight_offloading_streams"] = streams
        strategy["async_weight_offloading_enabled"] = bool(int(streams)) if str(streams).isdigit() else "UNKNOWN"
        pinned = getattr(model_management, "PINNED_MEMORY_SIZE", None)
        if pinned is None:
            pinned = getattr(model_management, "pinned_memory_size", None)
        if pinned is not None:
            strategy["pinned_memory_mb"] = int(float(pinned) / 1024 / 1024) if float(pinned) > 1024 * 1024 else int(float(pinned))
    except Exception:
        pass
    return strategy


def _log_required_env_blocks(params, logger):
    env = _env_snapshot()
    strategy = _memory_strategy_snapshot()
    loras = [_lora_label(item) for item in params.get("loras") or []]
    first_lora = loras[0] if loras else {}

    logger("[WAN][ENV]")
    logger(
        "[WAN][ENV] "
        f"python={env['python_version']} torch={env['torch_version']} cuda={env['cuda_version']} "
        f"allocator={env['cuda_allocator']} device={env['device']} "
        f"vram_total={env['total_vram_mb']} ram_total={env['total_ram_mb']}"
    )
    logger("[WAN][CONFIG_EFFECTIVE]")
    logger(
        "[WAN][CONFIG_EFFECTIVE] "
        f"unet={Path(params.get('model') or '').name} "
        f"clip={Path(params.get('text_encoder') or '').name} clip_type=wan "
        f"vae={Path(params.get('vae') or '').name} "
        f"lora={first_lora.get('path', '')} "
        f"lora_model_strength={first_lora.get('strength_model', '')} "
        f"lora_clip_strength={first_lora.get('strength_clip', '')} "
        f"shift={params.get('shift')} width={params.get('width')} height={params.get('height')} "
        f"fps={params.get('fps')} seconds={params.get('seconds')} length={params.get('length')} "
        f"steps={params.get('steps')} cfg={params.get('cfg')} sampler={params.get('sampler')} "
        f"scheduler={params.get('scheduler')} denoise={params.get('denoise')} "
        "vae_decode=VAEDecodeTiled format=h264-mp4 pix_fmt=yuv420p crf=19"
    )
    logger("[WAN][MEMORY_STRATEGY]")
    logger(
        "[WAN][MEMORY_STRATEGY] "
        f"vram_state={strategy['vram_state']} "
        f"async_weight_offloading={strategy['async_weight_offloading_enabled']} "
        f"offload_streams={strategy['async_weight_offloading_streams']} "
        f"pinned_memory_mb={strategy['pinned_memory_mb']} "
        f"attention_backend={strategy['attention_backend']} allocator={strategy['allocator']}"
    )
    logger(
        "[WAN][LOAD] "
        "component=VAE load_device=UNKNOWN offload_device=UNKNOWN dtype=UNKNOWN "
        f"loaded_mb={_file_size_mb(params.get('vae'))}"
    )
    logger(
        "[WAN][LOAD] "
        "component=CLIP load_device=UNKNOWN offload_device=UNKNOWN current=UNKNOWN dtype=UNKNOWN "
        f"loaded_mb={_file_size_mb(params.get('text_encoder'))}"
    )
    logger("[WAN][LOAD] component=WanTEModel load_mode=UNKNOWN loaded_mb=UNKNOWN")
    logger("[WAN][LOAD] component=WAN21 load_mode=UNKNOWN loaded_mb=UNKNOWN offloaded_mb=UNKNOWN buffer_reserved_mb=UNKNOWN")


def _file_size_mb(path):
    try:
        if path and Path(path).exists():
            return f"{Path(path).stat().st_size / 1024 / 1024:.2f}"
    except Exception:
        pass
    return "UNKNOWN"


def _payload_params(payload, model_path=None, text_encoder_path=None, vae_path=None):
    fps = int(payload.get("fps") or 16)
    seconds = int(payload.get("duration") or payload.get("seconds") or 5)
    length = int(payload.get("sequenceLength") or payload.get("length") or payload.get("frames") or (seconds * fps + 1))
    return {
        "model": str(model_path or payload.get("modelPath") or payload.get("model") or ""),
        "text_encoder": str(text_encoder_path or ""),
        "vae": str(vae_path or ""),
        "loras": payload.get("conditioning", {}).get("loras") or payload.get("loras") or [],
        "width": int(payload.get("width") or 512),
        "height": int(payload.get("height") or 512),
        "fps": fps,
        "seconds": seconds,
        "length": length,
        "steps": int(payload.get("steps") or 4),
        "cfg": float(payload.get("cfg") or payload.get("cfgScale") or 1.5),
        "sampler": payload.get("sampler") or "euler_ancestral",
        "scheduler": payload.get("scheduler") or "beta",
        "shift": float(payload.get("shift") or payload.get("modelShift") or 8),
        "denoise": float(payload.get("denoise") or 0.7),
        "seed": int(payload.get("seed") if payload.get("seed") is not None else -1),
        "mode": "i2v" if payload.get("mode") == "i2v" else "t2v",
    }


def _lora_label(item):
    if isinstance(item, dict):
        return {
            "path": item.get("path") or "",
            "strength_model": float(item.get("strength_model", item.get("strengthModel", item.get("weight", 1))) or 1),
            "strength_clip": float(item.get("strength_clip", item.get("strengthClip", item.get("weight", 1))) or 1),
        }
    return {"path": str(item or ""), "strength_model": 1.0, "strength_clip": 1.0}


def _log_params(params, logger):
    logger("[WAN][PARAMS]")
    for key in [
        "model",
        "text_encoder",
        "vae",
        "width",
        "height",
        "fps",
        "seconds",
        "length",
        "steps",
        "cfg",
        "sampler",
        "scheduler",
        "shift",
        "denoise",
        "seed",
        "mode",
    ]:
        logger(f"[WAN][PARAMS] {key}={params.get(key)}")
    loras = [_lora_label(item) for item in params.get("loras") or []]
    logger(f"[WAN][PARAMS] loras={json.dumps(loras, ensure_ascii=False)}")


def _walk_json(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_json(child)


def _extract_comfy_baseline(logger):
    workflow_path = COMFY_WORKFLOW_PATH
    if not workflow_path.is_absolute():
        workflow_path = Path.cwd() / workflow_path
    baseline = {}
    try:
        data = json.loads(workflow_path.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        logger(f"[WAN][COMFY_PARITY] workflow_reference_unavailable path={workflow_path} error={exc}")
        return baseline

    for node in _walk_json(data):
        node_type = node.get("type") or node.get("class_type")
        if not isinstance(node_type, str):
            continue
        values = node.get("widgets_values") if isinstance(node.get("widgets_values"), list) else []
        inputs = node.get("inputs") if isinstance(node.get("inputs"), dict) else {}
        if node_type == "ModelSamplingSD3" and values:
            baseline["shift"] = float(values[0])
        if node_type == "KSampler":
            source = inputs or {}
            if not source and values:
                # Comfy frontend KSampler order is seed, control_after_generate, steps, cfg, sampler, scheduler, denoise.
                if len(values) >= 7:
                    baseline.update({
                        "seed": values[0],
                        "steps": int(values[2]),
                        "cfg": float(values[3]),
                        "sampler": values[4],
                        "scheduler": values[5],
                        "denoise": float(values[6]),
                    })
            else:
                for key, alias in (("steps", "steps"), ("cfg", "cfg"), ("sampler_name", "sampler"), ("scheduler", "scheduler"), ("denoise", "denoise")):
                    if key in source:
                        baseline[alias] = source[key]
        if node_type in {"WanImageToVideo", "EmptyHunyuanVideo15Latent"}:
            source = inputs or {}
            for key in ("width", "height", "length"):
                if key in source and not isinstance(source[key], list):
                    baseline[key] = int(source[key])
            if len(values) >= 3:
                baseline.setdefault("width", int(values[0]))
                baseline.setdefault("height", int(values[1]))
                baseline.setdefault("length", int(values[2]))
        if node_type == "VHS_VideoCombine" and values:
            for item in values:
                if isinstance(item, (int, float)) and item == 16:
                    baseline.setdefault("fps", 16)
    baseline.setdefault("fps", 16)
    baseline.setdefault("steps", 4)
    baseline.setdefault("cfg", 1.5)
    baseline.setdefault("sampler", "euler_ancestral")
    baseline.setdefault("scheduler", "beta")
    baseline.setdefault("shift", 8.0)
    baseline.setdefault("denoise", 0.7)
    baseline.setdefault("length", 81)
    return baseline


def _extract_comfy_reference(logger):
    workflow_path = COMFY_WORKFLOW_PATH
    if not workflow_path.is_absolute():
        workflow_path = Path.cwd() / workflow_path
    reference = {
        "python_version": "3.10.6",
        "torch_version": "2.5.1+cu121",
        "cuda_version": "12.1",
        "cuda_allocator": "cudaMallocAsync",
        "vram_state": "NORMAL_VRAM",
        "device": "cuda:0 NVIDIA RTX 3060 12GB",
        "total_vram_mb": "12288",
        "total_ram_mb": "UNKNOWN",
        "async_weight_offloading_enabled": "enabled",
        "async_weight_offloading_streams": 2,
        "pinned_memory_mb": 7347,
        "attention_backend": "pytorch attention",
        "unet_model": "wan2.2-t2v-rapid-aio-v10-nsfw-Q4_K.gguf",
        "clip_model": "umt5-xxl-encoder-Q3_K_S.gguf",
        "clip_type": "wan",
        "vae_model": "wan_2.1_vae.safetensors",
        "lora_model": "wan\\DR34ML4Y_I2V_14B_LOW_V2.safetensors",
        "lora_strength_model": 0.6,
        "lora_strength_clip": 0.6,
        "model_sampling_shift": 8.0,
        "width": 512,
        "height": 512,
        "fps": 16,
        "seconds": 5,
        "length": 81,
        "output_frames": 80,
        "sampler_node": "KSampler (Efficient)",
        "steps": 4,
        "cfg": 1.5,
        "sampler": "euler_ancestral",
        "scheduler": "beta",
        "denoise": 0.7,
        "vae_decode_mode": "true tiled",
        "video_format": "h264-mp4",
        "pix_fmt": "yuv420p",
        "crf": 19,
        "vae_load_device": "cuda:0",
        "vae_offload_device": "cpu",
        "vae_dtype": "torch.bfloat16",
        "clip_load_device": "cuda:0",
        "clip_offload_device": "cpu",
        "clip_current_device": "cpu",
        "clip_dtype": "torch.float16",
        "text_encoder_full_load": "WanTEModel 3901.45 MB",
        "wan_model_load_mode": "partial",
        "wan_loaded_mb": 6572.92,
        "wan_offloaded_mb": 2762.71,
        "wan_buffer_reserved_mb": 96.28,
        "lowvram_patches": 0,
        "sampling_step_count": 4,
        "sampling_total_seconds": 431,
        "sampling_seconds_per_step": 107.89,
        "total_generation_seconds": 682,
        "vae_decode": "true tiled",
        "video_encode": "h264-mp4/yuv420p/crf19",
        "offload_strategy": "ComfyUI GGUF/offload",
        "cleanup_strategy": "VRAM/RAM cleanup nodes",
    }
    try:
        data = json.loads(workflow_path.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        logger(f"[WAN][PARITY_AUDIT] workflow_reference_unavailable path={workflow_path} error={exc}")
        return reference

    for node in _walk_json(data):
        node_type = node.get("type") or node.get("class_type")
        if not isinstance(node_type, str):
            continue
        values = node.get("widgets_values")
        inputs = node.get("inputs") if isinstance(node.get("inputs"), dict) else {}
        if node_type == "UnetLoaderGGUF" and isinstance(values, list) and values:
            reference["unet_model"] = values[0]
        elif node_type == "CLIPLoaderGGUF" and isinstance(values, list):
            if len(values) > 0:
                reference["clip_model"] = values[0]
            if len(values) > 1:
                reference["clip_type"] = values[1]
        elif node_type == "VAELoader" and isinstance(values, list) and values:
            reference["vae_model"] = values[0]
        elif node_type == "ModelSamplingSD3" and isinstance(values, list) and values:
            reference["model_sampling_shift"] = float(values[0])
        elif "KSampler" in node_type and isinstance(values, list) and len(values) >= 9:
            reference["sampler_node"] = node_type
            reference["steps"] = int(values[2])
            reference["cfg"] = float(values[3])
            reference["sampler"] = values[4]
            reference["scheduler"] = values[5]
            reference["denoise"] = float(values[6])
            reference["vae_decode_mode"] = values[8]
            reference["vae_decode"] = values[8]
        elif node_type == "easy loraStack" and isinstance(values, list) and len(values) >= 6:
            reference["lora_model"] = values[3]
            reference["lora_strength_model"] = float(values[4])
            reference["lora_strength_clip"] = float(values[4])
        elif node_type in {"WanImageToVideo", "EmptyHunyuanVideo15Latent"} and isinstance(values, list) and len(values) >= 3:
            reference["length"] = int(values[2])
        elif node_type == "INTConstant" and node.get("title") == "Width (INT Constant)" and isinstance(values, list) and values:
            reference["width"] = int(values[0])
        elif node_type == "INTConstant" and node.get("title") == "Height (INT Constant)" and isinstance(values, list) and values:
            reference["height"] = int(values[0])
        elif node_type == "PrimitiveInt" and node.get("title") == "Seconds" and isinstance(values, list) and values:
            reference["seconds"] = int(values[0])
        elif node_type == "INTConstant" and node.get("title") == "Frames (INT Constant)" and isinstance(values, list) and values:
            reference["fps"] = int(values[0])
        elif node_type == "VHS_SelectEveryNthImage" and isinstance(values, dict):
            reference["output_frames"] = int(values.get("skip_first_images") or reference["length"] - 1)
        elif node_type == "VHS_VideoCombine" and isinstance(values, dict):
            reference["fps"] = int(values.get("frame_rate") or reference["fps"])
            fmt = str(values.get("format") or "video/h264-mp4").replace("video/", "")
            reference["video_format"] = fmt
            reference["pix_fmt"] = values.get("pix_fmt") or "yuv420p"
            reference["crf"] = values.get("crf") or 19
            reference["video_encode"] = f"{fmt}/{values.get('pix_fmt') or 'yuv420p'}/crf{values.get('crf') or 19}"
        for key, alias in (
            ("width", "width"),
            ("height", "height"),
            ("length", "length"),
            ("steps", "steps"),
            ("cfg", "cfg"),
            ("sampler_name", "sampler"),
            ("scheduler", "scheduler"),
            ("denoise", "denoise"),
        ):
            if key in inputs and not isinstance(inputs[key], list):
                reference[alias] = inputs[key]
    return reference


def _normalize_compare(value):
    if isinstance(value, Path):
        value = str(value)
    text = str(value or "").replace("/", "\\").strip().lower()
    if "\\" in text:
        text = text.split("\\")[-1]
    return text


def _same_value(comfy_value, kit_value, field):
    if field == "vae_decode_mode":
        comfy_text = _normalize_compare(comfy_value)
        kit_text = _normalize_compare(kit_value)
        return ("tiled" in comfy_text and "tiled" in kit_text) or comfy_text == kit_text
    if field in {"shift", "model_sampling_shift", "lora_strength", "lora_strength_model", "lora_strength_clip", "cfg", "denoise", "wan_loaded_mb", "wan_offloaded_mb", "wan_buffer_reserved_mb", "sampling_total_seconds", "sampling_seconds_per_step", "total_generation_seconds"}:
        try:
            return abs(float(comfy_value) - float(kit_value)) < 0.0001
        except Exception:
            return False
    if field in {"width", "height", "fps", "seconds", "length", "output_frames", "steps", "crf", "sampling_step_count", "lowvram_patches", "total_vram_mb", "total_ram_mb", "pinned_memory_mb", "async_weight_offloading_streams"}:
        try:
            return int(comfy_value) == int(kit_value)
        except Exception:
            return False
    return _normalize_compare(comfy_value) == _normalize_compare(kit_value)


def _kit_audit_values(params):
    loras = [_lora_label(item) for item in params.get("loras") or []]
    first_lora = loras[0] if loras else {}
    lora_path = first_lora.get("path") or ""
    env = _env_snapshot()
    strategy = _memory_strategy_snapshot()
    return {
        "python_version": env["python_version"],
        "torch_version": env["torch_version"],
        "cuda_version": env["cuda_version"],
        "cuda_allocator": env["cuda_allocator"],
        "vram_state": strategy["vram_state"],
        "device": env["device"],
        "total_vram_mb": env["total_vram_mb"],
        "total_ram_mb": env["total_ram_mb"],
        "async_weight_offloading_enabled": strategy["async_weight_offloading_enabled"],
        "async_weight_offloading_streams": strategy["async_weight_offloading_streams"],
        "pinned_memory_mb": strategy["pinned_memory_mb"],
        "attention_backend": strategy["attention_backend"],
        "unet_model": Path(params.get("model") or "").name,
        "clip_model": Path(params.get("text_encoder") or "").name,
        "clip_type": "wan",
        "vae_model": Path(params.get("vae") or "").name,
        "lora_model": lora_path,
        "lora_strength_model": first_lora.get("strength_model", 0) if first_lora else "",
        "lora_strength_clip": first_lora.get("strength_clip", 0) if first_lora else "",
        "model_sampling_shift": params.get("shift"),
        "width": params.get("width"),
        "height": params.get("height"),
        "fps": params.get("fps"),
        "seconds": params.get("seconds"),
        "length": params.get("length"),
        "output_frames": max(0, int(params.get("length") or 0) - 1),
        "sampler_node": "KSampler",
        "steps": params.get("steps"),
        "cfg": params.get("cfg"),
        "sampler": params.get("sampler"),
        "scheduler": params.get("scheduler"),
        "denoise": params.get("denoise"),
        "vae_decode_mode": "VAEDecodeTiled",
        "video_format": "h264-mp4",
        "pix_fmt": "yuv420p",
        "crf": 19,
        "vae_load_device": "UNKNOWN",
        "vae_offload_device": "UNKNOWN",
        "vae_dtype": "UNKNOWN",
        "clip_load_device": "UNKNOWN",
        "clip_offload_device": "UNKNOWN",
        "clip_current_device": "UNKNOWN",
        "clip_dtype": "UNKNOWN",
        "text_encoder_full_load": "UNKNOWN",
        "wan_model_load_mode": "UNKNOWN",
        "wan_loaded_mb": "UNKNOWN",
        "wan_offloaded_mb": "UNKNOWN",
        "wan_buffer_reserved_mb": "UNKNOWN",
        "lowvram_patches": "UNKNOWN",
        "sampling_step_count": params.get("steps"),
        "sampling_total_seconds": "UNKNOWN",
        "sampling_seconds_per_step": "UNKNOWN",
        "total_generation_seconds": "UNKNOWN",
        "vae_decode": "VAEDecodeTiled",
        "video_encode": "h264-mp4/yuv420p/crf19",
        "offload_strategy": f"KIT {os.environ.get('KIT_WAN_VRAM_MODE', 'normalvram')} reserved={os.environ.get('WAN_VRAM_SAFETY_MARGIN_MB', '500')}MB",
        "cleanup_strategy": "model_management unload_all_models/cleanup_models_gc",
    }


def run_wan_parity_audit(payload, logger):
    model_path = Path(payload.get("modelPath") or "")
    text_encoder_path = _find_first(
        TEXT_ENCODER_ROOT,
        [
            os.environ.get("VIDEO_WAN_TEXT_ENCODER_PATH", ""),
            os.environ.get("VIDEO_WAN_TEXT_ENCODER_FILE", "umt5-xxl-encoder-Q3_K_S.gguf"),
            "umt5-xxl-encoder-Q4_K_M.gguf",
            "umt5-xxl-encoder-Q3_K_S.gguf",
        ],
    )
    vae_path = _find_first(
        VAE_ROOT,
        [
            os.environ.get("VIDEO_WAN_VAE_PATH", ""),
            os.environ.get("VIDEO_WAN_VAE_FILE", "wan_2.1_vae.safetensors"),
            "wan_2.1_vae.safetensors",
        ],
    )
    params = _payload_params(payload, model_path, text_encoder_path, vae_path)
    _log_required_env_blocks(params, logger)
    comfy = _extract_comfy_reference(logger)
    kit = _kit_audit_values(params)
    fields = [
        ("python_version", "alto"),
        ("torch_version", "alto"),
        ("cuda_version", "alto"),
        ("cuda_allocator", "alto"),
        ("vram_state", "alto"),
        ("device", "alto"),
        ("total_vram_mb", "medio"),
        ("total_ram_mb", "medio"),
        ("async_weight_offloading_enabled", "alto"),
        ("async_weight_offloading_streams", "alto"),
        ("pinned_memory_mb", "alto"),
        ("attention_backend", "alto"),
        ("unet_model", "alto"),
        ("clip_model", "alto"),
        ("clip_type", "alto"),
        ("vae_model", "alto"),
        ("lora_model", "medio"),
        ("lora_strength_model", "medio"),
        ("lora_strength_clip", "medio"),
        ("model_sampling_shift", "alto"),
        ("width", "alto"),
        ("height", "alto"),
        ("fps", "medio"),
        ("seconds", "medio"),
        ("length", "alto"),
        ("output_frames", "alto"),
        ("steps", "alto"),
        ("cfg", "alto"),
        ("sampler", "alto"),
        ("scheduler", "alto"),
        ("denoise", "alto"),
        ("vae_decode_mode", "medio"),
        ("video_format", "baixo"),
        ("pix_fmt", "baixo"),
        ("crf", "baixo"),
        ("vae_load_device", "alto"),
        ("vae_offload_device", "alto"),
        ("vae_dtype", "alto"),
        ("clip_load_device", "alto"),
        ("clip_offload_device", "alto"),
        ("clip_current_device", "alto"),
        ("clip_dtype", "alto"),
        ("text_encoder_full_load", "alto"),
        ("wan_model_load_mode", "alto"),
        ("wan_loaded_mb", "alto"),
        ("wan_offloaded_mb", "alto"),
        ("wan_buffer_reserved_mb", "alto"),
        ("lowvram_patches", "alto"),
        ("sampling_step_count", "alto"),
        ("sampling_total_seconds", "alto"),
        ("sampling_seconds_per_step", "alto"),
        ("total_generation_seconds", "alto"),
        ("offload_strategy", "alto"),
        ("cleanup_strategy", "medio"),
        ("sampler_node", "alto"),
    ]
    logger("[WAN][PARITY_AUDIT]")
    logger("[WAN][PARITY_AUDIT] CAMPO | COMFYUI | KIT | STATUS | IMPACTO")
    diffs = []
    missing = []
    unknown = []
    for field, impact in fields:
        comfy_value = comfy.get(field, "")
        kit_value = kit.get(field, "")
        if kit_value == "" or kit_value is None:
            status = "MISSING"
            missing.append(field)
        elif str(kit_value).upper() == "UNKNOWN" or str(comfy_value).upper() == "UNKNOWN":
            status = "UNKNOWN"
            unknown.append(field)
        else:
            status = "OK" if _same_value(comfy_value, kit_value, field) else "DIFF"
        if status == "DIFF":
            diffs.append(field)
        logger(f"[WAN][PARITY_AUDIT] campo={field} comfy={comfy_value} kit={kit_value} status={status} impact={impact}")

    logger("[WAN][COMFY_PATH_REAL]")
    for index, step in enumerate(COMFY_PATH, start=1):
        logger(f"[WAN][COMFY_PATH_REAL] {index}. {step}")
    logger("[WAN][KIT_PATH_REAL]")
    for index, step in enumerate(KIT_PATH, start=1):
        logger(f"[WAN][KIT_PATH_REAL] {index}. {step}")

    missing_in_kit = [
        "KSampler Efficient integrado" if kit.get("sampler_node") != comfy.get("sampler_node") else "",
        "VAE decode true tiled equivalente" if not _same_value(comfy.get("vae_decode_mode"), kit.get("vae_decode_mode"), "vae_decode_mode") else "",
        "VHS_SelectEveryNthImage skip_first_images=80" if not _same_value(comfy.get("output_frames"), kit.get("output_frames"), "output_frames") else "",
        "VHS_VideoCombine CRF 19 explicito" if not _same_value(comfy.get("video_encode"), kit.get("video_encode"), "video_encode") else "",
        "Metrica real de async weight offloading" if "async_weight_offloading_enabled" in unknown + missing else "",
        "Metrica real de pinned memory" if "pinned_memory_mb" in unknown + missing else "",
        "Metrica real de partial load/offload do WAN21" if "wan_model_load_mode" in unknown + missing else "",
        "Metrica real de dtype/device de VAE e CLIP" if any(field in unknown + missing for field in ["vae_dtype", "clip_dtype", "vae_load_device", "clip_load_device"]) else "",
    ]
    extra_in_kit = [
        "Execucao em fases separadas: load, sample, decode, encode",
        "KitVideoOutput salva PNGs intermediarios e chama ffmpeg",
        "Cache PromptExecutor lru=0 ram=0",
    ]
    different_in_kit = [field for field in diffs if field not in missing and field not in unknown]
    logger("[WAN][MISSING_IN_KIT]")
    for item in [entry for entry in missing_in_kit if entry]:
        logger(f"[WAN][MISSING_IN_KIT] {item}")
    logger("[WAN][EXTRA_IN_KIT]")
    for item in extra_in_kit:
        logger(f"[WAN][EXTRA_IN_KIT] {item}")
    logger("[WAN][DIFFERENT_IN_KIT]")
    for field in different_in_kit:
        logger(f"[WAN][DIFFERENT_IN_KIT] {field}: comfy={comfy.get(field, '')} kit={kit.get(field, '')}")

    logger("[WAN][ROOT_CAUSE_CANDIDATES]")
    candidates = []
    if "async_weight_offloading_enabled" in diffs + unknown + missing:
        candidates.append("KIT nao prova async weight offloading com 2 streams como no ComfyUI.")
    if "pinned_memory_mb" in diffs + unknown + missing:
        candidates.append("KIT nao prova pinned memory equivalente aos 7347 MB observados no ComfyUI.")
    if "cuda_allocator" in diffs + unknown + missing:
        candidates.append("KIT nao prova cudaMallocAsync; allocator diferente pode piorar fragmentacao e offload.")
    if "wan_model_load_mode" in diffs + unknown + missing:
        candidates.append("KIT nao mede partial load/offload do WAN21, entao pode estar carregando ou paginando de forma diferente.")
    if "sampler" in diffs or "scheduler" in diffs or "sampler_node" in diffs:
        candidates.append("Sampler/scheduler/no de sampling diverge do workflow Rapid GGUF.")
    if "lora_model" in diffs or "lora_strength_model" in diffs or "lora_strength_clip" in diffs:
        candidates.append("LoRA efetiva da KIT diverge do workflow; isso muda modelo aplicado e pode alterar custo/caminho.")
    if "length" in diffs or "width" in diffs or "height" in diffs or "steps" in diffs:
        candidates.append("Parametros principais de amostragem/resolucao/frames divergem do workflow WAN2.2.json.")
    if "vae_decode_mode" in diffs:
        candidates.append("KIT nao demonstra VAE tiled decode equivalente ao workflow ComfyUI.")
    if "model_sampling_shift" in diffs:
        candidates.append("KIT nao aplica ModelSamplingSD3 shift=8 equivalente.")
    if not candidates:
        candidates.append("Paridade basica parece OK; gargalo deve ser investigado pelos tempos por fase e telemetria de offload durante sampling.")
    candidates.append("Se os campos criticos ficarem OK e a lentidao persistir, investigar tempo por fase e offload/paginacao durante sample.")
    for index, item in enumerate(candidates, start=1):
        logger(f"[WAN][ROOT_CAUSE_CANDIDATES] {index}. {item}")
    return {"ok": not diffs and not missing and not unknown, "diffs": diffs, "missing": missing, "unknown": unknown, "params": params}


def _log_guardrails_and_parity(params, logger):
    def close_enough(actual, expected):
        try:
            return abs(float(actual) - float(expected)) < 0.0001
        except Exception:
            return str(actual) == str(expected)

    expected_length = int(params["seconds"]) * int(params["fps"]) + 1
    if int(params["length"]) != expected_length:
        logger(f"[WAN][WARN] length_calculado_errado actual={params['length']} expected={expected_length}")
    for key, expected in {
        "steps": 4,
        "sampler": "euler_ancestral",
        "scheduler": "beta",
        "shift": 8.0,
        "cfg": 1.5,
        "denoise": 0.7,
    }.items():
        if not close_enough(params.get(key), expected):
            logger(f"[WAN][WARN] parametro_diverge_do_workflow {key} actual={params.get(key)} expected={expected}")
    if (int(params["width"]), int(params["height"])) not in SAFE_RESOLUTIONS:
        logger(
            f"[WAN][WARN] resolucao_fora_das_seguras width={params['width']} height={params['height']} "
            "expected=512x512|480x832|832x480; verificar se veio do Canvas bruto."
        )
    if params.get("text_encoder") and "umt5-xxl-encoder" not in Path(params["text_encoder"]).name.lower():
        logger(f"[WAN][WARN] text_encoder_diferente_do_esperado path={params['text_encoder']}")
    if params.get("vae") and Path(params["vae"]).name.lower() != "wan_2.1_vae.safetensors":
        logger(f"[WAN][WARN] vae_diferente_do_esperado path={params['vae']}")
    if len(params.get("loras") or []) > 3:
        logger(f"[WAN][WARN] lora_limit_exceeded count={len(params.get('loras') or [])}; KIT deve usar ate 3.")
    if int(params["seconds"]) == 5:
        for key, expected in EXPECTED_5S.items():
            actual = params["length"] if key == "length" else params.get(key)
            if not close_enough(actual, expected):
                logger(f"[WAN][WARN] preset_5s_divergente {key} actual={actual} expected={expected}")
    if not params.get("loras"):
        logger("[WAN][WARN] LoRA nao aplicada: payload sem LoRA ativa.")

    if not _bool_env("WAN_COMPARE_COMFY_PARAMS", False):
        return
    baseline = _extract_comfy_baseline(logger)
    logger("[WAN][COMFY_PARITY]")
    if not baseline:
        return
    for key in ["width", "height", "fps", "length", "steps", "cfg", "sampler", "scheduler", "shift", "denoise"]:
        actual = params.get(key)
        expected = baseline.get(key)
        status = "ok" if str(actual) == str(expected) or (
            isinstance(actual, (int, float)) and isinstance(expected, (int, float)) and abs(float(actual) - float(expected)) < 0.0001
        ) else "diff"
        logger(f"[WAN][COMFY_PARITY] {key} kit={actual} comfy={expected} status={status}")


def _phase_done(timings, name, started, logger):
    elapsed = time.perf_counter() - started
    timings[name] = timings.get(name, 0.0) + elapsed
    logger(f"[WAN][PHASE_DONE] {name} ms={_fmt_ms(elapsed)}")
    phase_name = {
        "load_ms": "load_models",
        "encode_prompt_ms": "encode_prompt",
        "prepare_latent_ms": "prepare_latent",
        "sample_ms": "sampling",
        "decode_ms": "vae_decode",
        "encode_mp4_ms": "video_encode",
        "cleanup_ms": "cleanup",
    }.get(name)
    if phase_name:
        logger(f"[WAN][PHASE_END] {phase_name} duration={_fmt_seconds(elapsed)}")
    return elapsed


def _log_summary(params, timings, logger):
    sampling_seconds = float(timings.get("sample_ms") or 0)
    steps = max(1, int(params.get("steps") or 1))
    total_seconds = float(timings.get("total_ms") or 0)
    ram_peak = "UNKNOWN"
    vram_peak = "UNKNOWN"
    disk_read_peak = "UNKNOWN"
    disk_write_peak = "UNKNOWN"
    logger("[WAN][SUMMARY]")
    logger(
        "[WAN][SUMMARY] "
        f"seconds={params.get('seconds')} frames={params.get('length')} steps={steps} "
        f"sampling_seconds={_fmt_seconds(sampling_seconds)} "
        f"seconds_per_step={_fmt_seconds(sampling_seconds / steps)} "
        f"total_seconds={_fmt_seconds(total_seconds)} "
        f"ram_peak_mb={ram_peak} vram_peak_mb={vram_peak} "
        f"disk_read_peak={disk_read_peak} disk_write_peak={disk_write_peak} "
        f"compare_to_comfyui_total={_fmt_seconds(total_seconds - 682)} "
        f"compare_to_comfyui_sampling={_fmt_seconds(sampling_seconds - 431)}"
    )


def _copy_image_to_comfy_input(image_path, folder_paths, width, height):
    source = Path(image_path)
    if not source.exists():
        raise ComfyWanRuntimeError(f"Imagem I2V nao encontrada: {image_path}")
    input_dir = Path(folder_paths.get_input_directory())
    input_dir.mkdir(parents=True, exist_ok=True)
    target_name = f"kit-wan-{uuid.uuid4().hex[:10]}{source.suffix or '.png'}"
    target = input_dir / target_name
    from PIL import Image, ImageOps

    image = Image.open(source).convert("RGB")
    image = ImageOps.fit(image, (int(width), int(height)), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    image.save(target)
    return target_name


def _build_lora_chain(prompt, loras, model_ref, clip_ref, logger):
    current_model = model_ref
    current_clip = clip_ref
    node_index = 30
    applied = 0
    for item in (loras or [])[:3]:
        raw_path = item.get("path") if isinstance(item, dict) else item
        if not raw_path:
            continue
        lora_path = Path(raw_path)
        if not lora_path.exists():
            raise ComfyWanRuntimeError(f"LoRA nao encontrada: {raw_path}")
        strength_model = float((item or {}).get("strength_model", (item or {}).get("strengthModel", (item or {}).get("weight", 1))) if isinstance(item, dict) else 1)
        strength_clip = float((item or {}).get("strength_clip", (item or {}).get("strengthClip", (item or {}).get("weight", strength_model))) if isinstance(item, dict) else strength_model)
        lora_name = _relative_to_any(lora_path, LORA_ROOTS)
        node_id = str(node_index)
        logger(f"[WAN][PHASE] apply_lora name={lora_name} strength_model={strength_model} strength_clip={strength_clip}")
        prompt[node_id] = {
            "class_type": "LoraLoader",
            "inputs": {
                "model": current_model,
                "clip": current_clip,
                "lora_name": lora_name,
                "strength_model": strength_model,
                "strength_clip": strength_clip,
            },
        }
        current_model = [node_id, 0]
        current_clip = [node_id, 1]
        node_index += 1
        applied += 1
    if len(loras or []) > 3:
        logger(f"[WAN][WARN] LoRA chain truncada para 3 entradas; recebidas={len(loras or [])}.")
    logger(f"[WAN][LORA] applied_count={applied}")
    return current_model, current_clip


def _build_prompt(payload, folder_paths, logger):
    mode = "i2v" if payload.get("mode") == "i2v" else "t2v"
    model_path = Path(payload.get("modelPath") or "")
    logger("[WAN][PHASE] load_model")
    text_encoder_path = _find_first(
        TEXT_ENCODER_ROOT,
        [
            os.environ.get("VIDEO_WAN_TEXT_ENCODER_PATH", ""),
            os.environ.get("VIDEO_WAN_TEXT_ENCODER_FILE", "umt5-xxl-encoder-Q3_K_S.gguf"),
            "umt5-xxl-encoder-Q4_K_M.gguf",
            "umt5-xxl-encoder-Q3_K_S.gguf",
        ],
    )
    vae_path = _find_first(
        VAE_ROOT,
        [
            os.environ.get("VIDEO_WAN_VAE_PATH", ""),
            os.environ.get("VIDEO_WAN_VAE_FILE", "wan_2.1_vae.safetensors"),
            "wan_2.1_vae.safetensors",
        ],
    )
    if text_encoder_path is None:
        raise ComfyWanRuntimeError(f"Text encoder Wan GGUF nao encontrado em {TEXT_ENCODER_ROOT}")
    if vae_path is None:
        raise ComfyWanRuntimeError(f"VAE Wan nao encontrada em {VAE_ROOT}")
    params = _payload_params(payload, model_path, text_encoder_path, vae_path)
    _log_params(params, logger)
    _log_guardrails_and_parity(params, logger)
    for label, file_path in (("model_gguf", model_path), ("clip_text_encoder", text_encoder_path), ("vae", vae_path)):
        try:
            size_mb = Path(file_path).stat().st_size / 1024 / 1024
            logger(f"[WAN][IO][SOURCE] {label} path={file_path} size={size_mb:.1f}MB")
        except Exception as exc:
            logger(f"[WAN][IO][SOURCE] {label} path={file_path} size=unknown error={exc}")
    logger("[WAN][IO][GGUF] ComfyUI-GGUF usa GGUFReader/tensor.data; leituras mmap podem aparecer como SSD ativo durante sampling se paginas forem demandadas.")

    width = int(payload.get("width") or 512)
    height = int(payload.get("height") or 512)
    frames = int(payload.get("sequenceLength") or payload.get("frames") or 17)
    fps = int(payload.get("fps") or 16)
    steps = int(payload.get("steps") or 4)
    cfg = float(payload.get("cfg") or payload.get("cfgScale") or 1.5)
    denoise = float(payload.get("denoise") or 0.7)
    seed = int(payload.get("seed") if payload.get("seed") is not None else -1)
    if seed < 0:
        seed = int.from_bytes(os.urandom(8), "little") & 0xFFFFFFFFFFFFFFFF
    shift = float(payload.get("shift") or payload.get("modelShift") or 8)

    model_name = _relative_to_any(model_path, [MODEL_ROOT])
    clip_name = _relative_to_any(text_encoder_path, [TEXT_ENCODER_ROOT])
    vae_name = _relative_to_any(vae_path, [VAE_ROOT])

    prompt = {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": model_name}},
        "2": {"class_type": "CLIPLoaderGGUF", "inputs": {"clip_name": clip_name, "type": "wan"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": vae_name}},
    }
    logger("[WAN][PHASE] load_clip")
    logger("[WAN][PHASE] load_vae")
    model_ref, clip_ref = _build_lora_chain(
        prompt,
        payload.get("conditioning", {}).get("loras") or payload.get("loras") or [],
        ["1", 0],
        ["2", 0],
        logger,
    )
    prompt["4"] = {"class_type": "ModelSamplingSD3", "inputs": {"model": model_ref, "shift": shift}}
    logger("[WAN][PHASE] encode_prompt")
    prompt["5"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": clip_ref, "text": payload.get("prompt") or ""}}
    prompt["6"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": clip_ref, "text": payload.get("negativePrompt") or ""}}
    positive_ref = ["5", 0]
    negative_ref = ["6", 0]

    if mode == "i2v":
        clip_vision_path = _find_first(
            CLIP_VISION_ROOT,
            [
                os.environ.get("VIDEO_WAN_CLIP_VISION_PATH", ""),
                os.environ.get("VIDEO_WAN_CLIP_VISION_FILE", "clip_vision_h.safetensors"),
                "clip_vision_h.safetensors",
            ],
        )
        if clip_vision_path is None:
            raise ComfyWanRuntimeError(f"CLIP Vision I2V nao encontrado em {CLIP_VISION_ROOT}")
        image_name = _copy_image_to_comfy_input(payload.get("startImage") or payload.get("imagePath") or "", folder_paths, width, height)
        clip_vision_name = _relative_to_any(clip_vision_path, [CLIP_VISION_ROOT])
        prompt["7"] = {"class_type": "LoadImage", "inputs": {"image": image_name}}
        prompt["8"] = {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": clip_vision_name}}
        prompt["9"] = {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["8", 0], "image": ["7", 0], "crop": "center"}}
        logger("[WAN][PHASE] create_latent")
        prompt["10"] = {
            "class_type": "WanImageToVideo",
            "inputs": {
                "positive": positive_ref,
                "negative": negative_ref,
                "vae": ["3", 0],
                "clip_vision_output": ["9", 0],
                "start_image": ["7", 0],
                "width": width,
                "height": height,
                "length": frames,
                "batch_size": 1,
            },
        }
        positive_ref = ["10", 0]
        negative_ref = ["10", 1]
        latent_ref = ["10", 2]
    else:
        logger("[WAN][PHASE] create_latent")
        prompt["10"] = {
            "class_type": "EmptyHunyuanVideo15Latent",
            "inputs": {"width": width, "height": height, "length": frames, "batch_size": 1},
        }
        latent_ref = ["10", 0]

    prompt["11"] = {
        "class_type": "KSampler",
        "inputs": {
            "model": ["4", 0],
            "positive": positive_ref,
            "negative": negative_ref,
            "latent_image": latent_ref,
            "seed": seed,
            "steps": steps,
            "cfg": cfg,
            "sampler_name": payload.get("sampler") or "euler_ancestral",
            "scheduler": payload.get("scheduler") or "beta",
            "denoise": denoise,
        },
    }
    prompt["12"] = {
        "class_type": "VAEDecodeTiled",
        "inputs": {
            "samples": ["11", 0],
            "vae": ["3", 0],
            "tile_size": 512,
            "overlap": 64,
            "temporal_size": 64,
            "temporal_overlap": 8,
        },
    }
    prompt["13"] = {
        "class_type": "KitVideoOutput",
        "inputs": {"images": ["12", 0], "fps": fps, "output_path": payload["outputPath"]},
    }
    return prompt, "13", seed, params


def _extract_video_path(executor):
    outputs = getattr(executor, "history_result", {}).get("outputs", {})
    for output in outputs.values():
        for item in output.get("gifs", []) or []:
            fullpath = item.get("fullpath")
            if fullpath and Path(fullpath).exists():
                return Path(fullpath)
    raise ComfyWanRuntimeError("ComfyUI-GGUF interno executou, mas nao retornou caminho de video.")


async def _load_required_nodes(nodes):
    extras = COMFY_ROOT / "comfy_extras"
    for file_name in ("nodes_model_advanced.py", "nodes_hunyuan.py", "nodes_wan.py"):
        candidate = EXTRA_ROOT / file_name
        if not candidate.exists():
            candidate = extras / file_name
        await nodes.load_custom_node(str(candidate), module_parent="comfy_extras")
    gguf_nodes = _import_vendor_gguf_nodes(nodes)
    for name, node_cls in getattr(gguf_nodes, "NODE_CLASS_MAPPINGS", {}).items():
        nodes.NODE_CLASS_MAPPINGS[name] = node_cls
        try:
            node_cls.RELATIVE_PYTHON_MODULE = "backend.runtimes.wan.legacy.gguf_nodes"
        except Exception:
            pass
    if hasattr(gguf_nodes, "NODE_DISPLAY_NAME_MAPPINGS"):
        nodes.NODE_DISPLAY_NAME_MAPPINGS.update(gguf_nodes.NODE_DISPLAY_NAME_MAPPINGS)
    nodes.NODE_CLASS_MAPPINGS["KitVideoOutput"] = KitVideoOutput


def _configure_comfy_memory(logger):
    try:
        import comfy.model_management as model_management
        from comfy.cli_args import args

        requested_mode = os.environ.get("KIT_WAN_VRAM_MODE", "normalvram").strip().lower()
        safety_margin_mb = float(os.environ.get("WAN_VRAM_SAFETY_MARGIN_MB", "500") or 500)
        target_mb = float(os.environ.get("KIT_WAN_VRAM_TARGET_MB", "0") or 0)
        total_mb = float(getattr(model_management, "total_vram", 0) or 0)
        if target_mb <= 0 and total_mb > 0:
            target_mb = max(0.0, total_mb - safety_margin_mb)
        if requested_mode == "highvram":
            model_management.vram_state = model_management.VRAMState.HIGH_VRAM
            args.highvram = True
            args.normalvram = False
            args.lowvram = False
            args.novram = False
        elif requested_mode == "normalvram":
            model_management.vram_state = model_management.VRAMState.NORMAL_VRAM
            args.normalvram = True
            args.highvram = False
            args.lowvram = False
            args.novram = False

        if total_mb > 0:
            reserve_mb = max(safety_margin_mb, total_mb - target_mb if target_mb > 0 and target_mb < total_mb else safety_margin_mb)
            model_management.EXTRA_RESERVED_VRAM = int(reserve_mb * 1024 * 1024)

        logger(
            f"[WAN][MEM][CONFIG] mode={requested_mode} vram_state={getattr(model_management, 'vram_state', None)} "
            f"total_vram={total_mb:.0f}MB target={target_mb:.0f}MB "
            f"reserved={getattr(model_management, 'EXTRA_RESERVED_VRAM', 0) / 1024 / 1024:.0f}MB "
            f"safety_margin={safety_margin_mb:.0f}MB "
            f"disable_smart_memory={getattr(model_management, 'DISABLE_SMART_MEMORY', None)} "
            f"async_streams={getattr(model_management, 'NUM_STREAMS', None)}"
        )
    except Exception as exc:
        logger(f"[WAN][MEM][CONFIG] aviso ao configurar model_management: {exc}")


def _device_of(value):
    try:
        if hasattr(value, "device"):
            return str(value.device)
        if hasattr(value, "load_device") or hasattr(value, "offload_device"):
            return f"load={getattr(value, 'load_device', None)} offload={getattr(value, 'offload_device', None)}"
        if hasattr(value, "model"):
            return _device_of(value.model)
        if isinstance(value, dict):
            return "{" + ", ".join(f"{key}:{_device_of(item)}" for key, item in list(value.items())[:8]) + "}"
        if isinstance(value, (list, tuple)):
            return "[" + ", ".join(_device_of(item) for item in list(value)[:8]) + "]"
    except Exception as exc:
        return f"unknown:{exc}"
    return type(value).__name__


def _log_node_output_devices(executor, node_ids, logger, label):
    for node_id in node_ids:
        try:
            cached = executor.caches.outputs.get(str(node_id))
            outputs = getattr(cached, "outputs", None) if cached is not None else None
            if outputs is None:
                logger(f"[WAN][DEVICE][{label}] node={node_id} cache=missing")
                continue
            for index, value in enumerate(outputs):
                logger(f"[WAN][DEVICE][{label}] node={node_id}[{index}] {_device_of(value)}")
        except Exception as exc:
            logger(f"[WAN][DEVICE][{label}] node={node_id} erro={exc}")


def _log_runtime_memory_diagnostics(label, logger, executor=None):
    try:
        import comfy.model_management as model_management

        current = getattr(model_management, "current_loaded_models", [])
        logger(
            f"[WAN][MEM][{label}] loaded_models={len(current)} "
            f"vram_state={getattr(model_management, 'vram_state', None)} "
            f"total_vram={getattr(model_management, 'total_vram', None)} "
            f"reserved={getattr(model_management, 'EXTRA_RESERVED_VRAM', 0) / 1024 / 1024:.0f}MB"
        )
        for index, loaded in enumerate(list(current)):
            model = getattr(loaded, "model", None)
            real = getattr(model, "model", model)
            logger(
                f"[WAN][MEM][{label}] loaded[{index}] model={type(real).__name__} "
                f"load_device={getattr(model, 'load_device', None)} "
                f"offload_device={getattr(model, 'offload_device', None)} "
                f"lowvram={getattr(real, 'model_lowvram', None)} "
                f"offload_buffer={getattr(real, 'model_offload_buffer_memory', None)}"
            )
    except Exception as exc:
        logger(f"[WAN][MEM][{label}] model_management unavailable={exc}")

    if executor is not None:
        try:
            history = getattr(executor, "history_result", {}) or {}
            outputs = history.get("outputs", {}) if isinstance(history, dict) else {}
            logger(
                f"[WAN][MEM][{label}] executor_attrs={sorted(vars(executor).keys())} "
                f"history_outputs={len(outputs)}"
            )
        except Exception as exc:
            logger(f"[WAN][MEM][{label}] executor inspect failed={exc}")

    module_names = [
        "nodes",
        "comfy.model_management",
        "backend.runtimes.wan.legacy.gguf_nodes.nodes",
        "backend.runtimes.wan.legacy.gguf_nodes.loader",
    ]
    for name in module_names:
        module = sys.modules.get(name)
        logger(f"[WAN][MEM][{label}] module {name}={getattr(module, '__file__', '') if module else 'not_loaded'}")


def run_comfy_gguf_wan(payload, logger, ram_monitor=None):
    timings = {}
    total_started = time.perf_counter()
    _insert_internal_paths()
    import folder_paths
    import execution
    import comfy

    _assert_internal_module(folder_paths, COMFY_ROOT, "folder_paths")
    _assert_internal_module(comfy, COMFY_ROOT, "comfy")
    _assert_internal_module(execution, COMFY_ROOT, "execution")
    nodes = _import_comfy_core_nodes()
    _configure_comfy_memory(logger)

    _register_model_roots(folder_paths)
    asyncio.run(_load_required_nodes(nodes))
    missing = [
        name
        for name in [
            "UnetLoaderGGUF",
            "CLIPLoaderGGUF",
            "ModelSamplingSD3",
            "EmptyHunyuanVideo15Latent",
            "KSampler",
            "VAEDecodeTiled",
            "KitVideoOutput",
        ]
        if name not in nodes.NODE_CLASS_MAPPINGS
    ]
    if missing:
        raise ComfyWanRuntimeError(f"Runtime Wan interno incompleto: {', '.join(missing)}")

    prompt, output_node, seed, params = _build_prompt(payload, folder_paths, logger)
    if _bool_env("WAN_TRACE_EXECUTION", False):
        _log_required_env_blocks(params, logger)
    if _bool_env("WAN_TRACE_EXECUTION", False):
        run_wan_parity_audit(payload, logger)
    kit_server = _KitComfyServer(logger)
    executor = execution.PromptExecutor(kit_server, cache_args={"lru": 0, "ram": 0})
    prompt_id = f"kit-wan-{uuid.uuid4().hex}"
    logger("[WAN][PHASE] load_model_start")
    logger("[WAN][PHASE_START] load_models")
    logger("[WAN][PHASE_START] encode_prompt")
    logger("[WAN][PHASE_START] prepare_latent")
    if ram_monitor:
        ram_monitor.set_phase("load_model_encode_prompt")
    started = time.perf_counter()
    executor.execute(prompt, f"{prompt_id}-load", extra_data={"client_id": None}, execute_outputs=["3", "4", "5", "6"])
    load_elapsed = _phase_done(timings, "load_ms", started, logger)
    timings["encode_prompt_ms"] = 0.0
    timings["prepare_latent_ms"] = 0.0
    logger("[WAN][PHASE_END] encode_prompt duration=0.00")
    logger("[WAN][PHASE_END] prepare_latent duration=0.00")
    if ram_monitor:
        ram_monitor.log_snapshot("after_load")
    _log_runtime_memory_diagnostics("after_load", logger, executor)
    _log_node_output_devices(executor, ["1", "2", "3", "4", "5", "6", "10"], logger, "after_load")
    if not executor.success:
        raise ComfyWanRuntimeError("Falha ao carregar modelo/text_encoder/VAE no runtime Wan interno.")

    frames = int(payload.get("sequenceLength") or payload.get("frames") or 0)
    steps = int(payload.get("steps") or 4)
    cfg = float(payload.get("cfg") or payload.get("cfgScale") or 1.5)
    logger(f"[WAN][GENERATE] frames={frames} steps={steps} cfg={cfg}")
    if ram_monitor:
        ram_monitor.set_phase("sample")
    logger("[WAN][PHASE] sample_start")
    logger("[WAN][PHASE_START] sampling")
    logger(f"[WAN][PROGRESS] step 0/{steps}")
    started = time.perf_counter()
    executor.execute(prompt, f"{prompt_id}-sample", extra_data={"client_id": None}, execute_outputs=["11"])
    sample_elapsed = _phase_done(timings, "sample_ms", started, logger)
    logger(f"[WAN][PROGRESS] step {steps}/{steps}")
    if not getattr(kit_server, "sampling_started_at", None):
        per_step = sample_elapsed / max(1, steps)
        for step in range(1, steps + 1):
            logger(
                f"[WAN][SAMPLING] step={step}/{steps} "
                f"elapsed={_fmt_seconds(per_step * step)} step_seconds={_fmt_seconds(per_step)}"
            )
    _log_runtime_memory_diagnostics("after_sample", logger, executor)
    _log_node_output_devices(executor, ["11"], logger, "after_sample")
    if not executor.success:
        raise ComfyWanRuntimeError("Falha durante sampling no runtime Wan interno.")

    if ram_monitor:
        ram_monitor.set_phase("decode")
    logger("[WAN][PHASE] decode_start")
    logger("[WAN][PHASE_START] vae_decode")
    started = time.perf_counter()
    executor.execute(prompt, f"{prompt_id}-decode", extra_data={"client_id": None}, execute_outputs=["12"])
    decode_elapsed = _phase_done(timings, "decode_ms", started, logger)
    logger("[WAN][PHASE] decode_done")
    _log_runtime_memory_diagnostics("after_decode", logger, executor)
    _log_node_output_devices(executor, ["12"], logger, "after_decode")
    if not executor.success:
        raise ComfyWanRuntimeError("Falha durante VAE decode no runtime Wan interno.")

    if ram_monitor:
        ram_monitor.set_phase("encode_mp4")
    logger("[WAN][PHASE] encode_video_start")
    logger("[WAN][PHASE_START] video_encode")
    started = time.perf_counter()
    executor.execute(prompt, prompt_id, extra_data={"client_id": None}, execute_outputs=[output_node])
    encode_elapsed = _phase_done(timings, "encode_mp4_ms", started, logger)
    logger("[WAN][PHASE] encode_video_done")
    _log_runtime_memory_diagnostics("after_generate_execute", logger, executor)
    _log_node_output_devices(executor, [output_node], logger, "after_encode_mp4")
    if not executor.success:
        raise ComfyWanRuntimeError("Falha durante execucao do prompt Wan interno.")

    produced = _extract_video_path(executor)
    output_path = Path(payload["outputPath"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if produced.resolve() != output_path.resolve():
        shutil.copy2(produced, output_path)
    try:
        timings["total_ms"] = time.perf_counter() - total_started
        _log_summary(params, timings, logger)
        return {
            "path": str(output_path),
            "frameCount": frames,
            "device": "cuda",
            "seed": seed,
        }
    finally:
        cleanup_started = time.perf_counter()
        logger("[WAN][PHASE] cleanup")
        try:
            if hasattr(executor, "history_result"):
                executor.history_result = {"outputs": {}}
            if hasattr(executor, "outputs"):
                executor.outputs = {}
            if hasattr(executor, "object_storage"):
                executor.object_storage = None
            if hasattr(executor, "caches"):
                executor.caches = None
        except Exception as exc:
            logger(f"[WAN][MEM][cleanup_refs] executor cleanup warning={exc}")
        del executor
        del prompt
        gc.collect()
        timings["cleanup_ms"] = timings.get("cleanup_ms", 0.0) + (time.perf_counter() - cleanup_started)
        timings["total_ms"] = time.perf_counter() - total_started
        logger("[WAN][MEM][cleanup_refs] executor/prompt refs liberados e gc.collect executado")
        logger("[WAN][TIMING]")
        for key in ["load_ms", "encode_prompt_ms", "sample_ms", "decode_ms", "encode_mp4_ms", "cleanup_ms", "total_ms"]:
            logger(f"[WAN][TIMING] {key}={_fmt_ms(timings.get(key, 0))}")


def cleanup_comfy(logger):
    try:
        import comfy.model_management as model_management

        logger("[WAN][UNLOAD] releasing model/text_encoder/vae/lora")
        model_management.unload_all_models()
        model_management.cleanup_models_gc()
        gc.collect()
        logger("[WAN][UNLOAD] Python gc.collect executado apos unload Comfy")
    except Exception as exc:
            logger(f"[WAN][UNLOAD] aviso ao liberar runtime Wan interno: {exc}")
