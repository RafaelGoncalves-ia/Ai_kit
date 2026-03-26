/**
 * Engine emocional
 * Deriva emoção a partir de needs + tempo
 */

export default function updateEmotion(context) {
  const state = context.state;
  const { needs } = state;

  let newEmotion = "neutral";
  let intensity = 0.5;

  // ======================
  // BASEADO EM NEEDS
  // ======================

  if (needs.energy < 20) {
    newEmotion = "sleepy";
    intensity = 0.7;
  }

  if (needs.hunger > 70) {
    newEmotion = "annoyed";
    intensity = 0.8;
  }

  if (needs.mood < 30) {
    newEmotion = "bored";
    intensity = 0.6;
  }

  if (needs.mood > 80 && needs.energy > 50) {
    newEmotion = "happy";
    intensity = 0.7;
  }

  // ======================
  // DECAY EMOCIONAL
  // ======================

  const now = Date.now();
  const last = state.emotion.lastUpdate;

  if (now - last > 1000 * 60 * 5) {
    newEmotion = "neutral";
    intensity = 0.4;
  }

  // ======================
  // APPLY
  // ======================

  state.emotion = {
    type: newEmotion,
    intensity,
    lastUpdate: now
  };
}