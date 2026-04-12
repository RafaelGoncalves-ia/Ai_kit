import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { randomUUID } from "crypto";
import logger from "../../../backend/utils/logger.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const TIMEZONE = "America/Sao_Paulo";
const ONE_HOUR_MS = 1000 * 60 * 60;
const MAX_REMINDERS = 20;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_PATH = path.resolve(__dirname, "../../../");
const DB_DIR = path.join(ROOT_PATH, "backend", "database");
const DB_PATH = path.join(DB_DIR, "tasks.db");

function ensureDirectory(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function parseDate(value) {
  if (!value) return null;
  const parsed = dayjs(value).tz(TIMEZONE);
  return parsed.isValid() ? parsed : null;
}

function normalizeDaysOfWeek(value) {
  if (!value) return null;

  let items = value;
  if (typeof value === "string") {
    try {
      const maybeJson = JSON.parse(value);
      if (Array.isArray(maybeJson)) {
        items = maybeJson;
      }
    } catch {
      items = value.split(",");
    }
  }

  if (!Array.isArray(items)) {
    items = [items];
  }

  const mapping = {
    domingo: 0,
    dom: 0,
    sunday: 0,
    segunda: 1,
    seg: 1,
    monday: 1,
    terca: 2,
    terça: 2,
    ter: 2,
    tuesday: 2,
    quarta: 3,
    qua: 3,
    wednesday: 3,
    quinta: 4,
    qui: 4,
    thursday: 4,
    sexta: 5,
    sex: 5,
    friday: 5,
    sabado: 6,
    sábado: 6,
    sab: 6,
    saturday: 6,
  };

  const normalized = items
    .map((item) => {
      if (item === null || item === undefined) return null;
      if (typeof item === "number") return item;
      const raw = String(item).trim().toLowerCase();
      if (raw === "") return null;
      if (!Number.isNaN(Number(raw))) {
        const num = Number(raw);
        return num >= 0 && num <= 6 ? num : null;
      }
      return mapping[raw] ?? null;
    })
    .filter((day) => day !== null);

  return normalized.length ? Array.from(new Set(normalized)).sort((a, b) => a - b) : null;
}

function serializeDaysOfWeek(value) {
  const normalized = normalizeDaysOfWeek(value);
  return normalized ? JSON.stringify(normalized) : null;
}

function parseTaskRow(row) {
  return {
    id: row.id,
    client: row.client,
    title: row.title,
    description: row.description,
    due_date: row.due_date,
    recurrence: row.recurrence,
    interval_days: row.interval_days,
    days_of_week: row.days_of_week ? JSON.parse(row.days_of_week) : null,
    status: row.status,
    last_run: row.last_run,
    created_at: row.created_at,
  };
}

function buildPrompt(task, state) {
  const mood = state?.needs?.mood ?? "?";
  const energy = state?.needs?.energy ?? "?";

  return `O usuário ainda não fez: ${task.title} (cliente: ${task.client}).\nEstado atual: mood=${mood}, energy=${energy}.\nSeja direta, curta, use gírias e provoque ação.`;
}

function getNow() {
  return dayjs().tz(TIMEZONE);
}

export default {
  name: "tasks",
  description: "Gerencia tarefas, lembretes e recorrências do Kit IA",

  init(context) {
    this.context = context;
    this.recentReminders = [];
    this.db = null;
    this.schedulerTimer = null;

    ensureDirectory(DB_DIR);
    this.ensureDatabase();

    this.schedulerTimer = setInterval(async () => {
      try {
        await this.checkPendingTasks();
      } catch (err) {
        logger.error("Erro no scheduler da TaskSkill:", err);
      }
    }, 1000 * 60);

    // Executa imediatamente na inicialização
    this.checkPendingTasks().catch((err) => {
      logger.error("Erro inicial ao verificar tarefas:", err);
    });

    logger.info("TaskSkill inicializada e monitorando tarefas a cada 1 minuto.");
  },

  shutdown() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
      logger.info("TaskSkill desligada e scheduler parado.");
    }
    if (this.db) {
      try {
        this.db.close();
      } catch (err) {
        logger.error("Erro ao fechar banco de tarefas:", err);
      }
      this.db = null;
    }
  },

  getRecentReminders() {
    return Array.from(this.recentReminders);
  },

  async createTask(input = {}) {
    this.ensureDatabase();

    const now = getNow().toISOString();
    const title = String(input.title || "Tarefa sem título").trim();
    const client = String(input.client || "pessoal").trim();
    const description = String(input.description || "").trim();
    const dueDate = parseDate(input.due_date)?.toISOString() || getNow().toISOString();
    const recurrence = input.recurrence || null;
    const interval_days = Number(input.interval_days) || null;
    const days_of_week = recurrence === "weekly" ? serializeDaysOfWeek(input.days_of_week) : null;

    const task = {
      id: randomUUID(),
      client,
      title,
      description,
      due_date: dueDate,
      recurrence,
      interval_days: recurrence === "interval" ? interval_days || 1 : null,
      days_of_week,
      status: "pending",
      last_run: null,
      created_at: now,
    };

    this.db
      .prepare(
        `INSERT INTO tasks (id, client, title, description, due_date, recurrence, interval_days, days_of_week, status, last_run, created_at)
         VALUES (@id, @client, @title, @description, @due_date, @recurrence, @interval_days, @days_of_week, @status, @last_run, @created_at)`
      )
      .run(task);

    return this.getTaskById(task.id);
  },

  async listTasks(filter = {}) {
    this.ensureDatabase();

    const conditions = [];
    const params = {};

    if (filter.status) {
      conditions.push("status = @status");
      params.status = filter.status;
    }
    if (filter.client) {
      conditions.push("client = @client");
      params.client = filter.client;
    }
    if (filter.recurrence) {
      conditions.push("recurrence = @recurrence");
      params.recurrence = filter.recurrence;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM tasks ${whereClause} ORDER BY status DESC, due_date ASC, created_at DESC`)
      .all(params);

    return rows.map(parseTaskRow);
  },

  async getTaskById(taskId) {
    this.ensureDatabase();
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId);
    return row ? parseTaskRow(row) : null;
  },

  async completeTask(taskId) {
    this.ensureDatabase();

    const task = await this.getTaskById(taskId);
    if (!task) return null;

    const now = getNow();
    const update = {
      id: taskId,
      last_run: now.toISOString(),
    };

    if (task.recurrence) {
      const nextDue = this.calculateNextDueDate(task);
      this.db
        .prepare(`UPDATE tasks SET due_date = @due_date, last_run = @last_run, status = 'pending' WHERE id = @id`)
        .run({ ...update, due_date: nextDue.toISOString() });
    } else {
      this.db
        .prepare(`UPDATE tasks SET status = 'done', last_run = @last_run WHERE id = @id`)
        .run(update);
    }

    return this.getTaskById(taskId);
  },

  async deleteTask(taskId) {
    this.ensureDatabase();
    const result = this.db.prepare(`DELETE FROM tasks WHERE id = ?`).run(taskId);
    return result.changes > 0;
  },

  async checkPendingTasks() {
    this.ensureDatabase();
    const now = getNow();
    const tasks = await this.listTasks({ status: "pending" });

    for (const task of tasks) {
      try {
        if (!this.shouldTriggerTask(task, now)) continue;
        await this.triggerReminder(task, now);
      } catch (err) {
        logger.error(`Erro ao processar tarefa ${task.id}:`, err);
      }
    }
  },

  async triggerReminder(task, now = null) {
    now = now || getNow();
    const previousRun = task.last_run ? parseDate(task.last_run) : null;
    const nextDue = task.recurrence ? this.calculateNextDueDate(task) : null;

    const update = {
      id: task.id,
      last_run: now.toISOString(),
      due_date: nextDue ? nextDue.toISOString() : task.due_date,
    };

    if (task.recurrence) {
      this.db
        .prepare(`UPDATE tasks SET due_date = @due_date, last_run = @last_run WHERE id = @id`)
        .run(update);
    } else {
      this.db
        .prepare(`UPDATE tasks SET last_run = @last_run WHERE id = @id`)
        .run(update);
    }

    const prompt = buildPrompt(task, this.context.state);
    const response = await this.context.invokeTool("ai_chat", { prompt });
    const message = response?.data?.text || `Lembrete: ${task.title}`;

    this.recentReminders.unshift({
      taskId: task.id,
      title: task.title,
      client: task.client,
      message,
      created_at: now.toISOString(),
      due_date: task.due_date,
      recurrence: task.recurrence,
    });

    if (this.recentReminders.length > MAX_REMINDERS) {
      this.recentReminders.length = MAX_REMINDERS;
    }

    if (global.sendSSE) {
      global.sendSSE({
        type: "task:reminder",
        payload: {
          task: {
            id: task.id,
            title: task.title,
            client: task.client,
            status: task.status,
          },
          message,
          when: now.toISOString(),
        }
      });
    }

    if (this.context.core?.eventBus) {
      this.context.core.eventBus.emit("task:reminder", {
        task: {
          id: task.id,
          title: task.title,
          client: task.client,
          status: task.status,
        },
        message,
        when: now.toISOString(),
      });
    }

    logger.info(`TaskSkill lembrete disparado para tarefa ${task.id}`);
    return { task: await this.getTaskById(task.id), message };
  },

  shouldTriggerTask(task, now = null) {
    now = now || getNow();
    if (task.status !== "pending") return false;

    const dueDate = parseDate(task.due_date);
    if (!dueDate) return false;
    if (dueDate.isAfter(now)) return false;

    if (task.last_run) {
      const lastRun = parseDate(task.last_run);
      if (lastRun && lastRun.add(ONE_HOUR_MS, "millisecond").isAfter(now)) {
        return false;
      }
    }

    return true;
  },

  calculateNextDueDate(task) {
    const now = getNow();
    let next = parseDate(task.due_date) || now;

    const advanceOnce = (current) => {
      switch (task.recurrence) {
        case "daily":
          return current.add(1, "day");
        case "weekly": {
          const days = normalizeDaysOfWeek(task.days_of_week) || [current.day()];
          const currentDay = current.day();
          const futureDay = days.find((day) => day > currentDay);
          if (futureDay !== undefined) {
            return current.add(futureDay - currentDay, "day");
          }
          const firstDay = days[0];
          const daysToAdd = (7 - currentDay + firstDay) % 7 || 7;
          return current.add(daysToAdd, "day");
        }
        case "monthly": {
          const targetDay = parseInt(task.days_of_week?.[0] ?? current.date(), 10);
          const candidate = current.add(1, "month").date(targetDay);
          if (candidate.date() !== targetDay) {
            return current.add(1, "month").endOf("month");
          }
          return candidate;
        }
        case "interval": {
          const days = Number(task.interval_days) || 1;
          return current.add(days, "day");
        }
        default:
          return current.add(1, "day");
      }
    };

    if (task.recurrence === "monthly") {
      const targetDay = task.days_of_week?.[0] ?? parseDate(task.due_date)?.date();
      if (targetDay) {
        next = parseDate(task.due_date).date(targetDay);
      }
    }

    let nextDue = advanceOnce(next);
    while (nextDue.isSame(now) || nextDue.isBefore(now)) {
      nextDue = advanceOnce(nextDue);
    }

    return nextDue;
  },

  ensureDatabase() {
    if (this.db) return;

    this.db = new Database(DB_PATH);
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          client TEXT,
          title TEXT,
          description TEXT,
          due_date TEXT,
          recurrence TEXT,
          interval_days INTEGER,
          days_of_week TEXT,
          status TEXT,
          last_run TEXT,
          created_at TEXT
        )`
      )
      .run();

    this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status_due_date
      ON tasks (status, due_date)
    `).run();

    this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_tasks_client_status
      ON tasks (client, status)
    `).run();

    this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_tasks_last_run
      ON tasks (last_run)
    `).run();
  },
};
