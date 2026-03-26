/**
 * Regras que convertem Needs em efeitos reais
 */

export function evaluateNeeds(needs) {
  const effects = {
    emotionHint: null,
    actionHint: null,
  };

  if (needs.energy < 20) {
    effects.emotionHint = "sleepy";
    effects.actionHint = "sleep";
  }

  if (needs.hunger > 70) {
    effects.emotionHint = "annoyed";
    effects.actionHint = "eat";
  }

  if (needs.mood < 30) {
    effects.emotionHint = "bored";
    effects.actionHint = "fun";
  }

  if (needs.aura < 20) {
    effects.emotionHint = "cold";
  }

  return effects;
}