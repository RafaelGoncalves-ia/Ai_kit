import fs from "fs";
import path from "path";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function hasAny(text, keywords = []) {
  return keywords.some((keyword) => text.includes(keyword));
}

function sanitizeBaseName(value, fallback = "resultado-lote") {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function parseFieldsFromGoal(goal) {
  const normalized = normalizeText(goal);
  const fields = [];

  if (normalized.includes("arquivo") || normalized.includes("nome do arquivo")) {
    fields.push("arquivo");
  }
  if (normalized.includes("data")) {
    fields.push("data");
  }
  if (normalized.includes("valor")) {
    fields.push("valor_total");
  }
  if (normalized.includes("categoria")) {
    fields.push("categoria");
  }
  if (normalized.includes("legenda")) {
    fields.push("legenda");
  }
  if (normalized.includes("roteiro")) {
    fields.push("roteiro");
  }

  return [...new Set(fields)];
}

function extractDataPathFromGoal(goal) {
  const rawGoal = String(goal || "").replace(/\//g, "\\");
  const workspaceMatch = rawGoal.match(/workspace\\([^\\/:*?"<>|\r\n]+)(?:\\([^:*?"<>|\r\n]+(?:\\[^:*?"<>|\r\n]+)*))?/i);
  const legacyMatch = rawGoal.match(/(?:agent-workspace\\)?dados\\([^\\/:*?"<>|\r\n]+)(?:\\([^:*?"<>|\r\n]+(?:\\[^:*?"<>|\r\n]+)*))?/i);
  const match = workspaceMatch || legacyMatch;
  if (!match?.[1]) {
    return null;
  }

  return {
    companyName: String(match[1] || "").trim(),
    relativePath: String(match[2] || "")
      .trim()
      .replace(/^\\+/, "")
      .split(/\s+\b(?:e|com|para|onde|que)\b/i)[0]
      .replace(/[,.!:;]+$/g, "")
  };
}

function listCompanyFolders(dataRoot) {
  try {
    return fs.readdirSync(dataRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function inferCompanyName(goal, companies = []) {
  const normalizedGoal = normalizeText(goal);
  const normalizedCompanies = companies.map((companyName) => ({
    original: companyName,
    normalized: normalizeText(companyName)
  }));

  const directMatch = normalizedCompanies.find((entry) => normalizedGoal.includes(entry.normalized));
  if (directMatch) {
    return directMatch.original;
  }

  const folderMatch = normalizedGoal.match(/\b(?:pasta|empresa|origem)\s+([a-z0-9\-_ ]+)/i);
  if (folderMatch?.[1]) {
    const requested = normalizeText(folderMatch[1]);
    const companyMatch = normalizedCompanies.find((entry) => entry.normalized === requested);
    return companyMatch?.original || folderMatch[1].trim();
  }

  const inMatch = normalizedGoal.match(/\bem\s+([a-z0-9\-_ ]+)/i);
  if (inMatch?.[1]) {
    const requested = normalizeText(inMatch[1]);
    const companyMatch = normalizedCompanies.find((entry) => requested.startsWith(entry.normalized));
    return companyMatch?.original || inMatch[1].trim().split(" ")[0];
  }

  return null;
}

function inferRelativePath(goal, recipeId, explicitPath) {
  if (explicitPath) {
    return explicitPath;
  }

  if (recipeId === "receipts_table") {
    return "comprovantes";
  }

  if (recipeId === "group_caption") {
    return "anuncios";
  }

  return "";
}

function inferRecipe(goal, explicitRecipe, relativePath = "") {
  if (explicitRecipe) {
    return explicitRecipe;
  }

  const normalized = normalizeText(goal);
  const normalizedPath = normalizeText(relativePath);

  if (hasAny(normalized, ["comprovante", "maquininha", "nota"]) || normalizedPath.includes("comprovante")) {
    return "receipts_table";
  }

  if (hasAny(normalized, ["legenda", "instagram", "post"])) {
    return "group_caption";
  }

  if (hasAny(normalized, ["cachorro", "dog"])) {
    return "dog_list";
  }

  if (hasAny(normalized, ["roteiro", "documento descritivo", "descritivo"])) {
    return "descriptive_document";
  }

  return "structured_list";
}

function recipeDefinition(recipeId, goal, fields = []) {
  const normalizedGoal = normalizeText(goal);

  if (recipeId === "receipts_table") {
    const explicitFields = fields.length > 0 ? fields : ["arquivo", "data", "valor_total", "categoria"];
    return {
      id: recipeId,
      groupMode: "single",
      outputKind: "table",
      fields: explicitFields,
      outputFormats: ["json", "csv", "md"],
      baseName: "comprovantes-extraidos",
      buildPrompt({ fileNames }) {
        return `
Analise a imagem do comprovante e responda APENAS JSON com os campos pedidos.

Campos:
- arquivo
- data
- valor_total
- categoria

Regras:
- "arquivo" deve ser exatamente o nome do arquivo recebido
- "data" em YYYY-MM-DD quando legivel; se nao estiver clara use null
- "valor_total" como numero decimal usando ponto, sem "R$"; se nao estiver claro use null
- "categoria" e opcional; use apenas: alimentacao, combustivel, ferramentas, outros; se nao der para inferir use null
- Nao invente informacoes

Arquivo atual:
${fileNames.join(", ")}
`;
      }
    };
  }

  if (recipeId === "group_caption") {
    return {
      id: recipeId,
      groupMode: hasAny(normalizedGoal, ["grupo", "cada grupo"]) ? "folder" : "single",
      outputKind: "text",
      fields: ["arquivo", "legenda"],
      outputFormats: ["json", "md", "txt"],
      baseName: "legendas-geradas",
      buildPrompt({ label, fileNames }) {
        return `
Analise a imagem ou grupo de imagens e gere uma legenda de Instagram em portugues do Brasil.

Regras:
- Considere somente o que estiver visivel nas imagens
- Se houver texto na imagem, aproveite as informacoes legiveis
- Produza tom natural, objetivo e comercial
- Responda APENAS JSON no formato:
{"arquivo":"string","legenda":"string"}

Grupo:
${label}

Arquivos:
${fileNames.join(", ")}
`;
      }
    };
  }

  if (recipeId === "dog_list") {
    return {
      id: recipeId,
      groupMode: "single",
      outputKind: "table",
      fields: ["arquivo", "tem_cachorro"],
      outputFormats: ["json", "csv", "md"],
      baseName: "lista-cachorros",
      buildPrompt({ fileNames }) {
        return `
Analise a imagem e responda APENAS JSON no formato:
{"arquivo":"string","tem_cachorro":true}

Regras:
- Use true apenas se houver um cachorro visivel
- Use false se nao houver ou se estiver incerto
- Nao invente

Arquivo atual:
${fileNames.join(", ")}
`;
      }
    };
  }

  if (recipeId === "descriptive_document") {
    return {
      id: recipeId,
      groupMode: hasAny(normalizedGoal, ["grupo", "cada grupo"]) ? "folder" : "single",
      outputKind: "text",
      fields: ["arquivo", "texto"],
      outputFormats: ["json", "md", "txt"],
      baseName: "documento-descritivo",
      buildPrompt({ label, fileNames, goal: currentGoal }) {
        return `
Analise a imagem ou grupo de imagens e cumpra exatamente este pedido:
${currentGoal}

Responda APENAS JSON no formato:
{"arquivo":"string","texto":"string"}

Arquivos:
${fileNames.join(", ")}

Grupo:
${label}
`;
      }
    };
  }

  const defaultFields = fields.length > 0 ? fields : ["arquivo", "descricao"];
  return {
    id: "structured_list",
    groupMode: "single",
    outputKind: "table",
    fields: defaultFields,
    outputFormats: ["json", "csv", "md"],
    baseName: "lista-extraida",
    buildPrompt({ fileNames, goal: currentGoal }) {
      return `
Analise a imagem e cumpra o pedido abaixo.
Pedido:
${currentGoal}

Responda APENAS JSON com estes campos:
${defaultFields.map((field) => `- ${field}`).join("\n")}

Regras:
- Use "arquivo" com o nome do arquivo, se esse campo estiver na lista
- Use null para qualquer campo incerto
- Nao invente valores

Arquivo atual:
${fileNames.join(", ")}
`;
    }
  };
}

export function resolveBatchRequest(input = {}, options = {}) {
  const goal = String(input.goal || input.text || input.prompt || "").trim();
  const extractedPath = extractDataPathFromGoal(goal);
  const companies = listCompanyFolders(options.dataRoot || "");
  const explicitFields = Array.isArray(input.fields)
    ? input.fields.map((entry) => String(entry || "").trim()).filter(Boolean)
    : parseFieldsFromGoal(goal);
  const companyName = input.companyName || extractedPath?.companyName || inferCompanyName(goal, companies);
  const recipeId = inferRecipe(goal, input.recipe, input.path || "");
  const relativePath = input.path || extractedPath?.relativePath || inferRelativePath(goal, recipeId, "");
  const recipe = recipeDefinition(recipeId, goal, explicitFields);
  const outputFormats = Array.isArray(input.outputFormats) && input.outputFormats.length > 0
    ? input.outputFormats
    : recipe.outputFormats;

  return {
    goal,
    companyName,
    relativePath,
    recipeId,
    groupMode: input.groupMode || recipe.groupMode,
    fields: recipe.fields,
    outputFormats,
    baseName: sanitizeBaseName(input.baseName || recipe.baseName),
    recipe
  };
}
