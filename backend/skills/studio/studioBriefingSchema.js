const STUDIO_BRIEFING_SCHEMA_VERSION = "kit.studio.briefing.v1";

const STUDIO_BRIEFING_SCHEMA = {
  schemaVersion: STUDIO_BRIEFING_SCHEMA_VERSION,
  fields: {
    theme: "string",
    purpose: "string",
    audience: "string",
    visualMaterial: "string: aigc | user | user + aigc",
    duration: "string",
    mediaType: "string: clip | imagem | carrossel | stories",
    ratio: "string: 9:16 | 3:4 | 1:1 | 16:9",
    platform: "string",
    postType: "string",
    videoContent: "string",
    videoNarration: "string",
    bgmStyle: "string",
    bgmId: "string",
    subtitleInfo: "string",
    postCaption: "string",
    characters: "string[]",
    materialReferences: "string[]",
    ttsList: "string[]",
    digitalHumanList: "string[]",
    styleList: "string[]",
    referenceNodeIds: "string[]",
    rawReferences: "string",
    defaultsFromClientKit: "object|null"
  }
};

function createEmptyBriefing() {
  return {
    theme: "",
    purpose: "",
    audience: "",
    visualMaterial: "aigc",
    duration: "",
    mediaType: "clip",
    ratio: "9:16",
    platform: "",
    postType: "",
    videoContent: "",
    videoNarration: "",
    bgmStyle: "",
    bgmId: "",
    subtitleInfo: "",
    postCaption: "",
    characters: [],
    materialReferences: [],
    ttsList: [],
    digitalHumanList: [],
    styleList: [],
    referenceNodeIds: [],
    rawReferences: "",
    defaultsFromClientKit: null
  };
}

module.exports = {
  STUDIO_BRIEFING_SCHEMA_VERSION,
  STUDIO_BRIEFING_SCHEMA,
  createEmptyBriefing
};
