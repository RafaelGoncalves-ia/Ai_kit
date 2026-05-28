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
  return buildWakeWordCandidates(config).map((candidate) => candidate.alias);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function pushAliasCandidate(candidates, seen, label, alias, source = "alias") {
  const normalizedAlias = normalizeText(alias);
  const normalizedLabel = normalizeText(label);
  if (!normalizedAlias || !normalizedLabel) {
    return;
  }

  const key = `${normalizedLabel}:${normalizedAlias}`;
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  candidates.push({
    label: normalizedLabel,
    displayLabel: String(label || "").trim() || normalizedLabel,
    alias: normalizedAlias,
    source,
    tokenCount: normalizedAlias.split(/\s+/).filter(Boolean).length
  });
}

function buildWakeWordCandidates(config = {}) {
  const candidates = [];
  const seen = new Set();
  const aliases = config.aliases && typeof config.aliases === "object" ? config.aliases : {};
  const phoneticAliases = config.phoneticAliases && typeof config.phoneticAliases === "object"
    ? config.phoneticAliases
    : {};

  for (const [label, values] of Object.entries(aliases)) {
    for (const alias of ensureArray(values)) {
      pushAliasCandidate(candidates, seen, label, alias, "alias");
    }
  }

  for (const [label, values] of Object.entries(phoneticAliases)) {
    for (const alias of ensureArray(values)) {
      pushAliasCandidate(candidates, seen, label, alias, "phonetic");
    }
  }

  for (const item of ensureArray(config.wakeWords)) {
    pushAliasCandidate(candidates, seen, item, item, "legacy");
  }

  for (const item of ensureArray(config.wakeWordVariants)) {
    pushAliasCandidate(candidates, seen, item, item, "legacy-variant");
  }

  return candidates.sort((a, b) => b.alias.length - a.alias.length);
}

function buildNegativeList(config = {}) {
  return [
    ...ensureArray(config.negativeSamples),
    ...ensureArray(config.negativeWakeWords)
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
    const candidateValue = typeof candidate === "string" ? candidate : candidate.alias;
    const candidateCompact = compactText(candidateValue);
    if (!candidateCompact) {
      continue;
    }

    if (transcriptCompact.includes(candidateCompact)) {
      return {
        matched: true,
        match: candidateValue,
        candidate,
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
    const candidateValue = typeof candidate === "string" ? candidate : candidate.alias;
    const candidateCompact = compactText(candidateValue);
    if (!candidateCompact || candidateCompact.length < 4) {
      continue;
    }

    const windows = new Set();
    if (transcriptCompact) {
      windows.add(transcriptCompact);
    }

    const candidateTokenCount = candidateValue.split(/\s+/).filter(Boolean).length;
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
          match: candidateValue,
          candidate,
          transcript: normalizedTranscript,
          matchType: "fuzzy",
          distance
        };
      }
    }
  }

  return best;
}

function scoreMatch(match, candidate) {
  if (!match?.matched || !candidate) {
    return 0;
  }

  const aliasLength = compactText(candidate.alias).length;
  const isShortSingleToken = candidate.tokenCount === 1 && aliasLength <= 3;

  let score = 0;
  if (match.matchType === "exact") {
    score = candidate.tokenCount > 1 ? 0.98 : 0.92;
  } else if (match.matchType === "compact") {
    score = candidate.tokenCount > 1 ? 0.9 : 0.8;
  } else if (match.matchType === "fuzzy") {
    const maxLen = Math.max(aliasLength, compactText(match.transcript).length, 1);
    score = Math.max(0, 1 - (Number(match.distance || 0) / maxLen));
    if (candidate.tokenCount > 1) {
      score = Math.max(score, 0.82);
    }
  }

  if (candidate.source === "phonetic") {
    score -= 0.04;
  }

  if (isShortSingleToken) {
    score = Math.min(score, 0.65);
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function findNegativeMatch(normalizedTranscript = "", negatives = []) {
  if (!normalizedTranscript || !negatives.length) {
    return null;
  }

  for (const negative of negatives) {
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(negative)}(?=\\s|$)`, "i");
    if (pattern.test(normalizedTranscript)) {
      return negative;
    }
  }

  const compactTranscript = compactText(normalizedTranscript);
  return negatives.find((negative) => compactTranscript === compactText(negative)) || null;
}

function buildMatchResult(match, candidate, config, normalizedTranscript) {
  const threshold = Number(config.threshold || 0.78);
  const score = scoreMatch(match, candidate);
  const negativeMatch = findNegativeMatch(normalizedTranscript, buildNegativeList(config));
  const shouldConfirm = config.confirmWithPhoneticCheck !== false;
  const confirmed = shouldConfirm
    ? score >= threshold && !(negativeMatch && score < 0.9)
    : !(negativeMatch && score < 0.9);

  return {
    matched: confirmed,
    match: candidate?.alias || match?.match || null,
    label: candidate?.displayLabel || candidate?.label || null,
    matchedAlias: candidate?.alias || match?.match || null,
    score,
    confirmed,
    transcript: normalizedTranscript,
    matchType: match?.matchType || "none",
    distance: match?.distance,
    negativeMatch: negativeMatch || null
  };
}

export function matchWakeWord(transcript = "", config = {}) {
  const normalizedTranscript = normalizeText(transcript);
  const candidates = buildWakeWordCandidates(config);

  for (const candidate of candidates) {
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(candidate.alias)}(?=\\s|$)`, "i");
    if (pattern.test(normalizedTranscript)) {
      const match = {
        matched: true,
        match: candidate.alias,
        candidate,
        transcript: normalizedTranscript,
        matchType: "exact"
      };
      return buildMatchResult(match, candidate, config, normalizedTranscript);
    }
  }

  const compactMatch = findCompactMatch(normalizedTranscript, candidates);
  if (compactMatch) {
    return buildMatchResult(compactMatch, compactMatch.candidate, config, normalizedTranscript);
  }

  const fuzzyMatch = findFuzzyMatch(normalizedTranscript, candidates);
  if (fuzzyMatch) {
    return buildMatchResult(fuzzyMatch, fuzzyMatch.candidate, config, normalizedTranscript);
  }

  return {
    matched: false,
    match: null,
    label: null,
    matchedAlias: null,
    score: 0,
    confirmed: false,
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
