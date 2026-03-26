// Scheduler central para executar tarefas periódicas (Skills)
// Permite que Skills definam jobs autônomos
// Ex.: randomTalk, commentActivity, checkScreen

import logger from "../utils/logger.js";

export default function createScheduler(context) {
  const jobs = new Map();

  let tickInterval = 1000; // 1s padrão
  let timer = null;

  // REGISTRAR JOB
  function register({ name, execute, priority = 0, enabled = true }) {
    if (!name || typeof execute !== "function") {
      logger.warn(`Job inválido: ${name}`);
      return;
    }

    jobs.set(name, {
      execute,
      priority,
      enabled,
    });

    logger.info(`Job registrado: ${name}`);
  }

  // LOOP CENTRAL (TICK)
  async function runTick() {
    const activeJobs = Array.from(jobs.values())
      .filter((job) => job.enabled)
      .sort((a, b) => b.priority - a.priority); // maior prioridade primeiro

    for (const job of activeJobs) {
      try {
        await job.execute(context);
      } catch (err) {
        logger.error("Erro no job:", err);
      }
    }
  }

  // START LOOP
  function start(interval = 1000) {
    tickInterval = interval;

    if (timer) clearInterval(timer);

    timer = setInterval(runTick, tickInterval);

    logger.info(`Scheduler iniciado (tick: ${tickInterval}ms)`);
  }

  // STOP LOOP
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;

    logger.info("Scheduler parado");
  }

  // LISTAR JOBS
  function listJobs() {
    return Array.from(jobs.keys());
  }

  return {
    register,
    start,
    stop,
    listJobs,
  };
}