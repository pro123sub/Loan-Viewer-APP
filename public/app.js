/**
 * app.js — LoanInNeed Application Viewer (Express version)
 * Calls /api/loans on our own Express server (no CORS issues)
 */

/* ─── State ─────────────────────────────────────────────── */
let allData      = [];
let filtered     = [];
let currentPage  = 1;
let sortCol      = 'createdAt';
let sortDir      = 'desc';
let statusFilter = 'ALL';

/* ─── DOM refs ──────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ─── Init ──────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  setDefaultDates();
  checkUpstreamHealth();
  loadApiConfig();
});

function setDefaultDates() {
  const now  = new Date();
  const from = new Date(now); from.setDate(from.getDate() - 365);
  $('to-date').value   = toLocalDT(now);
  $('from-date').value = toLocalDT(from);
}

function toLocalDT(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ─── Server health check ───────────────────────────────── */
async function checkUpstreamHealth() {
  const dot  = $('status-dot');
  const txt  = $('status-text');
  try {
    const r = await fetch('/api/upstream-health');
    const j = await r.json();
    if (j.reachable) {
      dot.className = 'status-dot online';
      txt.textContent = 'Backend online';
    } else {
      dot.className = 'status-dot offline';
      txt.textContent = 'Backend offline';
    }
  } catch {
    dot.className = 'status-dot offline';
    txt.textContent = 'Cannot reach server';
  }
}

/* ─── Views ─────────────────────────────────────────────── */
function showView(name) {
  // Hide all view panels
  document.querySelectorAll('.view-content').forEach(v => v.classList.add('hidden'));
  
  // Show target view
  const target = $(`view-${name}`);
  if (target) target.classList.remove('hidden');
  
  // Highlight active sidebar item
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    const onc = n.getAttribute('onclick') || '';
    if (onc.includes(`showView('${name}')`)) {
      n.classList.add('active');
    }
  });

  const titles = { 
    applications: 'All Applications', 
    stats: 'Analytics', 
    'los-jobs': 'LOS Integration Jobs',
    audit: 'Smart Audit Center',
    scanner: 'Hardcoded Value Detector'
  };
  const subs   = { 
    applications: 'Fetch loan applications by date range', 
    stats: 'Charts and breakdowns', 
    'los-jobs': 'Monitor and manual trigger for LOS sync tasks',
    audit: 'Categorization, document validation, and export logs',
    scanner: 'Static analysis tool to scan source code for hardcoded defaults'
  };
  
  $('page-title').textContent = titles[name] || name;
  $('page-sub').textContent   = subs[name]   || '';

  // Trigger page-specific loads
  if (name === 'audit') {
    loadAuditLogs();
  }
}

function toggleSidebar() {
  $('sidebar').classList.toggle('open');
}

/* ─── Preset Dates ──────────────────────────────────────── */
function setPreset(days) {
  const now  = new Date();
  const from = new Date(now);
  if (days >= 9000) { from.setFullYear(2020, 0, 1); }
  else { from.setDate(from.getDate() - days); }
  $('to-date').value   = toLocalDT(now);
  $('from-date').value = toLocalDT(from);
}

/* ─── Fetch ─────────────────────────────────────────────── */
async function fetchLoans() {
  const fromVal = $('from-date').value;
  const toVal   = $('to-date').value;

  if (!fromVal || !toVal) {
    showAlert('Please select both From and To dates.', 'error'); return;
  }
  if (new Date(fromVal) > new Date(toVal)) {
    showAlert('From date must be earlier than To date.', 'error'); return;
  }

  const fromISO = new Date(fromVal).toISOString();
  const toISO   = new Date(toVal).toISOString();

  setLoading(true);
  hideAll();

  try {
    const res = await fetch(`/api/loans?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`);
    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.error || `HTTP ${res.status}`);
    }

    allData  = json.data || [];
    filtered = [...allData];
    currentPage  = 1;
    statusFilter = 'ALL';
    sortCol = 'createdAt'; sortDir = 'desc';

    // reset UI state
    $('search-inp').value = '';
    $('clear-search-btn').classList.add('hidden');
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.chip-all').classList.add('active');

    setLoading(false);

    if (allData.length === 0) {
      showAlert('No applications found in the selected date range.', 'info');
      $('empty-state').classList.remove('hidden');
      $('empty-state').querySelector('h2').textContent = 'No results';
      $('empty-state').querySelector('p').textContent = 'Try a wider date range.';
      return;
    }

    showAlert(`✓ Loaded ${allData.length} application${allData.length !== 1 ? 's' : ''} successfully.`, 'success');
    updateBadge(allData.length);
    updateStats(allData);
    sortData();
    renderTable();

  } catch (err) {
    setLoading(false);
    showAlert('❌ ' + err.message, 'error');
    $('empty-state').classList.remove('hidden');
    $('empty-state').querySelector('h2').textContent = 'Failed to load';
    $('empty-state').querySelector('p').innerHTML = `<strong>${err.message}</strong>`;
  }
}

/* ─── Loading states ────────────────────────────────────── */
function setLoading(on) {
  $('fetch-btn').disabled = on;
  $('loader').classList.toggle('hidden', !on);
}

function hideAll() {
  $('empty-state').classList.add('hidden');
  $('no-results').classList.add('hidden');
  $('table-wrap').classList.add('hidden');
  $('pagination').classList.add('hidden');
  $('stats-row').classList.add('hidden');
  $('table-controls').classList.add('hidden');
  $('tab-bar').classList.add('hidden');
  $('json-panel').classList.add('hidden');
  $('export-btn').classList.add('hidden');
  $('view-json-btn').classList.add('hidden');
  $('record-badge').classList.add('hidden');
  hideAlert();
}

/* ─── Alert ─────────────────────────────────────────────── */
function showAlert(msg, type) {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  $('alert-icon').textContent = icons[type] || 'ℹ';
  $('alert-msg').textContent  = msg;
  const bar = $('alert-bar');
  bar.className = `alert-bar ${type}`;
  bar.classList.remove('hidden');
}
function hideAlert() { $('alert-bar').classList.add('hidden'); }

/* ─── Stats ─────────────────────────────────────────────── */
function updateStats(data) {
  const pending  = data.filter(d => d.status === 'PENDING').length;
  const approved = data.filter(d => d.status === 'APPROVED').length;
  const rejected = data.filter(d => d.status === 'REJECTED').length;
  const total    = data.reduce((s, d) => s + (Number(d.loanAmount) || 0), 0);

  $('s-total').textContent    = data.length;
  $('s-pending').textContent  = pending;
  $('s-approved').textContent = approved;
  $('s-rejected').textContent = rejected;
  $('s-amount').textContent   = '₹ ' + total.toLocaleString('en-IN');

  $('stats-row').classList.remove('hidden');
}

function updateBadge(n) {
  const badge = $('record-badge');
  badge.textContent = `${n} record${n !== 1 ? 's' : ''}`;
  badge.classList.remove('hidden');
  $('export-btn').classList.remove('hidden');
  $('view-json-btn').classList.remove('hidden');
  $('tab-bar').classList.remove('hidden');
  $('table-controls').classList.remove('hidden');
  // default to table tab
  switchTab('table');
}

/* ─── Sort ──────────────────────────────────────────────── */
function sortBy(col) {
  sortDir = (sortCol === col && sortDir === 'asc') ? 'desc' : 'asc';
  sortCol = col; currentPage = 1;
  sortData(); renderTable();
}

function sortData() {
  filtered.sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (['loanAmount','monthlyIncome'].includes(sortCol)) { va = Number(va)||0; vb = Number(vb)||0; }
    else if (['createdAt','updatedAt'].includes(sortCol))  { va = new Date(va).getTime()||0; vb = new Date(vb).getTime()||0; }
    else { va = String(va||'').toLowerCase(); vb = String(vb||'').toLowerCase(); }
    return sortDir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
  });
}

/* ─── Filter ────────────────────────────────────────────── */
function doFilter() {
  const q = ($('search-inp').value || '').toLowerCase().trim();
  $('clear-search-btn').classList.toggle('hidden', !q);

  filtered = allData.filter(row => {
    const matchStatus =
      statusFilter === 'ALL' ||
      (row.status||'').toUpperCase() === statusFilter;
    if (!matchStatus) return false;
    if (!q) return true;
    return [row.name, row.mobileNo, row.personalEmail, row.panNo,
            row.aadhaarNo, row.state, row.district, row.designation,
            row.incomeType, row.status, row.fatherName].join(' ').toLowerCase().includes(q);
  });
  currentPage = 1; sortData(); renderTable();
}

function clearSearch() {
  $('search-inp').value = '';
  doFilter();
}

function clearAllFilters() {
  $('search-inp').value = '';
  statusFilter = 'ALL';
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.chip-all').classList.add('active');
  doFilter();
}

function setStatusFilter(btn) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  statusFilter = btn.dataset.s;
  doFilter();
}

/* ─── Render Table ──────────────────────────────────────── */
function renderTable() {
  const per   = parseInt($('per-page').value) || 25;
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / per));
  if (currentPage > pages) currentPage = pages;

  const start = (currentPage - 1) * per;
  const slice = filtered.slice(start, start + per);

  // Showing label
  $('showing-label').textContent = total
    ? `${start+1}–${Math.min(start+per, total)} of ${total}`
    : '0 results';

  // No results state
  if (total === 0) {
    $('table-wrap').classList.add('hidden');
    $('pagination').classList.add('hidden');
    $('no-results').classList.remove('hidden');
    return;
  }
  $('no-results').classList.add('hidden');

  const tbody = $('tbody');
  tbody.innerHTML = '';

  slice.forEach((r, idx) => {
    const amountStr = r.loanAmount != null ? '₹ ' + Number(r.loanAmount).toLocaleString('en-IN') : '—';
    const dateStr   = r.createdAt  ? new Date(r.createdAt).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-no">${start + idx + 1}</td>
      <td title="${esc(r.name)}" style="font-weight:600">${esc(r.name) || '—'}</td>
      <td class="mono">${esc(r.mobileNo) || '—'}</td>
      <td>${esc(r.incomeType) || '—'}</td>
      <td class="amount-cell">${amountStr}</td>
      <td title="${esc(r.loanPurpose)}">${trunc(r.loanPurpose,20) || '—'}</td>
      <td><span class="badge ${badgeClass(r.status)}">${esc(r.status) || '—'}</span></td>
      <td style="color:var(--muted);font-size:12px">${dateStr}</td>
      <td title="${esc(r.reason)}" style="color:var(--muted);font-size:12px">${trunc(r.reason,22) || '—'}</td>
      <td class="th-action">
        <button class="view-btn" onclick="openModal(${start + idx})">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          View
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Update sort indicators
  document.querySelectorAll('th[data-col]').forEach(th => {
    th.classList.toggle('sorted', th.dataset.col === sortCol);
    const si = $(`si-${th.dataset.col}`);
    if (si) si.textContent = th.dataset.col === sortCol ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
  });

  $('table-wrap').classList.remove('hidden');
  renderPagination(total, per, pages);
}

/* ─── Pagination ────────────────────────────────────────── */
function renderPagination(total, per, pages) {
  const pag = $('pagination');
  const info = `Showing ${Math.min((currentPage-1)*per+1,total)}–${Math.min(currentPage*per,total)} of ${total} applications`;

  let btns = `<span class="pg-info">${info}</span><div class="pg-btns">`;
  btns += `<button class="pg-btn" onclick="goPage(${currentPage-1})" ${currentPage<=1?'disabled':''}>‹</button>`;

  const range = [];
  for (let p = Math.max(1, currentPage-2); p <= Math.min(pages, currentPage+2); p++) range.push(p);
  if (range[0] > 1) btns += `<button class="pg-btn" onclick="goPage(1)">1</button>${range[0]>2?'<span style="align-self:center;color:var(--dim);padding:0 3px;font-size:11px">…</span>':''}`;
  range.forEach(p => btns += `<button class="pg-btn ${p===currentPage?'active':''}" onclick="goPage(${p})">${p}</button>`);
  if (range[range.length-1] < pages) btns += `${range[range.length-1]<pages-1?'<span style="align-self:center;color:var(--dim);padding:0 3px;font-size:11px">…</span>':''}<button class="pg-btn" onclick="goPage(${pages})">${pages}</button>`;
  btns += `<button class="pg-btn" onclick="goPage(${currentPage+1})" ${currentPage>=pages?'disabled':''}>›</button></div>`;

  pag.innerHTML = btns;
  pag.classList.remove('hidden');
}

function goPage(p) {
  const per   = parseInt($('per-page').value) || 25;
  const pages = Math.max(1, Math.ceil(filtered.length / per));
  currentPage = Math.max(1, Math.min(p, pages));
  renderTable();
}

/* ─── Modal ─────────────────────────────────────────────── */
let currentModalIdx = null;

function openModal(idx) {
  currentModalIdx = idx;
  const r = filtered[idx]; if (!r) return;
  const initials = (r.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  $('modal-avatar').textContent = initials;
  $('modal-name').textContent   = r.name || 'Applicant';

  // Meta row (status + date)
  const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'}) : '';
  $('modal-meta-row').innerHTML = `
    <span class="badge ${badgeClass(r.status)}">${esc(r.status)}</span>
    <span style="font-size:12px;color:var(--muted)">${dateStr}</span>
    ${r.reason ? `<span style="font-size:12px;color:var(--muted)">• ${esc(r.reason)}</span>` : ''}`;

  $('modal-body').innerHTML = buildModalBody(r);
  $('modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function closeModalOut(e) { if (e.target === $('modal')) closeModal(); }
document.addEventListener('keydown', e => { 
  if (e.key === 'Escape') {
    if (!$('update-modal').classList.contains('hidden')) {
      closeUpdateModal();
    } else {
      closeModal();
    }
  } 
});

/* ─── Update Modal ───────────────────────────────────────── */
function openUpdateModal() {
  const r = filtered[currentModalIdx];
  if (!r) return;

  $('update-id').value = r.id;
  $('update-status').value = r.status || 'PENDING';
  $('update-reason').value = r.reason || '';
  $('update-employee-id').value = r.employeeId || ''; // Maps to whatever was populated, if any
  $('update-employee-name').value = r.employeeName || '';
  $('update-loan-no').value = r.loanAccountNumber || '';
  $('update-app-no').value = r.applicationNumber || '';

  $('update-modal-meta').textContent = `Application ID: ${r.id} | Name: ${r.name || 'N/A'}`;

  $('update-modal').classList.remove('hidden');
}

function closeUpdateModal() {
  $('update-modal').classList.add('hidden');
}

function closeUpdateModalOut(e) {
  if (e.target === $('update-modal')) closeUpdateModal();
}

async function submitUpdate(e) {
  e.preventDefault();
  
  const id     = $('update-id').value;
  const status = $('update-status').value;
  const reason = $('update-reason').value;
  const empId  = $('update-employee-id').value;
  const empName= $('update-employee-name').value;
  const loanNo = $('update-loan-no').value;
  const appNo  = $('update-app-no').value;

  const btn = $('btn-submit-update');
  btn.disabled = true;
  btn.textContent = 'Updating...';

  try {
    const res = await fetch('/api/loans/update-status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: id,
        status: status,
        reason: reason,
        employeeId: empId,
        employeeName: empName,
        loanNo: loanNo,
        applicationNumber: appNo
      })
    });
    const parsed = await res.json();
    
    if (parsed.success) {
      alert('Application updated successfully.');
      closeUpdateModal();
      // Optional: Update table instead of whole refresh, but refresh is safest.
      fetchLoans(); // Refresh all
      closeModal(); // Close detail view too, since its stale
    } else {
      alert('Failed to update: ' + (parsed.error || parsed.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to update: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm Update';
  }
}

async function triggerLosPush() {
  const r = filtered[currentModalIdx];
  if (!r) return;

  const btn = $('btn-push-los');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Pushing...';

  try {
    const res = await fetch(`/api/los/trigger/${r.applicationNumber || r.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    let parsed;
    try {
        parsed = await res.json();
    } catch {
        throw new Error('Invalid response from server.');
    }
    
    if (res.ok && parsed.success) {
      alert('LOS Integration triggered successfully!\nCase Number: ' + (parsed.job?.losCaseNumber || 'Pending'));
      // Optional: Update table instead of whole refresh, but refresh is safest.
      fetchLoans(); 
    } else {
      alert('Failed to trigger LOS: ' + (parsed.error || parsed.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to trigger LOS: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function buildModalBody(r) {
  const sec = (title, icon, rows) => `
    <div class="detail-section">
      <div class="detail-section-hdr">${icon} ${title}</div>
      <div class="detail-grid">${rows}</div>
    </div>`;

  const row = (label, val, cls = '') => {
    const isNull = val === null || val === undefined || val === '';
    return `<div class="d-item">
      <div class="d-label">${label}</div>
      <div class="d-val ${isNull ? 'null' : cls}">${isNull ? 'Not provided' : esc(String(val))}</div>
    </div>`;
  };

  const boolRow = (label, val) => `<div class="d-item">
    <div class="d-label">${label}</div>
    <div class="d-val ${val?'green':'red'}">${val ? '✓ Yes' : '✗ No'}</div>
  </div>`;

  const amtFmt = v => v != null ? '₹ ' + Number(v).toLocaleString('en-IN') : null;
  const dateFmt = v => v ? new Date(v).toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'}) : null;
  
  const geo = r.geolocation;

  const getMimeAndExt = (b64) => {
    if (b64.startsWith('JVBERi0')) return { mime: 'application/pdf', ext: '.pdf' };
    if (b64.startsWith('/9j/')) return { mime: 'image/jpeg', ext: '.jpg' };
    if (b64.startsWith('iVBORw0KGgo')) return { mime: 'image/png', ext: '.png' };
    return { mime: 'application/octet-stream', ext: '' };
  };

  // Backend sends ["Base64", "filename.jpg,ACTUALBASE64DATA"]
  // We need to strip the "filename," prefix to get the raw base64.
  const extractB64 = (raw) => {
    if (!raw) return null;
    const commaIdx = raw.indexOf(',');
    // If it looks like a URL (http/data:) or no comma exists, return as-is for fallback
    if (commaIdx === -1 || raw.startsWith('http') || raw.startsWith('data:')) return raw;
    const b64Part = raw.substring(commaIdx + 1);
    // Sanity check: a valid base64 string won't be short
    return b64Part.length > 10 ? b64Part : raw;
  };

  const renderDocItem = (label, b64, filename, idx) => {
    const { mime, ext } = getMimeAndExt(b64);
    const isImage = mime.startsWith('image/');
    const downloadName = filename || `${label.replace(/\s+/g, '_')}${idx !== undefined ? '_' + (idx + 1) : ''}${ext}`;
    const dataUri = `data:${mime};base64,${b64}`;
    return [
      isImage
        ? `<a href="${dataUri}" target="_blank"><img src="${dataUri}" alt="${label}" style="max-width:120px;max-height:90px;border-radius:6px;border:1px solid var(--border);object-fit:cover;display:block;margin-bottom:4px;"/></a>`
        : '',
      `<a href="${dataUri}" download="${downloadName}" style="color:var(--teal);text-decoration:underline;font-weight:bold;font-size:12px;" target="_blank">`,
      `${isImage ? '🖼' : '📄'} ${downloadName}`,
      `</a>`
    ].join('');
  };

  const docLink = (label, docData) => {
    if (!docData) return row(label, null);

    const renderTuple = (tuple, i) => {
       const b64 = tuple[0];
       const filename = tuple[1];
       if (b64 && b64.length > 10 && !b64.startsWith('http')) {
         return `<div style="margin-bottom:10px;">${renderDocItem(label, b64, filename, i)}</div>`;
       } else if (b64 && b64.startsWith('http')) {
         return `<div style="margin-bottom:4px;"><a href="${b64}" target="_blank" style="color:var(--muted);font-size:12px;">Placeholder ${i+1}</a></div>`;
       }
       return '';
    };

    // Case 1 — Multi-doc: array of arrays [ [b64, name], [b64, name] ]
    if (Array.isArray(docData) && Array.isArray(docData[0])) {
      let html = '';
      docData.forEach((d, i) => { html += renderTuple(d, i); });
      return `<div class="d-item"><div class="d-label">${label}</div><div class="d-val">${html || '<span style="color:var(--dim)">Not provided</span>'}</div></div>`;
    }

    // Case 2 — Single doc: array of strings [b64, name]
    if (Array.isArray(docData) && typeof docData[0] === 'string') {
      const html = renderTuple(docData, 0);
      return `<div class="d-item"><div class="d-label">${label}</div><div class="d-val">${html || '<span style="color:var(--dim)">Not provided</span>'}</div></div>`;
    }

    return row(label, null);
  };


  return `<div class="detail-sections">
    ${sec('Personal Information', '👤', `
      ${row('Full Name', r.name, 'bold')}
      ${row("Father's Name", r.fatherName)}
      ${row('Date of Birth', dateFmt(r.dob))}
      ${row('Gender', r.gender)}
      ${row('Mobile No', r.mobileNo, 'mono')}
      ${boolRow('Mobile OTP Verified', r.isMobileOtpVerified)}
      ${row('Email', r.personalEmail)}
      ${boolRow('Email OTP Verified', r.isPersonalEmailOtpVerified)}
    `)}
    ${sec('Loan Details', '💰', `
      ${row('Loan Amount', amtFmt(r.loanAmount), 'amount')}
      ${row('Loan Period', r.loanPeriod ? r.loanPeriod + ' months' : null)}
      ${row('Loan Purpose', r.loanPurpose)}
      ${row('Preferred EMI Date', r.preferredEmiDate ? 'Day ' + r.preferredEmiDate : null)}
      ${row('Status', r.status)}
      ${row('Reason', r.reason, 'red')}
      ${row('Application #', r.applicationNumber)}
      ${row('Loan Account #', r.loanAccountNumber, 'mono')}
    `)}
    ${sec('Employment & Income', '💼', `
      ${row('Income Type', r.incomeType)}
      ${row('Employer / Designation', r.designation)}
      ${row('Organization', r.organizationName)}
      ${row('Monthly Income', amtFmt(r.monthlyIncome), 'amount')}
      ${row('Working Years', r.workingYears)}
      ${row('Office Email', r.officeEmail)}
      ${boolRow('Office Email Verified', r.isOfficeEmailVerified)}
      ${row('Verified By', r.employeeName)}
    `)}
    ${sec('KYC & Identity', '🪪', `
      ${row('Aadhaar No.', r.aadhaarNo ? String(r.aadhaarNo).replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') : null, 'mono')}
      ${row('PAN No.', r.panNo, 'mono')}
      ${boolRow('Terms Accepted', r.termsAccepted)}
    `)}
    ${sec('Bank Details', '🏦', `
      ${row('Account No.', r.bankAccountNo, 'mono')}
      ${row('IFSC Code', r.ifscCode, 'mono')}
      ${row('Bank Name', r.bankName)}
    `)}
    ${sec('Address', '📍', `
      ${row('Address Line 1', r.address1)}
      ${row('Address Line 2', r.address2)}
      ${row('Landmark', r.landmark)}
      ${row('Area', r.area)}
      ${row('District', r.district)}
      ${row('State', r.state)}
      ${row('PIN Code', r.pinCode, 'mono')}
      ${row('Latitude', geo?.latitude)}
      ${row('Longitude', geo?.longitude)}
    `)}
    ${sec('Timestamps', '🕐', `
      ${row('Created At', r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : null)}
      ${row('Updated At', r.updatedAt ? new Date(r.updatedAt).toLocaleString('en-IN') : null)}
      ${row('Steps Completed', r.stepsCompleted)}
      ${boolRow('Fully Filled', r.isFullyFilled)}
    `)}
    ${sec('Documents', '📄', `
      ${docLink('Profile Picture', r.profilePicture)}
      ${docLink('Aadhaar Front', r.aadhaarFront)}
      ${docLink('Aadhaar Back', r.aadhaarBack)}
      ${docLink('PAN Card', r.panCard)}
      ${docLink('Address Document', r.addressDocument)}
      ${docLink('Salary Slips', r.salarySlips)}
      ${docLink('Bank Statements', r.bankStatements)}
    `)}
  </div>`;
}

/* ─── CSV Export ────────────────────────────────────────── */
function exportCSV() {
  if (!filtered.length) return;
  const cols = [
    ['Name','name'],['Father Name','fatherName'],['DOB','dob'],['Gender','gender'],
    ['Mobile','mobileNo'],['Email','personalEmail'],['Income Type','incomeType'],
    ['Designation','designation'],['Monthly Income','monthlyIncome'],
    ['Loan Amount','loanAmount'],['Loan Purpose','loanPurpose'],
    ['Status','status'],['Reason','reason'],['PAN','panNo'],['Aadhaar','aadhaarNo'],
    ['State','state'],['District','district'],['PIN','pinCode'],
    ['App Number','applicationNumber'],['Created At','createdAt'],['Updated At','updatedAt']
  ];
  const header = cols.map(c => `"${c[0]}"`).join(',');
  const rows   = filtered.map(r =>
    cols.map(c => { const v = r[c[1]]; return v==null ? '""' : `"${String(v).replace(/"/g,'""')}"`; }).join(',')
  );
  const blob = new Blob([[header,...rows].join('\n')], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `loan_applications_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

/* ─── Tab Switcher ──────────────────────────────────────── */
let activeTab  = 'table';
let jsonWrapped = false;

function switchTab(tab) {
  activeTab = tab;

  // Update tab buttons
  $('tab-table').classList.toggle('active', tab === 'table');
  $('tab-json').classList.toggle('active',  tab === 'json');

  // Update topbar "View JSON" button label dynamically
  const jsonBtn = $('view-json-btn');
  if (jsonBtn) {
    if (tab === 'json') {
      jsonBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg> Table View`;
      jsonBtn.onclick = () => switchTab('table');
    } else {
      jsonBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> View JSON`;
      jsonBtn.onclick = () => switchTab('json');
    }
  }

  if (tab === 'table') {
    $('table-controls').classList.remove('hidden');
    $('json-panel').classList.add('hidden');
    if (filtered.length) {
      $('table-wrap').classList.remove('hidden');
      $('pagination').classList.remove('hidden');
    }
  } else {
    $('table-controls').classList.add('hidden');
    $('table-wrap').classList.add('hidden');
    $('pagination').classList.add('hidden');
    $('no-results').classList.add('hidden');
    renderJSON();
    $('json-panel').classList.remove('hidden');
  }
}

function renderJSON() {
  const data = filtered.length ? filtered : allData;
  $('json-count-label').textContent =
    `${data.length} record${data.length !== 1 ? 's' : ''} · filtered view`;
  const pre = $('json-output');
  pre.innerHTML = syntaxHighlight(JSON.stringify({ count: data.length, data }, null, 2));
  pre.className  = 'json-output' + (jsonWrapped ? ' wrapped' : '');
}

function syntaxHighlight(json) {
  return json
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      match => {
        if (/^"/.test(match)) {
          if (/:$/.test(match)) return `<span class="json-key">${match}</span>`;
          return `<span class="json-str">${match}</span>`;
        }
        if (/true|false/.test(match)) return `<span class="json-bool">${match}</span>`;
        if (/null/.test(match))       return `<span class="json-null">${match}</span>`;
        return `<span class="json-num">${match}</span>`;
      }
    );
}

async function copyJSON() {
  const data = filtered.length ? filtered : allData;
  const text = JSON.stringify({ count: data.length, data }, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    const btn  = $('copy-json-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  } catch { alert('Copy failed — please copy manually.'); }
}

function downloadJSON() {
  const data = filtered.length ? filtered : allData;
  const blob = new Blob(
    [JSON.stringify({ count: data.length, data }, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url;
  a.download = `loan_applications_${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
}

function toggleJsonWrap() {
  jsonWrapped = !jsonWrapped;
  $('json-output').classList.toggle('wrapped', jsonWrapped);
  $('wrap-btn').style.color = jsonWrapped ? 'var(--teal)' : '';
}

/* ─── API Config Panel ────────────────────── */
async function loadApiConfig() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('cfg-endpoint',    cfg.endpoint    || '');
    set('cfg-auth-header', cfg.authHeader  || '');
    set('cfg-auth-key',    cfg.authKey     || '');
    set('cfg-query-params', cfg.queryParams || '');
  } catch (e) {
    console.warn('[Config] Could not load API config:', e.message);
  }
}

function toggleApiConfig() {
  const panel   = document.getElementById('api-config-panel');
  const chevron = document.getElementById('api-config-chevron');
  const isOpen  = !panel.classList.contains('hidden');
  panel.classList.toggle('hidden', isOpen);
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

async function copyField(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.value);
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    btn.style.color = 'var(--teal)';
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1800);
  } catch { alert('Copy failed.'); }
}


function badgeClass(status) {
  const s = (status||'').toUpperCase();
  if (s === 'PENDING') return 'badge-PENDING';
  if (s === 'APPROVED') return 'badge-APPROVED';
  if (s === 'REJECTED') return 'badge-REJECTED';
  if (s === 'HOLD') return 'badge-HOLD';
  if (s === 'IN_PROGRESS') return 'badge-IN_PROGRESS';
  if (s === 'COMPLETED') return 'badge-COMPLETED';
  if (s === 'CLOSED') return 'badge-CLOSED';
  return 'badge-other';
}
function esc(s) {
  if (s==null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function trunc(s, max) {
  if (!s) return ''; const str = String(s);
  return str.length > max ? str.slice(0,max)+'…' : str;
}

/* ─── LOS Integration Hub Logic ──────────────────────────── */
let losAllData = [];
let losFilteredData = [];
let losFilterStatus = 'ALL';

async function fetchLosJobs() {
  const btn = document.querySelector('#view-los-jobs .btn-primary');
  const ogText = btn.innerHTML;
  btn.innerHTML = 'Fetching...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/los/applications');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch LOS jobs');
    
    losAllData = json.applications || [];
    applyLosFilter();
  } catch(err) {
    alert('Error fetching LOS Jobs: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = ogText;
  }
}

function setLosStatusFilter(btn) {
  document.querySelectorAll('#los-status-chips .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  losFilterStatus = btn.dataset.s;
  applyLosFilter();
}

function applyLosFilter() {
  if (losFilterStatus === 'ALL') {
    losFilteredData = losAllData;
  } else {
    losFilteredData = losAllData.filter(app => {
       const job = app.losIntegrationJob;
       const s = job ? job.status : 'NONE';
       return s === losFilterStatus;
    });
  }
  renderLosJobsTable();
}

function renderLosJobsTable() {
  const tbody = $('los-tbody');
  tbody.innerHTML = '';

  if (losFilteredData.length === 0) {
     tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--muted)">No jobs found</td></tr>';
     return;
  }

  losFilteredData.forEach((app, idx) => {
    const job = app.losIntegrationJob || {};
    const status = job.status || 'NO JOB';
    
    // Status Badge
    let badge = 'badge-other';
    if(status === 'PENDING') badge = 'badge-PENDING';
    if(status === 'SUCCESS') badge = 'badge-APPROVED';
    if(status === 'FAILED')  badge = 'badge-REJECTED';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-no">${idx + 1}</td>
      <td class="mono" style="font-weight:600">${app.id}</td>
      <td title="${esc(app.user?.name)}">${esc(app.user?.name) || '—'}</td>
      <td><span class="badge ${badge}">${status}</span></td>
      <td style="color:var(--dim)">${job.retryCount || 0} / 3</td>
      <td class="mono" style="color:var(--teal)">${job.losCaseNumber || '—'}</td>
      <td style="color:var(--red); font-size:11px;" title="${esc(job.lastError)}">${trunc(job.lastError, 35) || '—'}</td>
      <td class="th-action">
         <button class="btn-ghost" style="padding:4px 6px; font-size:11px;" onclick="viewLosRawRequest(${idx})" title="View Request Payload">↖️</button>
         <button class="btn-ghost" style="padding:4px 6px; font-size:11px;" onclick="viewLosRawResponse(${idx})" title="View Raw Response">👁️</button>
         <button class="primary-btn" style="padding:4px 10px; font-size:11px;" onclick="triggerSpecificLosJob(${app.id}, this)">Push</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function triggerSpecificLosJob(appId, btn) {
   const og = btn.textContent;
   btn.textContent = '...';
   btn.disabled = true;

   try {
      const res = await fetch(`/api/los/trigger/${appId}`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
         throw new Error(data.error || data.message || 'Push failed');
      }
      btn.style.background = 'var(--teal)';
      btn.textContent = 'OK';
      // Automatically refresh background
      setTimeout(() => fetchLosJobs(), 1000);
   } catch(e) {
      alert('Failed: ' + e.message);
      btn.textContent = 'Retry';
   } finally {
      btn.disabled = false;
      if (btn.textContent !== 'OK') btn.textContent = og;
   }
}

function viewLosRawRequest(idx) {
  const app = losFilteredData[idx];
  if (!app || !app.losIntegrationJob) return;
  const raw = app.losIntegrationJob.rawRequest;
  
  if (!raw) {
    alert("No raw request data available for this job.");
    return;
  }
  
  const w = window.open();
  if (w) {
      w.document.write('<html><body><pre>' + JSON.stringify(raw, null, 2) + '</pre></body></html>');
      w.document.close();
  } else {
      alert(JSON.stringify(raw, null, 2));
  }
}

function viewLosRawResponse(idx) {
  const app = losFilteredData[idx];
  if (!app || !app.losIntegrationJob) return;
  const raw = app.losIntegrationJob.rawResponse;
  
  if (!raw) {
    alert("No raw response data available for this job.");
    return;
  }
  
  const w = window.open();
  if (w) {
      w.document.write('<html><body><pre>' + JSON.stringify(raw, null, 2) + '</pre></body></html>');
      w.document.close();
  } else {
      alert(JSON.stringify(raw, null, 2));
  }
}

/* ─── Smart Audit Logic ──────────────────────────────────── */
let auditLogs = [];

async function loadAuditLogs() {
  const eligible = $('audit-filter-eligible').value;
  const category = $('audit-filter-category').value;
  const search = $('audit-search').value;

  let query = '?limit=100';
  if (eligible) query += `&exportEligible=${eligible}`;
  if (category) query += `&category=${category}`;
  if (search) query += `&search=${encodeURIComponent(search)}`;

  const tbody = $('audit-tbody');
  tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--muted)">Loading audit data...</td></tr>';

  try {
    const res = await fetch(`/api/audit/logs${query}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Failed to load audit logs');
    }

    auditLogs = data.logs || [];
    
    // Update summary counts
    if (data.summary) {
      $('ac-total').textContent = data.summary.total ?? 0;
      $('ac-eligible').textContent = data.summary.exportEligible ?? 0;
      $('ac-failed').textContent = data.summary.notExported ?? 0;
      if (data.summary.byCategory) {
        const reloans = (data.summary.byCategory.COMPLETE_RELOAN || 0) + (data.summary.byCategory.INCOMPLETE_RELOAN || 0);
        const fresh = (data.summary.byCategory.COMPLETE_FRESH_LOAN || 0) + (data.summary.byCategory.INCOMPLETE_FRESH_LOAN || 0);
        $('ac-reloan').textContent = reloans;
        $('ac-fresh').textContent = fresh;
      }
    }

    renderAuditTable();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--red)">Failed: ${err.message}</td></tr>`;
  }
}

function renderAuditTable() {
  const tbody = $('audit-tbody');
  tbody.innerHTML = '';

  if (auditLogs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--muted)">No audit logs matching filters</td></tr>';
    return;
  }

  auditLogs.forEach((log, idx) => {
    const dateStr = log.auditedAt ? new Date(log.auditedAt).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
    
    // Categories and badge mapping
    let catClass = 'badge-other';
    if (log.category.includes('RELOAN')) catClass = 'badge-HOLD';
    if (log.category.includes('COMPLETE')) catClass = 'badge-APPROVED';

    // Issues and Warnings formatting
    let issuesHtml = '';
    if (log.issues && log.issues.length > 0) {
      log.issues.forEach(issue => {
        issuesHtml += `<span class="issue-tag" title="${esc(issue)}">❌ ${esc(trunc(issue, 28))}</span> `;
      });
    }
    if (log.warnings && log.warnings.length > 0) {
      log.warnings.forEach(warning => {
        issuesHtml += `<span class="warning-tag" title="${esc(warning)}">⚠️ ${esc(trunc(warning, 28))}</span> `;
      });
    }
    if (!issuesHtml) {
      issuesHtml = '<span class="eligible-tag">✅ Clean</span>';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-no">${idx + 1}</td>
      <td style="font-weight:600">${esc(log.customerName)}</td>
      <td class="mono">${esc(log.phone) || '—'}</td>
      <td><span class="badge ${catClass}" style="font-size:10px">${esc(log.category)}</span></td>
      <td><span class="badge ${log.isProfileComplete ? 'badge-APPROVED' : 'badge-REJECTED'}">${log.isProfileComplete ? 'Complete' : 'Incomplete'}</span></td>
      <td>${log.panVerified ? '✅' : '❌'}</td>
      <td>${log.aadhaarVerified ? '✅' : '❌'}</td>
      <td><span class="badge ${log.exportEligible ? 'badge-APPROVED' : 'badge-REJECTED'}">${log.exportEligible ? 'Eligible' : 'Blocked'}</span></td>
      <td><div style="display:flex;flex-wrap:wrap;max-width:240px;">${issuesHtml}</div></td>
      <td style="color:var(--muted);font-size:11px">${dateStr}</td>
      <td class="th-action">
        <button class="view-btn" onclick="openAuditModal(${idx})">Detail</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openAuditModal(idx) {
  const log = auditLogs[idx];
  if (!log) return;

  const initials = (log.customerName || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  $('audit-modal-avatar').textContent = initials;
  $('audit-modal-name').textContent = log.customerName;
  $('audit-modal-meta').textContent = `${log.category} | Triggered by: ${log.triggeredBy}`;

  // Build report modal body
  let html = `
    <div class="audit-modal-section">
      <div class="audit-modal-section-title">Identity & Profile</div>
      <div class="audit-modal-item"><div class="audit-modal-label">User ID:</div><div class="audit-modal-val mono">${log.userId}</div></div>
      <div class="audit-modal-item"><div class="audit-modal-label">Customer ID:</div><div class="audit-modal-val mono">${log.customerId || 'N/A'}</div></div>
      <div class="audit-modal-item"><div class="audit-modal-label">Phone:</div><div class="audit-modal-val mono">${log.phone || '—'}</div></div>
      <div class="audit-modal-item"><div class="audit-modal-label">Email:</div><div class="audit-modal-val">${log.email || '—'}</div></div>
      <div class="audit-modal-item"><div class="audit-modal-label">Profile Completeness:</div><div class="audit-modal-val">${log.isProfileComplete ? '✅ Complete (KYC done)' : '❌ Incomplete'}</div></div>
      <div class="audit-modal-item"><div class="audit-modal-label">PAN Verified:</div><div class="audit-modal-val">${log.panVerified ? '✅ Yes' : '❌ No'}</div></div>
      <div class="audit-modal-item"><div class="audit-modal-label">Aadhaar Verified:</div><div class="audit-modal-val">${log.aadhaarVerified ? '✅ Yes' : '❌ No'}</div></div>
    </div>

    <div class="audit-modal-section">
      <div class="audit-modal-section-title">Application Status</div>
      <div class="audit-modal-item"><div class="audit-modal-label">Application ID:</div><div class="audit-modal-val mono">${log.applicationId || 'N/A'}</div></div>
      <div class="audit-modal-item"><div class="audit-modal-label">Loan Mode:</div><div class="audit-modal-val">${log.isReloan ? '🔁 Reloan (Application #' + log.totalApplications + ')' : '🆕 Fresh Loan'}</div></div>
      <div class="audit-modal-item"><div class="audit-modal-label">Export Eligible:</div><div class="audit-modal-val">${log.exportEligible ? '✅ YES' : '❌ NO'}</div></div>
    </div>
  `;

  if (log.issues && log.issues.length > 0) {
    html += `
      <div class="audit-modal-section">
        <div class="audit-modal-section-title" style="color:var(--red)">❌ Hard Blockers (Preventing Export)</div>
        <ul style="padding-left:20px;margin:0;color:var(--red);font-size:13px;line-height:1.6;">
          ${log.issues.map(issue => `<li>${esc(issue)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (log.warnings && log.warnings.length > 0) {
    html += `
      <div class="audit-modal-section">
        <div class="audit-modal-section-title" style="color:var(--amber)">⚠️ Soft Warnings (Missing Optional Data)</div>
        <ul style="padding-left:20px;margin:0;color:var(--amber);font-size:13px;line-height:1.6;">
          ${log.warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  $('audit-modal-body').innerHTML = html;
  $('audit-detail-modal').classList.remove('hidden');
}

function closeAuditModal(e) {
  if (e.target === $('audit-detail-modal') || e === true) {
    $('audit-detail-modal').classList.add('hidden');
  }
}

async function triggerBulkAudit() {
  if (!confirm('Re-audit all applications in the last 30 days? This may take a minute.')) return;
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  try {
    const res = await fetch('/api/audit/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: startDate.toISOString(),
        limit: 100
      })
    });
    const parsed = await res.json();
    if (!res.ok || !parsed.success) {
      throw new Error(parsed.error || parsed.message || 'Bulk audit failed');
    }
    
    alert(`Bulk audit complete!\nAudited: ${parsed.summary.total}\nEligible: ${parsed.summary.exportEligible}\nBlocked: ${parsed.summary.notExported}`);
    loadAuditLogs();
  } catch (err) {
    alert('Error running bulk audit: ' + err.message);
  }
}

function exportAuditReport() {
  if (!auditLogs.length) return;
  const cols = [
    ['Customer Name','customerName'],['Phone','phone'],['Email','email'],
    ['Category','category'],['Profile Complete','isProfileComplete'],
    ['PAN Verified','panVerified'],['Aadhaar Verified','aadhaarVerified'],
    ['Export Eligible','exportEligible'],['Audited At','auditedAt'],
    ['Issues','issues'],['Warnings','warnings']
  ];
  const header = cols.map(c => `"${c[0]}"`).join(',');
  const rows = auditLogs.map(r =>
    cols.map(c => {
      let v = r[c[1]];
      if (Array.isArray(v)) {
        v = v.join('; ');
      }
      return v == null ? '""' : `"${String(v).replace(/"/g,'""')}"`;
    }).join(',')
  );
  const blob = new Blob([[header,...rows].join('\n')], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `audit_report_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

/* ─── Hardcode Scanner Logic ────────────────────────────── */
let scanFindings = [];

async function runHardcodeScan() {
  $('scan-btn').disabled = true;
  $('scan-btn').textContent = 'Scanning...';
  $('scan-loader').classList.remove('hidden');
  $('scan-summary-row').style.display = 'none';
  $('scan-table-wrap').style.display = 'none';
  $('scan-empty').style.display = 'none';

  try {
    const res = await fetch('/api/audit/scan');
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Scan failed');
    }

    scanFindings = data.findings || [];

    // Render summary counts
    if (data.summary) {
      $('sc-critical').textContent = data.summary.CRITICAL ?? 0;
      $('sc-high').textContent = data.summary.HIGH ?? 0;
      $('sc-medium').textContent = data.summary.MEDIUM ?? 0;
      $('sc-low').textContent = data.summary.LOW ?? 0;
      $('sc-total').textContent = data.summary.total ?? 0;
    }

    $('scan-summary-row').style.display = 'grid';

    if (scanFindings.length === 0) {
      $('scan-empty').style.display = 'block';
      $('scan-export-btn').style.display = 'none';
    } else {
      $('scan-table-wrap').style.display = 'block';
      $('scan-export-btn').style.display = 'inline-flex';
      renderScanTable(scanFindings);
    }
  } catch (err) {
    alert('Scan error: ' + err.message);
  } finally {
    $('scan-btn').disabled = false;
    $('scan-btn').textContent = 'Run Scan';
    $('scan-loader').classList.add('hidden');
  }
}

function renderScanTable(findings) {
  const tbody = $('scan-tbody');
  tbody.innerHTML = '';

  findings.forEach((f, idx) => {
    // extract filename from path for display, keep full path as tooltip
    const parts = f.file.split(/[\\/]/);
    const shortFile = parts[parts.length - 2] + '/' + parts[parts.length - 1];

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-no">${idx + 1}</td>
      <td><span class="sev-badge sev-${f.severity}">${f.severity}</span></td>
      <td style="font-weight:600">${esc(f.label)}</td>
      <td title="${esc(f.file)}" style="color:var(--teal)">${esc(shortFile)}</td>
      <td class="mono" style="text-align:center">${f.line}</td>
      <td><div class="scan-code-snippet" title="${esc(f.code)}">${esc(f.code)}</div></td>
    `;
    tbody.appendChild(tr);
  });
}

function filterScanTable() {
  const q = ($('scan-search').value || '').toLowerCase().trim();
  const sev = $('scan-severity-filter').value;

  const filteredFindings = scanFindings.filter(f => {
    const matchSev = !sev || f.severity === sev;
    if (!matchSev) return false;
    if (!q) return true;
    return [f.label, f.file, f.code].join(' ').toLowerCase().includes(q);
  });

  renderScanTable(filteredFindings);
}

function exportScanReport() {
  if (!scanFindings.length) return;
  const cols = [
    ['Severity','severity'],['Issue','label'],['File','file'],['Line','line'],['Code Snippet','code']
  ];
  const header = cols.map(c => `"${c[0]}"`).join(',');
  const rows = scanFindings.map(r =>
    cols.map(c => { const v = r[c[1]]; return v == null ? '""' : `"${String(v).replace(/"/g,'""')}"`; }).join(',')
  );
  const blob = new Blob([[header,...rows].join('\n')], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `code_scanner_report_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}



/* ─── Smart Audit Hub Logic ──────────────────────────── */
let auditAllData = [];

async function loadAuditLogs() {
  const btn = document.querySelector('#view-audit .btn-primary');
  if(btn) {
    btn.innerHTML = 'Refreshing...';
    btn.disabled = true;
  }

  const eligible = document.getElementById('audit-filter-eligible').value;
  const category = document.getElementById('audit-filter-category').value;
  const search = document.getElementById('audit-search').value;

  try {
    const url = new URL('/api/audit/logs', window.location.origin);
    if(eligible) url.searchParams.append('exportEligible', eligible);
    if(category) url.searchParams.append('category', category);
    if(search) url.searchParams.append('search', search);

    const res = await fetch(url.toString());
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch audit logs');
    
    auditAllData = json.logs || [];
    renderAuditSummary(json.summary);
    renderAuditTable(auditAllData);
  } catch(err) {
    alert('Error fetching Audit Logs: ' + err.message);
  } finally {
    if(btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg> Refresh`;
    }
  }
}

function renderAuditSummary(summary) {
  if(!summary) return;
  document.getElementById('ac-total').innerText = summary.total || 0;
  document.getElementById('ac-eligible').innerText = summary.exportEligible || 0;
  document.getElementById('ac-failed').innerText = summary.notExported || 0;
  
  const reloans = (summary.byCategory?.COMPLETE_RELOAN || 0) + (summary.byCategory?.INCOMPLETE_RELOAN || 0);
  const fresh = (summary.byCategory?.COMPLETE_FRESH_LOAN || 0) + (summary.byCategory?.INCOMPLETE_FRESH_LOAN || 0);
  
  document.getElementById('ac-reloan').innerText = reloans;
  document.getElementById('ac-fresh').innerText = fresh;
}

function renderAuditTable(logs) {
  const tbody = document.getElementById('audit-tbody');
  tbody.innerHTML = '';
  
  if (!logs || logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--muted)">No audit logs found.</td></tr>`;
    return;
  }
  
  logs.forEach((log, index) => {
    const issuesHtml = (log.issues || []).map(i => `<div style="color:#ef4444;font-size:11px;margin-bottom:2px;">• ${esc(i)}</div>`).join('');
    const warningsHtml = (log.warnings || []).map(w => `<div style="color:#f59e0b;font-size:11px;margin-bottom:2px;">• ${esc(w)}</div>`).join('');
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-no">${index + 1}</td>
      <td class="td-bold">${esc(log.customerName) || 'Unknown'}</td>
      <td>${esc(log.phone) || '-'}</td>
      <td><span class="badge ${log.category.includes('RELOAN') ? 'badge-COMPLETED' : 'badge-PENDING'}" style="font-size:10px;">${esc(log.category.replace(/_/g, ' '))}</span></td>
      <td>${log.isProfileComplete ? '✅ Complete' : '⚠️ Incomplete'}</td>
      <td>${log.panVerified ? '✅' : '❌'}</td>
      <td>${log.aadhaarVerified ? '✅' : '❌'}</td>
      <td>${log.exportEligible ? '<span class="badge badge-APPROVED">YES</span>' : '<span class="badge badge-REJECTED">NO</span>'}</td>
      <td style="max-width:220px;white-space:normal;line-height:1.2;">
         ${issuesHtml}
         ${warningsHtml}
         ${!issuesHtml && !warningsHtml ? '<span style="color:#10b981;font-size:11px;">Clean ✅</span>' : ''}
      </td>
      <td class="td-date">${new Date(log.timestamp).toLocaleString()}</td>
      <td class="td-action">
        <button class="btn-ghost" onclick="viewAuditDetails('${log.applicationId}')" style="padding:4px 8px;font-size:11px;">View</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function viewAuditDetails(appId) {
  const log = auditAllData.find(l => l.applicationId === appId);
  if(!log) return;
  
  document.getElementById('audit-modal-name').innerText = log.customerName || 'Unknown Applicant';
  document.getElementById('audit-modal-meta').innerText = `App ID: ${log.applicationId} • ${new Date(log.timestamp).toLocaleString()}`;
  document.getElementById('audit-modal-avatar').innerText = (log.customerName || 'U').charAt(0).toUpperCase();
  
  let detailsHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
      <div style="background:var(--bg);padding:16px;border-radius:8px;border:1px solid var(--border2);">
        <h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:12px;">Customer Details</h4>
        <div style="font-size:13px;line-height:1.6;">
          <div><strong>Phone:</strong> ${log.phone || '-'}</div>
          <div><strong>PAN Status:</strong> ${log.panVerified ? 'Verified' : 'Unverified'}</div>
          <div><strong>Aadhaar Status:</strong> ${log.aadhaarVerified ? 'Verified' : 'Unverified'}</div>
          <div><strong>Profile Type:</strong> ${log.isProfileComplete ? 'Complete' : 'Incomplete'}</div>
          <div><strong>Loan Category:</strong> ${log.category.replace(/_/g, ' ')}</div>
        </div>
      </div>
      <div style="background:var(--bg);padding:16px;border-radius:8px;border:1px solid var(--border2);">
        <h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:12px;">Export Status</h4>
        <div style="font-size:13px;line-height:1.6;">
          <div><strong>Eligible:</strong> ${log.exportEligible ? '<span style="color:#10b981;font-weight:700;">YES</span>' : '<span style="color:#ef4444;font-weight:700;">NO</span>'}</div>
          <div style="margin-top:8px;"><strong>LOS Job Status:</strong> ${log.losJob?.status || 'N/A'}</div>
          <div><strong>LOS Case #:</strong> ${log.losJob?.losCaseNumber || '-'}</div>
          <div><strong>Retries:</strong> ${log.losJob?.retryCount || 0}</div>
          ${log.losJob?.lastError ? `<div style="color:#ef4444;margin-top:4px;"><strong>Error:</strong> ${log.losJob.lastError}</div>` : ''}
        </div>
      </div>
    </div>
  `;
  
  if (log.correctness) {
     detailsHtml += `
       <div style="background:var(--bg);padding:16px;border-radius:8px;border:1px solid var(--border2);margin-bottom:24px;">
         <h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:12px;">Smart Correctness Checks</h4>
         <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12px;">
           <div><strong>PAN Format:</strong> ${log.correctness.panFormat?.status === 'PASS' ? '✅' : '❌'} ${esc(log.correctness.panFormat?.message)}</div>
           <div><strong>Aadhaar Format:</strong> ${log.correctness.aadhaarFormat?.status === 'PASS' ? '✅' : '❌'} ${esc(log.correctness.aadhaarFormat?.message)}</div>
           <div><strong>Mobile Format:</strong> ${log.correctness.mobileFormat?.status === 'PASS' ? '✅' : '❌'} ${esc(log.correctness.mobileFormat?.message)}</div>
           <div><strong>Pin Code Format:</strong> ${log.correctness.postalCodeFormat?.status === 'PASS' ? '✅' : '❌'} ${esc(log.correctness.postalCodeFormat?.message)}</div>
           <div style="grid-column:1 / -1;border-top:1px solid var(--border2);padding-top:8px;margin-top:4px;">
             <strong>Placeholder Detection:</strong> ${log.correctness.placeholderDetection?.status === 'PASS' ? '✅ Clean' : `❌ <span style="color:#ef4444">${esc(log.correctness.placeholderDetection?.message)}</span>`}
           </div>
         </div>
       </div>
     `;
  }

  detailsHtml += `
    <div style="background:var(--bg);padding:16px;border-radius:8px;border:1px solid var(--border2);">
      <h4 style="font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:12px;">Diagnostic Logs</h4>
      <div style="font-size:13px;">
        ${(log.issues || []).map(i => `<div style="color:#ef4444;padding:4px 0;border-bottom:1px solid var(--border);"><strong style="display:inline-block;width:60px;">BLOCKER</strong> ${esc(i)}</div>`).join('')}
        ${(log.warnings || []).map(w => `<div style="color:#f59e0b;padding:4px 0;border-bottom:1px solid var(--border);"><strong style="display:inline-block;width:60px;">WARNING</strong> ${esc(w)}</div>`).join('')}
        ${(!log.issues?.length && !log.warnings?.length) ? '<div style="color:#10b981;">No issues found. Application is fully valid.</div>' : ''}
      </div>
    </div>
  `;

  document.getElementById('audit-modal-body').innerHTML = detailsHtml;
  document.getElementById('audit-detail-modal').classList.remove('hidden');
}

function closeAuditModal(e) {
  if (e.target.id === 'audit-detail-modal') {
    document.getElementById('audit-detail-modal').classList.add('hidden');
  }
}

async function triggerBulkAudit() {
  if(!confirm('Re-audit all applications from the last 30 days? This will run in the background.')) return;
  try {
    const res = await fetch('/api/audit/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const json = await res.json();
    alert(json.message || 'Bulk audit initiated successfully');
    loadAuditLogs();
  } catch(err) {
    alert('Error triggering bulk audit: ' + err.message);
  }
}

/* ─── Hardcode Scanner Logic ──────────────────────────── */
async function runHardcodeScan() {
  const loader = document.getElementById('scan-loader');
  const tableWrap = document.getElementById('scan-table-wrap');
  const emptyState = document.getElementById('scan-empty');
  const summaryRow = document.getElementById('scan-summary-row');
  const tbody = document.getElementById('scan-tbody');
  const btn = document.getElementById('scan-btn');

  btn.disabled = true;
  loader.classList.remove('hidden');
  tableWrap.style.display = 'none';
  emptyState.style.display = 'none';
  summaryRow.style.display = 'none';

  try {
    const res = await fetch('/api/audit/scan');
    const json = await res.json();
    
    if(!json.success) throw new Error(json.message || 'Scan failed');
    
    const findings = json.findings || [];
    window._scanFindings = findings;
    
    if(findings.length === 0) {
      emptyState.style.display = 'block';
    } else {
      renderScanTable(findings);
      
      const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      findings.forEach(f => counts[f.severity]++);
      
      document.getElementById('sc-critical').innerText = counts.CRITICAL;
      document.getElementById('sc-high').innerText = counts.HIGH;
      document.getElementById('sc-medium').innerText = counts.MEDIUM;
      document.getElementById('sc-low').innerText = counts.LOW;
      document.getElementById('sc-total').innerText = findings.length;
      
      summaryRow.style.display = 'flex';
      tableWrap.style.display = 'block';
      document.getElementById('scan-export-btn').style.display = 'inline-flex';
    }
  } catch(err) {
    alert('Error running scan: ' + err.message);
  } finally {
    loader.classList.add('hidden');
    btn.disabled = false;
  }
}

function renderScanTable(findings) {
  const tbody = document.getElementById('scan-tbody');
  tbody.innerHTML = '';
  
  findings.forEach((f, index) => {
    const sevColor = f.severity === 'CRITICAL' ? '#ef4444' : f.severity === 'HIGH' ? '#f97316' : f.severity === 'MEDIUM' ? '#eab308' : '#6366f1';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-no">${index + 1}</td>
      <td><span class="badge" style="background:${sevColor}22;color:${sevColor};border:1px solid ${sevColor}44;">${f.severity}</span></td>
      <td class="td-bold">${esc(f.label)}</td>
      <td style="font-size:11px;word-break:break-all;max-width:250px;">${esc(f.file.split('LoanInNeedServer2')[1] || f.file)}</td>
      <td style="font-family:monospace;color:var(--teal);">L${f.line}</td>
      <td style="font-family:monospace;font-size:11px;white-space:pre-wrap;background:rgba(0,0,0,0.2);padding:8px;border-radius:4px;word-break:break-all;">${esc(f.code)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function filterScanTable() {
  const search = document.getElementById('scan-search').value.toLowerCase();
  const severity = document.getElementById('scan-severity-filter').value;
  const findings = window._scanFindings || [];
  
  const filtered = findings.filter(f => {
    const matchesSearch = f.label.toLowerCase().includes(search) || f.file.toLowerCase().includes(search) || f.code.toLowerCase().includes(search);
    const matchesSev = severity ? f.severity === severity : true;
    return matchesSearch && matchesSev;
  });
  
  renderScanTable(filtered);
}

function exportScanReport() {
  const findings = window._scanFindings || [];
  if(findings.length === 0) return;
  const header = ['Severity', 'Issue', 'File', 'Line', 'Code Snippet'].join(',');
  const rows = findings.map(f => [
    f.severity,
    `"${esc(f.label)}"`,
    `"${esc(f.file)}"`,
    f.line,
    `"${esc(f.code).replace(/"/g, '""')}"`
  ].join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hardcode_scan_report_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}
