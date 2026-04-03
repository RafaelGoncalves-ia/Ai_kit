import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ----------------
// Paths
// ----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const statePath = path.join(__dirname, "../../config/kitState.json");
const catalogPath = path.join(__dirname, "../../config/catalog.json");

// ----------------
// Utils
// ----------------
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ----------------
// Core
// ----------------
function giftItem(itemId) {
  const state = readJSON(statePath);
  const catalog = readJSON(catalogPath);

  const item = catalog.find(i => i.id === itemId);
  if (!item) throw new Error("Item não existe");

  if (state.tokens < item.valor) {
    throw new Error("Tokens insuficientes");
  }

  state.tokens -= item.valor;

  // Consumível
  if (item.tipo === "consumivel") {
    applyEffect(state.needs, item.efeito);
  }

  // Skin / visual
  else if (item.tipo === "skin") {
    if (!state.inventory) {
      state.inventory = {};
    }

    state.inventory[item.slot] = item.id;
  }

  writeJSON(statePath, state);

  return state;
}

// ----------------
// Effects
// ----------------
function applyEffect(needs, effect) {
  Object.keys(effect).forEach(key => {
    if (needs[key] !== undefined) {
      needs[key] += effect[key];

      if (needs[key] > 100) needs[key] = 100;
      if (needs[key] < 0) needs[key] = 0;
    }
  });
}

// ----------------
// Skill
// ----------------
export default function registerShop(scheduler) {
  scheduler.register({
    name: "shop",
    priority: 2,

    execute: async (context) => {
      const { action, payload } = context;

      try {
        switch (action) {

          case "gift":
            return giftItem(payload.id);

          case "getState":
            return readJSON(statePath);

          default:
            return null;
        }

      } catch (err) {
        console.error("Shop Skill Error:", err.message);
        return { error: err.message };
      }
    }
  });
}