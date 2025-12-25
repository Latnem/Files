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

// in-memory
const minersStore = new Map();   // id -> {id,name,last_ts,metrics}
const historyStore = new Map();  // id -> [{ts, ...metrics}]
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
      history: (historyStore.get(m.id) || []).slice(-1600),
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
      --card:#14151d; --line:#232433;
      --good:#1da45b; --warn:#e0a800;
      --hash:#8cf2bc; --temp:#9fb3ff;
    }
    html,body{background:var(--bg);color:var(--fg);font:14px/1.45 ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;margin:0}
    header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}
    .title{font-weight:800;font-size:18px;letter-spacing:.2px}

    /* centered, not full width */
    .wrap{
      width: min(980px, 92vw);
      margin: 0 auto;
    }

    main{padding:14px 0 18px 0;display:grid;gap:14px}
    .panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
    .panelTitle{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
    .panelTitle h2{margin:0;font-size:14px;font-weight:800}
    .btnRow{display:flex;gap:8px}
    .btn{background:#0f1017;border:1px solid var(--line);color:var(--fg);border-radius:10px;padding:6px 10px;cursor:pointer}
    .btn.active{border-color:#2d9d6e; box-shadow:0 0 0 1px rgba(45,157,110,.25) inset}

    canvas{width:100%;height:260px;border-radius:12px;background:#0f1017;border:1px solid var(--line)}

    /* 2 columns grid like HashWatcher feel */
    #grid{
      display:grid;
      grid-template-columns:repeat(2, minmax(0, 1fr));
      gap:12px;
    }
    @media (max-width: 860px){
      #grid{grid-template-columns:1fr;}
      canvas{height:240px;}
    }

    .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;box-shadow:0 2px 10px rgba(0,0,0,.25)}
    .top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
    .name{font-weight:900}
    .sub{color:var(--mut);font-size:12px;margin-top:2px}
    .badge{padding:2px 8px;border-radius:999px;font-size:12px;border:1px solid #2a2b3c}
    .online{background:rgba(29,164,91,.15);color:#8cf2bc;border-color:#1da45b}
    .stale{background:rgba(224,168,0,.15);color:#ffe28a;border-color:#e0a800}

    .twoCol{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .col{display:flex;flex-direction:column}
    .row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px dashed #24263a}
    .row:last-child{border-bottom:0}
    .k{color:var(--mut)}
    .v{font-weight:800}
    .big{font-size:20px;font-weight:950}
    .hash{color:var(--hash)}
    .temp{color:var(--temp)}
    .okDot{display:inline-block;width:8px;height:8px;border-radius:999px;background:var(--good);margin-right:6px;transform:translateY(-1px)}
    .warnDot{display:inline-block;width:8px;height:8px;border-radius:999px;background:var(--warn);margin-right:6px;transform:translateY(-1px)}
    .empty{color:var(--mut);padding:16px;border:1px dashed #2a2b3c;border-radius:14px}
  </style>
</head>
<body>
  <header>
    <div class="wrap" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div class="title">MinerMonitor</div>
      <div class="btnRow">
        <button class="btn active" id="r2h">2h</button>
        <button class="btn" id="r6h">6h</button>
        <button class="btn" id="r24h">24h</button>
      </div>
    </div>
  </header>

  <div class="wrap">
    <main>
      <div class="panel">
        <div class="panelTitle">
          <h2>Hashrate & Temp</h2>
        </div>
        <canvas id="chart"></canvas>
      </div>

      <div id="grid"></div>
    </main>
  </div>

<script>
  const state = {
    miners: [],
    rangeMs: 2*60*60*1000
  };

  const $ = (id)=>document.getElementById(id);

  // ---- Helpers ----
  function esc(str){
    return String(str).replace(/[&<>\"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function online(lastTs){
    return (Date.now() - (lastTs||0)) < 60000;
  }

  function fmt(v, d=2){
    if(v === null || v === undefined) return "—";
    const n = Number(v);
    if(Number.isFinite(n)) return n.toFixed(d);
    return "—";
  }

  function fmtInt(v){
    if(v === null || v === undefined) return "—";
    const n = Number(v);
    if(Number.isFinite(n)) return String(Math.round(n));
    return "—";
  }

  function fmtUptime(sec){
    const n = Number(sec);
    if(!Number.isFinite(n) || n <= 0) return "—";
    const d=Math.floor(n/86400), h=Math.floor((n%86400)/3600), m=Math.floor((n%3600)/60);
    return \`\${d}d \${h}h \${m}m\`;
  }

  function timeAgo(ts){
    if(!ts) return "—";
    const diff = Math.max(0, Date.now()-ts);
    const s = Math.floor(diff/1000);
    if(s<60) return s+"s";
    const m=Math.floor(s/60); if(m<60) return m+"m";
    const h=Math.floor(m/60); if(h<24) return h+"h";
    const d=Math.floor(h/24); return d+"d";
  }

  // Fix TH/s display:
  // If the value looks like 2442, it is GH/s (from AxeOS) and should be 2.442 TH/s.
  // If it already looks like 2.44, it stays 2.44.
  function toThSmart(v){
    const n = Number(v);
    if(!Number.isFinite(n)) return null;
    // heuristic: anything > 50 is almost certainly in GH/s, not TH/s
    if(n > 50) return n / 1000;
    return n;
  }

  function row(k, vHtml){
    return \`<div class="row"><span class="k">\${k}</span><span class="v">\${vHtml}</span></div>\`;
  }

  // ---- Cards ----
  function renderCards(){
    const el = $("grid");
    if(!state.miners.length){
      el.innerHTML = '<div class="empty">Waiting for agent data…</div>';
      return;
    }

    el.innerHTML = state.miners.map(m => {
      const x = m.metrics || {};
      const isOn = online(m.last_ts);

      const badgeClass = isOn ? "badge online" : "badge stale";
      const dot = isOn ? '<span class="okDot"></span>' : '<span class="warnDot"></span>';
      const badgeText = isOn ? "Mining" : "Stale";

      // IMPORTANT (compact) — like HashWatcher vibe
      const hr1m = toThSmart(x.hashrate1mTh ?? x.hashrate1mGh ?? x.hashrate1m ?? x.hashrate_1m);
      const hrNow = toThSmart(x.hashrateTh ?? x.hashrateGh ?? x.hashrate ?? x.hashRate);
      const cpu = (x.cpuTempC ?? x.tempC ?? x.temp);
      const asic = (x.asicTempC ?? x.temp2C ?? x.temp2);
      const vr = (x.vrTempC ?? x.vrTemp);
      const power = (x.powerW ?? x.power);
      const fan = (x.fanRpm ?? x.fanrpm);
      const acc = (x.sharesAccepted ?? x.accepted ?? x.shares_accepted);
      const rej = (x.sharesRejected ?? x.rejected ?? x.shares_rejected);
      const rejPct = (x.rejectRatePct ?? null);
      const uptime = (x.uptimeSec ?? x.uptimeSeconds ?? x.uptime);

      // 10 lines total (5 left + 5 right)
      const left = [
        row("Hash (1m)", \`<span class="big hash">\${hr1m==null?"—":fmt(hr1m,2)} TH/s</span>\`),
        row("Hash (now)", \`<span class="hash">\${hrNow==null?"—":fmt(hrNow,2)} TH/s</span>\`),
        row("CPU Temp", \`<span class="temp">\${cpu==null?"—":fmt(cpu,1)} °C</span>\`),
        row("ASIC Temp", \`<span class="temp">\${asic==null?"—":fmt(asic,1)} °C</span>\`),
        row("VR Temp", \`<span class="temp">\${vr==null?"—":fmt(vr,1)} °C</span>\`)
      ].join("");

      const right = [
        row("Power", \`\${power==null?"—":fmt(power,1)} W\`),
        row("Fan RPM", \`\${fan==null?"—":fmtInt(fan)}\`),
        row("Accepted", \`\${acc==null?"—":fmtInt(acc)}\`),
        row("Rejected", \`\${rej==null?"—":fmtInt(rej)}\${rejPct==null?"":\` (\${fmt(rejPct,2)}%)\`}\`),
        row("Uptime", \`\${fmtUptime(uptime)} · \${timeAgo(m.last_ts)}\`)
      ].join("");

      return \`
        <div class="card">
          <div class="top">
            <div>
              <div class="name">\${esc(m.name || m.id)}</div>
              <div class="sub">\${esc(m.id)}</div>
            </div>
            <div class="\${badgeClass}">\${dot}\${badgeText}</div>
          </div>
          <div class="twoCol">
            <div class="col">\${left}</div>
            <div class="col">\${right}</div>
          </div>
        </div>
      \`;
    }).join("");
  }

  // ---- Chart (clearer, dual-axis like your screenshot) ----
  function getSeries(){
    const m = state.miners[0];
    if(!m) return { hash: [], temp: [] };

    const cut = Date.now() - state.rangeMs;
    const hist = (m.history || []).filter(p => (p.ts||0) >= cut);

    const hash = [];
    const temp = [];

    for(const p of hist){
      const ts = p.ts;
      const h = toThSmart(p.hashrate1mTh ?? p.hashrateTh ?? p.hashrate1mGh ?? p.hashrateGh);
      const t = (p.asicTempC ?? p.cpuTempC ?? p.temp2 ?? p.temp);
      if(Number.isFinite(ts) && Number.isFinite(h)) hash.push({x:ts, y:h});
      if(Number.isFinite(ts) && Number.isFinite(Number(t))) temp.push({x:ts, y:Number(t)});
    }

    return { hash, temp, name: m.name || m.id };
  }

  function drawChart(){
    const c = $("chart");
    const ctx = c.getContext("2d");

    const cssW = c.clientWidth;
    const cssH = c.clientHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.floor(cssW*dpr);
    c.height = Math.floor(cssH*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);

    ctx.clearRect(0,0,cssW,cssH);

    const padL=54, padR=54, padT=18, padB=28;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;

    // frame
    ctx.strokeStyle = "#232433";
    ctx.strokeRect(padL, padT, w, h);

    const { hash, temp, name } = getSeries();
    if(hash.length < 2){
      ctx.fillStyle = "#a0a3b1";
      ctx.font = "12px ui-sans-serif,system-ui";
      ctx.fillText("Waiting for chart data…", padL+10, padT+24);
      return;
    }

    const xs = hash.map(p=>p.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);

    const hashYs = hash.map(p=>p.y);
    let minH = Math.min(...hashYs), maxH = Math.max(...hashYs);
    const hPad = (maxH-minH)*0.12 || 0.05;
    minH -= hPad; maxH += hPad;

    const tempYs = temp.length ? temp.map(p=>p.y) : [0,1];
    let minT = Math.min(...tempYs), maxT = Math.max(...tempYs);
    const tPad = (maxT-minT)*0.12 || 1;
    minT -= tPad; maxT += tPad;

    const X = (x)=> padL + ((x-minX)/(maxX-minX))*w;
    const YH = (y)=> padT + h - ((y-minH)/(maxH-minH))*h;
    const YT = (y)=> padT + h - ((y-minT)/(maxT-minT))*h;

    // grid (more clear)
    ctx.strokeStyle = "#1b1c26";
    for(let i=1;i<=5;i++){
      const yy = padT + (h*i/6);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL+w, yy); ctx.stroke();
    }

    // hashrate area + line
    ctx.beginPath();
    ctx.moveTo(X(hash[0].x), YH(hash[0].y));
    for(let i=1;i<hash.length;i++) ctx.lineTo(X(hash[i].x), YH(hash[i].y));
    ctx.strokeStyle = "#8cf2bc";
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.lineTo(X(hash[hash.length-1].x), padT+h);
    ctx.lineTo(X(hash[0].x), padT+h);
    ctx.closePath();
    ctx.fillStyle = "rgba(140,242,188,0.14)";
    ctx.fill();

    // temp line (right axis)
    if(temp.length >= 2){
      ctx.beginPath();
      ctx.moveTo(X(temp[0].x), YT(temp[0].y));
      for(let i=1;i<temp.length;i++) ctx.lineTo(X(temp[i].x), YT(temp[i].y));
      ctx.strokeStyle = "#9fb3ff";
      ctx.lineWidth = 2.0;
      ctx.stroke();
    }

    // labels
    ctx.font = "12px ui-sans-serif,system-ui";
    ctx.fillStyle = "#e8e8ef";
    ctx.fillText(name, padL, 14);

    // left axis (hash)
    ctx.fillStyle = "#8cf2bc";
    ctx.fillText(maxH.toFixed(2), 8, padT+12);
    ctx.fillText(minH.toFixed(2), 8, padT+h);

    // right axis (temp)
    ctx.fillStyle = "#9fb3ff";
    ctx.fillText(maxT.toFixed(0)+"°", padL+w+10, padT+12);
    ctx.fillText(minT.toFixed(0)+"°", padL+w+10, padT+h);

    // time labels
    ctx.fillStyle = "#a0a3b1";
    const leftTime = new Date(minX).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const rightTime = new Date(maxX).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    ctx.fillText(leftTime, padL, padT+h+20);
    ctx.fillText(rightTime, padL+w-54, padT+h+20);
  }

  async function refresh(){
    const r = await fetch("/v1/miners", { cache: "no-store" });
    const j = await r.json();
    state.miners = j.miners || [];
    renderCards();
    drawChart();
  }

  function setRange(ms){
    state.rangeMs = ms;
    $("r2h").classList.toggle("active", ms === 2*60*60*1000);
    $("r6h").classList.toggle("active", ms === 6*60*60*1000);
    $("r24h").classList.toggle("active", ms === 24*60*60*1000);
    drawChart();
  }

  $("r2h").addEventListener("click", ()=>setRange(2*60*60*1000));
  $("r6h").addEventListener("click", ()=>setRange(6*60*60*1000));
  $("r24h").addEventListener("click", ()=>setRange(24*60*60*1000));

  window.addEventListener("resize", drawChart);

  setInterval(refresh, 5000);
  refresh();
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("MinerMonitor running on port", PORT));
