function stripAccents(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(text) {
  return stripAccents(text).toLowerCase().replace(/\s+/g, " ").trim();
}

const THEME_RULES = [
  {
    id: "league_of_legends",
    confidence: 0.97,
    activeSkills: ["lolCoach"],
    patterns: [
      /\blol\b/,
      /\bleague of legends\b/,
      /\bvamos jogar lol\b/,
      /\branqueada\b/,
      /\bchampion select\b/,
      /\bcampeao\b/,
      /\bbuild contra\b/,
      /\bitem contra\b/,
      /\bruna\b/,
      /\brunas\b/,
      /\bcounter\b/,
      /\bmid\b.*\bcontra\b/,
      /\bcontra\b.*\bmid\b/,
      /\btop\b.*\bcontra\b/,
      /\bcontra\b.*\btop\b/,
      /\badc\b.*\bcontra\b/,
      /\bcontra\b.*\badc\b/,
      /\bjungle\b.*\bcontra\b/,
      /\bcontra\b.*\bjungle\b/,
      /\bsupport\b.*\bcontra\b/,
      /\bcontra\b.*\bsupport\b/
    ]
  },
  {
    id: "programming",
    confidence: 0.9,
    activeSkills: [],
    patterns: [
      /\bcodigo\b/,
      /\bprograma(?:r|cao)\b/,
      /\bjavascript\b/,
      /\bnode\b/,
      /\bpython\b/,
      /\bbug\b/,
      /\brepo\b/,
      /\bcommit\b/
    ]
  },
  {
    id: "canvas",
    confidence: 0.88,
    activeSkills: [],
    patterns: [/\bcanvas\b/, /\bquadro\b/, /\bdesenho\b/]
  },
  {
    id: "stable_diffusion",
    confidence: 0.9,
    activeSkills: [],
    patterns: [/\bstable diffusion\b/, /\bsd\b/, /\bcheckpoint\b/, /\blora\b/]
  },
  {
    id: "comfyui",
    confidence: 0.9,
    activeSkills: [],
    patterns: [/\bcomfyui\b/, /\bworkflow comfy\b/, /\bnode comfy\b/]
  },
  {
    id: "unity",
    confidence: 0.88,
    activeSkills: [],
    patterns: [/\bunity\b/, /\bc#\b/, /\bgameobject\b/, /\bprefab\b/]
  },
  {
    id: "marketing",
    confidence: 0.82,
    activeSkills: [],
    patterns: [/\bmarketing\b/, /\bcampanha\b/, /\bpost\b/, /\banuncio\b/, /\bcopy\b/]
  }
];

const CONTEXTUAL_LOL_PATTERNS = [
  /\bqual build\b/,
  /\bbuild\b/,
  /\bqual runa\b/,
  /\bruna\b/,
  /\brunas\b/,
  /\bqual item\b/,
  /\bitem\b/,
  /\bquem countera\b/,
  /\bcountera\b/,
  /\bquem ganha\b/,
  /\bmatchup\b/,
  /\blore\b/,
  /\bhistoria\b/,
  /\bqual forma\b/,
  /\bqual meu foco\b/,
  /\bcondicao de vitoria\b/,
  /\bcondição de vitória\b/,
  /\bcomo jogo essa lane\b/
];

export function detectTopic(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) {
    return {
      theme: "general",
      confidence: 0.25,
      activeSkills: []
    };
  }

  let best = {
    theme: "general",
    confidence: 0.35,
    activeSkills: []
  };

  for (const rule of THEME_RULES) {
    const matched = rule.patterns.some((pattern) => pattern.test(normalized));
    if (matched && rule.confidence > best.confidence) {
      best = {
        theme: rule.id,
        confidence: rule.confidence,
        activeSkills: rule.activeSkills
      };
    }
  }

  return best;
}

export function isContextualLeagueQuestion(text = "") {
  const normalized = normalizeText(text);
  return CONTEXTUAL_LOL_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isStrongDomainShift(text = "", activeThemeId = "") {
  const detected = detectTopic(text);
  if (!activeThemeId || detected.theme === "general" || detected.theme === activeThemeId) {
    return false;
  }

  return detected.confidence >= 0.82;
}

export default {
  detectTopic,
  isContextualLeagueQuestion,
  isStrongDomainShift
};
