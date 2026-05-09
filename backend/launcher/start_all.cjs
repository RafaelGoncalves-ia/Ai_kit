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

// AI-KIT backend
start("node", ["server.js"], "..");

// abre dashboard automaticamente
setTimeout(() => {
  require("child_process").exec(
    "start http://localhost:3001/index.html"
  );
}, 2000);
