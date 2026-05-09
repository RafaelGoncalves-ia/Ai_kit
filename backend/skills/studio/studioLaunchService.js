const {
  createStudioProject,
  createStudioScene
} = require("./studioProjectSchema");
const { saveStudioProject } = require("./studioProjectStore");
const { buildStudioBriefingFromCommand } = require("./studioBriefingBuilder");

function stripAccents(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value = "") {
  return stripAccents(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cleanName(value = "") {
  return String(value || "")
    .replace(/[.!?;,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromText(value = "", fallback = "Projeto Studio") {
  const cleaned = cleanName(value)
    .split(/\s+/)
    .slice(0, 7)
    .join(" ");
  return cleaned || fallback;
}

function pickMatch(text = "", patterns = []) {
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (match?.[1]) {
      return cleanName(match[1]);
    }
  }
  return "";
}

function detectStudioIntent(command = "") {
  const normalized = normalizeText(command);
  const actionSignal = /\b(cria|criar|crie|gera|gerar|gere|produz|produzir|produza|monta|montar|faca|fazer|desenvolva|roteiriza|roteiro)\b/.test(normalized);
  const visualSignal = /\b(studio|video|videos|reels?|shorts?|tiktok|story|stories|imagem|imagens|foto|fotos|post|arte|campanha|criativo|carrossel|visual|audiovisual)\b/.test(normalized);
  const productionSignal = /\b(briefing|roteiro|cenas?|prompt|prompts?|conteudo|peca|pecas|anuncio|anuncios)\b/.test(normalized);
  const explicitStudio = /\b(studio|kit studio)\b/.test(normalized);

  if (/\bcanvas\b/.test(normalized) && !explicitStudio) {
    return {
      matches: false,
      confidence: 0,
      signals: {
        action: actionSignal,
        visual: visualSignal,
        production: productionSignal,
        explicitStudio
      }
    };
  }

  let confidence = 0;
  if (actionSignal) confidence += 0.35;
  if (visualSignal) confidence += 0.45;
  if (productionSignal) confidence += 0.15;
  if (explicitStudio) confidence += 0.25;

  return {
    matches: explicitStudio || (confidence >= 0.55),
    confidence: Math.min(1, Number(confidence.toFixed(2))),
    signals: {
      action: actionSignal,
      visual: visualSignal,
      production: productionSignal,
      explicitStudio
    }
  };
}

function inferMediaType(command = "") {
  const normalized = normalizeText(command);
  if (/\b(carrossel|carousel)\b/.test(normalized)) return "carrossel";
  if (/\b(imagem|foto|post|arte)\b/.test(normalized) && !/\b(video|reels?|shorts?|tiktok|story|stories)\b/.test(normalized)) return "imagem";
  return "clip";
}

function inferPlatform(command = "") {
  const normalized = normalizeText(command);
  if (/\btiktok\b/.test(normalized)) return "TikTok";
  if (/\bshorts?|youtube\b/.test(normalized)) return "YouTube Shorts";
  if (/\bstory|stories\b/.test(normalized)) return "Stories";
  if (/\breels?\b/.test(normalized)) return "Reels";
  if (/\binstagram|feed|post\b/.test(normalized)) return "Instagram";
  return "Instagram";
}

function inferRatio(command = "", mediaType = "clip") {
  const normalized = normalizeText(command);
  if (/\b16:9|horizontal|youtube\b/.test(normalized)) return "16:9";
  if (/\b1:1|quadrado|square\b/.test(normalized)) return "1:1";
  if (/\b3:4|4:5|post|feed|imagem|foto\b/.test(normalized) && mediaType !== "clip") return "3:4";
  return "9:16";
}

function inferDuration(command = "", mediaType = "clip") {
  const normalized = normalizeText(command);
  const match = normalized.match(/(\d{1,3})\s*(?:s|seg|segundos?|min|minutos?)/);
  if (match?.[1]) return String(Math.max(5, Math.min(180, Number(match[1]))));
  if (mediaType === "imagem") return "";
  if (mediaType === "carrossel" || mediaType === "stories") return "30";
  return "30";
}

function inferClientName(command = "") {
  return pickMatch(command, [
    /\bcliente\s+([^,.;\n]+?)(?:\s+sobre|\s+com|\s+para|\s+no|\s+na|$)/i,
    /\bpara\s+(?:o|a|os|as)?\s*cliente\s+([^,.;\n]+?)(?:\s+sobre|\s+com|\s+no|\s+na|$)/i,
    /\bda\s+([^,.;\n]+?)(?:\s+sobre|\s+com|\s+no|\s+na|$)/i,
    /\bdo\s+([^,.;\n]+?)(?:\s+sobre|\s+com|\s+no|\s+na|$)/i,
    /\bpara\s+(?!postar\b|publicar\b|divulgar\b|gerar\b|criar\b)([^,.;\n]+?)(?:\s+sobre|\s+com|\s+no|\s+na|$)/i
  ]) || "Cliente nao definido";
}

function inferProductName(command = "") {
  return pickMatch(command, [
    /\bproduto\s+([^,.;\n]+)/i,
    /\bsobre\s+(?:o|a|os|as)?\s*produto\s+([^,.;\n]+)/i,
    /\bsobre\s+([^,.;\n]+)/i,
    /\btema\s+([^,.;\n]+)/i
  ]);
}

function buildInitialBriefing({ command, clientName, productName, mediaType, platform, ratio, duration, attachments }) {
  const target = productName || titleFromText(command, "a oferta principal");
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  return {
    theme: target,
    purpose: `Criar uma peca visual para ${clientName}, apresentando ${target} com clareza, impacto e chamada para acao.`,
    audience: "Publico interessado na solucao, produto ou servico descrito no comando inicial.",
    visualMaterial: hasAttachments ? "user + aigc" : "aigc",
    duration,
    mediaType,
    ratio,
    platform,
    postType: mediaType === "imagem" ? "post" : mediaType,
    videoContent: `Direcao inicial baseada no comando: ${command}`,
    videoNarration: "",
    bgmStyle: mediaType === "clip" ? "trilha moderna, leve e comercial" : "",
    subtitleInfo: mediaType === "clip" ? "legendas dinamicas e legiveis" : "",
    materialReferences: [
      `Abertura com apresentacao clara de ${target}.`,
      "Bloco central mostrando beneficio, prova visual ou contexto de uso.",
      "Fechamento com identidade da marca e chamada para acao."
    ],
    rawReferences: hasAttachments
      ? attachments.map((item) => item.fileName || item.name || item.path || "anexo").join("\n")
      : ""
  };
}

function buildInitialScenes({ briefing, mediaType }) {
  if (mediaType === "imagem") {
    return [
      createStudioScene({
        id: "scene_01",
        index: 1,
        title: "Arte principal",
        duration: 5,
        status: "prompt-ready",
        narration: "",
        visualDescription: `Imagem principal para ${briefing.theme}, com composicao limpa, foco no beneficio e espaco para chamada visual.`,
        visualPrompt: `Crie uma imagem publicitaria para ${briefing.theme}, formato ${briefing.ratio}, visual profissional, boa iluminacao, composicao clara, identidade comercial forte.`
      })
    ];
  }

  return [
    createStudioScene({
      id: "scene_01",
      index: 1,
      title: "Gancho",
      duration: 8,
      status: "prompt-ready",
      narration: `Apresente rapidamente ${briefing.theme} com uma frase de impacto.`,
      visualDescription: `Cena de abertura com impacto visual e contexto claro sobre ${briefing.theme}.`,
      visualPrompt: `Cena vertical ${briefing.ratio}, abertura impactante sobre ${briefing.theme}, estilo comercial moderno, alta nitidez.`
    }),
    createStudioScene({
      id: "scene_02",
      index: 2,
      title: "Beneficio",
      duration: 12,
      status: "prompt-ready",
      narration: "Mostre o principal beneficio e por que ele importa para o publico.",
      visualDescription: "Cena explicativa com elementos visuais que reforcam valor, confianca e resultado.",
      visualPrompt: `Cena explicativa para ${briefing.theme}, demonstrando beneficio principal, linguagem visual clara, realista e comercial.`
    }),
    createStudioScene({
      id: "scene_03",
      index: 3,
      title: "Chamada final",
      duration: 10,
      status: "prompt-ready",
      narration: "Finalize com chamada para acao direta e facil de entender.",
      visualDescription: "Cena final com destaque para marca, produto e CTA.",
      visualPrompt: `Cena final para ${briefing.theme}, chamada para acao, espaco para logotipo, composicao limpa e memoravel.`
    })
  ];
}

function buildAssistantMessage({ project }) {
  return `Abri o KIT Studio e montei um briefing inicial para ${project.clientName}. A aba Briefing ja esta liberada e o comando original foi mantido no chat lateral.`;
}

async function createStudioProjectFromCommand({ command = "", source = "unknown", attachments = [], context = null } = {}) {
  const safeCommand = String(command || "").trim();
  if (!safeCommand) {
    throw new Error("Comando obrigatorio para criar projeto Studio.");
  }

  const detectedIntent = detectStudioIntent(safeCommand);
  const parsed = await buildStudioBriefingFromCommand({
    command: safeCommand,
    attachments,
    context
  });
  const parsedBriefing = parsed.briefing || {};
  const mediaType = parsedBriefing.mediaType || inferMediaType(safeCommand);
  const platform = parsedBriefing.platform || inferPlatform(safeCommand);
  const ratio = parsedBriefing.ratio || inferRatio(safeCommand, mediaType);
  const duration = parsedBriefing.duration ?? inferDuration(safeCommand, mediaType);
  const clientName = parsed.client?.name || inferClientName(safeCommand);
  const productName = parsed.client?.productName || parsed.variables?.productName || inferProductName(safeCommand);
  const projectName = titleFromText(productName || safeCommand, "Projeto Studio");
  const briefing = {
    ...buildInitialBriefing({
      command: safeCommand,
      clientName,
      productName,
      mediaType,
      platform,
      ratio,
      duration,
      attachments
    }),
    ...parsedBriefing,
    visualMaterial: parsedBriefing.visualMaterialMode || (typeof parsedBriefing.visualMaterial === "string" ? parsedBriefing.visualMaterial : parsedBriefing.visualMaterial?.mode) || "aigc"
  };
  const scenes = buildInitialScenes({ briefing, mediaType });
  const project = createStudioProject({
    source,
    clientName,
    productName,
    projectName,
    inputCommand: safeCommand,
    postCaption: briefing.postCaption || "",
    attachments,
    currentStep: "briefing",
    currentTab: "briefing",
    unlockedTabs: ["briefing", "script"],
    progress: {
      currentTask: "Briefing inicial gerado",
      percent: 35,
      completedSteps: 1,
      totalSteps: 2,
      elapsedMs: 0
    },
    briefing,
    script: {
      approved: false,
      totalDuration: Number(duration || scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0)),
      scenes
    }
  });
  const saved = saveStudioProject(project);
  const assistantMessage = buildAssistantMessage({ project: saved.project });
  const now = new Date().toISOString();

  return {
    projectId: saved.project.id,
    initialState: {
      project: saved.project,
      filePath: saved.filePath,
      messages: [
        {
          id: `msg-user-${Date.now()}`,
          role: "user",
          type: "command",
          timestamp: now,
          text: safeCommand
        },
        {
          id: `msg-kit-${Date.now()}`,
          role: "assistant",
          type: "briefing",
          timestamp: now,
          text: assistantMessage
        }
      ],
      launch: {
        source,
        detectedIntent,
        briefingWarnings: parsed.warnings || [],
        extractedVariables: parsed.variables || {},
        assistantMessage
      }
    }
  };
}

module.exports = {
  createStudioProjectFromCommand,
  detectStudioIntent
};
