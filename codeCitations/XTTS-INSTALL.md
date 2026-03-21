# Instalação XTTS para Ai-Kit

## Pré-requisitos
- Python 3.8+ (recomendado 3.10)
- Git
- Espaço em disco: ~5GB para modelos

## Instalação Passo a Passo

### 1. Baixar XTTS
```bash
# Criar diretório
mkdir C:\GitHub
cd C:\GitHub

# Clonar repositório (ou baixar zip)
git clone https://github.com/coqui-ai/TTS.git XTTS
cd XTTS
```

### 2. Criar Ambiente Virtual
```bash
# Criar venv
python -m venv venv

# Ativar venv
venv\Scripts\activate
```

### 3. Instalar Dependências
```bash
# Instalar PyTorch (versão compatível)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Instalar TTS e dependências
pip install TTS simpleaudio

# Verificar instalação
python -c "import TTS; print('XTTS instalado com sucesso!')"
```

### 4. Configurar Ai-Kit
Edite `xtts-config.txt` no diretório do Ai-Kit:
```
XTTS_VENV=C:\GitHub\XTTS\venv
XTTS_PORT=5005
XTTS_PYTHON=python
```

### 5. Testar
```bash
# No diretório do Ai-Kit
start-xtts.bat
```

O servidor deve iniciar e mostrar "XTTS server ready" no console.

## Solução de Problemas

### Erro: "CUDA out of memory"
- Use CPU: `set CUDA_VISIBLE_DEVICES=""` antes de iniciar

### Erro: "TTS not found"
- Verifique se o venv está ativado
- Reinstale: `pip install --upgrade TTS`

### Porta ocupada
- Mude a porta em `xtts-config.txt`
- Ou use `stop-xtts.bat` para parar processos existentes

## Modelos Disponíveis
XTTS suporta múltiplos idiomas e vozes. Configure no código do servidor conforme necessário.