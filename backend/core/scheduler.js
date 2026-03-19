// Scheduler central para executar tarefas periódicas (Skills)
// Permite que Skills definam jobs autônomos
// Ex.: randomTalk, commentActivity, checkScreen

import logger from "../utils/logger.js"

export default function createScheduler(context) {
  const jobs = new Map()

  // ======================
  // REGISTRAR JOB
  // ======================
  function register({ name, interval, execute, enabled = true }) {
    if (!name || !interval || typeof execute !== "function") {
      logger.warn(`Job inválido: ${name}`)
      return
    }

    jobs.set(name, {
      interval,
      execute,
      enabled,
      timer: null
    })

    if (enabled) {
      startJob(name)
    }
  }

  // ======================
  // INICIAR JOB
  // ======================
  function startJob(name) {
    const job = jobs.get(name)
    if (!job) return

    // evita duplicar timers
    if (job.timer) clearInterval(job.timer)

    job.timer = setInterval(async () => {
      try {
        await job.execute(context)
      } catch (err) {
        logger.error(`Erro no job ${name}:`, err)
      }
    }, job.interval)

    logger.info(`Job iniciado: ${name} (interval: ${job.interval}ms)`)
  }

  // ======================
  // PARAR JOB
  // ======================
  function stopJob(name) {
    const job = jobs.get(name)
    if (!job) return

    if (job.timer) clearInterval(job.timer)
    job.timer = null
    logger.info(`Job parado: ${name}`)
  }

  // ======================
  // LISTAR JOBS
  // ======================
  function listJobs() {
    return Array.from(jobs.keys())
  }

  return {
    register,
    startJob,
    stopJob,
    listJobs
  }
}