import fs from "fs";
import { createProjectWorkspace } from "./security/workspaceGuard.js";
import { getRouteBehavior } from "./personalityConfig.js";
import { clearExecutionStatus, updateExecutionStatus } from "../utils/executionStatus.js";

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

function hasMeaningfulText(value) {
  return String(value || "").trim().length >= 3;
}

function normalizeComparableText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function fileExistsWithContent(filePath) {
  if (!filePath) return false;

  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

function isBatchGoal(goal) {
  const lower = normalizeComparableText(goal);
  if (!lower) return false;

  const batchPatterns = [
    /\b(comprovante|comprovantes|maquininha|nota)\b/,
    /\b(tabela|lista|legenda|legendas|roteiro|documento descritivo)\b.*\b(pasta|imagens|lote)\b/,
    /\b(cachorro|dog)\b.*\b(pasta|imagens|lote)\b/,
    /\bdados[\\/]/,
    /\bagent-workspace[\\/]dados[\\/]/
  ];

  return batchPatterns.some((pattern) => pattern.test(lower));
}

function isExplicitExecutionGoal(goal) {
  const lower = normalizeComparableText(goal);
  if (!lower) return false;

  const explicitPatterns = [
    /\b(crie|criar|gere|gerar|escreva|escrever|desenvolva|desenvolver|monte|montar|produza|produzir|salve|salvar)\b.*\b(arquivo|pasta|projeto|campanha|legenda|roteiro|texto|audio|imagem|documento|codigo|post|conteudo|lista|tabela|relatorio|empresas?|fornecedores?|provedores?|contatos?|telefones?|opcoes?|programacao|cronograma|calendario|postagens?)\b/,
    /\b(explique|explicar|o que e|o que eh|qual e o conceito|conceito de)\b/,
    /\b(corrija|corrigir)\b.*\b(codigo|arquivo|texto|erro|bug|projeto)\b/,
    /\b(pesquise|pesquisar|busque|buscar|procure|procurar|analise|analisar)\b.*\b(imagem|imagens|tela|foto|assunto|tema|conteudo|documento|relatorio|lista|tabela|empresas?|fornecedores?|provedores?|operadoras?|locais?|enderecos?|telefones?|contatos?|opcoes?|produtos?|links?|eleicoes?|eleitoral|candidatos?|votos?|intencoes?\s+de\s+voto)\b/,
    /\b(gera|gere|cria|crie)\b.*\b(audio|legenda|campanha|arquivo|pasta|imagem)\b/,
    /\b(faca|faça|monte|organize|liste|listar|resuma|resumir)\b.*\b(lista|resumo|relatorio|documento|plano)\b/
  ];

  if (isBatchGoal(lower)) {
    return true;
  }

  const structuredOutput = /\b(lista|liste|listar|tabela|opcoes?|fornecedores?|programacao|cronograma|calendario|postagens?)\b/.test(lower) ||
    /\b\d+\s+(opcoes?|fornecedores?|empresas?|produtos?|itens?|links?)\b/.test(lower);

  if (structuredOutput) {
    return true;
  }

  return explicitPatterns.some((pattern) => pattern.test(lower));
}

function isConversationalGoal(goal) {
  const lower = normalizeComparableText(goal);
  if (!lower) return true;

  const conversationalPatterns = [
    /^(oi|ola|bom dia|boa tarde|boa noite)\b/,
    /\bestou\b/,
    /\batualizando\b/,
    /\bseparei\b/,
    /\bagora voce vai\b/,
    /\bvai ficar melhor\b/
  ];

  return conversationalPatterns.some((pattern) => pattern.test(lower));
}

function needsWebSearchForGoal(goal = "") {
  const lower = normalizeComparableText(goal);
  if (!lower) return false;

  const explicitSearch = /\b(pesquise|pesquisar|pesquisa|busque|buscar|busca|procure|procurar|google|web|online)\b/.test(lower);
  const publicData = /\b(hoje|agora|atual|atuais|recente|recentes|noticia|noticias|preco|valor|telefone|telefones|endereco|enderecos|site|sites|contato|contatos|cinema|filmes?|cartaz|anime|animes|manga|mangas|temporada|episodios?|crunchyroll|myanimelist|anilist|eleicoes?|eleitoral|candidatos?|votos?|intencoes?\s+de\s+voto|pesquisa\s+eleitoral|20\d{2})\b/.test(lower);
  const purchaseLink = /\b(link|links?)\b.*\b(compra|comprar|produto|produtos?)\b/.test(lower) || /\b(compra|comprar|produto|produtos?)\b.*\b(link|links?)\b/.test(lower);
  const listLike = /\b(lista|liste|listar|monte|gere|gerar|crie|criar|encontre|tabela|opcoes?)\b/.test(lower) || /\b\d+\s+(opcoes?|fornecedores?|empresas?|produtos?|itens?|links?)\b/.test(lower);
  const genericLocation = /\bem\s+(?!forma\b|tabela\b|portugues\b|ingles\b|espanhol\b|arquivo\b|pdf\b|texto\b|lista\b|planilha\b)[a-z0-9][a-z0-9\s.-]{2,}\b/.test(lower);
  const localList = listLike && genericLocation && /\b(fornecedores?|empresas?|lojas?|servicos?|contatos?|telefones?|enderecos?)\b/.test(lower);

  return explicitSearch || publicData || purchaseLink || localList;
}

function buildSearchFallbackText(goal = "", searchResult = {}) {
  const sources = Array.isArray(searchResult?.sources) ? searchResult.sources : [];
  const searchText = String(searchResult?.text || "").trim();

  if (!sources.length) {
    return searchText;
  }

  const sourceLines = sources.slice(0, 5).map((source, index) => {
    const title = String(source.title || "Fonte sem titulo").trim();
    const detail = String(source.excerpt || source.snippet || "")
      .replace(/\s+/g, " ")
      .trim();
    return `${index + 1}. ${title}${detail ? ` - ${detail}` : ""}`;
  });

  const links = sources
    .slice(0, 5)
    .map((source) => source.url)
    .filter(Boolean);

  return [
    "Nao consegui finalizar a sintese pelo modelo a tempo, mas a pesquisa web encontrou estas referencias:",
    "",
    ...sourceLines,
    "",
    goal ? `Pedido original: ${goal}` : "",
    "",
    "Fontes:",
    ...(links.length ? links.map((url) => `- ${url}`) : ["- sem fontes confirmadas"])
  ].filter((line) => line !== "").join("\n");
}

function filterExecutablePlan(steps, availableTools) {
  return normalizePlanSteps(steps).filter((step) => {
    const toolName = step.toolName || step.type;
    return typeof availableTools[toolName] === "function";
  });
}

function getExecutionProfile(mode = "task") {
  const routeBehavior = getRouteBehavior(mode);
  return {
    mode,
    plannerRole: routeBehavior.plannerRole || "Execucao sem persona.",
    responseStyle: Array.isArray(routeBehavior.instructions)
      ? routeBehavior.instructions.join(" ")
      : "Nao use persona."
  };
}

function buildExecutionSummary(execution) {
  const hasGeneratedText = execution.results.some((item) => item?.toolName === "generate_text" && hasMeaningfulText(item?.data?.text));
  const generatedText = execution.results
    .filter((item) => !hasGeneratedText || item?.toolName !== "web_search")
    .map((item) => item?.data?.text || "")
    .filter(hasMeaningfulText)
    .join("\n\n")
    .trim();

  const savedFiles = execution.results
    .flatMap((item) => {
      const outputFiles = Array.isArray(item?.data?.outputFiles) ? item.data.outputFiles : [];
      return [item?.data?.path || null, item?.data?.file || null, ...outputFiles];
    })
    .filter(fileExistsWithContent);

  const distinctFiles = [...new Set(savedFiles)];

  return {
    text: generatedText || null,
    files: distinctFiles
  };
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

  function publishExecutionStatus(execution, patch = {}) {
    return updateExecutionStatus(context, {
      executionId: execution.id,
      mode: execution.mode || "task",
      sessionId: execution.sessionId,
      currentStep: execution.currentStep || 0,
      totalSteps: execution.steps?.length || execution.totalSteps || 0,
      label: execution.currentLabel || "",
      progressText: execution.progressText || "",
      startedAt: execution.startedAt || null,
      finishedAt: execution.finishedAt || null,
      error: execution.error || null,
      ...patch
    });
  }

  function askUser(question, source = "agent-engine.question") {
    if (!question || !context.core?.responseQueue) {
      return;
    }

    context.core.responseQueue.enqueue({
      text: question,
      speak: false,
      priority: 2,
      source,
      allowGeneric: true,
      userFacing: true
    });
  }

  async function callLLM(prompt, options = {}) {
    const result = await context.tools?.ai_chat?.({
      prompt,
      images: options.images || [],
      options,
      source: options.source || "agent-engine",
      sessionId: options.sessionId || null,
      executionId: options.executionId || null,
      stream: options.stream ?? true,
      think: options.think ?? true,
      emitEvents: options.emitEvents ?? false
    });

    return result?.data?.text || "";
  }

  function buildFallbackPlan(goal, mode = "task", allowWebSearch = true) {
    const lower = normalizeComparableText(goal);
    const steps = [];
    const profile = getExecutionProfile(mode);
    const needsBatchProcessing = /\b(pasta|lote|imagens|comprovantes|comprovante|legenda|instagram|cachorro|dog)\b/.test(lower);
    const needsSearch = allowWebSearch !== false && needsWebSearchForGoal(goal);
    const needsText = /\b(legenda|texto|roteiro|descricao|copy|post|postagens?|campanha|conteudo|lista|liste|listar|monte|tabela|opcoes?|resumo|relatorio|documento|analise|explique|explicar|conceito|programacao|cronograma|calendario|dia|semana|mes|objetivo|empresas?|fornecedores?|provedores?|operadoras?|produtos?|links?|servicos?|anime|animes|manga|mangas|pesquisa|resultado|eleicoes?|eleitoral|candidatos?|votos?|intencoes?\s+de\s+voto)\b/.test(lower);
    const needsAudio = /\b(audio|voz|locucao)\b/.test(lower);
    const needsImage = /\b(imagem|imagens|foto|fotos|tela|screen)\b/.test(lower);
    const needsFolder = /\b(pasta|projeto|diretorio)\b/.test(lower);
    const needsFile = /\b(salve|salvar|arquivo|txt|documento|resultado)\b/.test(lower);

    if (needsBatchProcessing) {
      steps.push({
        type: "process_batch",
        label: "Processando lote de imagens",
        toolName: "process_batch",
        input: {
          goal
        }
      });
      return normalizePlanSteps(steps);
    }

    if (needsSearch) {
      steps.push({
        type: "web_search",
        label: "Pesquisando na web",
        toolName: "web_search",
        input: {
          query: goal,
          maxSources: 5,
          maxSearchResults: 10
        }
      });
    }

    if (needsImage) {
      steps.push({
        type: "analyze_image",
        label: "Analisando imagem",
        toolName: "analyze_image",
        input: { goal }
      });
    }

    if (needsText || needsAudio || needsFile) {
      const searchInstruction = needsSearch
        ? "Use obrigatoriamente o resultado da pesquisa web abaixo como fonte principal. Se a pesquisa nao confirmar algum dado, diga que nao foi confirmado."
        : "Atenda ao objetivo abaixo sem inventar contexto ausente. Se faltar informacao essencial, responda de forma curta indicando o que falta.";

      steps.push({
        type: "generate_text",
        label: needsText ? "Gerando texto" : "Gerando conteudo base",
        toolName: "generate_text",
        input: {
          prompt: `${profile.responseStyle}\n\n${searchInstruction}\n\nObjetivo:\n${goal}`,
          searchResultFromSessionKey: needsSearch ? "lastWebSearchText" : null,
          stream: needsSearch ? false : undefined,
          think: needsSearch ? false : undefined,
          timeoutMs: needsSearch ? 90000 : undefined,
          numPredict: needsSearch ? 520 : undefined,
          source: needsSearch ? "agent-engine.search-synthesis" : undefined
        }
      });
    }

    if (needsAudio) {
      steps.push({
        type: "generate_audio",
        label: "Gerando audio",
        toolName: "generate_audio",
        input: {
          textFromSessionKey: "lastGeneratedText"
        }
      });
    }

    if (needsFolder) {
      steps.push({
        type: "create_folder",
        label: "Criando pasta",
        toolName: "create_folder",
        input: {
          folderName: "agent-output"
        }
      });
    }

    if (needsFile) {
      steps.push({
        type: "save_file",
        label: "Salvando arquivo",
        toolName: "save_file",
        input: {
          folderFromSessionKey: "lastCreatedFolder",
          fileName: "resultado.txt",
          contentFromSessionKey: "lastGeneratedText"
        }
      });
    }

    return normalizePlanSteps(steps);
  }

  async function createPlan({ goal, session, execution }) {
    const profile = getExecutionProfile(execution.mode);
    execution.currentLabel = "Planejando";
    execution.progressText = "Montando plano executavel";
    publishExecutionStatus(execution, {
      status: "planning",
      label: execution.currentLabel,
      progressText: execution.progressText
    });

    if (isBatchGoal(goal)) {
      session.memory.lastPlanSource = "forced-batch-fallback";
      return filterExecutablePlan(buildFallbackPlan(goal, execution.mode, execution.allowWebSearch), context.tools || {});
    }

    if (execution.allowWebSearch !== false && needsWebSearchForGoal(goal)) {
      session.memory.lastPlanSource = "forced-search-fallback";
      return filterExecutablePlan(buildFallbackPlan(goal, execution.mode, execution.allowWebSearch), context.tools || {});
    }

    const executableTools = { ...(context.tools || {}) };
    if (execution.allowWebSearch === false) {
      delete executableTools.web_search;
    }

    const availableTools = Object.keys(executableTools);
    const prompt = `
${profile.plannerRole}

Objetivo:
${goal}

Modo de execucao:
${profile.mode}

Estilo obrigatorio:
${profile.responseStyle}

Ferramentas disponiveis:
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
- Maximo 10 passos
- Use apenas toolName da lista
- Nao invente pesquisa, imagem, audio, arquivo ou pasta se o objetivo nao pedir isso explicitamente
- Se o objetivo pedir pesquisar, buscar, procurar, dados atuais/publicos ou lista de empresas/servicos locais, use web_search antes de generate_text
- Quando usar web_search e depois generate_text, passe "searchResultFromSessionKey": "lastWebSearchText" no input de generate_text
- Se faltar contexto critico, retorne steps vazios
- Nao inclua save_file sem conteudo gerado antes
- Nao inclua generate_audio sem texto real antes
`;

    try {
      const rawPlan = await callLLM(prompt, {
        source: "agent-engine.plan",
        hasTools: true,
        sessionId: session?.id || null,
        executionId: execution.id
      });
      const parsed = extractJson(rawPlan);
      const steps = filterExecutablePlan(parsed?.steps || [], executableTools);

      if (steps.length > 0) {
        session.memory.lastPlanSource = "llm";
        return steps;
      }
    } catch (err) {
      console.error("[AGENT-ENGINE] Falha ao gerar plano por LLM:", err.message);
    }

    session.memory.lastPlanSource = "fallback";
    return filterExecutablePlan(buildFallbackPlan(goal, execution.mode, execution.allowWebSearch), executableTools);
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

    if (resolved.searchResultFromSessionKey) {
      const searchResult = String(session.memory[resolved.searchResultFromSessionKey] || "").trim();
      delete resolved.searchResultFromSessionKey;

      if (searchResult) {
        resolved.searchResult = searchResult;
        resolved.prompt = [
          resolved.prompt || resolved.goal || "",
          "",
          "Resultado da pesquisa web:",
          searchResult
        ].join("\n");
      }
    }

    return resolved;
  }

  async function waitForUserResponse({ sessionId, defaultValue }) {
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

    if (toolName === "web_search") {
      session.memory.lastWebSearch = result.data || null;
      session.memory.lastWebSearchText = result.data?.text || "";
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

    if (toolName === "process_batch") {
      session.memory.lastBatchOutput = result.data || null;
    }
  }

  function validateToolResult(toolName, result) {
    const data = result?.data || {};

    switch (toolName) {
      case "generate_text":
      case "ai_chat":
      case "web_search":
        if (!hasMeaningfulText(data.text)) {
          return "Tool retornou texto vazio ou insuficiente";
        }
        return null;
      case "save_file":
        if (!data.path || !fileExistsWithContent(data.path) || Number(data.bytes || 0) <= 0) {
          return "Arquivo nao foi salvo com conteudo util";
        }
        return null;
      case "generate_audio":
      case "audio_generate":
        if (!data.file || !fileExistsWithContent(data.file)) {
          return "Audio nao foi gerado como arquivo real";
        }
        return null;
      case "analyze_image":
        if (!data.image || !hasMeaningfulText(data.summary)) {
          return "Analise de imagem insuficiente";
        }
        return null;
      case "read_file":
        if (!hasMeaningfulText(data.content)) {
          return "Arquivo lido sem conteudo util";
        }
        return null;
      case "create_folder":
        if (!data.path || !fs.existsSync(data.path)) {
          return "Pasta nao foi criada";
        }
        return null;
      case "process_batch":
        if ((!Array.isArray(data.outputFiles) || data.outputFiles.length === 0) && !Array.isArray(data.rows)) {
          return "Processamento em lote sem artefato ou linhas uteis";
        }
        return null;
      default:
        return null;
    }
  }

  function evaluateExecution(execution) {
    const toolNames = execution.results.map((item) => item.toolName);
    const requiredOutputs = [];

    if (toolNames.includes("generate_text")) {
      requiredOutputs.push((result) => hasMeaningfulText(result?.data?.text));
    }

    if (toolNames.includes("save_file")) {
      requiredOutputs.push((result) => {
        const filePath = result?.data?.path;
        return fileExistsWithContent(filePath);
      });
    }

    if (toolNames.includes("generate_audio") || toolNames.includes("audio_generate")) {
      requiredOutputs.push((result) => {
        const filePath = result?.data?.file;
        return fileExistsWithContent(filePath);
      });
    }

    const successfulArtifacts = execution.results.filter((result) => {
      if (hasMeaningfulText(result?.data?.text)) {
        return true;
      }

      if (fileExistsWithContent(result?.data?.path)) {
        return true;
      }

      if (fileExistsWithContent(result?.data?.file)) {
        return true;
      }

      if (Array.isArray(result?.data?.outputFiles) && result.data.outputFiles.some((filePath) => fileExistsWithContent(filePath))) {
        return true;
      }

      return false;
    });

    if (requiredOutputs.length > 0) {
      const missingRequired = requiredOutputs.some((check) => !execution.results.some(check));
      if (missingRequired) {
        return {
          status: "partial",
          message: "Execucao parcial: faltam artefatos reais para concluir"
        };
      }
    }

    if (successfulArtifacts.length === 0) {
      return {
        status: "partial",
        message: "Execucao parcial: nenhum artefato util foi produzido"
      };
    }

    return {
      status: "ok",
      message: "Projeto concluido"
    };
  }

  async function executeStep({ step, session, sessionId, execution, stepIndex, totalSteps }) {
    const toolName = step.toolName || step.type;
    const tool = context.tools?.[toolName];

    if (typeof tool !== "function") {
      throw new Error(`Tool nao encontrada: ${toolName}`);
    }

    execution.currentStep = stepIndex + 1;
    execution.currentLabel = step.label;
    execution.progressText = `${step.label}... ${execution.currentStep}/${totalSteps}`;

    publishExecutionStatus(execution, {
      status: "running",
      currentStep: execution.currentStep,
      totalSteps,
      label: execution.currentLabel,
      progressText: execution.progressText
    });

    const stepInput = {
      ...resolveInput(step.input, session),
      goal: execution.goal,
      sessionId,
      session,
      step,
      execution
    };

    let result = await tool(stepInput);
    let retries = 0;

    while (result?.status === "need_input" && retries < 3) {
      retries += 1;

      const question = result.question || "Preciso de uma informacao para continuar.";
      const questionKey = result.key || "input";
      const defaultValue = result.default ?? null;

      session.questions[questionKey] = {
        askedAt: Date.now(),
        defaultValue
      };

      publishExecutionStatus(execution, {
        status: "waiting_input",
        label: "Aguardando sua resposta",
        progressText: question
      });

      askUser(question);

      const answer = await waitForUserResponse({
        sessionId,
        defaultValue
      });

      delete session.questions[questionKey];

      publishExecutionStatus(execution, {
        status: "running",
        label: step.label,
        progressText: answer.answered
          ? `Resposta recebida para continuar ${execution.currentStep}/${totalSteps}`
          : `Sem resposta; seguindo com o valor padrao ${execution.currentStep}/${totalSteps}`
      });

      stepInput[questionKey] = answer.value;
      result = await tool(stepInput);
    }

    if (!result || result.status !== "ok") {
      if (toolName === "generate_text" && hasMeaningfulText(session.memory.lastWebSearchText)) {
        result = {
          status: "ok",
          data: {
            text: buildSearchFallbackText(execution.goal, session.memory.lastWebSearch),
            fallbackUsed: true,
            fallbackReason: result?.error || "generate_text_failed_after_web_search"
          }
        };
      } else {
        const errorMessage = result?.error || `Tool ${toolName} falhou ao concluir o passo`;
        throw new Error(errorMessage);
      }
    }

    const validationError = validateToolResult(toolName, result);
    if (validationError) {
      if (toolName === "generate_text" && hasMeaningfulText(session.memory.lastWebSearchText)) {
        result = {
          status: "ok",
          data: {
            text: buildSearchFallbackText(execution.goal, session.memory.lastWebSearch),
            fallbackUsed: true,
            fallbackReason: validationError
          }
        };
      } else {
        throw new Error(validationError);
      }
    }

    persistToolResult(session, toolName, result);
    execution.results.push({
      step: step.label,
      toolName,
      data: result.data ?? null
    });

    return result;
  }

  async function run({ goal, sessionId = "default", mode = "task", executionId = null, allowWebSearch = true }) {
    const normalizedGoal = String(goal || "").trim();
    const session = getSession(sessionId);

    if (!normalizedGoal) {
      return {
        status: "error",
        sessionId,
        error: "Objetivo vazio"
      };
    }

    if (isConversationalGoal(normalizedGoal) && !isExplicitExecutionGoal(normalizedGoal)) {
      return {
        status: "ignored",
        sessionId,
        reason: "conversational_goal"
      };
    }

    if (!isExplicitExecutionGoal(normalizedGoal)) {
      return {
        status: "ignored",
        sessionId,
        reason: "non_executable_goal"
      };
    }

    if (session.activeExecution?.running) {
      return {
        status: "busy",
        sessionId,
        executionId: session.activeExecution.id
      };
    }

    const execution = {
      id: executionId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      goal: normalizedGoal,
      sessionId,
      mode,
      startedAt: Date.now(),
      results: [],
      running: true,
      steps: [],
      currentStep: 0,
      totalSteps: 0,
      currentLabel: "Planejando",
      progressText: "Preparando execucao",
      error: null,
      allowWebSearch: allowWebSearch !== false
    };

    const workspace = createProjectWorkspace(execution.id);
    execution.workspacePath = workspace.workspacePath;
    execution.projectPath = workspace.projectPath;

    session.activeExecution = execution;
    session.executions.push(execution);
    session.memory.lastGoal = normalizedGoal;
    session.memory.lastProjectPath = execution.projectPath;

    publishExecutionStatus(execution, {
      status: "planning",
      label: execution.currentLabel,
      progressText: execution.progressText,
      totalSteps: 0
    });

    try {
      const plan = await createPlan({ goal: normalizedGoal, session, execution });
      execution.steps = plan.slice(0, 10);
      execution.totalSteps = execution.steps.length;

      if (execution.steps.length === 0) {
        throw new Error("Nao encontrei passos executaveis para esse objetivo");
      }

      for (let index = 0; index < execution.steps.length; index += 1) {
        const step = execution.steps[index];
        await executeStep({
          step,
          session,
          sessionId,
          execution,
          stepIndex: index,
          totalSteps: execution.steps.length
        });
      }

      const outcome = evaluateExecution(execution);
      execution.running = false;
      execution.finishedAt = Date.now();
      execution.finalStatus = outcome.status;
      execution.progressText = outcome.message;

      publishExecutionStatus(execution, {
        status: outcome.status === "ok" ? "done" : "error",
        currentStep: execution.steps.length,
        totalSteps: execution.steps.length,
        label: outcome.status === "ok" ? "Concluido" : "Falha na execucao",
        progressText: outcome.message,
        finishedAt: execution.finishedAt,
        error: outcome.status === "ok" ? null : outcome.message
      });

      const summary = buildExecutionSummary(execution);

      if (outcome.status === "ok") {
        return {
          status: "ok",
          sessionId,
          executionId: execution.id,
          steps: execution.steps,
          results: execution.results,
          summary
        };
      }

      return {
        status: outcome.status,
        sessionId,
        executionId: execution.id,
        error: outcome.message,
        steps: execution.steps,
        results: execution.results,
        summary
      };
    } catch (err) {
      execution.running = false;
      execution.finishedAt = Date.now();
      execution.error = err.message;

      publishExecutionStatus(execution, {
        status: "error",
        label: "Falha na execucao",
        progressText: err.message,
        finishedAt: execution.finishedAt,
        error: err.message
      });

      return {
        status: "error",
        sessionId,
        executionId: execution.id,
        error: err.message,
        steps: execution.steps,
        results: execution.results,
        summary: buildExecutionSummary(execution)
      };
    } finally {
      if (session.activeExecution?.id === execution.id) {
        session.activeExecution = null;
      }

      if (execution.finalStatus !== "ok" && execution.error && !execution.finishedAt) {
        clearExecutionStatus(context, execution.id);
      }
    }
  }

  return {
    run
  };
}
