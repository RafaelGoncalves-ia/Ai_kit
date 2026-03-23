Guia para Criar Skills Customizadas - AI Kit

Este guia explica como criar skills para o AI Kit com base na arquitetura atual (Services + Core + Skills), incluindo suporte a memória, visão e voz.

🧩 Estrutura de uma Skill

Cada skill deve ser criada dentro de:

backend/skills/
├── base/
│   └── minhaSkill/
│       ├── index.js          # Arquivo principal da skill
│       ├── config.html       # (Opcional) Interface de configuração
│       └── README.md         # (Opcional) Documentação
📦 Arquivo index.js

A skill deve exportar um objeto padrão:

export default {
    name: "Minha Skill",
    description: "Descrição do que faz",
    version: "1.0.0",
    active: true,
    configPath: "./config.html",

    settings: {
        enabled: true
    },

    init(context) {
        console.log("Skill inicializada!");
    },

    onUserInput(context, input) {
        // Intercepta entrada do usuário
    },

    onAIResponse(context, response) {
        // Intercepta resposta da IA
    },

    async execute(context, input) {
        // Execução manual (API ou trigger)
    }
}
⚙️ Context (IMPORTANTE)

O context é o núcleo da integração.

Serviços disponíveis:
context.services.ai        // IA (Ollama)
context.services.tts       // TTS (auto fallback XTTS → sistema)
context.services.system    // Sistema (execuções locais)
context.services.vision    // Captura de tela (se implementado)
Core:
context.core.skillManager
context.core.brain
Config:
context.config
🧠 Memória (Nova funcionalidade)

A memória é gerenciada fora das skills, mas pode ser usada dentro delas.

Uso:
import { saveMemory, getMemoryContext } from "../../core/memory/memoryManager.js";

// salvar
saveMemory("Usuário gosta de azul");

// ler
const memory = getMemoryContext();

👉 Use com moderação (evitar spam de memória).

👁️ Visão (Screen Analysis)

Se sua skill precisar analisar a tela:

const img = await context.services.vision.captureScreen();

Exemplo de uso:

const response = await context.services.ai.chat({
    text: "O que você vê?",
    images: [img]
});
🔊 Voz (TTS + XTTS automático)

Sempre use:

await context.services.tts.speak("Mensagem aqui");

👉 O sistema automaticamente:

usa XTTS se estiver ativo
fallback para TTS do sistema
🧠 Boas práticas (CRÍTICO)
✔️ 1. Skill NÃO deve:
chamar API direto do Ollama
implementar lógica de TTS
duplicar lógica de visão

👉 Use sempre context.services

✔️ 2. Skill deve:
decidir quando agir
não como executar
✔️ 3. Evite bloquear fluxo

Errado:

await context.services.tts.speak("..."); // trava fluxo

Melhor:

context.services.tts.speak("...");
🔁 Fluxo de execução
Usuário → commandEngine → skillManager → Skills → Services → IA
🧪 Exemplo real (Skill de visão)
export default {
    name: "Vision Helper",
    active: true,

    async onUserInput(context, input) {
        if (input.toLowerCase().includes("olha")) {
            
            context.services.tts.speak("Deixa eu ver isso 👀");

            const img = await context.services.vision.captureScreen();

            const res = await context.services.ai.chat({
                text: "Descreva essa tela",
                images: [img]
            });

            return res;
        }
    }
}
🧾 Registrando a Skill
1. Registry
// backend/skills/registry.js

export default [
  "base/minhaSkill"
]
2. Config
// backend/config/skills.json

{
  "base/minhaSkill": true
}
🎛️ Interface (Opcional)

Crie:

config.html

👉 aberta via frontend para configurar a skill.

🚀 Boas ideias de Skills
🎭 Personalidade (humor/ironia)
🧠 Memória personalizada
👁️ Assistente de tela
🎮 Interação com stream
🔔 Reações automáticas