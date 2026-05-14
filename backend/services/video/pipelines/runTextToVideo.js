export function runTextToVideo({ payload = {}, conditioning = {}, output = {} } = {}) {
  const summaryLogs = [
    "pipeline:t2v",
    "source:text-conditioning",
    ...(conditioning.logs || [])
  ];

  return {
    pipelineId: "text-to-video",
    mode: "t2v",
    workerInput: {
      ...payload,
      mode: "t2v",
      startImage: "",
      pipeline: {
        id: "standard-T2V",
        mode: "t2v",
        sourceStrategy: "text-conditioning",
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
