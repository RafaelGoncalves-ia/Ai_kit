const { parseInitialCommand } = require("./studioBriefingParser");
const { findClientKit } = require("./clientKitLoader");
const { STUDIO_BRIEFING_SCHEMA } = require("./studioBriefingSchema");
const { normalizeBriefing } = require("./studioBriefingNormalizer");

function extractJsonObject(text = "") {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) {
    return null;
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function buildPrompt({ command, variables, client, clientKit }) {
  return [
    "Voce e um estrategista senior de social media e produtor audiovisual.",
    "Preencha um briefing estruturado para producao visual usando o schema abaixo.",
    "Nao invente dados tecnicos do cliente. Use o cliente.kit quando existir e o comando original como fonte principal.",
    "Retorne somente JSON valido, sem markdown, sem explicacoes e sem texto fora do JSON.",
    "",
    "Schema esperado:",
    JSON.stringify(STUDIO_BRIEFING_SCHEMA.fields, null, 2),
    "",
    "Comando original:",
    command || "",
    "",
    "Variaveis objetivas extraidas pelo parser:",
    JSON.stringify(variables || {}, null, 2),
    "",
    "Cliente detectado:",
    JSON.stringify(client || {}, null, 2),
    "",
    "Cliente.kit carregado quando existir:",
    JSON.stringify(clientKit || null, null, 2),
    "",
    "Regras:",
    "- theme deve ser claro e especifico.",
    "- purpose deve ser objetivo de comunicacao, nao descricao generica.",
    "- audience deve ser publico provavel.",
    "- videoContent deve orientar narrativa e conteudo visual.",
    "- videoNarration deve sugerir narracao quando fizer sentido.",
    "- postCaption deve ser uma legenda pronta para postagem.",
    "- characters, styleList e materialReferences devem ser listas.",
    "- visualMaterial deve ser aigc, user ou user + aigc.",
    "- Se formato/proporcao nao vier no comando nem no cliente.kit: video usa 9:16; imagem usa 3:4."
  ].join("\n");
}

async function callLlm({ context, prompt, warnings }) {
  const ai = context?.services?.ai || context?.rawServices?.ai;
  if (!ai?.chat) {
    warnings.push("LLM indisponivel; briefing normalizado com variaveis extraidas.");
    return null;
  }

  try {
    const result = await ai.chat(prompt, {
      emitEvents: false,
      think: false,
      timeoutMs: 90000,
      meta: {
        source: "studio.briefing-builder"
      }
    }, {
      source: "studio.briefing-builder"
    });
    return extractJsonObject(result?.text || "");
  } catch (err) {
    warnings.push(`LLM falhou ao preencher briefing: ${err.message || err}`);
    return null;
  }
}

async function buildStudioBriefingFromCommand({ command = "", attachments = [], context = null } = {}) {
  const parsed = parseInitialCommand({ command, attachments });
  const kitLookup = findClientKit(parsed.variables.clientName, parsed.variables.attachments);
  const warnings = [
    ...(parsed.warnings || []),
    ...(kitLookup.warnings || [])
  ];
  const client = {
    ...kitLookup.client,
    name: parsed.variables.clientName || kitLookup.client?.name || "Cliente nao definido",
    productName: parsed.variables.productName || "",
    detectedFromCommand: Boolean(parsed.variables.clientName)
  };
  const prompt = buildPrompt({
    command: parsed.command,
    variables: parsed.variables,
    client,
    clientKit: kitLookup.clientKit
  });
  const llmBriefing = await callLlm({ context, prompt, warnings });
  const briefing = normalizeBriefing(llmBriefing || {}, {
    command: parsed.command,
    variables: parsed.variables,
    client,
    clientKit: kitLookup.clientKit
  });

  return {
    client,
    clientKit: kitLookup.clientKit,
    variables: parsed.variables,
    briefing,
    warnings: Array.from(new Set(warnings.filter(Boolean)))
  };
}

module.exports = {
  buildStudioBriefingFromCommand,
  buildPrompt,
  extractJsonObject
};
