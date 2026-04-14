/**
 * Regras simples que convertem Needs em hints.
 *
 * Importante:
 * - Aqui existe prioridade explícita.
 * - Não sobrescreve hint várias vezes no mesmo ciclo.
 * - O motor de rotina continua sendo a camada principal de decisão.
 */
export function evaluateNeeds(needs) {
  const safeNeeds = {
    energy: Number(needs?.energy ?? 50),
    hunger: Number(needs?.hunger ?? 50),
    mood: Number(needs?.mood ?? 50),
    aura: Number(needs?.aura ?? 50),
    hygiene: Number(needs?.hygiene ?? 50)
  };

  if (safeNeeds.energy < 15) {
    return { emotionHint: "sleepy", actionHint: "sleep" };
  }

  if (safeNeeds.hunger < 15) {
    return { emotionHint: "annoyed", actionHint: "cook_meal" };
  }

  if (safeNeeds.hygiene < 20) {
    return { emotionHint: "dirty", actionHint: "take_bath" };
  }

  if (safeNeeds.mood < 30) {
    return { emotionHint: "bored", actionHint: "play_videogame" };
  }

  if (safeNeeds.aura < 20) {
    return { emotionHint: "cold", actionHint: "take_selfies" };
  }

  if (safeNeeds.energy < 40) {
    return { emotionHint: "tired", actionHint: "nap" };
  }

  if (safeNeeds.hunger < 35) {
    return { emotionHint: "snacky", actionHint: "eat_snack" };
  }

  return { emotionHint: null, actionHint: null };
}