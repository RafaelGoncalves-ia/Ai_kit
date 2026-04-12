import { deriveEmotionFromState } from "../../core/personalityConfig.js";

export default function updateEmotion(context) {
  if (!context?.state) {
    return null;
  }

  context.state.emotion = deriveEmotionFromState(context.state);
  return context.state.emotion;
}
