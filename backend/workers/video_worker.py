import json
import os
import re
import subprocess
import sys
import textwrap
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from native_wan_engine import WanEngineError, run_wan_inference


STATUS_SEQUENCE = [
    "preparing_resources",
    "loading_model",
    "sampling",
    "decoding",
    "saving"
]


def write_status(status_path, payload):
    Path(status_path).parent.mkdir(parents=True, exist_ok=True)
    with open(status_path, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)


def placeholder_enabled():
    return str(os.environ.get("VIDEO_PLACEHOLDER_MODE", "")).strip().lower() in {"1", "true", "yes", "on"}


def wan_audit_only_enabled():
    return False


def append_log(status_path, base_payload, logs, message, status=None, progress=None, extra=None):
    print(message, flush=True)
    logs.append(message)
    patch = {"logs": list(logs)}
    if extra:
        patch.update(extra)
    if status is not None:
        update_status(status_path, base_payload, status, progress if progress is not None else 0, patch)
        return
    try:
        with open(status_path, "r", encoding="utf-8-sig") as file:
            current = json.load(file)
        current["logs"] = list(logs)
        if current.get("output"):
            current["output"]["logs"] = list(logs)
        write_status(status_path, current)
    except Exception:
        pass


def update_status(status_path, base_payload, status, progress, extra=None):
    payload = {
        **base_payload,
        "status": status,
        "progress": progress,
        "updatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z"
    }
    if extra:
        payload.update(extra)
    write_status(status_path, payload)


def detect_worker_device():
    try:
        import torch
        if torch.cuda.is_available():
            return {
                "device": "cuda",
                "cuda": True,
                "gpu": torch.cuda.get_device_name(0),
            }
    except Exception:
        pass
    return {
        "device": "cpu",
        "cuda": False,
        "gpu": "",
    }


def memory_snapshot():
    ram = {"used_mb": 0, "available_mb": 0, "total_mb": 0, "percent": 0}
    vram = {"used_mb": 0, "free_mb": 0, "total_mb": 0, "gpu": ""}
    disk = {"read_mb": 0, "write_mb": 0}
    try:
        import psutil
        mem = psutil.virtual_memory()
        ram = {
            "used_mb": int(mem.used / 1024 / 1024),
            "available_mb": int(mem.available / 1024 / 1024),
            "total_mb": int(mem.total / 1024 / 1024),
            "percent": float(mem.percent),
        }
        io = psutil.disk_io_counters()
        disk = {
            "read_mb": int(getattr(io, "read_bytes", 0) / 1024 / 1024),
            "write_mb": int(getattr(io, "write_bytes", 0) / 1024 / 1024),
        }
    except Exception:
        pass
    try:
        import torch
        if torch.cuda.is_available():
            free, total = torch.cuda.mem_get_info()
            vram = {
                "used_mb": int((total - free) / 1024 / 1024),
                "free_mb": int(free / 1024 / 1024),
                "total_mb": int(total / 1024 / 1024),
                "gpu": torch.cuda.get_device_name(0),
            }
    except Exception:
        pass
    return {"ram": ram, "vram": vram, "disk": disk}


def format_mem_log(label):
    snap = memory_snapshot()
    ram = snap["ram"]
    vram = snap["vram"]
    disk = snap["disk"]
    return (
        f"[WAN][MEM][{label}] RAM used={ram['used_mb']}MB available={ram['available_mb']}MB "
        f"total={ram['total_mb']}MB percent={ram['percent']}% "
        f"VRAM used={vram['used_mb']}MB free={vram['free_mb']}MB total={vram['total_mb']}MB gpu={vram['gpu'] or '-'} "
        f"DISK read={disk['read_mb']}MB write={disk['write_mb']}MB"
    )


def require_cuda_for_real_video():
    allow_cpu = str(os.environ.get("VIDEO_WAN_ALLOW_CPU_FALLBACK", "")).strip().lower() in {"1", "true", "yes", "on"}
    info = detect_worker_device()
    if not info["cuda"] and not allow_cpu:
        raise WanEngineError("WAN_CUDA_NOT_AVAILABLE: geracao Wan2.2 requer CUDA. CPU fallback desativado.")
    return info


def validate_worker_model_path(payload):
    model_path = str(payload.get("modelPath") or "").strip()
    if not model_path:
        raise WanEngineError("Modelo de video nao informado ao worker.")
    if not os.path.exists(model_path):
        raise WanEngineError(f"Modelo de video nao encontrado: {model_path}")
    return model_path


def create_prompt_slate(image_path, prompt, width, height):
    image = Image.new("RGB", (width, height), (17, 24, 39))
    draw = ImageDraw.Draw(image)
    title_font = ImageFont.load_default()
    body_font = ImageFont.load_default()

    title = "KIT Video Engine"
    prompt_text = prompt.strip() or "Video placeholder"
    wrapped = textwrap.wrap(prompt_text, width=42)[:8]

    draw.rectangle((36, 36, width - 36, height - 36), outline=(96, 165, 250), width=3)
    draw.text((54, 62), title, fill=(243, 244, 246), font=title_font)

    y = 120
    for line in wrapped:
      draw.text((54, y), line, fill=(191, 199, 210), font=body_font)
      y += 24

    image.save(image_path)


def detect_source_strategy(payload):
    pipeline = payload.get("pipeline") or {}
    strategy = pipeline.get("sourceStrategy") or ""
    if strategy:
        return strategy
    if payload.get("mode") == "i2v" and payload.get("startImage"):
        return "start-image"
    return "prompt-slate"


def ensure_source_image(payload, working_dir):
    image_path = payload.get("startImage") or payload.get("imagePath") or ""
    source_strategy = detect_source_strategy(payload)
    if source_strategy == "start-image" and image_path and os.path.exists(image_path):
        return image_path

    generated = os.path.join(working_dir, f"video-source-{uuid.uuid4().hex[:8]}.png")
    create_prompt_slate(
        generated,
        payload.get("prompt", ""),
        int(payload.get("width", 720) or 720),
        int(payload.get("height", 1280) or 1280)
    )
    return generated


def build_output_metadata(payload, source_image):
    conditioning = payload.get("conditioning") or {}
    pipeline = payload.get("pipeline") or {}
    summary_logs = list(payload.get("summaryLogs") or [])
    summary_logs.append(f"worker-source:{detect_source_strategy(payload)}")
    return {
        "mode": payload.get("mode") or "t2v",
        "pipeline": pipeline,
        "prompt": payload.get("prompt") or "",
        "negativePrompt": payload.get("negativePrompt") or "",
        "motionPrompt": payload.get("motionPrompt") or "",
        "ratio": payload.get("ratio") or "",
        "width": int(payload.get("width", 720) or 720),
        "height": int(payload.get("height", 1280) or 1280),
        "duration": int(payload.get("duration", 5) or 5),
        "fps": int(payload.get("fps", 16) or 16),
        "frames": int(payload.get("frames", 0) or 0),
        "sequenceLength": int(payload.get("sequenceLength", 0) or 0),
        "model": payload.get("model") or "",
        "modelPath": payload.get("modelPath") or "",
        "modelFamily": payload.get("modelFamily") or "",
        "preset": payload.get("preset") or payload.get("quality") or "standard",
        "quality": payload.get("quality") or "standard",
        "seed": int(payload.get("seed", -1) or -1),
        "steps": int(payload.get("steps", 4) or 4),
        "cfg": float(payload.get("cfg", payload.get("cfgScale", 1.5)) or 1.5),
        "sampler": payload.get("sampler") or "",
        "scheduler": payload.get("scheduler") or "",
        "denoise": float(payload.get("denoise", 0.7) or 0.7),
        "motionStrength": float(payload.get("motionStrength", 0.5) or 0.5),
        "imageStrength": float(payload.get("imageStrength", 0.65) or 0.65),
        "startImage": payload.get("startImage") or "",
        "endImage": payload.get("endImage") or "",
        "sourceImage": source_image or "",
        "references": conditioning.get("references") or payload.get("references") or [],
        "loras": conditioning.get("loras") or [],
        "logs": summary_logs,
        "exportSettings": payload.get("exportSettings") or {}
    }


def run_ffmpeg(source_image, output_video, duration, fps, width, height):
    command = [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        source_image,
        "-t",
        str(duration),
        "-vf",
        f"scale={width}:{height},format=yuv420p",
        "-r",
        str(fps),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        output_video
    ]
    subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def save_last_generated_frame(output_video, last_frame_path):
    if not last_frame_path:
        last_frame_path = str(Path(output_video).with_name(f"{Path(output_video).stem}-last-frame.png"))
    frame_dir = Path(output_video).with_suffix("")
    if not frame_dir.exists():
        return ""
    frames = sorted(frame_dir.glob("frame_*.png"))
    if not frames:
        return ""
    target = Path(last_frame_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    Image.open(frames[-1]).save(target)
    return str(target)


def run_placeholder_pipeline(payload, status_path, base_payload, logs, working_dir):
    append_log(
        status_path,
        base_payload,
        logs,
        "[VIDEO_WORKER] VIDEO_PLACEHOLDER_MODE=true: gerando slate estatico de diagnostico.",
        "preparing",
        10
    )
    source_image = ensure_source_image(payload, working_dir)
    output_metadata = build_output_metadata(payload, source_image)
    output_metadata["logs"] = [*output_metadata.get("logs", []), *logs]

    update_status(status_path, base_payload, "loading_model", 22, {
        "logs": logs,
        "output": {
            "sourceImage": source_image,
            "metadata": output_metadata,
            "logs": output_metadata.get("logs") or []
        }
    })

    update_status(status_path, base_payload, "loading_model", 35, {"logs": logs})
    update_status(status_path, base_payload, "sampling", 58, {"logs": logs})
    update_status(status_path, base_payload, "decoding", 76, {"logs": logs})

    output_video = payload["outputPath"]
    Path(output_video).parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        source_image,
        output_video,
        int(payload.get("duration", 5) or 5),
        int(payload.get("fps", 16) or 16),
        int(payload.get("width", 720) or 720),
        int(payload.get("height", 1280) or 1280)
    )

    thumbnail_path = payload.get("thumbnailPath") or ""
    if thumbnail_path:
        Path(thumbnail_path).parent.mkdir(parents=True, exist_ok=True)
        Image.open(source_image).save(thumbnail_path)
    last_frame_path = payload.get("lastFramePath") or str(Path(output_video).with_name(f"{Path(output_video).stem}-last-frame.png"))
    Path(last_frame_path).parent.mkdir(parents=True, exist_ok=True)
    Image.open(source_image).save(last_frame_path)
    output_metadata["lastFramePath"] = last_frame_path

    return output_video, thumbnail_path, source_image, output_metadata


def run_real_pipeline(payload, status_path, base_payload, logs):
    source_image = payload.get("startImage") or ""
    output_metadata = build_output_metadata(payload, source_image)

    phase_state = {"phase": "loading_model", "progress": 15}

    def logger(message):
        text = str(message or "")
        lower = text.lower()
        step_match = re.search(r"\[wan\]\[progress\]\s+(?:sample_step|step)\s+(\d+)\s*/\s*(\d+)", text, re.IGNORECASE)
        if "[wan][generate]" in lower or "phase_sample" in lower:
            phase_state["phase"] = "sampling"
            phase_state["progress"] = max(phase_state["progress"], 45)
        if step_match:
            current_step = int(step_match.group(1))
            total_steps = max(1, int(step_match.group(2)))
            ratio = max(0.0, min(1.0, current_step / total_steps))
            phase_state["phase"] = "sampling"
            phase_state["progress"] = max(45, min(74, int(45 + ratio * 29)))
        elif "phase_decode" in lower or "after_sample" in lower:
            phase_state["phase"] = "decoding"
            phase_state["progress"] = max(phase_state["progress"], 75)
        elif "encode_mp4" in lower or "after_decode" in lower:
            phase_state["phase"] = "saving"
            phase_state["progress"] = max(phase_state["progress"], 88)
        append_log(status_path, base_payload, logs, message)
        if phase_state["phase"] in {"sampling", "decoding", "saving"}:
            update_status(status_path, base_payload, phase_state["phase"], phase_state["progress"], {"logs": logs})

    logger("[VideoWorker] iniciado")
    model_path = str(payload.get("modelPath") or "").strip()
    logger(f"[VideoWorker] modelo selecionado: {payload.get('model') or (Path(model_path).name if model_path else '')}")
    logger(f"[VideoWorker] modo: {'img2video' if payload.get('mode') == 'i2v' else 'txt2video'}")
    device_info = detect_worker_device()
    logger(f"[VideoWorker] device: {device_info['device'].upper()} {device_info['gpu']}".strip())
    logger(f"[VideoWorker] caminho do modelo GGUF: {model_path if model_path.lower().endswith('.gguf') else ''}")
    if wan_audit_only_enabled():
        logger("[WAN][AUDIT_ONLY] pulando bloqueio de CUDA do worker para auditar o runtime efetivo.")
    else:
        require_cuda_for_real_video()
    model_path = validate_worker_model_path(payload)
    logger("[VideoWorker] carregando modelo")
    if device_info["cuda"]:
        logger("[VideoWorker] usando CUDA")
    logger(f"[VIDEO_WORKER] Python runtime: {sys.executable}")
    logger(format_mem_log("before_load"))
    update_status(status_path, base_payload, "loading_model", 15, {
        "logs": logs,
        "output": {
            "sourceImage": source_image,
            "metadata": output_metadata,
            "logs": logs
        }
    })
    result = run_wan_inference(payload, logger)
    logger(format_mem_log("after_generate"))
    if result.get("device") == "audit-only":
        output_metadata["inference"] = {
            "engine": "native-wan",
            "device": "audit-only",
            "frameCount": result.get("frameCount"),
            "placeholder": False,
            "auditOnly": True
        }
        output_metadata["audit"] = result.get("audit") or {}
        output_metadata["logs"] = [*output_metadata.get("logs", []), *logs]
        return "", "", source_image, output_metadata
    update_status(status_path, base_payload, "decoding", 82, {"logs": logs})

    output_video = result["path"]
    thumbnail_path = payload.get("thumbnailPath") or ""
    if thumbnail_path:
        Path(thumbnail_path).parent.mkdir(parents=True, exist_ok=True)
        if source_image and os.path.exists(source_image):
            Image.open(source_image).save(thumbnail_path)
    logger("[WAN][PHASE] save_last_frame")
    last_frame_path = save_last_generated_frame(output_video, payload.get("lastFramePath") or "")
    logger(f"[WAN][PHASE] save_last_frame_done path={last_frame_path or ''}")

    output_metadata["inference"] = {
        "engine": "native-wan",
        "device": result.get("device"),
        "frameCount": result.get("frameCount"),
        "placeholder": False
    }
    if last_frame_path:
        output_metadata["lastFramePath"] = last_frame_path
    output_metadata["logs"] = [*output_metadata.get("logs", []), *logs]
    return output_video, thumbnail_path, source_image, output_metadata


def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: video_worker.py <payload_json> <status_json>")

    payload_path = sys.argv[1]
    status_path = sys.argv[2]

    with open(payload_path, "r", encoding="utf-8-sig") as file:
        payload = json.load(file)

    base_payload = {
        "id": payload.get("id"),
        "projectId": payload.get("projectId"),
        "sceneId": payload.get("sceneId"),
        "mode": payload.get("mode"),
        "input": payload,
        "output": None,
        "error": None
    }

    working_dir = payload.get("workingDir") or os.path.dirname(status_path)
    Path(working_dir).mkdir(parents=True, exist_ok=True)

    try:
        logs = []
        update_status(status_path, base_payload, "preparing_resources", 8, {"logs": logs})
        if placeholder_enabled():
            output_video, thumbnail_path, source_image, output_metadata = run_placeholder_pipeline(
                payload,
                status_path,
                base_payload,
                logs,
                working_dir
            )
        else:
            output_video, thumbnail_path, source_image, output_metadata = run_real_pipeline(
                payload,
                status_path,
                base_payload,
                logs
            )

        update_status(status_path, base_payload, "saving", 92, {
            "logs": logs,
            "output": {
                "path": output_video,
                "thumbnailPath": thumbnail_path,
                "sourceImage": source_image,
                "lastFramePath": output_metadata.get("lastFramePath") or payload.get("lastFramePath") or "",
                "metadata": output_metadata,
                "logs": output_metadata.get("logs") or []
            }
        })

        update_status(status_path, base_payload, "completed", 100, {
            "logs": logs,
            "output": {
                "path": output_video,
                "thumbnailPath": thumbnail_path,
                "sourceImage": source_image,
                "lastFramePath": output_metadata.get("lastFramePath") or payload.get("lastFramePath") or "",
                "duration": int(payload.get("duration", 5) or 5),
                "fps": int(payload.get("fps", 16) or 16),
                "frames": int(payload.get("frames", 0) or 0),
                "sequenceLength": int(payload.get("sequenceLength", 0) or 0),
                "width": int(payload.get("width", 720) or 720),
                "height": int(payload.get("height", 1280) or 1280),
                "ratio": payload.get("ratio") or "",
                "metadata": output_metadata,
                "logs": output_metadata.get("logs") or []
            }
        })
    except (WanEngineError, Exception) as exc:
        error_message = f"[ERROR] {type(exc).__name__}: {exc}"
        existing = []
        try:
            existing = safe.get("logs") if (safe := json.load(open(status_path, "r", encoding="utf-8-sig"))) else []
        except Exception:
            existing = []
        logs = [*(existing or []), error_message]
        print(error_message, flush=True)
        update_status(status_path, base_payload, "failed", 100, {
            "error": error_message,
            "logs": logs
        })
        raise


if __name__ == "__main__":
    main()
