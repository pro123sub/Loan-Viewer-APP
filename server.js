/**
 * server.js — LoanInNeed Application Viewer (Express)
 *
 * Acts as a secure proxy:
 *   Browser → localhost:3500/api/data → Production Backend (server-side)
 *
 * The API key NEVER leaves this server — CORS issues are eliminated.
 */

const express = require('express');
const axios   = require('axios');
const path    = require('path');
const { generateHtmlReport } = require('./testRunner');

const app  = express();
const PORT = process.env.PORT || 3500;

const LIN_API_BASE = process.env.LIN_API_BASE || 'https://lionfish-app-mg3te.ondigitalocean.app';
const LIN_API_KEY  = process.env.LIN_API_KEY  || 'paromita$432';

// ── Middleware ─────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Health Check ───────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Config Exposure (internal tool — shows api creds in UI) ────
app.get('/api/config', (req, res) => {
  res.json({
    apiBase:    LIN_API_BASE,
    endpoint:   `${LIN_API_BASE}/api/loans/export`,
    authScheme: 'Key',
    authKey:    LIN_API_KEY,
    authHeader: `Authorization: Key ${LIN_API_KEY}`,
    queryParams: 'from=<ISO8601>&to=<ISO8601>'
  });
});

// ── Proxy: Check upstream backend health ───────────────────────
app.get('/api/upstream-health', async (req, res) => {
  try {
    const r = await axios.get(`${LIN_API_BASE}/`, { timeout: 10000 });
    res.json({ reachable: true, status: r.status, data: r.data });
  } catch (err) {
    res.status(503).json({
      reachable: false,
      error: err.message,
      code: err.code || null
    });
  }
});

// ── Proxy: Loan Applications Export ───────────────────────────
app.get('/api/loans', async (req, res) => {
  try {
    const { from } = req.query;
    // Force the 'to' date to be far in the future so that clock/timezone sync issues don't hide new applications
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const to = futureDate.toISOString();

    if (!from) {
      return res.status(400).json({ error: 'The "from" query param is required.' });
    }

    console.log(`[PROXY] Fetching loans from=${from} to=${to}`);

    const r = await axios.get(`${LIN_API_BASE}/api/loans/export`, {
      params: { from, to },
      headers: {
        Authorization: `Key ${LIN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const data    = Array.isArray(r.data?.data) ? r.data.data : [];
    const elapsed = r.headers['x-response-time'] || null;

    console.log(`[PROXY] Returned ${data.length} records`);
    res.json({ success: true, count: data.length, data, elapsed });

  } catch (err) {
    const status = err.response?.status || 500;
    const msg    = err.response?.data?.message || err.message;
    console.error(`[PROXY] Error: ${status} — ${msg}`);
    res.status(status).json({ success: false, error: msg });
  }
});

// ── Proxy: Loan Status List ────────────────────────────────────
app.get('/api/loans/status', async (req, res) => {
  try {
    const r = await axios.get(`${LIN_API_BASE}/api/loans/status`, {
      headers: { Authorization: `Key ${LIN_API_KEY}` },
      timeout: 15000
    });
    res.json(r.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// ── Proxy: Loan Update Status (LOS) ────────────────────────────
app.put('/api/loans/update-status', async (req, res) => {
  try {
    const r = await axios.put(`${LIN_API_BASE}/api/loans/update-status`, req.body, {
      headers: { 
        Authorization: `Key ${LIN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    res.json(r.data);
  } catch (err) {
    const status = err.response?.status || 500;
    const msg    = err.response?.data?.message || err.message;
    res.status(status).json({ success: false, error: msg });
  }
});

// ── Proxy: Trigger LOS Push ──────────────────────────────────────
app.post('/api/los/trigger/:applicationId', async (req, res) => {
  try {
    const r = await axios.post(`${LIN_API_BASE}/api/los/applications/${req.params.applicationId}/trigger`, null, {
      headers: { Authorization: `Key ${LIN_API_KEY}` },
      timeout: 30000
    });
    res.json(r.data);
  } catch (err) {
    const status = err.response?.status || 500;
    const msg    = err.response?.data?.message || err.message;
    res.status(status).json({ success: false, error: msg });
  }
});

// ── Proxy: LOS Applications List ────────────────────────────────
app.get('/api/los/applications', async (req, res) => {
  try {
    const statusQuery = req.query.status ? `?status=${req.query.status}` : '';
    const r = await axios.get(`${LIN_API_BASE}/api/los/applications${statusQuery}`, {
      headers: { Authorization: `Key ${LIN_API_KEY}` },
      timeout: 30000
    });
    res.json(r.data);
  } catch (err) {
    const status = err.response?.status || 500;
    const msg    = err.response?.data?.message || err.message;
    res.status(status).json({ success: false, error: msg });
  }
});

// ═══════════════════════════════════════════════════════════════
//  SMART AUDIT PROXY ROUTES
// ═══════════════════════════════════════════════════════════════

// ── Proxy: Get audit logs (with filters) ────────────────────────
app.get('/api/audit/logs', async (req, res) => {
  try {
    const r = await axios.get(`${LIN_API_BASE}/api/audit/logs`, {
      params: req.query,
      headers: { Authorization: `Key ${LIN_API_KEY}` },
      timeout: 15000
    });
    res.json(r.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ success: false, error: err.response?.data?.message || err.message });
  }
});

// ── Proxy: Not-exported applications ────────────────────────────
app.get('/api/audit/not-exported', async (req, res) => {
  try {
    const r = await axios.get(`${LIN_API_BASE}/api/audit/not-exported`, {
      params: req.query,
      headers: { Authorization: `Key ${LIN_API_KEY}` },
      timeout: 15000
    });
    res.json(r.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ success: false, error: err.response?.data?.message || err.message });
  }
});

// ── Proxy: Run single audit ──────────────────────────────────────
app.post('/api/audit/run/:userId/:applicationId?', async (req, res) => {
  try {
    const { userId, applicationId } = req.params;
    const url = applicationId
      ? `${LIN_API_BASE}/api/audit/run/${userId}/${applicationId}`
      : `${LIN_API_BASE}/api/audit/run/${userId}`;
    const r = await axios.post(url, {}, {
      headers: { Authorization: `Key ${LIN_API_KEY}` },
      timeout: 15000
    });
    res.json(r.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ success: false, error: err.response?.data?.message || err.message });
  }
});

// ── Proxy: Bulk audit ────────────────────────────────────────────
app.post('/api/audit/bulk', async (req, res) => {
  try {
    const r = await axios.post(`${LIN_API_BASE}/api/audit/bulk`, req.body, {
      headers: { Authorization: `Key ${LIN_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60000
    });
    res.json(r.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ success: false, error: err.response?.data?.message || err.message });
  }
});

// ── Hardcode Scanner — static analysis of backend source code ───
const fs   = require('fs');
const fsp  = fs.promises;
const pathm = require('path');

// Patterns that indicate suspicious hardcoded values
const HARDCODE_PATTERNS = [
  { pattern: /['"`]Delhi['"`]/gi,        label: 'Hardcoded city: Delhi',          severity: 'HIGH'   },
  { pattern: /['"`]110001['"`]/gi,       label: 'Hardcoded pin code: 110001',     severity: 'HIGH'   },
  { pattern: /['"`]000000['"`]/gi,       label: 'Hardcoded pin code: 000000',     severity: 'HIGH'   },
  { pattern: /['"`]N\/A['"`]/gi,         label: 'Hardcoded placeholder: N/A',     severity: 'MEDIUM' },
  { pattern: /['"`]-['"`]/gi,            label: 'Hardcoded placeholder: -',       severity: 'LOW'    },
  { pattern: /['"`]Salaried['"`]/gi,     label: 'Hardcoded occupation: Salaried', severity: 'MEDIUM' },
  { pattern: /['"`]Bank Transfer['"`]/gi,label: 'Hardcoded salary mode',          severity: 'MEDIUM' },
  { pattern: /paromita\$432/gi,          label: 'API Key hardcoded in source',    severity: 'CRITICAL'},
  { pattern: /['"`]30000['"`]/gi,        label: 'Hardcoded salary: 30000',        severity: 'MEDIUM' },
  { pattern: /\|\|\s*['"`]Delhi['"`]/gi, label: 'Default fallback to Delhi',      severity: 'HIGH'   },
];

const SCAN_EXTENSIONS = ['.js', '.ts', '.tsx', '.jsx'];
const SCAN_IGNORE     = ['node_modules', '.git', '.next', 'dist', 'build', 'coverage'];

async function scanDir(dir, results = []) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return results; }

  for (const entry of entries) {
    if (SCAN_IGNORE.some(ig => entry.name === ig)) continue;
    const full = pathm.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDir(full, results);
    } else if (SCAN_EXTENSIONS.includes(pathm.extname(entry.name))) {
      let src;
      try { src = await fsp.readFile(full, 'utf8'); } catch { continue; }
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        for (const { pattern, label, severity } of HARDCODE_PATTERNS) {
          if (pattern.test(line)) {
            results.push({
              file:     full,
              line:     i + 1,
              code:     line.trim().slice(0, 120),
              label,
              severity
            });
          }
          pattern.lastIndex = 0;
        }
      });
    }
  }
  return results;
}

app.get('/api/audit/scan', async (req, res) => {
  try {
    // Scan Backend + LIN_Front (relative to this server)
    const backendDir  = pathm.join(__dirname, '..', 'Backend');
    const frontendDir = pathm.join(__dirname, '..', 'LIN_Front');

    const [backendFindings, frontendFindings] = await Promise.all([
      fs.existsSync(backendDir)  ? scanDir(backendDir)  : [],
      fs.existsSync(frontendDir) ? scanDir(frontendDir) : [],
    ]);

    const all = [...backendFindings, ...frontendFindings];

    const summary = {
      CRITICAL: all.filter(f => f.severity === 'CRITICAL').length,
      HIGH:     all.filter(f => f.severity === 'HIGH').length,
      MEDIUM:   all.filter(f => f.severity === 'MEDIUM').length,
      LOW:      all.filter(f => f.severity === 'LOW').length,
      total:    all.length
    };

    res.json({ success: true, summary, findings: all });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ── Proxy: Test Runner (HTML Report) ───────────────────────────
app.get('/test-report', async (req, res) => {
  try {
    const html = await generateHtmlReport();
    res.send(html);
  } catch (err) {
    res.status(500).send("<h2>Test failed to execute:</h2><pre>" + err.message + "</pre>");
  }
});

// ── Fallback → serve index.html ───────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ┌──────────────────────────────────────────┐');
    console.log(`  │  LoanInNeed Application Viewer           │`);
    console.log(`  │  http://localhost:${PORT}                   │`);
    console.log('  │  Proxying → ' + LIN_API_BASE.slice(8, 38).padEnd(28) + '│');
    console.log('  └──────────────────────────────────────────┘');
    console.log('');
  });
}

// Export the Express API for Vercel
module.exports = app;
