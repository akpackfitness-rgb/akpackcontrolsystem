/* ============================================
   AK PACK FITNESS — CORE SCRIPT v5.1
   Google Sheets + Pack Messages + All Logic
   ============================================ */

const CONFIG_KEY = 'ak_pack_config';
function getConfig() { try { return JSON.parse(localStorage.getItem(CONFIG_KEY))||{}; } catch{return{};} }
function saveConfig(cfg) { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); }

const SHEETS = { MEMBERS_SHEET:'Members', ATTENDANCE_SHEET:'Attendance' };

// ─── READ ─────────────────────────────────────────────────────
async function readSheet(sheetName) {
  const cfg = getConfig();
  if (!cfg.spreadsheetId) throw new Error('Spreadsheet ID not configured.');
  const url = `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const text = await res.text();
  const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}')+1);
  const data = JSON.parse(jsonStr);
  if (!data.table||!data.table.rows) return [];
  // Trim all column header names at source
  const cols = data.table.cols.map(c=>(c.label||'').trim());
  const rows = data.table.rows.map(row=>{
    const obj={};
    row.c.forEach((cell,i)=>{
      if (!cell || cell.v===null || cell.v===undefined) { obj[cols[i]]=''; return; }
      // For date cells, Google Sheets gives formatted string in cell.f — use that if available
      // cell.v for dates looks like "Date(2026,2,19)" — we keep it for parseDate
      // cell.f is the human-readable formatted value e.g. "19/03/2026" or "19-03-2026"
      const raw = cell.f ? String(cell.f).trim() : String(cell.v).trim();
      obj[cols[i]] = raw;
    });
    return obj;
  });
  return rows.filter(r=>Object.values(r).some(v=>v.trim()!==''));
}

// ─── WRITE via JSONP ──────────────────────────────────────────
function writeRow(sheetName, rowData) {
  return new Promise((resolve, reject) => {
    const cfg = getConfig();
    if (!cfg.appsScriptUrl) { reject(new Error('Apps Script URL not configured.')); return; }
    const payload      = { sheet:sheetName, row:rowData };
    const callbackName = 'akpack_cb_' + Date.now();
    const params       = encodeURIComponent(JSON.stringify(payload));
    const url          = `${cfg.appsScriptUrl}?data=${params}&callback=${callbackName}`;
    const script = document.createElement('script');
    const timer  = setTimeout(()=>{ cleanup(); resolve(true); }, 8000);
    function cleanup(){ clearTimeout(timer); delete window[callbackName]; if(script.parentNode)script.parentNode.removeChild(script); }
    window[callbackName] = function(r){ cleanup(); resolve(true); };
    script.onerror = function(){ cleanup(); resolve(true); };
    script.src = url;
    document.head.appendChild(script);
  });
}

// ─── DATE HELPERS ─────────────────────────────────────────────
function today() { return new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function nowTime(){ return new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}); }

function parseDate(s) {
  if (!s || String(s).trim()==='') return null;
  s = String(s).trim();

  // Google Sheets Date(year,month,day) — month is 0-indexed
  const gm = s.match(/Date\((\d+),(\d+),(\d+)\)/);
  if (gm) return new Date(parseInt(gm[1]), parseInt(gm[2]), parseInt(gm[3]));

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmy = s.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})$/);
  if (dmy) return new Date(parseInt(dmy[3]), parseInt(dmy[2])-1, parseInt(dmy[1]));

  // YYYY-MM-DD or YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})$/);
  if (ymd) return new Date(parseInt(ymd[1]), parseInt(ymd[2])-1, parseInt(ymd[3]));

  // Google Sheets serial number (days since Dec 30 1899)
  if (/^\d+$/.test(s)) {
    const serial = parseInt(s);
    if (serial > 1000) {
      const base = new Date(1899, 11, 30);
      base.setDate(base.getDate() + serial);
      return base;
    }
  }

  // Last resort
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d){ if(!d||isNaN(d.getTime())) return 'N/A'; return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
function daysRemaining(d){ if(!d||isNaN(d.getTime())) return -999; const n=new Date(); n.setHours(0,0,0,0); return Math.floor((d-n)/(1000*60*60*24)); }
function getMembershipStatus(days){ return days<0?'Expired':days<=3?'Warning':'Active'; }

// ─── MEMBER LOOKUP ────────────────────────────────────────────
async function lookupMember(memberId) {
  const rows = await readSheet(SHEETS.MEMBERS_SHEET);
  const id   = memberId.trim();
  return rows.find(r => {
    const rid = (r['Membership ID'] || '').trim();
    return rid === id;
  }) || null;
}

// Extract member fields using EXACT column names from your sheet
function extractMember(row, fallbackId) {
  return {
    memberID:   (row['Membership ID']  || fallbackId  || '').trim(),
    name:       (row['Client name']    || 'Unknown'   ).trim(),
    phone:      (row['Contact no']     || ''          ).trim(),
    package:    (row['Package Details']|| ''          ).trim(),
    startDate:  parseDate(row['Created On']       || ''),
    expiryDate: parseDate(row['Package Validity'] || ''),
    status:     (row['Status']         || ''          ).trim()
  };
}

async function recordAttendance(member, status){
  await writeRow(SHEETS.ATTENDANCE_SHEET, [today(), nowTime(), member.memberID, member.name, status]);
}

// ─── PACK MESSAGES ────────────────────────────────────────────
function getFirstName(n){ return (n||'Pack Member').trim().split(' ')[0]; }
function getPackMessage(firstName, type) {
  const h=new Date().getHours();
  const period=h>=5&&h<12?'morning':h>=12&&h<17?'afternoon':'evening';
  const msgs={
    checkin:{
      morning:[
        `Good morning, ${firstName}! The Pack is glad you're here. Stay hydrated 💧`,
        `Rise with the Pack, ${firstName}! Another great day begins ☀️`,
        `Welcome back, ${firstName}! The Pack starts strong today 🐺`,
        `Good morning, ${firstName}! The Pack runs at dawn — make it count 🌅`,
        `The Pack is with you today, ${firstName}! Let's have a great session 🐺`,
      ],
      afternoon:[
        `Good afternoon, ${firstName}! The Pack never stops — let's go 🐺`,
        `Welcome, ${firstName}! The Pack is stronger with you here 💪`,
        `Great to see you, ${firstName}! The Pack is ready for you 🐺`,
        `Good afternoon, ${firstName}! Hydrate first, then give it your all 💧`,
        `The Pack has been waiting, ${firstName}! Let's make this session count 🐺`,
      ],
      evening:[
        `Good evening, ${firstName}! The Pack shows up every day — respect 🐺`,
        `Evening, ${firstName}! End your day the right way with the Pack 🌙`,
        `Welcome, ${firstName}! True Pack members show up — and you always do 🐺`,
        `Good evening, ${firstName}! The Pack is proud to have you here 🌙`,
        `Evening, ${firstName}! The Pack is here for you — let's finish strong 🐺`,
      ],
    },
    exit:{
      morning:[
        `Well done, ${firstName}! The Pack is proud of you. See you soon! 🐺`,
        `Great session, ${firstName}! Recovery is part of the journey 🌅`,
        `The Pack salutes you, ${firstName}! Until next time 🙌`,
        `Excellent work, ${firstName}! The Pack grows stronger every day 💪`,
        `See you soon, ${firstName}! The Pack will be here waiting 🐺`,
      ],
      afternoon:[
        `Well done, ${firstName}! The Pack is proud of you 🐺`,
        `Great work today, ${firstName}! Rest well and come back stronger 💪`,
        `The Pack salutes you, ${firstName}! See you next time 🙌`,
        `Excellent session, ${firstName}! Recovery is part of the journey 🌙`,
        `The Pack is proud, ${firstName}! Until next time 🐺`,
      ],
      evening:[
        `Excellent work, ${firstName}! Recovery is part of the journey 🌙`,
        `The Pack salutes you, ${firstName}! Until next time 🙌`,
        `Well done, ${firstName}! The Pack is proud of you. Rest well 🌙`,
        `Great evening session, ${firstName}! The Pack sees your dedication 🐺`,
        `See you soon, ${firstName}! The Pack will be here waiting 🐺`,
      ],
    }
  };
  const pool=msgs[type]?.[period]||msgs[type]?.morning||[];
  return pool[Math.floor(Math.random()*pool.length)]||'';
}

// ─── CHECK IN (used by script.js handleCheckIn calls) ─────────
async function handleCheckIn(memberIdInput) {
  const id=memberIdInput.trim();
  if(!id){showTerminalMessage('Please enter a Member ID.','warning');return;}
  showLoading(true); clearResult();
  try {
    const row=await lookupMember(id);
    if(!row){showLoading(false);showTerminalMessage(`Member ID "${id}" not found. Please check your ID or contact reception.`,'danger');return;}
    const member      = extractMember(row, id);
    const days        = daysRemaining(member.expiryDate);
    const statusType  = getMembershipStatus(days);
    const statusLabel = statusType==='Warning'?'Active':statusType;
    try{await recordAttendance(member,statusLabel);}catch(e){console.warn('Write failed:',e);}
    showLoading(false);
    renderMemberCard(member,days,statusType);
  }catch(err){showLoading(false);showTerminalMessage(`Error: ${err.message}`,'danger');console.error(err);}
}

function renderMemberCard(member,days,statusType){
  const resultEl=document.getElementById('memberResult');
  if(!resultEl)return;
  const statusClass={Active:'status-active',Warning:'status-warning',Expired:'status-expired'}[statusType]||'status-expired';
  const badgeClass ={Active:'badge-active', Warning:'badge-warning', Expired:'badge-expired' }[statusType]||'badge-expired';
  const badgeLabel =statusType==='Warning'?'RENEWING SOON':statusType.toUpperCase();
  const daysClass  =days>3?'green':days>=0?'yellow':'red';
  const daysDisplay=days<0?`${Math.abs(days)} DAYS AGO`:days===0?'TODAY':`${days} DAYS`;
  let alertHtml='';
  if(statusType==='Expired') alertHtml=`<div class="alert alert-danger"><span class="alert-icon">🚫</span><span>MEMBERSHIP EXPIRED — PLEASE RENEW AT RECEPTION</span></div>`;
  else if(days<=3){const m=days===0?'expires TODAY':days===1?'expires TOMORROW':`expires in ${days} days`; alertHtml=`<div class="alert alert-warning"><span class="alert-icon">⚠️</span><span>Membership ${m}. Please renew soon.</span></div>`;}
  const firstName=getFirstName(member.name);
  const packMsg  =statusType!=='Expired'?getPackMessage(firstName,'checkin'):'';
  const welcomeHtml=statusType!=='Expired'?`<div class="welcome-banner"><div class="welcome-wolf">🐺</div><h2>WELCOME TO THE PACK</h2><p class="pack-msg">${packMsg}</p></div>`:'';
  resultEl.innerHTML=`
    <div class="member-result"><div class="member-card ${statusClass}">
      <div class="flex-between mb-16">
        <div><div class="member-card-name">${member.name.toUpperCase()}</div><div class="member-card-id">ID: ${member.memberID}</div></div>
        <span class="badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <div class="member-info-grid">
        <div class="member-info-item"><div class="member-info-label">Start Date</div><div class="member-info-value">${formatDate(member.startDate)}</div></div>
        <div class="member-info-item"><div class="member-info-label">Expiry Date</div><div class="member-info-value">${formatDate(member.expiryDate)}</div></div>
        <div class="member-info-item"><div class="member-info-label">Days Remaining</div><div class="days-remaining ${daysClass}">${daysDisplay}</div></div>
        <div class="member-info-item"><div class="member-info-label">Contact</div><div class="member-info-value">${member.phone||'—'}</div></div>
      </div>
      ${alertHtml}${welcomeHtml}
    </div></div>`;
  resultEl.classList.remove('hidden');
}

// ─── ADMIN ────────────────────────────────────────────────────
let adminRefreshInterval=null;
async function loadAdminDashboard(){
  try{
    const rows=await readSheet(SHEETS.ATTENDANCE_SHEET);
    const sorted=rows.slice().reverse();
    const todayStr=today();
    const todayRows=rows.filter(r=>(r['Date']||r['date']||'').trim()===todayStr);
    const counterEl=document.getElementById('packCounter');
    if(counterEl)counterEl.textContent=todayRows.length;
    const tbody=document.getElementById('attendanceTbody');
    if(!tbody)return;
    if(sorted.length===0){tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-3)">No records yet.</td></tr>`;return;}
    tbody.innerHTML=sorted.map(r=>{
      const status=r['Status']||r['status']||'';
      const bc=status==='Active'?'badge-active':status==='Expired'?'badge-expired':'badge-warning';
      return `<tr><td>${r['Date']||r['date']||'—'}</td><td>${r['Time']||r['time']||'—'}</td><td class="member-id">${r['MemberID']||r['Member ID']||'—'}</td><td class="member-name">${(r['Name']||r['name']||'—').toUpperCase()}</td><td><span class="badge ${bc}" style="font-size:0.72rem;padding:4px 10px">${status.toUpperCase()}</span></td></tr>`;
    }).join('');
    const re=document.getElementById('lastRefresh'); if(re)re.textContent=nowTime();
  }catch(err){
    const tbody=document.getElementById('attendanceTbody');
    if(tbody)tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;color:var(--red-status);padding:24px">Error: ${err.message}</td></tr>`;
  }
}
function startAdminAutoRefresh(s=8){loadAdminDashboard();if(adminRefreshInterval)clearInterval(adminRefreshInterval);adminRefreshInterval=setInterval(loadAdminDashboard,s*1000);}

// ─── HISTORY ──────────────────────────────────────────────────
let allHistoryRows=[];
async function loadHistory(){
  const tbody=document.getElementById('historyTbody');
  if(!tbody)return;
  tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:40px"><div class="spinner"></div></td></tr>`;
  try{allHistoryRows=await readSheet(SHEETS.ATTENDANCE_SHEET);renderHistoryTable(allHistoryRows);}
  catch(err){tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;color:var(--red-status);padding:24px">Error: ${err.message}</td></tr>`;}
}
function renderHistoryTable(rows){
  const tbody=document.getElementById('historyTbody'); if(!tbody)return;
  const totalEl=document.getElementById('historyTotal'); if(totalEl)totalEl.textContent=rows.length;
  if(rows.length===0){tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-3)">No records match.</td></tr>`;return;}
  tbody.innerHTML=rows.map(r=>{
    const status=r['Status']||r['status']||'';
    const bc=status==='Active'?'badge-active':status==='Expired'?'badge-expired':'badge-warning';
    return `<tr><td>${r['Date']||r['date']||'—'}</td><td>${r['Time']||r['time']||'—'}</td><td class="member-id">${r['MemberID']||r['Member ID']||'—'}</td><td class="member-name">${(r['Name']||r['name']||'—').toUpperCase()}</td><td><span class="badge ${bc}" style="font-size:0.72rem;padding:4px 10px">${status.toUpperCase()}</span></td></tr>`;
  }).join('');
}
function filterHistory(){
  const dv=(document.getElementById('filterDate')?.value||'').trim();
  const iv=(document.getElementById('filterID')?.value||'').trim().toUpperCase();
  const nv=(document.getElementById('filterName')?.value||'').trim().toUpperCase();
  let f=allHistoryRows;
  if(dv){const p=dv.split('-');const fm=`${p[2]}/${p[1]}/${p[0]}`;f=f.filter(r=>{const d=r['Date']||r['date']||'';return d.includes(fm)||d.includes(dv);});}
  if(iv)f=f.filter(r=>(r['MemberID']||r['Member ID']||'').toUpperCase().includes(iv));
  if(nv)f=f.filter(r=>(r['Name']||r['name']||'').toUpperCase().includes(nv));
  renderHistoryTable(f);
}

// ─── UI HELPERS ───────────────────────────────────────────────
function showLoading(show){ const el=document.getElementById('loadingSpinner'); if(el)el.classList.toggle('hidden',!show); }
function clearResult(){
  const el=document.getElementById('memberResult'); const msgEl=document.getElementById('terminalMessage');
  if(el){el.innerHTML='';el.classList.add('hidden');}
  if(msgEl){msgEl.innerHTML='';msgEl.classList.add('hidden');}
}
function showTerminalMessage(msg,type='info'){
  const el=document.getElementById('terminalMessage'); if(!el)return;
  const icons={success:'✅',warning:'⚠️',danger:'🚫',info:'ℹ️'};
  el.innerHTML=`<div class="alert alert-${type}"><span class="alert-icon">${icons[type]||'ℹ️'}</span><span>${msg}</span></div>`;
  el.classList.remove('hidden');
}

// ─── CONFIG ───────────────────────────────────────────────────
function showConfigOverlay(){
  document.getElementById('configOverlay')?.remove();
  const cfg=getConfig();
  const overlay=document.createElement('div');
  overlay.id='configOverlay'; overlay.className='config-overlay';
  overlay.innerHTML=`<div class="config-box">
    <div class="config-title">⚙️ SETUP</div>
    <p class="config-note">Connect your Google Sheets.<br><br>
    <strong>Spreadsheet ID</strong> — from the URL:<br>
    <code style="color:var(--rose-bright);font-size:0.8rem">spreadsheets/d/<u>THIS_PART</u>/edit</code></p>
    <label class="form-label">Spreadsheet ID</label>
    <input class="config-input" id="cfgSpreadsheetId" value="${cfg.spreadsheetId||''}" placeholder="1BxiMVs0XRA5..."/>
    <label class="form-label" style="margin-top:12px">Apps Script URL</label>
    <input class="config-input" id="cfgAppsScriptUrl" value="${cfg.appsScriptUrl||''}" placeholder="https://script.google.com/macros/s/..."/>
    <div style="display:flex;gap:10px;margin-top:20px">
      <button class="btn btn-primary" style="flex:1" onclick="saveConfigFromOverlay()">SAVE & CONNECT</button>
      ${cfg.spreadsheetId?`<button class="btn btn-secondary" onclick="document.getElementById('configOverlay').remove()">CANCEL</button>`:''}
    </div>
  </div>`;
  document.body.appendChild(overlay);
}
function saveConfigFromOverlay(){
  const id=document.getElementById('cfgSpreadsheetId').value.trim();
  const url=document.getElementById('cfgAppsScriptUrl').value.trim();
  if(!id){alert('Please enter the Spreadsheet ID.');return;}
  saveConfig({spreadsheetId:id,appsScriptUrl:url});
  document.getElementById('configOverlay').remove();
  if(typeof startAdminAutoRefresh==='function'&&document.getElementById('packCounter'))startAdminAutoRefresh();
  if(typeof loadHistory==='function'&&document.getElementById('historyTbody'))loadHistory();
}
function requireConfig(){const cfg=getConfig();if(!cfg.spreadsheetId){showConfigOverlay();return false;}return true;}

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  ['filterDate','filterID','filterName'].forEach(id=>document.getElementById(id)?.addEventListener('input',filterHistory));
  document.getElementById('settingsBtn')?.addEventListener('click',showConfigOverlay);
});
