function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateBundle(bundle) {
  const config = bundle?.config;
  const personality = bundle?.personality;

  ensure(config && typeof config === "object", "config.json invalido.");
  ensure(nonEmpty(config?.system?.aiModel), "O modelo de IA nao pode ficar vazio.");
  ensure(typeof config?.system?.muted === "boolean", "muted deve ser boolean.");
  ensure(typeof config?.voice?.xttsEnabled === "boolean", "xttsEnabled deve ser boolean.");
  ensure(typeof config?.voice?.microphoneEnabled === "boolean", "microphoneEnabled deve ser boolean.");
  ensure(typeof config?.skills?.randomTalk === "boolean", "randomTalk deve ser boolean.");

  ensure(personality && typeof personality === "object", "Bloco de personalidade invalido.");
  ensure(nonEmpty(personality?.manifest?.activeProfile), "activeProfile nao pode ficar vazio.");

  const identity = personality?.base?.identity || {};
  [
    ["personality.base.name", personality?.base?.name],
    ["identity.archetype", identity.archetype],
    ["identity.style", identity.style],
    ["identity.baseTone", identity.baseTone],
    ["identity.presentation", identity.presentation],
    ["identity.genderIdentity", identity.genderIdentity],
    ["identity.pronouns", identity.pronouns],
    ["identity.targetUser", identity.targetUser],
    ["identity.relationship", identity.relationship]
  ].forEach(([label, value]) => ensure(nonEmpty(value), `${label} nao pode ficar vazio.`));

  const rules = personality?.base?.rules || {};
  [
    "neverFormal",
    "allowSarcasm",
    "stickToIdentity",
    "avoidTechnicalAssistantTone",
    "avoidHashtags",
    "shortRepliesPreferred",
    "spokenDirectStyle"
  ].forEach((key) => ensure(typeof rules[key] === "boolean", `${key} deve ser boolean.`));
  ensure(Array.isArray(rules.avoidMasculineSlang), "avoidMasculineSlang deve continuar array.");

  const routeModes = personality?.responseModes?.routeModes || {};
  ["realtime", "task", "agent"].forEach((mode) => {
    ensure(routeModes[mode], `responseModes precisa manter ${mode}.`);
    ensure(typeof routeModes[mode].usePersona === "boolean", `${mode}.usePersona deve ser boolean.`);
    ensure(nonEmpty(routeModes[mode].plannerRole), `${mode}.plannerRole nao pode ficar vazio.`);
    ensure(Array.isArray(routeModes[mode].instructions), `${mode}.instructions deve continuar array.`);
  });

  const profiles = personality?.needsMap?.profiles;
  ensure(Array.isArray(profiles), "needs.map precisa manter profiles.");
  profiles.forEach((profile, index) => {
    ensure(nonEmpty(profile?.id), `Perfil ${index + 1}: id obrigatorio.`);
    ensure(Number.isFinite(Number(profile?.min)), `Perfil ${index + 1}: min invalido.`);
    ensure(Number.isFinite(Number(profile?.max)), `Perfil ${index + 1}: max invalido.`);
    ensure(Number(profile.min) <= Number(profile.max), `Perfil ${index + 1}: min nao pode ser maior que max.`);
    ensure(nonEmpty(profile?.label), `Perfil ${index + 1}: label obrigatorio.`);
    ensure(nonEmpty(profile?.prompt), `Perfil ${index + 1}: prompt obrigatorio.`);
  });

  const emotions = personality?.emotionsMap;
  ensure(nonEmpty(emotions?.defaults?.type), "Emotions defaults.type obrigatorio.");
  ensure(Number.isFinite(Number(emotions?.defaults?.intensity)), "Emotions defaults.intensity invalido.");
  ensure(Array.isArray(emotions?.rules), "Emotions rules deve continuar array.");
  emotions.rules.forEach((rule, index) => {
    ensure(nonEmpty(rule?.metric), `Emotion rule ${index + 1}: metric obrigatorio.`);
    ensure(nonEmpty(rule?.operator), `Emotion rule ${index + 1}: operator obrigatorio.`);
    ensure(Number.isFinite(Number(rule?.value)), `Emotion rule ${index + 1}: value invalido.`);
    ensure(nonEmpty(rule?.emotion), `Emotion rule ${index + 1}: emotion obrigatorio.`);
  });

  return true;
}
