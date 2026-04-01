import updateNeeds from "./updateNeeds.js";

export default function registerNeedsSkill(scheduler) {
  scheduler.register({
    name: "needs",
    priority: 3,
    execute: () => updateNeeds() // ⚠️ garante que roda a cada tick
  });
}