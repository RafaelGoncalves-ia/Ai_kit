let appState = {
  bundle: null,
  models: [],
  status: null
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function setBundle(bundle) {
  appState.bundle = clone(bundle);
}

export function getBundle() {
  return clone(appState.bundle);
}

export function mutateBundle(mutator) {
  const draft = clone(appState.bundle);
  mutator(draft);
  appState.bundle = draft;
  return clone(appState.bundle);
}

export function setModels(models) {
  appState.models = Array.isArray(models) ? models.slice() : [];
}

export function getModels() {
  return appState.models.slice();
}

export function setStatusSnapshot(status) {
  appState.status = status || null;
}

export function getStatusSnapshot() {
  return appState.status;
}

export function getValueByPath(source, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), source);
}

export function setValueByPath(target, path, value) {
  const keys = String(path || "").split(".").filter(Boolean);
  if (!keys.length) return;

  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }

  cursor[keys[keys.length - 1]] = value;
}
