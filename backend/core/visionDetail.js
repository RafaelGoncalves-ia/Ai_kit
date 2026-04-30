export const VISION_DETAIL_AUTO = "auto";
export const VISION_DETAIL_TOKEN_BUDGETS = [70, 140, 280, 560, 1120];
export const VISION_DETAIL_ALLOWED_VALUES = [VISION_DETAIL_AUTO, ...VISION_DETAIL_TOKEN_BUDGETS];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeVisionDetailTokenBudget(value = VISION_DETAIL_AUTO) {
  if (value === VISION_DETAIL_AUTO) {
    return VISION_DETAIL_AUTO;
  }

  const numberValue = Number(value);
  return VISION_DETAIL_TOKEN_BUDGETS.includes(numberValue) ? numberValue : VISION_DETAIL_AUTO;
}

function inferVisionTask({ source = "", prompt = "", mediaType = "" } = {}) {
  const text = normalizeText(`${source} ${prompt} ${mediaType}`);

  if ([
    "ocr",
    "documento",
    "tabela",
    "planilha",
    "pdf",
    "comprovante",
    "texto pequeno",
    "letra pequena",
    "ler",
    "leia",
    "escrito",
    "campo",
    "label",
    "rotulo",
    "transcreva",
    "extrair texto",
    "ler texto"
  ].some((term) => text.includes(term))) {
    return { reason: "ocr_document", selected: text.includes("pequeno") || text.includes("tabela") ? 1120 : 560 };
  }

  if ([
    "jogo",
    "game",
    "interface",
    "ui",
    "tela",
    "screen",
    "screenshot",
    "tabuleiro",
    "jogo da velha",
    "screen_analysis"
  ].some((term) => text.includes(term))) {
    return { reason: "screen_analysis", selected: text.includes("tabuleiro") || text.includes("jogo") ? 140 : 280 };
  }

  if ([
    "classifique",
    "classificacao",
    "legenda",
    "caption",
    "identifique",
    "objeto",
    "cena",
    "o que e"
  ].some((term) => text.includes(term))) {
    return { reason: "simple_visual", selected: text.includes("legenda") || text.includes("cena") ? 140 : 70 };
  }

  return { reason: "fallback", selected: 280 };
}

export function resolveVisionDetailTokenBudget(config = {}, request = {}) {
  const configured = normalizeVisionDetailTokenBudget(config?.vision?.detailTokenBudget ?? VISION_DETAIL_AUTO);
  if (configured !== VISION_DETAIL_AUTO) {
    return {
      configured,
      selected: configured,
      mode: "manual",
      reason: "manual"
    };
  }

  const inferred = inferVisionTask(request);
  return {
    configured: VISION_DETAIL_AUTO,
    selected: inferred.selected,
    mode: "auto",
    reason: inferred.reason
  };
}

export function logVisionDetailSelection(selection) {
  if (!selection) return;

  if (selection.mode === "manual") {
    console.log(`[VISION] detailTokenBudget=${selection.selected} mode=manual`);
    return;
  }

  console.log(
    `[VISION] detailTokenBudget=auto selected=${selection.selected} reason=${selection.reason || "fallback"}`
  );
}
