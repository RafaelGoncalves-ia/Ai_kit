import importlib
import os
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from backend.runtimes.wan.loaders import WanModelLoader
from backend.runtimes.wan.memory import WanMemoryController
from backend.runtimes.wan.schedulers import WanScheduler


RUNTIME_ROOT = Path(__file__).resolve().parents[1]
LEGACY_ROOT = RUNTIME_ROOT / "legacy"


class WanEngineError(RuntimeError):
    pass


@dataclass
class WanExecutionContext:
    payload: dict
    logger: object
    runtime: str
    root: Path = RUNTIME_ROOT
    legacy_root: Path = LEGACY_ROOT
    ram_monitor: object = None


class WanRamMonitor:
    def __init__(self, logger, interval=5.0, sustained_seconds=30.0):
        self.logger = logger
        self.interval = interval
        self.sustained_seconds = sustained_seconds
        self.vram_warning_free_mb = int(os.environ.get("WAN_VRAM_WARNING_FREE_MB", "300") or 300)
        self.vram_safety_margin_mb = int(os.environ.get("WAN_VRAM_SAFETY_MARGIN_MB", "500") or 500)
        self.stop_event = threading.Event()
        self.thread = None
        self.high_since = None
        self.full_since = None
        self.low_vram_since = None
        self.low_vram_warned = False
        self.high_warned = False
        self.full_warned = False
        self.peak_percent = 0.0
        self.peak_used_mb = 0
        self.min_free_vram_mb = None
        self.phase = "startup"
        self.last_disk = None
        self.last_disk_at = None
        self.sample_start_vram_used = None
        self.vram_drop_warned = False

    def start(self):
        self.thread = threading.Thread(target=self._run, name="kit-wan-ram-monitor", daemon=True)
        self.thread.start()
        self.log_snapshot("monitor_start")
        return self

    def set_phase(self, phase):
        self.phase = phase
        if phase == "sample":
            self.sample_start_vram_used = self.vram_snapshot().get("used_mb", 0)
            self.vram_drop_warned = False
        self.log_snapshot(f"phase_{phase}")

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=5)
        self.log_snapshot("monitor_stop")
        self.logger(f"[WAN][RAM] peak used={self.peak_used_mb}MB percent={self.peak_percent:.1f}%")
        if self.min_free_vram_mb is not None:
            self.logger(
                f"[WAN][VRAM] min_free={self.min_free_vram_mb}MB "
                f"safety_margin={self.vram_safety_margin_mb}MB warning_below={self.vram_warning_free_mb}MB"
            )

    def snapshot(self):
        try:
            import psutil

            memory = psutil.virtual_memory()
            used_mb = int(memory.used / 1024 / 1024)
            total_mb = int(memory.total / 1024 / 1024)
            available_mb = int(memory.available / 1024 / 1024)
            percent = float(memory.percent)
            return {
                "used_mb": used_mb,
                "total_mb": total_mb,
                "available_mb": available_mb,
                "percent": percent,
            }
        except Exception as exc:
            return {
                "used_mb": 0,
                "total_mb": 0,
                "available_mb": 0,
                "percent": 0.0,
                "error": str(exc),
            }

    def log_snapshot(self, label):
        info = self.snapshot()
        vram = self.vram_snapshot()
        disk = self.disk_snapshot()
        self.logger(
            f"[WAN][RAM] {label} phase={self.phase} used={info['used_mb']}MB "
            f"available={info['available_mb']}MB total={info['total_mb']}MB percent={info['percent']:.1f}%"
        )
        self.logger(
            f"[WAN][VRAM] {label} phase={self.phase} used={vram['used_mb']}MB "
            f"free={vram['free_mb']}MB total={vram['total_mb']}MB gpu={vram['gpu'] or '-'}"
        )
        self.logger(
            f"[WAN][DISK] {label} phase={self.phase} read={disk['read_mb_s']:.1f}MB/s "
            f"write={disk['write_mb_s']:.1f}MB/s busy_hint={disk['busy_hint']}"
        )
        self.logger(
            f"[WAN][MEM][{label}] RAM used={info['used_mb']}MB available={info['available_mb']}MB "
            f"total={info['total_mb']}MB percent={info['percent']:.1f}% "
            f"VRAM used={vram['used_mb']}MB free={vram['free_mb']}MB total={vram['total_mb']}MB "
            f"DISK read={disk['read_mb_s']:.1f}MB/s write={disk['write_mb_s']:.1f}MB/s"
        )
        return info

    def vram_snapshot(self):
        try:
            import torch

            if torch.cuda.is_available():
                free, total = torch.cuda.mem_get_info()
                free_mb = int(free / 1024 / 1024)
                if self.min_free_vram_mb is None:
                    self.min_free_vram_mb = free_mb
                else:
                    self.min_free_vram_mb = min(self.min_free_vram_mb, free_mb)
                return {
                    "gpu": torch.cuda.get_device_name(0),
                    "total_mb": int(total / 1024 / 1024),
                    "free_mb": free_mb,
                    "used_mb": int((total - free) / 1024 / 1024),
                }
        except Exception:
            pass
        return {"gpu": "", "total_mb": 0, "free_mb": 0, "used_mb": 0}

    def disk_snapshot(self):
        try:
            import psutil

            now = time.monotonic()
            counters = psutil.disk_io_counters()
            if self.last_disk is None:
                self.last_disk = counters
                self.last_disk_at = now
                return {"read_mb_s": 0.0, "write_mb_s": 0.0, "busy_hint": "baseline"}
            elapsed = max(0.001, now - self.last_disk_at)
            read_mb_s = (counters.read_bytes - self.last_disk.read_bytes) / 1024 / 1024 / elapsed
            write_mb_s = (counters.write_bytes - self.last_disk.write_bytes) / 1024 / 1024 / elapsed
            busy_time = getattr(counters, "busy_time", 0) - getattr(self.last_disk, "busy_time", 0)
            busy_hint = f"{busy_time / elapsed / 10:.1f}%" if busy_time else "n/a"
            self.last_disk = counters
            self.last_disk_at = now
            return {"read_mb_s": read_mb_s, "write_mb_s": write_mb_s, "busy_hint": busy_hint}
        except Exception as exc:
            return {"read_mb_s": 0.0, "write_mb_s": 0.0, "busy_hint": f"unavailable:{exc}"}

    def _log_component_stack(self, reason):
        loaded = [name for name in sys.modules if name == "nodes" or name.startswith(("comfy", "backend.runtimes.wan.legacy.gguf_nodes"))]
        self.logger(f"[WAN][RAM][INVESTIGATE] reason={reason} phase={self.phase} modules={len(loaded)}")
        for name in sorted(loaded)[:80]:
            module = sys.modules.get(name)
            origin = getattr(module, "__file__", "") or ",".join(list(getattr(module, "__path__", []) or []))
            self.logger(f"[WAN][RAM][MODULE] {name} -> {origin}")
        try:
            import comfy.model_management as model_management

            current = getattr(model_management, "current_loaded_models", [])
            self.logger(f"[WAN][RAM][MODEL_MANAGEMENT] current_loaded_models={len(current)} vram_state={getattr(model_management, 'vram_state', None)}")
        except Exception as exc:
            self.logger(f"[WAN][RAM][MODEL_MANAGEMENT] unavailable={exc}")

    def _run(self):
        while not self.stop_event.wait(self.interval):
            info = self.snapshot()
            vram = self.vram_snapshot()
            free_vram = int(vram.get("free_mb") or 0)
            if vram.get("total_mb") and free_vram < self.vram_warning_free_mb:
                if self.low_vram_since is None:
                    self.low_vram_since = time.monotonic()
                elif not self.low_vram_warned and time.monotonic() - self.low_vram_since >= self.sustained_seconds:
                    self.low_vram_warned = True
                    self.logger(
                        f"[WAN][VRAM][WARN] VRAM livre abaixo de {self.vram_warning_free_mb}MB por "
                        f"{int(time.monotonic() - self.low_vram_since)}s; livre={free_vram}MB "
                        f"safety_margin={self.vram_safety_margin_mb}MB. Nao abortando, mas ha risco de OOM/offload lento."
                    )
            else:
                self.low_vram_since = None
            if self.phase == "sample" and self.sample_start_vram_used and not self.vram_drop_warned:
                now_vram = self.vram_snapshot().get("used_mb", 0)
                drop_mb = self.sample_start_vram_used - now_vram
                if drop_mb >= 1024 and now_vram <= max(1, int(self.sample_start_vram_used * 0.7)):
                    self.vram_drop_warned = True
                    self.logger(
                        f"[WAN][WARN] vram_drop_detected used_before={self.sample_start_vram_used}MB "
                        f"used_now={now_vram}MB possible_excessive_offload=true"
                    )
            percent = float(info.get("percent") or 0)
            self.peak_percent = max(self.peak_percent, percent)
            self.peak_used_mb = max(self.peak_used_mb, int(info.get("used_mb") or 0))
            now = time.monotonic()

            if percent >= 95:
                if self.high_since is None:
                    self.high_since = now
                    self.logger(f"[WAN][RAM][PEAK] phase={self.phase} percent={percent:.1f}% permitido como pico temporario.")
                elif not self.high_warned and now - self.high_since >= self.sustained_seconds:
                    self.high_warned = True
                    self.logger(
                        f"[WAN][RAM][WARN] RAM sustentada acima de 95% por {int(now - self.high_since)}s; "
                        "nao bloqueando, investigar retencao/cache e forcar cleanup apos geracao."
                    )
                    self._log_component_stack("ram_above_95_sustained")
            else:
                self.high_since = None

            if percent >= 99.5:
                if self.full_since is None:
                    self.full_since = now
                elif not self.full_warned and now - self.full_since >= 10:
                    self.full_warned = True
                    self.logger(
                        f"[WAN][RAM][ANOMALY] RAM em ~100% sustentada durante {self.phase}; "
                        "verificar duplicacao de modelo/CLIP/VAE e offload/unload."
                    )
                    self._log_component_stack("ram_100_sustained")
            else:
                self.full_since = None


class WanSampler:
    def __init__(self, context):
        self.context = context

    def run(self):
        runtime = self.context.runtime
        if runtime in {"kit_wan_legacy", "comfy_gguf"}:
            return _run_kit_wan_legacy(self.context)
        if runtime == "diffusers":
            return _run_diffusers_bridge(self.context)
        raise WanEngineError(
            f"WAN_RUNTIME_UNSUPPORTED: VIDEO_WAN_RUNTIME={runtime}. Use kit_wan_legacy, comfy_gguf ou diffusers."
        )


def optional_import(module_name):
    try:
        return importlib.import_module(module_name)
    except Exception:
        return None


def cuda_available():
    torch = optional_import("torch")
    return bool(torch and torch.cuda.is_available())


def assert_no_external_comfy_path():
    external = []
    runtime_root = str(RUNTIME_ROOT.resolve()).lower()
    for item in sys.path:
        text = str(item or "")
        lower = text.lower()
        if "comfyui" in lower and not lower.startswith(runtime_root):
            external.append(text)
    if external:
        raise WanEngineError("WAN_EXTERNAL_COMFY_PATH_DETECTED: " + "; ".join(external[:3]))


def assert_legacy_layout(logger):
    required_dirs = [
        LEGACY_ROOT / "comfy_core",
        LEGACY_ROOT / "gguf_nodes",
        LEGACY_ROOT / "extra_nodes",
    ]
    for item in required_dirs:
        if not item.exists():
            raise WanEngineError(f"WAN_LEGACY_RUNTIME_INCOMPLETE: diretorio ausente {item}")
    logger(f"[WAN][RUNTIME] legacy root: {LEGACY_ROOT}")


def _run_kit_wan_legacy(context):
    assert_legacy_layout(context.logger)
    assert_no_external_comfy_path()
    from .legacy_comfy import cleanup_comfy, run_comfy_gguf_wan

    try:
        return run_comfy_gguf_wan(context.payload, context.logger, context.ram_monitor)
    finally:
        cleanup_comfy(context.logger)


def _run_diffusers_bridge(context):
    from .legacy_diffusers import run_diffusers_wan

    return run_diffusers_wan(context.payload, context.logger)


def run_wan_inference(payload, logger):
    runtime = os.environ.get("VIDEO_WAN_RUNTIME", "comfy_gguf").strip().lower() or "comfy_gguf"
    if runtime == "comfy_gguf":
        runtime = "kit_wan_legacy"

    context = WanExecutionContext(
        payload=payload,
        logger=logger,
        runtime=runtime,
    )
    ram_monitor = WanRamMonitor(logger).start()
    context.ram_monitor = ram_monitor
    memory = WanMemoryController(logger)
    loader = WanModelLoader(payload, logger)
    scheduler = WanScheduler(
        payload.get("sampler") or "euler_ancestral",
        payload.get("scheduler") or "beta",
        payload.get("shift") or payload.get("modelShift") or 8,
    )

    logger("[VIDEO_WORKER] Iniciando inferencia real Wan2.2.")
    logger(f"[WAN][RUNTIME] {runtime}")
    logger(f"[WAN][PYTHON] {sys.executable}")
    loader.validate_model_path()
    schedule = scheduler.to_dict()
    logger(
        f"[WAN][SCHEDULER] sampler={schedule['sampler']} scheduler={schedule['scheduler']} shift={schedule['shift']}"
    )
    if str(os.environ.get("WAN_AUDIT_ONLY", "")).strip().lower() in {"1", "true", "yes", "on"}:
        if runtime not in {"kit_wan_legacy", "comfy_gguf"}:
            raise WanEngineError("WAN_AUDIT_ONLY atualmente cobre o runtime Comfy/GGUF interno.")
        from .legacy_comfy import run_wan_parity_audit

        try:
            result = run_wan_parity_audit(payload, logger)
            logger("[WAN][AUDIT_ONLY] concluido sem gerar video.")
            return {
                "path": str(payload.get("outputPath") or ""),
                "frameCount": int(payload.get("sequenceLength") or payload.get("frames") or 0),
                "device": "audit-only",
                "seed": int(payload.get("seed") if payload.get("seed") is not None else -1),
                "audit": result,
            }
        finally:
            ram_monitor.set_phase("audit_cleanup")
            memory.cleanup()
            ram_monitor.stop()
    ram_monitor.log_snapshot("before_load")
    memory.log_vram("before_load")
    try:
        ram_monitor.set_phase("load_generate")
        result = WanSampler(context).run()
        memory.log_vram("after_generate")
        return result
    finally:
        ram_monitor.set_phase("cleanup")
        memory.cleanup()
        ram_monitor.stop()
