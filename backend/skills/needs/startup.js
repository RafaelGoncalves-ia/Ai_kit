import registerNeedsSkill from "./index.js";
import registerRoutineSkill from "../routine/index.js";

export function initSkills(scheduler) {
  // Registra Skills
  registerNeedsSkill(scheduler);       // Needs com tick próprio
  registerRoutineSkill(scheduler);    // Routine

  // Inicia o scheduler (tick: 1s)
  scheduler.start(1000); 
}