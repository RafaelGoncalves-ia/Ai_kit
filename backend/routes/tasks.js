import express from "express";

export default function createTasksRoutes(context) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const skill = context.core.skillManager.get("tasks");
    const tasks = skill ? await skill.listTasks() : [];
    const reminders = skill ? skill.getRecentReminders() : [];

    const rows = tasks
      .map((task) => `
        <tr>
          <td>${task.title}</td>
          <td>${task.client}</td>
          <td>${task.description || "-"}</td>
          <td>${task.due_date || "-"}</td>
          <td>${task.recurrence || "one-time"}</td>
          <td>${task.status}</td>
          <td>
            <form method="POST" action="/tasks/${task.id}/complete" style="display:inline">
              <button type="submit">✔</button>
            </form>
            <form method="POST" action="/tasks/${task.id}/delete" style="display:inline">
              <button type="submit">✖</button>
            </form>
          </td>
        </tr>
      `)
      .join("");

    const reminderRows = reminders
      .map((reminder) => `
        <li><strong>${reminder.title}</strong> (${reminder.client}) - ${reminder.message} <small>${reminder.created_at}</small></li>
      `)
      .join("");

    res.send(`
      <html>
        <head>
          <meta charset="utf-8" />
          <title>TaskSkill - Tarefas</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; background: #f8f8f8; color: #222; }
            h1, h2 { margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #333; color: #fff; }
            button { cursor: pointer; padding: 6px 10px; border: none; background: #333; color: #fff; border-radius: 4px; }
            button:hover { opacity: 0.9; }
            .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
            .box { background: #fff; padding: 16px; border-radius: 8px; box-shadow: 0 0 12px rgba(0,0,0,0.06); }
            input, textarea, select { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>TaskSkill</h1>
          <section class="box">
            <h2>Nova tarefa</h2>
            <form method="POST" action="/tasks/create">
              <div class="form-row">
                <label>Cliente<br /><input name="client" placeholder="cliente" value="pessoal" /></label>
                <label>Título<br /><input name="title" required placeholder="Ex: Responder e-mail" /></label>
              </div>
              <div class="form-row">
                <label>Descrição<br /><textarea name="description" rows="2" placeholder="Detalhes"></textarea></label>
                <label>Data / hora<br /><input type="datetime-local" name="due_date" /></label>
              </div>
              <div class="form-row">
                <label>Recorrência<br />
                  <select name="recurrence">
                    <option value="">Nenhuma</option>
                    <option value="daily">Diária</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                    <option value="interval">Intervalo</option>
                  </select>
                </label>
                <label>Dias da semana<br /><input name="days_of_week" placeholder="0-6 ou seg,ter" /></label>
              </div>
              <div class="form-row">
                <label>Dias de intervalo<br /><input name="interval_days" type="number" min="1" placeholder="Ex: 2" /></label>
                <div></div>
              </div>
              <button type="submit">Criar tarefa</button>
            </form>
          </section>

          <section class="box">
            <h2>Lista de tarefas</h2>
            <table>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Cliente</th>
                  <th>Descrição</th>
                  <th>Due Date</th>
                  <th>Recorrência</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${rows || "<tr><td colspan=7>Nenhuma tarefa cadastrada.</td></tr>"}
              </tbody>
            </table>
          </section>

          <section class="box">
            <h2>Lembretes recentes</h2>
            <ul>
              ${reminderRows || "<li>Sem lembretes recentes.</li>"}
            </ul>
          </section>
        </body>
      </html>
    `);
  });

  router.post("/create", async (req, res) => {
    const skill = context.core.skillManager.get("tasks");
    if (!skill) return res.status(500).send("TaskSkill não disponível");

    const payload = {
      title: req.body.title,
      client: req.body.client,
      description: req.body.description,
      due_date: req.body.due_date ? new Date(req.body.due_date).toISOString() : null,
      recurrence: req.body.recurrence || null,
      interval_days: req.body.interval_days ? Number(req.body.interval_days) : null,
      days_of_week: req.body.days_of_week || null,
    };

    try {
      await skill.createTask(payload);
      res.redirect("/tasks");
    } catch (err) {
      res.status(500).send("Não foi possível criar a tarefa.");
    }
  });

  router.post("/:id/complete", async (req, res) => {
    const skill = context.core.skillManager.get("tasks");
    if (!skill) return res.status(500).send("TaskSkill não disponível");

    await skill.completeTask(req.params.id);
    res.redirect("/tasks");
  });

  router.post("/:id/delete", async (req, res) => {
    const skill = context.core.skillManager.get("tasks");
    if (!skill) return res.status(500).send("TaskSkill não disponível");

    await skill.deleteTask(req.params.id);
    res.redirect("/tasks");
  });

  router.get("/api", async (req, res) => {
    const skill = context.core.skillManager.get("tasks");
    if (!skill) return res.status(500).json({ error: "TaskSkill não disponível" });

    const tasks = await skill.listTasks(req.query);
    res.json({ tasks });
  });

  return router;
}
