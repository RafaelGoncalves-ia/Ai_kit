import json
import os
import subprocess
import sys
import textwrap
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


STATUS_SEQUENCE = [
    "preparing",
    "loading_model",
    "encoding",
    "generating",
    "decoding",
    "combining"
]


def write_status(status_path, payload):
    Path(status_path).parent.mkdir(parents=True, exist_ok=True)
    with open(status_path, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)


def update_status(status_path, base_payload, status, progress, extra=None):
    payload = {
        **base_payload,
        "status": status,
        "progress": progress
    }
    if extra:
        payload.update(extra)
    write_status(status_path, payload)


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


def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: video_worker.py <payload_json> <status_json>")

    payload_path = sys.argv[1]
    status_path = sys.argv[2]

    with open(payload_path, "r", encoding="utf-8") as file:
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
        update_status(status_path, base_payload, "preparing", 10)
        source_image = ensure_source_image(payload, working_dir)
        output_metadata = build_output_metadata(payload, source_image)

        update_status(status_path, base_payload, "loading_model", 22, {
            "output": {
                "sourceImage": source_image,
                "metadata": output_metadata,
                "logs": output_metadata.get("logs") or []
            }
        })

        update_status(status_path, base_payload, "encoding", 35)
        update_status(status_path, base_payload, "generating", 58)
        update_status(status_path, base_payload, "decoding", 76)

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

        update_status(status_path, base_payload, "combining", 92, {
            "output": {
                "path": output_video,
                "thumbnailPath": thumbnail_path,
                "sourceImage": source_image,
                "metadata": output_metadata,
                "logs": output_metadata.get("logs") or []
            }
        })

        update_status(status_path, base_payload, "completed", 100, {
            "output": {
                "path": output_video,
                "thumbnailPath": thumbnail_path,
                "sourceImage": source_image,
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
    except Exception as exc:
        update_status(status_path, base_payload, "failed", 100, {
            "error": str(exc)
        })
        raise


if __name__ == "__main__":
    main()
