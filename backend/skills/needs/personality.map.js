import { getAuraProfile, listAuraProfiles } from "../../core/personalityConfig.js";

export function getPersonalityByAura(aura) {
  return getAuraProfile(aura);
}

export function listPersonalities() {
  return listAuraProfiles();
}
