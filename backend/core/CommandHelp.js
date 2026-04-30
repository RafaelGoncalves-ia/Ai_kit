import { loadConfig } from "./configLoader.js";

function normalizeEntry(entry = {}) {
  return {
    id: String(entry.id || "").trim(),
    patterns: Array.isArray(entry.patterns)
      ? entry.patterns.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    description: String(entry.description || "").trim(),
    examples: Array.isArray(entry.examples)
      ? entry.examples.map((item) => String(item || "").trim()).filter(Boolean)
      : []
  };
}

export function loadCommandCatalog() {
  const raw = loadConfig("commands.json");
  const commands = Array.isArray(raw.commands) ? raw.commands.map(normalizeEntry) : [];

  return {
    title: String(raw.title || "Comandos da Kit").trim(),
    description: String(raw.description || "").trim(),
    version: Number(raw.version || 1),
    commands: commands.filter((entry) => entry.id && entry.description)
  };
}

export function buildHelpText() {
  const catalog = loadCommandCatalog();
  const lines = [];
  const openAppsConfig = loadConfig("open.app.json");
  const appNames = Object.values(openAppsConfig.apps || {})
    .map((app) => String(app?.displayName || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  lines.push(`**${catalog.title}**`);

  if (catalog.description) {
    lines.push(catalog.description);
  }

  for (const command of catalog.commands) {
    const patternText = command.patterns.length
      ? command.patterns.join(" | ")
      : command.id;
    const descriptionText = command.description.replace(/[.:\s]+$/g, "").trim();
    const exampleText = command.examples.length
      ? ` Ex.: ${command.examples.join(" | ")}`
      : "";

    lines.push(`- \`${patternText}\`: ${descriptionText}.${exampleText}`);
  }

  if (appNames.length > 0) {
    lines.push(`Apps configurados para abrir: ${appNames.join(", ")}.`);
  }

  return lines.join("\n\n").trim();
}

export function isHelpCommand(text = "") {
  const normalized = String(text || "").trim().toLowerCase();
  return normalized === "/help" || normalized === "help";
}
