(function () {
  function evaluate(scope, context = {}) {
    if (scope === "client") return window.KitEvaluator.evaluateKit(context.client);
    if (scope === "project") return window.ProjectEvaluator.evaluateProject(context.planner);
    if (scope === "calendar") return window.CalendarEvaluator.evaluateCalendar(context.planner, context.client);
    if (scope === "kanban") return window.PlannerEvaluator.evaluatePlanner(context.kanban);
    if (scope === "demand") return window.DemandEvaluator.evaluateDemand(context.demand);
    if (!context.client?.name) {
      return {
        scope: "initial",
        summary: "",
        options: []
      };
    }
    if (context.client) return window.KitEvaluator.evaluateKit(context.client);
    return { summary: "", options: [] };
  }

  window.StudioFlowController = { evaluate };
})();
