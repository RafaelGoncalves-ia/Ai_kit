const fs = require("fs");
const path = require("path");

const LOG_DIR = "F:\\AI\\Ai_kit\\logs";

function readLog(file) {
  try {
    return fs.readFileSync(path.join(LOG_DIR, file), "utf8");
  } catch {
    return "LOG NOT FOUND";
  }
}

module.exports = { readLog };