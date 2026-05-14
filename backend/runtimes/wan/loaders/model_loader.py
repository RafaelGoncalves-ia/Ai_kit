from pathlib import Path


class WanModelLoader:
    def __init__(self, payload=None, logger=None):
        self.payload = payload or {}
        self.logger = logger or (lambda _message: None)

    def validate_model_path(self):
        model_path = Path(self.payload.get("modelPath") or "")
        if not str(model_path):
            raise RuntimeError("Nenhum modelo Wan foi selecionado.")
        if not model_path.exists():
            raise RuntimeError(f"Modelo Wan nao encontrado: {model_path}")
        if model_path.is_file() and model_path.suffix.lower() not in {".gguf", ".safetensors", ".json"}:
            raise RuntimeError(f"Formato de modelo Wan nao suportado: {model_path.suffix}")
        self.logger(f"[WAN][MODEL] modelo validado: {model_path.name}")
        return model_path
