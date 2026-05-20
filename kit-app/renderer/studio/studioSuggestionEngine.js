(function () {
  function formatOptions(options = []) {
    return options.slice(0, 3).map((option, index) => `${index + 1}. ${option}`).join("\n");
  }

  function makeSuggestion(evaluation = {}, context = {}) {
    const prefix = context.currentClient ? `Contexto atual: ${context.currentClient} / ${context.monthLabel}.\n` : "";
    return `${prefix}${evaluation.summary || ""}`.trim();
  }

  window.StudioSuggestionEngine = { makeSuggestion };
})();
