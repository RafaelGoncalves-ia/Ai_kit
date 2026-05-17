import { loadConfig } from "../configLoader.js";
import { parseAgentToolMessage } from "./ToolRequestParser.js";
import { createAgentWebSearchAdapter } from "./tools/AgentWebSearchAdapter.js";

const DEFAULT_CONFIG = {
  enabled: false,
  maxToolRounds: 3,
  allowedTools: ["web_search"],
  requireSourcesForWebAnswers: true,
  webSearch: {
    maxSources: 3,
    maxSearchResults: 8,
    allowDomainRestriction: true
  }
};

function mergeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    allowedTools: Array.isArray(config.allowedTools) ? config.allowedTools : DEFAULT_CONFIG.allowedTools,
    webSearch: {
      ...DEFAULT_CONFIG.webSearch,
      ...(config.webSearch || {})
    }
  };
}

function uniqueSources(sources = []) {
  const seen = new Set();
  const output = [];

  for (const source of sources) {
    const url = String(source?.url || "").trim();
    const key = url || `${source?.title || ""}:${source?.domain || ""}`;
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push({
      title: String(source?.title || "Fonte sem titulo").trim(),
      url,
      domain: String(source?.domain || "").trim()
    });
  }

  return output;
}

function formatSources(sources = []) {
  const clean = uniqueSources(sources);
  if (!clean.length) {
    return "";
  }

  return [
    "",
    "Fontes:",
    ...clean.map((source) => `- ${source.title}${source.domain ? ` (${source.domain})` : ""}${source.url ? ` - ${source.url}` : ""}`)
  ].join("\n");
}

function buildInitialPrompt(goal, allowedTools = ["web_search"]) {
  return [
    "Voce esta operando em modo agente com ferramentas.",
    "Durante o loop interno, responda somente JSON valido.",
    `Ferramentas permitidas nesta execucao: ${allowedTools.length ? allowedTools.join(", ") : "nenhuma"}.`,
    "",
    "Se nao tiver informacao suficiente, solicite busca:",
    "{",
    '  "type": "tool_request",',
    '  "tool": "web_search",',
    '  "reason": "...",',
    '  "query": "...",',
    '  "domain": null',
    "}",
    "",
    "Se ja tiver informacao suficiente, responda:",
    "{",
    '  "type": "final",',
    '  "answer": "...",',
    '  "sources": []',
    "}",
    "",
    "Regras:",
    "- Se usar informacoes vindas da web, inclua fontes em sources.",
    "- Nao invente fontes.",
    "- Nao cite fonte que nao veio da ferramenta.",
    "- Nao solicite busca se a pergunta puder ser respondida com conhecimento local estavel.",
    "- Nao faca mais de uma busca sem necessidade clara.",
    "- Nao tente executar codigo, comandos, URLs locais ou ferramentas fora do JSON.",
    "- Mantenha persona desativada e responda de forma objetiva.",
    "",
    "Pedido do usuario:",
    goal
  ].join("\n");
}

function buildFollowupPrompt({ goal, toolResults = [], allowedTools = ["web_search"] }) {
  return [
    buildInitialPrompt(goal, allowedTools),
    "",
    "Resultados de ferramentas ja coletados:",
    JSON.stringify(toolResults, null, 2),
    "",
    "Agora responda com JSON final ou solicite nova busca apenas se for indispensavel."
  ].join("\n");
}

export function loadAgentToolLoopConfig() {
  return mergeConfig(loadConfig("agent.tools.json"));
}

export function createAgentToolLoop(context, config = loadAgentToolLoopConfig()) {
  const loopConfig = mergeConfig(config);
  const webSearch = createAgentWebSearchAdapter(context, loopConfig);

  async function callAgentLLM(prompt, meta = {}) {
    const result = await context.invokeTool("ai_chat", {
      prompt,
      source: "agent-tool-loop",
      sessionId: meta.sessionId,
      executionId: meta.executionId,
      stream: false,
      think: false,
      emitEvents: false,
      hasTools: true,
      temperature: 0.2,
      numPredict: 2200,
      timeoutMs: 120000
    });

    return String(result?.data?.text || "").trim();
  }

  async function run({ goal, sessionId = "default", executionId = null, allowWebSearch = true } = {}) {
    const normalizedGoal = String(goal || "").trim();
    if (!normalizedGoal) {
      return { status: "error", error: "Objetivo vazio" };
    }

    console.log("[AGENT-TOOL-LOOP] start");

    const maxRounds = Math.max(0, Number(loopConfig.maxToolRounds || 0));
    const activeAllowedTools = allowWebSearch === false
      ? loopConfig.allowedTools.filter((tool) => tool !== "web_search")
      : loopConfig.allowedTools;
    const toolResults = [];
    let usedWeb = false;
    let prompt = buildInitialPrompt(normalizedGoal, activeAllowedTools);

    for (let round = 0; round <= maxRounds; round += 1) {
      const raw = await callAgentLLM(prompt, { sessionId, executionId });
      const parsed = parseAgentToolMessage(raw, {
        allowedTools: activeAllowedTools
      });

      if (!parsed.ok) {
        console.warn("[AGENT-TOOL-LOOP] invalid tool request", parsed.error);
        return {
          status: "error",
          error: `Resposta invalida do agente: ${parsed.error}`,
          raw
        };
      }

      const message = parsed.value;

      if (message.type === "final") {
        const collectedSources = uniqueSources(toolResults.flatMap((item) => item.results || []));
        const finalSources = uniqueSources(message.sources?.length ? message.sources : collectedSources);

        if (usedWeb && loopConfig.requireSourcesForWebAnswers && finalSources.length === 0) {
          return {
            status: "error",
            error: "Resposta web sem fontes."
          };
        }

        console.log("[AGENT-TOOL-LOOP] final");
        return {
          status: "ok",
          answer: message.answer,
          sources: finalSources,
          usedWeb,
          text: `${message.answer}${usedWeb ? formatSources(finalSources) : ""}`
        };
      }

      if (round >= maxRounds) {
        console.warn("[AGENT-TOOL-LOOP] max rounds reached");
        const sources = uniqueSources(toolResults.flatMap((item) => item.results || []));
        return {
          status: "ok",
          answer: "Atingi o limite de rodadas de busca. Segue o melhor resultado parcial com as fontes coletadas.",
          sources,
          usedWeb,
          limited: true,
          text: `Atingi o limite de rodadas de busca. Segue o melhor resultado parcial com as fontes coletadas.${formatSources(sources)}`
        };
      }

      if (message.type === "tool_request") {
        if (!activeAllowedTools.includes(message.tool)) {
          console.warn("[AGENT-TOOL-LOOP] invalid tool request", message.tool);
          return {
            status: "error",
            error: `Ferramenta nao permitida: ${message.tool}`
          };
        }

        console.log(`[AGENT-TOOL-LOOP] tool_request web_search query="${message.query}"`);
        const result = await webSearch(message);
        usedWeb = true;
        toolResults.push(result);
        console.log(`[AGENT-TOOL-LOOP] tool_result web_search sources=${result.results.length}`);
        prompt = buildFollowupPrompt({ goal: normalizedGoal, toolResults, allowedTools: activeAllowedTools });
      }
    }

    console.warn("[AGENT-TOOL-LOOP] max rounds reached");
    const sources = uniqueSources(toolResults.flatMap((item) => item.results || []));
    return {
      status: "ok",
      answer: "Atingi o limite de rodadas de busca.",
      sources,
      usedWeb,
      limited: true,
      text: `Atingi o limite de rodadas de busca.${formatSources(sources)}`
    };
  }

  return {
    enabled: loopConfig.enabled === true,
    run
  };
}
