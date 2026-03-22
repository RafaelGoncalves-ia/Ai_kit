const logs = {
  stt: [],
  xtts: [],
  aikit: []
};

function addLog(service, msg) {
  if (!logs[service]) logs[service] = [];
  logs[service].push(`[${new Date().toISOString()}] ${msg}`);
  if (logs[service].length > 500) logs[service].shift();
}

function getLogs(service) {
  return logs[service] || [];
}

module.exports = { addLog, getLogs };