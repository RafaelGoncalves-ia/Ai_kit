import registerNeedsSkill from "./index.js";
import registerRoutineSkill from "../routine/index.js";

export function initSkills(scheduler) {
  if (!scheduler?.hasJob?.("needs")) {
    registerNeedsSkill(scheduler);
  }

  if (!scheduler?.hasJob?.("routine")) {
    registerRoutineSkill(scheduler);
  }
}
