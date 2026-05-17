import importlib
import os
import subprocess
import gc
import sys
from pathlib import Path

from PIL import Image


MODEL_ROOT = os.path.abspath(os.environ.get("VIDEO_MODEL_ROOT", r"F:\AI\models\diffusion_models"))
TEXT_ENCODER_ROOT = os.path.abspath(os.environ.get("VIDEO_TEXT_ENCODER_ROOT", r"F:\AI\models\text_encoders"))
VAE_ROOT = os.path.abspath(os.environ.get("VIDEO_VAE_ROOT", r"F:\AI\models\vae"))
CLIP_VISION_ROOT = os.path.abspath(os.environ.get("VIDEO_CLIP_VISION_ROOT", r"F:\AI\models\clip_vision"))
LORA_ROOTS = [
    os.path.abspath(os.environ.get("VIDEO_LORA_ROOT", r"F:\AI\models\loras")),
    os.path.abspath(os.environ.get("VIDEO_WAN_LORA_ROOT", r"F:\AI\models\loras\Wan")),
]
DEFAULT_T2V_REPO = os.environ.get("VIDEO_WAN_T2V_REPO", "Wan-AI/Wan2.2-T2V-A14B-Diffusers")
DEFAULT_I2V_REPO = os.environ.get("VIDEO_WAN_I2V_REPO", "Wan-AI/Wan2.2-I2V-A14B-Diffusers")
DEFAULT_TEXT_ENCODER_REPO = os.environ.get("VIDEO_WAN_TEXT_ENCODER_REPO", "city96/umt5-xxl-encoder-gguf")
DEFAULT_TEXT_ENCODER_FILE = os.environ.get("VIDEO_WAN_TEXT_ENCODER_FILE", "umt5-xxl-encoder-Q3_K_S.gguf")
DEFAULT_VAE_FILE = os.environ.get("VIDEO_WAN_VAE_FILE", "wan_2.1_vae.safetensors")
DEFAULT_CLIP_VISION_FILE = os.environ.get("VIDEO_WAN_CLIP_VISION_FILE", "clip_vision_h.safetensors")
WAN_RUNTIME = os.environ.get("VIDEO_WAN_RUNTIME", "comfy_gguf").strip().lower() or "comfy_gguf"
ALLOW_CPU_FALLBACK = os.environ.get("VIDEO_WAN_ALLOW_CPU_FALLBACK", "false").strip().lower() in {"1", "true", "yes", "on"}
MIN_FREE_VRAM_MB = int(os.environ.get("VIDEO_WAN_MIN_FREE_VRAM_MB", "8500") or 8500)


class WanEngineError(RuntimeError):
    pass


def optional_import(module_name):
    try:
        return importlib.import_module(module_name)
    except Exception:
        return None


def cuda_available():
    torch = optional_import("torch")
    return bool(torch and torch.cuda.is_available())


def get_device():
    return "cuda" if cuda_available() else "cpu"


def vram_info():
    torch = optional_import("torch")
    if torch is None or not torch.cuda.is_available():
        return {
            "available": False,
            "gpu": "",
            "total_mb": 0,
            "free_mb": 0,
            "used_mb": 0,
        }
    free_bytes, total_bytes = torch.cuda.mem_get_info()
    return {
        "available": True,
        "gpu": torch.cuda.get_device_name(0),
        "total_mb": int(total_bytes / 1024 / 1024),
        "free_mb": int(free_bytes / 1024 / 1024),
        "used_mb": int((total_bytes - free_bytes) / 1024 / 1024),
    }


def log_vram(label, logger):
    info = vram_info()
    logger(f"[WAN][VRAM] {label}={info['used_mb']}MB free={info['free_mb']}MB total={info['total_mb']}MB")
    return info


def assert_cuda_runtime(logger):
    torch = optional_import("torch")
    if torch is None:
        raise WanEngineError("WAN_CUDA_NOT_AVAILABLE: geração Wan2.2 requer CUDA. torch nao esta instalado.")
    info = vram_info()
    logger(f"[WAN][CUDA] available={str(info['available']).lower()} gpu={info['gpu']} vram_total={info['total_mb']}MB")
    if not info["available"] and not ALLOW_CPU_FALLBACK:
        raise WanEngineError("WAN_CUDA_NOT_AVAILABLE: geração Wan2.2 requer CUDA. Runtime atual está em CPU.")
    if info["free_mb"] < MIN_FREE_VRAM_MB and not ALLOW_CPU_FALLBACK:
        raise WanEngineError(f"WAN_INSUFFICIENT_VRAM: livre={info['free_mb']}MB minimo={MIN_FREE_VRAM_MB}MB.")
    return info


def resolve_dtype():
    torch = optional_import("torch")
    if torch is None:
        return None
    return torch.float16 if cuda_available() else torch.float32


def resolve_compute_dtype():
    torch = optional_import("torch")
    if torch is None:
        return None
    return torch.bfloat16 if cuda_available() else torch.float32


def find_first_existing(root, names):
    for name in names:
        if not name:
            continue
        path = Path(name)
        candidates = [path] if path.is_absolute() else [Path(root) / name]
        for candidate in candidates:
            if candidate.exists():
                return candidate
    return None


def cleanup_runtime(pipe=None, logger=None):
    if logger:
        logger("[WAN][UNLOAD] releasing model/text_encoder/vae/lora")
    if pipe is not None:
        try:
            if hasattr(pipe, "unload_lora_weights"):
                if logger:
                    logger("[LORA] Descarregando LoRAs aplicadas.")
                pipe.unload_lora_weights()
        except Exception as exc:
            if logger:
                logger(f"[LORA] Aviso ao descarregar LoRA: {exc}")
    try:
        del pipe
    except Exception:
        pass
    gc.collect()
    torch = optional_import("torch")
    if torch and torch.cuda.is_available():
        torch.cuda.empty_cache()
        try:
            torch.cuda.ipc_collect()
        except Exception:
            pass
        if logger:
            logger("[MODEL] Cache CUDA liberado.")
    if logger:
        log_vram("after_unload", logger)


def validate_model_path(model_path):
    path = Path(model_path or "")
    if not model_path:
        raise WanEngineError("Nenhum modelo Wan foi selecionado.")
    if not path.exists():
        raise WanEngineError(f"Modelo Wan nao encontrado: {model_path}")
    resolved = os.path.abspath(str(path))
    allowed_root = os.path.abspath(MODEL_ROOT)
    if not resolved.lower().startswith(allowed_root.lower()):
        raise WanEngineError(f"Modelo fora do diretorio permitido ({MODEL_ROOT}): {model_path}")
    if path.suffix.lower() not in {".safetensors", ".gguf", ".json", ""} and path.is_file():
        raise WanEngineError(f"Formato de modelo nao suportado para video: {path.suffix}")
    return path


def validate_lora_path(lora_path):
    path = Path(lora_path or "")
    if not lora_path:
        return None
    if not path.exists():
        raise WanEngineError(f"LoRA nao encontrada: {lora_path}")
    resolved = os.path.abspath(str(path))
    allowed = any(resolved.lower().startswith(root.lower()) for root in LORA_ROOTS)
    if not allowed:
        raise WanEngineError(f"LoRA fora dos diretorios permitidos: {lora_path}")
    if path.suffix.lower() not in {".safetensors", ".gguf"}:
        raise WanEngineError(f"Formato de LoRA nao suportado: {path.suffix}")
    return path


def pick_diffusers_pipeline(mode):
    diffusers = optional_import("diffusers")
    if diffusers is None:
        raise WanEngineError("Biblioteca diffusers nao esta instalada no Python atual.")

    names = (
        ["WanImageToVideoPipeline", "AutoPipelineForImageToVideo"]
        if mode == "i2v"
        else ["WanPipeline", "AutoPipelineForText2Video", "TextToVideoSDPipeline"]
    )
    for name in names:
        pipeline_class = getattr(diffusers, name, None)
        if pipeline_class is not None:
            return pipeline_class
    raise WanEngineError(
        "A versao instalada de diffusers nao expoe um pipeline Wan/T2V/I2V compativel."
    )


def load_wan_gguf_pipeline(model_path, mode, logger):
    torch = optional_import("torch")
    diffusers = optional_import("diffusers")
    transformers = optional_import("transformers")
    if torch is None or diffusers is None or transformers is None:
        raise WanEngineError(
            "Runtime GGUF exige torch, diffusers, transformers e gguf no Python do worker."
        )
    try:
        import transformers.utils.import_utils as transformers_import_utils
        import transformers.modeling_gguf_pytorch_utils as gguf_utils
        transformers_import_utils.is_gguf_available = lambda min_version=transformers_import_utils.GGUF_MIN_VERSION: True
        gguf_utils.is_gguf_available = lambda: True
    except Exception as exc:
        logger(f"[MODEL] Aviso ao preparar compatibilidade GGUF/Transformers: {exc}")
    required = [
        "WanPipeline",
        "WanImageToVideoPipeline",
        "WanTransformer3DModel",
        "AutoencoderKLWan",
        "GGUFQuantizationConfig",
    ]
    missing = [name for name in required if not hasattr(diffusers, name)]
    if missing:
        raise WanEngineError(f"diffusers sem suporte Wan/GGUF necessario: {', '.join(missing)}")

    model_repo = os.environ.get("VIDEO_WAN_MODEL_REPO") or (DEFAULT_I2V_REPO if mode == "i2v" else DEFAULT_T2V_REPO)
    text_encoder_path = find_first_existing(TEXT_ENCODER_ROOT, [
        os.environ.get("VIDEO_WAN_TEXT_ENCODER_PATH", ""),
        DEFAULT_TEXT_ENCODER_FILE,
        "umt5-xxl-encoder-Q4_K_M.gguf",
        "umt5-xxl-encoder-Q3_K_S.gguf",
    ])
    vae_path = find_first_existing(VAE_ROOT, [
        os.environ.get("VIDEO_WAN_VAE_PATH", ""),
        DEFAULT_VAE_FILE,
    ])
    clip_vision_path = find_first_existing(CLIP_VISION_ROOT, [
        os.environ.get("VIDEO_WAN_CLIP_VISION_PATH", ""),
        DEFAULT_CLIP_VISION_FILE,
        str(Path("D") / DEFAULT_CLIP_VISION_FILE),
    ])
    if text_encoder_path is None:
        raise WanEngineError(f"Text encoder UMT5 GGUF nao encontrado em {TEXT_ENCODER_ROOT}.")
    if vae_path is None:
        raise WanEngineError(f"VAE Wan nao encontrada em {VAE_ROOT}.")

    dtype = resolve_compute_dtype()
    logger(f"[MODEL] GGUF transformer: {Path(model_path).name}.")
    logger(f"[MODEL] Text encoder: {text_encoder_path.name}.")
    logger(f"[MODEL] VAE: {vae_path.name}.")
    transformer = diffusers.WanTransformer3DModel.from_single_file(
        str(model_path),
        quantization_config=diffusers.GGUFQuantizationConfig(compute_dtype=dtype),
        torch_dtype=dtype,
    )
    text_encoder = transformers.UMT5EncoderModel.from_pretrained(
        DEFAULT_TEXT_ENCODER_REPO,
        gguf_file=text_encoder_path.name,
        torch_dtype=dtype,
    )

    pipeline_class = diffusers.WanImageToVideoPipeline if mode == "i2v" else diffusers.WanPipeline
    pipeline_kwargs = {
        "transformer": transformer,
        "transformer_2": None,
        "text_encoder": text_encoder,
        "torch_dtype": dtype,
    }
    try:
        vae = diffusers.AutoencoderKLWan.from_single_file(
            str(vae_path),
            config=model_repo,
            subfolder="vae",
            torch_dtype=torch.float32,
        )
        pipeline_kwargs["vae"] = vae
    except Exception as exc:
        logger(f"[MODEL] VAE local nao carregou via diffusers ({exc}); usando VAE do repo {model_repo}.")

    if mode == "i2v" and clip_vision_path is not None:
        try:
            pipeline_kwargs["image_encoder"] = transformers.CLIPVisionModel.from_pretrained(
                model_repo,
                subfolder="image_encoder",
                torch_dtype=dtype,
            )
            pipeline_kwargs["image_processor"] = transformers.CLIPImageProcessor.from_pretrained(
                model_repo,
                subfolder="image_processor",
            )
            logger(f"[MODEL] CLIP Vision configurado para I2V: {clip_vision_path.name}.")
        except Exception as exc:
            logger(f"[MODEL] CLIP Vision local/repo indisponivel ({exc}); seguindo com condicionamento de imagem basico.")

    pipe = pipeline_class.from_pretrained(model_repo, **pipeline_kwargs)
    if hasattr(pipe, "to"):
        if get_device() == "cpu" and not ALLOW_CPU_FALLBACK:
            raise WanEngineError("WAN_CUDA_NOT_AVAILABLE: geração Wan2.2 requer CUDA. Runtime atual está em CPU.")
        pipe = pipe.to(get_device())
    if hasattr(pipe, "enable_vae_tiling"):
        pipe.enable_vae_tiling()
    return pipe


def load_pipeline(model_path, mode, logger):
    model_path = validate_model_path(model_path)
    extension = model_path.suffix.lower()
    device = get_device()
    logger(f"[MODEL] Carregando: {model_path.name} via {device.upper()}.")

    if extension == ".gguf":
        gguf = optional_import("gguf")
        if gguf is None:
            raise WanEngineError(
                "Modelo .gguf selecionado, mas nenhum loader GGUF Python esta disponivel. "
                "Use a venv propria da KIT em F:\\AI\\Ai_kit\\venv\\Scripts\\python.exe com gguf/diffusers."
            )
        return load_wan_gguf_pipeline(model_path, mode, logger)

    torch = optional_import("torch")
    pipeline_class = pick_diffusers_pipeline(mode)
    kwargs = {
        "torch_dtype": resolve_dtype(),
        "local_files_only": True,
    }
    if model_path.is_dir():
        pipe = pipeline_class.from_pretrained(str(model_path), **kwargs)
    elif model_path.name == "model_index.json":
        pipe = pipeline_class.from_pretrained(str(model_path.parent), **kwargs)
    elif hasattr(pipeline_class, "from_single_file"):
        pipe = pipeline_class.from_single_file(str(model_path), **kwargs)
    else:
        raise WanEngineError(
            "O pipeline diffusers disponivel nao suporta carregar este arquivo unico."
        )

    if torch and device == "cuda":
        pipe = pipe.to("cuda")
        if hasattr(pipe, "enable_vae_tiling"):
            pipe.enable_vae_tiling()
    elif hasattr(pipe, "to"):
        pipe = pipe.to(device)
    return pipe


def apply_loras(pipe, loras, logger):
    for item in loras or []:
        lora_path = validate_lora_path(item.get("path") if isinstance(item, dict) else item)
        if lora_path is None:
            continue
        weight = float((item or {}).get("weight", 1) if isinstance(item, dict) else 1)
        logger(f"[LORA] Aplicando: {lora_path.name} (Peso: {weight}).")
        if not hasattr(pipe, "load_lora_weights"):
            raise WanEngineError("Pipeline atual nao suporta load_lora_weights para LoRA.")
        pipe.load_lora_weights(str(lora_path), adapter_name=lora_path.stem)
        if hasattr(pipe, "set_adapters"):
            pipe.set_adapters([lora_path.stem], adapter_weights=[weight])


def configure_scheduler(pipe, sampler, scheduler, shift, logger):
    diffusers = optional_import("diffusers")
    if pipe is None or diffusers is None or not hasattr(pipe, "scheduler"):
        return
    if not hasattr(diffusers, "FlowMatchEulerDiscreteScheduler"):
        return
    normalized_scheduler = str(scheduler or "").strip().lower()
    try:
        config = dict(pipe.scheduler.config)
        config["shift"] = float(shift)
        if normalized_scheduler == "beta":
            config["use_beta_sigmas"] = True
        pipe.scheduler = diffusers.FlowMatchEulerDiscreteScheduler.from_config(config)
        logger(f"[CONFIG] ModelSamplingSD3 shift: {float(shift)} | Sampler: {sampler or 'euler'} | Scheduler: {scheduler or 'default'}.")
    except Exception as exc:
        logger(f"[CONFIG] Aviso ao configurar scheduler Wan: {exc}")


def build_generator(seed):
    torch = optional_import("torch")
    if torch is None:
        return None
    seed = int(seed if seed is not None else -1)
    if seed < 0:
        seed = int.from_bytes(os.urandom(4), "little")
    return torch.Generator(device=get_device()).manual_seed(seed)


def normalize_frame(frame):
    if isinstance(frame, Image.Image):
        return frame.convert("RGB")
    if hasattr(frame, "detach"):
        frame = frame.detach().cpu()
    if hasattr(frame, "numpy"):
        frame = frame.numpy()
    return Image.fromarray(frame).convert("RGB")


def extract_frames(result):
    candidates = [
        getattr(result, "frames", None),
        getattr(result, "images", None),
        result.get("frames") if isinstance(result, dict) else None,
        result.get("images") if isinstance(result, dict) else None,
    ]
    frames = next((item for item in candidates if item), None)
    if frames is None:
        raise WanEngineError("Pipeline Wan nao retornou frames/images.")
    if frames and isinstance(frames[0], list):
        frames = frames[0]
    return [normalize_frame(frame) for frame in frames]


def encode_video(frames, output_path, fps):
    output_path = str(output_path)
    frame_dir = Path(output_path).with_suffix("")
    frame_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(frame_dir / "frame_%05d.png")
    for index, frame in enumerate(frames, start=1):
        frame.save(str(frame_dir / f"frame_{index:05d}.png"))
    command = [
        "ffmpeg",
        "-y",
        "-framerate",
        str(int(fps)),
        "-i",
        pattern,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        output_path,
    ]
    subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def run_wan_inference(payload, logger):
    raise WanEngineError("Runtime Wan nativo foi removido. Use ComfyUI externo.")
    runtime_alias = os.environ.get("VIDEO_WAN_RUNTIME", "comfy_gguf").strip().lower() or "comfy_gguf"
    if runtime_alias in {"comfy_gguf", "kit_wan_legacy"}:
        kit_root = str(Path(__file__).resolve().parents[2])
        if kit_root not in sys.path:
            sys.path.insert(0, kit_root)
        from backend.runtimes.wan.engine import run_wan_inference as run_internal_wan_inference

        return run_internal_wan_inference(payload, logger)

    mode = "i2v" if payload.get("mode") == "i2v" else "t2v"
    width = int(payload.get("width") or 512)
    height = int(payload.get("height") or 512)
    frames = int(payload.get("sequenceLength") or payload.get("frames") or 17)
    fps = int(payload.get("fps") or 16)
    steps = int(payload.get("steps") or 4)
    cfg = float(payload.get("cfg") or payload.get("cfgScale") or 1.5)
    denoise = float(payload.get("denoise") or 0.7)
    motion_strength = float(payload.get("motionStrength") or 0.5)
    shift = float(payload.get("shift") or payload.get("modelShift") or 8.0)
    logger("[VIDEO_WORKER] Iniciando inferência real Wan2.2.")
    logger(f"[WAN][RUNTIME] {WAN_RUNTIME}")
    logger(f"[WAN][PYTHON] {sys.executable}")
    assert_cuda_runtime(logger)
    logger(f"[CONFIG] Resolução: {width}x{height} | Frames: {frames} | FPS: {fps} | Steps: {steps}.")
    logger(f"[WAN][CONFIG] Resolução: {width}x{height} | Frames: {frames} | FPS: {fps} | Steps: {steps}.")
    log_vram("before_load", logger)

    if WAN_RUNTIME == "comfy_gguf":
        raise WanEngineError("WAN_RUNTIME_INTERNAL_ROUTING_ERROR: comfy_gguf deve ser roteado para backend.runtimes.wan.engine.")

    if WAN_RUNTIME != "diffusers":
        raise WanEngineError(
            f"WAN_RUNTIME_UNSUPPORTED: VIDEO_WAN_RUNTIME={WAN_RUNTIME}. Use comfy_gguf ou diffusers."
        )

    try:
        pipe = load_pipeline(payload.get("modelPath"), mode, logger)
        log_vram("after_load", logger)
        apply_loras(pipe, payload.get("conditioning", {}).get("loras") or payload.get("loras") or [], logger)
        configure_scheduler(
            pipe,
            payload.get("sampler") or "euler_ancestral",
            payload.get("scheduler") or "beta",
            shift,
            logger,
        )

        call_kwargs = {
            "prompt": payload.get("prompt") or "",
            "negative_prompt": payload.get("negativePrompt") or "",
            "width": width,
            "height": height,
            "num_frames": frames,
            "num_inference_steps": steps,
            "guidance_scale": cfg,
            "generator": build_generator(payload.get("seed")),
        }
        scheduler = payload.get("scheduler") or payload.get("sampler") or ""
        if scheduler:
            logger(f"[CONFIG] Sampler/Scheduler: {scheduler}.")
        logger(f"[WAN][GENERATE] frames={frames} steps={steps} cfg={cfg}")
        if mode == "i2v":
            start_image = payload.get("startImage") or payload.get("imagePath") or ""
            if not start_image or not Path(start_image).exists():
                raise WanEngineError("Perfil I2V exige uma imagem de referencia valida.")
            image = Image.open(start_image).convert("RGB").resize((width, height), Image.LANCZOS)
            call_kwargs.update({
                "image": image,
                "strength": denoise,
                "motion_strength": motion_strength,
            })

        try:
            result = pipe(**call_kwargs)
        except TypeError:
            call_kwargs.pop("motion_strength", None)
            result = pipe(**call_kwargs)

        log_vram("after_generate", logger)
        output_video = payload["outputPath"]
        Path(output_video).parent.mkdir(parents=True, exist_ok=True)
        generated_frames = extract_frames(result)
        if len(generated_frames) < 2:
            raise WanEngineError("Inferencia retornou menos de 2 frames; recusando video sem movimento real.")
        encode_video(generated_frames, output_video, fps)
        return {
            "path": output_video,
            "frameCount": len(generated_frames),
            "device": get_device(),
        }
    finally:
        cleanup_runtime(locals().get("pipe"), logger)
