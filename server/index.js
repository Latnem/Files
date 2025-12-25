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
const minersStore = new Map(); // id -> {id,name,last_ts,metrics}
const historyStore = new Map(); // id -> [{ts, ...metrics}]
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
  /* ONLY colors from your succulent palette (sampled):
     #F7FDFC (near-white)
     #B9C5B4 (sage)
     #5F8E82 (seafoam teal)
     #416658 (forest)
     #114642 (deep teal)
     #161E25 (near-black blue/green)
  */

  :root{
    /* LIGHT (default) */
    --bg:     #F7FDFC;
    --panel:  #F7FDFC;
    --panel2: #B9C5B4;
    --ink:    #161E25;
    --mut:    #416658;
    --mut2:   #5F8E82;
    --line:   #5F8E82;

    --good:   #416658;
    --warn:   #114642;

    --hash:     #114642;
    --hashLine: #416658;
    --hashFill: #B9C5B4;

    --temp:     #5F8E82;
    --tempLine: #5F8E82;

    --btnBg: #B9C5B4;
    --btnBd: #5F8E82;

    --shadow: none; /* palette-only: no rgba shadows */
  }

  [data-theme="dark"]{
    /* DARK */
    --bg:     #161E25;
    --panel:  #114642;
    --panel2: #416658;
    --ink:    #F7FDFC;
    --mut:    #B9C5B4;
    --mut2:   #5F8E82;
    --line:   #5F8E82;

    --good:   #B9C5B4;
    --warn:   #5F8E82;

    --hash:     #F7FDFC;
    --hashLine: #B9C5B4;
    --hashFill: #416658;

    --temp:     #5F8E82;
    --tempLine: #5F8E82;

    --btnBg: #114642;
    --btnBd: #5F8E82;

    --shadow: none;
  }

  html,body{
    margin:0;
    background:var(--bg);
    color:var(--ink);
    font:14px/1.4 ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;
  }

  header{
    position:sticky; top:0; z-index:10;
    background:var(--panel);
    border-bottom:1px solid var(--line);
  }

  /* centered, not full width */
  .wrap{
    width:min(920px, 92vw);
    margin:0 auto;
  }

  .head{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    padding:14px 10px;
  }

  .brand{
    font-size:20px;
    font-weight:950;
    letter-spacing:.2px;
  }

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
    box-shadow:none;
    font-weight:800;
  }
  .btn.active{
    border-color: var(--good);
  }

  main{
    padding:14px 0 20px 0;
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
  .stat .k{color:var(--mut2); font-weight:900; font-size:12px; letter-spacing:.2px}
  .stat .v{font-size:20px; font-weight:1000; margin-top:6px}
  .stat .s{color:var(--mut2); margin-top:4px; font-weight:800; font-size:12px}

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
    font-size:13px;
    font-weight:1000;
    color:var(--mut);
    letter-spacing:.2px;
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

  /* 2-column cards grid */
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
    font-weight:800;
  }

  .badge{
    border:1px solid var(--line);
    background:var(--panel2);
    border-radius:999px;
    padding:3px 9px;
    font-size:12px;
    font-weight:950;
    white-space:nowrap;
  }

  .dot{
    width:8px;height:8px;border-radius:999px;display:inline-block;margin-right:6px;transform:translateY(-1px)
  }
  .dotOk{background:var(--good)}
  .dotWarn{background:var(--warn)}

  /* big hashrate + chip temp */
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
  .hashNum{color:var(--hash)}
  .tempNum{color:var(--temp)}

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
    border-bottom:1px dashed var(--line);
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
      <div class="brand">MinerMonitor</div>
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
    return p / h; // W / TH == J/TH
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
      const vr   = x.vrTempC ?? null;

      const power = x.powerW ?? null;
      const fanRpm = x.fanRpm ?? null;

      const accepted = x.sharesAccepted ?? null;
      const rejected = x.sharesRejected ?? null;
      const rejPct = x.rejectRatePct ?? x.errorPct ?? null;

      const bestDiff = x.bestDiff ?? null;
      const bestSess = x.bestSessionDiff ?? null;
      const poolDiff = x.poolDifficulty ?? null;

      const uptime = x.uptimeSec ?? null;

      const freq = x.frequencyMhz ?? null;
      const rssi = x.wifiRSSI ?? null;
      const ver  = x.axeOSVersion ?? null;

      const poolUrl  = x.stratumURL ?? null;
      const poolPort = x.stratumPort ?? null;
      const poolUser = x.stratumUser ?? null;

      const ip = x.ipv4 ?? null;
      const ssid = x.ssid ?? null;

      const heroHash = (hr1m ?? hrNow);
      const heroTemp = (chip ?? cpu);

      const eff = x.efficiencyJTH ?? computeEfficiencyJTH(power, heroHash);

      const left = [
        row("Hash (10m)", hr10m==null ? "—" : (fmt(hr10m,2) + " TH/s")),
        row("Hash (1h)",  hr1h==null ? "—" : (fmt(hr1h,2) + " TH/s")),
        row("Efficiency", eff==null ? "—" : (fmt(eff,2) + " J/TH")),
        row("Power",      power==null ? "—" : (fmt(power,1) + " W")),
        row("Fan RPM",    fanRpm==null ? "—" : fmtInt(fanRpm))
      ].join("");

      const right = [
        row("Accepted", accepted==null ? "—" : fmtInt(accepted)),
        row("Rejected", rejected==null ? "—" : fmtInt(rejected)),
        row("Error %",  rejPct==null ? "—" : (fmt(rejPct,2) + "%")),
        row("Best Diff", bestDiff==null ? "—" : fmtInt(bestDiff)),
        row("Uptime",   (fmtUptime(uptime) + " · " + timeAgo(m.last_ts)))
      ].join("");

      const extraLeftRows = [];
      const extraRightRows = [];

      if (cpu != null) extraLeftRows.push(row("CPU Temp", fmt(cpu,1) + " °C"));
      if (vr != null)  extraLeftRows.push(row("VR Temp",  fmt(vr,1) + " °C"));
      if (poolDiff != null) extraRightRows.push(row("Pool Diff", fmtInt(poolDiff)));
      if (bestSess != null) extraRightRows.push(row("Best Session", fmtInt(bestSess)));

      if (freq != null) extraLeftRows.push(row("Freq", fmtInt(freq) + " MHz"));
      if (rssi != null) extraRightRows.push(row("Wi-Fi", fmtInt(rssi) + " dBm"));

      if (poolUrl) extraLeftRows.push(row("Pool", esc(poolUrl), true));
      if (poolPort != null) extraRightRows.push(row("Port", fmtInt(poolPort)));
      if (poolUser) extraLeftRows.push(row("User", esc(shortUser(poolUser)), true));

      if (ver) extraRightRows.push(row("AxeOS", esc(ver)));

      const showExtra = extraLeftRows.length || extraRightRows.length;

      return \`
        <div class="card">
          <div class="cardTop">
            <div>
              <div class="minerName">\${esc(m.name || m.id)}</div>
              <div class="minerSub">\${esc(m.id)}\${ip ? " · " + esc(ip) : ""}\${ssid ? " · " + esc(ssid) : ""}</div>
            </div>
            <div class="badge">\${dot}\${badgeText}</div>
          </div>

          <div class="hero">
            <div>
              <div class="hk">Real Hashrate</div>
              <div class="hv hashNum">\${heroHash==null ? "—" : fmt(heroHash,2)} TH/s</div>
            </div>
            <div>
              <div class="hk">Chip Temperature</div>
              <div class="hv tempNum">\${heroTemp==null ? "—" : fmt(heroTemp,1)} °C</div>
            </div>
          </div>

          <div class="twoCol">
            <div class="col">\${left}</div>
            <div class="col">\${right}</div>
          </div>

          <div class="twoCol" style="margin-top:10px;\${showExtra ? "" : "display:none;"}">
            <div class="col">\${extraLeftRows.join("")}</div>
            <div class="col">\${extraRightRows.join("")}</div>
          </div>
        </div>
      \`;
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
    const hPad = (maxH-minH)*0.12 || 0.05;
    minH -= hPad; maxH += hPad;

    const tempYs = temp.length ? temp.map(p=>p.y) : [0,1];
    let minT = Math.min(...tempYs), maxT = Math.max(...tempYs);
    const tPad = (maxT-minT)*0.12 || 1;
    minT -= tPad; maxT += tPad;

    const X = (x)=> padL + ((x-minX)/(maxX-minX))*w;
    const YH = (y)=> padT + h - ((y-minH)/(maxH-minH))*h;
    const YT = (y)=> padT + h - ((y-minT)/(maxT-minT))*h;

    // grid
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for(let i=1;i<=6;i++){
      const yy = padT + (h*i/7);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL+w, yy); ctx.stroke();
    }

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
      ctx.lineWidth = 2.5;
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
