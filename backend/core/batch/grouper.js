import path from "path";

function buildGroupId(baseValue = "") {
  return String(baseValue || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export function groupBatchFiles(files = [], options = {}) {
  const groupMode = options.groupMode || "single";
  const sourceRoot = options.sourceRoot || "";

  if (groupMode === "all") {
    return files.length > 0
      ? [{
        id: "all-files",
        label: "Todos os arquivos",
        files: files.slice()
      }]
      : [];
  }

  if (groupMode === "folder") {
    const grouped = new Map();

    for (const filePath of files) {
      const relativeDir = path.relative(sourceRoot, path.dirname(filePath)) || ".";
      const groupKey = relativeDir === "." ? "root" : relativeDir;
      const label = relativeDir === "." ? "Pasta principal" : relativeDir;

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          id: buildGroupId(groupKey),
          label,
          files: []
        });
      }

      grouped.get(groupKey).files.push(filePath);
    }

    return [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }

  return files.map((filePath, index) => ({
    id: buildGroupId(`${index + 1}-${path.basename(filePath)}`),
    label: path.basename(filePath),
    files: [filePath]
  }));
}
