# TTS-Queue Skill

Gerenciador de fila sequencial de TTS (Text-to-Speech) para a rota curta do AI-kit.

## 📝 Visão Geral

A skill `tts-queue` é responsável por:

- **Enfileirar** textos completos para processamento de áudio
- **Dividir** textos de forma inteligente em chunks
- **Processar** chunks sequencialmente (um por vez)
- **Cancelar** fila quando necessário
- **Emitir** eventos de status

## 🎯 Escopo

- **Rota Curta** (Quick Response): ✅ Usa TTS automático via fila
- **Rota Longa** (Long Tasks): ❌ Sem TTS automático

## 🚀 Uso

### Instalação

A skill é carregada automaticamente pelo SkillManager.

### Interface Pública

#### 1. Enfileirar Texto

```javascript
const ttsQueueSkill = context.core.skillManager.get("tts-queue");

const result = await ttsQueueSkill.enqueueText(
  "Texto para processar",
  priority = 0  // Opcional, default: 0
);

// Resultado:
// {
//   queued: true,
//   queueId: "1234567-abc123",
//   chunkCount: 3
// }
```

#### 2. Cancelar Fila

```javascript
const result = await ttsQueueSkill.cancelQueue();

// Resultado:
// {
//   cancelled: true,
//   itemsRemoved: 5
// }
```

#### 3. Consultar Status

```javascript
const status = ttsQueueSkill.getQueueStatus();

// Resultado:
// {
//   isProcessing: true,
//   queueLength: 2,
//   queue: [
//     { queueId, index, total, textPreview },
//     ...
//   ]
// }
```

#### 4. Verificar se Está Ocupado

```javascript
const busy = ttsQueueSkill.isBusy();
// boolean: true se processando ou há items na fila
```

## 🔧 Algoritmo de Divisão

### Prioridade

1. **Frases** (`.` `!` `?`) - Máxima
2. **Vírgulas** (`,`) - Segunda
3. **Espaços** - Terceira
4. **Limite de tamanho** (180 chars) - Mínimo

### Exemplos

```
Input: "Olá! Tudo bem? Estou aqui."
Output: ["Olá!", "Tudo bem?", "Estou aqui."]

Input: "Este é longo, com vírgulas, que quebra, conforme necessário."
Output: [
  "Este é longo,",
  "com vírgulas,",
  "que quebra,",
  "conforme necessário."
]

Input: "Um texto absurdamente longo que ultrapassa o limite de 180 caracteres e que por isso será dividido em múltiplos pedaços por espaço..."
Output: [
  "Um texto absurdamente longo que ultrapassa o limite de 180 caracteres",
  "e que por isso será dividido em múltiplos pedaços por espaço..."
]
```

## 📡 Eventos

A skill emite eventos via `eventBus`:

### `tts:enqueued`

Quando texto é enfileirado com sucesso.

```javascript
{
  queueId: "1234567-abc123",
  chunkCount: 3,
  totalInQueue: 5
}
```

### `tts:processing`

Quando inicia o processamento de um chunk.

```javascript
{
  queueId: "1234567-abc123",
  index: 0,      // 0-based
  total: 3,      // Total de chunks
  text: "Olá!"
}
```

### `tts:chunk-completed`

Quando um chunk é processado com sucesso.

```javascript
{
  queueId: "1234567-abc123",
  index: 0,
  total: 3
}
```

### `tts:chunk-error`

Quando há erro ao processar um chunk.

```javascript
{
  queueId: "1234567-abc123",
  index: 1,
  error: "Erro: servidor TTS indisponível"
}
```

### `tts:cancelled`

Quando a fila é cancelada.

```javascript
{
  itemsRemoved: 5,
  timestamp: 1702341234567
}
```

### `tts:completed`

Quando toda a fila é processada.

```javascript
{
  timestamp: 1702341234567
}
```

## 🎧 Ouvindo Eventos

```javascript
const eventBus = context.core.eventBus;

// Estado da fila mudou
eventBus.on('tts:enqueued', (data) => {
  console.log(`${data.chunkCount} chunks adicionados`);
});

// Processando chunk específico
eventBus.on('tts:processing', (data) => {
  console.log(`Tocando: ${data.text}`);
});

// Fila foram concluída
eventBus.on('tts:completed', () => {
  console.log('Áudio concluído!');
});

// Fila foi cancelada
eventBus.on('tts:cancelled', (data) => {
  console.log(`${data.itemsRemoved} items removidos`);
});
```

## 🔄 Fluxo Integrado

### No ResponseQueue

```javascript
// ResponseQueue.js

function enqueueToTTSQueue(text, priority = 0) {
  const ttsQueueSkill = context.core.skillManager.get("tts-queue");
  
  if (!ttsQueueSkill) return;
  
  const result = ttsQueueSkill.enqueueText(text, priority);
  
  if (result.queued) {
    console.log(`✅ ${result.chunkCount} chunks enfileirados`);
  }
}
```

### No Orchestrator

```javascript
// Orchestrator.js

// Cancelar fila ao receber nova mensagem
async function handle({ input, source = "user" }) {
  if (source === "user") {
    context.core.responseQueue.cancelTTS?.();
  }
  // ...
}
```

## ⚙️ Configuração

Nenhuma configuração necessária - a skill usa padrões internos otimizados:

- **maxChars**: 180 caracteres por chunk
- **processamento**: Sequencial (1 chunk por vez)
- **prioridade**: Default 0 (FIFO)

Para customizar, modifique em `backend/skills/tts-queue/index.js`:

```javascript
// Mudar tamanho máximo de chunk
_splitText(text, maxChars = 200)  // de 180 para 200

// Ou no ResponseQueue ao enfileirar:
ttsQueueSkill.enqueueText(text, priority = 10)  // Alta prioridade
```

## 🧪 Testes

Execute o script de validação:

```bash
node backend/scripts/validate-tts-refactoring.js
```

Ou integrado no servidor:

```javascript
import validateTTSRefactoring from "./scripts/validate-tts-refactoring.js";

await validateTTSRefactoring(context);
```

## 🐛 Troubleshooting

### Skill não carregada

```
[ERROR] Skill não encontrada: tts-queue
```

**Solução**: Certifique-se de que o arquivo `backend/skills/tts-queue/index.js` existe e exporta skill padrão.

### Serviço TTS não disponível

```
[WARN] Serviço TTS não disponível
```

**Solução**: Verifique se `context.services.tts` está inicializado. XTTS pode estar desligado.

### Fila trava

Se a fila não avança:

```javascript
// Verificar estado
const status = ttsQueueSkill.getQueueStatus();
console.log(status);

// Cancelar e limpar
ttsQueueSkill.cancelQueue();
```

## 📊 Performance

- **Latência de processamento**:  ~50-200ms por chunk
- **Memória por chunk**: Minimal (apenas strings)
- **CPU**: Baixo (delegado ao serviço TTS)

## 🔮 Futuras Melhorias

- [ ] Pausa e resumo de fila
- [ ] Priorização dinâmica
- [ ] Múltiplas vozes por chunk
- [ ] Dashboard de fila em tempo real
- [ ] Análise de latência
- [ ] Cache de chunks processados

## 📚 Referências

- **ResponseQueue**: `backend/core/responseQueue.js`
- **Orchestrator**: `backend/core/orchestrator.js`
- **EventBus**: `backend/core/eventBus.js`
- **Serviço TTS**: `backend/services/tts.js`
