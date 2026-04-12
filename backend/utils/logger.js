// Logger simples e padronizado
// Evita console.log espalhado pelo projeto
// Fácil de evoluir depois (arquivo, cores, níveis, etc)

const normalizeMessage = (parts) => parts
  .flat()
  .filter((part) => part !== undefined && part !== null)
  .map((part) => typeof part === "string" ? part : JSON.stringify(part))
  .join(" ")

const formatMessage = (level, message) => {
  const timestamp = new Date().toISOString()
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`
}

const logger = {
  info(...parts) {
    console.log(formatMessage("info", normalizeMessage(parts)))
  },

  warn(...parts) {
    console.warn(formatMessage("warn", normalizeMessage(parts)))
  },

  error(message, error = null) {
    console.error(formatMessage("error", message))
    if (error) {
      console.error(error)
    }
  },

  debug(...parts) {
    if (process.env.DEBUG === "true") {
      console.log(formatMessage("debug", normalizeMessage(parts)))
    }
  }
}

export default logger
