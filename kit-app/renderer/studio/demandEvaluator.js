(function () {
  function evaluateDemand(card = {}) {
    const issues = [];
    const today = new Date().toISOString().slice(0, 10);
    if (!card) issues.push("nenhuma demanda selecionada");
    if (card && !card.caption) issues.push("legenda ainda nao existe");
    if (card && /video|reel|roteiro/.test(card.type || "") && !card.script) issues.push("roteiro esta vazio");
    if (card && !card.visualPrompt) issues.push("prompt ou direcao visual esta vazio");
    if (card && !card.dueDate) issues.push("prazo nao definido");
    if (card && card.dueDate && card.dueDate < today && card.status !== "concluido") issues.push("prazo vencido");
    if (card && !card.responsible) issues.push("responsavel nao definido");
    return {
      scope: "demand",
      score: Math.max(20, 100 - issues.length * 17),
      issues,
      summary: issues.length ? `Essa demanda ainda precisa de cuidado: ${issues.slice(0, 3).join(", ")}.` : "Essa demanda esta bem preparada para execucao.",
      nextStep: issues[0] || "mover para proxima etapa",
      options: issues.length ? ["completar demanda", "definir responsavel", "voltar ao kanban"] : ["mover etapa", "marcar concluida", "voltar ao kanban"]
    };
  }
  window.DemandEvaluator = { evaluateDemand };
})();
