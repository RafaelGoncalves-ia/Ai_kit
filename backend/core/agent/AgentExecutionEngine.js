import { loadConfig } from "../configLoader.js";
import { createAgentTrace } from "./AgentTrace.js";
import { updateExecutionStatus } from "../../utils/executionStatus.js";

const DEFAULT_CONFIG = {
  enabled: false,
  maxSteps: 12,
  maxToolRounds: 4,
  maxPlanTasks: 8,
  showTraceInChat: true,
  collapseTraceOnFinal: false,
  plannerFirstTokenTimeout: 12000,
  plannerTotalTimeout: 25000,
  stepTimeout: 45000,
  trace: {
    maxLineLength: 240,
    includeToolInput: true,
    includeToolSummary: true,
    includeRawToolOutput: false
  },
  allowedTools: [
    "web_search",
    "search_files",
    "read_file",
    "save_file",
    "create_folder"
  ]
};

const INTENT_CATEGORIES = [
  "web_research",
  "local_file_search",
  "file_edit",
  "create_document",
  "market_research",
  "list_generation",
  "data_collection",
  "creative_strategy",
  "scheduling",
  "comparison",
  "mixed_task"
];

function mergeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    allowedTools: Array.isArray(config.allowedTools) ? config.allowedTools : DEFAULT_CONFIG.allowedTools,
    trace: {
      ...DEFAULT_CONFIG.trace,
      ...(config.trace || {})
    }
  };
}

function normalizeComparableText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasAny(text = "", patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function isExplicitWebIntent(text = "") {
  return hasAny(text, [
    /\b(pesquise|pesquisar|pesquisa|busque|buscar|busca|procure|procurar|web|google|online|atuais?|hoje|este ano|lancados?|tendencias?\s+atuais?)\b/,
    /\b(mais\s+vendidos?|mais\s+vendidas?|unidades?\s+vendidas?|ranking|top|ano\s+de\s+\d{4}|\b20\d{2}\b)\b/,
    /\b(telefone|telefones|contatos?|enderecos?|site|sites|links?|fornecedores?|provedores?|lojas?)\b/,
    /\b(orcamento|cotacao|precos?|valores?|comprar|compra|pecas?|itens?|materiais?|produtos?)\b/
  ]);
}

function isCreativeScheduleDocumentTask(goal = "", categories = []) {
  const text = normalizeComparableText(goal);
  return (
    categories.includes("create_document") &&
    categories.includes("scheduling") &&
    categories.includes("creative_strategy") &&
    !isExplicitWebIntent(text)
  );
}

function isBudgetAssemblyTask(goal = "") {
  const text = normalizeComparableText(goal);
  const hasBudgetLanguage = /\b(orcamento|cotacao|precos?|valores?|custos?|total|quanto\s+custa|comprar|compra)\b/.test(text) ||
    /\bR\s*\$?\s*\d|\b\d+(?:[.,]\d{2})?\s*reais\b/.test(text);
  const hasAssemblyLanguage = /\b(monte|montar|montagem|fazer|construir|comprar|busque|buscar|liste|listar|separe|organize|planeje|abrir|criar)\b/.test(text);
  const hasItemLanguage = /\b(pecas?|itens?|componentes?|materiais?|produtos?|lista|kit|setup|estrutura|insumos?|equipamentos?)\b/.test(text);

  return hasBudgetLanguage && (hasAssemblyLanguage || hasItemLanguage);
}

function isElectionPollingGoal(goal = "") {
  const text = normalizeComparableText(goal);
  return (
    /\b(eleicoes?|eleitoral|candidatos?|presidente|presidencial|votos?|intencoes?\s+de\s+voto|pesquisa\s+eleitoral)\b/.test(text) &&
    /\b(2026|este\s+ano|ano\s+atual|atuais?|hoje|agora)\b/.test(text)
  );
}

function limitText(value = "", max = 1800) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 16)).trim()} [truncado]`;
}

function inferCount(goal = "", fallback = 5) {
  if (isBudgetAssemblyTask(goal)) return Math.max(5, extractRequestedBudgetItems(goal).length + 1);
  const match = normalizeComparableText(goal).match(/\b(\d{1,3})\s+(?:fornecedores?|empresas?|animes?|filmes?|produtos?|carros?|veiculos?|itens?|opcoes?|links?|posts?)\b/);
  if (!match) return fallback;
  return Math.max(1, Math.min(50, Number(match[1] || fallback)));
}

function inferLocation(goal = "") {
  const normalized = normalizeComparableText(goal);
  if (/\b(bh|belo horizonte)\b/.test(normalized)) return "Belo Horizonte, MG";
  const match = normalized.match(/\bem\s+([a-z0-9][a-z0-9\s.-]{2,})\b/);
  if (!match) return "";
  return match[1].replace(/\bmg\b/, "MG").trim();
}

function extractBudgetValue(goal = "") {
  const match = String(goal || "").match(/R\$\s*\d+(?:[.\s]\d{3})*(?:,\d{2})?|R\s*\d+(?:[.\s]\d{3})*(?:,\d{2})?|\b\d+(?:[.\s]\d{3})*,\d{2}\b/i);
  if (!match) return "";
  const numeric = match[0]
    .replace(/R\$/i, "")
    .replace(/^R/i, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : "";
}

function extractRequestedBudgetItems(goal = "") {
  const items = [];
  const add = (label) => {
    const clean = String(label || "")
      .replace(/^\s*(?:pe[çc]as?|itens?|componentes?|materiais?|produtos?)\s+/i, "")
      .replace(/^\s*e\s+/i, "")
      .replace(/[.;:]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (clean.length >= 2 && clean.length <= 70 && !items.includes(clean)) items.push(clean);
  };

  const listMatch = String(goal || "").match(/\b(?:pe[çc]as?|itens?|componentes?|materiais?|produtos?)\b[:,]?\s+([\s\S]+)/i);
  const listSection = String(listMatch?.[1] || "")
    .replace(/\b(?:e\s+)?(?:monte|montar|compre|comprar|busque|buscar|faca|faça|organize|planeje)\b[\s\S]*$/i, "")
    .trim();

  if (listSection) {
    for (const raw of listSection.split(/\s*,\s*|\s+e\s+/i)) add(raw);
  }

  return items;
}

function inferSearchQuery(goal = "", intent = {}) {
  const cleanedGoal = String(goal || "")
    .replace(/^\s*kit[,\s:;-]*/i, "")
    .replace(/\b(gere|gerar|crie|criar|quero|me\s+traga|fa[çc]a|monte)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const cleanedComparable = normalizeComparableText(cleanedGoal);
  const genericAdditions = [];
  const explicitYear = cleanedComparable.match(/\b(20\d{2})\b/)?.[1] || "";

  if (isBudgetAssemblyTask(goal)) {
    const items = extractRequestedBudgetItems(goal);
    const budget = extractBudgetValue(goal);
    const budgetText = budget ? `orcamento ${formatCurrencyBRL(budget)}` : "";
    return [
      items.join(" "),
      cleanedGoal,
      budgetText,
      "preco comprar Brasil links"
    ].filter(Boolean).join(" ").trim();
  }

  if (isElectionPollingGoal(goal)) {
    return [
      cleanedGoal,
      "pesquisa eleitoral presidente 2026 intencao de voto candidatos porcentagem Datafolha Quaest Ipec PoderData AtlasIntel Genial CNN Folha"
    ].filter(Boolean).join(" ").trim();
  }

  if (/\b(mais\s+vendidos?|ranking|top|unidades?\s+vendidas?)\b/.test(cleanedComparable)) {
    genericAdditions.push("ranking", "unidades vendidas", "dados oficiais");
  }

  if (/\b(este ano|ano atual|atuais?|em alta|tendencias?)\b/.test(cleanedComparable)) {
    genericAdditions.push("atual", "tendencias");
  }

  if (explicitYear) genericAdditions.push(explicitYear);
  if (intent.location) genericAdditions.push(intent.location);

  const genericQuery = [...new Set([cleanedGoal, ...genericAdditions].filter(Boolean))].join(" ").trim();
  if (genericQuery) return genericQuery;

  return goal;
}

function inferProjectName(goal = "") {
  const raw = String(goal || "");
  const quoted = raw.match(/["']([^"']{2,60})["']/);
  if (quoted?.[1]) return quoted[1].trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-");

  const named = raw.match(/\b(?:cliente|empresa|marca|negocio|loja|padaria|restaurante|pizzaria)\s+(?:chamad[ao]\s+|da\s+|do\s+|a\s+|o\s+)?([A-Za-z0-9À-ÿ][\wÀ-ÿ .-]{2,60}?)(?=\s+(?:para|com|cronograma|sendo|de|do|da)\b|[.?!,]|$)/i);
  if (named?.[1]) return named[1].trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-");

  const match = raw.match(/\b(?:para|da|do|de)\s+(?:a\s+|o\s+)?([A-ZÀ-Ý][\wÀ-ÿ.-]{2,}(?:\s+[A-ZÀ-Ý][\wÀ-ÿ.-]{2,}){0,3})\b/);
  if (match?.[1]) return match[1].trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-");
  if (/\badsune\b/i.test(raw)) return "ADSune";
  return "projeto";
}

function inferBusinessType(goal = "") {
  const text = normalizeComparableText(goal);
  if (/\bpadaria|paes|pao|confeitaria|bolo|salgado\b/.test(text)) return "padaria";
  if (/\brestaurante|lanchonete|bar\b/.test(text)) return "restaurante";
  if (/\bpizzaria|pizza\b/.test(text)) return "pizzaria";
  if (/\bimobiliaria|corretor|imoveis|imovel\b/.test(text)) return "imobiliaria";
  if (/\bclinica|dentista|medico|estetica|beleza\b/.test(text)) return "servico local";
  if (/\bloja|varejo|moda|roupas|calcados\b/.test(text)) return "loja";
  if (/\badsune|marketing|agencia|planos?\b/.test(text)) return "agencia";
  return "negocio local";
}

function inferScheduleSpec(goal = "") {
  const text = normalizeComparableText(goal);
  const isMonth = /\bmes|mensal|30\s+dias\b/.test(text);
  const isWeek = /\b1\s+semana|uma\s+semana|semana\b/.test(text) && !isMonth;
  const postsPerWeek = Number(text.match(/\b(\d{1,2})\s+posts?\s+por\s+semana\b/)?.[1] || 0);
  const postsPerDay = Number(text.match(/\b(\d{1,2})\s+posts?\s+por\s+dia\b/)?.[1] || 0);
  const explicitPosts = Number(text.match(/\b(\d{1,2})\s+posts?\b/)?.[1] || 0);
  const weeks = isMonth ? 4 : 1;
  let totalPosts = 7;

  if (postsPerWeek) totalPosts = postsPerWeek * weeks;
  else if (postsPerDay) totalPosts = postsPerDay * (isMonth ? 30 : 7);
  else if (explicitPosts && !postsPerWeek && !postsPerDay) totalPosts = explicitPosts;
  else if (isMonth) totalPosts = 12;

  return {
    periodLabel: isMonth ? "Mes" : "Semana",
    weeks,
    postsPerWeek: postsPerWeek || (isMonth ? Math.ceil(totalPosts / 4) : totalPosts),
    totalPosts: Math.max(1, Math.min(40, totalPosts))
  };
}

function getThemeBank(businessType = "negocio local") {
  const banks = {
    padaria: [
      ["Video curto", "Feed + Reels", "Pao saindo do forno", "Despertar desejo e visita no dia", "Passa aqui hoje."],
      ["Imagem", "Feed", "Oferta do combo cafe + pao de queijo", "Gerar venda rapida", "Pede no balcao ou chama no WhatsApp."],
      ["Carrossel", "Feed", "5 motivos para tomar cafe na Pao Fresco", "Mostrar diferenciais", "Salva e manda para quem vai com voce."],
      ["Stories em 3 telas", "Stories", "Enquete: doce ou salgado?", "Gerar interacao e descobrir preferencia", "Responde aqui."],
      ["Video curto", "Reels", "Bastidor da vitrine sendo montada", "Criar proximidade", "Vem escolher o seu."],
      ["Imagem", "Feed", "Produto estrela da semana", "Destacar item de margem boa", "Garanta antes de acabar."],
      ["Carrossel", "Feed", "Opcoes para cafe da manha em familia", "Aumentar ticket medio", "Monte seu pedido pelo WhatsApp."]
    ],
    agencia: [
      ["Video curto", "Feed + Reels", "Sua empresa existe online ou esta invisivel?", "Chamar atencao para o problema", "Me chama no direct."],
      ["Carrossel", "Feed", "5 erros que fazem empresas perder clientes no Instagram", "Gerar autoridade e diagnostico", "Quer corrigir isso? Fala comigo."],
      ["Stories em 3 telas", "Stories", "Bastidores de anuncios rodando para clientes", "Mostrar servico real e criar confianca", "Quer anunciar tambem?"],
      ["Imagem", "Feed", "Seu concorrente anuncia. E voce espera milagre.", "Despertar urgencia de compra", "Ultimas vagas da semana."]
    ],
    "negocio local": [
      ["Video curto", "Feed + Reels", "Bastidores do atendimento", "Criar confianca", "Chama no WhatsApp."],
      ["Imagem", "Feed", "Oferta da semana", "Gerar venda direta", "Aproveita hoje."],
      ["Carrossel", "Feed", "3 motivos para escolher a marca", "Mostrar diferenciais", "Salva para consultar depois."],
      ["Stories em 3 telas", "Stories", "Pergunta rapida para o publico", "Gerar interacao", "Responde aqui."],
      ["Video curto", "Reels", "Produto ou servico em uso", "Criar desejo", "Fale com a gente."]
    ]
  };
  return banks[businessType] || banks["negocio local"];
}

function slugifyFilePart(value = "", fallback = "documento") {
  const slug = normalizeComparableText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function buildCreativeScheduleDocument(goal = "") {
  const projectName = inferProjectName(goal);
  const businessType = inferBusinessType(goal);
  const schedule = inferScheduleSpec(goal);
  const themeBank = getThemeBank(businessType);
  const days = ["Segunda-feira", "Quarta-feira", "Sexta-feira", "Terca-feira", "Quinta-feira", "Sabado", "Domingo"];
  const rows = Array.from({ length: schedule.totalPosts }, (_, index) => {
    const theme = themeBank[index % themeBank.length];
    const week = Math.floor(index / Math.max(1, schedule.postsPerWeek)) + 1;
    const day = days[index % Math.max(1, Math.min(days.length, schedule.postsPerWeek))];
    return [`Semana ${week} - ${day}`, ...theme];
  });

  const table = [
    "| Periodo | Formato | Canal | Tema | Objetivo | CTA |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");

  const content = [
    `# Cronograma de Postagem - ${projectName} - ${schedule.periodLabel}`,
    "",
    `Tipo de negocio: ${businessType}.`,
    `Frequencia: ${schedule.totalPosts} posts no periodo, com media de ${schedule.postsPerWeek} posts por semana.`,
    "",
    "Objetivo geral: gerar desejo, aumentar procura e transformar conteudo em venda.",
    "",
    "Estrategia: alternar bastidor, oferta, prova, produto principal, interacao e chamada direta para compra.",
    "",
    table,
    "",
    "## Modelo de Execucao",
    "",
    "- Stories de apoio: repost do feed, bastidor diario, enquete, prova social e CTA direto.",
    "- Linguagem: simples, apetitiva, local e comercial.",
    "- Oferta: conduzir o publico para WhatsApp, direct, retirada no balcao ou visita presencial.",
    "",
    "## Meta do Periodo",
    "",
    "- Aumentar interacoes nos posts.",
    "- Gerar pedidos ou conversas no WhatsApp/direct.",
    "- Reforcar lembranca da marca na regiao.",
    "",
    "## Observacao",
    "",
    "Este cronograma foi montado para venda direta dos planos, sem depender de pesquisa externa."
  ].join("\n");

  return {
    projectName,
    fileName: `cronograma_postagem_${slugifyFilePart(projectName)}_${slugifyFilePart(schedule.periodLabel)}.md`,
    folderPath: `${projectName}/Planejamento`,
    content,
    summary: [
      `CRONOGRAMA ${projectName} - ${schedule.periodLabel}`,
      "",
      `Tipo de negocio: ${businessType}.`,
      `Frequencia: ${schedule.totalPosts} posts no periodo, media de ${schedule.postsPerWeek} posts por semana.`,
      "",
      "Objetivo geral: gerar desejo, aumentar procura e transformar conteudo em venda.",
      "",
      table,
      "",
      "MODELO DE EXECUCAO",
      "",
      "Stories de apoio:",
      "- Repost do feed",
      "- Bastidor diario",
      "- Enquete",
      "- Prova social",
      "- CTA todo dia",
      "",
      "Linguagem: simples, local, comercial e voltada para venda."
    ].join("\n")
  };
}

function analyzeIntent(goal = "") {
  const text = normalizeComparableText(goal);
  const categories = new Set();
  const explicitWebIntent = isExplicitWebIntent(text);
  const budgetAssemblyTask = isBudgetAssemblyTask(goal);

  if (hasAny(text, [/\b(pesquise|pesquisar|busque|buscar|procure|procurar|web|google|online|atuais?|hoje|este ano|lancados?)\b/])) {
    categories.add("web_research");
  }
  if (budgetAssemblyTask) {
    categories.add("web_research");
    categories.add("data_collection");
    categories.add("market_research");
    categories.add("list_generation");
  }
  if (hasAny(text, [/\b(mais\s+vendidos?|mais\s+vendidas?|vendidos?|vendidas?|unidades?\s+vendidas?|ranking|top|mercado|brasil|ano\s+de\s+\d{4}|\b20\d{2}\b)\b/])) {
    categories.add("web_research");
    categories.add("data_collection");
  }
  if (hasAny(text, [/\b(telefone|telefones|contatos?|enderecos?|site|sites|fornecedores?|provedores?|empresas?|lojas?|servicos?)\b/])) {
    categories.add("data_collection");
    categories.add("web_research");
  }
  if (hasAny(text, [/\b(lista|liste|listar|tabela|top|ranking|\d+\s+(?:fornecedores?|empresas?|animes?|filmes?|produtos?|carros?|veiculos?|itens?|opcoes?))\b/])) {
    categories.add("list_generation");
  }
  if (hasAny(text, [/\b(mercado|concorrentes?|precos?|fornecedores?|painel solar|fibra|empresa|carros?|veiculos?|modelos?|fabricantes?)\b/])) {
    categories.add("market_research");
  }
  if (hasAny(text, [/\b(arquivo|pasta|diretorio|contrato|xlsx|pdf|docx|txt|csv)\b/])) {
    categories.add("local_file_search");
  }
  if (hasAny(text, [/\b(edite|editar|altere|alterar|corrija|corrigir)\b/])) {
    categories.add("file_edit");
  }
  if (hasAny(text, [/\b(crie|criar|gere|gerar|documento|csv|txt|planilha|salve)\b/])) {
    categories.add("create_document");
  }
  if (hasAny(text, [/\b(estrategia|campanha|criativo|copy|adsune|post|posts|conteudo)\b/])) {
    categories.add("creative_strategy");
  }
  if (hasAny(text, [/\b(cronograma|calendario|agenda|programacao|este mes|semana)\b/])) {
    categories.add("scheduling");
  }
  if (hasAny(text, [/\b(compare|comparar|comparacao|versus|melhor|diferencas?)\b/])) {
    categories.add("comparison");
  }

  if (categories.size > 1) {
    categories.add("mixed_task");
  }
  if (!categories.size) {
    categories.add("list_generation");
  }

  const categoryList = [...categories].filter((category) => INTENT_CATEGORIES.includes(category));
  const creativeScheduleDocumentTask = isCreativeScheduleDocumentTask(goal, categoryList);

  return {
    categories: categoryList,
    count: inferCount(goal, hasAny(text, [/\b(ranking|top|mais\s+vendidos?|mais\s+vendidas?)\b/]) ? 10 : 5),
    location: inferLocation(goal),
    requiresWeb: !creativeScheduleDocumentTask && (budgetAssemblyTask || categories.has("web_research") || categories.has("data_collection") || categories.has("market_research") || explicitWebIntent),
    requiresLocal: categories.has("local_file_search") || categories.has("file_edit"),
    requiresOutput: categories.has("create_document") || categories.has("list_generation") || categories.has("scheduling"),
    creativeScheduleDocumentTask,
    budgetAssemblyTask
  };
}

function buildAutomaticPlan(goal, intent, allowWebSearch = true) {
  const steps = [];

  if (intent.creativeScheduleDocumentTask) {
    steps.push({
      id: "step_1",
      type: "create_doc",
      label: "Criar documento estruturado do cronograma",
      input: {
        template: "creative_schedule"
      }
    });
    steps.push({
      id: "step_2",
      type: "synthesize",
      label: "Preparar resumo executivo ao usuario",
      input: {}
    });

    return {
      objective: goal,
      missingData: "nenhum",
      source: "automatic",
      steps
    };
  }

  if (intent.requiresLocal) {
    steps.push({
      id: "step_1",
      type: "search_files",
      label: "Buscar arquivos locais",
      input: { query: goal }
    });
    steps.push({
      id: "step_2",
      type: "read_file",
      label: "Ler arquivo encontrado",
      optional: true,
      input: { fromPrevious: "firstFile" }
    });
  }

  if (intent.requiresWeb && allowWebSearch !== false) {
    steps.push({
      id: `step_${steps.length + 1}`,
      type: "web_search",
      label: `Pesquisar web: ${inferSearchQuery(goal, intent)}`,
      input: {
        query: inferSearchQuery(goal, intent),
        maxSources: Math.max(4, Math.min(8, Math.ceil((intent.count || 5) / 3) + 3)),
        maxSearchResults: Math.max(6, Math.min(12, Math.ceil((intent.count || 5) / 2) + 6)),
        intent: intent.location ? "local_service" : "general"
      }
    });
  }

  steps.push({
    id: `step_${steps.length + 1}`,
    type: "synthesize",
    label: "Consolidar resultado",
    input: {
      format: intent.categories.includes("scheduling") || intent.categories.includes("list_generation") ? "table" : "answer"
    }
  });

  return {
    objective: goal,
    missingData: "nenhum",
    source: "automatic",
    steps: steps.slice(0, 8)
  };
}

function parseTextPlan(text = "", goal = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const stepSection = raw.match(/PASSOS:\s*([\s\S]*?)(?:\n[A-ZÁÉÍÓÚÃÕÇ ]+:|$)/i)?.[1] || "";
  const toolSection = raw.match(/FERRAMENTAS:\s*([\s\S]*?)(?:\n[A-ZÁÉÍÓÚÃÕÇ ]+:|$)/i)?.[1] || "";
  const missing = raw.match(/DADOS FALTANDO:\s*([\s\S]*?)$/i)?.[1]?.trim() || "nenhum";
  const lines = stepSection
    .split(/\n+/)
    .map((line) => line.replace(/^\s*\d+[\).\-\s]*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!lines.length) return null;

  const toolsText = normalizeComparableText(toolSection);
  const steps = lines.map((line, index) => {
    const lower = normalizeComparableText(line);
    let type = "synthesize";
    if (/web|google|pesquis/.test(lower) || toolsText.includes("google_search") || toolsText.includes("web")) type = "web_search";
    if (/arquivo|pasta|local|contrato|pdf|xlsx|doc/.test(lower)) type = index === 0 ? "search_files" : "read_file";
    if (/criar|salvar|csv|txt|documento/.test(lower)) type = "create_doc";

    return {
      id: `step_${index + 1}`,
      type,
      label: line,
      input: {}
    };
  });

  if (!steps.some((step) => step.type === "synthesize")) {
    steps.push({
      id: `step_${steps.length + 1}`,
      type: "synthesize",
      label: "Consolidar resultado",
      input: {}
    });
  }

  return {
    objective: goal,
    missingData: missing || "nenhum",
    source: "llm_text",
    steps
  };
}

function buildPlannerPrompt(goal, intent) {
  return [
    "Voce e o Planner Cognitivo da KIT.",
    "Analise o objetivo do usuario e decida o caminho da tarefa.",
    "Nao resolva ainda.",
    "Ferramentas disponiveis: web_search, search_files, read_file, write_file, edit_file, create_folder, create_table, create_doc, create_csv, create_txt.",
    "As ferramentas executam; voce decide quando usa-las.",
    "Nao use regras fixas por tema. Decida pelos dados necessarios para cumprir o objetivo.",
    "Responda em texto simples com estes blocos:",
    "",
    "TIPO_DE_TAREFA:",
    "OBJETIVO_FINAL:",
    "DADOS_NECESSARIOS:",
    "FERRAMENTAS_NECESSARIAS:",
    "WEB_QUERIES:",
    "PLANO_EXECUCAO:",
    "FORMATO_ENTREGA:",
    "SALVAR_ONDE:",
    "DADOS_FALTANDO:",
    "",
    `Categorias detectadas: ${intent.categories.join(", ")}`,
    `Quantidade desejada quando aplicavel: ${intent.count || "nao especificada"}`,
    "",
    "Pedido do usuario:",
    goal
  ].join("\n");
}

function extractCognitiveSection(raw = "", names = []) {
  for (const name of names) {
    const pattern = new RegExp(`${name}:\\s*([\\s\\S]*?)(?:\\n[A-ZÁÉÍÓÚÃÕÇ_ ]{3,}:|$)`, "i");
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function parseCognitivePlan(text = "", goal = "", intent = {}) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const planText = extractCognitiveSection(raw, ["PLANO_EXECUCAO", "PLANO EXECUCAO", "PLANO", "PASSOS"]);
  const toolsText = normalizeComparableText(extractCognitiveSection(raw, ["FERRAMENTAS_NECESSARIAS", "FERRAMENTAS NECESSARIAS", "FERRAMENTAS"]));
  const queryText = extractCognitiveSection(raw, ["WEB_QUERIES", "CONSULTAS_WEB", "CONSULTAS WEB", "BUSCAS"]);
  const outputFormat = extractCognitiveSection(raw, ["FORMATO_ENTREGA", "FORMATO ENTREGA", "ENTREGA"]);
  const missingData = extractCognitiveSection(raw, ["DADOS_FALTANDO", "DADOS FALTANDO"]) || "nenhum";
  const lines = planText
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!lines.length) return null;

  const plannedQueries = queryText
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*\d.)\s]+/, "").trim())
    .filter(Boolean);
  let queryIndex = 0;
  const steps = lines.map((line, index) => {
    const lower = normalizeComparableText(line);
    let type = "synthesize";
    if (/web|google|pesquis|tendenc|fonte|dados atuais|coletar dados/.test(lower) || toolsText.includes("web")) type = "web_search";
    if (/arquivo|pasta|local|contrato|pdf|xlsx|doc/.test(lower)) type = index === 0 ? "search_files" : "read_file";
    if (/criar|salvar|csv|txt|documento|docx|planilha/.test(lower)) type = "create_doc";

    return {
      id: `step_${index + 1}`,
      type,
      label: line,
      input: type === "web_search"
        ? {
            query: plannedQueries[queryIndex++] || inferSearchQuery(line || goal, intent),
            maxSources: Math.max(4, Math.min(8, Math.ceil((intent.count || 5) / 3) + 3)),
            maxSearchResults: Math.max(6, Math.min(12, Math.ceil((intent.count || 5) / 2) + 6))
          }
        : {}
    };
  });

  if (!steps.some((step) => step.type === "synthesize")) {
    steps.push({
      id: `step_${steps.length + 1}`,
      type: "synthesize",
      label: "Consolidar e formatar entrega final",
      input: {}
    });
  }

  let safeSteps = steps;
  if (!intent.requiresWeb) {
    safeSteps = safeSteps.filter((step) => step.type !== "web_search");
  }

  if (intent.creativeScheduleDocumentTask && !safeSteps.some((step) => step.type === "create_doc")) {
    safeSteps.unshift({
      id: "step_1",
      type: "create_doc",
      label: "Criar documento estruturado do cronograma",
      input: {
        template: "creative_schedule"
      }
    });
  }

  return {
    objective: goal,
    missingData,
    outputFormat,
    source: "llm_cognitive",
    steps: safeSteps
  };
}

function formatPlanForTrace(plan) {
  return plan.steps.map((step, index) => `${index + 1}. ${step.label}`).join(" | ");
}

function uniqueSources(sources = []) {
  const seen = new Set();
  const out = [];
  for (const source of sources) {
    const url = String(source?.url || "").trim();
    const domain = String(source?.domain || "").trim();
    const key = url || `${source?.title || ""}:${domain}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: String(source?.title || "Fonte sem titulo").trim(),
      url,
      domain
    });
  }
  return out;
}

function extractPhones(text = "") {
  const matches = String(text || "").match(/(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}/g) || [];
  return [...new Set(matches.map((item) => item.replace(/\s+/g, " ").trim()))].slice(0, 12);
}

function sourceName(source = {}) {
  return String(source.title || source.domain || source.url || "Fonte").replace(/\s[-|].*$/, "").trim();
}

function isNoisyCandidate(value = "") {
  const text = normalizeComparableText(value);
  if (!text || text.length < 3) return true;
  if (text.length > 110) return true;
  if (/^\(?[\d.,k]+\)?(?:\s+\d+\s*temporada|\s+temporadas?|\s+episodios?|\s+eps?)/.test(text)) return true;
  if (/^\(?[\d.,k]+\)?$/.test(text)) return true;
  return [
    "atualizamos nossos termos",
    "termos de uso",
    "continuar",
    "cookies",
    "politica de privacidade",
    "animes recem-adicionados",
    "recem-lancados",
    "mais recentes",
    "onde assistir",
    "confira",
    "lista top",
    "melhores animes",
    "temporada crunchyroll",
    "[truncado]"
  ].some((fragment) => text.includes(fragment));
}

function buildMarkdownTable(rows = [], columns = ["Nome", "Telefone"]) {
  const header = `| ${columns.join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(row[column] || row[column.toLowerCase()] || "").replace(/\|/g, "/")).join(" | ")} |`);
  return [header, sep, ...body].join("\n");
}

function inferRequestedColumns(goal = "") {
  const text = normalizeComparableText(goal);
  const columns = [];
  if (isBudgetAssemblyTask(goal) || /\b(orcamento|valor|preco|link|total)\b/.test(text)) {
    return ["Item", "Valor", "Link"];
  }
  if (isElectionPollingGoal(goal)) {
    return ["Candidato", "Intencao de voto", "Cenario", "Instituto/Data", "Fonte"];
  }
  if (/\bmodelo\b/.test(text)) columns.push("Modelo");
  if (/\bfabricante\b|\bmarca\b/.test(text)) columns.push("Fabricante");
  if (/\bunidades?\s+vendidas?\b|\bemplacad/.test(text)) columns.push("Unidades vendidas");
  if (/\bano\b|\b20\d{2}\b/.test(text)) columns.push("Ano");
  if (/\btelefone|telefones|contato\b/.test(text)) columns.push("Telefone");
  if (!columns.length) columns.push("Nome");
  return columns;
}

function parseNumber(value = "") {
  const match = String(value || "").match(/\b\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?\b|\b\d{4,}\b/);
  return match ? match[0].replace(/\s+/g, ".") : "";
}

function parseCurrencyValue(value = "") {
  const match = String(value || "").match(/R\$\s*\d+(?:[.\s]\d{3})*(?:,\d{2})?|\b\d+(?:[.\s]\d{3})*,\d{2}\b/);
  if (!match) return "";
  const numeric = match[0]
    .replace(/R\$/i, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : "";
}

function formatCurrencyBRL(value = 0) {
  const number = Number(value || 0);
  return `R$ ${number.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function inferYear(goal = "", text = "") {
  return normalizeComparableText(`${goal} ${text}`).match(/\b(20\d{2})\b/)?.[1] || "";
}

function splitManufacturerModel(name = "") {
  const clean = String(name || "").replace(/^\d{1,3}(?:[.\s]\d{3})*\s+/, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return {
      fabricante: "",
      modelo: clean
    };
  }

  return {
    fabricante: parts[0],
    modelo: parts.slice(1).join(" ")
  };
}

const ELECTION_CANDIDATE_NAMES = [
  "Lula",
  "Jair Bolsonaro",
  "Bolsonaro",
  "Tarcisio de Freitas",
  "Tarcisio",
  "Flavio Bolsonaro",
  "Flavio",
  "Romeu Zema",
  "Zema",
  "Ronaldo Caiado",
  "Caiado",
  "Michelle Bolsonaro",
  "Michelle",
  "Ciro Gomes",
  "Ciro",
  "Ratinho Junior",
  "Ratinho Jr",
  "Eduardo Leite",
  "Eduardo",
  "Simone Tebet",
  "Tebet"
];

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPercentNearName(name = "", text = "") {
  const raw = String(text || "");
  const candidate = String(name || "").trim();
  if (!candidate) return "";

  const percentPattern = "(\\d{1,2}(?:[,.]\\d)?)\\s*(?:%|por\\s+cento)";
  const after = new RegExp(`${escapeRegExp(candidate)}[^\\n.;|]{0,80}?${percentPattern}`, "i").exec(raw);
  if (after?.[1]) return `${after[1].replace(".", ",")}%`;

  const before = new RegExp(`${percentPattern}[^\\n.;|]{0,80}?${escapeRegExp(candidate)}`, "i").exec(raw);
  if (before?.[1]) return `${before[1].replace(".", ",")}%`;

  return "";
}

function inferElectionScenario(text = "") {
  const normalized = normalizeComparableText(text);
  if (/\b2o?\s*turno|segundo\s+turno\b/.test(normalized)) return "2o turno";
  if (/\b1o?\s*turno|primeiro\s+turno|estimulad[ao]|espontane[ao]\b/.test(normalized)) return "1o turno";
  return "";
}

function inferPollsterDate(source = {}, text = "") {
  const combined = `${source?.title || ""} ${source?.domain || ""} ${text || ""}`;
  const normalized = normalizeComparableText(combined);
  const pollster = [
    "Datafolha",
    "Quaest",
    "Ipec",
    "PoderData",
    "AtlasIntel",
    "Parana Pesquisas",
    "Nexus"
  ].find((name) => normalized.includes(normalizeComparableText(name))) || "";
  const date = combined.match(/\b\d{1,2}\/\d{1,2}\/20\d{2}\b|\b\d{1,2}\s+de\s+[A-Za-zÀ-ÿçÇ]+\s+de\s+20\d{2}\b|\b(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s+20\d{2}\b/i)?.[0] || "";
  return [pollster, date].filter(Boolean).join(" - ");
}

function candidateToRow(candidate = {}, columns = [], goal = "") {
  const combined = `${candidate.name || ""} ${candidate.detail || ""}`;
  const units = parseNumber(combined);
  const price = parseCurrencyValue(combined);
  const { fabricante, modelo } = splitManufacturerModel(candidate.name);
  const row = {};

  for (const column of columns) {
    if (column === "Peça") row[column] = candidate.name || "Nao confirmado";
    else if (column === "Item") row[column] = candidate.name || "Nao confirmado";
    else if (column === "Valor") row[column] = price ? formatCurrencyBRL(price) : "Nao confirmado";
    else if (column === "Link") row[column] = candidate.source?.url || "Nao confirmado";
    else if (column === "Modelo") row[column] = modelo || candidate.name || "Nao confirmado";
    else if (column === "Fabricante") row[column] = fabricante || "Nao confirmado";
    else if (column === "Unidades vendidas") row[column] = units || "Nao confirmado";
    else if (column === "Ano") row[column] = inferYear(goal, combined) || "Nao confirmado";
    else if (column === "Telefone") row[column] = extractPhones(combined)[0] || "Nao confirmado";
    else if (column === "Candidato") row[column] = candidate.name || "Nao confirmado";
    else if (column === "Intencao de voto") row[column] = candidate.voteIntent || extractPercentNearName(candidate.name, combined) || "Nao confirmado";
    else if (column === "Cenario") row[column] = candidate.scenario || inferElectionScenario(combined) || "Nao confirmado";
    else if (column === "Instituto/Data") row[column] = candidate.pollsterDate || inferPollsterDate(candidate.source, combined) || "Nao confirmado";
    else if (column === "Fonte") row[column] = candidate.source?.url || candidate.source?.domain || "Nao confirmado";
    else row[column] = candidate.name || "Nao confirmado";
  }

  return row;
}

function comparableTokens(value = "") {
  return normalizeComparableText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !["para", "com", "uma", "uns", "das", "dos", "por", "preco", "valor"].includes(token));
}

function editDistanceWithinOne(a = "", b = "") {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
}

function tokenAppearsInText(token = "", text = "") {
  if (text.includes(token)) return true;
  return comparableTokens(text).some((candidate) => editDistanceWithinOne(token, candidate));
}

function findCandidateForBudgetItem(candidates = [], item = "", used = new Set()) {
  const itemTokens = comparableTokens(item);
  if (!itemTokens.length) return null;
  return candidates.find((candidate) => {
    if (used.has(candidate.name)) return false;
    const text = normalizeComparableText(`${candidate.name} ${candidate.detail}`);
    const hits = itemTokens.filter((token) => tokenAppearsInText(token, text)).length;
    const enoughOverlap = hits === itemTokens.length || hits >= Math.min(2, itemTokens.length);
    return enoughOverlap && parseCurrencyValue(`${candidate.name} ${candidate.detail}`);
  });
}

function extractCandidateItems(toolResults = []) {
  const candidates = [];
  const seen = new Set();
  const add = (name, detail = "", source = {}, kind = "item") => {
    if (kind === "source_title" && isNoisyCandidate(detail)) return;
    const rawName = String(name || "").replace(/\s+/g, " ").trim();
    const split = rawName.match(/^(.{3,80}?)\s+[-–—]\s+(.{3,220})$/);
    const cleanName = String(split ? split[1] : rawName)
      .replace(/\s[-|].*$/, "")
      .replace(/^(top|lista|melhores?|lan[çc]amentos?|novos?)\s+\d*\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const cleanDetail = split ? split[2] : detail;
    if (isNoisyCandidate(cleanName)) return;
    const key = normalizeComparableText(cleanName);
    if (!key || key.length < 3 || seen.has(key)) return;
    seen.add(key);
    candidates.push({
      name: cleanName,
      detail: limitText(cleanDetail, 220),
      source,
      kind
    });
  };

  for (const result of toolResults) {
    const entries = result.content || result.results || [];
    for (const entry of entries) {
      const source = {
        title: entry.title,
        url: entry.url,
        domain: entry.domain
      };
      const text = String(entry.text || entry.content || "").replace(/\s+/g, " ").trim();
      const listMatches = text.match(/(?:^|[\n.;]|\s)(?:\d{1,2}[\).]\s+|[-•]\s+)(.{4,140}?)(?=(?:\s+\d{1,2}[\).]\s+)|[.;\n]|$)/g) || [];
      for (const match of listMatches) {
        const item = match.replace(/^[.;\n\s-]*(?:\d{1,2}[\).]\s+|[-•]\s+)/, "").trim();
        add(item, text, source, "list_item");
      }

      add(entry.title, text, source, "source_title");
    }
  }

  return candidates;
}

function extractElectionPollRows(toolResults = [], goal = "") {
  const rows = [];
  const seen = new Set();

  for (const result of toolResults) {
    const entries = result.content || result.results || [];
    for (const entry of entries) {
      const source = {
        title: entry.title,
        url: entry.url,
        domain: entry.domain
      };
      const text = `${entry.title || ""}. ${entry.text || entry.content || ""}`.replace(/\s+/g, " ").trim();

      for (const candidate of ELECTION_CANDIDATE_NAMES) {
        const voteIntent = extractPercentNearName(candidate, text);
        if (!voteIntent) continue;

        const canonicalName = candidate
          .replace(/^Bolsonaro$/i, "Jair Bolsonaro")
          .replace(/^Tarcisio$/i, "Tarcisio de Freitas")
          .replace(/^Flavio$/i, "Flavio Bolsonaro")
          .replace(/^Zema$/i, "Romeu Zema")
          .replace(/^Caiado$/i, "Ronaldo Caiado")
          .replace(/^Michelle$/i, "Michelle Bolsonaro")
          .replace(/^Ciro$/i, "Ciro Gomes")
          .replace(/^Eduardo$/i, "Eduardo Leite")
          .replace(/^Tebet$/i, "Simone Tebet");

        const key = `${normalizeComparableText(canonicalName)}:${voteIntent}:${source.url || source.domain}`;
        if (seen.has(key)) continue;
        seen.add(key);

        rows.push(candidateToRow({
          name: canonicalName,
          detail: text,
          voteIntent,
          scenario: inferElectionScenario(text),
          pollsterDate: inferPollsterDate(source, text),
          source
        }, inferRequestedColumns(goal), goal));
      }
    }
  }

  return rows;
}

function buildSourceDiagnosticsTable(sources = []) {
  const rows = uniqueSources(sources).slice(0, 6).map((source) => ({
    Fonte: source.title || source.domain || "Fonte",
    Status: "consultada, mas sem percentuais confirmaveis no trecho coletado",
    Link: source.url || source.domain || "Nao confirmado"
  }));

  return rows.length ? buildMarkdownTable(rows, ["Fonte", "Status", "Link"]) : "";
}

function buildEvidenceText(toolResults = [], maxChars = 9000) {
  const blocks = [];
  for (const result of toolResults) {
    for (const item of result.content || result.results || []) {
      blocks.push([
        `Titulo: ${item.title || "Fonte sem titulo"}`,
        item.url ? `URL: ${item.url}` : "",
        item.domain ? `Dominio: ${item.domain}` : "",
        `Conteudo: ${limitText(item.text || item.content || "", 900)}`
      ].filter(Boolean).join("\n"));
    }
  }
  return limitText(blocks.join("\n\n---\n\n"), maxChars);
}

function buildSynthesisPrompt({ goal, intent, toolResults }) {
  const columns = inferRequestedColumns(goal);
  const requestedItems = extractRequestedBudgetItems(goal);
  const budgetInstructions = intent.budgetAssemblyTask
    ? [
        "O pedido e um orcamento de compra/montagem.",
        requestedItems.length
          ? `Itens explicitamente pedidos: ${requestedItems.join(", ")}.`
          : "O usuario nao listou todos os itens; infira categorias necessarias pelo objetivo, usando bom senso e as evidencias.",
        "Entregue uma tabela Markdown com as colunas: Item, Valor, Link.",
        "Adapte os itens ao dominio do pedido, sem usar modelos fixos de exemplo.",
        "Escolha opcoes compativeis entre si e adequadas ao orcamento quando houver evidencias suficientes.",
        "Inclua uma linha Total somando somente valores confirmados.",
        "Depois da tabela, inclua Observacoes especificas para o dominio do pedido, como compatibilidade, itens ausentes, mao de obra, frete ou limitacoes do orcamento.",
        "Nao reutilize itens, observacoes ou categorias de pedidos anteriores."
      ]
    : [];
  const electionInstructions = isElectionPollingGoal(goal)
    ? [
        "O pedido e sobre pesquisa eleitoral/intencao de voto.",
        "Entregue tabela Markdown com as colunas: Candidato, Intencao de voto, Cenario, Instituto/Data, Fonte.",
        "Preencha linhas somente quando houver candidato + percentual confirmavel nas evidencias.",
        "Nao use apenas o ano como coluna. Nao resuma como 'Ano'.",
        "Se as evidencias trouxerem apenas titulos/fontes sem percentuais, diga que nao ha dados suficientes e liste as fontes consultadas."
      ]
    : [];
  return [
    "Voce e o sintetizador operacional da KIT.",
    "Use somente as evidencias coletadas abaixo.",
    "Entregue exatamente o que o usuario pediu.",
    ...budgetInstructions,
    ...electionInstructions,
    "Se o usuario pediu lista, entregue lista numerada.",
    `Se pediu tabela ou campos especificos, entregue tabela Markdown com estas colunas quando fizer sentido: ${columns.join(", ")}.`,
    "Nao devolva tabela vazia.",
    "Nao misture textos de cookie, termos de uso, menu, botao CONTINUAR, avisos de site ou trechos truncados como itens.",
    "Para rankings de vendas, use linhas que contenham item + numero/unidade; descarte frases soltas.",
    "Nao invente dados que nao aparecem nas evidencias; quando faltar algo, marque como 'Nao confirmado'.",
    "Inclua nomes especificos, nao apenas nomes de sites/fonte.",
    "",
    `Quantidade desejada: ${intent.count || "nao especificada"}`,
    `Categorias: ${intent.categories.join(", ")}`,
    "",
    "Pedido:",
    goal,
    "",
    "Evidencias:",
    buildEvidenceText(toolResults)
  ].join("\n");
}

function buildDirectSynthesisPrompt({ goal, intent }) {
  const columns = inferRequestedColumns(goal);
  const wantsCurrentData = intent.requiresWeb;

  return [
    "Voce e a KIT respondendo uma tarefa longa diretamente no chat.",
    "O pedido nao gerou resultado de ferramenta externa util, entao entregue a melhor resposta possivel com conhecimento geral e bom senso.",
    "Nao diga que faltam ferramentas quando a tarefa puder ser respondida como texto, lista, explicacao, estrutura, roteiro, copy, ideia ou planejamento.",
    wantsCurrentData
      ? "Se o pedido depender de dados atuais, precos, telefones, links, ranking recente ou fontes verificaveis, diga claramente que esses campos nao foram confirmados e entregue uma estrutura util sem inventar dados."
      : "Nao invente fontes, links, telefones, precos ou dados atuais.",
    "Responda em portugues.",
    "Entregue exatamente o formato pedido pelo usuario.",
    "Se pediu lista, entregue lista numerada.",
    `Se pediu tabela, use Markdown e estas colunas quando fizer sentido: ${columns.join(", ")}.`,
    "Se pediu explicacao, explique de forma clara, completa e objetiva.",
    "Nao mencione prompts, metadados, ferramentas internas ou rota do agente.",
    "",
    `Quantidade desejada: ${intent.count || "nao especificada"}`,
    `Categorias: ${intent.categories.join(", ")}`,
    "",
    "Pedido:",
    goal
  ].join("\n");
}

function hasUsefulSynthesis(text = "", goal = "") {
  const value = String(text || "").trim();
  if (value.length < 20) return false;
  if (/^\|\s*nome\s*\|\s*\n?\|\s*---\s*\|?$/i.test(value.replace(/\r/g, ""))) return false;
  if (/^\|\s*nome\s*\|\s*\|\s*---\s*\|?$/i.test(value.replace(/\s+/g, " "))) return false;
  if (isElectionPollingGoal(goal) && /^\|\s*ano\s*\|/i.test(value.replace(/\r/g, "").trim())) return false;
  const normalized = normalizeComparableText(value);
  if (
    normalized.includes("atualizamos nossos termos") ||
    normalized.includes("termos de uso") ||
    normalized.includes("[truncado]") ||
    (normalized.match(/continuar/g) || []).length >= 2 ||
    /\|\s*nome\s*\|\s*\|\s*---/.test(normalized)
  ) {
    return false;
  }
  return true;
}

function synthesizeFromWebFallback({ goal, intent, toolResults }) {
  const sources = uniqueSources(toolResults.flatMap((item) => item.sources || []));
  const content = toolResults.flatMap((item) => item.content || item.results || []);
  const count = intent.count || 5;
  const wantsPhone = /\btelefone|telefones|contato|contatos\b/.test(normalizeComparableText(goal));
  const wantsTable = /\btabela|planilha|colunas?|modelo|fabricante|unidades?\s+vendidas?|ano\b/.test(normalizeComparableText(goal));
  const candidates = extractCandidateItems(toolResults);

  if (isElectionPollingGoal(goal)) {
    const columns = inferRequestedColumns(goal);
    const rows = extractElectionPollRows(toolResults, goal);
    if (rows.length) {
      return [
        buildMarkdownTable(rows.slice(0, Math.max(5, Math.min(12, rows.length))), columns),
        "",
        "Observacao: usei apenas percentuais que apareceram nos trechos coletados. Quando houver multiplos cenarios/institutos, confira a data e o cenario antes de comparar os numeros."
      ].join("\n");
    }

    const diagnostics = buildSourceDiagnosticsTable(sources);
    return [
      "Nao consegui montar uma tabela confiavel de intencoes de voto nesta rodada porque as fontes coletadas vieram bloqueadas, truncadas ou sem percentuais legiveis nos trechos retornados.",
      diagnostics ? `\n${diagnostics}` : "",
      "",
      "Para esse tipo de pedido, tente pedir com o instituto ou cenario desejado, por exemplo: Datafolha primeiro turno 2026, Quaest segundo turno 2026, ou comparativo Lula x Tarcisio."
    ].filter(Boolean).join("\n");
  }

  if (intent.budgetAssemblyTask) {
    const columns = ["Item", "Valor", "Link"];
    const requestedItems = extractRequestedBudgetItems(goal);
    const rows = [];
    const used = new Set();

    for (const item of requestedItems) {
      const found = findCandidateForBudgetItem(candidates, item, used);
      if (found) {
        used.add(found.name);
        rows.push(candidateToRow({ ...found, name: item }, columns, goal));
      } else {
        rows.push({ Item: item, Valor: "Nao confirmado", Link: "Nao confirmado" });
      }
    }

    const total = rows.reduce((sum, row) => sum + (parseCurrencyValue(row.Valor) || 0), 0);
    const budget = extractBudgetValue(goal);
    const summaryRows = [
      ...rows,
      { Item: "Total confirmado", Valor: total ? formatCurrencyBRL(total) : "Nao confirmado", Link: "-" }
    ];
    if (budget && total) {
      summaryRows.push({
        Item: total <= budget ? "Saldo estimado" : "Estouro estimado",
        Valor: formatCurrencyBRL(Math.abs(budget - total)),
        Link: "-"
      });
    }

    return [
      buildMarkdownTable(summaryRows, columns),
      "",
      "Observacoes:",
      "- Usei somente valores que apareceram nas evidencias coletadas; itens sem preco/link ficaram como Nao confirmado.",
      "- Confira compatibilidade, quantidades, medidas e requisitos especificos do seu caso antes da compra.",
      "- Frete, mao de obra, garantia, disponibilidade e itens nao pedidos explicitamente podem alterar o total."
    ].join("\n");
  }

  if (wantsTable) {
    const columns = inferRequestedColumns(goal);
    const rows = [];
    for (const item of candidates) {
      if (rows.length >= count) break;
      if (columns.includes("Unidades vendidas") && item.kind === "source_title") continue;
      if (columns.includes("Unidades vendidas") && !parseNumber(`${item.name} ${item.detail}`)) continue;
      rows.push(candidateToRow(item, columns, goal));
    }

    if (!rows.length) {
      for (const source of sources) {
        if (rows.length >= count) break;
        rows.push(candidateToRow({ name: sourceName(source), detail: "" }, columns, goal));
      }
    }

    const note = rows.some((row) => Object.values(row).includes("Nao confirmado"))
      ? "\n\nAlguns campos nao apareceram de forma confirmavel nos resultados coletados."
      : "";
    return `${buildMarkdownTable(rows.slice(0, count), columns)}${note}`;
  }

  const preferredCandidates = [
    ...candidates.filter((item) => item.kind !== "source_title"),
    ...candidates.filter((item) => item.kind === "source_title")
  ];

  const listItems = preferredCandidates
    .slice(0, count)
    .map((item, index) => `${index + 1}. ${item.name}${item.detail ? ` - ${item.detail}` : ""}`);

  if (listItems.length) {
    const note = listItems.length < count
      ? `\n\nConsegui confirmar ${listItems.length} item(ns) nas fontes coletadas; não encontrei ${count} itens confirmados nessa rodada.`
      : "";
    return `${listItems.join("\n")}${note}`;
  }

  const snippets = content
    .map((item, index) => `${index + 1}. ${sourceName(item)}: ${limitText(item.text || item.content || "", 320)}`)
    .filter((line) => line.length > 8)
    .slice(0, Math.max(3, count));

  return snippets.length
    ? snippets.join("\n")
    : "Consegui pesquisar, mas as fontes retornaram pouco conteudo util para sintetizar com seguranca.";
}

function formatSources(sources = []) {
  const clean = uniqueSources(sources).slice(0, 8);
  if (!clean.length) return "";
  return [
    "",
    "Fontes:",
    ...clean.map((source) => `- ${source.title}${source.domain ? ` (${source.domain})` : ""}${source.url ? ` - ${source.url}` : ""}`)
  ].join("\n");
}

function buildLocalSummary(results = []) {
  const files = results.flatMap((item) => item.files || []);
  const reads = results.filter((item) => item.content);
  if (reads.length) {
    return reads.map((item) => `Arquivo: ${item.path}\n\n${limitText(item.content, 2200)}`).join("\n\n");
  }
  if (files.length) {
    return [
      "Encontrei estes arquivos:",
      ...files.slice(0, 12).map((file) => `- ${file.path}`)
    ].join("\n");
  }
  return "Nao encontrei arquivos locais correspondentes. Envie o caminho correto ou um termo mais especifico.";
}

export function loadAgentExecutionConfig() {
  return mergeConfig(loadConfig("agent.execution.json"));
}

export function createAgentExecutionEngine(context, config = loadAgentExecutionConfig()) {
  const execConfig = mergeConfig(config);

  function log(message, data = {}) {
    const suffix = Object.keys(data).length ? ` ${JSON.stringify(data)}` : "";
    console.log(`[AGENT] ${message}${suffix}`);
  }

  function publish({ runId, sessionId, status, currentStep = 0, totalSteps = 0, label = "", progressText = "", error = null, startedAt = null, finishedAt = null }) {
    updateExecutionStatus(context, {
      executionId: runId,
      mode: "agent",
      sessionId,
      status,
      currentStep,
      totalSteps,
      label,
      progressText,
      error,
      startedAt,
      finishedAt
    });
  }

  async function callPlannerLLM(goal, intent, meta = {}) {
    if (execConfig.disableLlmPlanner === true) return null;
    const result = await context.invokeTool("ai_chat", {
      prompt: buildPlannerPrompt(goal, intent),
      source: "agent-exec.planner",
      sessionId: meta.sessionId,
      executionId: meta.executionId,
      stream: false,
      think: false,
      emitEvents: false,
      hasTools: true,
      temperature: 0.1,
      numPredict: 260,
      timeoutMs: Number(execConfig.plannerTotalTimeout || 25000)
    });

    if (result?.status !== "ok") return null;
    return parseCognitivePlan(result.data?.text || "", goal, intent) || parseTextPlan(result.data?.text || "", goal);
  }

  async function callSynthesisLLM({ goal, intent, toolResults, sessionId, executionId }) {
    if (execConfig.disableLlmSynthesis === true) return "";

    const result = await context.invokeTool("ai_chat", {
      prompt: buildSynthesisPrompt({ goal, intent, toolResults }),
      source: "agent-exec.synthesis",
      sessionId,
      executionId,
      stream: false,
      think: false,
      emitEvents: false,
      temperature: 0.2,
      numPredict: Math.max(1200, Math.min(2600, Number(intent.count || 5) * 180)),
      timeoutMs: Number(execConfig.stepTimeout || 120000)
    });

    if (result?.status !== "ok") return "";
    return String(result.data?.text || "").trim();
  }

  async function plan(goal, intent, trace, meta = {}) {
    log(`intent=${intent.categories.join("+")}`);
    trace.add("analisando pedido", intent.categories.join(", "));
    log("planner_started");
    trace.add("criando plano", "planner operacional");

    if (intent.budgetAssemblyTask) {
      const automaticPlan = buildAutomaticPlan(goal, intent, true);
      trace.add("planning", formatPlanForTrace(automaticPlan));
      return automaticPlan;
    }

    if (intent.creativeScheduleDocumentTask) {
      const automaticPlan = buildAutomaticPlan(goal, intent, false);
      trace.add("planning", formatPlanForTrace(automaticPlan));
      return automaticPlan;
    }

    try {
      const llmPlan = await callPlannerLLM(goal, intent, meta);
      if (llmPlan?.steps?.length) {
        log("planner_success");
        trace.add("planning", formatPlanForTrace(llmPlan));
        return llmPlan;
      }
    } catch (err) {
      console.warn(`[AGENT] planner_failed ${err.message}`);
    }

    const fallback = buildAutomaticPlan(goal, intent, meta.allowWebSearch);
    log("fallback_planner_used");
    trace.add("planning", formatPlanForTrace(fallback));
    return fallback;
  }

  async function runToolStep(step, state) {
    const { trace, runId, sessionId, goal, intent } = state;

    if (step.type === "web_search") {
      const query = step.input?.query || inferSearchQuery(goal, intent);
      log(`step_${state.stepNumber}_tool=google_search`, { query });
      trace.add("pesquisando google", query);
      const result = await context.invokeTool("web_search", {
        ...step.input,
        query,
        source: "agent-exec.web_search",
        sessionId,
        executionId: runId
      });
      if (result?.status !== "ok") {
        throw new Error(result?.error || "Falha na pesquisa web.");
      }
      const data = result.data || {};
      const sources = uniqueSources(data.sources || []);
      trace.add("coletando fontes", `${sources.length} fontes`);
      for (const source of (data.sources || []).slice(0, 6)) {
        const sourceText = `${source.title || ""} ${source.excerpt || ""} ${source.snippet || ""}`;
        if (isNoisyCandidate(sourceText) || normalizeComparableText(sourceText).includes("termos de uso")) {
          trace.add("abrindo site", `${source.domain || source.url || "fonte"} com ruído/bloqueio`);
        } else {
          trace.add("abrindo site", source.title || source.domain || source.url || "fonte");
        }
      }
      return {
        type: "web_search",
        data,
        sources,
        content: (data.sources || []).map((source) => ({
          title: source.title,
          url: source.url,
          domain: source.domain,
          text: source.content || source.excerpt || source.snippet || ""
        })),
        summary: data.text || ""
      };
    }

    if (step.type === "search_files") {
      const query = step.input?.query || goal;
      log(`step_${state.stepNumber}_tool=search_files`, { query });
      trace.add("buscando arquivos", query);
      const result = await context.invokeTool("search_files", {
        query,
        maxResults: 12,
        sessionId,
        executionId: runId
      });
      if (result?.status !== "ok") {
        throw new Error(result?.error || "Falha ao buscar arquivos.");
      }
      return {
        type: "search_files",
        files: result.data?.files || []
      };
    }

    if (step.type === "read_file") {
      const previousFile = state.results.flatMap((item) => item.files || [])[0];
      if (!previousFile?.path && step.optional) {
        return { type: "read_file", skipped: true };
      }
      const targetPath = step.input?.path || previousFile?.path;
      log(`step_${state.stepNumber}_tool=read_file`, { path: targetPath });
      trace.add("lendo arquivo", targetPath || "arquivo");
      const result = await context.invokeTool("read_file", {
        path: targetPath,
        sessionId,
        executionId: runId
      });
      if (result?.status !== "ok") {
        throw new Error(result?.error || "Falha ao ler arquivo.");
      }
      return {
        type: "read_file",
        path: result.data?.path || targetPath,
        content: result.data?.content || ""
      };
    }

    if (step.type === "create_doc") {
      const document = step.input?.template === "creative_schedule" || intent.creativeScheduleDocumentTask
        ? buildCreativeScheduleDocument(goal)
        : {
            fileName: "documento.md",
            folderPath: "documentos",
            content: goal,
            summary: goal
          };

      log(`step_${state.stepNumber}_tool=create_doc`, {
        fileName: document.fileName,
        folderPath: document.folderPath
      });
      trace.add("acessando pasta do projeto", document.folderPath);
      trace.add("criando arquivo", document.fileName);
      trace.add("escrevendo conteudo", "documento estruturado");

      const result = await context.invokeTool("create_doc", {
        fileName: document.fileName,
        folderPath: document.folderPath,
        content: document.content,
        sessionId,
        executionId: runId
      });

      if (result?.status !== "ok") {
        throw new Error(result?.error || "Falha ao criar documento.");
      }

      trace.add("salvando documento", "documento criado com sucesso");

      return {
        type: "create_doc",
        path: result.data?.path || "",
        bytes: result.data?.bytes || 0,
        fileName: document.fileName,
        folderPath: document.folderPath,
        content: document.content,
        summary: document.summary
      };
    }

    return { type: step.type, skipped: true };
  }

  async function synthesize(goal, intent, results, trace, meta = {}) {
    trace.add("consolidando", "montando resposta final");
    const webResults = results.filter((item) => item.type === "web_search");
    const localResults = results.filter((item) => item.type === "search_files" || item.type === "read_file");
    const docResults = results.filter((item) => item.type === "create_doc");

    if (docResults.length) {
      const document = docResults[docResults.length - 1];
      const savedLine = document.path
        ? `\n\nDocumento salvo em:\n${document.path}`
        : "";
      return {
        answer: `${document.summary || "Documento criado com sucesso."}${savedLine}`,
        sources: []
      };
    }

    if (webResults.length) {
      const sources = uniqueSources(webResults.flatMap((item) => item.sources || []));
      let text = "";

      try {
        trace.add("sintetizando", "organizando dados coletados");
        text = await callSynthesisLLM({
          goal,
          intent,
          toolResults: webResults,
          sessionId: meta.sessionId,
          executionId: meta.runId
        });
      } catch (err) {
        console.warn(`[AGENT] synthesis_failed ${err.message}`);
      }

      if (!hasUsefulSynthesis(text, goal)) {
        trace.add("fallback", "sintese local aplicada");
        text = synthesizeFromWebFallback({ goal, intent, toolResults: webResults });
      }

      return {
        answer: `${text}${formatSources(sources)}`,
        sources
      };
    }

    if (localResults.length) {
      return {
        answer: buildLocalSummary(localResults),
        sources: []
      };
    }

    try {
      trace.add("sintetizando", "respondendo sem ferramenta externa");
      const result = await context.invokeTool("ai_chat", {
        prompt: buildDirectSynthesisPrompt({ goal, intent }),
        source: "agent-exec.direct-synthesis",
        sessionId: meta.sessionId,
        executionId: meta.runId,
        stream: false,
        think: false,
        emitEvents: false,
        temperature: 0.3,
        numPredict: Math.max(1400, Math.min(2800, Number(intent.count || 5) * 220)),
        timeoutMs: Number(execConfig.stepTimeout || 120000)
      });

      const text = String(result?.data?.text || "").trim();
      if (result?.status === "ok" && hasUsefulSynthesis(text, goal)) {
        return {
          answer: text,
          sources: []
        };
      }
    } catch (err) {
      console.warn(`[AGENT] direct_synthesis_failed ${err.message}`);
    }

    return {
      answer: "Nao consegui montar uma resposta confiavel com o contexto atual. Me passe mais detalhes do formato ou do assunto que eu tento de novo.",
      sources: []
    };
  }

  async function run({ goal, sessionId = "default", executionId = null, allowWebSearch = true } = {}) {
    const normalizedGoal = String(goal || "").trim();
    if (!normalizedGoal) {
      return { status: "error", error: "Objetivo vazio" };
    }

    const runId = executionId || `agent_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const trace = createAgentTrace(context, {
      runId,
      sessionId,
      config: execConfig
    });
    const startedAt = Date.now();

    context.runtime = context.runtime || {};
    context.runtime.agentActive = true;

    trace.start();
    publish({
      runId,
      sessionId,
      status: "planning",
      label: "Analisando",
      progressText: "Analisando pedido",
      startedAt
    });

    try {
      const intent = analyzeIntent(normalizedGoal);
      const currentPlan = await plan(normalizedGoal, intent, trace, {
        sessionId,
        executionId: runId,
        allowWebSearch
      });
      const executableSteps = currentPlan.steps.filter((step) => step.type !== "synthesize").slice(0, Number(execConfig.maxSteps || 12));
      const results = [];

      publish({
        runId,
        sessionId,
        status: "running",
        totalSteps: executableSteps.length + 1,
        label: "Executando",
        progressText: "Executando plano",
        startedAt
      });

      for (let index = 0; index < executableSteps.length; index += 1) {
        const step = executableSteps[index];
        const stepNumber = index + 1;
        publish({
          runId,
          sessionId,
          status: "running",
          currentStep: stepNumber,
          totalSteps: executableSteps.length + 1,
          label: step.label,
          progressText: step.label,
          startedAt
        });

        try {
          const result = await runToolStep(step, {
            trace,
            runId,
            sessionId,
            goal: normalizedGoal,
            intent,
            results,
            stepNumber
          });
          results.push(result);
          log(`step_${stepNumber}_success`);
          trace.add("resultado", result.summary || "etapa concluida");
        } catch (err) {
          log(`step_${stepNumber}_failed`, { error: err.message });
          trace.add("resultado", `etapa falhou: ${err.message}`);
          results.push({
            type: step.type,
            error: err.message
          });
          if (!step.optional && step.type !== "web_search") {
            continue;
          }
        }
      }

      publish({
        runId,
        sessionId,
        status: "running",
        currentStep: executableSteps.length + 1,
        totalSteps: executableSteps.length + 1,
        label: "Finalizando",
        progressText: "Finalizando resposta",
        startedAt
      });

      const final = await synthesize(normalizedGoal, intent, results, trace, {
        sessionId,
        runId
      });
      trace.add("finalizando resposta", "pronto");
      trace.finish({ status: "done" });
      log("finalized");
      publish({
        runId,
        sessionId,
        status: "done",
        currentStep: executableSteps.length + 1,
        totalSteps: executableSteps.length + 1,
        label: "Concluido",
        progressText: "Agente concluido",
        startedAt,
        finishedAt: Date.now()
      });

      return {
        status: "ok",
        runId,
        answer: final.answer,
        text: final.answer,
        sources: final.sources,
        intent,
        plan: currentPlan,
        results
      };
    } catch (err) {
      trace.add("recovery", `falha tratada: ${err.message}`);
      trace.finish({ status: "error" });
      publish({
        runId,
        sessionId,
        status: "error",
        label: "Falha na execucao",
        progressText: err.message,
        error: err.message,
        startedAt,
        finishedAt: Date.now()
      });
      return {
        status: "error",
        runId,
        error: err.message || "Falha na execucao do agente.",
        text: `Nao consegui concluir tudo, mas evitei travar o agente. Motivo: ${err.message || "erro desconhecido"}.`
      };
    } finally {
      context.runtime.agentActive = false;
    }
  }

  return {
    enabled: execConfig.enabled === true,
    run,
    analyzeIntent,
    buildAutomaticPlan
  };
}
