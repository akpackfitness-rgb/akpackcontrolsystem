/* ============================================
   AK PACK FITNESS — CORE SCRIPT
   Google Sheets Integration + Attendance Logic
   ============================================ */

// ─── CONFIG (loaded from localStorage or setup prompt) ───────────────────────
const CONFIG_KEY = 'ak_pack_config';

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch { return {}; }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

// ─── GOOGLE SHEETS API HELPERS ────────────────────────────────────────────────
// Uses Google Sheets API v4 (read) + Apps Script Web App (write)
// 
//  READ:  Public spreadsheet via JSON export (no auth needed for read)
//  WRITE: Google Apps Script Web App deployed as "anyone can execute"

const SHEETS = {
  MEMBERS_SHEET: 'Members',
  ATTENDANCE_SHEET: 'Attendance'
};

/**
 * Read all rows from a sheet via the public Sheets JSON API
 * Requires the spreadsheet to be shared "Anyone with the link can view"
 */
async function readSheet(sheetName) {
  const cfg = getConfig();
  if (!cfg.spreadsheetId) throw new Error('Spreadsheet ID not configured.');

  const url = `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);

  const text = await res.text();
  // Strip Google's JSONP wrapper
  const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const data = JSON.parse(jsonStr);

  if (!data.table || !data.table.rows) return [];

  const cols = data.table.cols.map(c => c.label || '');
  const rows = data.table.rows.map(row => {
    const obj = {};
    row.c.forEach((cell, i) => {
      obj[cols[i]] = cell ? (cell.v !== null && cell.v !== undefined ? String(cell.v) : '') : '';
    });
    return obj;
  });

  // Remove header-like empty rows
  return rows.filter(r => Object.values(r).some(v => v.trim() !== ''));
}

/**
 * Write a row to a sheet via Google Apps Script Web App
 * The Apps Script must be deployed and its URL saved in config
 */
async function writeRow(sheetName, rowData) {
  const cfg = getConfig();
  if (!cfg.appsScriptUrl) throw new Error('Apps Script URL not configured.');

  const payload = { sheet: sheetName, row: rowData };

  const res = await fetch(cfg.appsScriptUrl, {
    method: 'POST',
    mode: 'no-cors', // Apps Script CORS workaround
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // no-cors means we can't read the response, but it still executes
  return true;
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────

function today() {
  return new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function nowTime() {
  return new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  // Handle Google Sheets Date(year,month,day) format
  const gsMatch = dateStr.match(/Date\((\d+),(\d+),(\d+)\)/);
  if (gsMatch) {
    return new Date(parseInt(gsMatch[1]), parseInt(gsMatch[2]), parseInt(gsMatch[3]));
  }
  // Handle DD/MM/YYYY
  const parts = dateStr.split(/[\/\-\.]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      return new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
    }
    return new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
  }
  return new Date(dateStr);
}

function formatDate(d) {
  if (!d || isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function daysRemaining(expiryDate) {
  if (!expiryDate || isNaN(expiryDate.getTime())) return -999;
  const now = new Date();
  now.setHours(0,0,0,0);
  const diff = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
  return diff;
}

function getMembershipStatus(days) {
  if (days < 0) return 'Expired';
  if (days <= 3) return 'Warning';
  return 'Active';
}

// ─── MEMBER LOOKUP ────────────────────────────────────────────────────────────

async function lookupMember(memberId) {
  const rows = await readSheet(SHEETS.MEMBERS_SHEET);
  const id = memberId.trim().toUpperCase();
  const member = rows.find(r => {
    const rowId = (r['MemberID'] || r['Member ID'] || r['memberid'] || '').trim().toUpperCase();
    return rowId === id;
  });
  return member || null;
}

async function recordAttendance(member, status) {
  const rowData = [
    today(),
    nowTime(),
    member.memberID,
    member.name,
    status
  ];
  await writeRow(SHEETS.ATTENDANCE_SHEET, rowData);
}

// ─── ATTENDANCE TERMINAL (index.html) ─────────────────────────────────────────

async function handleCheckIn(memberIdInput) {
  const id = memberIdInput.trim();
  if (!id) {
    showTerminalMessage('Please enter a Member ID.', 'warning');
    return;
  }

  showLoading(true);
  clearResult();

  try {
    const row = await lookupMember(id);

    if (!row) {
      showLoading(false);
      showTerminalMessage(`Member ID "${id}" not found. Please check your ID or contact reception.`, 'danger');
      return;
    }

    // Normalize column names (flexible)
    const member = {
      memberID: row['MemberID'] || row['Member ID'] || id,
      name: row['Name'] || row['name'] || 'Unknown',
      phone: row['Phone'] || row['phone'] || '',
      startDate: parseDate(row['StartDate'] || row['Start Date'] || row['startdate'] || ''),
      expiryDate: parseDate(row['ExpiryDate'] || row['Expiry Date'] || row['expirydate'] || '')
    };

    const days = daysRemaining(member.expiryDate);
    const statusType = getMembershipStatus(days);
    const statusLabel = statusType === 'Warning' ? 'Active' : statusType;

    // Record attendance (fire-and-forget style)
    try {
      await recordAttendance(member, statusLabel);
    } catch(e) {
      console.warn('Attendance write failed (check Apps Script URL):', e);
    }

    showLoading(false);
    renderMemberCard(member, days, statusType);

  } catch (err) {
    showLoading(false);
    showTerminalMessage(`Error: ${err.message}`, 'danger');
    console.error(err);
  }
}

function renderMemberCard(member, days, statusType) {
  const resultEl = document.getElementById('memberResult');
  if (!resultEl) return;

  const statusClass = {
    'Active': 'status-active',
    'Warning': 'status-warning',
    'Expired': 'status-expired'
  }[statusType] || 'status-expired';

  const badgeClass = {
    'Active': 'badge-active',
    'Warning': 'badge-warning',
    'Expired': 'badge-expired'
  }[statusType] || 'badge-expired';

  const badgeLabel = statusType === 'Warning' ? 'RENEWING SOON' : statusType.toUpperCase();

  const daysClass = days > 3 ? 'green' : days >= 0 ? 'yellow' : 'red';
  const daysDisplay = days < 0 ? `${Math.abs(days)} DAYS AGO` : days === 0 ? 'TODAY' : `${days} DAYS`;

  let alertHtml = '';
  if (statusType === 'Expired') {
    alertHtml = `<div class="alert alert-danger"><span class="alert-icon">🚫</span><span>MEMBERSHIP EXPIRED — PLEASE RENEW AT RECEPTION</span></div>`;
  } else if (days === 1) {
    alertHtml = `<div class="alert alert-warning"><span class="alert-icon">⚠️</span><span>Membership expires TOMORROW. Please renew immediately.</span></div>`;
  } else if (days <= 3) {
    alertHtml = `<div class="alert alert-warning"><span class="alert-icon">⚠️</span><span>Your membership will expire in ${days} day${days===1?'':'s'}. Please renew soon.</span></div>`;
  }

  let welcomeHtml = '';
  if (statusType !== 'Expired') {
    welcomeHtml = `<div class="welcome-banner"><h2>🐺 WELCOME TO THE PACK — ENTRY RECORDED</h2></div>`;
  }

  resultEl.innerHTML = `
    <div class="member-result">
      <div class="member-card ${statusClass}">
        <div class="flex-between mb-16">
          <div>
            <div class="member-card-name">${member.name.toUpperCase()}</div>
            <div class="member-card-id">ID: ${member.memberID}</div>
          </div>
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </div>

        <div class="member-info-grid">
          <div class="member-info-item">
            <div class="member-info-label">Start Date</div>
            <div class="member-info-value">${formatDate(member.startDate)}</div>
          </div>
          <div class="member-info-item">
            <div class="member-info-label">Expiry Date</div>
            <div class="member-info-value">${formatDate(member.expiryDate)}</div>
          </div>
          <div class="member-info-item">
            <div class="member-info-label">Days Remaining</div>
            <div class="days-remaining ${daysClass}">${daysDisplay}</div>
          </div>
          <div class="member-info-item">
            <div class="member-info-label">Phone</div>
            <div class="member-info-value">${member.phone || '—'}</div>
          </div>
        </div>

        ${alertHtml}
        ${welcomeHtml}
      </div>
    </div>
  `;

  resultEl.classList.remove('hidden');
}

// ─── ADMIN PAGE (admin.html) ──────────────────────────────────────────────────

let adminRefreshInterval = null;

async function loadAdminDashboard() {
  try {
    const rows = await readSheet(SHEETS.ATTENDANCE_SHEET);

    // Sort by most recent
    const sorted = rows.slice().reverse();

    // Count today's entries
    const todayStr = today();
    const todayRows = rows.filter(r => {
      const d = r['Date'] || r['date'] || '';
      return d.trim() === todayStr;
    });

    // Update counter
    const counterEl = document.getElementById('packCounter');
    if (counterEl) counterEl.textContent = todayRows.length;

    // Render table
    const tbody = document.getElementById('attendanceTbody');
    if (!tbody) return;

    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--white-dim)">No attendance records yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = sorted.map(r => {
      const status = r['Status'] || r['status'] || '';
      const badgeClass = status === 'Active' ? 'badge-active' : status === 'Expired' ? 'badge-expired' : 'badge-warning';
      return `
        <tr>
          <td>${r['Date'] || r['date'] || '—'}</td>
          <td>${r['Time'] || r['time'] || '—'}</td>
          <td class="member-id">${r['MemberID'] || r['Member ID'] || r['memberid'] || '—'}</td>
          <td class="member-name">${(r['Name'] || r['name'] || '—').toUpperCase()}</td>
          <td><span class="badge ${badgeClass}" style="font-size:0.72rem;padding:4px 10px">${status.toUpperCase()}</span></td>
        </tr>
      `;
    }).join('');

    // Update last-refresh time
    const refreshEl = document.getElementById('lastRefresh');
    if (refreshEl) refreshEl.textContent = nowTime();

  } catch(err) {
    console.error('Admin load error:', err);
    const tbody = document.getElementById('attendanceTbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red-bright);padding:24px">Error loading data: ${err.message}</td></tr>`;
  }
}

function startAdminAutoRefresh(seconds = 8) {
  loadAdminDashboard();
  if (adminRefreshInterval) clearInterval(adminRefreshInterval);
  adminRefreshInterval = setInterval(loadAdminDashboard, seconds * 1000);
}

// ─── HISTORY PAGE (history.html) ─────────────────────────────────────────────

let allHistoryRows = [];

async function loadHistory() {
  const tbody = document.getElementById('historyTbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px"><div class="spinner"></div></td></tr>`;

  try {
    allHistoryRows = await readSheet(SHEETS.ATTENDANCE_SHEET);
    renderHistoryTable(allHistoryRows);
  } catch(err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red-bright);padding:24px">Error: ${err.message}</td></tr>`;
  }
}

function renderHistoryTable(rows) {
  const tbody = document.getElementById('historyTbody');
  if (!tbody) return;

  const totalEl = document.getElementById('historyTotal');
  if (totalEl) totalEl.textContent = rows.length;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--white-dim)">No records match your filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const status = r['Status'] || r['status'] || '';
    const badgeClass = status === 'Active' ? 'badge-active' : status === 'Expired' ? 'badge-expired' : 'badge-warning';
    return `
      <tr>
        <td>${r['Date'] || r['date'] || '—'}</td>
        <td>${r['Time'] || r['time'] || '—'}</td>
        <td class="member-id">${r['MemberID'] || r['Member ID'] || '—'}</td>
        <td class="member-name">${(r['Name'] || r['name'] || '—').toUpperCase()}</td>
        <td><span class="badge ${badgeClass}" style="font-size:0.72rem;padding:4px 10px">${status.toUpperCase()}</span></td>
      </tr>
    `;
  }).join('');
}

function filterHistory() {
  const dateVal = (document.getElementById('filterDate')?.value || '').trim();
  const idVal = (document.getElementById('filterID')?.value || '').trim().toUpperCase();
  const nameVal = (document.getElementById('filterName')?.value || '').trim().toUpperCase();

  let filtered = allHistoryRows;

  if (dateVal) {
    // convert YYYY-MM-DD to DD/MM/YYYY for comparison
    const parts = dateVal.split('-');
    const formatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
    filtered = filtered.filter(r => {
      const d = r['Date'] || r['date'] || '';
      return d.includes(formatted) || d.includes(dateVal);
    });
  }

  if (idVal) {
    filtered = filtered.filter(r => {
      const id = (r['MemberID'] || r['Member ID'] || '').toUpperCase();
      return id.includes(idVal);
    });
  }

  if (nameVal) {
    filtered = filtered.filter(r => {
      const n = (r['Name'] || r['name'] || '').toUpperCase();
      return n.includes(nameVal);
    });
  }

  renderHistoryTable(filtered);
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────

function showLoading(show) {
  const el = document.getElementById('loadingSpinner');
  if (el) el.classList.toggle('hidden', !show);
}

function clearResult() {
  const el = document.getElementById('memberResult');
  if (el) { el.innerHTML = ''; el.classList.add('hidden'); }
  const msgEl = document.getElementById('terminalMessage');
  if (msgEl) { msgEl.innerHTML = ''; msgEl.classList.add('hidden'); }
}

function showTerminalMessage(msg, type = 'info') {
  const el = document.getElementById('terminalMessage');
  if (!el) return;
  const icons = { success:'✅', warning:'⚠️', danger:'🚫', info:'ℹ️' };
  el.innerHTML = `<div class="alert alert-${type}"><span class="alert-icon">${icons[type]||'ℹ️'}</span><span>${msg}</span></div>`;
  el.classList.remove('hidden');
}

// ─── SETUP / CONFIG OVERLAY ───────────────────────────────────────────────────

function showConfigOverlay() {
  const existing = document.getElementById('configOverlay');
  if (existing) existing.remove();

  const cfg = getConfig();

  const overlay = document.createElement('div');
  overlay.id = 'configOverlay';
  overlay.className = 'config-overlay';
  overlay.innerHTML = `
    <div class="config-box">
      <div class="config-title">⚙️ SETUP REQUIRED</div>
      <p class="config-note">
        Connect your Google Sheets database.<br><br>
        <strong>Step 1:</strong> Share your Google Sheet (Anyone with link → Viewer)<br>
        <strong>Step 2:</strong> Copy the Spreadsheet ID from the URL:<br>
        <code style="color:var(--red-bright);font-size:0.8rem">spreadsheets/d/<u>THIS_PART</u>/edit</code><br><br>
        <strong>Step 3:</strong> Deploy a Google Apps Script Web App for writing. 
        <a href="SETUP_GUIDE.md" target="_blank">See SETUP_GUIDE.md</a>
      </p>
      <label class="form-label">Spreadsheet ID</label>
      <input class="config-input" id="cfgSpreadsheetId" placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" value="${cfg.spreadsheetId||''}"/>
      <label class="form-label" style="margin-top:12px">Apps Script Web App URL (for writing)</label>
      <input class="config-input" id="cfgAppsScriptUrl" placeholder="https://script.google.com/macros/s/..." value="${cfg.appsScriptUrl||''}"/>
      <div style="display:flex;gap:10px;margin-top:24px">
        <button class="btn btn-primary" style="flex:1" onclick="saveConfigFromOverlay()">SAVE & CONNECT</button>
        ${cfg.spreadsheetId ? `<button class="btn btn-secondary" onclick="document.getElementById('configOverlay').remove()">CANCEL</button>` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function saveConfigFromOverlay() {
  const id = document.getElementById('cfgSpreadsheetId').value.trim();
  const url = document.getElementById('cfgAppsScriptUrl').value.trim();

  if (!id) {
    alert('Please enter the Spreadsheet ID.');
    return;
  }

  saveConfig({ spreadsheetId: id, appsScriptUrl: url });
  document.getElementById('configOverlay').remove();

  // Reload current page logic
  if (typeof startAdminAutoRefresh === 'function' && document.getElementById('packCounter')) {
    startAdminAutoRefresh();
  }
  if (typeof loadHistory === 'function' && document.getElementById('historyTbody')) {
    loadHistory();
  }
}

function requireConfig() {
  const cfg = getConfig();
  if (!cfg.spreadsheetId) {
    showConfigOverlay();
    return false;
  }
  return true;
}

// ─── KEYBOARD: Enter key on ID input ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const idInput = document.getElementById('memberIdInput');
  if (idInput) {
    idInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('checkInBtn')?.click();
      }
    });
    // Auto-focus
    setTimeout(() => idInput.focus(), 100);
  }

  // Reset button
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      clearResult();
      if (idInput) { idInput.value = ''; idInput.focus(); }
    });
  }

  // Check-in button
  const checkInBtn = document.getElementById('checkInBtn');
  if (checkInBtn) {
    checkInBtn.addEventListener('click', () => {
      if (!requireConfig()) return;
      const val = document.getElementById('memberIdInput')?.value || '';
      handleCheckIn(val);
    });
  }

  // History filters
  const filterInputs = ['filterDate','filterID','filterName'];
  filterInputs.forEach(id => {
    document.getElementById(id)?.addEventListener('input', filterHistory);
  });

  // Settings button
  document.getElementById('settingsBtn')?.addEventListener('click', showConfigOverlay);
});
