import gc


class WanMemoryController:
    def __init__(self, logger=None):
        self.logger = logger or (lambda _message: None)

    def vram_info(self):
        try:
            import torch

            if not torch.cuda.is_available():
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
        except Exception:
            return {
                "available": False,
                "gpu": "",
                "total_mb": 0,
                "free_mb": 0,
                "used_mb": 0,
            }

    def log_vram(self, label):
        info = self.vram_info()
        self.logger(
            f"[WAN][VRAM] {label}={info['used_mb']}MB free={info['free_mb']}MB total={info['total_mb']}MB"
        )
        return info

    def cleanup(self):
        gc.collect()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                try:
                    torch.cuda.ipc_collect()
                except Exception:
                    pass
                self.logger("[MODEL] Cache CUDA liberado.")
        except Exception as exc:
            self.logger(f"[MODEL] Aviso ao limpar cache CUDA: {exc}")
        self.log_vram("after_unload")
