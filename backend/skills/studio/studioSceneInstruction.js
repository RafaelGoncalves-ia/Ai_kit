const { normalizeStudioScene } = require("./studioProjectSchema");

const ALLOWED_FIELDS = [
  "narration",
  "subtitle",
  "visualDescription",
  "visualPrompt",
  "negativePrompt",
  "motionPrompt",
  "references"
];

function asString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function ensureArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

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

function normalizeReference(item, index = 0) {
  if (typeof item === "string") {
    return {
      id: `ref_${index + 1}`,
      label: item,
      type: "text",
      path: "",
      role: "scene-reference"
    };
  }

  return {
    id: asString(item?.id || `ref_${index + 1}`),
    label: asString(item?.label || item?.name || item?.fileName || item?.path || `Referencia ${index + 1}`),
    type: asString(item?.type || item?.kind || "reference"),
    path: asString(item?.path || item?.filePath || ""),
    role: asString(item?.role || "scene-reference"),
    source: asString(item?.source || "")
  };
}

function sanitizeScenePatch(rawPatch = {}) {
  const patch = {};

  for (const field of ALLOWED_FIELDS) {
    if (!(field in rawPatch)) {
      continue;
    }

    if (field === "references") {
      patch.references = ensureArray(rawPatch.references).map(normalizeReference);
      continue;
    }

    patch[field] = asString(rawPatch[field]);
  }

  return patch;
}

function buildSceneInstructionPrompt({ projectId = "", sceneId = "", instruction = "", scene = {}, briefing = {}, history = [] } = {}) {
  return [
    "Voce e editor de roteiro e diretor criativo do KIT Studio.",
    "Sua tarefa e ajustar apenas a cena selecionada com base na instrucao do usuario.",
    "Retorne somente JSON valido, sem markdown e sem texto fora do JSON.",
    "",
    "Formato de saida obrigatorio:",
    JSON.stringify({
      assistantMessage: "resumo curto do ajuste aplicado",
      scenePatch: {
        narration: "",
        subtitle: "",
        visualDescription: "",
        visualPrompt: "",
        negativePrompt: "",
        motionPrompt: "",
        references: [
          {
            id: "ref_1",
            label: "Referencia",
            type: "reference",
            path: "",
            role: "scene-reference",
            source: ""
          }
        ]
      }
    }, null, 2),
    "",
    "Regras obrigatorias:",
    "- Altere somente a cena selecionada.",
    "- Nao altere briefing global, duracao, mediaType, generationMode, status, approved ou assets.",
    "- So inclua em scenePatch os campos que realmente mudaram.",
    "- Voce pode atualizar apenas estes campos: narration, subtitle, visualDescription, visualPrompt, negativePrompt, motionPrompt, references.",
    "- Se a instrucao pedir algo global, ignore a parte global e ajuste somente a cena.",
    "- assistantMessage deve resumir o que foi alterado em 1 ou 2 frases curtas.",
    "- references deve ser array estruturado quando houver mudanca de referencias.",
    "",
    "Projeto:",
    JSON.stringify({ projectId, sceneId }, null, 2),
    "",
    "Briefing de contexto:",
    JSON.stringify(briefing || {}, null, 2),
    "",
    "Cena atual:",
    JSON.stringify(scene || {}, null, 2),
    "",
    "Historico recente da cena:",
    JSON.stringify(ensureArray(history).slice(-6), null, 2),
    "",
    "Instrucao do usuario:",
    instruction
  ].join("\n");
}

async function callLlm({ context, prompt, warnings }) {
  const ai = context?.services?.ai || context?.rawServices?.ai;
  if (!ai?.chat) {
    warnings.push("LLM indisponivel para ajuste contextual da cena.");
    return null;
  }

  try {
    const result = await ai.chat(prompt, {
      emitEvents: false,
      think: false,
      timeoutMs: 120000,
      meta: {
        source: "studio.scene-instruction"
      }
    }, {
      source: "studio.scene-instruction"
    });
    return extractJsonObject(result?.text || "");
  } catch (err) {
    warnings.push(`LLM falhou ao ajustar cena: ${err.message || err}`);
    return null;
  }
}

function buildFallbackPatch({ instruction = "", scene = {} } = {}) {
  const text = asString(instruction);
  if (!text) {
    return {};
  }

  if (/prompt negativo/i.test(text)) {
    return { negativePrompt: text };
  }

  if (/prompt/i.test(text)) {
    return { visualPrompt: text };
  }

  if (/legenda|subtitle/i.test(text)) {
    return { subtitle: text };
  }

  if (/narracao|narração|texto falado|voice/i.test(text)) {
    return { narration: text };
  }

  return {
    visualDescription: `${asString(scene.visualDescription || "")}\nAjuste solicitado: ${text}`.trim()
  };
}

async function applyStudioSceneInstruction({ projectId = "", sceneId = "", instruction = "", scene = {}, briefing = {}, context = null } = {}) {
  const warnings = [];
  const baseScene = normalizeStudioScene(scene || {});
  const recentHistory = ensureArray(baseScene.history);
  const prompt = buildSceneInstructionPrompt({
    projectId,
    sceneId,
    instruction,
    scene: baseScene,
    briefing,
    history: recentHistory
  });

  const llmResult = await callLlm({ context, prompt, warnings });
  const scenePatch = sanitizeScenePatch(llmResult?.scenePatch || buildFallbackPatch({ instruction, scene: baseScene }));
  const assistantMessage = asString(
    llmResult?.assistantMessage || "Ajustei a cena selecionada e mantive o briefing global intacto."
  );

  const nextScene = normalizeStudioScene({
    ...baseScene,
    ...scenePatch,
    status: "context-updated",
    history: [
      ...recentHistory,
      {
        at: new Date().toISOString(),
        role: "user",
        type: "scene-instruction",
        text: asString(instruction)
      },
      {
        at: new Date().toISOString(),
        role: "assistant",
        type: "scene-instruction-result",
        text: assistantMessage,
        patch: scenePatch
      }
    ].slice(-20)
  });

  return {
    updatedScene: nextScene,
    assistantMessage,
    warnings: Array.from(new Set(warnings.filter(Boolean)))
  };
}

module.exports = {
  applyStudioSceneInstruction
};
