# Kit IA

Kit IA é um assistente baseado em Skills, modular e extensível, com suporte a IA via Ollama e TTS local (XTTS opcional).  
O objetivo é criar um assistente que converse, execute Skills e interaja com o usuário de forma divertida e personalizada.

---

## ⚙️ Dependências Externas

Para rodar o Kit IA, você precisa instalar alguns softwares fora do projeto:

1. **Node.js & NPM**
   - Site oficial: [https://nodejs.org](https://nodejs.org)
   - Verifique instalação:
     ```bash
     node -v
     npm -v
     ```

2. **Ollama**
   - Responsável por executar os modelos de IA.
   - Certifique-se de ter o servidor Ollama rodando local ou em rede.
   - O modelo recomendado para teste inicial:
     ```
     huihui_ai/qwen3-vl-abliterated:4b
     ```

3. **XTTS** (opcional)
   - Para suporte de fala em tempo real.
   - Pode ser habilitado via Skill `tts`.

---

## 📁 Estrutura do Projeto
kit-ia/
│
├── backend/
│ ├── core/ # Núcleo do sistema (brain, skillManager, commandEngine, scheduler)
│ ├── services/ # Serviços AI e TTS
│ ├── skills/ # Skills base e mestre
│ ├── routes/ # Endpoints (chat, etc)
│ ├── config/skills.json # Configuração de Skills
│ └── server.js # Servidor backend
│
├── frontend/
│ ├── index.html # Interface do usuário
│ ├── script.js # JS frontend
│ ├── style.css # CSS
│ └── assets/avatar/ # Imagens do avatar (idle, listening, talking, etc.)
│
├── package.json
└── README.md
---

## 💻 Instalação

1. Clone o repositório:
   ```bash
   git clone <URL_DO_REPO>
   cd kit-ia
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
