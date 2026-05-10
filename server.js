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
