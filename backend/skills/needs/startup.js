import registerNeedsSkill from "./index.js";
import registerRoutineSkill from "../routine/index.js";
import webUpdateSkill from "../web-update/index.js";

export function initSkills(scheduler, context) {
  // Registra Skills
  registerNeedsSkill(scheduler);       // Needs com tick próprio
  registerRoutineSkill(scheduler);    // Routine

  // Inicia skills do scheduler
  if (webUpdateSkill && webUpdateSkill.init) {
    webUpdateSkill.init(context);
  }

  // Inicia o scheduler (tick: 1s)
  scheduler.start(1000); 
}