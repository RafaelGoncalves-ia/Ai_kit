// skills/routine/index.js
import updateRoutine from "./routine.update.js";

/**
 * Registra a Skill Routine no scheduler
 */
export default function registerRoutineSkill(scheduler) {
  scheduler.register({
    name: "routine",
    priority: 2, // prioridade menor que Needs
    execute: updateRoutine
  });
}