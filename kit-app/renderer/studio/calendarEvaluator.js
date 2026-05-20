(function () {
  function evaluateCalendar(planner = {}, client = {}) {
    const items = Array.isArray(planner?.items) ? planner.items : [];
    const issues = [];
    const titles = items.map((item) => String(item.theme || item.title || "").toLowerCase());
    const repeated = titles.filter((title, index) => title && titles.indexOf(title) !== index);
    const funnel = items.reduce((acc, item) => {
      acc[item.funnel || "Sem funil"] = (acc[item.funnel || "Sem funil"] || 0) + 1;
      return acc;
    }, {});
    if (!items.length) issues.push("calendario ainda nao foi criado");
    if (repeated.length) issues.push("ha temas repetidos");
    if ((funnel.Fundo || 0) > items.length * 0.45) issues.push("existe excesso de conteudo comercial");
    if (!(funnel.Topo || 0)) issues.push("falta topo de funil para educar e gerar autoridade");
    if (items.some((item) => !item.visualDirection)) issues.push("alguns itens estao sem ideia visual");
    if (items.some((item) => !item.cta)) issues.push("alguns itens estao sem CTA");
    const approved = items.filter((item) => item.approvalStatus === "aprovado").length;
    const summary = issues.length
      ? `Revisei o calendario de ${client.name || "cliente"}. Antes de aprovar, eu ajustaria: ${issues.slice(0, 3).join(", ")}.`
      : `O calendario esta coerente com ${client.segment || "o segmento"} e ja pode ser aprovado. ${approved} item(ns) estao aprovados.`;
    return {
      scope: "calendar",
      score: Math.max(25, 100 - issues.length * 16),
      issues,
      summary,
      nextStep: issues[0] || (approved ? "transformar aprovados em demandas" : "aprovar calendario"),
      options: issues.length ? ["ajustar calendario", "aprovar mesmo assim", "abrir planner"] : ["aprovar calendario", "transformar aprovados em demandas", "abrir planner"]
    };
  }
  window.CalendarEvaluator = { evaluateCalendar };
})();
