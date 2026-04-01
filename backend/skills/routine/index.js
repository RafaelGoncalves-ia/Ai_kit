import { updateRoutine } from "./routine.engine.js";

/**
 * Skill Routine
 */
export default function registerRoutineSkill(scheduler) {
  scheduler.register({
    name: "routine",
    priority: 2,
    execute: updateRoutine,
  });
}