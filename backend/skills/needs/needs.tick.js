import updateNeeds from "./needs.engine.js";
import kitState from "../../core/stateManager.js";

/**
 * Cria job que decai os Needs automaticamente via scheduler
 */
export function registerNeedsTick(scheduler) {
  scheduler.register({
    name: "needsTick",
    priority: 10, // alta prioridade
    execute: async (context) => {
      const now = Date.now();
      const lastTick = kitState.system.lastTick || now;
      const deltaTime = (now - lastTick) / 1000;

      // aplica decaimento
      updateNeeds(context);

      // atualiza timestamp
      kitState.system.lastTick = now;
    },
  });
}