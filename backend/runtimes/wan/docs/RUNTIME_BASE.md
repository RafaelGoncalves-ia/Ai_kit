# KIT Runtime Base

## Base utilizada

- ComfyUI commit: 123a7874a97c4a8b8f06d4b7c2b1a566b8f0d057
- ComfyUI-GGUF commit: local-tracking-no-git-2026-05-13
- KIT runtime version: 1.0.0
- KIT patches: fachada `kit_wan_legacy`, output MP4 interno, sem server/UI/websocket/queue daemon

## Dependências necessárias para rodar a KIT

### Node.js
- versão mínima: 20
- versão recomendada: 22 LTS

### Python
- versão mínima: 3.10
- versão recomendada: 3.11

### CUDA
- versão mínima: 12.1
- versão validada: 12.1

### PyTorch
- versão utilizada: build CUDA compatível com a GPU local

### xformers
- versão utilizada: opcional, compatível com o PyTorch instalado

### ffmpeg
- obrigatório para montar MP4 a partir dos frames gerados

### Ollama
- versão mínima recomendada: versão estável atual com `/api/chat`, `/api/generate` e `/api/ps`

### Stable Diffusion Runtime
- localização esperada dos modelos: `backend/config/stableDiffusionConfig.cjs` e variáveis `SD_*`
- formatos suportados: checkpoints/LoRAs aceitos pelo worker SD atual
- workers relacionados: `backend/services/sd_worker.py`, `backend/services/sdClient.js`

### Wan Runtime
- modelos suportados: Wan2.2 T2V/I2V GGUF compatível com ComfyUI-GGUF
- quantizações suportadas: GGUF Q3/Q4 e variantes compatíveis com o loader GGUF vendorado
- resolução recomendada: 512x512 para tiny/smoke, presets existentes para produção
- VRAM mínima validada: 12GB para RTX 3060 no perfil tiny/baixo steps
- RAM mínima validada: 16GB

### Hardware validado

RTX 3060 12GB  
16GB RAM  
Windows 10  
CUDA 12.1
