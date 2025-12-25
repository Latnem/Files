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

// In-memory store (resets on service restart)
// miners: latest snapshot
// history: small time-series for charts
const minersStore = new Map();   // id -> latest row
const historyStore = new Map();  // id -> [{ts, metrics...}, ...]

const HISTORY_MAX_POINTS = 2000; // per miner (adjust as you like)

function clampHistory(id) {
  const arr = historyStore.get(id) || [];
  if (arr.length > HISTORY_MAX_POINTS) {
    historyStore.set(id, arr.slice(arr.length - HISTORY_MAX_POINTS));
  }
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

      // Latest snapshot (what cards show)
      const latest = {
        id,
        name,
        last_ts: safeTs,
        // keep full metrics blob
        metrics: m?.metrics || {}
      };
      minersStore.set(id, latest);

      // History point for charts
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

// Latest miners + limited history (last N points) so UI can chart
app.get("/v1/miners", (req, res) => {
  const miners = Array.from(minersStore.values())
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => ({
      ...m,
      history: (historyStore.get(m.id) || []).slice(-600) // send last ~600 points to browser
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
    :root{
      --bg:#0b0b10; --fg:#e8e8ef; --mut:#a0a3b1;
      --card:#14151d; --line:#232433; --chip:#1b1c26;
    }
    html,body{background:var(--bg);color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;margin:0}
    header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line)}
    .title{font-weight:800;font-size:16px}
    .controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .chip{background:var(--chip);border:1px solid var(--line);border-radius:999px;padding:6px 10px;display:flex;gap:8px;align-items:center}
    .chip label{display:flex;gap:6px;align-items:center;color:var(--fg);cursor:pointer}
    .chip input{transform:translateY(1px)}
    main{padding:16px;display:grid;gap:14px}
    .panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
    .panel h2{margin:0 0 8px 0;font-size:14px}
    #grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
    .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .top{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}
    .name{font-weight:700}
    .id{color:var(--mut);font-weight:400}
    .badge{padding:2px 8px;border-radius:999px;font-size:12px;border:1px solid #2a2b3c}
    .online{background:rgba(29,164,91,.15);color:#8cf2bc;border-color:#1da45b}
    .stale{background:rgba(224,168,0,.15);color:#ffe28a;border-color:#e0a800}
    .row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px dashed #24263a}
    .row:last-child{border-bottom:0}
    .k{color:var(--mut)}
    canvas{width:100%;height:220px;border-radius:12px;background:#0f1017;border:1px solid var(--line)}
    .small{color:var(--mut);font-size:12px}
    .empty{color:var(--mut);padding:16px;border:1px dashed #2a2b3c;border-radius:14px}
    .select{background:#0f1017;border:1px solid var(--line);color:var(--fg);border-radius:10px;padding:6px 10px}
    .btn{background:#0f1017;border:1px solid var(--line);color:var(--fg);border-radius:10px;padding:6px 10px;cursor:pointer}
  </style>
</head>
<body>
  <header>
    <div class="title">MinerMonitor</div>

    <div class="controls">
      <div class="chip">
        <label><input type="checkbox" id="t_hash_inst" checked> Hash (inst)</label>
        <label><input type="checkbox" id="t_hash_1m" checked> 1m</label>
        <label><input type="checkbox" id="t_hash_10m"> 10m</label>
        <label><input type="checkbox" id="t_hash_1h"> 1h</label>
      </div>

      <div class="chip">
        <label><input type="checkbox" id="t_temp" checked> Temp</label>
        <label><input type="checkbox" id="t_uptime" checked> Uptime</label>
        <label><input type="checkbox" id="t_power"> Power</label>
        <label><input type="checkbox" id="t_fan"> Fan</label>
      </div>

      <select id="metricSelect" class="select" title="Chart metric">
        <option value="hashrateGh">Hashrate (inst) GH/s</option>
        <option value="hashrate1mGh">Hashrate 1m GH/s</option>
        <option value="hashrate10mGh">Hashrate 10m GH/s</option>
        <option value="hashrate1hGh">Hashrate 1h GH/s</option>
        <option value="tempC">Temp °C</option>
        <option value="powerW">Power W</option>
        <option value="fanRpm">Fan RPM</option>
        <option value="sharesAccepted">Shares Accepted</option>
        <option value="sharesRejected">Shares Rejected</option>
      </select>

      <button class="btn" id="btnNow">Last 2h</button>
      <button class="btn" id="btn6h">Last 6h</button>
      <button class="btn" id="btn24h">Last 24h</button>
    </div>
  </header>

  <main>
    <div class="panel">
      <h2>Charts</h2>
      <div class="small">Tip: Use the dropdown to choose what the chart shows. Use buttons for range.</div>
      <canvas id="chart"></canvas>
    </div>

    <div id="grid"></div>
  </main>

<script>
  const state = {
    miners: [],
    rangeMs: 2 * 60 * 60 * 1000, // default 2h
    chartMetric: "hashrateGh"
  };

  function $(id){ return document.getElementById(id); }

  function fmt(v, d=2){
    if(v === null || v === undefined) return "—";
    if(typeof v === "number" && Number.isFinite(v)) return v.toFixed(d);
    return String(v);
  }

  function fmtUptime(sec){
    if(!sec || !Number.isFinite(Number(sec))) return "—";
    sec = Number(sec);
    const d=Math.floor(sec/86400), h=Math.floor((sec%86400)/3600), m=Math.floor((sec%3600)/60);
    return \`\${d}d \${h}h \${m}m\`;
  }

  function timeAgo(ts){
    if(!ts) return "—";
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

  function isOnline(lastTs){
    return (Date.now() - (lastTs||0)) < 60000;
  }

  function toggles(){
    return {
      hash_inst: $("t_hash_inst").checked,
      hash_1m: $("t_hash_1m").checked,
      hash_10m: $("t_hash_10m").checked,
      hash_1h: $("t_hash_1h").checked,
      temp: $("t_temp").checked,
      uptime: $("t_uptime").checked,
      power: $("t_power").checked,
      fan: $("t_fan").checked
    };
  }

  function renderCards(){
    const el = $("grid");
    const t = toggles();
    if(!state.miners.length){
      el.innerHTML = '<div class="empty">Waiting for agent data…</div>';
      return;
    }

    el.innerHTML = state.miners.map(m => {
      const online = isOnline(m.last_ts);
      const badgeClass = online ? "badge online" : "badge stale";
      const badgeText = online ? "online" : "stale";
      const x = m.metrics || {};

      const rows = [];

      if(t.hash_inst) rows.push(\`<div class="row"><span class="k">Hashrate (inst)</span><b>\${fmt(x.hashrateGh)} GH/s</b></div>\`);
      if(t.hash_1m) rows.push(\`<div class="row"><span class="k">Hashrate (1m)</span><b>\${fmt(x.hashrate1mGh)} GH/s</b></div>\`);
      if(t.hash_10m) rows.push(\`<div class="row"><span class="k">Hashrate (10m)</span><b>\${fmt(x.hashrate10mGh)} GH/s</b></div>\`);
      if(t.hash_1h) rows.push(\`<div class="row"><span class="k">Hashrate (1h)</span><b>\${fmt(x.hashrate1hGh)} GH/s</b></div>\`);

      if(t.temp) rows.push(\`<div class="row"><span class="k">Temp</span><b>\${x.tempC ?? "—"} °C</b></div>\`);
      if(t.uptime) rows.push(\`<div class="row"><span class="k">Uptime</span><b>\${fmtUptime(x.uptimeSec)}</b></div>\`);
      if(t.power) rows.push(\`<div class="row"><span class="k">Power</span><b>\${x.powerW ?? "—"} W</b></div>\`);
      if(t.fan) rows.push(\`<div class="row"><span class="k">Fan</span><b>\${x.fanRpm ?? "—"} RPM</b></div>\`);

      return \`
        <div class="card">
          <div class="top">
            <div class="name">\${escapeHtml(m.name || m.id)} <span class="id">(\${escapeHtml(m.id)})</span></div>
            <span class="\${badgeClass}">\${badgeText}</span>
          </div>
          \${rows.join("")}
          <div class="small">Updated \${timeAgo(m.last_ts)}</div>
        </div>
      \`;
    }).join("");
  }

  function getChartSeries(){
    // For now: chart the FIRST miner (simple). Later we can add a dropdown for miner selection.
    const m = state.miners[0];
    if(!m) return { points: [], label: "" };

    const metric = state.chartMetric;
    const label = metric;

    const cut = Date.now() - state.rangeMs;
    const hist = (m.history || []).filter(p => (p.ts||0) >= cut);

    // points: [ {x:ts, y:value} ]
    const points = hist
      .map(p => ({ x: p.ts, y: (p[metric] ?? null) }))
      .filter(p => typeof p.y === "number" && Number.isFinite(p.y));

    return { points, label, minerName: m.name || m.id };
  }

  function drawChart(){
    const canvas = $("chart");
    const ctx = canvas.getContext("2d");

    // Handle HiDPI
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0,0,cssW,cssH);

    const { points, minerName } = getChartSeries();
    // axes padding
    const padL = 44, padR = 12, padT = 12, padB = 24;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;

    // Frame
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#232433";
    ctx.strokeRect(padL, padT, w, h);

    if(points.length < 2){
      ctx.fillStyle = "#a0a3b1";
      ctx.fillText("Not enough data yet for chart (wait a minute)...", padL+10, padT+20);
      return;
    }

    const xs = points.map(p=>p.x);
    const ys = points.map(p=>p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const yPad = (maxY - minY) * 0.1 || 1;
    const loY = minY - yPad, hiY = maxY + yPad;

    const X = (x)=> padL + ((x-minX)/(maxX-minX))*w;
    const Y = (y)=> padT + h - ((y-loY)/(hiY-loY))*h;

    // Gridlines (simple)
    ctx.strokeStyle = "#1b1c26";
    for(let i=1;i<=3;i++){
      const yy = padT + (h*i/4);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL+w, yy); ctx.stroke();
    }

    // Line
    ctx.strokeStyle = "#8cf2bc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(points[0].x), Y(points[0].y));
    for(let i=1;i<points.length;i++){
      ctx.lineTo(X(points[i].x), Y(points[i].y));
    }
    ctx.stroke();

    // Labels
    ctx.fillStyle = "#e8e8ef";
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillText(minerName + " — " + $("metricSelect").selectedOptions[0].text, padL, 12);

    ctx.fillStyle = "#a0a3b1";
    ctx.fillText(hiY.toFixed(2), 6, padT+10);
    ctx.fillText(loY.toFixed(2), 6, padT+h);

    // Time labels
    const leftTime = new Date(minX).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const rightTime = new Date(maxX).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    ctx.fillText(leftTime, padL, padT+h+18);
    ctx.fillText(rightTime, padL+w-52, padT+h+18);
  }

  async function refresh(){
    const r = await fetch("/v1/miners", { cache: "no-store" });
    const j = await r.json();
    state.miners = j.miners || [];
    renderCards();
    drawChart();
  }

  // Wire UI
  ["t_hash_inst","t_hash_1m","t_hash_10m","t_hash_1h","t_temp","t_uptime","t_power","t_fan"]
    .forEach(id => $(id).addEventListener("change", renderCards));

  $("metricSelect").addEventListener("change", () => {
    state.chartMetric = $("metricSelect").value;
    drawChart();
  });

  $("btnNow").addEventListener("click", () => { state.rangeMs = 2*60*60*1000; drawChart(); });
  $("btn6h").addEventListener("click", () => { state.rangeMs = 6*60*60*1000; drawChart(); });
  $("btn24h").addEventListener("click", () => { state.rangeMs = 24*60*60*1000; drawChart(); });

  window.addEventListener("resize", drawChart);

  setInterval(refresh, 5000);
  refresh();
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("MinerMonitor running on port", PORT));
