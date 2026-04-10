# Routes - Sistema de Orquestração V2

Sistema de 3 rotas independentes para orquestração da IA-kit.

## 📋 Visão Geral

```
          ORCHESTRATOR
                │
      ┌─────────┼─────────┐
      ▼         ▼         ▼
 RealtimeRoute TaskRoute AgentRoute
   (Quick)     (Back)    (Auton)
```

## 🎯 Rotas

### 1. RealtimeRoute (`realtimeRoute.js`)

**Responsável por**: Respostas rápidas em tempo real

- ✅ Processamento imediato
- ✅ TTS em fila (via tts-queue)
- ✅ Vision (screenshot)
- ✅ Comandos do sistema
- ✅ Pesquisa web rápida
- ✅ Geração de áudio (delega para TaskRoute)

**Quando**: Input do usuário (rota padrão)

**Exemplo**:
```javascript
const realtimeRoute = context.core.routes.realtime;

await realtimeRoute.handle({
  input: "Olá, tudo bem?",
  images: []
});

// Retorna: { handled: true, type: "realtime", response: "..." }
```

---

### 2. TaskRoute (`taskRoute.js`)

**Responsável por**: Processamento em background

- ✅ Tarefas multi-step
- ✅ Fila com controle de concorrência
- ✅ Sem TTS automático (rota longa)
- ✅ Processamento profundo
- ✅ Suporte a múltiplas tarefas em paralelo

**Quando**: 
- Input com palavras como "escreva", "crie", "arquivo", ...
- Geração de áudio (delegado de RealtimeRoute)

**Exemplo**:
```javascript
const taskRoute = context.core.routes.task;

// Enfileirar tarefa longa
const taskId = await taskRoute.enqueueLongTask({
  text: "Escreva um artigo sobre IA",
  memoryContext: "...",
  searchResult: null
});

// Enfileirar áudio
const audioId = await taskRoute.enqueueAudioTask({
  type: "audio",
  data: { voiceName: "feminina" },
  text: "Texto for áudio",
  memoryContext: "..."
});

// Status
const status = taskRoute.getQueueStatus();
```

---

### 3. AgentRoute (`agentRoute.js`)

**Responsável por**: Ações autônomas

- ✅ RandomTalk periódico
- ✅ Gerenciamento de lembretes
- ✅ Análise de necessidades
- ✅ Comentários de atividade
- ✅ Execução via Scheduler

**Quando**: 
- Periodicamente via Scheduler
- Baseado em eventos (eventBus)
- Nunca chamada diretamente

**Exemplo**:
```javascript
const agentRoute = context.core.routes.agent;

// Registrar scheduler jobs (uma vez)
agentRoute.registerSchedulerJobs(context.scheduler);

// Status
const status = agentRoute.getAgentStatus();
```

---

## 🔗 Fluxo de Comunicação

### User Input → RealtimeRoute

```
POST /chat
    ↓
orchestrator.handle()
    ↓
detectIntent()
    ├─ long task?
    │   ├─ YES → TaskRoute
    │   └─ NO → RealtimeRoute (default)
    │
RealtimeRoute.handle()
    ├─ Parse intent
    ├─ Generate response
    └─ Enqueue TTS
        ↓
    responseQueue
        ├─ Emit text (SSE)
        ├─ Enqueue TTS (speak: true)
        └─ Done
```

### User Input → TaskRoute

```
POST /chat ("Escreva um...")
    ↓
orchestrator.handle()
    ↓
detectIntent() → requiresLongTask
    ↓
TaskRoute.enqueueLongTask()
    ├─ Add to queue
    ├─ Start processing (if available)
    └─ Return taskId
        ↓
    (background processing)
        ├─ Process task
        ├─ Generate response
        └─ Enqueue (speak: false)
            ↓
        responseQueue
            └─ Emit text (NO TTS auto)
```

### Scheduler → AgentRoute

```
scheduler.tick()
    ├─ agent:randomtalk job
    │   ├─ randomTalkSkill.execute()
    │   ├─ emitAgentEvent()
    │   └─ emit("agent:randomtalk")
    │
    ├─ agent:needs-analysis job
    │   ├─ needsSkill.execute()
    │   ├─ emitAgentEvent()
    │   └─ emit("agent:needs-triggered")
    │
    ├─ agent:reminders job
    │   ├─ tasksSkill.checkReminders()
    │   ├─ emitAgentEvent() for each
    │   └─ emit("agent:reminder")
    │
    └─ agent:activity-comment job
        ├─ commentActivitySkill.execute()
        ├─ emitAgentEvent()
        └─ emit("agent:activity-comment")

↓ (Orchestrator listeners capture)

orchestrator event listeners
    ├─ agent:randomtalk-ready
    ├─ agent:reminder-ready
    ├─ agent:needs-ready
    └─ agent:activity-ready
        ↓
    responseQueue.enqueue(
        text: "...",
        speak: true,  ← AgentRoute usa TTS
        priority: ...
    )
```

---

## 📊 Event Map

### RealtimeRoute Events
```
action:status
    └─ "💭 lendo...", "🔍 pesquisando...", etc
```

### TaskRoute Events
```
task:enqueued
    ├─ taskId, type ("audio"|"long"), queueLength
    │
task:completed
    ├─ taskId, type, result
    │
task:error
    └─ taskId, type, error
```

### AgentRoute Events
```
agent:randomtalk / agent:needs-triggered / agent:reminders / agent:activity-comment
    ↓ (Processed by agent)
    ↓
agent:randomtalk-ready / agent:needs-ready / agent:reminder-ready / agent:activity-ready
    ↓ (Captured by orchestrator listeners)
    ↓
responseQueue.enqueue()
```

---

## 🧪 Testes

### Testar RealtimeRoute

```bash
# Deve responder rápido
curl -X POST http://localhost:3000/chat -d '{"text": "Olá"}'

# Deve capturar tela
curl -X POST http://localhost:3000/chat -d '{"text": "Olha a tela"}'

# Deve detectar áudio
curl -X POST http://localhost:3000/chat -d '{"text": "Gera um áudio"}'
```

### Testar TaskRoute

```bash
# Deve enfileirar
curl -X POST http://localhost:3000/chat -d '{"text": "Escreva um código Python"}'

# Verificar queue
GET /orchestrator/status
→ { "taskRoute": { "queueLength": 1, "running": 0 } }

# Esperar conclusão (logs)
[TASK-ROUTE] Long task enfileirada (ID: abc123)
[TASK-ROUTE] Processando chunk 1/1
...
```

### Testar AgentRoute

```bash
# Logs devem mostrar agent jobs
[AGENT-ROUTE] executeRandomTalk()
[AGENT-ROUTE] Evento emitido: agent:randomtalk

# EventBus deve capturar
[ORCHESTRATOR] Capturando agent:randomtalk-ready

# Resposta deve ser enfileirada
[RESPONSE-QUEUE] ✅ Texto exibido
```

---

## 🔌 Inicialização

```javascript
// server.js
import createOrchestratorV2 from "./core/orchestrator-v2.js";

const orchestrator = createOrchestratorV2(context);

// Inicializar rotas
await orchestrator.initialize();

// Scheduler com AgentRoute jobs já registrados
context.scheduler.start(1000);

console.log(orchestrator.getStatus());
```

---

## 🏗️ Estrutura Interna

### RealtimeRoute
```
handle(input, images)
├─ Normalize input
├─ Get memory context
├─ Parse audio intent
├─ Detect intent
├─ Handle audio/vision/search/system
├─ Generate response
├─ Process memory
└─ Enqueue TTS
```

### TaskRoute
```
enqueueLongTask / enqueueAudioTask
├─ Create task
├─ Add to queue
└─ Process async

processNextTask()
├─ Check limits
├─ Get next pending
└─ Process
    ├─ Process audio task
    │   └─ Audio skill
    │   └─ Enqueue (speak: true)
    └─ Process long task
        └─ AI chat
        └─ Enqueue (speak: false)
```

### AgentRoute
```
registerSchedulerJobs()
├─ randomtalk job
├─ needs-analysis job
├─ reminders job
└─ activity-comment job

Each job:
├─ Execute skill
├─ Emit agent event
└─ Handled by orchestrator
```

---

## 🚀 Escalabilidade

### Adicionar Nova Rota

```javascript
// routes/newRoute.js
export default function createNewRoute(context) {
  return {
    handle() { ... }
  };
}

// orchestrator-v2.js
import createNewRoute from "./routes/newRoute.js";

async function initialize() {
  // ...
  context.core.routes.new = createNewRoute(context);
  // ...
}
```

### Adicionar Novo AgentRoute Job

```javascript
// routes/agentRoute.js
scheduler.register({
  name: "agent:mynewjob",
  priority: 5,
  execute: async () => {
    const result = await mySkill.execute();
    emitAgentEvent("mynewjob", result);
  }
});
```

---

## 🐛 Troubleshooting

### RealtimeRoute não responde rápido
- Verificar memory skill
- Verificar AI service latência
- Verificar vision não está bloqueando

### TaskRoute não processa
- Verificar maxConcurrentTasks > 0
- Verificar skills disponíveis
- Verificar processNextTask() logs

### AgentRoute não emite eventos
- Verificar scheduler iniciou
- Verificar orchestrator.initialize() foi chamado
- Verificar skills estão carregadas

---

## 📚 Referências

- [Orchestrator V2](../orchestrator-v2.js)
- [ORCHESTRATION_REFACTORING_V2.md](../ORCHESTRATION_REFACTORING_V2.md)
- [ORCHESTRATOR_V2_IMPLEMENTATION.js](../ORCHESTRATOR_V2_IMPLEMENTATION.js)
