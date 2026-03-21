# Guia para Criar Skills Customizadas - AI Kit

Este guia explica como criar suas próprias skills para o AI Kit, permitindo estender as funcionalidades do sistema.

## Estrutura de uma Skill

Cada skill é um diretório dentro de `backend/skills/` com a seguinte estrutura:

```
backend/skills/
├── base/
│   └── minhaSkill/
│       ├── index.js          # Arquivo principal da skill
│       ├── config.html       # (Opcional) Interface de configuração
│       └── README.md         # (Opcional) Documentação
```

## Arquivo index.js

O arquivo principal deve exportar um objeto com as seguintes propriedades:

```javascript
export default {
    name: "Minha Skill",                    // Nome da skill
    description: "Descrição do que faz",    // Descrição
    version: "1.0.0",                       // Versão
    active: true,                           // Se inicia ativa
    configPath: "./config.html",            // Caminho para config (opcional)

    settings: {                             // Configurações padrão
        opcao1: true,
        opcao2: "valor"
    },

    init(context) {                         // Chamado ao inicializar
        console.log("Skill inicializada!");
    },

    // Hooks opcionais
    onUserInput(context, input) {           // Quando usuário fala
        // Lógica aqui
    },

    onAIResponse(context, response) {       // Após resposta da IA
        // Lógica aqui
    },

    execute(context, input) {               // Execução manual
        // Lógica principal
    }
}
```

## Registrando a Skill

1. **Adicionar ao registry**: Edite `backend/skills/registry.js` e adicione o caminho:
   ```javascript
   export default [
     // ... outras skills
     "base/minhaSkill"
   ]
   ```

2. **Adicionar à configuração**: Edite `backend/config/skills.json`:
   ```json
   {
     "base/minhaSkill": false
   }
   ```

3. **Criar interface de configuração** (opcional): Crie `config.html` no diretório da skill.

## Exemplo Completo

Veja `backend/skills/base/sampleSkill/` para um exemplo funcional.

## Hooks Disponíveis

- `init(context)`: Chamado na inicialização
- `onUserInput(context, input)`: Quando o usuário envia uma mensagem
- `onAIResponse(context, response)`: Após a IA responder
- `execute(context, input)`: Para execução manual via API

## Context Object

O `context` fornece acesso a:
- `context.services.ai`: Serviço de IA
- `context.services.tts`: Serviço de TTS
- `context.core.skillManager`: Gerenciador de skills
- `context.config`: Configurações globais

## Dicas

- Use `console.log()` para debug
- Skills podem ser ativadas/desativadas dinamicamente
- Interfaces de configuração são abertas em popups
- Mantenha skills modulares e reutilizáveis

## Distribuição

Para distribuir skills:
1. Compacte o diretório da skill
2. Forneça instruções de instalação
3. Outros usuários podem adicionar ao registry e config