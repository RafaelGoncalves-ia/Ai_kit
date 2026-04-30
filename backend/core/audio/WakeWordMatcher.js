function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCandidateList(config = {}) {
  return [
    ...(Array.isArray(config.wakeWords) ? config.wakeWords : []),
    ...(Array.isArray(config.wakeWordVariants) ? config.wakeWordVariants : [])
  ]
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function compactText(value = "") {
  return normalizeText(value).replace(/\s+/g, "");
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

function findCompactMatch(normalizedTranscript = "", candidates = []) {
  const transcriptCompact = compactText(normalizedTranscript);
  if (!transcriptCompact) {
    return null;
  }

  for (const candidate of candidates) {
    const candidateCompact = compactText(candidate);
    if (!candidateCompact) {
      continue;
    }

    if (transcriptCompact.includes(candidateCompact)) {
      return {
        matched: true,
        match: candidate,
        transcript: normalizedTranscript,
        matchType: "compact"
      };
    }
  }

  return null;
}

function findFuzzyMatch(normalizedTranscript = "", candidates = []) {
  const tokens = normalizedTranscript.split(/\s+/).filter(Boolean);
  const transcriptCompact = compactText(normalizedTranscript);
  let best = null;

  for (const candidate of candidates) {
    const candidateCompact = compactText(candidate);
    if (!candidateCompact || candidateCompact.length < 4) {
      continue;
    }

    const windows = new Set();
    if (transcriptCompact) {
      windows.add(transcriptCompact);
    }

    const candidateTokenCount = candidate.split(/\s+/).filter(Boolean).length;
    for (let start = 0; start < tokens.length; start += 1) {
      for (let size = 1; size <= Math.max(candidateTokenCount + 1, 2); size += 1) {
        const slice = tokens.slice(start, start + size).join("");
        if (slice) {
          windows.add(slice);
        }
      }
    }

    for (const sample of windows) {
      const distance = levenshtein(candidateCompact, sample);
      const maxLen = Math.max(candidateCompact.length, sample.length);
      const threshold = maxLen <= 5 ? 1 : 2;

      if (distance <= threshold && (!best || distance < best.distance)) {
        best = {
          matched: true,
          match: candidate,
          transcript: normalizedTranscript,
          matchType: "fuzzy",
          distance
        };
      }
    }
  }

  return best;
}

export function matchWakeWord(transcript = "", config = {}) {
  const normalizedTranscript = normalizeText(transcript);
  const candidates = buildCandidateList(config);

  for (const candidate of candidates) {
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(candidate)}(?=\\s|$)`, "i");
    if (pattern.test(normalizedTranscript)) {
      return {
        matched: true,
        match: candidate,
        transcript: normalizedTranscript,
        matchType: "exact"
      };
    }
  }

  const compactMatch = findCompactMatch(normalizedTranscript, candidates);
  if (compactMatch) {
    return compactMatch;
  }

  const fuzzyMatch = findFuzzyMatch(normalizedTranscript, candidates);
  if (fuzzyMatch) {
    return fuzzyMatch;
  }

  return {
    matched: false,
    match: null,
    transcript: normalizedTranscript,
    matchType: "none"
  };
}

export function stripWakeWordFromCommand(command = "", config = {}) {
  const normalizedCommand = normalizeText(command);
  const candidates = buildCandidateList(config).sort((a, b) => b.length - a.length);
  const compactCommand = compactText(normalizedCommand);

  for (const candidate of candidates) {
    const pattern = new RegExp(`^${escapeRegExp(candidate)}(?:\\s+|$)`, "i");
    if (pattern.test(normalizedCommand)) {
      return normalizedCommand.replace(pattern, "").trim();
    }
  }

  for (const candidate of candidates) {
    const candidateCompact = compactText(candidate);
    if (!candidateCompact || !compactCommand.startsWith(candidateCompact)) {
      continue;
    }

    const remainder = compactCommand.slice(candidateCompact.length).trim();
    if (!remainder) {
      return "";
    }

    const commandTokens = normalizedCommand.split(/\s+/).filter(Boolean);
    for (let size = 1; size <= Math.min(commandTokens.length, 3); size += 1) {
      const consumedCompact = commandTokens.slice(0, size).join("");
      if (consumedCompact.length >= candidateCompact.length) {
        return commandTokens.slice(size).join(" ").trim();
      }
    }

    return remainder;
  }

  return normalizedCommand;
}

export function normalizeWakeTranscript(value = "") {
  return normalizeText(value);
}
