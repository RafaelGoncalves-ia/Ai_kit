import fs from "fs";
import path from "path";
import kitState, { persistStateNow } from "../../core/stateManager.js";

const catalogPath = path.join(process.cwd(), "backend/config/catalog.json");

function loadCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
}

function applyEffect(needs, effect) {
  Object.keys(effect || {}).forEach((key) => {
    if (needs[key] !== undefined) {
      needs[key] += Number(effect[key] || 0);
      if (needs[key] > 100) needs[key] = 100;
      if (needs[key] < 0) needs[key] = 0;
    }
  });
}

export default function registerShop(scheduler) {
  scheduler.register({
    name: "shop",
    priority: 2,
    execute: async (context) => {
      const { action, payload = {} } = context || {};

      try {
        const catalog = loadCatalog();

        switch (action) {
          case "gift": {
            const item = catalog.find((entry) => entry.id === payload.id);
            if (!item) {
              throw new Error("Item nao existe");
            }

            if (Number(kitState.tokens || 0) < Number(item.valor || 0)) {
              throw new Error("Tokens insuficientes");
            }

            kitState.tokens = Number(kitState.tokens || 0) - Number(item.valor || 0);

            if (item.tipo === "consumivel") {
              applyEffect(kitState.needs, item.efeito || {});
            } else if (item.tipo === "skin") {
              kitState.inventory = kitState.inventory || {};
              kitState.inventory[item.slot] = item.id;
            }

            persistStateNow();
            return kitState;
          }
          case "getState":
            return kitState;
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
