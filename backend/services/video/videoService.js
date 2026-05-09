import { createVideoEngine } from "./videoEngine.js";

let videoEngineSingleton = null;

export function getVideoEngine() {
  if (!videoEngineSingleton) {
    videoEngineSingleton = createVideoEngine();
  }
  return videoEngineSingleton;
}

export async function enqueueVideoJob(payload = {}) {
  return getVideoEngine().enqueue(payload);
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
