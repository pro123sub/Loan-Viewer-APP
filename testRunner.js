const axios = require('axios');

const FRONTEND_BASE = "https://seahorse-app-92emo.ondigitalocean.app";
const BACKEND_BASE = "https://lionfish-app-mg3te.ondigitalocean.app";

const testSuite = [
  { category: "Frontend", name: "Home Page Routing", url: `${FRONTEND_BASE}/`, method: "GET", expectStatus: [200, 304] },
  { category: "Frontend", name: "Apply Now Form", url: `${FRONTEND_BASE}/apply-now`, method: "GET", expectStatus: [200, 304] },
  { category: "Frontend", name: "Track Loan Tracker", url: `${FRONTEND_BASE}/track-loan`, method: "GET", expectStatus: [200, 304] },
  { category: "Frontend", name: "Static Content", url: `${FRONTEND_BASE}/about-us`, method: "GET", expectStatus: [200, 304] },
  { 
    category: "Backend System", 
    name: "Primary Health Check", 
    url: `${BACKEND_BASE}/`, 
    method: "GET", 
    expectStatus: [200],
    validate: (data) => data.status === 'healthy' || data.message
  },
  { 
    category: "Auth Security", 
    name: "OTP Request", 
    url: `${BACKEND_BASE}/api/auth/phone/request-otp`, 
    method: "POST", 
    data: { phone: "invalid" },
    expectStatus: [400, 422, 500] 
  },
  { category: "JWT Protection", name: "Secure Route: Profile", url: `${BACKEND_BASE}/api/users/profile/complete`, method: "GET", expectStatus: [401, 403] },
  { category: "JWT Protection", name: "Secure Route: KYC", url: `${BACKEND_BASE}/api/kyc/`, method: "GET", expectStatus: [401, 403, 404] },
  { category: "JWT Protection", name: "Secure Route: Partner", url: `${BACKEND_BASE}/api/partners/dashboard`, method: "GET", expectStatus: [401, 403] },
  { category: "Validation", name: "Selfie Upload (Missing)", url: `${BACKEND_BASE}/api/selfie/upload`, method: "POST", expectStatus: [400, 401, 403] }
];

async function generateHtmlReport() {
  let totalScore = 0;
  const maxScore = testSuite.length * 10;
  const results = [];

  for (const test of testSuite) {
    let status = "PENDING";
    let latency = 0;
    let endpointScore = 0;
    let message = "";
    
    const startTime = Date.now();
    try {
      const response = await axios({
        method: test.method,
        url: test.url,
        data: test.data,
        timeout: 10000,
        headers: { "Content-Type": "application/json" }
      });
      latency = Date.now() - startTime;
      
      if (test.expectStatus.includes(response.status)) {
        let valid = true;
        if (test.validate && typeof test.validate === 'function') {
           valid = test.validate(response.data);
        }
        if (valid) {
          status = "PASS";
          endpointScore = 10;
          message = `Status ${response.status} (Valid Payload)`;
        } else {
          status = "WARN";
          endpointScore = 5;
          message = `Status ${response.status} (Invalid Payload)`;
        }
      } else {
        status = "FAIL";
        message = `Expected ${test.expectStatus.join('/')}, Got ${response.status}`;
      }
    } catch (err) {
      latency = Date.now() - startTime;
      if (err.response) {
        if (test.expectStatus.includes(err.response.status)) {
          status = "PASS";
          endpointScore = 10;
          message = `Status ${err.response.status} (Expected Error)`;
        } else {
          status = "FAIL";
          message = `Expected ${test.expectStatus.join('/')}, Got ${err.response.status}`;
        }
      } else if (err.code === 'ECONNABORTED') {
        status = "FAIL";
        message = "Timeout (> 10s)";
      } else {
        status = "FAIL";
        message = err.message;
      }
    }
    
    if (endpointScore > 0) {
       if (latency > 2000) endpointScore -= 5;
       else if (latency > 1000) endpointScore -= 2;
    }
    
    totalScore += endpointScore;
    results.push({ ...test, status, latency, score: endpointScore, message });
  }

  const finalPercentage = ((totalScore / maxScore) * 100).toFixed(1);
  const healthGrade = finalPercentage >= 95 ? "A+ (Excellent)" : 
                    finalPercentage >= 85 ? "B (Good)" : 
                    finalPercentage >= 70 ? "C (Fair)" : "F (Critical Issues)";

  let html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>LoanInNeed Production Diagnostic Report</title>
    <style>
      body { font-family: 'Inter', sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 40px; }
      .container { max-width: 900px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); }
      h1 { color: #38bdf8; text-align: center; font-size: 28px; margin-bottom: 10px; }
      p.subtitle { text-align: center; color: #94a3b8; margin-bottom: 30px; }
      .score-board { display: flex; justify-content: space-around; background: #0f172a; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
      .score-item { text-align: center; }
      .score-item h2 { margin: 0; font-size: 36px; color: #10b981; }
      .score-item span { color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
      table { width: 100%; border-collapse: collapse; background: #0f172a; border-radius: 8px; overflow: hidden; }
      th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #1e293b; }
      th { background-color: #334155; color: #cbd5e1; font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
      td { font-size: 14px; color: #e2e8f0; }
      .status-PASS { color: #10b981; font-weight: bold; }
      .status-FAIL { color: #ef4444; font-weight: bold; }
      .status-WARN { color: #f59e0b; font-weight: bold; }
      .latency { color: #cbd5e1; font-family: monospace; }
      .btn-back { display: inline-block; margin-top: 30px; padding: 10px 20px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; transition: background 0.2s; }
      .btn-back:hover { background: #2563eb; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>🚀 System Diagnostic Report</h1>
      <p class="subtitle">Real-time Production Environment Analysis</p>
      
      <div class="score-board">
        <div class="score-item">
          <h2>${totalScore}/${maxScore}</h2>
          <span>Overall Score</span>
        </div>
        <div class="score-item">
          <h2>${finalPercentage}%</h2>
          <span>Health Rate</span>
        </div>
        <div class="score-item">
          <h2 style="color: ${finalPercentage >= 85 ? '#10b981' : '#ef4444'}">${healthGrade}</h2>
          <span>Grade</span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Endpoint Target</th>
            <th>Status</th>
            <th>Latency</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>`;

  results.forEach(res => {
    html += `
          <tr>
            <td>${res.category}</td>
            <td><strong>${res.name}</strong><br><span style="font-size:11px;color:#64748b;">${res.method} ${res.url.replace('https://','')}</span></td>
            <td class="status-${res.status}">${res.status}</td>
            <td class="latency">${res.latency}ms</td>
            <td style="font-size:13px; color:#94a3b8;">${res.message}</td>
          </tr>`;
  });

  html += `
        </tbody>
      </table>
      <div style="text-align: center;">
        <a href="/" class="btn-back">← Back to Dashboard</a>
      </div>
    </div>
  </body>
  </html>`;

  return html;
}

module.exports = { generateHtmlReport };
