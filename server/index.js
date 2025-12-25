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
  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MinerMonitor</title>
  <script>
    async function fetchMiners(){
      const r = await fetch('/v1/miners');
      const j = await r.json();
      const el = document.getElementById('grid');
      el.innerHTML = (j.miners || []).map(m => {
        const st = Date.now() - (m.last_ts||0) < 60000 ? 'online' : 'stale';
        return \`
          <div class="card">
            <div class="top">
              <div class="name">\${escapeHtml(m.name || m.id)} <span class="id">(\${escapeHtml(m.id)})</span></div>
              <span class="badge \${st}">\${st}</span>
            </div>
            <div class="row"><span>Hashrate</span><b>\${fmt(m.hashrate_gh, 2)} GH/s</b></div>
            <div class="row"><span>Temp</span><b>\${m.temp_c ?? '—'} °C</b></div>
            <div class="row"><span>Uptime</span><b>\${fmtUptime(m.uptime_sec)}</b></div>
            <div class="foot">Updated \${timeAgo(m.last_ts)}</div>
          </div>\`
      }).join('');
    }

    function fmt(v, d){
      if(v === null || v === undefined) return '—';
      if(typeof v === 'number' && Number.isFinite(v)) return v.toFixed(d);
      return v;
    }
    function fmtUptime(s){
      if(!s) return '—';
      const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60);
      return \`\${d}d \${h}h \${m}m\`;
    }
    function timeAgo(ts){
      if(!ts) return '—';
      const diff = Math.max(0, Date.now()-ts); const s = Math.floor(diff/1000);
      if(s<60) return s+"s ago";
      const m=Math.floor(s/60); if(m<60) return m+"m ago";
      const h=Math.floor(m/60); if(h<24) return h+"h ago";
      const d=Math.floor(h/24); return d+"d ago";
    }
    function escapeHtml(str){
      return String(str).replace(/[&<>\\"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[c]));
    }

    setInterval(fetchMiners, 5000);
    window.onload = fetchMiners;
  </script>
  <style>
    :root { --bg:#0b0b10; --fg:#e8e8ef; --mut:#a0a3b1; --card:#14151d; }
    html,body{background:var(--bg);color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;padding:0;margin:0}
    header{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #232433}
    header .title{font-weight:700;font-size:16px}
    header .sub{color:var(--mut)}
    #grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;padding:16px}
    .card{background:var(--card);border:1px solid #232433;border-radius:14px;padding:12px;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
    .name{font-weight:600}
    .id{color:var(--mut);font-weight:400}
    .badge{padding:2px 8px;border-radius:999px;font-size:12px;border:1px solid #2a2b3c}
    .badge.online{background:rgba(29,164,91,.15);color:#8cf2bc;border-color:#1da45b}
    .badge.stale{background:rgba(224,168,0,.15);color:#ffe28a;border-color:#e0a800}
    .row{display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #24263a}
    .row:last-of-type{border-bottom:0}
    .foot{margin-top:8px;color:var(--mut)}
  </style>
</head>
<body>
  <header>
    <div class="title">MinerMonitor</div>
    <div class="sub">Secure remote monitor • no port-forward</div>
  </header>
  <main>
    <div id="grid"></div>
  </main>
</body>
</html>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("HashWatcher-Lite running on port", PORT);
});
