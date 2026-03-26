import fetch from "node-fetch";

const PORT = process.env.XTTS_PORT || 5005;
const XTTS_URL = `http://localhost:${PORT}`;

// ======================
// CHECK SERVER
// ======================
async function isXTTSAlive() {
  try {
    const res = await fetch(`${XTTS_URL}/docs`);
    return res.ok;
  } catch {
    return false;
  }
}

// ======================
// WAIT SERVER
// ======================
async function waitForServer(timeout = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const alive = await isXTTSAlive();

    if (alive) return true;

    console.log("[XTTS] aguardando...");
    await new Promise((r) => setTimeout(r, 1000));
  }

  return false;
}

// ======================
// SKILL EXPORT
// ======================
export default {
  name: "xtts",

  async init(context) {
    console.log("[Skill XTTS] verificando servidor...");

    const ready = await waitForServer(5000);

    if (ready) {
      console.log("[Skill XTTS] XTTS conectado");
      context.services.xttsAvailable = true;
    } else {
      console.warn("[Skill XTTS] XTTS offline (modo fallback)");
      context.services.xttsAvailable = false;
    }

    // 🔁 Retry automático em background
    setInterval(async () => {
      if (context.services.xttsAvailable) return;

      const alive = await isXTTSAlive();

      if (alive) {
        console.log("[XTTS] reconectado automaticamente");
        context.services.xttsAvailable = true;
      }
    }, 10000);
  }
};