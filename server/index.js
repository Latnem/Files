import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1024kb" }));

const API_KEY = process.env.API_KEY || "";

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!API_KEY || token !== API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}

// in-memory stores
const minersStore = new Map();
const historyStore = new Map();
const HISTORY_MAX_POINTS = 5000;

function clampHistory(id) {
  const arr = historyStore.get(id) || [];
  if (arr.length > HISTORY_MAX_POINTS) historyStore.set(id, arr.slice(-HISTORY_MAX_POINTS));
}

app.post("/v1/ingest", auth, (req, res) => {
  try {
    const miners = req.body?.miners || [];
    const now = Date.now();

    for (const m of miners) {
      const id = String(m?.id || "").trim();
      if (!id) continue;

      const name = String(m?.name || id);
      const ts = Number(m?.metrics?.ts ?? now);
      const safeTs = Number.isFinite(ts) ? ts : now;

      const metrics = m?.metrics || {};
      minersStore.set(id, { id, name, last_ts: safeTs, metrics });

      const point = { ts: safeTs, ...metrics };
      const arr = historyStore.get(id) || [];
      arr.push(point);
      historyStore.set(id, arr);
      clampHistory(id);
    }

    res.json({ ok: true, count: miners.length });
  } catch (e) {
    console.error("ingest error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

app.get("/v1/miners", (req, res) => {
  const miners = Array.from(minersStore.values())
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => ({
      ...m,
      history: (historyStore.get(m.id) || []).slice(-2000),
    }));

  res.json({ miners });
});

app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MinerMonitor</title>

<style>
/* Palette from your latest image */
:root{
  --bg:#8AA2A2;
  --panel:#438981;
  --panel2:#8AA2A2;
  --ink:#1D2B38;
  --mut:#2C5444;
  --mut2:#1D2B38;
  --line:#2C5444;
  --hash:#1D2B38;
  --temp:#3B576D;
  --btnBg:#8AA2A2;
  --btnBd:#2C5444;
}
[data-theme="dark"]{
  --bg:#1D2B38;
  --panel:#2C5444;
  --panel2:#3B576D;
  --ink:#8AA2A2;
  --mut:#8AA2A2;
  --mut2:#438981;
  --line:#438981;
  --hash:#8AA2A2;
  --temp:#438981;
  --btnBg:#2C5444;
  --btnBd:#438981;
}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui}
</style>
</head>
<body>
<h1 style="padding:16px">MinerMonitor</h1>
<p style="padding:16px">UI loaded successfully.</p>
</body>
</html>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("MinerMonitor running on port", PORT));
