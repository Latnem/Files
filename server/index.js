import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "512kb" }));

// ===== Auth =====
const API_KEY = process.env.API_KEY || "";

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!API_KEY || token !== API_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// ===== In-memory store (resets if service restarts) =====
/**
 * Map: minerId -> {
 *   id, name, last_ts, hashrate_gh, temp_c, uptime_sec
 * }
 */
const minersStore = new Map();

// ===== API: Agent ingest =====
app.post("/v1/ingest", auth, (req, res) => {
  try {
    const miners = req.body?.miners || [];
    const now = Date.now();

    for (const m of miners) {
      const id = String(m?.id || "").trim();
      if (!id) continue;

      const name = String(m?.name || id);
      const ts = Number(m?.metrics?.ts || now);

      const row = {
        id,
        name,
        last_ts: Number.isFinite(ts) ? ts : now,
        hashrate_gh: m?.metrics?.hashrateGh ?? null,
        temp_c: m?.metrics?.tempC ?? null,
        uptime_sec: m?.metrics?.uptimeSec ?? null,
      };

      minersStore.set(id, row);
    }

    res.json({ ok: true, count: miners.length });
  } catch (e) {
    console.error("ingest error:", e);
    res.status(500).json({ error: "server_error" });
  }
});

// ===== API: dashboard data =====
app.get("/v1/miners", (req, res) => {
  const miners = Array.from(minersStore.values()).sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  res.json({ miners });
});

// ===== Web dashboard =====
app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MinerMonitor</title>
  <script>
    async function fetchMiners(){
      const r = await fetch('/v1/miners', { cache: 'no-store' });
      const j = await r.json();
      const el = document.getElementById('grid');
      const miners = j.miners || [];
      const now = Date.now();

      el.innerHTML = miners.map(m => {
        const last = m.last_ts || 0;
        const st = (now - last) < 60000 ? 'online' : 'stale';
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
          </div>\`;
      }).join('');

      if(miners.length === 0){
        el.innerHTML = '<div class="empty">Waiting for agent data…</div>';
      }
    }

    function fmt(v, d){
      if(v === null || v === undefined) return '—';
      if(typeof v === 'number' && Number.isFinite(v)) return v.toFixed(d);
      return v;
    }
    function fmtUptime(s){
      if(!s || !Number.isFinite(Number(s))) return '—';
      s = Number(s);
      const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60);
      return \`\${d}d \${h}h \${m}m\`;
    }
    function timeAgo(ts){
      if(!ts) return '—';
      const diff = Math.max(0, Date.now()-ts);
      const s = Math.floor(diff/1000);
      if(s<60) return s+"s ago";
      const m=Math.floor(s/60); if(m<60) return m+"m ago";
      const h=Math.floor(m/60); if(h<24) return h+"h ago";
      const d=Math.floor(h/24); return d+"d ago";
    }
    function escapeHtml(str){
      return String(str).replace(/[&<>\"']/g, c => ({
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
    .empty{color:var(--mut);padding:18px;border:1px dashed #2a2b3c;border-radius:14px}
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

// ===== Start =====
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("MinerMonitor running on port", PORT);
});
