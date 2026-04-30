import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const CONFIG_PATH = path.resolve("backend/config/open.app.json");

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

function isAbsoluteExeTarget(target) {
  const value = String(target || "").trim();
  return path.isAbsolute(value) && path.extname(value).toLowerCase() === ".exe";
}

function normalizeComparable(text) {
  return normalize(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactComparable(text) {
  return normalizeComparable(text).replace(/\s+/g, "");
}

function cleanQuery(text) {
  return normalizeComparable(text)
    .replace(/^(kit|kita|kit ia)\s+/i, "")
    .replace(/^(o|a|os|as|um|uma)\s+/i, "")
    .trim();
}

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

function escapePowerShell(value) {
  return String(value || "").replace(/'/g, "''");
}

function buildPowerShellArray(values = []) {
  const filteredValues = values.filter(
    (value) => value !== undefined && value !== null && String(value).trim()
  );

  if (!filteredValues.length) {
    return "@()";
  }

  return `@(${filteredValues.map((value) => `'${escapePowerShell(value)}'`).join(", ")})`;
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script
      ],
      {
        windowsHide: true
      }
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `powershell_exit_${code}`));
    });
  });
}

async function startDetached(target, args = []) {
  if (isAbsoluteExeTarget(target)) {
    await new Promise((resolve, reject) => {
      const child = spawn(target, args, {
        cwd: path.dirname(target),
        detached: true,
        stdio: "ignore"
      });

      child.on("error", reject);
      child.on("spawn", () => {
        child.unref();
        resolve();
      });
    });
    return;
  }

  const targetLiteral = `'${escapePowerShell(target)}'`;
  const argsLiteral = buildPowerShellArray(args);

  try {
    await runPowerShell(`
      $ErrorActionPreference = 'Stop'
      $target = ${targetLiteral}
      $argsList = ${argsLiteral}
      Start-Process -FilePath $target -ArgumentList $argsList | Out-Null
    `);
  } catch (primaryError) {
    const quotedTarget = `"${String(target || "").replace(/"/g, "")}"`;
    const quotedArgs = args
      .filter((arg) => arg !== undefined && arg !== null && String(arg).trim())
      .map((arg) => `"${String(arg).replace(/"/g, "")}"`);

    await new Promise((resolve, reject) => {
      const commandArgs = ["/c", "start", "", quotedTarget, ...quotedArgs];
      const child = spawn("cmd", commandArgs, {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });

      child.on("error", reject);
      child.on("spawn", () => {
        child.unref();
        resolve();
      });
    }).catch((fallbackError) => {
      throw new Error(
        `${primaryError.message || "Start-Process failed"} | fallback: ${fallbackError.message || "cmd start failed"}`
      );
    });
  }
}

async function openShellTarget(shellTarget) {
  try {
    await runPowerShell(`
      $ErrorActionPreference = 'Stop'
      Start-Process -FilePath '${escapePowerShell(shellTarget)}' | Out-Null
    `);
  } catch (primaryError) {
    await new Promise((resolve, reject) => {
      const child = spawn("explorer.exe", [shellTarget], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });

      child.on("error", reject);
      child.on("spawn", () => {
        child.unref();
        resolve();
      });
    }).catch((fallbackError) => {
      throw new Error(
        `${primaryError.message || "Start-Process failed"} | fallback: ${fallbackError.message || "explorer failed"}`
      );
    });
  }
}

function levenshtein(a = "", b = "") {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function resolveApp(query) {
  const config = loadConfig();
  const q = cleanQuery(query);

  if (!q) {
    return null;
  }

  let bestFuzzyMatch = null;

  for (const key of Object.keys(config.apps || {})) {
    const app = config.apps[key];
    const aliases = Array.isArray(app.aliases) ? app.aliases : [];
    const candidates = [key, ...aliases].map((candidate) => ({
      raw: candidate,
      normalized: normalizeComparable(candidate),
      compact: compactComparable(candidate)
    }));

    if (candidates.some((candidate) => candidate.normalized === q)) {
      return { key, ...app, matchedBy: "exact" };
    }

    if (
      candidates.some((candidate) =>
        candidate.normalized && (q.includes(candidate.normalized) || candidate.normalized.includes(q))
      )
    ) {
      return { key, ...app, matchedBy: "partial" };
    }

    const qCompact = q.replace(/\s+/g, "");
    for (const candidate of candidates) {
      if (!candidate.compact || candidate.compact.length < 4 || qCompact.length < 4) {
        continue;
      }

      const distance = levenshtein(candidate.compact, qCompact);
      const maxLen = Math.max(candidate.compact.length, qCompact.length);
      const threshold = maxLen <= 8 ? 2 : 3;

      if (distance <= threshold) {
        if (!bestFuzzyMatch || distance < bestFuzzyMatch.distance) {
          bestFuzzyMatch = {
            distance,
            app: { key, ...app, matchedBy: "fuzzy", matchedAlias: candidate.raw }
          };
        }
      }
    }
  }

  return bestFuzzyMatch?.app || null;
}

export async function launchApp(input = {}) {
  const query = input.target || input.app || input.name;

  if (!query) {
    return {
      status: "need_input",
      question: "Qual aplicativo devo abrir?",
      key: "target"
    };
  }

  const app = resolveApp(query);

  if (!app) {
    console.warn(`[APP-LAUNCHER] Aplicativo nao encontrado para "${query}"`);
    return {
      status: "error",
      error: "APP_NOT_FOUND",
      target: query
    };
  }

  try {
    const type = app.type || "exe";
    console.log(
      `[APP-LAUNCHER] Resolvendo "${query}" -> "${app.displayName || app.key}" (${type})`
    );

    if (type === "uwp") {
      if (!app.appId) {
        return {
          status: "error",
          error: "UWP_APPID_MISSING",
          app: app.key
        };
      }

      await openShellTarget(`shell:AppsFolder\\${app.appId}`);
    } else {
      if (!app.command) {
        return {
          status: "error",
          error: "COMMAND_MISSING",
          app: app.key
        };
      }

      const commandPath = String(app.command || "").trim();
      if (path.isAbsolute(commandPath) && !fs.existsSync(commandPath)) {
        return {
          status: "error",
          error: "COMMAND_NOT_FOUND",
          app: app.key,
          command: commandPath
        };
      }

      await startDetached(commandPath, Array.isArray(app.args) ? app.args : []);
    }

    return {
      status: "ok",
      app: app.key,
      displayName: app.displayName,
      type
    };
  } catch (err) {
    return {
      status: "error",
      error: "FAILED_TO_OPEN_APP",
      details: err.message
    };
  }
}
