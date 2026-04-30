import fs from "fs/promises";
import path from "path";
import { collectBatchFiles } from "./collector.js";
import { groupBatchFiles } from "./grouper.js";
import { exportBatchArtifacts, rowsToCsv, rowsToMarkdown } from "./exporter.js";
import { resolveBatchRequest } from "./recipes.js";

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }

  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      return null;
    }
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (match?.[0]) {
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fileToBase64(filePath) {
  const buffer = await fs.readFile(filePath);
  return buffer.toString("base64");
}

function buildOutputDir(sourceRoot) {
  return path.join(sourceRoot, "..", "documentos");
}

function normalizeRow(row, fields, fallbackFileName) {
  const normalized = {};

  for (const field of fields) {
    normalized[field] = row?.[field] ?? null;
  }

  if (fields.includes("arquivo")) {
    normalized.arquivo = row?.arquivo || fallbackFileName;
  }

  return normalized;
}

function buildMarkdownForTextItems(items = [], labelKey = "arquivo", textKey = "texto") {
  return items
    .map((item) => `## ${item?.[labelKey] || "item"}\n\n${String(item?.[textKey] || "").trim()}`)
    .join("\n\n");
}

export async function processBatchRequest(input = {}, options = {}) {
  const resolved = resolveBatchRequest(input, {
    dataRoot: options.dataRoot
  });

  if (!resolved.goal) {
    return {
      status: "need_input",
      question: "Qual analise em lote voce quer que eu execute?",
      key: "goal"
    };
  }

  if (!resolved.companyName) {
    return {
      status: "need_input",
      question: "Qual empresa ou pasta de origem devo usar?",
      key: "companyName"
    };
  }

  const source = options.resolveDataPath(resolved.companyName, resolved.relativePath || "");
  const files = collectBatchFiles(source.path, {
    extensions: input.extensions
  });

  if (files.length === 0) {
    return {
      status: "error",
      error: "Nenhuma imagem valida encontrada para processar."
    };
  }

  const groups = groupBatchFiles(files, {
    groupMode: resolved.groupMode,
    sourceRoot: source.path
  });

  const rows = [];
  const textItems = [];

  for (const group of groups) {
    const images = await Promise.all(group.files.slice(0, 6).map((filePath) => fileToBase64(filePath)));
    const prompt = resolved.recipe.buildPrompt({
      goal: resolved.goal,
      label: group.label,
      fileNames: group.files.map((filePath) => path.basename(filePath))
    });
    const aiResult = await options.aiChat({
      prompt,
      images,
      source: "process-batch",
      sessionId: input.sessionId || null,
      executionId: input.executionId || null
    });

    if (aiResult?.status !== "ok") {
      throw new Error(aiResult?.error || `Falha ao analisar o grupo ${group.label}`);
    }

    const parsed = extractJson(aiResult?.data?.text || "");

    if (resolved.recipe.outputKind === "text") {
      const textValue = String(
        parsed?.legenda ||
        parsed?.roteiro ||
        parsed?.texto ||
        aiResult?.data?.text ||
        ""
      ).trim();

      textItems.push({
        arquivo: group.files.length === 1 ? path.basename(group.files[0]) : group.label,
        texto: textValue,
        legenda: parsed?.legenda || null,
        roteiro: parsed?.roteiro || null
      });
      continue;
    }

    const fallbackFileName = group.files.length === 1 ? path.basename(group.files[0]) : group.label;
    rows.push(normalizeRow(parsed || {}, resolved.fields, fallbackFileName));
  }

  const outputDir = buildOutputDir(source.path);
  const primaryRows = resolved.recipe.outputKind === "text"
    ? textItems.map((item) => ({
      arquivo: item.arquivo,
      texto: item.legenda || item.roteiro || item.texto
    }))
    : rows;
  const columns = primaryRows.length > 0
    ? [...new Set(primaryRows.flatMap((item) => Object.keys(item || {})))]
    : resolved.fields;
  const payload = {
    json: primaryRows,
    rows: primaryRows,
    csv: rowsToCsv(primaryRows, columns),
    md: resolved.recipe.outputKind === "text"
      ? buildMarkdownForTextItems(textItems, "arquivo", "texto")
      : rowsToMarkdown(primaryRows, columns),
    txt: resolved.recipe.outputKind === "text"
      ? textItems.map((item) => `${item.arquivo}\n${item.texto}`).join("\n\n")
      : rowsToCsv(primaryRows, columns)
  };
  const outputFiles = exportBatchArtifacts({
    outputDir,
    baseName: resolved.baseName,
    payload,
    formats: resolved.outputFormats
  });

  return {
    status: "ok",
    data: {
      text: `Processamento em lote concluido: ${primaryRows.length} item(ns) analisado(s).`,
      companyName: source.companyName,
      sourcePath: source.path,
      totalFiles: files.length,
      totalGroups: groups.length,
      recipe: resolved.recipeId,
      rows: primaryRows,
      path: outputFiles[0] || null,
      outputFiles
    }
  };
}
