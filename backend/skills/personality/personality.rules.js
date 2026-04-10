/**
 * Regras de comportamento e tipo de resposta
 * Define o tom da Kit baseado no combo Emoção + Ação + Aura
 */
export function resolveResponseType({ emotion, action, aura }) {
  if (action === "sleeping") return "sleepy_grumpy";
  if (emotion === "hangry") return "hangry_rant";
  if (emotion === "tired") return "tired_grumble";

  if (aura >= 70) {
    if (emotion === "grumpy" || emotion === "hangry") return "toxic_streamer";
    if (emotion === "hype") return "mocking_playful";
    return "dominant_sarcastic";
  }

  if (aura < 30) {
    if (emotion === "dramatic") return "dramatic_cancelled";
    if (emotion === "tired") return "sad_streamer";
    return "insecure_biscoito";
  }

  if (action === "stream_live") return "hype_duo";
  if (action === "eating") return "snack_streamer";

  return emotion || "neutral_vibe";
}