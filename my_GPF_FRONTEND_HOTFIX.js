// ============================================================================
// my_GPF FRONTEND HOTFIX 2026-09-19
// Paste this entire block AFTER the existing main <script> block, or save as
// hotfix.js and load it after the existing script.
// Requires Code.gs_FIXED.js backend deployed first.
// ============================================================================

let sessionToken = '';

async function callBackend(action, params = {}) {
  const payload = { action: action, ...params };
  if (sessionToken) payload.token = sessionToken;

  // When the same UI is served by Apps Script HtmlService, call the router
  // instead of invoking individual server functions directly.
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .handleApiRequest(payload);
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('ไม่สามารถอ่านข้อมูลจากเซิร์ฟเวอร์ได้: ' + text.substring(0, 200));
    }

    if (data && data.code === 'UNAUTHORIZED' && action !== 'login' && action !== 'loginUser') {
      sessionToken = '';
      logout();
      throw new Error(data.message || 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }

    return data;
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new Error('เซิร์ฟเวอร์ตอบช้าเกิน 15 วินาที กรุณาลองใหม่');
    }
    throw new Error('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + e.message);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function login() {
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value.trim();
  const msgBox = document.getElementById('login-msg');

  if (!u || !p) {
    msgBox.innerHTML = 'กรุณากรอกข้อมูลให้ครบถ้วน';
    return;
  }

  msgBox.innerHTML = "กำลังตรวจสอบรหัสความปลอดภัย... <i class='fa-solid fa-spinner fa-spin'></i>";
  cachedAiAnalysis = '';

  try {
    const data = await callBackend('loginUser', { username: u, password: p });

    if (data && (data.status === 'success' || data.success)) {
      if (!data.token) {
        msgBox.innerHTML = 'Backend ยังเป็นเวอร์ชันเก่า กรุณา Deploy Code.gs_FIXED.js ก่อน';
        return;
      }

      sessionToken = data.token;
      currentUser = data.username || u;
      customPlanName = '🚀 พอร์ตของ ' + (data.fname || data.user?.fullName || u);

      document.getElementById('login-page').classList.add('hidden');
      document.getElementById('main-app').classList.remove('hidden');

      const adminBtn = document.getElementById('btnAdminPanel');
      if (adminBtn) {
        if (data.user?.role === 'admin') adminBtn.classList.remove('hidden');
        else adminBtn.classList.add('hidden');
      }

      msgBox.innerHTML = '';
      await fetchData();
    } else {
      msgBox.innerHTML = (data && data.message) || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    }
  } catch (err) {
    console.error(err);
    msgBox.innerHTML = err.message || 'เครือข่ายขัดข้อง กรุณาลองใหม่';
  }
}

function logout() {
  sessionToken = '';
  currentUser = '';
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('login-msg').innerHTML = '';
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('login-page').classList.remove('hidden');
  const adminBtn = document.getElementById('btnAdminPanel');
  if (adminBtn) adminBtn.classList.add('hidden');
  cachedAiAnalysis = '';
}

async function fetchData() {
  try {
    // Public config exposes only engine names, never API keys.
    try {
      const cfg = await callBackend('getPublicConfig');
      if (cfg && cfg.primaryAi) {
        const aiSelect = document.getElementById('aiEngineSelect');
        if (aiSelect) aiSelect.value = cfg.primaryAi;
      }
    } catch (cfgErr) {
      console.warn('getPublicConfig failed:', cfgErr);
    }

    const results = await Promise.all([
      callBackend('getNavData'),
      callBackend('getThaiStockData'),
      callBackend('getGoldData')
    ]);

    processData(results[0]);
    processThaiStockData(results[1]);
    processGoldData(results[2]);
  } catch (err) {
    console.error('Fetch Error:', err);
    const el = document.getElementById('kpi_total_money');
    if (el) el.innerHTML = '⚠️ ขัดข้อง';
  }
}

function initGpfHoldingsDashboard() {
  // Always render fallback data immediately. Live prices load afterwards.
  renderGpfHoldings();
  fetchGpfHoldingsPrices(currentHoldingsCategory);
}

function switchHoldingsCategory(cat) {
  if (!gpfHoldingsLiveState[cat]) return;
  currentHoldingsCategory = cat;

  ['thai', 'developed', 'emerging', 'reit'].forEach(c => {
    const btn = document.getElementById('btnHoldingsCat_' + c);
    if (!btn) return;
    if (c === cat) {
      btn.className = 'px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-xs transition-all flex items-center gap-1.5';
    } else {
      btn.className = 'px-3.5 py-2 rounded-xl text-xs font-semibold bg-white text-slate-600 hover:text-indigo-600 border border-slate-200 transition-all flex items-center gap-1.5';
    }
  });

  // Render default/cached values first, then get live prices for the new tab.
  renderGpfHoldings();
  fetchGpfHoldingsPrices(cat);
}

async function fetchGpfHoldingsPrices(category = currentHoldingsCategory) {
  const catData = gpfHoldingsLiveState[category];
  if (!catData) return { liveCount: 0, total: 0 };

  const timeEl = document.getElementById('holdings_last_updated');
  if (category === currentHoldingsCategory && timeEl) {
    timeEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1 text-indigo-500"></i> กำลังดึงราคาตลาด...';
  }

  const symbols = catData.items.map(i => i.symbol);
  let liveCount = 0;

  try {
    const res = await callBackend('fetchYahooData', { symbols: symbols });
    const data = res && res.status === 'success' && res.data ? res.data : {};

    catData.items.forEach(item => {
      const priceInfo = data[item.symbol];
      if (!priceInfo) return;

      const curPrice = Number(priceInfo.price);
      const prevClose = Number(priceInfo.prevClose || priceInfo.price);
      if (!Number.isFinite(curPrice) || curPrice <= 0) return;

      item.livePrice = curPrice;
      item.diff = curPrice - (Number.isFinite(prevClose) && prevClose > 0 ? prevClose : curPrice);
      item.pct = (Number.isFinite(prevClose) && prevClose > 0)
        ? (item.diff / prevClose) * 100
        : 0;
      liveCount++;
    });
  } catch (e) {
    console.warn('fetchGpfHoldingsPrices failed; fallback values remain visible:', e);
  }

  if (category === currentHoldingsCategory) {
    holdingsLastUpdatedTime = new Date();
    if (timeEl) {
      if (liveCount > 0) {
        timeEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1 text-emerald-500"></i> LIVE ${liveCount}/${catData.items.length} · ${holdingsLastUpdatedTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
      } else {
        timeEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1 text-amber-500"></i> ใช้ราคาสำรอง · Yahoo/API ยังไม่ตอบ';
      }
    }
    renderGpfHoldings();
  }

  return { liveCount: liveCount, total: catData.items.length };
}

async function refreshHoldingsData() {
  const btn = document.querySelector('button[onclick="refreshHoldingsData()"]');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> กำลังอัปเดต 35 รายการ...';

  try {
    const allItems = [];
    Object.keys(gpfHoldingsLiveState).forEach(cat => {
      gpfHoldingsLiveState[cat].items.forEach(item => allItems.push(item));
    });

    const symbols = [...new Set(allItems.map(i => i.symbol))];
    const res = await callBackend('fetchYahooData', { symbols: symbols });
    const data = res && res.status === 'success' && res.data ? res.data : {};

    let liveCount = 0;
    allItems.forEach(item => {
      const priceInfo = data[item.symbol];
      if (!priceInfo) return;

      const curPrice = Number(priceInfo.price);
      const prevClose = Number(priceInfo.prevClose || priceInfo.price);
      if (!Number.isFinite(curPrice) || curPrice <= 0) return;

      item.livePrice = curPrice;
      item.diff = curPrice - (Number.isFinite(prevClose) && prevClose > 0 ? prevClose : curPrice);
      item.pct = (Number.isFinite(prevClose) && prevClose > 0)
        ? (item.diff / prevClose) * 100
        : 0;
      liveCount++;
    });

    holdingsLastUpdatedTime = new Date();
    const timeEl = document.getElementById('holdings_last_updated');
    if (timeEl) {
      if (liveCount > 0) {
        timeEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1 text-emerald-500"></i> LIVE ${liveCount}/${symbols.length} · ${holdingsLastUpdatedTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
      } else {
        timeEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1 text-amber-500"></i> ใช้ราคาสำรอง · Yahoo/API ยังไม่ตอบ';
      }
    }

    renderGpfHoldings();

    Swal.fire({
      icon: liveCount > 0 ? 'success' : 'warning',
      title: liveCount > 0 ? `อัปเดตราคาสด ${liveCount}/${symbols.length} รายการ` : 'ยังดึงราคาสดไม่ได้',
      text: liveCount > 0 ? 'อัปเดตข้อมูลหุ้น/REIT ทั้ง 35 รายการแล้ว' : 'ระบบยังแสดงราคาสำรองเพื่อไม่ให้ตารางว่าง',
      timer: 1800,
      showConfirmButton: false
    });
  } catch (e) {
    console.error(e);
    Swal.fire('อัปเดตไม่สำเร็จ', e.message || 'ไม่สามารถเชื่อมต่อราคาตลาดได้', 'error');
  } finally {
    if (btn) btn.innerHTML = '<i class="fa-solid fa-rotate mr-1"></i> <span>รีเฟรชราคาหุ้น</span>';
  }
}
