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
      <option value="hashrate1mGh">Hashrate 1m (GH/s)</option>
      <option value="hashrateGh">Hashrate inst (GH/s)</option>
      <option value="hashrate10mGh">Hashrate 10m (GH/s)</option>
      <option value="hashrate1hGh">Hashrate 1h (GH/s)</option>
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
const state = { miners: [], rangeMs: 2*60*60*1000, chartMetric: "hashrate1mGh" };
const $ = (id)=>document.getElementById(id);

function fmt(v,d=2){ if(v===null||v===undefined) return "—"; if(typeof v==="number"&&Number.isFinite(v)) return v.toFixed(d); return String(v); }
function fmtInt(v){ if(v===null||v===undefined) return "—"; if(typeof v==="number"&&Number.isFinite(v)) return String(Math.round(v)); return String(v); }
function fmtUptime(sec){
  if(!sec || !Number.isFinite(Number(sec))) return "—";
  sec = Number(sec);
  const d=Math.floor(sec/86400), h=Math.floor((sec%86400)/3600), m=Math.floor((sec%3600)/60);
  return \`\${d}d \${h}h \${m}m\`;
}
function timeAgo(ts){
  if(!ts) return "—";
  const diff = Math.max(0, Date.now()-ts);
  const s=Math.floor(diff/1000);
  if(s<60) return s+"s ago";
  const m=Math.floor(s/60); if(m<60) return m+"m ago";
  const h=Math.floor(m/60); if(h<24) return h+"h ago";
  const d=Math.floor(h/24); return d+"d ago";
}
function esc(str){ return String(str).replace(/[&<>\"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function online(ts){ return (Date.now()-(ts||0))<60000; }

function toggles(){
  return {
    hash: $("t_hash").checked,
    temps: $("t_temps").checked,
    fan: $("t_fan").checked,
    power: $("t_power").checked,
    shares: $("t_shares").checked,
    quality: $("t_quality").checked,
    net: $("t_net").checked,
    adv: $("t_adv").checked
  };
}

function row(k,v){ return \`<div class="row"><span class="k">\${k}</span><b>\${v}</b></div>\`; }

function renderCards(){
  const el = $("grid");
  if(!state.miners.length){ el.innerHTML = '<div class="empty">Waiting for agent data…</div>'; return; }

  const t = toggles();
  el.innerHTML = state.miners.map(m=>{
    const x = m.metrics||{};
    const bClass = online(m.last_ts) ? "badge online" : "badge stale";
    const bText  = online(m.last_ts) ? "online" : "stale";

    const rows = [];

    // Core header-ish always useful
    rows.push(row("Uptime", fmtUptime(x.uptimeSec)));
    rows.push(row("Updated", timeAgo(m.last_ts)));

    if(t.hash){
      rows.push(row("Hash inst", \`\${fmt(x.hashrateGh)} GH/s\`));
      rows.push(row("Hash 1m", \`\${fmt(x.hashrate1mGh)} GH/s\`));
      rows.push(row("Hash 10m", \`\${fmt(x.hashrate10mGh)} GH/s\`));
      rows.push(row("Hash 1h", \`\${fmt(x.hashrate1hGh)} GH/s\`));
      rows.push(row("Expected", \`\${fmt(x.expectedHashrateGh)} GH/s\`));
    }

    if(t.temps){
      rows.push(row("CPU temp", \`\${x.cpuTempC ?? "—"} °C\`));
      rows.push(row("ASIC temp", \`\${x.asicTempC ?? "—"} °C\`));
      rows.push(row("VR temp", \`\${x.vrTempC ?? "—"} °C\`));
    }

    if(t.fan){
      rows.push(row("Fan RPM", x.fanRpm ?? "—"));
      rows.push(row("Fan %", x.fanPct ?? "—"));
    }

    if(t.power){
      rows.push(row("Power", x.powerW ?? "—"));
      rows.push(row("Voltage (mV)", x.voltageMv ?? "—"));
      rows.push(row("Current (mA)", x.currentMa ?? "—"));
      rows.push(row("Freq (MHz)", x.frequency ?? "—"));
    }

    if(t.shares){
      rows.push(row("Shares accepted", x.sharesAccepted ?? "—"));
      rows.push(row("Shares rejected", x.sharesRejected ?? "—"));
      rows.push(row("Reject rate", x.rejectRatePct==null ? "—" : (fmt(x.rejectRatePct,2)+" %")));
    }

    if(t.quality){
      rows.push(row("Error %", x.errorPct==null ? "—" : (fmt(x.errorPct,3)+" %")));
      rows.push(row("Best diff", x.bestDiff ?? "—"));
      rows.push(row("Best session diff", x.bestSessionDiff ?? "—"));
      rows.push(row("Pool diff", x.poolDifficulty ?? "—"));
      rows.push(row("Fallback", x.usingFallback ? "Yes" : "No"));
      rows.push(row("Resp (ms)", x.responseTimeMs ?? "—"));
    }

    if(t.net){
      rows.push(row("WiFi RSSI", x.wifiRSSI ?? "—"));
      rows.push(row("AxeOS", x.axeOSVersion ?? "—"));
    }

    // Advanced toggle reserved for sensitive/noisy stuff later (we are intentionally not sending SSID/MAC/IP)
    if(t.adv){
      rows.push(row("Miner ID", esc(m.id)));
    }

    return \`
      <div class="card">
        <div class="top">
          <div class="name">\${esc(m.name||m.id)} <span class="id">(\${esc(m.id)})</span></div>
          <span class="\${bClass}">\${bText}</span>
        </div>
        \${rows.join("")}
      </div>
    \`;
  }).join("");
}

function getSeries(){
  const m = state.miners[0];
  if(!m) return {points:[], label:""};
  const metric = state.chartMetric;
  const cut = Date.now() - state.rangeMs;
  const hist = (m.history||[]).filter(p => (p.ts||0) >= cut);

  const points = hist
    .map(p => ({x:p.ts, y:(p[metric] ?? null)}))
    .filter(p => typeof p.y === "number" && Number.isFinite(p.y));

  return { points, label: metric, minerName: m.name||m.id };
}

function drawChart(){
  const c = $("chart");
  const ctx = c.getContext("2d");
  const cssW = c.clientWidth, cssH = c.clientHeight;
  const dpr = Math.max(1, window.devicePixelRatio||1);
  c.width = Math.floor(cssW*dpr); c.height = Math.floor(cssH*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);

  ctx.clearRect(0,0,cssW,cssH);

  const padL=44,padR=12,padT=12,padB=24;
  const w=cssW-padL-padR, h=cssH-padT-padB;

  ctx.strokeStyle="#232433";
  ctx.strokeRect(padL,padT,w,h);

  const {points, minerName} = getSeries();
  if(points.length < 2){
    ctx.fillStyle="#a0a3b1";
    ctx.fillText("Not enough data yet for chart (wait a minute)...", padL+10, padT+20);
    return;
  }

  const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const yPad=(maxY-minY)*0.1 || 1;
  const loY=minY-yPad, hiY=maxY+yPad;

  const X=(x)=> padL + ((x-minX)/(maxX-minX))*w;
  const Y=(y)=> padT + h - ((y-loY)/(hiY-loY))*h;

  // grid
  ctx.strokeStyle="#1b1c26";
  for(let i=1;i<=3;i++){
    const yy=padT+(h*i/4);
    ctx.beginPath(); ctx.moveTo(padL,yy); ctx.lineTo(padL+w,yy); ctx.stroke();
  }

  // line
  ctx.strokeStyle="#8cf2bc";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(X(points[0].x), Y(points[0].y));
  for(let i=1;i<points.length;i++) ctx.lineTo(X(points[i].x), Y(points[i].y));
  ctx.stroke();

  // labels
  ctx.fillStyle="#e8e8ef";
  ctx.font="12px ui-sans-serif,system-ui";
  ctx.fillText(minerName + " — " + $("metricSelect").selectedOptions[0].text, padL, 12);

  ctx.fillStyle="#a0a3b1";
  ctx.fillText(hiY.toFixed(2), 6, padT+10);
  ctx.fillText(loY.toFixed(2), 6, padT+h);

  const leftTime = new Date(minX).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  const rightTime = new Date(maxX).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  ctx.fillText(leftTime, padL, padT+h+18);
  ctx.fillText(rightTime, padL+w-52, padT+h+18);
}

async function refresh(){
  const r = await fetch("/v1/miners", { cache:"no-store" });
  const j = await r.json();
  state.miners = j.miners || [];
  renderCards();
  drawChart();
}
