// ============================================================================
// my_GPF FRONTEND HOTFIX 2026-09-23
// Paste this entire block AFTER the existing main <script> block, or save as
// hotfix.js and load it after the existing script.
// Requires the matching Code.gs backend deployed first.
// ============================================================================

let sessionToken = '';
let cachedPersonalWebullPortfolio = null;

function isMithongSession() {
  return String(currentUser || '').trim().toLowerCase() === 'mithong';
}

function escapeWebullText(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatWebullMoney(value, currency = 'USD') {
  const numberValue = Number(value) || 0;
  const currencyCode = String(currency || 'USD').toUpperCase();
  if (isMasked) return `${currencyCode} ••••••`;
  try {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numberValue);
  } catch (e) {
    return `${currencyCode} ${numberValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function formatWebullNumber(value, digits = 4) {
  if (isMasked) return '••••';
  return (Number(value) || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

function renderPersonalWebullPortfolio(result) {
  const section = document.getElementById('personalWebullSection');
  const content = document.getElementById('personalWebullContent');
  const message = document.getElementById('personalWebullMessage');
  const status = document.getElementById('personalWebullStatus');
  if (!section) return;

  if (!isMithongSession()) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  if (!result || !result.success) {
    if (content) content.classList.add('hidden');
    if (message) {
      message.className = 'mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800';
      message.textContent = (result && result.message) || 'ยังไม่สามารถโหลดพอร์ต Webull ได้';
      message.classList.remove('hidden');
    }
    if (status) status.textContent = 'เชื่อมต่อ Webull ไม่สำเร็จ · ข้อมูล กบข. ส่วนอื่นยังใช้งานได้ตามปกติ';
    return;
  }

  const accounts = Array.isArray(result.accounts) ? result.accounts : [];
  const primaryCurrency = accounts[0]?.currency || accounts[0]?.balance?.currency || 'USD';
  const sameCurrencyAccounts = accounts.filter(account =>
    String(account.currency || account.balance?.currency || primaryCurrency).toUpperCase() === String(primaryCurrency).toUpperCase()
  );
  const totals = sameCurrencyAccounts.reduce((sum, account) => {
    const balance = account.balance || {};
    sum.totalAssets += Number(balance.totalAssets) || 0;
    sum.marketValue += Number(balance.marketValue) || 0;
    sum.cash += Number(balance.cash) || 0;
    return sum;
  }, { totalAssets: 0, marketValue: 0, cash: 0 });

  const positions = accounts.flatMap(account =>
    (Array.isArray(account.positions) ? account.positions : []).map(position => ({
      ...position,
      account: account.account,
      accountType: account.accountType,
      currency: position.currency || account.currency || primaryCurrency
    }))
  );
  const unrealizedPnl = positions
    .filter(position => String(position.currency).toUpperCase() === String(primaryCurrency).toUpperCase())
    .reduce((sum, position) => sum + (Number(position.unrealizedPnl) || 0), 0);

  document.getElementById('webullTotalAssets').textContent = formatWebullMoney(totals.totalAssets, primaryCurrency);
  document.getElementById('webullMarketValue').textContent = formatWebullMoney(totals.marketValue, primaryCurrency);
  document.getElementById('webullCash').textContent = formatWebullMoney(totals.cash, primaryCurrency);
  const pnlElement = document.getElementById('webullUnrealizedPnl');
  pnlElement.textContent = formatWebullMoney(unrealizedPnl, primaryCurrency);
  pnlElement.className = `text-lg font-black mt-1 ${unrealizedPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`;

  const tbody = document.getElementById('personalWebullPositionsBody');
  if (tbody) {
    tbody.innerHTML = positions.length ? positions.map(position => {
      const pnl = Number(position.unrealizedPnl) || 0;
      const pct = Number(position.unrealizedPct) || 0;
      const pnlClass = pnl >= 0 ? 'text-emerald-600' : 'text-rose-600';
      const sign = pnl >= 0 ? '+' : '';
      return `
        <tr class="hover:bg-blue-50/40">
          <td class="text-left">
            <div class="font-black text-slate-900">${escapeWebullText(position.symbol)}</div>
            <div class="text-[10px] text-slate-500">${escapeWebullText(position.name || position.instrumentType)} · ${escapeWebullText(position.market)} · ${escapeWebullText(position.account)}</div>
          </td>
          <td class="text-right font-mono text-slate-700">${formatWebullNumber(position.quantity)}</td>
          <td class="text-right font-mono text-slate-700">${formatWebullMoney(position.averageCost, position.currency)}</td>
          <td class="text-right font-mono text-slate-700">${formatWebullMoney(position.lastPrice, position.currency)}</td>
          <td class="text-right font-bold text-slate-900">${formatWebullMoney(position.marketValue, position.currency)}</td>
          <td class="text-right font-bold ${pnlClass}">${isMasked ? '••••' : `${sign}${formatWebullMoney(pnl, position.currency)} (${sign}${pct.toFixed(2)}%)`}</td>
        </tr>`;
    }).join('') : '<tr><td colspan="6" class="text-center py-5 text-slate-400">บัญชีเชื่อมต่อแล้ว แต่ยังไม่มีสถานะถือครอง</td></tr>';
  }

  if (message) {
    const warnings = Array.isArray(result.errors) ? result.errors : [];
    if (warnings.length) {
      message.className = 'mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800';
      message.textContent = 'โหลดข้อมูลได้บางส่วน กรุณากดอัปเดตอีกครั้งหากยอดไม่ครบ';
      message.classList.remove('hidden');
    } else {
      message.classList.add('hidden');
    }
  }
  if (content) content.classList.remove('hidden');
  if (status) {
    const updated = result.fetchedAt ? new Date(result.fetchedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-';
    status.textContent = `${result.accountCount || accounts.length} บัญชี · ${result.positionCount || positions.length} สถานะถือครอง · ${String(result.environment || '').toUpperCase()} · อัปเดต ${updated} น.`;
  }
}

async function loadPersonalWebullPortfolio(forceRefresh = false) {
  const section = document.getElementById('personalWebullSection');
  const button = document.getElementById('personalWebullRefreshBtn');
  const status = document.getElementById('personalWebullStatus');
  if (!section) return;

  if (!isMithongSession()) {
    section.classList.add('hidden');
    cachedPersonalWebullPortfolio = null;
    return;
  }

  section.classList.remove('hidden');
  if (status) status.textContent = 'กำลังดึงยอดบัญชีและสถานะถือครองจาก Webull...';
  if (button) {
    button.disabled = true;
    button.classList.add('opacity-60', 'cursor-wait');
  }

  try {
    const result = await callBackend('getWebullPortfolio', { refresh: !!forceRefresh });
    cachedPersonalWebullPortfolio = result;
    renderPersonalWebullPortfolio(result);
  } catch (error) {
    const result = { success: false, message: error.message || 'เชื่อมต่อ Webull ไม่สำเร็จ' };
    cachedPersonalWebullPortfolio = result;
    renderPersonalWebullPortfolio(result);
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('opacity-60', 'cursor-wait');
    }
  }
}

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
  cachedPersonalWebullPortfolio = null;
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('login-msg').innerHTML = '';
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('login-page').classList.remove('hidden');
  const adminBtn = document.getElementById('btnAdminPanel');
  if (adminBtn) adminBtn.classList.add('hidden');
  const webullSection = document.getElementById('personalWebullSection');
  if (webullSection) webullSection.classList.add('hidden');
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
    await loadPersonalWebullPortfolio(false);
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
  let sourceCounts = { webull: 0, yahoo: 0 };

  try {
    const res = await callBackend('fetchMarketData', { symbols: symbols });
    const data = res && res.status === 'success' && res.data ? res.data : {};
    sourceCounts = res && res.sources ? res.sources : sourceCounts;

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
      item.source = priceInfo.source || 'yahoo';
      liveCount++;
    });
  } catch (e) {
    console.warn('fetchGpfHoldingsPrices failed; fallback values remain visible:', e);
  }

  if (category === currentHoldingsCategory) {
    holdingsLastUpdatedTime = new Date();
    if (timeEl) {
      if (liveCount > 0) {
        const providerSummary = [
          sourceCounts.webull ? `WEBULL ${sourceCounts.webull}` : '',
          sourceCounts.yahoo ? `YAHOO ${sourceCounts.yahoo}` : ''
        ].filter(Boolean).join(' · ') || `LIVE ${liveCount}`;
        timeEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1 text-emerald-500"></i> ${providerSummary} · ${holdingsLastUpdatedTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
      } else {
        timeEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1 text-amber-500"></i> ใช้ราคาสำรอง · Webull/Yahoo ยังไม่ตอบ';
      }
    }
    renderGpfHoldings();
  }

  return { liveCount: liveCount, total: catData.items.length, sources: sourceCounts };
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
    const res = await callBackend('fetchMarketData', { symbols: symbols });
    const data = res && res.status === 'success' && res.data ? res.data : {};
    const sourceCounts = res && res.sources ? res.sources : { webull: 0, yahoo: 0 };

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
      item.source = priceInfo.source || 'yahoo';
      liveCount++;
    });

    holdingsLastUpdatedTime = new Date();
    const timeEl = document.getElementById('holdings_last_updated');
    if (timeEl) {
      if (liveCount > 0) {
        const providerSummary = [
          sourceCounts.webull ? `WEBULL ${sourceCounts.webull}` : '',
          sourceCounts.yahoo ? `YAHOO ${sourceCounts.yahoo}` : ''
        ].filter(Boolean).join(' · ') || `LIVE ${liveCount}`;
        timeEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1 text-emerald-500"></i> ${providerSummary} · ${holdingsLastUpdatedTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
      } else {
        timeEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1 text-amber-500"></i> ใช้ราคาสำรอง · Webull/Yahoo ยังไม่ตอบ';
      }
    }

    renderGpfHoldings();

    Swal.fire({
      icon: liveCount > 0 ? 'success' : 'warning',
      title: liveCount > 0 ? `อัปเดตราคาสด ${liveCount}/${symbols.length} รายการ` : 'ยังดึงราคาสดไม่ได้',
      text: liveCount > 0
        ? `Webull ${sourceCounts.webull || 0} · Yahoo ${sourceCounts.yahoo || 0} รายการ`
        : 'ระบบยังแสดงราคาสำรองเพื่อไม่ให้ตารางว่าง',
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
