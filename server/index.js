import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1024kb" }));

const API_KEY = process.env.API_KEY || "";
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!API_KEY || t !== API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}

const minersStore = new Map();
const historyStore = new Map();
const HISTORY_MAX_POINTS = 4000;

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
      const ts = Number(m?.metrics?.ts || now);
      const safeTs = Number.isFinite(ts) ? ts : now;

      minersStore.set(id, { id, name, last_ts: safeTs, metrics: m?.metrics || {} });

      const point = { ts: safeTs, ...(m?.metrics || {}) };
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
      history: (historyStore.get(m.id) || []).slice(-1200)
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
:root{--bg:#0b0b10;--fg:#e8e8ef;--mut:#a0a3b1;--card:#14151d;--line:#232433;--chip:#1b1c26}
html,body{background:var(--bg);color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;margin:0}
header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-bottom:1px solid var(--line)}
.title{font-weight:800;font-size:16px}
.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.chip{background:var(--chip);border:1px solid var(--line);border-radius:999px;padding:6px 10px;display:flex;gap:10px;align-items:center}
.chip label{display:flex;gap:6px;align-items:center;cursor:pointer;color:var(--fg)}
.chip input{transform:translateY(1px)}
.select{background:#0f1017;border:1px solid var(--line);color:var(--fg);border-radius:10px;padding:6px 10px}
.btn{background:#0f1017;border:1px solid var(--line);color:var(--fg);border-radius:10px;padding:6px 10px;cursor:pointer}
main{padding:16px;display:grid;gap:14px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
.panel h2{margin:0 0 8px 0;font-size:14px}
.small{color:var(--mut);font-size:12px}
#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.top{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}
.name{font-weight:800}
.id{color:var(--mut);font-weight:400}
.badge{padding:2px 8px;border-radius:999px;font-size:12px;border:1px solid #2a2b3c}
.online{background:rgba(29,164,91,.15);color:#8cf2bc;border-color:#1da45b}
.stale{background:rgba(224,168,0,.15);color:#ffe28a;border-color:#e0a800}
.row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px dashed #24263a}
.row:last-child{border-bottom:0}
.k{color:var(--mut)}
canvas{width:100%;height:220px;border-radius:12px;background:#0f1017;border:1px solid var(--line)}
.empty{color:var(--mut);padding:16px;border:1px dashed #2a2b3c;border-radius:14px}
</style>
</head>
<body>
<header>
  <div class="title">MinerMonitor</div>
  <div class="controls">
    <div class="chip">
      <label><input type="checkbox" id="t_hash" checked> Hash</label>
      <label><input type="checkbox" id="t_temps" checked> Temps</label>
      <label><input type="checkbox" id="t_fan" checked> Fan</label>
      <label><input type="checkbox" id="t_power" checked> Power</label>
      <label><input type="checkbox" id="t_shares" checked> Shares</label>
      <label><input type="checkbox" id="t_quality" checked> Quality</label>
      <label><input type="checkbox" id="t_net" checked> Network</label>
      <label><input type="checkbox" id="t_adv"> Advanced</label>
    </div>

    <select id="metricSelect" class="select" title="Chart metric">
      <option value="hashrate1mTh">Hashrate 1m (TH/s)</option>
      <option value="hashrateTh">Hashrate inst (TH/s)</option>
      <option value="hashrate10mTh">Hashrate 10m (TH/s)</option>
      <option value="hashrate1hTh">Hashrate 1h (TH/s)</option>
      <option value="cpuTempC">CPU Temp (°C)</option>
      <option value="asicTempC">ASIC Temp (°C)</option>
      <option value="vrTempC">VR Temp (°C)</option>
      <option value="powerW">Power (W)</option>
      <option value="fanRpm">Fan RPM</option>
      <option value="sharesAccepted">Shares Accepted</option>
      <option value="sharesRejected">Shares Rejected</option>
      <option value="rejectRatePct">Reject Rate (%)</option>
      <option value="errorPct">Error (%)</option>
      <option value="responseTimeMs">Response (ms)</option>
    </select>

    <button class="btn" id="btn2h">2h</button>
    <button class="btn" id="btn6h">6h</button>
    <button class="btn" id="btn24h">24h</button>
  </div>
</header>

<main>
  <div class="panel">
    <h2>Charts</h2>
    <canvas id="chart"></canvas>
  </div>

  <div id="grid"></div>
</main>

<script>
// The rest of the script remains unchanged
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("MinerMonitor running on port", PORT));
