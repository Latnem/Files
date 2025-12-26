import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1024kb' }));

// Load the API_KEY from the environment variables
const API_KEY = process.env.API_KEY || "";

// Middleware for authenticating API requests
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!API_KEY || token !== API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}

// In-memory data stores for miners and history
const minersStore = new Map();   // id -> {id, name, last_ts, metrics}
const historyStore = new Map();  // id -> [{ts, ...metrics}]
const HISTORY_MAX_POINTS = 6000;

// Function to clamp history (keep a maximum number of points)
function clampHistory(id) {
  const arr = historyStore.get(id) || [];
  if (arr.length > HISTORY_MAX_POINTS) historyStore.set(id, arr.slice(-HISTORY_MAX_POINTS));
}

// API Endpoint to ingest miner data (requires authentication)
app.post("/v1/ingest", auth, (req, res) => {
  try {
    const miners = req.body.miners || [];
    miners.forEach(miner => {
      minersStore.set(miner.id, miner);
    });
    res.json({ ok: true, count: miners.length });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

// API Endpoint to get miner data
app.get("/v1/miners", (req, res) => {
  const miners = Array.from(minersStore.values())
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
    .map((m) => ({
      ...m,
      history: (historyStore.get(m.id) || []).slice(-2500),
    }));

  res.json({ miners });
});

// Health check endpoint (required by Render)
app.get("/healthz", (req, res) => res.type("text").send("ok"));

// Main page: serves the MinerMonitor UI
app.get("/", (req, res) => {
  res.type("html").send(`
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>MinerMonitor</title>
      <style>
        /* Your existing color schemes, styles, and UI */
        :root{
          --c1:#438981;
          --c2:#2C5444;
          --c3:#1D2B38;
          --c4:#3B576D;
          --c5:#8AA2A2;
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

        /* Dark mode styles */
        [data-theme="dark"] {
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

        html, body {
          margin: 0;
          background: var(--bg);
          color: var(--ink);
          font: 14px/1.4 ui-sans-serif, system-ui, Segoe UI, Roboto, Arial;
        }

        header {
          position: sticky;
          top: 0;
          z-index: 20;
          background: rgba(138,162,162,.18);
          border-bottom: 1px solid var(--line);
          backdrop-filter: blur(6px);
        }

        [data-theme="dark"] header {
          background: rgba(29,43,56,.72);
        }

        .wrap {
          width: min(940px, 92vw);
          margin: 0 auto;
        }

        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 14px 8px;
        }

        .brand {
          font-size: 22px;
          font-weight: 1000;
          letter-spacing: .2px;
        }

        .headRight {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .btn {
          background: var(--btnBg);
          border: 1px solid var(--btnBd);
          color: var(--ink);
          border-radius: 12px;
          padding: 7px 10px;
          cursor: pointer;
          font-weight: 900;
        }

        main {
          padding: 14px 0 22px 0;
          display: grid;
          gap: 14px;
        }
      </style>
    </head>

    <body>
      <header>
        <div class="wrap">
          <div class="head">
            <div class="brand">Miner<span class="mark">Monitor</span></div>
          </div>
        </div>
      </header>

      <div class="wrap">
        <main>
          <div id="grid"></div>
        </main>
      </div>

      <script>
        // JavaScript code for UI interaction and miner data rendering
        var state = { miners: [], rangeMs: 6 * 60 * 60 * 1000 };

        function $(id) { return document.getElementById(id); }

        function esc(str) {
          return String(str).replace(/[&<>"\']/g, function (c) {
            return {
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;'
            }[c];
          });
        }

        setInterval(refresh, 5000);
        refresh();
      </script>
    </body>
    </html>
  `);
});

// Listen for requests on the dynamically assigned port (Render uses process.env.PORT)
const PORT = process.env.PORT || 8080;  // Default to 8080 if not specified in environment variables
app.listen(PORT, () => {
  console.log(`MinerMonitor server running on port ${PORT}`);
});
