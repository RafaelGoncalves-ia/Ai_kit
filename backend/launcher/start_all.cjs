const { spawn } = require("child_process");
const path = require("path");

function start(cmd, args, cwd) {
  const p = spawn(cmd, args, {
    cwd: path.resolve(__dirname, cwd),
    detached: true,
    stdio: "ignore"
  });

  p.unref();
}

// STT
start("python", ["stt_server.py"], "../services");

// XTTS
start("python", ["xtts_server.py"], "../services");

// AI-KIT backend
start("node", ["server.js"], "..");

// abre dashboard automaticamente
setTimeout(() => {
  require("child_process").exec(
    "start http://localhost:3002/AiKitDashboard.html"
  );
}, 2000);