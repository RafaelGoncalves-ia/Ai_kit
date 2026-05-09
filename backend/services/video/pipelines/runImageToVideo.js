export function runImageToVideo({ payload = {}, conditioning = {}, output = {} } = {}) {
  const summaryLogs = [
    "pipeline:i2v",
    "source:start-image",
    ...(conditioning.logs || [])
  ];

  return {
    pipelineId: "image-to-video",
    mode: "i2v",
    workerInput: {
      ...payload,
      mode: "i2v",
      startImage: conditioning.startImage || payload.startImage || "",
      pipeline: {
        id: "image-to-video",
        mode: "i2v",
        sourceStrategy: "start-image",
        supports: ["interpolation", "startFrame", "endFrame", "chaining", "frame-guidance"]
      },
      conditioning: {
        preferredMode: conditioning.preferredMode,
        loras: conditioning.loras,
        references: conditioning.references,
        primaryReference: conditioning.primaryReference
      },
      output,
      summaryLogs
    },
    summaryLogs
  };
}
