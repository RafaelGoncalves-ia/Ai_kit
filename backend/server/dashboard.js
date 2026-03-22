const express = require("express");
const path = require("path");
const { getLogs } = require("../logger/logStore");

const app = express();

// serve frontend estático
app.use(express.static(path.resolve(__dirname, "../frontend/dashboard")));

app.get("/logs/:service", (req, res) => {
  res.json(getLogs(req.params.service));
});

app.listen(3002, () => {
  console.log("Dashboard: http://localhost:3002/AiKitDashboard.html");
});