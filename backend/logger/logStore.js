// F:\AI\Ai_kit\backend\logger\logStore.js
const fs = require("fs");
const path = require("path");
const LOG_DIR = "F:/AI/Ai_kit/logs";

function addLog(service, msg) {
  const timestamp = new Date().toLocaleString('pt-BR');
  const entry = `[${timestamp}] ${msg}\n`;
    
  // 1. Salva no arquivo (Append)
  const filePath = path.join(LOG_DIR, `${service}.log`);
  fs.appendFileSync(filePath, entry);
    
  // 2. Mantém na memória (seu código original)
  if (!logs[service]) logs[service] = [];
    logs[service].push(entry);
  if (logs[service].length > 500) logs[service].shift();}