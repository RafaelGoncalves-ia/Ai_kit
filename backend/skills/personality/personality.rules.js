/**
 * Regras de comportamento e tipo de resposta (removido)
 */
export function resolveResponseType({ emotion, action }) {
  if (action === "sleeping") return "lazy";
  if (action === "eating") return "casual";
  if (emotion === "angry") return "aggressive";
  if (emotion === "happy") return "playful";

  return "neutral";
}