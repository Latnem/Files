import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1024kb" }));

// Set this in Render/Env: API_KEY=<your secret>
const API_KEY = process.env.API_KEY || "";

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!API_KEY || token !== API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}

// In-memory stores (simple + fast)
const minersStore = new Map();   // id -> {id,name,last_ts,metrics}
const historyStore = new Map();  // id -> [{ts, ...metrics}]
const HISTORY_MAX_POINTS = 6000;

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
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
    .map((m) => ({
      ...m,
      history: (historyStore.get(m.id) || []).slice(-2500),
    }));

  res.json({ miners });
});

app.get("/healthz", (req, res) => res.type("text").send("ok"));

app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MinerMonitor</title>

<style>
  /* Palette (from your screenshot)
     Teal:       #438981
     Dark green: #2C5444
     Navy:       #1D2B38
     Slate:      #3B576D
     Light:      #8AA2A2
  */

  :root{
    --c1:#438981;
    --c2:#2C5444;
    --c3:#1D2B38;
    --c4:#3B576D;
    --c5:#8AA2A2;

    /* Light theme defaults (clean + readable) */
    --bg: #F6FAFA;
    --panel: #FFFFFF;
    --panel2: #F1F7F7;
    --ink: var(--c3);
    --mut: var(--c2);
    --mut2: var(--c4);
    --line: rgba(29,43,56,.16);

    --accent: var(--c1);
    --accent2: var(--c2);

    --hashLine: var(--c1);
    --hashFill: rgba(67,137,129,.16);
    --tempLine: var(--c2);

    --ok: var(--c2);
    --warn: var(--c4);

    --btnBg: #FFFFFF;
    --btnBd: rgba(29,43,56,.18);

    --shadow: 0 10px 26px rgba(29,43,56,.10);
  }

  [data-theme="dark"]{
    --bg: #0E141B;
    --panel: #121E28;
    --panel2: #0F1A22;
    --ink: #E7F0F0;
    --mut: #CFE0E0;
    --mut2: var(--c5);
    --line: rgba(138,162,162,.18);

    --accent: var(--c1);
    --accent2: var(--c5);

    --hashLine: var(--c5);
    --hashFill: rgba(138,162,162,.16);
    --tempLine: var(--c1);

    --ok: var(--c5);
    --warn: var(--c1);

    --btnBg: #121E28;
    --btnBd: rgba(138,162,162,.22);

    --shadow: 0 12px 28px rgba(0,0,0,.50);
  }

  html,body{
    margin:0;
    background:var(--bg);
    color:var(--ink);
    font:14px/1.4 ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;
  }

  header{
    position:sticky; top:0; z-index:20;
    background: color-mix(in oklab, var(--bg), #fff 8%);
    border-bottom:1px solid var(--line);
    backdrop-filter: blur(6px);
  }

  .wrap{
    width:min(940px, 92vw);
    margin:0 auto;
  }

  .head{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    padding:14px 8px;
  }

  .brand{
    font-size:22px;
    font-weight:1000;
    letter-spacing:.2px;
  }
  .brand .mark{ color: var(--accent); }

  .headRight{
    display:flex;
    align-items:center;
    gap:8px;
    flex-wrap:wrap;
    justify-content:flex-end;
  }

  .btn{
    background:var(--btnBg);
    border:1px solid var(--btnBd);
    color:var(--ink);
    border-radius:12px;
    padding:7px 10px;
    cursor:pointer;
    font-weight:900;
  }
  .btn.active{
    border-color: color-mix(in oklab, var(--accent), var(--btnBd) 35%);
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent), transparent 82%) inset;
  }

  main{
    padding:14px 0 22px 0;
    display:grid;
    gap:14px;
  }

  .topStats{
    display:grid;
    grid-template-columns:repeat(3, minmax(0, 1fr));
    gap:10px;
  }
  @media (max-width: 860px){
    .topStats{grid-template-columns:1fr;}
  }

  .stat{
    background:var(--panel);
    border:1px solid var(--line);
    border-radius:16px;
    padding:12px;
    box-shadow:var(--shadow);
  }
  .stat .k{color:var(--mut2); font-weight:950; font-size:12px; letter-spacing:.2px}
  .stat .v{font-size:20px; font-weight:1000; margin-top:6px}
  .stat .s{color:var(--mut2); margin-top:4px; font-weight:850; font-size:12px}

  .panelBox{
    background:var(--panel);
    border:1px solid var(--line);
    border-radius:16px;
    padding:12px;
    box-shadow:var(--shadow);
  }
  .panelTitle{
    display:flex;
    align-items:center;
    justify-content:space-between;
    margin-bottom:10px;
  }
  .panelTitle h2{
    margin:0;
    font-size:12px;
    font-weight:1000;
    color:var(--mut2);
    letter-spacing:.22px;
    text-transform:uppercase;
  }

  canvas{
    width:100%;
    height:280px;
    border-radius:14px;
    border:1px solid var(--line);
    background:var(--panel2);
  }
  @media (max-width: 860px){
    canvas{height:240px;}
  }

  #grid{
    display:grid;
    grid-template-columns:repeat(2, minmax(0, 1fr));
    gap:12px;
  }
  @media (max-width: 860px){
    #grid{grid-template-columns:1fr;}
  }

  .card{
    background:var(--panel);
    border:1px solid var(--line);
    border-radius:16px;
    padding:12px;
    box-shadow:var(--shadow);
  }

  .cardTop{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:10px;
    margin-bottom:10px;
  }

  .minerName{
    font-weight:1000;
    font-size:15px;
  }
  .minerSub{
    margin-top:3px;
    font-size:12px;
    color:var(--mut2);
    font-weight:850;
  }

  .badge{
    border:1px solid var(--line);
    background: color-mix(in oklab, var(--panel2), transparent 10%);
    border-radius:999px;
    padding:3px 9px;
    font-size:12px;
    font-weight:950;
    white-space:nowrap;
  }

  .dot{
    width:8px;height:8px;border-radius:999px;display:inline-block;margin-right:6px;transform:translateY(-1px)
  }
  .dotOk{background:var(--ok)}
  .dotWarn{background:var(--warn)}

  .hero{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:10px;
    padding:10px;
    border-radius:14px;
    background:var(--panel2);
    border:1px solid var(--line);
    margin-bottom:10px;
  }
  .hero .hk{color:var(--mut2);font-weight:1000;font-size:12px}
  .hero .hv{font-weight:1000;font-size:22px;margin-top:4px}
  .hashNum{color:var(--accent2)}
  .tempNum{color:var(--accent)}

  .twoCol{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:12px;
  }
  .col{display:flex;flex-direction:column}

  .row{
    display:flex;
    justify-content:space-between;
    gap:12px;
    padding:6px 0;
    border-bottom:1px dashed color-mix(in oklab, var(--line), transparent 35%);
  }
  .row:last-child{border-bottom:0}
  .k{color:var(--mut2); font-weight:900}
  .v{font-weight:1000; text-align:right}
  .v.mono{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}

  .empty{
    color:var(--mut2);
    padding:16px;
    border:1px dashed var(--line);
    border-radius:16px;
    background:var(--panel);
  }
</style>
</head>

<body>
<header>
  <div class="wrap">
    <div class="head">
      <div class="brand">Miner<span class="mark">Monitor</span></div>
      <div class="headRight">
        <button class="btn active" id="r2h">2h</button>
        <button class="btn" id="r6h">6h</button>
        <button class="btn" id="r24h">24h</button>
        <button class="btn" id="themeBtn" title="Toggle theme">Dark</button>
      </div>
    </div>
  </div>
</header>

<div class="wrap">
  <main>
    <div class="topStats">
      <div class="stat">
        <div class="k">Total Hash</div>
        <div class="v" id="sumHash">—</div>
        <div class="s" id="sumHashSub">—</div>
      </div>
      <div class="stat">
        <div class="k">Shares</div>
        <div class="v" id="sumShares">—</div>
        <div class="s" id="sumSharesSub">—</div>
      </div>
      <div class="stat">
        <div class="k">Avg Temp</div>
        <div class="v" id="avgTemp">—</div>
        <div class="s" id="avgTempSub">—</div>
      </div>
    </div>

    <div class="panelBox">
      <div class="panelTitle"><h2>Hashrate (TH/s) + ASIC Temp (°C)</h2></div>
      <canvas id="chart"></canvas>
    </div>

    <div id="grid"></div>
  </main>
</div>

<script>
  const state = { miners: [], rangeMs: 2*60*60*1000 };
  const $ = (id)=>document.getElementById(id);

  function esc(str){
    return String(str).replace(/[&<>\"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function online(lastTs){ return (Date.now() - (lastTs||0)) < 60000; }

  function fmt(v, d=2){
    const n = Number(v);
    if(!Number.isFinite(n)) return "—";
    return n.toFixed(d);
  }
  function fmtInt(v){
    const n = Number(v);
    if(!Number.isFinite(n)) return "—";
    return String(Math.round(n));
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
  function safeNum(v){
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function shortUser(u){
    if(!u) return null;
    const s = String(u);
    if(s.length <= 12) return s;
    return s.slice(0,6) + "…" + s.slice(-4);
  }
  function row(k, vHtml, mono=false){
    return \`<div class="row"><span class="k">\${k}</span><span class="v \${mono ? "mono":""}">\${vHtml}</span></div>\`;
  }
  function computeEfficiencyJTH(powerW, hashrateTh){
    const p = safeNum(powerW);
    const h = safeNum(hashrateTh);
    if(p == null || h == null || h <= 0) return null;
    return p / h; // W/TH == J/TH
  }

  function renderTopSummary(){
    const miners = state.miners || [];
    if(!miners.length){
      $("sumHash").textContent = "—";
      $("sumHashSub").textContent = "—";
      $("sumShares").textContent = "—";
      $("sumSharesSub").textContent = "—";
      $("avgTemp").textContent = "—";
      $("avgTempSub").textContent = "—";
      return;
    }

    let totalHash = 0;
    let onlineCount = 0;
    let acc = 0, rej = 0;
    let tempSum = 0, tempCount = 0;

    for(const m of miners){
      const x = m.metrics || {};
      const on = online(m.last_ts);
      if(on) onlineCount++;

      const useH = safeNum(x.hashrate1mTh ?? x.hashrateTh);
      if(useH != null) totalHash += useH;

      const a = safeNum(x.sharesAccepted);
      const r = safeNum(x.sharesRejected);
      if(a != null) acc += a;
      if(r != null) rej += r;

      const t = safeNum(x.asicTempC ?? x.cpuTempC);
      if(t != null){ tempSum += t; tempCount++; }
    }

    $("sumHash").textContent = (Number.isFinite(totalHash) ? totalHash.toFixed(2) : "—") + " TH/s";
    $("sumHashSub").textContent = onlineCount + " online · " + miners.length + " total";

    $("sumShares").textContent = (acc + rej).toLocaleString();
    $("sumSharesSub").textContent = "Accepted " + acc.toLocaleString() + " · Rejected " + rej.toLocaleString();

    const avg = (tempCount ? (tempSum/tempCount) : null);
    $("avgTemp").textContent = (avg==null ? "—" : avg.toFixed(0) + "°C");
    $("avgTempSub").textContent = "from " + tempCount + " miners";
  }

  function renderCards(){
    const el = document.getElementById("grid");
    const miners = state.miners || [];
    if(!miners.length){
      el.innerHTML = '<div class="empty">Waiting for agent data…</div>';
      return;
    }

    el.innerHTML = miners.map(m => {
      const x = m.metrics || {};
      const isOn = online(m.last_ts);

      const dot = isOn ? '<span class="dot dotOk"></span>' : '<span class="dot dotWarn"></span>';
      const badgeText = isOn ? "Mining" : "Stale";

      const hr1m = x.hashrate1mTh ?? null;
      const hr10m = x.hashrate10mTh ?? null;
      const hr1h  = x.hashrate1hTh ?? null;
      const hrNow = x.hashrateTh ?? null;

      const chip = x.asicTempC ?? null;
      const cpu  = x.cpuTempC ?? null;

      const power = x.powerW ?? null;
      const fanRpm = x.fanRpm ?? null;

      const accepted = x.sharesAccepted ?? null;
      const rejected = x.sharesRejected ?? null;

      const bestDiff = x.bestDiff ?? null;
      const uptime = x.uptimeSec ?? null;

      const poolUrl  = x.stratumURL ?? null;
      const poolPort = x.stratumPort ?? null;
      const poolUser = x.stratumUser ?? null;

      const ip = x.ipv4 ?? null;

      const heroHash = (hr1m ?? hrNow);
      const heroTemp = (chip ?? cpu);
      const eff = x.efficiencyJTH ?? computeEfficiencyJTH(power, heroHash);

      // 10 rows total (5 per column)
      const left = [
        row("Hash (10m)", hr10m==null ? "—" : (fmt(hr10m,2) + " TH/s")),
        row("Hash (1h)",  hr1h==null ? "—" : (fmt(hr1h,2) + " TH/s")),
        row("Power",      power==null ? "—" : (fmt(power,1) + " W")),
        row("Fan RPM",    fanRpm==null ? "—" : fmtInt(fanRpm)),
        row("Uptime",     fmtUptime(uptime))
      ].join("");

      const right = [
        row("Accepted", accepted==null ? "—" : fmtInt(accepted)),
        row("Rejected", rejected==null ? "—" : fmtInt(rejected)),
        row("Efficiency", eff==null ? "—" : (fmt(eff,2) + " J/TH")),
        row("Best Diff", bestDiff==null ? "—" : fmtInt(bestDiff)),
        row("Last Seen", timeAgo(m.last_ts))
      ].join("");

      // extra rows (only if present) – still clean (no "Details" label)
      const extra = [];
      if(poolUrl) extra.push(row("Pool Host", esc(poolUrl), true));
      if(poolPort != null) extra.push(row("Pool Port", fmtInt(poolPort)));
      if(poolUser) extra.push(row("Pool User", esc(shortUser(poolUser)), true));
      const extraHtml = extra.length ? `<div class="twoCol" style="margin-top:10px">
        <div class="col">${extra.slice(0,2).join("")}</div>
        <div class="col">${extra.slice(2).join("")}</div>
      </div>` : "";

      return `
        <div class="card">
          <div class="cardTop">
            <div>
              <div class="minerName">${esc(m.name || m.id)}</div>
              <div class="minerSub">${esc(m.id)}${ip ? " · " + esc(ip) : ""}</div>
            </div>
            <div class="badge">${dot}${badgeText}</div>
          </div>

          <div class="hero">
            <div>
              <div class="hk">Real Hashrate</div>
              <div class="hv hashNum">${heroHash==null ? "—" : fmt(heroHash,2)} TH/s</div>
            </div>
            <div>
              <div class="hk">Chip Temperature</div>
              <div class="hv tempNum">${heroTemp==null ? "—" : fmt(heroTemp,1)} °C</div>
            </div>
          </div>

          <div class="twoCol">
            <div class="col">${left}</div>
            <div class="col">${right}</div>
          </div>

          ${extraHtml}
        </div>
      `;
    }).join("");
  }

  function getSeries(){
    const m = state.miners[0];
    if(!m) return { hash: [], temp: [], name: "" };

    const cut = Date.now() - state.rangeMs;
    const hist = (m.history || []).filter(p => (p.ts||0) >= cut);

    const hash = [];
    const temp = [];

    for(const p of hist){
      const ts = p.ts;
      const h = safeNum(p.hashrate1mTh ?? p.hashrateTh);
      const t = safeNum(p.asicTempC ?? p.cpuTempC);
      if(Number.isFinite(ts) && Number.isFinite(h)) hash.push({x:ts, y:h});
      if(Number.isFinite(ts) && Number.isFinite(t)) temp.push({x:ts, y:t});
    }
    return { hash, temp, name: m.name || m.id };
  }

  function drawChart(){
    const c = document.getElementById("chart");
    const ctx = c.getContext("2d");

    const cssW = c.clientWidth;
    const cssH = c.clientHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.floor(cssW*dpr);
    c.height = Math.floor(cssH*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);

    ctx.clearRect(0,0,cssW,cssH);

    const padL=56, padR=56, padT=18, padB=28;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;

    const css = getComputedStyle(document.documentElement);
    const line = css.getPropertyValue("--line").trim();
    const hashLine = css.getPropertyValue("--hashLine").trim();
    const hashFill = css.getPropertyValue("--hashFill").trim();
    const tempLine = css.getPropertyValue("--tempLine").trim();
    const ink = css.getPropertyValue("--ink").trim();
    const mut2 = css.getPropertyValue("--mut2").trim();

    // frame
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, w, h);

    const { hash, temp, name } = getSeries();
    if(hash.length < 2){
      ctx.fillStyle = mut2;
      ctx.font = "12px ui-sans-serif,system-ui";
      ctx.fillText("Waiting for chart data…", padL+10, padT+24);
      return;
    }

    const xs = hash.map(p=>p.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);

    const hashYs = hash.map(p=>p.y);
    let minH = Math.min(...hashYs), maxH = Math.max(...hashYs);
    const hPad = (maxH-minH)*0.18 || 0.06;
    minH -= hPad; maxH += hPad;

    const tempYs = temp.length ? temp.map(p=>p.y) : [0,1];
    let minT = Math.min(...tempYs), maxT = Math.max(...tempYs);
    const tPad = (maxT-minT)*0.18 || 1;
    minT -= tPad; maxT += tPad;

    const X = (x)=> padL + ((x-minX)/(maxX-minX))*w;
    const YH = (y)=> padT + h - ((y-minH)/(maxH-minH))*h;
    const YT = (y)=> padT + h - ((y-minT)/(maxT-minT))*h;

    // grid (clearer)
    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    for(let i=1;i<=6;i++){
      const yy = padT + (h*i/7);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL+w, yy); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // hashrate line
    ctx.beginPath();
    ctx.moveTo(X(hash[0].x), YH(hash[0].y));
    for(let i=1;i<hash.length;i++) ctx.lineTo(X(hash[i].x), YH(hash[i].y));
    ctx.strokeStyle = hashLine;
    ctx.lineWidth = 3;
    ctx.stroke();

    // fill
    ctx.lineTo(X(hash[hash.length-1].x), padT+h);
    ctx.lineTo(X(hash[0].x), padT+h);
    ctx.closePath();
    ctx.fillStyle = hashFill;
    ctx.fill();

    // temp line
    if(temp.length >= 2){
      ctx.beginPath();
      ctx.moveTo(X(temp[0].x), YT(temp[0].y));
      for(let i=1;i<temp.length;i++) ctx.lineTo(X(temp[i].x), YT(temp[i].y));
      ctx.strokeStyle = tempLine;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    // title
    ctx.font = "12px ui-sans-serif,system-ui";
    ctx.fillStyle = ink;
    ctx.fillText(name, padL, 14);

    // left axis (hash)
    ctx.fillStyle = hashLine;
    ctx.fillText(maxH.toFixed(2), 10, padT+12);
    ctx.fillText(minH.toFixed(2), 10, padT+h);

    // right axis (temp)
    ctx.fillStyle = tempLine;
    ctx.fillText(maxT.toFixed(0)+"°", padL+w+10, padT+12);
    ctx.fillText(minT.toFixed(0)+"°", padL+w+10, padT+h);

    // time labels
    ctx.fillStyle = mut2;
    const leftTime = new Date(minX).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const rightTime = new Date(maxX).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    ctx.fillText(leftTime, padL, padT+h+20);
    ctx.fillText(rightTime, padL+w-54, padT+h+20);
  }

  async function refresh(){
    const r = await fetch("/v1/miners", { cache: "no-store" });
    const j = await r.json();
    state.miners = j.miners || [];
    renderTopSummary();
    renderCards();
    drawChart();
  }

  function setRange(ms){
    state.rangeMs = ms;
    document.getElementById("r2h").classList.toggle("active", ms === 2*60*60*1000);
    document.getElementById("r6h").classList.toggle("active", ms === 6*60*60*1000);
    document.getElementById("r24h").classList.toggle("active", ms === 24*60*60*1000);
    drawChart();
  }

  function applyTheme(theme){
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mm_theme", theme);
    document.getElementById("themeBtn").textContent = (theme === "dark") ? "Light" : "Dark";
    drawChart();
  }

  document.getElementById("r2h").addEventListener("click", ()=>setRange(2*60*60*1000));
  document.getElementById("r6h").addEventListener("click", ()=>setRange(6*60*60*1000));
  document.getElementById("r24h").addEventListener("click", ()=>setRange(24*60*60*1000));
  document.getElementById("themeBtn").addEventListener("click", ()=>{
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(cur === "dark" ? "light" : "dark");
  });
  window.addEventListener("resize", drawChart);

  // light by default
  const saved = localStorage.getItem("mm_theme");
  applyTheme(saved === "dark" ? "dark" : "light");

  setInterval(refresh, 5000);
  refresh();
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("MinerMonitor running on port", PORT));
