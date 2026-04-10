<!-- TTS_QUEUE_REFACTORING.md -->

# Refatoração Sistema de TTS - AI-kit

## 📋 Resumo Executivo

Implementação de fila sequencial de TTS **apenas na rota curta** (SSE), mantendo a rota longa (tasks) completamente independente e sem TTS automático.

### Objetivo Alcançado
- ✅ TTS fluido e responsivo na rota curta
- ✅ Fila sequencial (1 chunk por vez)
- ✅ Cancelamento automático ao receber nova mensagem
- ✅ Rota longa intacta e preparada para expansão
- ✅ Sem duplicação de lógica

---

## 🏗️ Arquitetura

### Diagrama de Fluxo

```
┌─────────────────────────────────────────────────────┐
│ USUÁRIO ENVIA MENSAGEM                              │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │ orchestrator.handle()   │
        └────────┬───────────────┘
                 │
         ┌───────┴────────┐
         │                │
      NOVO?           (ROTA LONGA)
         │            (requiresLongTask)
         │                │
      CANCEL TTS          │
         │                │
         ▼                ▼
    QUICK RESPONSE    enqueueTask()
         │                │
         ├─────────────────┤
         ▼                ▼
    responseQueue.enqueue()
    speak: true      speak: false
         │                │
         ├─────────────────┤
         ▼                ▼
    • Texto (SSE)   • Texto (SSE)
    • TTS via fila  • Sem áudio
      tts-queue       automático
```

### Fluxo Detalhado

#### 1. **ROTA CURTA** (Quick Response)
```
Usuário → Chat message
         ↓
   orchestrator.handle()
         ↓
  cancelTTS() [nova entrada cancela fila anterior]
         ↓
  detectIntent()
         ↓
  (Se NOT long task) QUICK RESPONSE
         ↓
  generateStyledResponse()
         ↓
  responseQueue.enqueue(text, speak: true)
         ↓
  ┌─ Texto exibido IMEDIATO via SSE
  │
  └─ TTS enfileirado via skill tts-queue
         ↓
     tts-queue
     • Divide em chunks
     • Processa sequencial
     • Emite eventos
```

#### 2. **ROTA LONGA** (Long Task)
```
Usuário → Complex request
         ↓
   orchestrator.handle()
         ↓
  cancelTTS()
         ↓
  detectIntent()
         ↓
  (Se requiresLongTask) LONG TASK
         ↓
  enqueueTask(type: "long", speak: false)
         ↓
  processTask()
         ↓
  generateAIResponse()
         ↓
  responseQueue.enqueue(text, speak: false)  ← NÃO enfileira TTS!
         ↓
  ┌─ Texto exibido via SSE
  │
  └─ Sem áudio automático
```

---

## 📁 Estrutura de Arquivos

### Novos
```
backend/skills/tts-queue/
├── index.js              # Skill principal (fila sequencial)
└── README.md             # Documentação
```

### Modificados
```
backend/core/
├── responseQueue.js      # Integração com tts-queue
└── orchestrator.js       # Cancelamento automático de TTS

backend/services/
└── (sem mudança)         # tts.js mantém compatibilidade
```

---

## 🛠️ Componentes

### 1. Skill `tts-queue` (Novo)

**Localização**: `backend/skills/tts-queue/index.js`

**Responsabilidades**:
- Gerenciar fila sequencial de TTS
- Dividir texto em chunks inteligentes
- Processar um chunk por vez
- Permitir cancelamento completo
- Emitir eventos de status

**Interface Pública**:
```javascript
// Enfileirar texto completo
await ttsQueueSkill.enqueueText(text, priority)
→ { queued: true, queueId, chunkCount }

// Cancelar fila
await ttsQueueSkill.cancelQueue()
→ { cancelled: true, itemsRemoved }

// Consultar status
ttsQueueSkill.getQueueStatus()
→ { isProcessing, queueLength, queue: [...] }

// Verificar se está processando
ttsQueueSkill.isBusy()
→ boolean
```

**Método `_splitText(text, maxChars = 180)`**:

Divide com prioridade:
1. **Frases** (`.`, `!`, `?`) - Máxima prioridade
2. **Vírgulas** (`,`) - Segunda prioridade
3. **Espaços** - Avoid quebra de palavras
4. **Limite de tamanho** - Máximo 180 caracteres por chunk

Exemplos:
```
Input: "Olá! Tudo bem? Estou aqui. Vamos começar?"
Output: ["Olá!", "Tudo bem?", "Estou aqui.", "Vamos começar?"]

Input: "Este é um texto bem longo com vírgulas, que pode quebrar, conforme necessário, sem perder contexto."
Output: [
  "Este é um texto bem longo com vírgulas,",
  "que pode quebrar,", 
  "conforme necessário,",
  "sem perder contexto."
]
```

**Eventos Emitidos**:
```javascript
tts:enqueued
  { queueId, chunkCount, totalInQueue }

tts:processing
  { queueId, index, total, text }

tts:chunk-completed
  { queueId, index, total }

tts:chunk-error
  { queueId, index, error }

tts:cancelled
  { itemsRemoved, timestamp }

tts:completed
  { timestamp }
```

### 2. ResponseQueue (Refatorado)

**Localização**: `backend/core/responseQueue.js`

**Mudanças**:
- Remove processamento local de TTS
- Delegou para skill tts-queue
- Adiciona funções públicas:
  - `enqueue(text, speak, priority)`
  - `cancelTTS()`
  - `isTTSBusy()`
  - `getQueueStatus()`

**Fluxo**:
```javascript
enqueue({ text, speak: true })
  ├─ Salva histórico
  ├─ Emite texto via SSE (IMEDIATO)
  └─ Se speak=true:
      └─ enqueueToTTSQueue(text)
         └─ ttsQueueSkill.enqueueText(text)
            └─ Processamento sequencial
```

### 3. Orchestrator (Otimizado)

**Localização**: `backend/core/orchestrator.js`

**Mudanças**:
1. **Cancelamento Automático**:
   ```javascript
   async function handle({ input, source = "user" }) {
     // ...
     if (source === "user") {
       context.core.responseQueue.cancelTTS?.();
     }
     // ...
   }
   ```

2. **Atualização de `isAudioBusy()`**:
   ```javascript
   function isAudioBusy() {
     // Verifica tts-queue em tempo real
     const isTTSBusy = context.core.responseQueue?.isTTSBusy?.();
     if (isTTSBusy !== undefined) return isTTSBusy;
     
     // Fallback legado
     return state.orchestrator?.audioBusy === true;
   }
   ```

3. **Rota Longa sem TTS**:
   ```javascript
   // Long task agora usa speak: false
   context.core.responseQueue.enqueue({
     text: task.result,
     speak: false,  // ✅ Não enfileira TTS
     priority: 2
   });
   ```

---

## 🎯 Regras de Negócio Implementadas

### ✅ Escopo
- [x] TTS em tempo real **apenas na rota curta**
- [x] Rota longa **nunca** gera áudio automático
- [x] Comando "audio" explícito para geração de áudio em long tasks

### ✅ Fila de TTS
- [x] Processamento sequencial (1 chunk por vez)
- [x] Sem concorrência
- [x] Cancelamento via `cancelQueue()`

### ✅ Divisão de Texto
- [x] Prioridade: frases
- [x] Fallback: vírgulas
- [x] Limite: 180 caracteres por chunk

### ✅ Integração
- [x] Substitui chamadas diretas de TTS
- [x] Não duplica lógica (orquestra apenas)
- [x] Usa `context.services.tts.speak()` existente

### ✅ Cancelamento
- [x] Nova entrada cancela fila anterior
- [x] Usuários ouvem resposta mais recente

### ✅ Arquitetura
- [x] Segue padrão de Skills
- [x] Código desacoplado
- [x] Sem dependência entre rotas

---

## 🔄 Estados e Transições

### Máquina de Estados da Fila

```
┌─────────┐
│  IDLE   │  (Nenhum item em fila)
└────┬────┘
     │ enqueueText()
     ▼
┌──────────┐
│ QUEUED   │  (Items na fila, aguardando processamento)
└────┬─────┘
     │ processQueue()
     ▼
┌───────────────┐
│  PROCESSING   │  (Processando chunk atual)
└────┬──────────┘
     │ (completo)
     ├─────────────────┐
     │                 │
  [Fim]          [Próximo chunk]
     │                 │
     │            ┌─────┴────┐
     │            │           │
  speak(nil)  processingQueue()
     │            │
     ▼            ▼
  IDLE      PROCESSING
```

### Transições com Cancelamento

```
IDLE/QUEUED/PROCESSING + cancelQueue()
            ↓
        IDLE (limpo)
```

---

## 🧪 Cenários de Teste

### Teste 1: Resposta Rápida com TTS
```
Usuario: "Olá, tudo bem?"
         ↓
Orquestra: QUICK RESPONSE
         ↓
         Split: ["Olá!", "Tudo bem?"]
         ↓
Saída: Texto imediato + áudio por chunks
```

**Esperado**: Resposta exibida e falada imediatamente

### Teste 2: Cancelamento de Fila
```
Usuario: "Crie um documento longo"
         ↓
Sys: Gerando áudio... (1 de 5)
         ↓
Usuario: "Espera, me responde algo"  ← Novo input!
         ↓
Orq: cancelTTS() - Limpa fila anterior
         ↓
Nova resposta é fileirada e ouvida
```

**Esperado**: Fila anterior cancelada, nova resposta tem prioridade

### Teste 3: Rota Longa sem Áudio
```
Usuario: "Escreva um código Python"
         ↓
Orquestra: LONG TASK
         ↓
Task processa, enfileira com speak: false
         ↓
Saída: Apenas texto na UI
```

**Esperado**: Sem áudio automático, apenas visão

### Teste 4: Comando de Áudio Explícito
```
Usuário: "Gerar áudio dessa resposta"
         ↓
Detecta audioIntent
         ↓
Enfileira task tipo "audio" + speak: true
         ↓
Saída: Áudio gerado
```

**Esperado**: Áudio gerado apenas quando solicitado

---

## 🔍 Monitoramento

###Eventos para Dashboard

```javascript
// Observar fila (desenvolvimento)
eventBus.on('tts:enqueued', (data) => {
  console.log(`${data.chunkCount} chunks na fila`);
});

eventBus.on('tts:processing', (data) => {
  console.log(`Tocando: ${data.text}`);
});

eventBus.on('tts:completed', () => {
  console.log('Fila vazia, TTS concluído');
});

eventBus.on('tts:cancelled', (data) => {
  console.log(`Fila cancelada: ${data.itemsRemoved} items removidos`);
});
```

### Logging

```javascript
[TTS-QUEUE] Skill inicializada
[TTS-QUEUE] 3 chunks enfileirados (ID: 17131234-abc123)
[TTS-QUEUE] Processando chunk 1/3
[TTS-QUEUE] Processando chunk 2/3
[TTS-QUEUE] Processando chunk 3/3
[TTS-QUEUE] Fila cancelada (2 items removidos)
```

---

## ⚙️ Compatibilidade

### Serviço TTS Existente

Nenhuma mudança necessária em `backend/services/tts.js`:
- `speak(text)` continua funcionando
- `speakXTTSByLines()` é mantido
- Fallback para sistema operacional funciona

### Integrações

- ✅ EventBus: Usa apenas emissão padrão
- ✅ SkillManager: Carregamento automático
- ✅ ResponseQueue: Delegação simples
- ✅ Orchestrator: Chamadas claras e documentadas

---

## 🚀 Expansão Futura

### Sugerido (Próximas Versões)

1. **Controle de Velocidade**: Adicionar parâmetro `speed` aos chunks
2. **Pausa/Resumo**: Permitir pausar fila e resumir
3. **Priorização Dinâmica**: Reordenar fila com base em importância
4. **Múltiplas Vozes**: Alternar vozes por chunk
5. **Análise de Performance**: Métricas de latência por chunk
6. **UI: Widget de Fila**: Visualizar chunks sendo processados

---

## 📚 Referências

### Arquivos-chave
1. [Skill TTS-Queue](./backend/skills/tts-queue/index.js)
2. [ResponseQueue Refatorado](./backend/core/responseQueue.js)
3. [Orchestrator Otimizado](./backend/core/orchestrator.js)

### Padrões Utilizados
- **Skills**: Veja `backend/skills/needs/index.js` como referência
- **EventBus**: Documentado em `backend/core/eventBus.js`
- **Serviços**: Pattern em `backend/services/ai.js`

---

## ✨ Conclusão

A refatoração mantém a simplicidade da arquitetura existente enquanto implementa gerenciamento robusto de TTS. A separação clara entre rota curta (com áudio) e rota longa (sem áudio) permite expansão futura sem acoplamento.

**Status**: ✅ Pronto para produção
