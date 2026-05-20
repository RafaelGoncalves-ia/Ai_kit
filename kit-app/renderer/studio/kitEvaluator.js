(function () {
  function list(value) {
    return Array.isArray(value) ? value.filter(Boolean) : String(value || "").split(/\s*,\s*|\n/).filter(Boolean);
  }

  function hasText(value, min = 3) {
    return String(value || "").trim().length >= min;
  }

  function weak(value = "") {
    const text = String(value || "").trim();
    return !text || text.length < 18 || /todos|geral|qualquer|variado|diversos/i.test(text);
  }

  function normalizeId(value = "") {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function isInternalAccount(client = {}) {
    const type = String(client.accountType || client.type || "").toLowerCase();
    const name = normalizeId(client.name || "");
    return type === "internal" || type === "agency" || name.includes("adsune");
  }

  function evaluateKit(client = {}) {
    const issues = [];
    const strengths = [];
    const scoreParts = [];
    const internal = isInternalAccount(client);
    const check = (ok, issue, strength) => {
      scoreParts.push(ok ? 1 : 0);
      if (ok) strengths.push(strength);
      else issues.push(issue);
    };

    check(hasText(client.name), internal ? "nome da conta interna ainda precisa ficar claro" : "nome do cliente ainda precisa ficar claro", "nome definido");
    if (internal) {
      check(hasText(client.businessModel) || hasText(client.positioning), "modelo da operacao interna precisa ficar mais claro", "operacao interna definida");
    } else {
      check(hasText(client.segment), "segmento nao esta bem definido", "segmento definido");
      check(hasText(client.niche), "nicho ainda esta fraco ou ausente", "nicho definido");
      check(hasText(client.subniche), "subnicho pode ser melhor especificado", "subnicho definido");
    }
    check(list(client.toneOfVoice).length || hasText(client.tone), "tom de comunicacao ainda nao orienta a producao", "tom de comunicacao definido");
    check(!weak(client.audience), "publico-alvo precisa de mais recorte", "publico-alvo aproveitavel");
    check(list(client.recurringCommercialGoals).length || hasText(client.commercialGoals), "objetivos comerciais precisam ficar mais objetivos", "objetivos comerciais definidos");
    check(hasText(client.mainProducts) || hasText(client.products), "produtos ou servicos principais estao vagos", "oferta principal definida");
    check(hasText(client.differentials, 12), "diferenciais principais ainda estao fracos", "diferenciais registrados");
    check(list(client.channels).length >= 1, "plataformas e canais precisam ser definidos", "canais definidos");
    check(list(client.marketing?.funnelStages).length >= 2, "funil de marketing precisa ser melhor definido", "funil configurado");
    check(list(client.brand?.colors).length || hasText(client.logo), "identidade visual precisa de cores, logo ou referencias", "identidade visual registrada");
    check(hasText(client.positioning, 16) || hasText(client.brandRules, 16), "posicionamento da marca precisa ficar mais claro", "posicionamento utilizavel");

    const score = Math.round((scoreParts.reduce((sum, value) => sum + value, 0) / Math.max(1, scoreParts.length)) * 100);
    const topIssues = issues.slice(0, 3);
    const summary = topIssues.length
      ? `Analisei ${internal ? "a conta interna" : "o cadastro"} de ${client.name || "cliente"}. A base ja existe, mas ${topIssues.join(", ")}. Isso impacta diretamente a qualidade de campanhas, conteudos e operacao.`
      : `Analisei ${internal ? "a conta interna" : "o cadastro"} de ${client.name || "cliente"}. O .kit esta consistente para orientar planejamento, conteudo e operacao.`;

    return {
      scope: "kit",
      score,
      issues,
      strengths,
      summary,
      nextStep: topIssues[0] || "montar planejamento mensal",
      options: topIssues.length
        ? ["completar informacoes fracas", "criar planejamento mensal", "abrir planner"]
        : ["criar planejamento mensal", "revisar calendario", "abrir planner"]
    };
  }

  window.KitEvaluator = { evaluateKit };
})();
