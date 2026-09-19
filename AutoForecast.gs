/**
 * My GPF market-driven NAV estimates. Add as a NEW .gs file in the same Apps Script
 * project as Code.gs. Run installAutoForecast() ONCE as the spreadsheet owner.
 * This writes ONLY to the separate "forecast_live" tab, never to nav/set/spdr.
 * A scenario estimate is NOT an official GPF NAV, trade signal, or price prediction.
 */
var AUTO_FORECAST_TZ = 'Asia/Bangkok';
var AUTO_FORECAST_TAB = 'forecast_live';
var AUTO_STOCKS = ['DELTA','PTT','KBANK','ADVANC','KTB','SCB','BBL','GULF','PTTEP','CPN'];

function autoForecastDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number' && v > 40000 && v < 100000) {
    return new Date(Math.round((v - 25569) * 86400000));
  }
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function autoForecastNumber_(v) {
  var n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
}
function autoForecastQuote_(quotes, symbol) {
  var q = quotes[symbol];
  if (!q) return null;
  var p = autoForecastNumber_(q.price);
  var prev = autoForecastNumber_(q.prevClose);
  return p && prev ? {price:p, prev:prev, change:p / prev - 1} : null;
}
function autoForecastLatestNav_(sheet) {
  var vals = sheet.getRange(2,1,Math.max(sheet.getLastRow()-1,1),12).getValues();
  var last = null;
  vals.forEach(function(v) {
    var d = autoForecastDate_(v[0]);
    var thai = autoForecastNumber_(v[7]);
    var gold = autoForecastNumber_(v[11]);
    if (d && thai && gold && (!last || d > last.date)) {
      last = {date:d, thai:thai, gold:gold};
    }
  });
  if (!last) throw new Error('nav: cannot find an actual NAV with date, Thai and gold values');
  return last;
}
function autoForecastRefresh() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return {status:'busy'};
  try {
    var ss = getSS();
    if (!ss || ss.getId() !== LOCKED_SPREADSHEET_ID) {
      throw new Error('Spreadsheet ID mismatch; no sheet has been changed');
    }
    var nav = ss.getSheetByName('nav'), set = ss.getSheetByName('set');
    if (!nav || !set) throw new Error('Required tab nav or set is missing');
    var base = autoForecastLatestNav_(nav);
    var now = new Date();
    var ageDays = Math.floor((now.getTime() - base.date.getTime()) / 86400000);
    var weights = set.getRange(1,2,1,10).getValues()[0].map(function(v) {return Number(v)||0;});
    var symbols = AUTO_STOCKS.map(function(s){return s+'.BK';});
    var requested = symbols.concat(['^SET100','GLD','THB=X']);
    var market = fetchYahooData(requested);
    var quotes = market && market.status === 'success' ? market.data || {} : {};
    var rows = [], coverage = 0, weightedChange = 0, missing = [];
    symbols.forEach(function(s,i) {
      var q = autoForecastQuote_(quotes,s), weight=weights[i];
      if (q && weight > 0) {coverage+=weight; weightedChange+=weight*q.change;}
      else if (weight > 0) missing.push(s);
      rows.push([s,weight,q?q.price:'',q?q.prev:'',q?q.change:'',q?'OK':'NO_QUOTE']);
    });
    var benchmarkWeight = Math.max(0,1-weights.reduce(function(a,b){return a+b;},0));
    var idx=autoForecastQuote_(quotes,'^SET100');
    if (idx) {coverage+=benchmarkWeight; weightedChange+=benchmarkWeight*idx.change;}
    else missing.push('SET100 (remaining '+(benchmarkWeight*100).toFixed(1)+'% assumed flat)');
    rows.push(['^SET100',benchmarkWeight,idx?idx.price:'',idx?idx.prev:'',idx?idx.change:'',idx?'OK':'NO_QUOTE']);
    var gl=autoForecastQuote_(quotes,'GLD'), fx=autoForecastQuote_(quotes,'THB=X');
    rows.push(['GLD','',gl?gl.price:'',gl?gl.prev:'',gl?gl.change:'',gl?'OK':'NO_QUOTE']);
    rows.push(['THB=X','',fx?fx.price:'',fx?fx.prev:'',fx?fx.change:'',fx?'OK':'NO_QUOTE']);
    var fresh = ageDays >= 0 && ageDays <= 14;
    var thaiOk = fresh && missing.filter(function(m){return m.indexOf('.BK')>=0;}).length===0;
    var goldOk = fresh && gl && fx;
    var goldChange = gl && fx ? (1+gl.change)*(1+fx.change)-1 : null;
    var thaiStatus = !fresh ? 'STALE_NAV: no estimate' :
      (!thaiOk ? 'MISSING_STOCK_QUOTES: no estimate' : (!idx ? 'PARTIAL: SET100 held flat' : 'ESTIMATE'));
    var goldStatus = !fresh ? 'STALE_NAV: no estimate' :
      (!goldOk ? 'MISSING_GLD_OR_FX: no estimate' : 'ESTIMATE');
    var sheet = ss.getSheetByName(AUTO_FORECAST_TAB);
    if (!sheet) {
      sheet = ss.insertSheet(AUTO_FORECAST_TAB);
      sheet.setFrozenRows(1);
      sheet.getRange('A1:K1').setFontWeight('bold').setBackground('#e8edf9');
    }
    var baseLabel = Utilities.formatDate(base.date,AUTO_FORECAST_TZ,'yyyy-MM-dd');
    var at = Utilities.formatDate(now,AUTO_FORECAST_TZ,'yyyy-MM-dd HH:mm:ss');
    var summary = [
      ['Asset','Official NAV date','Official NAV','Market change','Indicative NAV','Coverage','Status','Checked (Bangkok)','Source','Method / limitation','Missing prices'],
      ['หุ้นไทย',baseLabel,base.thai,thaiOk?weightedChange:'',thaiOk?base.thai*(1+weightedChange):'',coverage,thaiStatus,at,'Yahoo chart + imported GPF NAV','Stock weights from set row 1; latest daily market moves; no forecast if official NAV >14 days old',missing.join('; ')],
      ['ทองคำ',baseLabel,base.gold,goldOk?goldChange:'',goldOk?base.gold*(1+goldChange):'',goldOk?1:0,goldStatus,at,'Yahoo GLD / THB=X + imported GPF NAV','GLD × USD/THB daily-return proxy; NOT official NAV; market close times may differ',gl&&fx?'':'GLD or THB=X']
    ];
    sheet.getRange(1,1,3,11).setValues(summary);
    sheet.getRange('D2:D3').setNumberFormat('0.00%');
    sheet.getRange('E2:E3').setNumberFormat('0.0000');
    sheet.getRange('F2:F3').setNumberFormat('0.0%');
    sheet.getRange(5,1,1,6).setValues([['Symbol','Model weight','Market price','Prior close','Daily change','Quote status']]);
    sheet.getRange(6,1,rows.length,6).setValues(rows);
    sheet.getRange(6,2,rows.length,1).setNumberFormat('0.00%');
    sheet.getRange(6,5,rows.length,1).setNumberFormat('0.00%');
    sheet.getRange(19,1).setValue('Indicative scenario only. Historical set/spdr and official NAV are not modified.');
    SpreadsheetApp.flush();
    return {status:'success',tab:AUTO_FORECAST_TAB,checkedAt:at,thai:thaiStatus,gold:goldStatus};
  } finally {lock.releaseLock();}
}
function autoForecastScheduled() {
  var now = new Date();
  var ymd = Utilities.formatDate(now,AUTO_FORECAST_TZ,'yyyy-MM-dd');
  var day = new Date(ymd+'T12:00:00Z').getUTCDay();
  var hour = Number(Utilities.formatDate(now,AUTO_FORECAST_TZ,'H'));
  if (day===0 || day===6 || hour<8 || hour>20) return {status:'outside_market_window'};
  return autoForecastRefresh();
}
function installAutoForecast() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction()==='autoForecastScheduled') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoForecastScheduled').timeBased().everyHours(4).create();
  return autoForecastRefresh();
}
