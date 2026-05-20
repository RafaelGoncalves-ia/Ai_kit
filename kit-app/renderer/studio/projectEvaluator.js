(function () {
  function evaluateProject(planner = {}) {
    const items = Array.isArray(planner.items) ? planner.items : [];
    const issues = [];
    if (!planner) issues.push("ainda nao existe projeto mensal");
    if (planner && !String(planner.macroObjective || "").trim()) issues.push("objetivo macro nao esta claro");
    const funnelCounts = items.reduce((acc, item) => {
      acc[item.funnel || "Sem funil"] = (acc[item.funnel || "Sem funil"] || 0) + 1;
      return acc;
    }, {});
    if (items.length && (funnelCounts.Fundo || 0) > items.length * 0.45) issues.push("ha peso alto demais em fundo de funil");
    if (items.length && !(funnelCounts.Topo || 0)) issues.push("falta conteudo de topo para autoridade e descoberta");
    if (items.length < 6) issues.push("o mes parece curto para manter cadencia");
    const summary = issues.length
      ? `O projeto mensal precisa de ajuste: ${issues.slice(0, 3).join(", ")}.`
      : "O projeto mensal esta equilibrado para seguir para calendario e producao.";
    return {
      scope: "project",
      score: Math.max(20, 100 - issues.length * 18),
      issues,
      summary,
      nextStep: issues[0] || "revisar calendario",
      options: issues.length ? ["ajustar projeto", "revisar calendario", "abrir planner"] : ["revisar calendario", "aprovar calendario", "abrir planner"]
    };
  }
  window.ProjectEvaluator = { evaluateProject };
})();
