// Logger simples e padronizado
// Evita console.log espalhado pelo projeto
// Fácil de evoluir depois (arquivo, cores, níveis, etc)

const formatMessage = (level, message) => {
  const timestamp = new Date().toISOString()
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`
}

const logger = {
  info(message) {
    console.log(formatMessage("info", message))
  },

  warn(message) {
    console.warn(formatMessage("warn", message))
  },

  error(message, error = null) {
    console.error(formatMessage("error", message))
    if (error) {
      console.error(error)
    }
  },

  debug(message) {
    if (process.env.DEBUG === "true") {
      console.log(formatMessage("debug", message))
    }
  }
}

export default logger