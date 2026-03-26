import updateNeeds from "./needs.engine.js";

/**
 * Registro da Skill no sistema
 */

export default function registerNeedsSkill(scheduler) {
  scheduler.register({
    name: "needs",
    priority: 3, // roda primeiro
    execute: updateNeeds,
  });
}

