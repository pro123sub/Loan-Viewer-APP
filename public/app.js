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
  document.querySelectorAll('.view-content').forEach(v => v.classList.add('hidden'));
  $(`view-${name}`).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const titles = { applications: 'All Applications', stats: 'Analytics', 'los-jobs': 'LOS Integration Jobs' };
  const subs   = { applications: 'Fetch loan applications by date range', stats: 'Charts and breakdowns', 'los-jobs': 'Monitor and manual trigger for LOS sync tasks' };
  $('page-title').textContent = titles[name] || name;
  $('page-sub').textContent   = subs[name]   || '';
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
