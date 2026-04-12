import logger from "../utils/logger.js";

export default function createScheduler(context) {
  const jobs = new Map();

  let tickInterval = 1000;
  let timer = null;
  let tickInProgress = false;
  let lastTickSkipWarningAt = 0;
  const skipWarningCooldownMs = 15000;

  function register({ name, execute, priority = 0, enabled = true }) {
    if (!name || typeof execute !== "function") {
      logger.warn(`Job invalido: ${name}`);
      return false;
    }

    if (jobs.has(name)) {
      logger.warn(`Job duplicado ignorado: ${name}`);
      return false;
    }

    jobs.set(name, {
      name,
      execute,
      priority,
      enabled,
      running: false,
      lastStartedAt: null,
      lastFinishedAt: null
    });

    logger.info(`Job registrado: ${name}`);
    return true;
  }

  async function runTick() {
    if (tickInProgress) {
      const now = Date.now();
      if (now - lastTickSkipWarningAt >= skipWarningCooldownMs) {
        lastTickSkipWarningAt = now;
        logger.warn("Tick ignorado: scheduler ainda executando ciclo anterior");
      }
      return;
    }

    tickInProgress = true;

    const activeJobs = Array.from(jobs.values())
      .filter((job) => job.enabled)
      .sort((a, b) => b.priority - a.priority);

    try {
      for (const job of activeJobs) {
        if (job.running) {
          logger.warn(`Job ainda em execucao, ciclo ignorado: ${job.name}`);
          continue;
        }

        try {
          job.running = true;
          job.lastStartedAt = Date.now();
          await job.execute(context);
        } catch (err) {
          logger.error(`Erro no job: ${job.name}`, err);
        } finally {
          job.running = false;
          job.lastFinishedAt = Date.now();
        }
      }
    } finally {
      tickInProgress = false;
    }
  }

  function start(interval = 1000) {
    if (timer) {
      logger.warn(`Scheduler.start ignorado: scheduler ja iniciado (tick: ${tickInterval}ms)`);
      return false;
    }

    tickInterval = interval;
    timer = setInterval(runTick, tickInterval);

    logger.info(`Scheduler iniciado (tick: ${tickInterval}ms)`);
    return true;
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
    }

    timer = null;
    tickInProgress = false;

    logger.info("Scheduler parado");
  }

  function hasJob(name) {
    return jobs.has(name);
  }

  function listJobs() {
    return Array.from(jobs.keys());
  }

  return {
    register,
    start,
    stop,
    hasJob,
    listJobs
  };
}
