const { spawn } = require("child_process");
const path = require("path");
const { addLog } = require("../logger/logStore");

function startService(name, cmd, args, cwd, key) {
  const p = spawn(cmd, args, {
    cwd: path.resolve(__dirname, cwd),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  p.stdout.on("data", (d) => addLog(key, d.toString()));
  p.stderr.on("data", (d) => addLog(key, "[ERR] " + d.toString()));

  p.unref();

  addLog(key, `${name} iniciado`);
}

// STT
startService("STT", "python", ["stt_server.py"], "../services", "stt");

// XTTS
startService("XTTS", "python", ["xtts_server.py"], "../services", "xtts");

// AI-KIT backend (Node principal)
startService("AI-KIT", "node", ["server.js"], "../", "aikit");