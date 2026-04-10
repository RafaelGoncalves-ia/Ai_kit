function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJson(text) {
  if (!text || typeof text !== "string") return null;

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return safeJsonParse(fencedMatch[1].trim());
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return safeJsonParse(objectMatch[0]);
  }

  return safeJsonParse(text.trim());
}

function normalizePlanSteps(candidateSteps = []) {
  return candidateSteps
    .filter(Boolean)
    .slice(0, 10)
    .map((step, index) => ({
      type: typeof step.type === "string" && step.type.trim() ? step.type.trim() : `step_${index + 1}`,
      label: typeof step.label === "string" && step.label.trim() ? step.label.trim() : `Executando passo ${index + 1}`,
      toolName: step.toolName || step.tool || null,
      input: step.input && typeof step.input === "object" ? step.input : {}
    }));
}

export default function createAgentEngine(context) {
  context.sessions = context.sessions || {};
  context.tools = context.tools || {};

  function getSession(sessionId) {
    const normalizedId = sessionId || "default";

    if (!context.sessions[normalizedId]) {
      context.sessions[normalizedId] = {
        id: normalizedId,
        memory: {},
        questions: {},
        executions: []
      };
    }

    return context.sessions[normalizedId];
  }

  function log(text) {
    context.core?.responseQueue?.enqueue({
      text,
      speak: false,
      priority: 2
    });
  }

  async function callLLM(prompt, options = {}) {
    if (typeof context.llm === "function") {
      const result = await context.llm(prompt, options);
      if (typeof result === "string") return result;
      return result?.text || "";
    }

    if (context.services?.ai?.chat) {
      const result = await context.services.ai.chat(prompt, options);
      return result?.text || "";
    }

    return "";
  }

  async function createPlan({ goal, session }) {
    log("🧠 Planejando tarefa...");

    const availableTools = Object.keys(context.tools || {});
    const prompt = `
Você é um planner de agentes.

Objetivo:
${goal}

Ferramentas disponíveis:
${availableTools.join(", ")}

Responda APENAS JSON no formato:
{
  "steps": [
    {
      "type": "string",
      "label": "string",
      "toolName": "string",
      "input": {}
    }
  ]
}

Regras:
- Máximo 10 passos
- Use apenas toolName da lista
- Os labels devem ser curtos e claros em português
- Se o objetivo mencionar campanha, legenda, imagem ou áudio, priorize analyze_image, generate_text e generate_audio
- Se precisar salvar resultado, use create_folder e save_file
`;

    try {
      const rawPlan = await callLLM(prompt);
      const parsed = extractJson(rawPlan);
      const steps = normalizePlanSteps(parsed?.steps || []);

      if (steps.length > 0) {
        session.memory.lastPlanSource = "llm";
        return steps;
      }
    } catch (err) {
      console.error("[AGENT-ENGINE] Falha ao gerar plano por LLM:", err.message);
    }

    session.memory.lastPlanSource = "fallback";
    return buildFallbackPlan(goal);
  }

  function buildFallbackPlan(goal) {
    const lower = String(goal || "").toLowerCase();
    const steps = [];

    if (lower.includes("campanha") || lower.includes("imagem")) {
      steps.push({
        type: "analyze_image",
        label: "🖼️ Analisando imagem...",
        toolName: "analyze_image",
        input: {
          goal
        }
      });
    }

    steps.push({
      type: "generate_text",
      label: lower.includes("legenda") || lower.includes("campanha")
        ? "✍️ Gerando legenda..."
        : "✍️ Gerando texto...",
      toolName: "generate_text",
      input: {
        prompt: lower.includes("campanha")
          ? `Crie uma legenda curta de campanha para o objetivo: ${goal}`
          : `Atenda o objetivo do usuário de forma objetiva: ${goal}`
      }
    });

    if (lower.includes("audio") || lower.includes("áudio") || lower.includes("voz")) {
      steps.push({
        type: "generate_audio",
        label: "🔊 Gerando áudio...",
        toolName: "generate_audio",
        input: {
          textFromSessionKey: "lastGeneratedText"
        }
      });
    }

    steps.push({
      type: "create_folder",
      label: "📁 Criando pasta...",
      toolName: "create_folder",
      input: {
        folderName: "agent-output"
      }
    });

    steps.push({
      type: "save_file",
      label: "📁 Salvando arquivo...",
      toolName: "save_file",
      input: {
        folderFromSessionKey: "lastCreatedFolder",
        fileName: "resultado.txt",
        contentFromSessionKey: "lastGeneratedText"
      }
    });

    return normalizePlanSteps(steps);
  }

  function resolveInput(input = {}, session) {
    const resolved = { ...input };

    if (resolved.textFromSessionKey) {
      resolved.text = session.memory[resolved.textFromSessionKey] || resolved.text || "";
      delete resolved.textFromSessionKey;
    }

    if (resolved.contentFromSessionKey) {
      resolved.content = session.memory[resolved.contentFromSessionKey] || resolved.content || "";
      delete resolved.contentFromSessionKey;
    }

    if (resolved.folderFromSessionKey) {
      resolved.folderPath = session.memory[resolved.folderFromSessionKey] || resolved.folderPath || "";
      delete resolved.folderFromSessionKey;
    }

    return resolved;
  }

  async function waitForUserResponse({ sessionId, key, defaultValue }) {
    const eventBus = context.core?.eventBus;
    if (!eventBus) {
      return {
        answered: false,
        value: defaultValue
      };
    }

    return new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        eventBus.off("user:response", onResponse);
      };

      const onResponse = (payload) => {
        if (!payload || payload.sessionId !== sessionId) return;

        cleanup();
        resolve({
          answered: true,
          value: payload.text
        });
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve({
          answered: false,
          value: defaultValue
        });
      }, 8000);

      eventBus.on("user:response", onResponse);
    });
  }

  function persistToolResult(session, toolName, result) {
    if (!result || typeof result !== "object") return;

    session.memory.lastTool = toolName;
    session.memory.lastToolResult = result.data ?? null;

    if (toolName === "generate_text") {
      session.memory.lastGeneratedText = result.data?.text || result.data || "";
    }

    if (toolName === "generate_audio") {
      session.memory.lastGeneratedAudio = result.data || null;
    }

    if (toolName === "analyze_image") {
      session.memory.lastImageAnalysis = result.data || null;
    }

    if (toolName === "create_folder") {
      session.memory.lastCreatedFolder = result.data?.path || result.data || "";
    }

    if (toolName === "save_file") {
      session.memory.lastSavedFile = result.data?.path || result.data || "";
    }
  }

  async function executeStep({ step, session, sessionId, execution }) {
    const toolName = step.toolName || step.type;
    const tool = context.tools?.[toolName];

    if (typeof tool !== "function") {
      throw new Error(`Tool não encontrada: ${toolName}`);
    }

    log(step.label);

    const stepInput = {
      ...resolveInput(step.input, session),
      goal: execution.goal,
      sessionId,
      session,
      step
    };

    let result = await tool(stepInput);
    let retries = 0;

    while (result?.status === "need_input" && retries < 3) {
      retries += 1;

      const question = result.question || "Preciso de uma informação para continuar.";
      const questionKey = result.key || "input";
      const defaultValue = result.default ?? null;

      session.questions[questionKey] = {
        askedAt: Date.now(),
        defaultValue
      };

      log(`❓ ${question}`);

      const answer = await waitForUserResponse({
        sessionId,
        key: questionKey,
        defaultValue
      });

      if (answer.answered) {
        log(`✅ Resposta recebida para ${questionKey}: ${answer.value}`);
      } else {
        log(`⏳ Sem resposta... usando padrão: "${answer.value}"`);
      }

      delete session.questions[questionKey];
      stepInput[questionKey] = answer.value;
      result = await tool(stepInput);
    }

    if (!result || result.status !== "ok") {
      throw new Error(`Tool ${toolName} falhou ao concluir o passo`);
    }

    persistToolResult(session, toolName, result);
    execution.results.push({
      step: step.label,
      toolName,
      data: result.data ?? null
    });

    return result;
  }

  async function run({ goal, sessionId = "default" }) {
    const session = getSession(sessionId);

    if (session.activeExecution?.running) {
      return {
        status: "busy",
        sessionId,
        executionId: session.activeExecution.id
      };
    }

    const execution = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      goal,
      sessionId,
      startedAt: Date.now(),
      results: [],
      running: true,
      steps: []
    };

    session.activeExecution = execution;
    session.executions.push(execution);
    session.memory.lastGoal = goal;

    try {
      const plan = await createPlan({ goal, session });
      execution.steps = plan.slice(0, 10);

      for (let index = 0; index < execution.steps.length; index++) {
        const step = execution.steps[index];
        execution.currentStep = index + 1;
        await executeStep({
          step,
          session,
          sessionId,
          execution
        });
      }

      execution.running = false;
      execution.finishedAt = Date.now();
      log("✅ Projeto concluído");

      return {
        status: "ok",
        sessionId,
        executionId: execution.id,
        steps: execution.steps,
        results: execution.results
      };
    } catch (err) {
      execution.running = false;
      execution.finishedAt = Date.now();
      execution.error = err.message;
      log(`❌ Falha na execução: ${err.message}`);

      return {
        status: "error",
        sessionId,
        executionId: execution.id,
        error: err.message,
        steps: execution.steps,
        results: execution.results
      };
    } finally {
      if (session.activeExecution?.id === execution.id) {
        session.activeExecution = null;
      }
    }
  }

  return {
    run
  };
}
