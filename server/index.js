import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1024kb" }));

// Render -> Environment -> API_KEY=<your secret>
const API_KEY = process.env.API_KEY || "";

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!API_KEY || token !== API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}

// In-memory stores
const minersStore = new Map();   // id -> {id,name,last_ts,metrics,coin}
const historyStore = new Map();  // id -> [{ts, ...metrics}]
const HISTORY_MAX_POINTS = 6000;

function clampHistory(id) {
  const arr = historyStore.get(id) || [];
  if (arr.length > HISTORY_MAX_POINTS) historyStore.set(id, arr.slice(-HISTORY_MAX_POINTS));
}

app.post("/v1/ingest", auth, (req, res) => {
  try {
    const miners = (req.body && req.body.miners) ? req.body.miners : [];
    const now = Date.now();

    for (const m of miners) {
      const id = String((m && m.id) || "").trim();
      if (!id) continue;

      const name = String((m && m.name) || id);
      const tsRaw = (m && m.metrics) ? m.metrics.ts : undefined;
      const ts = Number(tsRaw ?? now);
      const safeTs = Number.isFinite(ts) ? ts : now;

      const metrics = (m && m.metrics) ? m.metrics : {};
      minersStore.set(id, { id, name, last_ts: safeTs, metrics, coin: m.coin || "Unknown" });

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
  :root{
    --c1:#438981;
    --c2:#2C5444;
    --c3:#1D2B38;
    --c4:#3B576D;
    --c5:#8AA2A2;

    --bg: rgba(138,162,162,.18);
    --panel: rgba(255,255,255,.72);
    --line: rgba(29,43,56,.18);

    --accent: var(--c1);
    --ok: var(--c2);

    --btnBg: rgba(255,255,255,.65);
    --btnBd: rgba(29,43,56,.18);

    --shadow: 0 10px 26px rgba(29,43,56,.10);
  }

  [data-theme="dark"]{
    --bg: rgba(29,43,56,.92);
    --panel: rgba(44,84,68,.35);
    --ink: rgba(231,240,240,.95);
    --mut: rgba(138,162,162,.85);
    --line: rgba(138,162,162,.22);

    --accent: var(--c1);
    --accent2: var(--c5);

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

  .wrap{ width:min(940px, 92vw); margin:0 auto; }

  .topStats{
    display:grid;
    grid-template-columns:repeat(3, minmax(0, 1fr));
    gap:10px;
  }

  .stat{
    background:var(--panel);
    border:1px solid var(--line);
    border-radius:16px;
    padding:12px;
    box-shadow:var(--shadow);
  }

  .panelBox{
    background:var(--panel);
    border:1px solid var(--line);
    border-radius:16px;
    padding:12px;
    box-shadow:var(--shadow);
  }

  canvas{
    width:100%;
    height:280px;
    border-radius:14px;
    border:1px solid var(--line);
    background:var(--panel2);
  }

  #grid{
    display:grid;
    grid-template-columns:repeat(2, minmax(0, 1fr));
    gap:12px;
  }

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

  .row{
    display:flex; justify-content:space-between; gap:12px;
    padding:6px 0;
    border-bottom:1px dashed rgba(29,43,56,.14);
  }

  .twoCol{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .col{ display:flex; flex-direction:column; }

  .empty{
    color:var(--mut);
    padding:16px;
    border:1px dashed var(--line);
    border-radius:16px;
    background:var(--panel);
  }

  .addrLink{
    color:#1e6fe6;
    text-decoration:none;
    font-weight:1000;
  }

  /* Status dot colors (updated user palette) */
  .dot{ width:10px; height:10px; border-radius:999px; display:inline-block; margin-right:8px; }
  .dot.ok{ background:#238823; box-shadow:0 0 0 3px rgba(35,136,35,.25); }   /* green */
  .dot.stale{ background:#FC8B03; box-shadow:0 0 0 3px rgba(252,139,3,.25); } /* orange */
  .dot.off{ background:#D2222D; box-shadow:0 0 0 3px rgba(210,34,45,.25); }   /* red */
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

  function row(k, vHtml, mono){
    var cls = mono ? "rv mono" : "rv";
    return '<div class="row"><span class="rk">'+k+'</span><span class="'+cls+'">'+vHtml+'</span></div>';
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

      var left = "";
      left += row("Hashrate (10m)", (x.hashrate10mTh == null ? "—" : (fmt(x.hashrate10mTh,2) + " TH/s")), false);
      left += row("Hashrate (1h)", (x.hashrate1hTh == null ? "—" : (fmt(x.hashrate1hTh,2) + " TH/s")), false);
      left += row("Power", (x.powerW == null ? "—" : (fmt(x.powerW,1) + " W")), false);

      var right = "";
      right += row("Coin", esc(m.coin), true);  // Display the coin value
      right += row("Pool User", esc(m.stratumUser), true);

      out +=
        '<div class="card">' +
          '<div class="cardTop">' +
            '<div>' +
              '<div class="minerName">' + esc(m.name || m.id) + '</div>' +
              '<div class="minerSub">' + esc(m.id) + "" + '</div>' +
            '</div>' +
            '<div class="badge">' + dot + badgeText + '</div>' +
          '</div>' +
          '<div class="twoCol">' +
            '<div class="col">' + left + '</div>' +
            '<div class="col">' + right + '</div>' +
          '</div>' +
        '</div>';
    }

    el.innerHTML = out;
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

  setInterval(refresh, 5000);
  refresh();  
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("MinerMonitor running on port", PORT));
