const STORAGE_KEY = "kit.studioPlanner.v1";
const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

const MARKETING_OPTIONS = {
  objectives: [
    "Autoridade",
    "Reconhecimento de marca",
    "Geracao de leads",
    "Engajamento",
    "Conversao",
    "Prova social",
    "Educacao",
    "Relacionamento",
    "Trafego",
    "Venda direta",
    "Captacao de direct"
  ],
  funnel: ["Topo", "Meio", "Fundo", "Pos-venda", "Reativacao"],
  ctas: [
    "Chamar no direct",
    "Clicar no link da bio",
    "Pedir orcamento",
    "Agendar visita",
    "Solicitar catalogo",
    "Salvar o post",
    "Compartilhar",
    "Comentar",
    "Entrar em contato pelo WhatsApp"
  ],
  formats: ["Imagem unica", "Carrossel", "Reel", "Story", "Video curto", "Anuncio estatico", "Anuncio em video"],
  platforms: [
    "Instagram Feed",
    "Instagram Reels",
    "Instagram Stories",
    "Facebook",
    "TikTok",
    "YouTube Shorts",
    "Google Ads",
    "Meta Ads"
  ],
  productionStatus: [
    "Em branco",
    "Rascunho",
    "Aguardando informacao do produto",
    "Em producao",
    "Aguardando aprovacao",
    "Concluido"
  ],
  publicationStatus: ["Nao agendado", "Agendado", "Postado", "Cancelado"],
  contentTypes: ["Post", "Reel", "Story", "Carrossel", "Anuncio"]
};

const CLIENT_SEGMENTS = [
  "Imobiliaria",
  "Energia solar",
  "Escola",
  "Clinica",
  "Comercio local",
  "Prestador de servico",
  "Industria",
  "Provedor de internet",
  "Engenharia",
  "Construcao civil",
  "Alimentacao",
  "Beleza e estetica",
  "Saude",
  "Advocacia",
  "Contabilidade",
  "Outro"
];

const PLAN_RULES = {
  "R$200 - ADS Start": {
    attendanceMode: "Online",
    meetingFrequency: "Sob demanda",
    summary: [
      "Gerenciamento de anuncios",
      "Atendimento online",
      "Cliente produz o organico"
    ],
    rules: [
      "Ads gerenciado pela ADSune",
      "Organico por conta do cliente",
      "Nao sugerir visita presencial",
      "Nao sugerir treinamento presencial"
    ]
  },
  "R$400 - ADS + Direcionamento": {
    attendanceMode: "Online",
    meetingFrequency: "Quinzenal online",
    summary: [
      "Gerenciamento de anuncios",
      "Alinhamento do organico",
      "Orientacao online",
      "Cliente executa a maior parte"
    ],
    rules: [
      "Ads gerenciado pela ADSune",
      "Organico alinhado pela ADSune",
      "Cliente executa conteudo",
      "Pode sugerir orientacao e revisao"
    ]
  },
  "R$600 - Presenca Estrategica": {
    attendanceMode: "Presencial + Online",
    meetingFrequency: "Mensal presencial",
    summary: [
      "Gerenciamento de anuncios",
      "Alinhamento organico",
      "Reuniao presencial",
      "Treinamento basico do time",
      "Planejamento mensal"
    ],
    rules: [
      "Pode sugerir reuniao presencial",
      "Pode sugerir treinamento basico",
      "Pode sugerir padronizacao de conteudo"
    ]
  },
  "R$900 - Gestao Comercial": {
    attendanceMode: "Presencial + Online",
    meetingFrequency: "Presencial + acompanhamento online",
    summary: [
      "Gestao de marketing",
      "Reuniao presencial",
      "Treinamento do time",
      "Inicio de automacoes",
      "Organizacao do atendimento e leads"
    ],
    rules: [
      "Pode sugerir fluxos de WhatsApp",
      "Pode sugerir CRM simples",
      "Pode sugerir IA aplicada ao atendimento"
    ]
  },
  "R$1200 - Gestao + Estrutura": {
    attendanceMode: "Presencial + Online",
    meetingFrequency: "Presencial + acompanhamento online",
    summary: [
      "Gestao mais profunda",
      "Automacoes avancadas",
      "Processos internos",
      "Integracao marketing + atendimento",
      "Solucao dos gargalos que continuam no plano R$900"
    ],
    rules: [
      "Pode sugerir melhorias profundas de processo",
      "Pode sugerir automacoes avancadas",
      "Pode sugerir integracao marketing + atendimento"
    ]
  },
  "Personalizado": {
    attendanceMode: "Online",
    meetingFrequency: "Personalizado",
    summary: ["Escopo definido manualmente"],
    rules: ["Consultar observacoes estrategicas antes de sugerir entregas"]
  }
};

const CLIENT_OPTIONS = {
  plans: Object.keys(PLAN_RULES),
  attendanceModes: ["Online", "Presencial + Online"],
  meetingFrequencies: [
    "Sob demanda",
    "Quinzenal online",
    "Mensal online",
    "Mensal presencial",
    "Presencial + acompanhamento online",
    "Personalizado"
  ],
  channels: [
    "Instagram",
    "Facebook",
    "WhatsApp",
    "TikTok",
    "YouTube",
    "Site",
    "Google Meu Negocio",
    "Meta Ads",
    "Google Ads",
    "LinkedIn",
    "Outro"
  ],
  commercialGoals: [
    "Gerar leads qualificados",
    "Aumentar directs",
    "Agendar visitas",
    "Vender produtos",
    "Aumentar reconhecimento",
    "Melhorar autoridade",
    "Educar o publico",
    "Reativar clientes antigos",
    "Aumentar WhatsApp",
    "Atrair orcamento",
    "Divulgar lancamento",
    "Fortalecer marca",
    "Outro"
  ],
  priorities: [
    "Leads",
    "Conversao",
    "Reconhecimento",
    "Autoridade",
    "Engajamento",
    "Educacao do publico",
    "Relacionamento",
    "Trafego",
    "Reativacao",
    "Venda direta"
  ],
  dependentProducts: [
    "Imoveis",
    "Lotes",
    "Veiculos",
    "Promocoes",
    "Estoque",
    "Antes e depois",
    "Obras em andamento",
    "Eventos",
    "Novos produtos",
    "Servicos com orcamento variavel",
    "Outro"
  ],
  requiredOfferFields: [
    "Fotos",
    "Videos",
    "Localizacao",
    "Bairro",
    "Valor",
    "Condicoes de pagamento",
    "Beneficios",
    "Diferenciais",
    "Prazo",
    "Disponibilidade",
    "Contato responsavel",
    "Link",
    "Outro"
  ],
  tones: [
    "Consultivo",
    "Claro",
    "Direto",
    "Tecnico",
    "Humanizado",
    "Premium",
    "Popular",
    "Emocional",
    "Educativo",
    "Descontraido",
    "Institucional",
    "Orientado a conversao",
    "Urgente",
    "Sofisticado",
    "Outro"
  ],
  forbiddenClaims: [
    "Garantido",
    "Financiamento aprovado",
    "Valorizacao certa",
    "Sem risco",
    "Ultima chance, se nao for verdade",
    "Melhor da cidade, sem comprovacao",
    "Resultado garantido",
    "Outro"
  ],
  marketingObjectives: [
    ...MARKETING_OPTIONS.objectives,
    "Reativacao",
    "Lancamento",
    "Retencao"
  ],
  campaignStatuses: ["Ativa", "Pausada", "Planejada", "Finalizada"],
  campaignTypes: ["Meta Ads", "Google Ads", "Organico", "WhatsApp", "Lancamento", "Captacao", "Reativacao", "Institucional"],
  campaignObjectives: ["Leads", "Direct", "WhatsApp", "Visitas", "Orcamento", "Alcance", "Conversao", "Cadastro"]
};

const DEFAULT_CLIENT = {
  name: "Cliente exemplo",
  logo: "",
  segment: "Imobiliaria",
  niche: "Loteamentos",
  subniche: "Minha casa minha vida",
  plan: "R$900 - Gestao Comercial",
  attendanceMode: "Presencial + Online",
  meetingFrequency: "Presencial + acompanhamento online",
  socialNetworks: "Instagram, Facebook, Meta Ads",
  channels: ["Instagram", "Facebook", "WhatsApp", "Meta Ads"],
  links: {
    instagram: "",
    facebook: "",
    whatsapp: "",
    site: "",
    bio: "",
    googleBusiness: ""
  },
  tone: "Consultivo, claro e orientado a conversao",
  toneOfVoice: ["Consultivo", "Claro", "Orientado a conversao"],
  audience: "Familias e investidores buscando oportunidade segura de compra.",
  products: "Loteamentos, casas novas e usadas, apartamentos",
  mainProducts: "Loteamentos, casas novas e usadas, apartamentos",
  externalProducts: "Imoveis, lotes e ofertas que dependem de fotos, bairro, valor e condicoes.",
  externalInfoDependentProducts: ["Imoveis", "Lotes"],
  requiredOfferFields: ["Fotos", "Bairro", "Valor", "Localizacao", "Condicoes de pagamento"],
  languageRestrictions: "Evitar promessas absolutas de valorizacao ou financiamento aprovado.",
  forbiddenClaims: ["Garantido", "Financiamento aprovado", "Valorizacao certa", "Resultado garantido"],
  brandRules: "Sempre usar linguagem consultiva, evitar exageros e priorizar WhatsApp.",
  commercialGoals: "Gerar leads qualificados, direct e visitas agendadas.",
  recurringCommercialGoals: ["Gerar leads qualificados", "Agendar visitas", "Aumentar WhatsApp"],
  currentPriority: "Leads",
  marketing: {
    objectives: ["Geracao de leads", "Autoridade", "Educacao"],
    funnelStages: ["Topo", "Meio", "Fundo"],
    preferredCtas: ["Entrar em contato pelo WhatsApp", "Chamar no direct", "Agendar visita"],
    formats: ["Carrossel", "Reel", "Imagem unica", "Anuncio estatico"],
    platforms: ["Instagram Feed", "Instagram Reels", "Meta Ads", "WhatsApp"]
  },
  planningHistory: "",
  activeCampaigns: "Campanha de captacao de leads para loteamentos.",
  campaigns: [
    {
      id: "campaign_default",
      name: "Captacao de leads para loteamentos",
      status: "Ativa",
      type: "Meta Ads",
      objective: "WhatsApp",
      notes: "Priorizar CTA direto para atendimento.",
      startDate: "",
      endDate: ""
    }
  ],
  strategicNotes: "Priorizar conteudo educativo e anuncios com CTA para WhatsApp.",
  history: [],
  internalOptions: {
    objectives: CLIENT_OPTIONS.marketingObjectives,
    funnel: MARKETING_OPTIONS.funnel,
    ctas: [...MARKETING_OPTIONS.ctas, "Falar com consultor", "Ver disponibilidade", "Receber mais informacoes", "Simular agora", "Agendar avaliacao"],
    formats: [...MARKETING_OPTIONS.formats, "Depoimento", "Bastidores", "Antes e depois", "Tutorial", "Oferta", "Conteudo educativo"],
    platforms: [...MARKETING_OPTIONS.platforms, "WhatsApp", "Google Meu Negocio"],
    tones: CLIENT_OPTIONS.tones,
    segments: CLIENT_SEGMENTS,
    campaignTypes: CLIENT_OPTIONS.campaignTypes
  },
  brand: {
    colors: [],
    fonts: [],
    logos: []
  }
};

const state = loadState();
state.clientDirty = false;
state.aiStatus = {
  mode: "idle",
  text: "IA em repouso",
  percent: null,
  timer: null
};

const els = {
  topClientName: document.getElementById("topClientName"),
  topMonth: document.getElementById("topMonth"),
  topPlanStatus: document.getElementById("topPlanStatus"),
  aiStatusStrip: document.getElementById("aiStatusStrip"),
  aiStatusText: document.getElementById("aiStatusText"),
  aiProgressFill: document.getElementById("aiProgressFill"),
  newPlannerButton: document.getElementById("newPlannerButton"),
  saveButton: document.getElementById("saveButton"),
  exportPdfButton: document.getElementById("exportPdfButton"),
  generateCardsButton: document.getElementById("generateCardsButton"),
  generateKiaButton: document.getElementById("generateKiaButton"),
  studioTabs: document.getElementById("studioTabs"),
  tabPanel: document.getElementById("tabPanel"),
  chatContextLabel: document.getElementById("chatContextLabel"),
  chatMessageList: document.getElementById("chatMessageList"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  chatPlannerButton: document.getElementById("chatPlannerButton"),
  chatCaptionButton: document.getElementById("chatCaptionButton")
};

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueList(value = []) {
  return [...new Set((Array.isArray(value) ? value : splitLines(value)).map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizeCampaign(campaign = {}, index = 0) {
  return {
    id: campaign.id || uid("campaign"),
    name: campaign.name || `Campanha ${index + 1}`,
    status: campaign.status || "Planejada",
    type: campaign.type || "Meta Ads",
    objective: campaign.objective || "Leads",
    notes: campaign.notes || "",
    startDate: campaign.startDate || "",
    endDate: campaign.endDate || ""
  };
}

function normalizeHistoryItem(item = {}, index = 0) {
  return {
    id: item.id || uid("history"),
    month: item.month || currentMonthValue(),
    summary: item.summary || "",
    whatWorked: item.whatWorked || "",
    whatToAvoid: item.whatToAvoid || "",
    nextNotes: item.nextNotes || ""
  };
}

function normalizeClient(raw = {}) {
  const client = { ...DEFAULT_CLIENT, ...(raw || {}) };
  const internalOptions = {
    ...DEFAULT_CLIENT.internalOptions,
    ...(client.internalOptions || {})
  };
  const marketing = {
    ...DEFAULT_CLIENT.marketing,
    ...(client.marketing || {})
  };

  const channels = uniqueList(client.channels?.length ? client.channels : client.socialNetworks);
  const recurringCommercialGoals = uniqueList(client.recurringCommercialGoals?.length ? client.recurringCommercialGoals : client.commercialGoals);
  const toneOfVoice = uniqueList(client.toneOfVoice?.length ? client.toneOfVoice : client.tone);
  const externalInfoDependentProducts = uniqueList(client.externalInfoDependentProducts?.length ? client.externalInfoDependentProducts : client.externalProducts);

  return {
    ...client,
    plan: client.plan && PLAN_RULES[client.plan] ? client.plan : DEFAULT_CLIENT.plan,
    attendanceMode: client.attendanceMode || PLAN_RULES[client.plan]?.attendanceMode || DEFAULT_CLIENT.attendanceMode,
    meetingFrequency: client.meetingFrequency || PLAN_RULES[client.plan]?.meetingFrequency || DEFAULT_CLIENT.meetingFrequency,
    links: { ...DEFAULT_CLIENT.links, ...(client.links || {}) },
    channels,
    socialNetworks: channels.join(", "),
    recurringCommercialGoals,
    commercialGoals: recurringCommercialGoals.join(", "),
    toneOfVoice,
    tone: toneOfVoice.join(", "),
    mainProducts: client.mainProducts || client.products || "",
    products: client.products || client.mainProducts || "",
    externalInfoDependentProducts,
    externalProducts: externalInfoDependentProducts.join(", "),
    requiredOfferFields: uniqueList(client.requiredOfferFields),
    forbiddenClaims: uniqueList(client.forbiddenClaims),
    marketing: {
      objectives: uniqueList(marketing.objectives),
      funnelStages: uniqueList(marketing.funnelStages),
      preferredCtas: uniqueList(marketing.preferredCtas),
      formats: uniqueList(marketing.formats),
      platforms: uniqueList(marketing.platforms)
    },
    campaigns: (Array.isArray(client.campaigns) && client.campaigns.length
      ? client.campaigns
      : splitLines(client.activeCampaigns).map((name) => ({ name, status: "Ativa", type: "Meta Ads", objective: "Leads" }))
    ).map(normalizeCampaign),
    history: (Array.isArray(client.history) ? client.history : []).map(normalizeHistoryItem),
    internalOptions: {
      objectives: uniqueList(internalOptions.objectives),
      funnel: uniqueList(internalOptions.funnel),
      ctas: uniqueList(internalOptions.ctas),
      formats: uniqueList(internalOptions.formats),
      platforms: uniqueList(internalOptions.platforms),
      tones: uniqueList(internalOptions.tones),
      segments: uniqueList(internalOptions.segments),
      campaignTypes: uniqueList(internalOptions.campaignTypes)
    },
    brand: {
      colors: client.brand?.colors || [],
      fonts: client.brand?.fonts || [],
      logos: client.brand?.logos || []
    }
  };
}

function loadState() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    stored = null;
  }

  return {
    activeTab: stored?.activeTab || "client",
    selectedItemId: stored?.selectedItemId || null,
    clientKitPath: stored?.clientKitPath || "",
    client: normalizeClient(stored?.client || DEFAULT_CLIENT),
    selectedMonth: stored?.selectedMonth || currentMonthValue(),
    planners: stored?.planners && typeof stored.planners === "object" ? stored.planners : {},
    messages: Array.isArray(stored?.messages) && stored.messages.length
      ? stored.messages
      : [
        {
          role: "assistant",
          text: "Studio Planner pronto. Eu vou atuar como estrategista de marketing: cliente, mes, planner, cards e roteiro ficam no contexto antes de qualquer automacao."
        }
      ],
    marketingOptions: {
      objectives: mergeOptions(MARKETING_OPTIONS.objectives, stored?.marketingOptions?.objectives),
      funnel: mergeOptions(MARKETING_OPTIONS.funnel, stored?.marketingOptions?.funnel),
      ctas: mergeOptions(MARKETING_OPTIONS.ctas, stored?.marketingOptions?.ctas),
      formats: mergeOptions(MARKETING_OPTIONS.formats, stored?.marketingOptions?.formats),
      platforms: mergeOptions(MARKETING_OPTIONS.platforms, stored?.marketingOptions?.platforms)
    }
  };
}

function mergeOptions(defaults, saved) {
  return [...new Set([...(defaults || []), ...(Array.isArray(saved) ? saved : [])])];
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    activeTab: state.activeTab,
    selectedItemId: state.selectedItemId,
    clientKitPath: state.clientKitPath,
    client: state.client,
    selectedMonth: state.selectedMonth,
    planners: state.planners,
    messages: state.messages.slice(-40),
    marketingOptions: state.marketingOptions
  }));
}

function plannerKey() {
  return `${normalizeId(state.client.name)}__${state.selectedMonth}`;
}

function getPlanner() {
  return state.planners[plannerKey()] || null;
}

function setPlanner(planner) {
  state.planners[plannerKey()] = planner;
}

function normalizeId(value = "") {
  return String(value || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "cliente";
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function monthLabel(monthValue = state.selectedMonth) {
  const [year, month] = String(monthValue || currentMonthValue()).split("-").map(Number);
  return MONTH_FORMATTER.format(new Date(year, month - 1, 2));
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function render() {
  syncMarketingOptionsFromClient();
  const planner = getPlanner();
  els.topClientName.value = state.client.name;
  els.topMonth.value = state.selectedMonth;
  els.topPlanStatus.textContent = planner?.status || "Sem planner";
  els.chatContextLabel.textContent = `${state.client.name} / ${monthLabel()} / aba ${getTabLabel(state.activeTab)}`;
  renderAiStatus();
  renderTabs();
  renderActiveTab();
  renderChat();
  persist();
}

function syncMarketingOptionsFromClient() {
  if (!state.client?.internalOptions) return;
  state.marketingOptions = {
    objectives: uniqueList(state.client.internalOptions.objectives),
    funnel: uniqueList(state.client.internalOptions.funnel),
    ctas: uniqueList(state.client.internalOptions.ctas),
    formats: uniqueList(state.client.internalOptions.formats),
    platforms: uniqueList(state.client.internalOptions.platforms)
  };
}

function setAiStatus(mode = "idle", text = "", percent = null) {
  window.clearTimeout(state.aiStatus.timer);
  const safePercent = mode === "idle"
    ? null
    : (Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null);
  state.aiStatus = {
    mode,
    text: text || (mode === "idle" ? "IA em repouso" : "Processando conteudo..."),
    percent: safePercent,
    timer: null
  };
  renderAiStatus();

  if (mode === "success" || mode === "error") {
    state.aiStatus.timer = window.setTimeout(() => {
      state.aiStatus.mode = "idle";
      state.aiStatus.text = "IA em repouso";
      state.aiStatus.percent = null;
      renderAiStatus();
    }, 1400);
  }
}

function renderAiStatus() {
  if (!els.aiStatusStrip || !els.aiStatusText || !els.aiProgressFill) return;
  const mode = state.aiStatus?.mode || "idle";
  els.aiStatusStrip.className = `ai-status is-${mode}`;
  els.aiStatusText.textContent = state.aiStatus?.text || "IA em repouso";
  els.aiProgressFill.style.width = Number.isFinite(state.aiStatus?.percent)
    ? `${state.aiStatus.percent}%`
    : "";
}

async function withAiStatus(text, task, { successText = "Finalizado.", errorText = "Falha no processamento.", minDuration = 420 } = {}) {
  const startedAt = Date.now();
  setAiStatus("running", text || "Processando conteudo...");
  try {
    const result = await task();
    const remaining = Math.max(0, minDuration - (Date.now() - startedAt));
    if (remaining) {
      await new Promise((resolve) => window.setTimeout(resolve, remaining));
    }
    setAiStatus("success", successText, 100);
    return result;
  } catch (err) {
    setAiStatus("error", errorText, 100);
    throw err;
  }
}

function renderTabs() {
  const tabs = [
    ["client", "Cliente"],
    ["planner", "Planner"],
    ["cards", "Cards"],
    ["script", "Roteiro do Item"]
  ];
  els.studioTabs.innerHTML = tabs.map(([id, label]) => `
    <button class="tab-button ${state.activeTab === id ? "is-active" : ""}" type="button" data-tab="${id}">
      ${escapeHtml(label)}
    </button>
  `).join("");
}

function getTabLabel(tabId) {
  return {
    client: "Cliente",
    planner: "Planner",
    cards: "Cards",
    script: "Roteiro do Item"
  }[tabId] || "Studio";
}

function renderActiveTab() {
  if (state.activeTab === "client") renderClientTab();
  if (state.activeTab === "planner") renderPlannerTab();
  if (state.activeTab === "cards") renderCardsTab();
  if (state.activeTab === "script") renderScriptTab();
}

function renderClientTab() {
  const client = state.client;
  const validation = validateClientKit();
  const plan = PLAN_RULES[client.plan] || PLAN_RULES[DEFAULT_CLIENT.plan];
  const logoHtml = client.logo
    ? `<img src="${escapeHtml(client.logo)}" alt="Logo do cliente">`
    : `<span>${escapeHtml(getInitials(client.name))}</span>`;

  els.tabPanel.innerHTML = `
    <article class="document client-document">
      <header class="client-hero">
        <div class="client-logo">${logoHtml}</div>
        <div class="client-hero-copy">
          <span class="eyebrow">Central estrategica do cliente</span>
          <h1>${escapeHtml(client.name || "Cliente sem nome")}</h1>
          <p>${escapeHtml(client.segment || "Segmento nao definido")} &bull; ${escapeHtml(client.niche || "Nicho nao definido")} &bull; ${escapeHtml(client.subniche || "Subnicho nao definido")}</p>
          <div class="badge-row">
            <span class="badge">${escapeHtml(client.plan || "Plano nao definido")}</span>
            <span class="badge ${state.clientDirty ? "is-warn" : "is-ok"}">${state.clientDirty ? "Alteracoes pendentes" : ".KIT salvo"}</span>
            <span class="badge">Atualizado: ${escapeHtml(client.updatedAt ? formatDateTime(client.updatedAt) : "local")}</span>
          </div>
        </div>
        <div class="client-hero-actions">
          <button class="ghost-button" type="button" data-action="open-kit" title="Abrir .kit">Abrir .kit</button>
          <button class="ghost-button" type="button" data-action="select-logo" title="Selecionar logo">Logo</button>
          <button class="ghost-button" type="button" data-action="duplicate-client" title="Duplicar cliente">Duplicar</button>
          <button class="primary-button" type="button" data-action="save-kit" title="Salvar .kit">Salvar .kit</button>
        </div>
      </header>

      ${validation.errors.length ? `<div class="client-alert">Campos minimos pendentes: ${escapeHtml(validation.errors.join(", "))}</div>` : ""}

      ${clientBlock("Identidade e Segmentacao", "Essas informacoes orientam o posicionamento, linguagem, campanhas e conteudos do cliente.", `
        <div class="doc-grid is-three">
          ${textField("name", "Nome do cliente", client.name, "Nome da empresa")}
          ${selectClientField("segment", "Segmento", client.segment, client.internalOptions.segments, "Selecione o segmento")}
          ${textField("niche", "Nicho especifico", client.niche, "Ex: loteamentos, casas populares, energia fotovoltaica residencial...")}
          ${textField("subniche", "Subnicho", client.subniche, "Ex: Minha Casa Minha Vida, alto padrao, empresas, familias...")}
          ${textField("logo", "Logo", client.logo, "Caminho do arquivo de logo", "is-wide")}
          ${client.segment === "Outro" ? textField("customSegment", "Segmento manual", client.customSegment || "", "Digite o segmento do cliente") : ""}
        </div>
      `)}

      ${clientBlock("Plano e Atendimento", "Define o nivel de acompanhamento, presenca, treinamento e gestao da ADSune para este cliente.", `
        <div class="doc-grid">
          ${selectClientField("plan", "Plano contratado", client.plan, CLIENT_OPTIONS.plans, "Selecione o plano")}
          ${selectClientField("attendanceMode", "Modalidade de atendimento", client.attendanceMode, CLIENT_OPTIONS.attendanceModes)}
          ${selectClientField("meetingFrequency", "Frequencia de reuniao", client.meetingFrequency, CLIENT_OPTIONS.meetingFrequencies)}
          <div class="plan-summary">
            <strong>Resumo automatico do plano</strong>
            <ul>${plan.summary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
          <div class="plan-summary">
            <strong>Regras para a KIT</strong>
            <ul>${plan.rules.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </div>
        </div>
      `)}

      ${clientBlock("Presenca Digital", "Canais onde a empresa aparece, anuncia ou recebe clientes.", `
        ${chipGroup("channels", client.channels, CLIENT_OPTIONS.channels, { addLabel: "Adicionar canal" })}
        <div class="doc-grid is-three">
          ${textField("links.instagram", "Instagram URL", client.links.instagram, "https://instagram.com/...")}
          ${textField("links.facebook", "Facebook URL", client.links.facebook, "https://facebook.com/...")}
          ${textField("links.whatsapp", "WhatsApp", client.links.whatsapp, "55 00 00000-0000")}
          ${textField("links.site", "Site", client.links.site, "https://...")}
          ${textField("links.bio", "Link da bio", client.links.bio, "https://...")}
          ${textField("links.googleBusiness", "Google Meu Negocio", client.links.googleBusiness, "https://...")}
        </div>
      `)}

      ${clientBlock("Perfil Estrategico", "Define quem o cliente quer atingir e o que a ADSune deve priorizar.", `
        <div class="doc-grid">
          ${textareaField("audience", "Publico-alvo", client.audience, "Ex: Familias procurando primeiro imovel, investidores buscando oportunidade segura...")}
          ${selectClientField("currentPriority", "Prioridade atual", client.currentPriority, CLIENT_OPTIONS.priorities)}
        </div>
        ${chipGroup("recurringCommercialGoals", client.recurringCommercialGoals, CLIENT_OPTIONS.commercialGoals, { addLabel: "Adicionar objetivo" })}
      `)}

      ${clientBlock("Produtos, Servicos e Dependencias", "Ajuda a KIT a saber o que pode ser planejado livremente e o que depende de informacao externa.", `
        ${textareaField("mainProducts", "Produtos/servicos principais", client.mainProducts, "Ex: loteamentos, casas novas, energia solar residencial...")}
        <h3>Produtos que dependem de informacao externa</h3>
        ${chipGroup("externalInfoDependentProducts", client.externalInfoDependentProducts, CLIENT_OPTIONS.dependentProducts, { addLabel: "Adicionar dependencia" })}
        <h3>Informacoes obrigatorias para produto/oferta</h3>
        ${chipGroup("requiredOfferFields", client.requiredOfferFields, CLIENT_OPTIONS.requiredOfferFields, { addLabel: "Adicionar campo" })}
        <div class="client-note">Quando um conteudo depender desses dados, a KIT deve sinalizar a pendencia antes de gerar post ou anuncio definitivo.</div>
      `)}

      ${clientBlock("Comunicacao e Restricoes", "Define como a marca fala e o que a KIT deve evitar.", `
        <h3>Tom de comunicacao</h3>
        ${chipGroup("toneOfVoice", client.toneOfVoice, client.internalOptions.tones, { addLabel: "Adicionar tom" })}
        <div class="doc-grid">
          ${textareaField("languageRestrictions", "Restricoes de linguagem", client.languageRestrictions, "Ex: evitar promessas absolutas, nao garantir financiamento aprovado...")}
          ${textareaField("brandRules", "Regras importantes da marca", client.brandRules, "Ex: sempre usar linguagem consultiva, priorizar WhatsApp...")}
        </div>
        <h3>Palavras ou promessas proibidas</h3>
        ${chipGroup("forbiddenClaims", client.forbiddenClaims, CLIENT_OPTIONS.forbiddenClaims, { addLabel: "Adicionar promessa proibida" })}
      `)}

      ${clientBlock("Marketing, Funil e Conteudo", "Preferencias e opcoes padrao usadas nos planners, posts, roteiros e anuncios.", `
        <h3>Objetivos de marketing</h3>
        ${chipGroup("marketing.objectives", client.marketing.objectives, client.internalOptions.objectives, { addLabel: "Adicionar objetivo" })}
        <h3>Funil</h3>
        ${chipGroup("marketing.funnelStages", client.marketing.funnelStages, client.internalOptions.funnel, { addLabel: "Adicionar etapa" })}
        <h3>CTAs preferenciais</h3>
        ${chipGroup("marketing.preferredCtas", client.marketing.preferredCtas, client.internalOptions.ctas, { addLabel: "Adicionar CTA" })}
        <h3>Formatos usados</h3>
        ${chipGroup("marketing.formats", client.marketing.formats, client.internalOptions.formats, { addLabel: "Adicionar formato" })}
        <h3>Plataformas usadas</h3>
        ${chipGroup("marketing.platforms", client.marketing.platforms, client.internalOptions.platforms, { addLabel: "Adicionar plataforma" })}
      `)}

      ${clientBlock("Campanhas Ativas", "Campanhas que estao rodando ou que devem ser consideradas no planejamento.", `
        <div class="client-list-actions"><button class="ghost-button" type="button" data-action="add-campaign">Adicionar campanha</button></div>
        <div class="campaign-grid">${client.campaigns.map(renderCampaignCard).join("") || `<div class="empty-state">Nenhuma campanha cadastrada.</div>`}</div>
      `)}

      ${clientBlock("Observacoes e Historico Estrategico", "Memoria estrategica do cliente para decisoes futuras.", `
        ${textareaField("strategicNotes", "Observacoes estrategicas", client.strategicNotes, "Ex: priorizar conteudo educativo, usar CTA para WhatsApp...")}
        <div class="client-list-actions"><button class="ghost-button" type="button" data-action="add-history">Adicionar registro mensal</button></div>
        <div class="history-list">${client.history.length ? client.history.map(renderHistoryCard).join("") : `<div class="empty-state">Nenhum historico registrado ainda.</div>`}</div>
      `)}

      <details class="client-block client-options-block">
        <summary>
          <span>
            <strong>Opcoes internas da KIT</strong>
            <small>Listas usadas pela KIT para sugerir objetivos, formatos, CTAs, funil e plataformas.</small>
          </span>
        </summary>
        <div class="internal-options-grid">
          ${internalOptionEditor("objectives", "Objetivos")}
          ${internalOptionEditor("funnel", "Funil")}
          ${internalOptionEditor("ctas", "CTAs")}
          ${internalOptionEditor("formats", "Formatos")}
          ${internalOptionEditor("platforms", "Plataformas")}
          ${internalOptionEditor("tones", "Tons de comunicacao")}
          ${internalOptionEditor("segments", "Segmentos")}
          ${internalOptionEditor("campaignTypes", "Tipos de campanha")}
        </div>
      </details>

      ${state.clientDirty ? `
        <div class="client-save-bar">
          <span>Alteracoes pendentes no .kit</span>
          <button class="primary-button" type="button" data-action="save-kit">Salvar .kit</button>
        </div>
      ` : ""}
    </article>
  `;
}

function clientBlock(title, description, body) {
  return `
    <section class="client-block">
      <header>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(description)}</p>
      </header>
      ${body}
    </section>
  `;
}

function textField(field, label, value, placeholder = "", extraClass = "") {
  return `
    <label class="doc-field ${extraClass}">
      <span class="field-label">${escapeHtml(label)}</span>
      <input class="doc-input" data-client-field="${escapeHtml(field)}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value || "")}">
    </label>
  `;
}

function textareaField(field, label, value, placeholder = "") {
  return `
    <label class="doc-field is-wide">
      <span class="field-label">${escapeHtml(label)}</span>
      <textarea class="doc-textarea" data-client-field="${escapeHtml(field)}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value || "")}</textarea>
    </label>
  `;
}

function selectClientField(field, label, value, options, placeholder = "Selecione") {
  return `
    <label class="doc-field">
      <span class="field-label">${escapeHtml(label)}</span>
      <select class="doc-select" data-client-field="${escapeHtml(field)}">
        <option value="" ${value ? "" : "selected"}>${escapeHtml(placeholder)}</option>
        ${mergeOptions(options, [value]).map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function chipGroup(field, selected, options, { addLabel = "Adicionar" } = {}) {
  const selectedSet = new Set(uniqueList(selected));
  const optionHtml = mergeOptions(options, selected).map((option) => {
    const isSelected = selectedSet.has(option);
    return `
      <button class="client-chip ${isSelected ? "is-selected" : ""}" type="button" data-chip-field="${escapeHtml(field)}" data-chip-value="${escapeHtml(option)}">
        ${escapeHtml(option)}
        ${isSelected && !options.includes(option) ? `<span data-chip-remove="true">x</span>` : ""}
      </button>
    `;
  }).join("");

  return `
    <div class="chip-group" data-chip-group="${escapeHtml(field)}">
      ${optionHtml}
      <button class="client-chip is-add" type="button" data-action="add-chip" data-chip-field="${escapeHtml(field)}">${escapeHtml(addLabel)}</button>
    </div>
  `;
}

function renderCampaignCard(campaign) {
  return `
    <article class="campaign-card" data-campaign-id="${escapeHtml(campaign.id)}">
      <div class="campaign-card-head">
        <span class="badge ${campaign.status === "Ativa" ? "is-ok" : ""}">${escapeHtml(campaign.status)}</span>
        <button class="ghost-button" type="button" data-action="archive-campaign" data-campaign-id="${escapeHtml(campaign.id)}">Arquivar</button>
      </div>
      <div class="doc-grid">
        ${campaignField(campaign.id, "name", "Nome da campanha", campaign.name)}
        ${campaignSelect(campaign.id, "status", "Status", campaign.status, CLIENT_OPTIONS.campaignStatuses)}
        ${campaignSelect(campaign.id, "type", "Tipo", campaign.type, state.client.internalOptions.campaignTypes)}
        ${campaignSelect(campaign.id, "objective", "Objetivo", campaign.objective, CLIENT_OPTIONS.campaignObjectives)}
        ${campaignField(campaign.id, "startDate", "Data de inicio", campaign.startDate, "date")}
        ${campaignField(campaign.id, "endDate", "Data de fim", campaign.endDate, "date")}
        <label class="doc-field is-wide">
          <span class="field-label">Observacoes</span>
          <textarea class="doc-textarea" data-campaign-field="notes">${escapeHtml(campaign.notes || "")}</textarea>
        </label>
      </div>
    </article>
  `;
}

function campaignField(id, field, label, value, type = "text") {
  return `<label class="doc-field"><span class="field-label">${escapeHtml(label)}</span><input class="doc-input" type="${escapeHtml(type)}" data-campaign-field="${escapeHtml(field)}" value="${escapeHtml(value || "")}"></label>`;
}

function campaignSelect(id, field, label, value, options) {
  return `<label class="doc-field"><span class="field-label">${escapeHtml(label)}</span><select class="doc-select" data-campaign-field="${escapeHtml(field)}">${mergeOptions(options, [value]).map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
}

function renderHistoryCard(item) {
  return `
    <article class="history-card" data-history-id="${escapeHtml(item.id)}">
      <div class="doc-grid">
        ${historyField("month", "Mes/Ano", item.month, "month")}
        ${historyField("summary", "Resumo do planejamento", item.summary)}
        ${historyText("whatWorked", "O que funcionou", item.whatWorked)}
        ${historyText("whatToAvoid", "O que evitar", item.whatToAvoid)}
        ${historyText("nextNotes", "Observacoes para o proximo mes", item.nextNotes)}
      </div>
    </article>
  `;
}

function historyField(field, label, value, type = "text") {
  return `<label class="doc-field"><span class="field-label">${escapeHtml(label)}</span><input class="doc-input" type="${escapeHtml(type)}" data-history-field="${escapeHtml(field)}" value="${escapeHtml(value || "")}"></label>`;
}

function historyText(field, label, value) {
  return `<label class="doc-field is-wide"><span class="field-label">${escapeHtml(label)}</span><textarea class="doc-textarea" data-history-field="${escapeHtml(field)}">${escapeHtml(value || "")}</textarea></label>`;
}

function internalOptionEditor(key, label) {
  return `
    <section class="internal-option-card">
      <div class="internal-option-head">
        <strong>${escapeHtml(label)}</strong>
        <button class="ghost-button" type="button" data-action="restore-options" data-options-key="${escapeHtml(key)}">Padrao</button>
      </div>
      ${chipGroup(`internalOptions.${key}`, state.client.internalOptions[key] || [], state.client.internalOptions[key] || [], { addLabel: "Adicionar opcao" })}
    </section>
  `;
}

function renderPlannerTab() {
  const planner = getPlanner();
  if (!planner) {
    els.tabPanel.innerHTML = `
      <article class="document">
        <header class="document-header">
          <div class="document-title">
            <span class="eyebrow">Planner mensal</span>
            <h1>Nenhum planner para ${escapeHtml(monthLabel())}</h1>
            <p>Cada cliente pode ter apenas um calendario por mes. Se ele ja existir, esta aba abre o planejamento salvo.</p>
          </div>
          <button class="primary-button" type="button" data-action="create-planner">Gerar novo planner</button>
        </header>
        <div class="doc-section empty-state">Use o botao acima ou peca no chat: "Gere o planejamento deste mes para este cliente".</div>
      </article>
    `;
    return;
  }

  els.tabPanel.innerHTML = `
    <article class="document is-planner-print">
      <header class="document-header">
        <div class="document-title">
          <span class="eyebrow">Planejamento mensal</span>
          <h1>${escapeHtml(state.client.name)} - ${escapeHtml(monthLabel())}</h1>
          <p>${escapeHtml(planner.diagnosis)}</p>
        </div>
        <div class="inline-actions no-print">
          <button class="ghost-button" type="button" data-action="regenerate-planner">Regenerar</button>
          <button class="primary-button" type="button" data-action="planner-to-cards">Atualizar cards</button>
        </div>
      </header>

      <section class="doc-section">
        <div class="summary-grid">
          ${summaryCard("Objetivo macro", planner.macroObjective)}
          ${summaryCard("Campanhas", `${planner.campaigns.length} ativas`)}
          ${summaryCard("Anuncios ADS", `${planner.ads.length} planejados`)}
          ${summaryCard("Itens editoriais", `${planner.items.length} no mes`)}
        </div>
      </section>

      <section class="doc-section">
        <h2>Estrategia do mes</h2>
        ${textareaPlannerField("diagnosis", "Diagnostico estrategico do mes", planner.diagnosis)}
        ${textareaPlannerField("macroObjective", "Objetivo macro", planner.macroObjective)}
        ${textareaPlannerField("secondaryObjectives", "Objetivos secundarios", planner.secondaryObjectives.join("\\n"))}
      </section>

      <section class="doc-section">
        <h2>Funil de conteudo</h2>
        <div class="funnel-grid">
          ${planner.funnel.map((item) => `<div class="funnel-card"><span class="meta-label">${escapeHtml(item.stage)}</span><strong>${escapeHtml(item.focus)}</strong></div>`).join("")}
        </div>
      </section>

      <section class="doc-section">
        <h2>Distribuicao e campanhas</h2>
        <div class="doc-grid">
          ${textareaPlannerField("formatDistribution", "Distribuicao de formatos", planner.formatDistribution.join("\\n"))}
          ${textareaPlannerField("campaigns", "Campanhas do mes", planner.campaigns.join("\\n"))}
        </div>
      </section>

      <section class="doc-section">
        <h2>Anuncios ADS do mes</h2>
        <div class="ad-list">
          ${planner.ads.map(renderAdCard).join("") || `<div class="empty-state">Nenhum anuncio planejado.</div>`}
        </div>
      </section>

      <section class="doc-section">
        <h2>Calendario mensal</h2>
        <div class="planner-calendar">
          ${WEEKDAYS.map((day) => `<div class="weekday">${day}</div>`).join("")}
          ${renderCalendar(planner.items)}
        </div>
      </section>

      <section class="doc-section">
        <h2>Status e pendencias</h2>
        <div class="status-grid">
          ${statusCard("Aguardando produto", countByStatus("Aguardando informacao do produto"))}
          ${statusCard("Rascunho", countByStatus("Rascunho"))}
          ${statusCard("Em producao", countByStatus("Em producao"))}
          ${statusCard("Concluido", countByStatus("Concluido"))}
        </div>
      </section>
    </article>
  `;
}

function summaryCard(label, value) {
  return `<div class="summary-card"><span class="meta-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function statusCard(label, value) {
  return `<div class="status-card"><span class="meta-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function textareaPlannerField(field, label, value) {
  return `
    <label class="doc-field is-wide">
      <span class="field-label">${escapeHtml(label)}</span>
      <textarea class="doc-textarea" data-planner-field="${escapeHtml(field)}">${escapeHtml(value || "")}</textarea>
    </label>
  `;
}

function renderAdCard(ad) {
  return `
    <div class="ad-card" data-ad-id="${escapeHtml(ad.id)}">
      <label class="doc-field">
        <span class="field-label">Nome da campanha</span>
        <input class="doc-input" data-ad-field="name" value="${escapeHtml(ad.name)}">
      </label>
      ${selectField("objective", "Objetivo", ad.objective, state.marketingOptions.objectives, "data-ad-field")}
      ${selectField("platform", "Plataforma", ad.platform, state.marketingOptions.platforms, "data-ad-field")}
      <label class="doc-field">
        <span class="field-label">Duracao</span>
        <input class="doc-input" data-ad-field="duration" value="${escapeHtml(ad.duration)}">
      </label>
      <label class="doc-field">
        <span class="field-label">Inicio</span>
        <input class="doc-input" type="date" data-ad-field="startDate" value="${escapeHtml(ad.startDate)}">
      </label>
      <label class="doc-field">
        <span class="field-label">Fim</span>
        <input class="doc-input" type="date" data-ad-field="endDate" value="${escapeHtml(ad.endDate)}">
      </label>
      ${selectField("cta", "CTA", ad.cta, state.marketingOptions.ctas, "data-ad-field")}
      <label class="doc-field">
        <span class="field-label">Status</span>
        <input class="doc-input" data-ad-field="status" value="${escapeHtml(ad.status)}">
      </label>
      <label class="doc-field is-full">
        <span class="field-label">Publico, oferta, criativo e observacoes</span>
        <textarea class="doc-textarea" data-ad-field="notes">${escapeHtml(ad.notes)}</textarea>
      </label>
    </div>
  `;
}

function renderCalendar(items) {
  const [year, month] = state.selectedMonth.split("-").map(Number);
  const firstDate = new Date(year, month - 1, 1);
  const totalDays = new Date(year, month, 0).getDate();
  const leading = (firstDate.getDay() + 6) % 7;
  const cells = [];

  for (let i = 0; i < leading; i += 1) {
    cells.push(`<div class="calendar-day is-muted"></div>`);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = `${state.selectedMonth}-${String(day).padStart(2, "0")}`;
    const dayItems = items.filter((item) => item.date === date);
    cells.push(`
      <button class="calendar-day" type="button" data-day="${escapeHtml(date)}">
        <span class="day-number">${day}</span>
        ${dayItems.map((item) => `
          <span class="calendar-item ${item.kind === "ad" ? "is-ad" : ""}" data-item-id="${escapeHtml(item.id)}">
            <strong>${escapeHtml(item.type)}</strong>
            <span>${escapeHtml(item.objective)}</span>
            <span>${escapeHtml(item.funnel)} / ${escapeHtml(item.platform)}</span>
            <span>${escapeHtml(item.productionStatus)}</span>
          </span>
        `).join("")}
      </button>
    `);
  }
  return cells.join("");
}

function renderCardsTab() {
  const planner = ensurePlannerForEditing();
  if (!planner) return;
  els.tabPanel.innerHTML = `
    <article class="document">
      <header class="document-header">
        <div class="document-title">
          <span class="eyebrow">Refino editorial</span>
          <h1>Cards do mes</h1>
          <p>Cada card separa status de producao e status de publicacao. Itens de produto podem ficar bloqueados ate receberem informacoes minimas.</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" type="button" data-action="add-item">Adicionar item</button>
          <button class="ghost-button" type="button" data-action="generate-draft-captions">Legendas em rascunho</button>
        </div>
      </header>
      <section class="doc-section cards-grid">
        ${planner.items.map(renderContentCard).join("")}
      </section>
    </article>
  `;
}

function ensurePlannerForEditing() {
  const planner = getPlanner();
  if (!planner) {
    els.tabPanel.innerHTML = `
      <article class="document">
        <div class="empty-state">Crie o planner mensal antes de refinar cards ou roteiro.</div>
      </article>
    `;
    return null;
  }
  return planner;
}

function renderContentCard(item) {
  const needsProduct = Boolean(item.dependsOnProduct);
  const kiaReady = Boolean(item.kiaPath);
  return `
    <article class="content-card" data-item-id="${escapeHtml(item.id)}">
      <header class="content-card-header">
        <div>
          <span class="eyebrow">${escapeHtml(item.date)}</span>
          <h3>${escapeHtml(item.theme || "Item sem tema")}</h3>
        </div>
        <div class="badge-row">
          <span class="badge ${needsProduct ? "is-warn" : ""}">${needsProduct ? "Produto" : "Editorial"}</span>
          <span class="badge ${kiaReady ? "is-ok" : ""}">${kiaReady ? ".kia gerado" : "sem .kia"}</span>
        </div>
      </header>

      <div class="mini-grid">
        <label class="doc-field"><span class="field-label">Data</span><input class="doc-input" type="date" data-item-field="date" value="${escapeHtml(item.date)}"></label>
        ${selectField("type", "Tipo de conteudo", item.type, MARKETING_OPTIONS.contentTypes, "data-item-field")}
        ${selectField("platform", "Plataforma", item.platform, state.marketingOptions.platforms, "data-item-field")}
        ${selectField("objective", "Objetivo", item.objective, state.marketingOptions.objectives, "data-item-field")}
        ${selectField("funnel", "Funil", item.funnel, state.marketingOptions.funnel, "data-item-field")}
        ${selectField("cta", "CTA", item.cta, state.marketingOptions.ctas, "data-item-field")}
        ${selectField("format", "Formato", item.format, state.marketingOptions.formats, "data-item-field")}
        ${selectField("productionStatus", "Status de producao", item.productionStatus, MARKETING_OPTIONS.productionStatus, "data-item-field")}
        ${selectField("publicationStatus", "Status de publicacao", item.publicationStatus, MARKETING_OPTIONS.publicationStatus, "data-item-field")}
        <label class="doc-field"><span class="field-label">Depende de produto</span><select class="doc-select" data-item-field="dependsOnProduct"><option value="false" ${!needsProduct ? "selected" : ""}>Nao</option><option value="true" ${needsProduct ? "selected" : ""}>Sim</option></select></label>
      </div>

      <label class="doc-field">
        <span class="field-label">Tema</span>
        <input class="doc-input" data-item-field="theme" value="${escapeHtml(item.theme)}">
      </label>
      <label class="doc-field">
        <span class="field-label">Legenda inicial</span>
        <textarea class="doc-textarea" data-item-field="caption">${escapeHtml(item.caption)}</textarea>
      </label>
      <label class="doc-field">
        <span class="field-label">Informacoes minimas do produto</span>
        <textarea class="doc-textarea" data-item-field="productInfo">${escapeHtml(item.productInfo || "")}</textarea>
      </label>
      <div class="inline-actions">
        <button class="ghost-button" type="button" data-action="select-item" data-item-id="${escapeHtml(item.id)}">Abrir roteiro</button>
        <button class="ghost-button" type="button" data-action="regenerate-item" data-item-id="${escapeHtml(item.id)}">Regenerar com IA</button>
        <button class="primary-button" type="button" data-action="generate-one-kia" data-item-id="${escapeHtml(item.id)}" ${isKiaEligible(item) ? "" : "disabled"}>Gerar .kia</button>
      </div>
    </article>
  `;
}

function selectField(field, label, value, options, attrName) {
  return `
    <label class="doc-field">
      <span class="field-label">${escapeHtml(label)}</span>
      <select class="doc-select" ${attrName}="${escapeHtml(field)}">
        ${mergeOptions(options, [value]).map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderScriptTab() {
  const planner = ensurePlannerForEditing();
  if (!planner) return;
  const selected = getSelectedItem(planner) || planner.items[0];
  if (!selected) {
    els.tabPanel.innerHTML = `<article class="document"><div class="empty-state">Nenhum item disponivel para roteiro.</div></article>`;
    return;
  }
  state.selectedItemId = selected.id;
  els.tabPanel.innerHTML = `
    <article class="document">
      <header class="document-header">
        <div class="document-title">
          <span class="eyebrow">Documento editavel do item</span>
          <h1>Roteiro do Item</h1>
          <p>${escapeHtml(selected.theme)}</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" type="button" data-action="transform-carousel">Virar carrossel</button>
          <button class="ghost-button" type="button" data-action="create-reel-script">Criar roteiro de reel</button>
        </div>
      </header>

      <section class="doc-section route-layout">
        <div class="item-list">
          ${planner.items.map((item) => `
            <button type="button" data-action="select-item" data-item-id="${escapeHtml(item.id)}" class="${item.id === selected.id ? "is-active" : ""}">
              <strong>${escapeHtml(item.date)} - ${escapeHtml(item.type)}</strong><br>
              ${escapeHtml(item.theme)}
            </button>
          `).join("")}
        </div>
        <div class="route-doc">
          ${routeField(selected, "internalTitle", "Titulo interno")}
          ${routeField(selected, "theme", "Tema")}
          ${routeSelect(selected, "objective", "Objetivo", state.marketingOptions.objectives)}
          ${routeSelect(selected, "funnel", "Funil", state.marketingOptions.funnel)}
          ${routeSelect(selected, "cta", "CTA", state.marketingOptions.ctas)}
          ${routeSelect(selected, "platform", "Plataforma", state.marketingOptions.platforms)}
          ${routeSelect(selected, "format", "Formato", state.marketingOptions.formats)}
          ${routeText(selected, "briefing", "Briefing")}
          ${routeText(selected, "caption", "Legenda do post")}
          ${routeText(selected, "hashtags", "Hashtags")}
          ${routeText(selected, "visualDirection", "Direcao visual")}
          ${routeText(selected, "references", "Referencias")}
          ${routeText(selected, "videoScript", "Roteiro de video")}
          ${routeText(selected, "narration", "Narracao")}
          ${routeText(selected, "screenText", "Texto na tela")}
          ${routeText(selected, "scenes", "Cenas/slides")}
          ${routeText(selected, "positivePrompt", "Prompt positivo")}
          ${routeText(selected, "negativePrompt", "Prompt negativo")}
          ${routeText(selected, "productionNotes", "Observacoes de producao")}
          ${routeField(selected, "template", "Template sugerido")}
          ${routeSelect(selected, "productionStatus", "Status", MARKETING_OPTIONS.productionStatus)}
        </div>
      </section>
    </article>
  `;
}

function routeField(item, field, label) {
  return routeBlock(label, `<input class="doc-input" data-route-field="${escapeHtml(field)}" value="${escapeHtml(item[field] || "")}">`);
}

function routeSelect(item, field, label, options) {
  return routeBlock(label, `<select class="doc-select" data-route-field="${escapeHtml(field)}">${mergeOptions(options, [item[field]]).map((option) => `<option value="${escapeHtml(option)}" ${option === item[field] ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`);
}

function routeText(item, field, label) {
  return routeBlock(label, `<textarea class="doc-textarea" data-route-field="${escapeHtml(field)}">${escapeHtml(item[field] || "")}</textarea>`);
}

function routeBlock(label, controlHtml) {
  const actions = ["Regenerar", "Melhorar", "Encurtar", "Expandir", "Mais tecnico", "Mais emocional", "Tom da marca"];
  return `
    <section class="route-block">
      <div class="route-block-header">
        <h3>${escapeHtml(label)}</h3>
        <div class="block-tools">
          ${actions.map((action) => `<button type="button" data-action="route-ai" data-ai-action="${escapeHtml(action)}" data-label="${escapeHtml(label)}">${escapeHtml(action)}</button>`).join("")}
        </div>
      </div>
      ${controlHtml}
    </section>
  `;
}

function getSelectedItem(planner = getPlanner()) {
  return (planner?.items || []).find((item) => item.id === state.selectedItemId) || null;
}

function createPlanner({ force = false } = {}) {
  if (getPlanner() && !force) {
    pushMessage("assistant", `Ja existe um planner para ${state.client.name} em ${monthLabel()}. Abri o planejamento existente para evitar duplicidade.`);
    state.activeTab = "planner";
    render();
    return getPlanner();
  }

  const [year, month] = state.selectedMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const segmentFocus = `${state.client.segment} / ${state.client.niche} / ${state.client.subniche}`.replace(/\s+\/\s+\/\s*$/, "");
  const isRealEstateProduct = /imob|lote|apart|casa|imovel/i.test(`${state.client.segment} ${state.client.niche} ${state.client.products}`);
  const postDays = [2, 5, 8, 12, 15, 19, 22, 26, Math.min(29, daysInMonth)].filter((day, index, arr) => day <= daysInMonth && arr.indexOf(day) === index);
  const types = ["Carrossel", "Reel", "Post", "Story", "Carrossel", "Reel", "Post", "Story", "Post"];
  const objectives = ["Educacao", "Geracao de leads", "Autoridade", "Relacionamento", "Prova social", "Conversao", "Reconhecimento de marca", "Captacao de direct", "Venda direta"];
  const funnels = ["Topo", "Meio", "Topo", "Pos-venda", "Meio", "Fundo", "Topo", "Reativacao", "Fundo"];

  const items = postDays.map((day, index) => {
    const dependsOnProduct = isRealEstateProduct && [2, 5].includes(index);
    const item = createPlannerItem({
      date: `${state.selectedMonth}-${String(day).padStart(2, "0")}`,
      type: types[index] || "Post",
      objective: objectives[index] || "Relacionamento",
      funnel: funnels[index] || "Topo",
      theme: buildTheme(index, dependsOnProduct),
      dependsOnProduct
    });
    return item;
  });

  const adStart = `${state.selectedMonth}-${String(Math.min(3, daysInMonth)).padStart(2, "0")}`;
  const adEndDay = Math.min(17, daysInMonth);
  const planner = {
    id: uid("planner"),
    clientName: state.client.name,
    month: state.selectedMonth,
    status: "Rascunho estrategico",
    diagnosis: `O mes pede uma comunicacao especifica para ${segmentFocus}. A estrategia deve evitar conteudos genericos e transformar as dores do publico em educacao, prova e convite comercial claro.`,
    macroObjective: `Gerar demanda qualificada para ${state.client.niche || state.client.segment}, mantendo autoridade e consistencia editorial.`,
    secondaryObjectives: [
      "Aumentar reconhecimento de marca com conteudos de topo de funil.",
      "Converter interesse em conversas no WhatsApp ou direct.",
      "Apoiar campanhas ativas com criativos e argumentos editoriais."
    ],
    funnel: [
      { stage: "Topo", focus: "Educacao, descoberta de problema e reconhecimento." },
      { stage: "Meio", focus: "Prova, comparativos e criterios de decisao." },
      { stage: "Fundo", focus: "Oferta, CTA forte e objecoes finais." },
      { stage: "Reativacao", focus: "Retomar leads mornos e conversas antigas." }
    ],
    formatDistribution: ["3 Reels", "3 Carrosseis", "2 Stories", "1 Post institucional", "1 campanha ADS"],
    campaigns: splitLines(state.client.activeCampaigns || "Campanha institucional do mes"),
    ads: [
      {
        id: uid("ad"),
        name: `ADS - Leads ${state.client.niche || state.client.segment}`,
        objective: "Geracao de leads",
        platform: /google/i.test(state.client.socialNetworks) ? "Google Ads" : "Meta Ads",
        duration: "15 dias",
        startDate: adStart,
        endDate: `${state.selectedMonth}-${String(adEndDay).padStart(2, "0")}`,
        audience: state.client.audience,
        cta: "Entrar em contato pelo WhatsApp",
        offer: state.client.commercialGoals,
        status: "Rascunho",
        creativeId: "",
        notes: "Criativo vinculado aos melhores argumentos dos posts de meio e fundo de funil."
      }
    ],
    items,
    waitingProductInfo: items.filter((item) => item.dependsOnProduct).map((item) => item.id),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  setPlanner(planner);
  state.selectedItemId = planner.items[0]?.id || null;
  pushMessage("assistant", "Planejamento mensal criado por etapas: analisei o .kit, considerei historico/campanhas, montei estrategia macro, calendario, cards e pontos que aguardam informacao de produto.");
  return planner;
}

function createPlannerItem(overrides = {}) {
  const dependsOnProduct = Boolean(overrides.dependsOnProduct);
  const base = {
    id: uid("item"),
    kind: "post",
    date: `${state.selectedMonth}-02`,
    type: "Post",
    platform: "Instagram Feed",
    objective: "Autoridade",
    funnel: "Topo",
    cta: "Chamar no direct",
    theme: "Tema editorial",
    caption: "",
    format: "Imagem unica",
    productionStatus: dependsOnProduct ? "Aguardando informacao do produto" : "Em branco",
    publicationStatus: "Nao agendado",
    dependsOnProduct,
    hasScript: false,
    kiaPath: "",
    productInfo: "",
    internalTitle: "",
    briefing: "",
    hashtags: "",
    visualDirection: "",
    references: "",
    videoScript: "",
    narration: "",
    screenText: "",
    scenes: "",
    positivePrompt: "",
    negativePrompt: "",
    productionNotes: "",
    template: "Template editorial limpo"
  };
  const item = { ...base, ...overrides };
  enrichItemDraft(item);
  return item;
}

function buildTheme(index, dependsOnProduct) {
  const niche = state.client.niche || state.client.segment || "marca";
  const themes = [
    `Guia rapido para escolher ${niche}`,
    dependsOnProduct ? `Produto em destaque: ${niche} com dados pendentes` : `Erro comum antes de contratar ${niche}`,
    `Bastidores e criterios tecnicos em ${niche}`,
    `Pergunta frequente do publico sobre ${niche}`,
    `Prova social aplicada a ${niche}`,
    `Oferta do mes para ${niche}`,
    `Mitos e verdades sobre ${niche}`,
    `Retomada de leads interessados em ${niche}`,
    `Convite direto para falar com a equipe`
  ];
  return themes[index] || themes[0];
}

function enrichItemDraft(item) {
  item.internalTitle = item.internalTitle || `${item.type} - ${item.theme}`;
  item.briefing = item.briefing || `Criar ${item.type.toLowerCase()} para ${state.client.name}, conectando ${item.theme} ao objetivo ${item.objective}. Considerar tom: ${state.client.tone}.`;
  item.caption = item.caption || `Se voce esta avaliando ${state.client.niche || state.client.segment}, este conteudo ajuda a decidir com mais seguranca. ${item.cta}.`;
  item.hashtags = item.hashtags || `#${normalizeId(state.client.segment).replace(/-/g, "")} #marketinglocal #conteudoestrategico`;
  item.visualDirection = item.visualDirection || "Visual limpo, com hierarquia forte, destaque para promessa central e CTA claro.";
  item.references = item.references || "Usar identidade do .kit, campanhas ativas e exemplos do historico do cliente.";
  item.videoScript = item.videoScript || (/(reel|video|story)/i.test(`${item.type} ${item.format}`) ? "Gancho inicial, desenvolvimento em 2 argumentos e CTA final." : "");
  item.narration = item.narration || (item.videoScript ? `Voce sabia que ${item.theme.toLowerCase()} pode mudar sua decisao?` : "");
  item.screenText = item.screenText || "Gancho / Beneficio / Prova / CTA";
  item.scenes = item.scenes || "Cena 1: gancho. Cena 2: contexto. Cena 3: prova. Cena 4: CTA.";
  item.positivePrompt = item.positivePrompt || `Design profissional para ${state.client.segment}, tema ${item.theme}, identidade visual consistente.`;
  item.negativePrompt = item.negativePrompt || "Texto pequeno, excesso de elementos, promessa enganosa, baixa legibilidade.";
  item.productionNotes = item.productionNotes || (item.dependsOnProduct ? "Preencher dados minimos do produto antes de gerar .kia final." : "Pronto para refinamento e producao.");
}

function splitLines(value = "") {
  return String(value || "")
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function countByStatus(status) {
  return (getPlanner()?.items || []).filter((item) => item.productionStatus === status).length;
}

function getInitials(name = "") {
  return String(name || "CL")
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDateTime(value = "") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "local" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function getClientPath(path = "") {
  return String(path).split(".").reduce((acc, key) => acc?.[key], state.client);
}

function setClientPath(path = "", value) {
  const parts = String(path).split(".");
  let target = state.client;
  while (parts.length > 1) {
    const key = parts.shift();
    target[key] = target[key] && typeof target[key] === "object" ? target[key] : {};
    target = target[key];
  }
  target[parts[0]] = value;
}

function markClientDirty() {
  state.clientDirty = true;
  state.client.updatedAt = new Date().toISOString();
}

function validateClientKit() {
  const errors = [];
  if (!String(state.client.name || "").trim()) errors.push("nome do cliente");
  if (!String(state.client.segment || "").trim()) errors.push("segmento");
  if (!String(state.client.plan || "").trim()) errors.push("plano contratado");
  if (!state.client.channels?.length) errors.push("pelo menos uma rede social");
  if (!String(state.client.audience || "").trim()) errors.push("publico-alvo");
  if (!String(state.client.currentPriority || "").trim() && !state.client.marketing?.objectives?.length) errors.push("objetivo principal");
  return { valid: errors.length === 0, errors };
}

function updateClientField(field, value) {
  if (field.startsWith("options.")) {
    const key = field.replace("options.", "");
    state.marketingOptions[key] = splitLines(value);
    return;
  }
  setClientPath(field, value);
  if (field === "plan") {
    const plan = PLAN_RULES[value];
    if (plan) {
      state.client.attendanceMode = plan.attendanceMode;
      state.client.meetingFrequency = plan.meetingFrequency;
    }
  }
  if (field === "name") {
    els.topClientName.value = value;
  }
  if (field === "mainProducts") {
    state.client.products = value;
  }
  state.client = normalizeClient(state.client);
  markClientDirty();
}

function toggleClientChip(field, value) {
  const current = uniqueList(getClientPath(field));
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  setClientPath(field, next);
  state.client = normalizeClient(state.client);
  markClientDirty();
}

function addClientChip(field) {
  const value = window.prompt("Adicionar opcao");
  if (!value?.trim()) return;
  const current = uniqueList(getClientPath(field));
  setClientPath(field, mergeOptions(current, [value.trim()]));
  state.client = normalizeClient(state.client);
  markClientDirty();
}

function restoreInternalOptions(key) {
  const defaults = {
    objectives: DEFAULT_CLIENT.internalOptions.objectives,
    funnel: DEFAULT_CLIENT.internalOptions.funnel,
    ctas: DEFAULT_CLIENT.internalOptions.ctas,
    formats: DEFAULT_CLIENT.internalOptions.formats,
    platforms: DEFAULT_CLIENT.internalOptions.platforms,
    tones: DEFAULT_CLIENT.internalOptions.tones,
    segments: DEFAULT_CLIENT.internalOptions.segments,
    campaignTypes: DEFAULT_CLIENT.internalOptions.campaignTypes
  };
  state.client.internalOptions[key] = uniqueList(defaults[key] || []);
  markClientDirty();
}

function updateCampaign(campaignId, field, value) {
  const campaign = state.client.campaigns.find((item) => item.id === campaignId);
  if (!campaign) return;
  campaign[field] = value;
  markClientDirty();
}

function addCampaign() {
  state.client.campaigns.push(normalizeCampaign({
    name: "Nova campanha",
    status: "Planejada",
    type: "Meta Ads",
    objective: "Leads"
  }, state.client.campaigns.length));
  markClientDirty();
}

function archiveCampaign(campaignId) {
  const campaign = state.client.campaigns.find((item) => item.id === campaignId);
  if (!campaign) return;
  campaign.status = "Finalizada";
  markClientDirty();
}

function updateHistory(historyId, field, value) {
  const item = state.client.history.find((entry) => entry.id === historyId);
  if (!item) return;
  item[field] = value;
  markClientDirty();
}

function addHistory() {
  state.client.history.unshift(normalizeHistoryItem({ month: state.selectedMonth }, state.client.history.length));
  markClientDirty();
}

function duplicateClient() {
  const duplicatedName = `${state.client.name || "Cliente"} - copia`;
  state.client = normalizeClient({
    ...clone(state.client),
    name: duplicatedName
  });
  state.clientKitPath = "";
  markClientDirty();
  pushMessage("assistant", `Cliente duplicado como "${duplicatedName}". Salve para criar um novo .kit.`);
}

function updatePlannerField(field, value) {
  const planner = getPlanner();
  if (!planner) return;
  if (["secondaryObjectives", "formatDistribution", "campaigns"].includes(field)) {
    planner[field] = splitLines(value);
  } else {
    planner[field] = value;
  }
  planner.updatedAt = new Date().toISOString();
}

function updateAd(adId, field, value) {
  const ad = getPlanner()?.ads.find((item) => item.id === adId);
  if (!ad) return;
  ad[field] = value;
}

function updateItem(itemId, field, value) {
  const item = getPlanner()?.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item[field] = field === "dependsOnProduct" ? value === "true" : value;
  if (field === "dependsOnProduct" && item.dependsOnProduct && !item.productInfo.trim()) {
    item.productionStatus = "Aguardando informacao do produto";
  }
  if (field === "productInfo" && hasMinimumProductInfo(item)) {
    item.productionStatus = item.productionStatus === "Aguardando informacao do produto" ? "Rascunho" : item.productionStatus;
  }
}

function updateSelectedRoute(field, value) {
  const item = getSelectedItem();
  if (!item) return;
  item[field] = value;
  item.hasScript = true;
  if (item.productionStatus === "Em branco") item.productionStatus = "Rascunho";
}

function hasMinimumProductInfo(item) {
  if (!item.dependsOnProduct) return true;
  const text = String(item.productInfo || "").toLowerCase();
  const minimumSignals = ["bairro", "valor", "foto", "caracter", "codigo", "condicao", "nome"];
  return minimumSignals.filter((signal) => text.includes(signal)).length >= 3;
}

function isKiaEligible(item) {
  const finalReadyStatuses = ["Aguardando aprovacao", "Concluido"];
  return item
    && finalReadyStatuses.includes(item.productionStatus)
    && item.productionStatus !== "Aguardando informacao do produto"
    && hasMinimumProductInfo(item);
}

function generateCards() {
  const planner = createPlanner();
  planner.items.forEach((item) => {
    enrichItemDraft(item);
    if (item.productionStatus === "Em branco") item.productionStatus = "Rascunho";
  });
  pushMessage("assistant", "Cards do mes refinados com briefing, legenda inicial, CTA, funil e campos de roteiro. Itens que dependem de produto continuam bloqueados para .kia ate receberem dados minimos.");
}

function generateDraftCaptions() {
  const planner = getPlanner();
  if (!planner) return;
  planner.items
    .filter((item) => item.productionStatus === "Rascunho" || !item.caption)
    .forEach((item) => {
      item.caption = `O tema de hoje e ${item.theme}. Para ${state.client.audience}, a decisao fica mais facil quando existe clareza, prova e orientacao. ${item.cta}.`;
    });
  pushMessage("assistant", "Legendas iniciais geradas para os posts em rascunho.");
}

function regenerateItem(itemId) {
  const item = getPlanner()?.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.objective = item.objective === "Geracao de leads" ? "Autoridade" : "Geracao de leads";
  item.cta = item.objective === "Geracao de leads" ? "Entrar em contato pelo WhatsApp" : "Salvar o post";
  item.briefing = `Nova versao focada em ${item.objective}, com recorte para ${state.client.niche || state.client.segment}.`;
  item.caption = `Vamos direto ao ponto: ${item.theme}. ${item.cta}.`;
  item.productionStatus = item.productionStatus === "Em branco" ? "Rascunho" : item.productionStatus;
  pushMessage("assistant", `Regerei o card "${item.theme}" com foco em ${item.objective}.`);
}

async function openKit() {
  if (!window.kitAPI?.openBrandKit) {
    pushMessage("assistant", "A abertura de .kit nao esta disponivel nesta janela.");
    return;
  }
  const result = await window.kitAPI.openBrandKit();
  if (!result?.brandKit) return;
  const kit = result.brandKit;
  const structuredKit = kit.metadata?.clientKit || null;
  const plannerData = kit.metadata?.studioPlanner || {};
  state.clientKitPath = result.filePath || "";
  state.client = normalizeClient({
    ...state.client,
    ...(structuredKit ? clientKitToClient(structuredKit) : plannerData),
    name: structuredKit?.client?.name || plannerData.name || kit.metadata?.clientName || kit.name || state.client.name,
    tone: structuredKit?.strategy?.toneOfVoice?.join(", ") || plannerData.tone || kit.identity?.voice || state.client.tone,
    strategicNotes: structuredKit?.strategy?.strategicNotes || plannerData.strategicNotes || kit.identity?.description || state.client.strategicNotes,
    brand: {
      colors: kit.colors || [],
      fonts: kit.fonts || [],
      logos: kit.logos || []
    }
  });
  state.clientDirty = false;
  pushMessage("assistant", `Carreguei o .kit de ${state.client.name}. Vou usar esses dados para diferenciar nicho, tom, campanhas e restricoes.`);
  render();
}

function clientKitToClient(clientKit = {}) {
  return {
    ...(clientKit.client || {}),
    name: clientKit.client?.name || "",
    logo: clientKit.client?.logo || "",
    segment: clientKit.client?.segment || "",
    niche: clientKit.client?.niche || "",
    subniche: clientKit.client?.subniche || "",
    plan: clientKit.client?.plan || DEFAULT_CLIENT.plan,
    attendanceMode: clientKit.client?.attendanceMode || "",
    meetingFrequency: clientKit.client?.meetingFrequency || "",
    channels: clientKit.digitalPresence?.channels || [],
    links: clientKit.digitalPresence?.links || {},
    audience: clientKit.strategy?.targetAudience || "",
    recurringCommercialGoals: clientKit.strategy?.recurringCommercialGoals || [],
    currentPriority: clientKit.strategy?.currentPriority || "",
    toneOfVoice: clientKit.strategy?.toneOfVoice || [],
    languageRestrictions: clientKit.strategy?.restrictions || "",
    forbiddenClaims: clientKit.strategy?.forbiddenClaims || [],
    brandRules: clientKit.strategy?.brandRules || "",
    strategicNotes: clientKit.strategy?.strategicNotes || "",
    mainProducts: clientKit.products?.mainProducts || "",
    externalInfoDependentProducts: clientKit.products?.externalInfoDependentProducts || [],
    requiredOfferFields: clientKit.products?.requiredOfferFields || [],
    marketing: {
      objectives: clientKit.marketing?.objectives || [],
      funnelStages: clientKit.marketing?.funnelStages || [],
      preferredCtas: clientKit.marketing?.preferredCtas || [],
      formats: clientKit.marketing?.formats || [],
      platforms: clientKit.marketing?.platforms || []
    },
    campaigns: clientKit.campaigns || [],
    history: clientKit.history || [],
    internalOptions: clientKit.internalOptions || {}
  };
}

function buildStructuredClientKit() {
  const client = normalizeClient(state.client);
  const planRule = PLAN_RULES[client.plan] || PLAN_RULES[DEFAULT_CLIENT.plan];
  return {
    client: {
      name: client.name,
      logo: client.logo,
      segment: client.segment === "Outro" && client.customSegment ? client.customSegment : client.segment,
      niche: client.niche,
      subniche: client.subniche,
      plan: client.plan,
      attendanceMode: client.attendanceMode,
      meetingFrequency: client.meetingFrequency,
      planRules: planRule.rules,
      planSummary: planRule.summary
    },
    digitalPresence: {
      channels: client.channels,
      links: client.links
    },
    strategy: {
      targetAudience: client.audience,
      recurringCommercialGoals: client.recurringCommercialGoals,
      currentPriority: client.currentPriority,
      toneOfVoice: client.toneOfVoice,
      restrictions: client.languageRestrictions,
      forbiddenClaims: client.forbiddenClaims,
      brandRules: client.brandRules,
      strategicNotes: client.strategicNotes
    },
    products: {
      mainProducts: client.mainProducts,
      externalInfoDependentProducts: client.externalInfoDependentProducts,
      requiredOfferFields: client.requiredOfferFields
    },
    marketing: {
      objectives: client.marketing.objectives,
      funnelStages: client.marketing.funnelStages,
      preferredCtas: client.marketing.preferredCtas,
      formats: client.marketing.formats,
      platforms: client.marketing.platforms
    },
    campaigns: client.campaigns.map(({ id, ...campaign }) => campaign),
    history: client.history.map(({ id, ...item }) => item),
    internalOptions: client.internalOptions,
    meta: {
      createdAt: client.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: "kit.studio.client.v1"
    }
  };
}

async function saveKit() {
  const validation = validateClientKit();
  if (!validation.valid) {
    pushMessage("assistant", `Antes de salvar o .kit, complete: ${validation.errors.join(", ")}.`);
    render();
    return;
  }
  const clientKit = buildStructuredClientKit();
  state.client = normalizeClient({
    ...state.client,
    updatedAt: clientKit.meta.updatedAt,
    createdAt: clientKit.meta.createdAt
  });
  const brandKit = {
    schema: "kit.brand.v1",
    type: "brand-kit",
    version: 1,
    name: state.client.name || "Cliente Studio",
    identity: {
      voice: state.client.tone || "",
      description: state.client.strategicNotes || ""
    },
    colors: state.client.brand?.colors || [],
    logos: state.client.logo
      ? mergeAssetPath(state.client.brand?.logos || [], state.client.logo, "logo")
      : (state.client.brand?.logos || []),
    fonts: state.client.brand?.fonts || [],
    xtts: { language: "pt", voiceModelPath: "", speakerWavPath: "", notes: "" },
    assets: { global: [], frames: [], watermarks: [], recurring: [] },
    metadata: {
      clientName: state.client.name,
      segment: state.client.segment,
      niche: state.client.niche,
      clientKit,
      studioPlanner: clone(state.client)
    }
  };

  if (!window.kitAPI?.saveBrandKit) {
    pushMessage("assistant", "Salvar .kit nao esta disponivel nesta janela. Mantive os dados no estado local do Studio.");
    return;
  }
  const saved = await window.kitAPI.saveBrandKit({ filePath: state.clientKitPath, brandKit });
  if (saved?.filePath) {
    state.clientKitPath = saved.filePath;
    state.clientDirty = false;
    pushMessage("assistant", `.kit salvo: ${saved.filePath}`);
  }
  render();
}

function mergeAssetPath(list, filePath, name) {
  const exists = list.some((item) => item.path === filePath);
  return exists ? list : [{ name, path: filePath, type: filePath.split(".").pop() || "" }, ...list];
}

async function selectLogo() {
  if (!window.kitAPI?.selectBrandKitFiles) return;
  const files = await window.kitAPI.selectBrandKitFiles({ kind: "logo" });
  if (files?.[0]?.path) {
    state.client.logo = files[0].path;
    state.client.brand.logos = mergeAssetPath(state.client.brand.logos || [], files[0].path, files[0].name || "logo");
    render();
  }
}

async function saveAll() {
  persist();
  await saveKit();
}

async function generateOneKia(itemId) {
  const item = getPlanner()?.items.find((entry) => entry.id === itemId);
  if (!item || !isKiaEligible(item)) {
    pushMessage("assistant", "Este item ainda nao esta elegivel para .kia. Marque como Aguardando aprovacao ou Concluido e, se for produto, preencha dados minimos como nome, bairro, valor, fotos, caracteristicas ou codigo.");
    render();
    return;
  }

  if (!window.kitAPI?.saveCanvasProject) {
    pushMessage("assistant", "Automacao .kia indisponivel nesta janela.");
    return;
  }

  const project = buildKiaProject(item);
  const saved = await window.kitAPI.saveCanvasProject({ project });
  if (saved?.filePath) {
    item.kiaPath = saved.filePath;
    item.productionStatus = "Em producao";
    pushMessage("assistant", `.kia criado para "${item.theme}" e status atualizado para Em producao.`);
  }
  render();
}

async function generateEligibleKias() {
  const eligible = (getPlanner()?.items || []).filter((item) => isKiaEligible(item) && !item.kiaPath);
  if (!eligible.length) {
    pushMessage("assistant", "Nenhum item elegivel para gerar .kia agora. Itens aguardando informacao de produto foram ignorados.");
    return;
  }
  pushMessage("assistant", `Vou gerar .kia como etapa final somente para ${eligible.length} item(ns) elegiveis. Itens com informacao de produto pendente ficam de fora.`);
  for (const item of eligible) {
    await generateOneKia(item.id);
  }
}

function buildKiaProject(item) {
  const colors = state.client.brand?.colors?.length ? state.client.brand.colors : [
    { name: "Principal", hex: "#1E293B" },
    { name: "Destaque", hex: "#2563EB" },
    { name: "Claro", hex: "#F8FAFC" }
  ];
  const isVideo = /(reel|video|story)/i.test(`${item.type} ${item.format}`);
  return {
    schema: "kit.project.v1",
    type: "canvas-project",
    version: 1,
    name: `${state.client.name} - ${item.theme}`,
    brandKitOverrides: {
      colors,
      logos: state.client.brand?.logos || [],
      fonts: state.client.brand?.fonts || [],
      assets: { global: [] }
    },
    artboard: {
      width: item.platform.includes("Stories") || item.platform.includes("Reels") || isVideo ? 1080 : 1080,
      height: item.platform.includes("Stories") || item.platform.includes("Reels") || isVideo ? 1920 : 1080,
      preset: isVideo ? "vertical-video" : "instagram-post"
    },
    fabric: {
      version: "",
      objects: [
        {
          type: "textbox",
          text: item.theme,
          left: 96,
          top: 120,
          width: 880,
          fill: colors[0]?.hex || "#1E293B",
          fontSize: 58,
          fontWeight: "700"
        },
        {
          type: "textbox",
          text: item.cta,
          left: 96,
          top: isVideo ? 1620 : 850,
          width: 820,
          fill: colors[1]?.hex || "#2563EB",
          fontSize: 38,
          fontWeight: "700"
        }
      ]
    },
    metadata: {
      app: "KIT IA",
      module: "Studio Planner",
      client: state.client,
      studioItem: item,
      caption: item.caption,
      briefing: item.briefing,
      template: item.template
    },
    ai: {
      prompts: [
        { type: "positive", text: item.positivePrompt },
        { type: "negative", text: item.negativePrompt }
      ],
      generations: [],
      inpaints: [],
      outpaints: [],
      masks: []
    },
    timeline: {
      slides: splitLines(item.scenes).map((scene, index) => ({ id: `slide_${index + 1}`, title: scene, duration: 4 })),
      activeSlideId: "slide_1",
      audio: item.narration ? [{ id: "narration_1", text: item.narration, status: "draft" }] : [],
      video: isVideo ? [{ id: "video_plan_1", script: item.videoScript, status: "draft" }] : []
    },
    history: [{ action: "created-from-studio-planner", at: new Date().toISOString() }]
  };
}

function pushMessage(role, text) {
  state.messages.push({ role, text, at: new Date().toISOString() });
  state.messages = state.messages.slice(-40);
}

function renderChat() {
  els.chatMessageList.innerHTML = state.messages.map((message) => `
    <article class="chat-message is-${escapeHtml(message.role)}">
      <strong>${message.role === "user" ? "Voce" : "KIT"}</strong>
      <p>${escapeHtml(message.text)}</p>
    </article>
  `).join("");
  els.chatMessageList.scrollTop = els.chatMessageList.scrollHeight;
}

async function handleChatCommand(text) {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  await withAiStatus("Aguardando resposta da IA...", async () => {
    if (/planejamento|planner|calendario/.test(normalized)) {
      createPlanner({ force: /refaca|regenere|novo/.test(normalized) });
    } else if (/carrossel/.test(normalized) && getSelectedItem()) {
      const item = getSelectedItem();
      item.type = "Carrossel";
      item.format = "Carrossel";
      item.scenes = "Slide 1: gancho\nSlide 2: contexto\nSlide 3: prova\nSlide 4: CTA";
      pushMessage("assistant", "Transformei o item selecionado em carrossel com estrutura de slides.");
    } else if (/reel|roteiro/.test(normalized) && getSelectedItem()) {
      const item = getSelectedItem();
      item.type = "Reel";
      item.format = "Reel";
      item.videoScript = "0-3s: gancho forte. 4-12s: dor e contexto. 13-24s: solucao e prova. 25-30s: CTA.";
      item.narration = `Se ${state.client.audience}, este ponto sobre ${item.theme} pode evitar uma decisao errada.`;
      pushMessage("assistant", "Criei um roteiro de Reel para o item selecionado.");
    } else if (/legenda/.test(normalized)) {
      generateDraftCaptions();
    } else if (/cta/.test(normalized)) {
      (getPlanner()?.items || []).forEach((item) => {
        item.cta = item.funnel === "Fundo" ? "Entrar em contato pelo WhatsApp" : "Chamar no direct";
      });
      pushMessage("assistant", "Fortaleci os CTAs conforme o funil de cada item.");
    } else if (/kia|canvas/.test(normalized)) {
      await generateEligibleKias();
    } else {
      pushMessage("assistant", "Analisei o contexto atual. Posso ajustar foco de leads, transformar formatos, criar anuncios, gerar legendas ou preparar .kia quando os itens forem aprovados.");
    }
  }, { successText: "Resposta aplicada." });
  render();
}

function addItem() {
  const planner = getPlanner();
  if (!planner) return;
  const [year, month] = state.selectedMonth.split("-").map(Number);
  const day = Math.min(28, new Date(year, month, 0).getDate());
  const item = createPlannerItem({
    date: `${state.selectedMonth}-${String(day).padStart(2, "0")}`,
    theme: "Novo item editorial",
    productionStatus: "Em branco"
  });
  planner.items.push(item);
  state.selectedItemId = item.id;
  pushMessage("assistant", "Novo item editorial adicionado ao mes.");
}

function exportPlannerPdf() {
  state.activeTab = "planner";
  render();
  requestAnimationFrame(() => window.print());
}

function bindEvents() {
  els.studioTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    state.activeTab = button.dataset.tab;
    render();
  });

  els.topClientName.addEventListener("change", () => {
    state.client.name = els.topClientName.value.trim() || "Cliente sem nome";
    markClientDirty();
    render();
  });

  els.topMonth.addEventListener("change", () => {
    state.selectedMonth = els.topMonth.value || currentMonthValue();
    render();
  });

  els.tabPanel.addEventListener("input", (event) => {
    const target = event.target;
    if (target.matches("[data-client-field]")) updateClientField(target.dataset.clientField, target.value);
    if (target.matches("[data-campaign-field]")) updateCampaign(target.closest("[data-campaign-id]")?.dataset.campaignId, target.dataset.campaignField, target.value);
    if (target.matches("[data-history-field]")) updateHistory(target.closest("[data-history-id]")?.dataset.historyId, target.dataset.historyField, target.value);
    if (target.matches("[data-planner-field]")) updatePlannerField(target.dataset.plannerField, target.value);
    if (target.matches("[data-ad-field]")) updateAd(target.closest("[data-ad-id]")?.dataset.adId, target.dataset.adField, target.value);
    if (target.matches("[data-item-field]")) updateItem(target.closest("[data-item-id]")?.dataset.itemId, target.dataset.itemField, target.value);
    if (target.matches("[data-route-field]")) updateSelectedRoute(target.dataset.routeField, target.value);
    persist();
  });

  els.tabPanel.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-client-field]")) {
      updateClientField(target.dataset.clientField, target.value);
      render();
    }
    if (target.matches("[data-campaign-field]")) {
      updateCampaign(target.closest("[data-campaign-id]")?.dataset.campaignId, target.dataset.campaignField, target.value);
      render();
    }
    if (target.matches("[data-history-field]")) {
      updateHistory(target.closest("[data-history-id]")?.dataset.historyId, target.dataset.historyField, target.value);
      render();
    }
    if (target.matches("[data-item-field]")) {
      updateItem(target.closest("[data-item-id]")?.dataset.itemId, target.dataset.itemField, target.value);
      render();
    }
    if (target.matches("[data-route-field]")) {
      updateSelectedRoute(target.dataset.routeField, target.value);
      render();
    }
  });

  els.tabPanel.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    const calendarItem = event.target.closest("[data-item-id]");
    if (calendarItem && !actionEl && calendarItem.dataset.itemId) {
      state.selectedItemId = calendarItem.dataset.itemId;
      state.activeTab = "script";
      render();
      return;
    }
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const itemId = actionEl.dataset.itemId;
    if (action === "add-chip") addClientChip(actionEl.dataset.chipField);
    if (action === "add-campaign") addCampaign();
    if (action === "archive-campaign") archiveCampaign(actionEl.dataset.campaignId);
    if (action === "add-history") addHistory();
    if (action === "restore-options") restoreInternalOptions(actionEl.dataset.optionsKey);
    if (action === "duplicate-client") duplicateClient();
    if (action === "create-planner") {
      await withAiStatus("Gerando planejamento...", async () => createPlanner(), { successText: "Planejamento gerado." });
    }
    if (action === "regenerate-planner") {
      await withAiStatus("Gerando planejamento...", async () => createPlanner({ force: true }), { successText: "Planejamento atualizado." });
    }
    if (action === "planner-to-cards") {
      await withAiStatus("Processando conteudo...", async () => generateCards(), { successText: "Cards atualizados." });
    }
    if (action === "open-kit") await withAiStatus("Abrindo .kit...", openKit, { successText: ".kit carregado." });
    if (action === "save-kit") await withAiStatus("Salvando .kit...", saveKit, { successText: ".kit salvo." });
    if (action === "select-logo") await selectLogo();
    if (action === "add-item") addItem();
    if (action === "generate-draft-captions") {
      await withAiStatus("Gerando legendas...", async () => generateDraftCaptions(), { successText: "Legendas geradas." });
    }
    if (action === "select-item") {
      state.selectedItemId = itemId;
      state.activeTab = "script";
    }
    if (action === "regenerate-item") {
      await withAiStatus("Processando conteudo...", async () => regenerateItem(itemId), { successText: "Card regenerado." });
    }
    if (action === "generate-one-kia") await withAiStatus("Finalizando .kia...", async () => generateOneKia(itemId), { successText: ".kia finalizado." });
    if (action === "transform-carousel") await handleChatCommand("Transforme esse post em carrossel");
    if (action === "create-reel-script") await handleChatCommand("Crie roteiro para esse reel");
    if (action === "route-ai") {
      await withAiStatus("Processando conteudo...", async () => {
        const item = getSelectedItem();
        if (item) {
          item.productionNotes = `${item.productionNotes}\n${actionEl.dataset.aiAction}: aplicado ao bloco ${actionEl.dataset.label}.`.trim();
          pushMessage("assistant", `${actionEl.dataset.aiAction} aplicado no bloco ${actionEl.dataset.label} do item selecionado.`);
        }
      }, { successText: "Bloco atualizado." });
    }
    render();
  });

  els.tabPanel.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-chip-field][data-chip-value]");
    if (!chip || event.target.closest("[data-action]")) return;
    toggleClientChip(chip.dataset.chipField, chip.dataset.chipValue);
    render();
  });

  els.newPlannerButton.addEventListener("click", async () => {
    await withAiStatus("Gerando planejamento...", async () => createPlanner(), { successText: "Planejamento pronto." });
    state.activeTab = "planner";
    render();
  });
  els.saveButton.addEventListener("click", () => void withAiStatus("Salvando...", saveAll, { successText: "Salvo." }));
  els.exportPdfButton.addEventListener("click", exportPlannerPdf);
  els.generateCardsButton.addEventListener("click", async () => {
    await withAiStatus("Processando conteudo...", async () => generateCards(), { successText: "Cards prontos." });
    state.activeTab = "cards";
    render();
  });
  els.generateKiaButton.addEventListener("click", () => void withAiStatus("Finalizando...", generateEligibleKias, { successText: "Arquivos .kia processados." }));
  els.chatPlannerButton.addEventListener("click", async () => {
    await withAiStatus("Gerando planejamento...", async () => createPlanner(), { successText: "Planejamento pronto." });
    state.activeTab = "planner";
    render();
  });
  els.chatCaptionButton.addEventListener("click", async () => {
    await withAiStatus("Gerando legendas...", async () => generateDraftCaptions(), { successText: "Legendas prontas." });
    render();
  });
  els.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = els.chatInput.value.trim();
    if (!text) return;
    els.chatInput.value = "";
    pushMessage("user", text);
    void handleChatCommand(text);
  });
}

function applyIncomingStudioState(payload = {}) {
  const incomingProject = payload?.project || payload;
  if (!incomingProject || typeof incomingProject !== "object") return;

  const briefing = incomingProject.briefing || {};
  state.client = {
    ...state.client,
    name: incomingProject.clientName || state.client.name,
    segment: incomingProject.productName || state.client.segment,
    tone: briefing.defaultsFromClientKit?.identity?.voice || state.client.tone,
    audience: briefing.audience || state.client.audience,
    products: briefing.theme || state.client.products,
    strategicNotes: [
      state.client.strategicNotes,
      incomingProject.inputCommand ? `Comando de origem: ${incomingProject.inputCommand}` : "",
      briefing.purpose ? `Objetivo importado: ${briefing.purpose}` : ""
    ].filter(Boolean).join("\n")
  };

  if (incomingProject.clientKit?.filePath) {
    state.clientKitPath = incomingProject.clientKit.filePath;
  }

  pushMessage("assistant", "Importei o contexto que abriu o Studio e adaptei para o Planner. A partir daqui o chat lateral atua como estrategista de marketing e producao editorial.");
}

async function bootstrap() {
  bindEvents();

  if (window.kitAPI?.onProcessStatus) {
    window.kitAPI.onProcessStatus((payload = {}) => {
      const source = String(payload.source || payload.module || "").toLowerCase();
      if (source && !source.includes("studio") && !source.includes("ai")) return;
      const status = String(payload.status || payload.state || "").toLowerCase();
      const message = payload.message || payload.label || "";
      if (["running", "processing", "busy", "started"].includes(status)) {
        setAiStatus("running", message || "Processando conteudo...", payload.percent);
      } else if (["success", "done", "completed", "idle"].includes(status)) {
        setAiStatus(status === "idle" ? "idle" : "success", message || "Finalizado.", payload.percent ?? 100);
      } else if (["error", "failed"].includes(status)) {
        setAiStatus("error", message || "Falha no processamento.", 100);
      }
    });
  }

  if (window.kitAPI?.onStudioInitState) {
    window.kitAPI.onStudioInitState((payload) => {
      applyIncomingStudioState(payload);
      render();
    });
  }

  if (window.kitAPI?.getStudioInitialState) {
    try {
      const initialState = await window.kitAPI.getStudioInitialState();
      if (initialState) applyIncomingStudioState(initialState);
    } catch {}
  }

  render();
}

void bootstrap();
