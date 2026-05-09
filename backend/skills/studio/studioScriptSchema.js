const STUDIO_SCRIPT_SCHEMA_VERSION = "kit.studio.script.v1";

const ALLOWED_SCENE_DURATIONS = [3, 5, 7, 10, 12, 15];
const DEFAULT_SCENE_DURATION = 5;
const MAX_SCENE_DURATION = 15;

const STUDIO_SCRIPT_SCHEMA = {
  schemaVersion: STUDIO_SCRIPT_SCHEMA_VERSION,
  fields: {
    totalDuration: "number",
    postCaption: "string",
    scenes: [
      {
        id: "string",
        index: "number",
        title: "string",
        approved: "boolean",
        duration: "number: 3 | 5 | 7 | 10 | 12 | 15",
        narration: "string",
        subtitle: "string",
        visualDescription: "string",
        visualPrompt: "string",
        negativePrompt: "string",
        motionPrompt: "string",
        mediaType: "string: image | video",
        generationMode: "string: t2i | i2i | t2v | i2v",
        references: "array"
      }
    ]
  }
};

module.exports = {
  STUDIO_SCRIPT_SCHEMA_VERSION,
  STUDIO_SCRIPT_SCHEMA,
  ALLOWED_SCENE_DURATIONS,
  DEFAULT_SCENE_DURATION,
  MAX_SCENE_DURATION
};
