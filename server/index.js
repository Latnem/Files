import express from "express";
import cors from "cors";
import Database from "better-sqlite3";

const app = express();
app.use(cors());
app.use(express.json({ limit: "512kb" }));

const db = new Database("hashwatcher.db");
db.exec(`
CREATE TABLE IF NOT EXISTS miners (
  id TEXT PRIMARY KEY,
  name TEXT,
  last_ts INTEGER,
  hashrate_gh REAL,
  temp_c REAL,
  uptime_sec INTEGER
);
`);

const API_KEY = process.env.API_KEY || "";

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  if (!API_KEY || token !== API_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

app.post("/v1/ingest", auth, (req, res) => {
  const miners = req.body?.miners || [];

  const stmt = db.prepare(`
    INSERT INTO miners (id, name, last_ts, hashrate_gh, temp_c, uptime_sec)
    VALUES (@id, @name, @ts, @hashrate, @temp, @uptime)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      last_ts = excluded.last_ts,
      hashrate_gh = excluded.hashrate_gh,
      temp_c = excluded.temp_c,
      uptime_sec = excluded.uptime_sec
  `);

  for (const m of miners) {
    stmt.run({
      id: m.id,
      name: m.name,
      ts: m.metrics?.ts || Date.now(),
      hashrate: m.metrics?.hashrateGh ?? null,
      temp: m.metrics?.tempC ?? null,
      uptime: m.metrics?.uptimeSec ?? null
    });
  }

  res.json({ ok: true, count: miners.length });
});

app.get("/v1/miners", (req, res) => {
  const rows = db.prepare("SELECT * FROM miners ORDER BY id").all();
  res.json({ miners: rows });
});

app.get("/", (req, res) => {
  res.send("MinerMonitor server is running.");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("HashWatcher-Lite running on port", PORT);
});
