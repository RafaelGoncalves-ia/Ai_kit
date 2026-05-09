const { STUDIO_SCRIPT_SCHEMA } = require("./studioScriptSchema");
const { normalizeStudioScript } = require("./studioScriptNormalizer");

function extractJsonObject(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function buildScriptPrompt({ projectId, briefing, clientKit }) {
  const isCarousel = String(briefing?.mediaType || "").toLowerCase() === "carrossel";

  return [
    "Voce e roteirista audiovisual senior, diretor criativo e especialista em prompts de geracao visual.",
    "Gere um roteiro completo para o KIT Studio no schema abaixo.",
    "Retorne somente JSON valido, sem markdown e sem texto fora do JSON.",
    "",
    "Schema de saida:",
    JSON.stringify(STUDIO_SCRIPT_SCHEMA.fields, null, 2),
    "",
    "Projeto:",
    JSON.stringify({ projectId }, null, 2),
    "",
    "Briefing aprovado:",
    JSON.stringify(briefing || {}, null, 2),
    "",
    "Cliente.kit quando existir:",
    JSON.stringify(clientKit || null, null, 2),
    "",
    "Regras obrigatorias:",
    "- Respeite duration total do briefing.",
    "- Use duracao padrao de 5s por cena quando possivel.",
    "- Duracoes permitidas por cena: 3, 5, 7, 10, 12, 15.",
    "- Nenhuma cena pode passar de 15s.",
    "- Cada cena deve ser independente e compreensivel isoladamente.",
    "- Gere visualPrompt positivo completo por cena.",
    "- Gere negativePrompt por cena.",
    "- Posicione references por cena quando houver referencias.",
    "- Gere narration, subtitle e motionPrompt para video.",
    "- Nao gere voz XTTS, imagem final ou video final.",
    isCarousel
      ? "- Para carrossel: narration, subtitle e motionPrompt devem ser strings vazias; mediaType image; generationMode t2i."
      : "- Para video: cada cena pode ter narration, subtitle, visualPrompt, negativePrompt e motionPrompt.",
    "- approved deve ser false para todas as cenas.",
    "- postCaption deve ser legenda pronta do projeto."
  ].join("\n");
}

async function callLlm({ context, prompt, warnings }) {
  const ai = context?.services?.ai || context?.rawServices?.ai;
  if (!ai?.chat) {
    warnings.push("LLM indisponivel; roteiro criado com fallback estrutural.");
    return null;
  }

  try {
    const result = await ai.chat(prompt, {
      emitEvents: false,
      think: false,
      timeoutMs: 120000,
      meta: {
        source: "studio.script-generator"
      }
    }, {
      source: "studio.script-generator"
    });
    return extractJsonObject(result?.text || "");
  } catch (err) {
    warnings.push(`LLM falhou ao gerar roteiro: ${err.message || err}`);
    return null;
  }
}

async function generateStudioScript({ projectId = "", briefing = {}, clientKit = null, context = null } = {}) {
  const warnings = [];
  const prompt = buildScriptPrompt({ projectId, briefing, clientKit });
  const llmScript = await callLlm({ context, prompt, warnings });
  const script = normalizeStudioScript(llmScript || {}, {
    briefing,
    clientKit,
    attachments: briefing?.detected?.attachedFiles || []
  });

  return {
    totalDuration: script.totalDuration,
    postCaption: script.postCaption,
    scenes: script.scenes,
    warnings: Array.from(new Set(warnings.filter(Boolean)))
  };
}

module.exports = {
  generateStudioScript,
  buildScriptPrompt,
  extractJsonObject
};
