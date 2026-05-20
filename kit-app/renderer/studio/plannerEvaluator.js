(function () {
  function evaluatePlanner(kanban = {}) {
    const cards = Array.isArray(kanban.cards) ? kanban.cards : [];
    const today = new Date().toISOString().slice(0, 10);
    const issues = [];
    const overdue = cards.filter((card) => card.dueDate && card.dueDate < today && card.status !== "concluido");
    const noDue = cards.filter((card) => !card.dueDate);
    const noResponsible = cards.filter((card) => !card.responsible);
    const execution = cards.filter((card) => /execucao|produção|producao/i.test(card.stageId || ""));
    if (overdue.length) issues.push(`${overdue.length} demanda(s) atrasada(s)`);
    if (noDue.length) issues.push(`${noDue.length} card(s) sem prazo`);
    if (noResponsible.length) issues.push(`${noResponsible.length} card(s) sem responsavel`);
    if (execution.length > 6) issues.push("execucao esta acumulando muitas demandas");
    if (!cards.length) issues.push("planner ainda nao tem demandas operacionais");
    return {
      scope: "planner",
      score: Math.max(20, 100 - issues.length * 18),
      issues,
      overdue,
      summary: issues.length ? `Olhei o planner. O principal risco agora e: ${issues.slice(0, 3).join(", ")}.` : "O planner esta organizado, sem gargalos evidentes.",
      nextStep: overdue.length ? "revisar atrasados" : issues[0] || "acompanhar execucao",
      options: overdue.length ? ["revisar atrasados", "distribuir responsaveis", "abrir demanda"] : ["abrir demanda", "revisar proximos prazos", "voltar ao calendario"]
    };
  }
  window.PlannerEvaluator = { evaluatePlanner };
})();
