function normalizeWhitespace(text = "") {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function stripCodeBlocks(text = "") {
  return String(text || "").replace(/```[\s\S]*?```/g, " ");
}

function stripBasicMarkdown(text = "") {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/~~/g, "")
    .replace(/`/g, "");
}

function stripUrls(text = "") {
  return String(text || "").replace(/https?:\/\/\S+/gi, " ");
}

function stripEmojiArtifacts(text = "") {
  return String(text || "")
    .replace(/[\u200D\uFE0F]/g, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "");
}

const UNITS = [
  "zero",
  "um",
  "dois",
  "tres",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove"
];

const TEENS = [
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove"
];

const TENS = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa"
];

const HUNDREDS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos"
];

function belowOneHundredToWords(value) {
  if (value < 10) return UNITS[value];
  if (value < 20) return TEENS[value - 10];

  const tens = Math.floor(value / 10);
  const units = value % 10;
  return units ? `${TENS[tens]} e ${UNITS[units]}` : TENS[tens];
}

function belowOneThousandToWords(value) {
  if (value === 0) return "zero";
  if (value === 100) return "cem";
  if (value < 100) return belowOneHundredToWords(value);

  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  return remainder
    ? `${HUNDREDS[hundreds]} e ${belowOneHundredToWords(remainder)}`
    : HUNDREDS[hundreds];
}

function integerToPortugueseWords(value) {
  const number = Math.trunc(Number(value || 0));
  if (!Number.isFinite(number)) return String(value || "");
  if (number === 0) return "zero";

  const scales = [
    { singular: "bilhao", plural: "bilhoes", value: 1000000000 },
    { singular: "milhao", plural: "milhoes", value: 1000000 },
    { singular: "mil", plural: "mil", value: 1000 }
  ];

  let remainder = number;
  const parts = [];

  for (const scale of scales) {
    if (remainder < scale.value) continue;
    const chunk = Math.floor(remainder / scale.value);
    remainder %= scale.value;

    if (scale.value === 1000 && chunk === 1) {
      parts.push("mil");
      continue;
    }

    const chunkWords = belowOneThousandToWords(chunk);
    parts.push(`${chunkWords} ${chunk === 1 ? scale.singular : scale.plural}`);
  }

  if (remainder > 0) {
    parts.push(belowOneThousandToWords(remainder));
  }

  if (parts.length === 1) {
    return parts[0];
  }

  const lastPart = parts.pop();
  return `${parts.join(", ")} e ${lastPart}`;
}

function currencyToWords(rawValue = "") {
  const normalized = String(rawValue || "")
    .replace(/\s+/g, "")
    .replace(/^R\$\s*/i, "")
    .trim();

  if (!normalized) {
    return rawValue;
  }

  let integerPart = normalized;
  let decimalPart = "";

  if (normalized.includes(",")) {
    const split = normalized.split(",");
    integerPart = split[0];
    decimalPart = (split[1] || "").replace(/\D/g, "").slice(0, 2);
  }

  integerPart = integerPart.replace(/\./g, "").replace(/\D/g, "");
  if (!integerPart) {
    return rawValue;
  }

  const reais = Number(integerPart || 0);
  const centavos = Number(decimalPart || 0);
  const reaisWords = `${integerToPortugueseWords(reais)} ${reais === 1 ? "real" : "reais"}`;

  if (!centavos) {
    return reaisWords;
  }

  const centavosWords = `${integerToPortugueseWords(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
  return `${reaisWords} e ${centavosWords}`;
}

function expandBrazilianCurrency(text = "") {
  return String(text || "").replace(/R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|R\$\s*\d+(?:,\d{1,2})?/gi, (match) => {
    return currencyToWords(match);
  });
}

function normalizeSpeechPauses(text = "") {
  return String(text || "")
    .replace(/\s*\.+\s*/g, ", ");
}

export function sanitizeSpeechText(text = "") {
  let sanitized = String(text || "");
  sanitized = stripCodeBlocks(sanitized);
  sanitized = stripBasicMarkdown(sanitized);
  sanitized = stripUrls(sanitized);
  sanitized = stripEmojiArtifacts(sanitized);
  sanitized = expandBrazilianCurrency(sanitized);
  sanitized = normalizeSpeechPauses(sanitized);
  sanitized = normalizeWhitespace(sanitized);
  return sanitized.trim().replace(/,\s*$/, "");
}

export function buildSpeechPayload({
  uiText = "",
  speakText = "",
  source = "unknown"
} = {}) {
  const baseText = String(speakText || uiText || "");
  const cleaned = sanitizeSpeechText(baseText);

  return {
    shouldSpeak: cleaned.length >= 1,
    text: cleaned,
    reason: cleaned.length >= 1 ? "ok" : "empty_after_cleanup",
    source
  };
}
