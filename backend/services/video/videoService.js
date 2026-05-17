import { createVideoEngine } from "./videoEngine.js";

let videoEngineSingleton = null;
let videoEngineContext = null;

export function getVideoEngine(context = null) {
  if (!videoEngineSingleton) {
    videoEngineContext = context || {};
    videoEngineSingleton = createVideoEngine(videoEngineContext);
  } else if (context && videoEngineContext && context !== videoEngineContext) {
    Object.assign(videoEngineContext, context);
    videoEngineContext.core = {
      ...(videoEngineContext.core || {}),
      ...(context.core || {})
    };
    videoEngineContext.services = {
      ...(videoEngineContext.services || {}),
      ...(context.services || {})
    };
  }
  return videoEngineSingleton;
}

export async function enqueueVideoJob(payload = {}, context = null) {
  return getVideoEngine(context).enqueue(payload);
}

export function getVideoJob(jobId = "") {
  return getVideoEngine().getJob(jobId);
}

export function listVideoJobs(filters = {}) {
  return getVideoEngine().listJobs(filters);
}

export function cancelVideoJob(jobId = "") {
  return getVideoEngine().cancelJob(jobId);
}
