import fs from "fs";
import path from "path";

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",;\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export function rowsToCsv(rows = [], columns = []) {
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((column) => csvEscape(row?.[column] ?? "")).join(","));
  return [header, ...lines].join("\n");
}

export function rowsToMarkdown(rows = [], columns = []) {
  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(row?.[column] ?? "")).join(" | ")} |`);
  return [header, separator, ...body].join("\n");
}

export function exportBatchArtifacts({ outputDir, baseName, payload, formats = [] }) {
  const outputs = [];
  const normalizedFormats = Array.from(new Set(formats.map((entry) => String(entry || "").toLowerCase())));

  for (const format of normalizedFormats) {
    const targetPath = path.join(outputDir, `${baseName}.${format}`);
    ensureDir(targetPath);

    if (format === "json") {
      fs.writeFileSync(targetPath, JSON.stringify(payload.json ?? payload.rows ?? payload, null, 2), "utf8");
      outputs.push(targetPath);
      continue;
    }

    if (format === "csv") {
      fs.writeFileSync(targetPath, payload.csv || "", "utf8");
      outputs.push(targetPath);
      continue;
    }

    if (format === "md") {
      fs.writeFileSync(targetPath, payload.md || "", "utf8");
      outputs.push(targetPath);
      continue;
    }

    if (format === "txt") {
      fs.writeFileSync(targetPath, payload.txt || "", "utf8");
      outputs.push(targetPath);
    }
  }

  return outputs;
}
