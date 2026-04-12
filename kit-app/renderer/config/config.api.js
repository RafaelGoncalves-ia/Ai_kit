const API = "http://localhost:3001";

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Falha na requisição.");
  }
  return data;
}

export async function fetchModels() {
  const response = await fetch(`${API}/models`);
  const data = await parseJson(response);
  return data.models || [];
}

export async function fetchStatus() {
  const response = await fetch(`${API}/status`);
  return parseJson(response);
}

export async function fetchConfigBundle() {
  const response = await fetch(`${API}/config/bundle`);
  const data = await parseJson(response);
  return data.data;
}

export async function saveConfigBundle(bundle) {
  const response = await fetch(`${API}/config/bundle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: bundle })
  });
  const data = await parseJson(response);
  return data.data;
}

export async function fetchSkills() {
  const response = await fetch(`${API}/skills`);
  return parseJson(response);
}

export async function toggleSkill(name, active) {
  const response = await fetch(`${API}/skills/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active })
  });
  return parseJson(response);
}

export async function fetchShop() {
  const response = await fetch(`${API}/shop`);
  return parseJson(response);
}

export async function buyShopItem(id) {
  const response = await fetch(`${API}/shop/gift`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });
  return parseJson(response);
}

export { API };
