# Ai_kit
Kit IA é um assistente baseado em Skills, modular e extensível, com suporte a IA via Ollama e TTS local (XTTS opcional).   O objetivo é criar um assistente que converse, execute Skills e interaja com o usuário de forma divertida e personalizada.

## Configuração XTTS (Opcional)

Para usar voz natural com XTTS em vez do TTS do Windows:

### Instalação Detalhada
Veja `XTTS-INSTALL.md` para instruções completas de instalação.

### Configuração Rápida
1. Instale XTTS em `C:\GitHub\XTTS\venv`
2. Configure `xtts-config.txt` se necessário
3. Use `start-xtts.bat` para iniciar o servidor

### Controle do Servidor
- `start-xtts.bat` - Inicia o servidor XTTS
- `stop-xtts.bat` - Para o servidor XTTS

### Verificação
O Ai-Kit detecta automaticamente se XTTS está rodando e usa voz natural. Caso contrário, usa TTS do Windows.

## Uso

Execute `AiKit-inicio.bat` para iniciar o sistema completo.
