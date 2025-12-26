const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// In-memory store for miner data (using Map to store unique miners by ID)
let minersStore = new Map();

// Sample endpoint to fetch miner data
app.get('/v1/miners', (req, res) => {
    res.json({
        miners: Array.from(minersStore.values())  // Return the miners from the in-memory store
    });
});

// Endpoint to ingest new miner data from the Agent
app.post('/v1/ingest', (req, res) => {
    const minerData = req.body.miners;

    // Process each miner data
    minerData.forEach(miner => {
        // Check if miner already exists in the store by ID, and update if necessary
        if (minersStore.has(miner.id)) {
            console.log(`Updating data for miner: ${miner.name}`);
        } else {
            console.log(`Adding new miner: ${miner.name}`);
        }
        
        // Add or update the miner data in the store based on miner ID
        minersStore.set(miner.id, miner);
    });

    // Respond with success
    res.status(200).json({ message: 'Miner data successfully ingested' });
});

// Optionally clear all miner data (useful for manual resets)
app.delete('/v1/miners', (req, res) => {
    minersStore.clear();   // Clears all stored miner data in memory
    res.json({ message: 'Miner data cleared' });
});

// Start the server and listen on the specified port
app.listen(PORT, () => {
    console.log(`MinerMonitor running on port ${PORT}`);
});

    <!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MinerMonitor</title>
</head>
<body>
  <h1>MinerMonitor Server is Running!</h1>
  <p>Use the /v1/miners endpoint to view miner data.</p>
</body>
</html>`);
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`MinerMonitor running on port ${PORT}`));
(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MinerMonitor</title>

<style>
  /* Palette only (derived rgba ok):
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

    /* Light theme default */
    --bg: rgba(138,162,162,.18);
    --panel: rgba(255,255,255,.72);
    --panel2: rgba(67,137,129,.14);
    --ink: var(--c3);
    --mut: var(--c4);
    --line: rgba(29,43,56,.18);

    --accent: var(--c1);
    --accent2: var(--c2);

    --hashLine: var(--c2);
    --hashFill: rgba(67,137,129,.18);
    --tempLine: var(--c4);

    --ok: var(--c2);
    --warn: var(--c4);

    --btnBg: rgba(255,255,255,.65);
    --btnBd: rgba(29,43,56,.18);

    --shadow: 0 10px 26px rgba(29,43,56,.10);
  }

  [data-theme="dark"]{
    --bg: rgba(29,43,56,.92);
    --panel: rgba(44,84,68,.35);
    --panel2: rgba(59,87,109,.45);
    --ink: rgba(231,240,240,.95);
    --mut: rgba(138,162,162,.85);
    --line: rgba(138,162,162,.22);

    --accent: var(--c1);
    --accent2: var(--c5);

    --hashLine: var(--c5);
    --hashFill: rgba(59,87,109,.45);
    --tempLine: var(--c1);

    --ok: var(--c5);
    --warn: var(--c1);

    --btnBg: rgba(44,84,68,.40);
    --btnBd: rgba(138,162,162,.22);

    --shadow: 0 12px 28px rgba(29,43,56,.45);
  }

  html,body{
    margin:0;
    background:var(--bg);
    color:var(--ink);
    font:14px/1.4 ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;
  }

  header{
    position:sticky; top:0; z-index:20;
    background: rgba(138,162,162,.18);
    border-bottom:1px solid var(--line);
    backdrop-filter: blur(6px);
  }
  [data-theme="dark"] header{ background: rgba(29,43,56,.72); }

  .wrap{ width:min(940px, 92vw); margin:0 auto; }

  .head{
    display:flex; align-items:center; justify-content:space-between;
    gap:10px; padding:14px 8px;
  }

  .brand{ font-size:22px; font-weight:1000; letter-spacing:.2px; }
  .brand .mark{ color: var(--accent); }

  .headRight{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }

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
    border-color: rgba(67,137,129,.55);
    box-shadow: 0 0 0 2px rgba(67,137,129,.18) inset;
  }

  main{ padding:14px 0 22px 0; display:grid; gap:14px; }

  .topStats{
    display:grid;
    grid-template-columns:repeat(3, minmax(0, 1fr));
    gap:10px;
  }
  @media (max-width: 860px){ .topStats{grid-template-columns:1fr;} }

  .stat{
    background:var(--panel);
    border:1px solid var(--line);
    border-radius:16px;
    padding:12px;
    box-shadow:var(--shadow);
  }
  .stat .k{color:var(--mut); font-weight:950; font-size:12px; letter-spacing:.2px}
  .stat .v{font-size:20px; font-weight:1000; margin-top:6px}
  .stat .s{color:var(--mut); margin-top:4px; font-weight:850; font-size:12px}

  .panelBox{
    background:var(--panel);
    border:1px solid var(--line);
    border-radius:16px;
    padding:12px;
    box-shadow:var(--shadow);
  }
  .panelTitle{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
  .panelTitle h2{
    margin:0;
    font-size:12px;
    font-weight:1000;
    color:var(--mut);
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
  @media (max-width: 860px){ canvas{height:240px;} }

  #grid{
    display:grid;
    grid-template-columns:repeat(2, minmax(0, 1fr));
    gap:12px;
  }
  @media (max-width: 860px){ #grid{grid-template-columns:1fr;} }

  .card{
    background:var(--panel);
    border:1px solid var(--line);
    border-radius:16px;
    padding:12px;
    box-shadow:var(--shadow);
  }

  .cardTop{
    display:flex; align-items:flex-start; justify-content:space-between; gap:10px;
    margin-bottom:10px;
  }

  .minerName{ font-weight:1000; font-size:15px; }
  .minerSub{ margin-top:3px; font-size:12px; color:var(--mut); font-weight:850; }

  .badge{
    border:1px solid var(--line);
    background:var(--panel2);
    border-radius:999px;
    padding:3px 9px;
    font-size:12px;
    font-weight:950;
    white-space:nowrap;
  }

  .dot{width:8px;height:8px;border-radius:999px;display:inline-block;margin-right:6px;transform:translateY(-1px); box-shadow:0 0 0 3px rgba(0,0,0,.06)}
  .dotOk{background:#238823} /* green */
  .dotWarn{background:#FC8B03} /* orange */
  .dotOff{background:#D2222D} /* red */

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
  .hero .hk{ color:var(--mut); font-weight:1000; font-size:12px }
  .hero .hv{ font-weight:1000; font-size:22px; margin-top:4px }
  .hashNum{ color:var(--accent2) }
  .tempNum{ color:var(--accent) }

  .twoCol{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .col{ display:flex; flex-direction:column; }

  .row{
    display:flex; justify-content:space-between; gap:12px;
    padding:6px 0;
    border-bottom:1px dashed rgba(29,43,56,.14);
  }
  [data-theme="dark"] .row{ border-bottom-color: rgba(138,162,162,.18); }
  .row:last-child{ border-bottom:0; }
  .rk{ color:var(--mut); font-weight:900; }
  .rv{ font-weight:1000; text-align:right; }
  .rv.mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

  .empty{
    color:var(--mut);
    padding:16px;
    border:1px dashed var(--line);
    border-radius:16px;
    background:var(--panel);
  }

  /* Segmented (icon-only for theme, text for range) */
  .seg{
    display:flex;
    border:1px solid var(--line);
    background:var(--panel2);
    border-radius:999px;
    padding:3px;
    gap:3px;
    align-items:center;
  }
  .segBtn{
    height:32px;
    border-radius:999px;
    border:0;
    background:transparent;
    color:var(--ink);
    cursor:pointer;
    font-weight:1000;
    padding:0 12px;
    display:flex;
    align-items:center;
    justify-content:center;
    min-width:46px;
  }
  .segBtn.sel{
    background:var(--panel);
    border:1px solid var(--line);
    box-shadow: 0 10px 22px rgba(18,17,26,.10);
  }
  #themeSeg .segBtn{ width:38px; min-width:38px; padding:0; }
  #themeSeg svg{ width:18px; height:18px; display:block; }

  .addrLink{
    color:#1e6fe6;
    text-decoration:none;
    font-weight:1000;
  }
  .addrLink:hover{ text-decoration:underline; }

  /* Prevent long pool address from stretching layout */
  .row .rv, .row .rv a{
    overflow-wrap:anywhere;
    word-break:break-word;
  }


  /* Status dot colors (updated user palette) */
  .dot{ width:10px; height:10px; border-radius:999px; display:inline-block; margin-right:8px; }
  .dot.ok{ background:#238823; box-shadow:0 0 0 3px rgba(35,136,35,.25); }   /* green */
  .dot.stale{ background:#FC8B03; box-shadow:0 0 0 3px rgba(252,139,3,.25); } /* orange */
  .dot.off{ background:#D2222D; box-shadow:0 0 0 3px rgba(210,34,45,.25); }   /* red */   /* red */   /* bright red */     /* bright red */     /* red */


  /* Half-width centered divider inside card */
  .halfDivider{
    width:50%;
    height:1px;
    background:var(--line);
    margin:10px auto;
  }
</style>
</head>

<body>
<header>
  <div class="wrap">
    <div class="head">
      <div class="brand">Miner<span class="mark">Monitor</span></div>
      <div class="headRight">
        <div class="seg" id="themeSeg" aria-label="Theme">
          <button class="segBtn" type="button" id="segLight" aria-label="Light theme"></button>
          <button class="segBtn" type="button" id="segDark" aria-label="Dark theme"></button>
        </div>
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
      <div class="panelTitle"><h2>Hashrate (TH/s) + ASIC Temp (°C)</h2><div class="seg" id="rangeSeg" aria-label="Chart range"><button class="segBtn" type="button" id="rng6" aria-label="6 hours">6h</button><button class="segBtn" type="button" id="rng12" aria-label="12 hours">12h</button><button class="segBtn" type="button" id="rng24" aria-label="24 hours">24h</button></div></div>
      <canvas id="chart"></canvas>
    </div>

    <div id="grid"></div>
  </main>
</div>

<script>
  var state = { miners: [], rangeMs: 6*60*60*1000 };

  function $(id){ return document.getElementById(id); }

  function esc(str){
    return String(str).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function iconSun(){
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>';
  }
  function iconMoon(){
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M21 14.5A8.5 8.5 0 0 1 9.5 3a7 7 0 1 0 11.5 11.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  }

  
  function shortAddr(addr){
    var s = String(addr||"");
    if(s.length >= 22){
      return s.slice(0,5) + "***" + s.slice(-5);
    }
    return s;
  }

function online(lastTs){ return (Date.now() - (lastTs||0)) < 60000; }

  function fmt(v, d){
    if (d === undefined) d = 2;
    var n = Number(v);
    if(!Number.isFinite(n)) return "—";
    return n.toFixed(d);
  }

  function fmtInt(v){
    var n = Number(v);
    if(!Number.isFinite(n)) return "—";
    return String(Math.round(n));
  }

  function fmtUptime(sec){
    var n = Number(sec);
    if(!Number.isFinite(n) || n <= 0) return "—";
    var d=Math.floor(n/86400), h=Math.floor((n%86400)/3600), m=Math.floor((n%3600)/60);
    return d+"d "+h+"h "+m+"m";
  }

  function timeAgo(ts){
    if(!ts) return "—";
    var diff = Math.max(0, Date.now()-ts);
    var s = Math.floor(diff/1000);
    if(s<60) return s+"s";
    var m=Math.floor(s/60); if(m<60) return m+"m";
    var h=Math.floor(m/60); if(h<24) return h+"h";
    var d=Math.floor(h/24); return d+"d";
  }

  function safeNum(v){
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function shortUser(u){
    if(!u) return null;
    var s = String(u);
    if(s.length <= 12) return s;
    return s.slice(0,6) + "…" + s.slice(-4);
  }

  function row(k, vHtml, mono){
    var cls = mono ? "rv mono" : "rv";
    return '<div class="row"><span class="rk">'+k+'</span><span class="'+cls+'">'+vHtml+'</span></div>';
  }

  function computeEfficiencyJTH(powerW, hashrateTh){
    var p = safeNum(powerW);
    var h = safeNum(hashrateTh);
    if(p == null || h == null || h <= 0) return null;
    return p / h;
  }

  function renderTopSummary(){
    var miners = state.miners || [];
    if(!miners.length){
      $("sumHash").textContent = "—";
      $("sumHashSub").textContent = "—";
      $("sumShares").textContent = "—";
      $("sumSharesSub").textContent = "—";
      $("avgTemp").textContent = "—";
      $("avgTempSub").textContent = "—";
      return;
    }

    var totalHash = 0;
    var onlineCount = 0;
    var acc = 0, rej = 0;
    var tempSum = 0, tempCount = 0;

    for(var i=0;i<miners.length;i++){
      var m = miners[i];
      var x = m.metrics || {};
      var on = online(m.last_ts);
      if(on) onlineCount++;

      var useH = safeNum((x.hashrate1mTh != null) ? x.hashrate1mTh : x.hashrateTh);
      if(useH != null) totalHash += useH;

      var a = safeNum(x.sharesAccepted);
      var r = safeNum(x.sharesRejected);
      if(a != null) acc += a;
      if(r != null) rej += r;

      var t = safeNum((x.asicTempC != null) ? x.asicTempC : x.cpuTempC);
      if(t != null){ tempSum += t; tempCount++; }
    }

    $("sumHash").textContent = (Number.isFinite(totalHash) ? totalHash.toFixed(2) : "—") + " TH/s";
    $("sumHashSub").textContent = onlineCount + " online · " + miners.length + " total";

    $("sumShares").textContent = String(acc + rej);
    $("sumSharesSub").textContent = "Accepted " + String(acc) + " · Rejected " + String(rej);

    var avg = (tempCount ? (tempSum/tempCount) : null);
    $("avgTemp").textContent = (avg==null ? "—" : avg.toFixed(0) + "°C");
    $("avgTempSub").textContent = "from " + tempCount + " miners";
  }

  function renderCards(){
    var el = $("grid");
    var miners = state.miners || [];
    if(!miners.length){
      el.innerHTML = '<div class="empty">Waiting for agent data…</div>';
      return;
    }

    var out = "";
    for(var i=0;i<miners.length;i++){
      var m = miners[i];
      var x = m.metrics || {};
      var isOn = online(m.last_ts);

      var dot = isOn ? '<span class="dot dotOk"></span>' : '<span class="dot dotWarn"></span>';
      var badgeText = isOn ? "Mining" : "Stale";

      var hr1m = (x.hashrate1mTh != null) ? x.hashrate1mTh : null;
      var hr10m = (x.hashrate10mTh != null) ? x.hashrate10mTh : null;
      var hr1h  = (x.hashrate1hTh != null) ? x.hashrate1hTh : null;
      var hrNow = (x.hashrateTh != null) ? x.hashrateTh : null;

      var chip = (x.asicTempC != null) ? x.asicTempC : null;
      var cpu  = (x.cpuTempC != null) ? x.cpuTempC : null;

      var power = (x.powerW != null) ? x.powerW : null;
      var fanRpm = (x.fanRpm != null) ? x.fanRpm : null;

      var accepted = (x.sharesAccepted != null) ? x.sharesAccepted : null;
      var rejected = (x.sharesRejected != null) ? x.sharesRejected : null;

      var bestDiff = (x.bestDiff != null) ? x.bestDiff : null;
      var uptime = (x.uptimeSec != null) ? x.uptimeSec : null;

      var poolUrl  = (x.stratumURL != null) ? x.stratumURL : null;
      var poolPort = (x.stratumPort != null) ? x.stratumPort : null;
      var poolUser = (x.stratumUser != null) ? x.stratumUser : null;

      var ip = (x.ipv4 != null) ? x.ipv4 : null;

      var heroHash = (hr1m != null) ? hr1m : hrNow;
      var heroTemp = (chip != null) ? chip : cpu;
      var eff = (x.efficiencyJTH != null) ? x.efficiencyJTH : computeEfficiencyJTH(power, heroHash);

      var left = "";
      left += row("Hash (10m)", (hr10m==null ? "—" : (fmt(hr10m,2) + " TH/s")), false);
      left += row("Hash (1h)",  (hr1h==null ? "—" : (fmt(hr1h,2) + " TH/s")), false);
      left += row("Power",      (power==null ? "—" : (fmt(power,1) + " W")), false);
      left += row("Fan RPM",    (fanRpm==null ? "—" : fmtInt(fanRpm)), false);
      left += row("Uptime",     fmtUptime(uptime), false);

      var right = "";
      right += row("Accepted", (accepted==null ? "—" : fmtInt(accepted)), false);
      right += row("Rejected", (rejected==null ? "—" : fmtInt(rejected)), false);
      right += row("Efficiency", (eff==null ? "—" : (fmt(eff,2) + " J/TH")), false);
      right += row("Best Diff", (bestDiff==null ? "—" : fmtInt(bestDiff)), false);
      right += row("Last Seen", timeAgo(m.last_ts), false);

      var extraHtml = "";
      if(poolUrl || poolPort != null || poolUser){
        var eL = "";
        var eR = "";
        if(poolUrl)  eL += row("Pool Host", esc(poolUrl), true);
        if(poolPort != null) eR += row("Pool Port", fmtInt(poolPort), false);
        if(poolUser){
        var addr = String(poolUser);
        var href = "https://mempool.space/address/" + encodeURIComponent(addr);
        eL += row("Pool User", '<a class="addrLink" href="' + href + '" target="_blank" rel="noopener noreferrer">' + esc(shortAddr(addr)) + "</a>", true);
      }
extraHtml =
          '<div class="twoCol" style="margin-top:10px">' +
            '<div class="col">' + eL + '</div>' +
            '<div class="col">' + eR + '</div>' +
          '</div>';
      }

      out +=
        '<div class="card">' +
          '<div class="cardTop">' +
            '<div>' +
              '<div class="minerName">' + esc(m.name || m.id) + '</div>' +
              '<div class="minerSub">' + esc(m.id) + "" + '</div>' +
            '</div>' +
            '<div class="badge">' + dot + badgeText + '</div>' +
          '</div>' +

          '<div class="hero">' +
            '<div>' +
              '<div class="hk">Real Hashrate</div>' +
              '<div class="hv hashNum">' + (heroHash==null ? "—" : fmt(heroHash,2)) + ' TH/s</div>' +
            '</div>' +
            '<div>' +
              '<div class="hk">Chip Temperature</div>' +
              '<div class="hv tempNum">' + (heroTemp==null ? "—" : fmt(heroTemp,1)) + ' °C</div>' +
            '</div>' +
          '</div>' +

          '<div class="twoCol">' +
            '<div class="col">' + left + '</div>' +
            '<div class="col">' + right + '</div>' +
          '</div>' +
          extraHtml +
        '</div>';
    }

    el.innerHTML = out;
  }

  function getSeries(){
    var m = state.miners[0];
    if(!m) return { hash: [], temp: [], name: "" };

    var cut = Date.now() - state.rangeMs;
    var hist = (m.history || []).filter(function(p){ return (p.ts||0) >= cut; });

    var hash = [];
    var temp = [];

    for(var i=0;i<hist.length;i++){
      var p = hist[i];
      var ts = p.ts;
      var h = safeNum((p.hashrate1mTh != null) ? p.hashrate1mTh : p.hashrateTh);
      var t = safeNum((p.asicTempC != null) ? p.asicTempC : p.cpuTempC);
      if(Number.isFinite(ts) && Number.isFinite(h)) hash.push({x:ts, y:h});
      if(Number.isFinite(ts) && Number.isFinite(t)) temp.push({x:ts, y:t});
    }
    return { hash: hash, temp: temp, name: m.name || m.id };
  }

  function drawChart(){
    var c = $("chart");
    var ctx = c.getContext("2d");

    var cssW = c.clientWidth;
    var cssH = c.clientHeight;
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.floor(cssW*dpr);
    c.height = Math.floor(cssH*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);

    ctx.clearRect(0,0,cssW,cssH);

    var padL=56, padR=56, padT=18, padB=28;
    var w = cssW - padL - padR;
    var h = cssH - padT - padB;

    var css = getComputedStyle(document.documentElement);
    var line = css.getPropertyValue("--line").trim();
    var hashLine = css.getPropertyValue("--hashLine").trim();
    var hashFill = css.getPropertyValue("--hashFill").trim();
    var tempLine = css.getPropertyValue("--tempLine").trim();
    var ink = css.getPropertyValue("--ink").trim();
    var mut = css.getPropertyValue("--mut").trim();

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, w, h);

    var series = getSeries();
    var hash = series.hash, temp = series.temp, name = series.name;

    if(hash.length < 2){
      ctx.fillStyle = mut;
      ctx.font = "12px ui-sans-serif,system-ui";
      ctx.fillText("Waiting for chart data…", padL+10, padT+24);
      return;
    }

    var xs = hash.map(function(p){ return p.x; });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);

    var hashYs = hash.map(function(p){ return p.y; });
    var minH = Math.min.apply(null, hashYs);
    var maxH = Math.max.apply(null, hashYs);
    var hPad = (maxH-minH)*0.18 || 0.06;
    minH -= hPad; maxH += hPad;

    var tempYs = temp.length ? temp.map(function(p){ return p.y; }) : [0,1];
    var minT = Math.min.apply(null, tempYs);
    var maxT = Math.max.apply(null, tempYs);
    var tPad = (maxT-minT)*0.18 || 1;
    minT -= tPad; maxT += tPad;

    function X(x){ return padL + ((x-minX)/(maxX-minX))*w; }
    function YH(y){ return padT + h - ((y-minH)/(maxH-minH))*h; }
    function YT(y){ return padT + h - ((y-minT)/(maxT-minT))*h; }

    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    for(var i=1;i<=6;i++){
      var yy = padT + (h*i/7);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL+w, yy); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.moveTo(X(hash[0].x), YH(hash[0].y));
    for(var j=1;j<hash.length;j++) ctx.lineTo(X(hash[j].x), YH(hash[j].y));
    ctx.strokeStyle = hashLine;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.lineTo(X(hash[hash.length-1].x), padT+h);
    ctx.lineTo(X(hash[0].x), padT+h);
    ctx.closePath();
    ctx.fillStyle = hashFill;
    ctx.fill();

    if(temp.length >= 2){
      ctx.beginPath();
      ctx.moveTo(X(temp[0].x), YT(temp[0].y));
      for(var k=1;k<temp.length;k++) ctx.lineTo(X(temp[k].x), YT(temp[k].y));
      ctx.strokeStyle = tempLine;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    ctx.font = "12px ui-sans-serif,system-ui";
    ctx.fillStyle = ink;
    ctx.fillText(name, padL, 14);

    ctx.fillStyle = hashLine;
    ctx.fillText(maxH.toFixed(2), 10, padT+12);
    ctx.fillText(minH.toFixed(2), 10, padT+h);

    ctx.fillStyle = tempLine;
    ctx.fillText(maxT.toFixed(0)+"°", padL+w+10, padT+12);
    ctx.fillText(minT.toFixed(0)+"°", padL+w+10, padT+h);

    ctx.fillStyle = mut;
    var leftTime = new Date(minX).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    var rightTime = new Date(maxX).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    ctx.fillText(leftTime, padL, padT+h+20);
    ctx.fillText(rightTime, padL+w-54, padT+h+20);
  }

  function refresh(){
    fetch("/v1/miners", { cache: "no-store" })
      .then(function(r){ return r.json(); })
      .then(function(j){
        state.miners = j.miners || [];
        renderTopSummary();
        renderCards();
        drawChart();
      })
      .catch(function(){ });
  }

  function setRange(ms){
    state.rangeMs = ms;
    try { localStorage.setItem("mm_range", String(ms)); } catch(e){}
    var b6 = $("rng6"), b12 = $("rng12"), b24 = $("rng24");
    if(b6 && b12 && b24){
      b6.classList.toggle("sel", ms === 6*60*60*1000);
      b12.classList.toggle("sel", ms === 12*60*60*1000);
      b24.classList.toggle("sel", ms === 24*60*60*1000);
    }
    drawChart();
  }

  function applyTheme(theme){
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("mm_theme", theme); } catch(e){}
    var dark = (theme === "dark");
    var bL = $("segLight");
    var bD = $("segDark");
    if(bL && !bL.innerHTML.trim()) bL.innerHTML = iconSun();
    if(bD && !bD.innerHTML.trim()) bD.innerHTML = iconMoon();
    if(bL && bD){
      bL.classList.toggle("sel", !dark);
      bD.classList.toggle("sel", dark);
    }
    drawChart();
  }

  // Range segmented
  if($("rng6")) $("rng6").addEventListener("click", function(){ setRange(6*60*60*1000); });
  if($("rng12")) $("rng12").addEventListener("click", function(){ setRange(12*60*60*1000); });
  if($("rng24")) $("rng24").addEventListener("click", function(){ setRange(24*60*60*1000); });

  // Theme segmented (icon-only)
  if($("segLight")) $("segLight").innerHTML = iconSun();
  if($("segDark")) $("segDark").innerHTML = iconMoon();
  if($("segLight")) $("segLight").addEventListener("click", function(){ applyTheme("light"); });
  if($("segDark")) $("segDark").addEventListener("click", function(){ applyTheme("dark"); });

  window.addEventListener("resize", drawChart);

  // Init theme
  var saved = localStorage.getItem("mm_theme");
  applyTheme(saved === "dark" ? "dark" : "light");

  // Init range
  var savedRange = null;
  try { savedRange = Number(localStorage.getItem("mm_range")); } catch(e){}
  if(savedRange === 6*60*60*1000 || savedRange === 12*60*60*1000 || savedRange === 24*60*60*1000){
    state.rangeMs = savedRange;
  } else {
    state.rangeMs = 6*60*60*1000;
  }
  setRange(state.rangeMs);

  setInterval(refresh, 5000);
  refresh();</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("MinerMonitor running on port", PORT));
