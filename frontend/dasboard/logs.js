const fs = require("fs");

app.get("/logs/:name", (req, res) => {
    try {
        const data = fs.readFileSync(`F:/AI/Ai_kit/logs/${req.params.name}.log`, "utf8");
        res.send(data);
    } catch {
        res.send("log vazio ou não encontrado");
    }
});