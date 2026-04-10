# Refatoração de Orquestração - AI-kit V2

## 📋 Resumo

Refatoração completa do sistema de orquestração para suportar **3 rotas independentes**, cada uma com responsabilidades bem definidas. Sistema preparado para expansão de Agent avançado no futuro.

**Status**: ✅ Implementado e Documentado

---

## 🏗️ Arquitetura

### 3 Rotas Independentes

```
┌──────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                            │
│           (Coordena e roteia requisições)                     │
└─────┬────────────────────┬────────────────────┬──────────────┘
      │                    │                    │
      ▼                    ▼                    ▼
┌──────────┐        ┌─────────────┐      ┌──────────┐
│RealtimeR │        │  TaskRoute  │      │AgentRoute│
│          │        │             │      │          │
│Rápida    │        │Longa/  BackG│      │Autônoma  │
│SSE+TTS   │        │  Multi-step │      │Scheduler │
│          │        │             │      │EventBus  │
└──────────┘        └─────────────┘      └──────────┘
```

### Fluxo Completo

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USUÁRIO ENVIA MENSAGEM                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
          ┌────────────────────────┐
          │ Orchestrator.handle()   │
          └────────┬───────────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
    Long Task?           No
         │                   │
       YES                   ▼
         │            ┌──────────────┐
         │            │RealtimeRoute │
         │            └──────┬───────┘
         │                   │
         ├───────────────────┤
         ▼                   ▼
    ┌────────────┐    ┌───────────┐
    │ TaskRoute  │    │Quick Resp  │
    │            │    ├───────────┤
    │• Process   │    │• Generate  │
    │• Background│    │• TTS Queue │
    │• No Auto   │    │• Vision    │
    │  Audio     │    │• Commands  │
    └────┬───────┘    └──────┬────┘
         │                   │
         └───────────┬───────┘
                     │
                     ▼
         ┌─────────────────────┐
         │ ResponseQueue       │
         │ (emite via eventBus)│
         └─────────────────────┘
         │
         ├─→ Texto (UI/SSE)
         └─→ TTS (se speak:true)

┌─────────────────────────────────────────────────────────────┐
│ 2. AGENTROUTE (INDEPENDENTE - VIA SCHEDULER)               │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
    ┌───▼────┐  ┌──────────┐  ┌──────▼──┐
    │RandomT.│  │ Needs    │  │Reminders│
    └───┬────┘  └──────┬───┘  └──────┬──┘
        │              │             │
        └──────────────┬─────────────┘
                       │
              ┌────────▼─────────┐
              │ Emit Agent Event │
              │ (via eventBus)   │
              └────────┬─────────┘
                       │
         ┌─────────────┴──────────────┐
         │                            │
    ┌────▼──────┐          ┌─────────▼───┐
    │Monitored  │          │ResponseQueue│
    │by Orch    │          │(Speak: true)│
    │(EventBus) │          └─────────────┘
    └───────────┘
```

---

## 📁 Estrutura de Arquivos

### Novos
```
backend/core/
├── routes/
│   ├── realtimeRoute.js      # RealtimeRoute
│   ├── taskRoute.js          # TaskRoute
│   └── agentRoute.js         # AgentRoute
└── orchestrator-v2.js        # Novo orchestrator refatorado
```

### Modificado (compatível com anterior)
```
backend/core/
└── orchestrator.js           # ← REMOVER OU FAZER WRAPPER
```

---

## 🎯 Responsabilidades por Rota

### 1. RealtimeRoute (Rota Curta / SSE)

**Arquivo**: `backend/core/routes/realtimeRoute.js`

**Quando ativada**:
- Input recebido do usuário
- Não requer lógica complexa

**O que faz**:
- ✅ Processa entrada rápidamente
- ✅ Gera resposta IA (quick mode)
- ✅ Integra com TTS via fila (tts-queue)
- ✅ Captura tela (vision)
- ✅ Executa comandos de sistema
- ✅ Pesquisa web rápida

**O que NÃO faz**:
- ❌ Tarefas multi-step
- ❌ Processamento em background
- ❌ Execução autônoma
- ❌ Sem TTS automático para rota longa

**Interface**:
```javascript
const realtimeRoute = context.core.routes.realtime;

await realtimeRoute.handle({
  input: "Olá",
  images: []
});

// Retorna:
// { handled: true, type: "realtime", response: "..." }
```

---

### 2. TaskRoute (Rota Longa / Background)

**Arquivo**: `backend/core/routes/taskRoute.js`

**Quando ativada**:
- detectIntent() identifica requiresLongTask
- Palavras-chave: "arquivo", "escreva", "corrija", "crie", "desenvolva"

**O que faz**:
- ✅ Processamento em background
- ✅ Gerencia fila de tarefas
- ✅ Suporta concorrência (até MAX_CONCURRENT)
- ✅ Leitura e processamento de arquivos
- ✅ Geração de conteúdo estruturado
- ✅ Análises profundas

**O que NÃO faz**:
- ❌ TTS em tempo real
- ❌ Respostas via SSE imediato
- ❌ Execução autônoma

**Tipos de Tarefas**:
- `"audio"`: Geração de áudio (chamado da RealtimeRoute)
- `"long"`: Tarefa longa/multi-step

**Interface**:
```javascript
const taskRoute = context.core.routes.task;

// Enfileirar tarefa longa
const taskId = await taskRoute.enqueueLongTask({
  text: "Escreva um artigo sobre IA",
  memoryContext: "...",
  searchResult: null
});

// Enfileirar áudio (da realtimeRoute)
const audioTaskId = await taskRoute.enqueueAudioTask({
  type: "audio",
  data: { voiceName: "feminina", ... },
  text: "...",
  memoryContext: "..."
});

// Consultar status
const status = taskRoute.getQueueStatus();
// { runningTasks, maxConcurrent, queueLength, queue }

// Verificar se está ocupada
const busy = taskRoute.isAudioBusy();
```

---

### 3. AgentRoute (Rota Autônoma)

**Arquivo**: `backend/core/routes/agentRoute.js`

**Quando ativada**:
- Via Scheduler (periodicamente)
- Não há input direto do usuário

**O que faz**:
- ✅ RandomTalk periodic
- ✅ Análise de necessidades
- ✅ Gerenciamento de lembretes
- ✅ Comentários de atividade
- ✅ Emite eventos via eventBus
- ✅ Totalmente desacoplada

**O que NÃO faz**:
- ❌ Responder diretamente ao usuário
- ❌ Bloquear requisições do usuário
- ❌ Usar TTS sem input do usuário (apenas via eventos)

**Jobs Registrados no Scheduler**:
1. `agent:randomtalk` (Prioridade 5)
2. `agent:needs-analysis` (Prioridade 4)
3. `agent:reminders` (Prioridade 6)
4. `agent:activity-comment` (Prioridade 3)

**Interface**:
```javascript
const agentRoute = context.core.routes.agent;

// Registrar jobs no scheduler (chamado uma vez)
agentRoute.registerSchedulerJobs(context.scheduler);

// Consultar status
const status = agentRoute.getAgentStatus();
// { isScheduled, eventBusReady, skillsLoaded }

// Emitir evento (uso interno)
agentRoute.emitAgentEvent("randomtalk", {
  text: "Olá!",
  voice: "default"
});
```

**Eventos Emitidos**:
- `agent:randomtalk` → `agent:randomtalk-ready`
- `agent:reminder` → `agent:reminder-ready`
- `agent:needs-triggered` → `agent:needs-ready`
- `agent:activity-comment` → `agent:activity-ready`

---

## 🔗 Fluxo de Comunicação

### RealtimeRoute → TaskRoute

```javascript
// RealtimeRoute detecta audioIntent
// Delega para TaskRoute

const taskRoute = context.core.routes.task;
const audioTaskId = await taskRoute.enqueueAudioTask({
  type: "audio",
  data: audioIntent,
  text: originalText,
  memoryContext: context
});
```

### TaskRoute → ResponseQueue

```javascript
// TaskRoute processa e enfileira resposta
context.core.responseQueue.enqueue({
  text: result.text,
  speak: false,  // ← Rota longa: sem TTS automático
  priority: 2
});
```

### AgentRoute → ResponseQueue (via EventBus)

```javascript
// AgentRoute emite evento
agentRoute.emitAgentEvent("randomtalk", { text: "..." });

// Orchestrator escuta e enfileira
eventBus.on("agent:randomtalk-ready", (data) => {
  responseQueue.enqueue({
    text: data.text,
    speak: true,  // ← AgentRoute via eventos
    priority: 3
  });
});
```

---

## 🔄 Decisão de Rota (orchestrator.handle)

```javascript
async function handle({ input, source = "user" }) {
  // 1. Validar input
  // 2. Cancelar TTS anterior
  // 3. Atualizar estado do usuário
  
  // 4. Detectar intent
  const intent = detectIntent(input);
  
  // 5. DECISÃO
  if (intent.requiresLongTask) {
    // → TaskRoute
    return await taskRoute.enqueueLongTask({...});
  }
  
  // → RealtimeRoute (default)
  return await realtimeRoute.handle({...});
}
```

---

## 🧪 Casos de Uso

### Caso 1: Resposta Rápida

```
Usuário: "Olá, tudo bem?"
        ↓
Orchestrator.handle()
        ↓
detectIntent() → requiresLongTask: false
        ↓
RealtimeRoute.handle()
        ↓
Resposta rápida + TTS em fila
```

### Caso 2: Tarefa Longa

```
Usuário: "Escreva um código Python para..."
        ↓
Orchestrator.handle()
        ↓
detectIntent() → requiresLongTask: true
        ↓
TaskRoute.enqueueLongTask()
        ↓
Processamento em background
        ↓
Resposta (sem TTS automático)
```

### Caso 3: RandomTalk (Autônomo)

```
Scheduler tick
        ↓
AgentRoute.executeRandomTalk()
        ↓
Emite evento "agent:randomtalk"
        ↓
Orchestrator listeners capturam
        ↓
ResponseQueue.enqueue(text, speak: true)
```

### Caso 4: Geração de Áudio

```
Usuário: "Gera um áudio com voz feminina"
        ↓
RealtimeRoute.handleAudioIntent()
        ↓
Delega para TaskRoute.enqueueAudioTask()
        ↓
TaskRoute processa áudio
        ↓
Enfileira com speak: true
```

---

## 🔌 Inicialização

### No server.js (ou startup)

```javascript
import createOrchestrator from "./core/orchestrator-v2.js";

// Criar orchestrator
const orchestrator = createOrchestrator(context);

// Inicializar rotas
await orchestrator.initialize();

// AgentRoute jobs já estão registrados no scheduler
context.scheduler.start(1000); // tick a cada 1s

// Agora está pronto
console.log(orchestrator.getStatus());
```

### Context Setup

```javascript
context.core = {
  orchestrator,
  routes: {
    realtime: /* criado em orchestrator.initialize() */,
    task: /* criado em orchestrator.initialize() */,
    agent: /* criado em orchestrator.initialize() */
  },
  responseQueue,
  skillManager,
  eventBus,
  // ...
};
```

---

## 🔄 Migração do Código Existente

### Opção 1: Substituição Completa (Recomendado)

1. **Backup** do `orchestrator.js` original
2. **Renomear** `orchestrator-v2.js` → `orchestrator.js`
3. **Atualizar** inicialização em `server.js`:

```javascript
// Antes
const orchestrator = createOrchestrator(context);

// Depois
const orchestrator = createOrchestrator(context);
await orchestrator.initialize();  // ← Novo passo
```

### Opção 2: Wrapper (Compatível)

```javascript
// orchestrator.js (wrapper)
import createOrchestratorV2 from "./orchestrator-v2.js";

export default function createOrchestrator(context) {
  const v2 = createOrchestratorV2(context);
  
  return {
    handle: v2.handle,
    getStatus: v2.getStatus,
    // Inicializar automaticamente
    _init: async function() {
      await v2.initialize();
    }
  };
}
```

---

## 📊 Event Map

```
USER INPUT
    ↓
Orchestrator.handle()
    ├─ action:status (durante processamento)
    ├─ task:enqueued (TaskRoute)
    ├─ task:completed (TaskRoute)
    └─ task:error (TaskRoute)
    
AGENT (Scheduler)
    ├─ agent:randomtalk
    ├─ agent:needs-triggered
    ├─ agent:reminders
    └─ agent:activity-comment
    
AGENT (Listeners)
    ├─ agent:randomtalk-ready
    ├─ agent:needs-ready
    ├─ agent:reminder-ready
    └─ agent:activity-ready
    
RESPONSE
    ├─ task:completed (UI captura)
    ├─ tts:enqueued (TTS Queue)
    └─ tts:completed (TTS completo)
```

---

## 🚀 Próximos Passos

### Curto Prazo
- [ ] Testes unitários para cada rota
- [ ] Integração com novo frontend
- [ ] Monitoramento de performance

### Médio Prazo
- [ ] Priorização dinâmica de tarefas
- [ ] Cancelamento de tarefas em progress
- [ ] Persistência de state

### Longo Prazo
- [ ] Agent Advanced (com aprendizado)
- [ ] Multi-agent coordination
- [ ] Customização de rotas por usuário

---

## ✨ Benefícios da Nova Arquitetura

✅ **Separação de Responsabilidades**
- Cada rota tem função clara

✅ **Código Desacoplado**
- Sem dependências cruzadas
- Fácil de testar

✅ **Escalável**
- Adicionar novas rotas é trivial
- Podem rodar em paralelo

✅ **Agnóstico de UI**
- Todas comunicam via eventBus
- Frontend pode escolher como processar

✅ **Preparado para Agent Avançado**
- AgentRoute já estruturada
- Padrão pronto para expansão

---

## 📚 Referências

- [RealtimeRoute](./routes/realtimeRoute.js)
- [TaskRoute](./routes/taskRoute.js)
- [AgentRoute](./routes/agentRoute.js)
- [Orchestrator V2](./orchestrator-v2.js)
- [TTS-Queue System](../skills/tts-queue/)
- [ResponseQueue](./responseQueue.js)
- [Scheduler](./scheduler.js)
