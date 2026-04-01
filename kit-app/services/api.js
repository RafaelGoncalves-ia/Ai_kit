/**
 * Aqui você conecta com seu backend real da Kit
 * (Ollama, memória, skills, etc)
 */
async function sendToKit(message) {
  return `Resposta real da Kit para: ${message}`;
}

module.exports = { sendToKit };