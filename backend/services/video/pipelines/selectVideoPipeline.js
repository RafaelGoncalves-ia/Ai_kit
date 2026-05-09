import { buildVideoConditioning } from "./videoConditioningBuilder.js";
import { runImageToVideo } from "./runImageToVideo.js";
import { runTextToVideo } from "./runTextToVideo.js";

export function selectVideoPipeline({ scene = {}, payload = {}, modelEntry = null, output = {} } = {}) {
  const conditioning = buildVideoConditioning({
    scene,
    payload,
    modelEntry
  });

  if (conditioning.startImage) {
    return {
      ...runImageToVideo({
        payload,
        conditioning,
        output
      }),
      conditioning
    };
  }

  return {
    ...runTextToVideo({
      payload,
      conditioning,
      output
    }),
    conditioning
  };
}

