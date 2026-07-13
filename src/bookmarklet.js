javascript:(function(){
'use strict';

if (window.__tvBookmarklet) { window.__tvBookmarklet.openSettings(); return; }

var SEL = {
  toteInput: 'input[name="toteBarcode"]',
  searchBtn: '#search',
  dateRange: '#date-range-input',
  resultTable: '#vendorReturnTotePage',
  waybillDialog: 'div.waybill-dialog',
  waybillSubmit: '#waybill-modal-submit',
  waybillBoxInput: '#waybill-modal-barcode-input',
  reprintModal: '#modalWaybillPrintList',
  reprintAllBtn: '#waybill-print-all'
};

var CTRL = { SKIP: 'TVCTL_SKIP', WAYBILL: 'TVCTL_WAYBILL', REPRINT: 'TVCTL_REPRINT' };

var SETTING_DEFS = [];

var state = {
  mode: 'IDLE',
  settings: loadSettings(),
  toteInfo: null,
  expected: new Map()
};

function loadSettings(){
  try { return Object.assign({ enabled: false }, JSON.parse(localStorage.getItem('tv_settings') || '{}')); }
  catch (e) { return { enabled: false }; }
}
function saveSettings(){ localStorage.setItem('tv_settings', JSON.stringify(state.settings)); }

var C128_TABLE = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232"];
var C128_STOP = '2331112';

function code128Values(text){
  var values = [104];
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i) - 32;
    if (code < 0 || code > 94) throw new Error('unsupported barcode char');
    values.push(code);
  }
  var checksum = values[0];
  for (var j = 1; j < values.length; j++) checksum += values[j] * j;
  values.push(checksum % 103);
  return values;
}

function code128Patterns(text){
  var patterns = code128Values(text).map(function(v){ return C128_TABLE[v]; });
  patterns.push(C128_STOP);
  return patterns;
}

function drawCode128(canvas, text, opts){
  if (!canvas) return;
  opts = opts || {};
  var mw = opts.moduleWidth || 2;
  var h = opts.height || 46;
  var quiet = opts.quiet == null ? 10 : opts.quiet;
  var patterns = code128Patterns(text);
  var modules = 0;
  patterns.forEach(function(p){ for (var i = 0; i < p.length; i++) modules += Number(p[i]); });
  var width = quiet * 2 + modules * mw;
  canvas.width = width;
  canvas.height = h;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, h);
  ctx.fillStyle = '#000';
  var x = quiet;
  patterns.forEach(function(p){
    var bar = true;
    for (var i = 0; i < p.length; i++) {
      var w = Number(p[i]) * mw;
      if (bar) ctx.fillRect(x, 0, w, h);
      x += w;
      bar = !bar;
    }
  });
}

var CSS =
  ':host{all:initial;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif;' +
  '--tv-surface:#1b1d23;--tv-surface-2:#25272f;--tv-text:#f4f5f7;--tv-text-soft:#9ba0ac;' +
  '--tv-accent:#ffb020;--tv-accent-ink:#1a1300;--tv-border:#34363f;--tv-success:#3fcf87;--tv-success-tint:#16321f;--tv-error:#ff6b5e;' +
  '--tv-truck-bg:#1e2a4d;--tv-truck-fg:#82a6ff;--tv-courier-bg:#4a3315;--tv-courier-fg:#ffb56b;' +
  '--tv-shadow:0 30px 80px rgba(0,0,0,.55),0 6px 20px rgba(0,0,0,.35)}' +

  '.tv-toast-area{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:10px;pointer-events:none}' +
  '.tv-toast{padding:13px 22px;border-radius:10px;background:var(--tv-surface-2);color:var(--tv-text);border:1px solid var(--tv-border);font-size:15px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.4);opacity:0;transform:translateY(-10px);transition:opacity .25s,transform .25s}' +
  '.tv-toast-in{opacity:1;transform:translateY(0)}' +
  '.tv-toast-err{background:var(--tv-error);color:#2a0d09;border-color:var(--tv-error)}' +

  '.tv-overlay{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}' +
  '.tv-overlay.tv-show{display:flex}' +
  '.tv-overlay.tv-corner{align-items:flex-end;justify-content:flex-start;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;padding:0 0 92px 22px}' +
  '.tv-verify-overlay{background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;pointer-events:none}' +
  '.tv-verify-overlay .tv-card{pointer-events:auto}' +

  '.tv-card{background:var(--tv-surface);color:var(--tv-text);border-radius:14px;width:400px;max-width:92vw;box-shadow:var(--tv-shadow);border:1px solid var(--tv-border);box-sizing:border-box;overflow:hidden;animation:tvPop .22s cubic-bezier(.2,.9,.3,1.2)}' +
  '@keyframes tvPop{from{opacity:0;transform:scale(.94) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}' +
  '.tv-overlay.tv-corner .tv-card{animation:tvSlideUp .3s cubic-bezier(.2,.9,.3,1.2)}' +
  '@keyframes tvSlideUp{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:translateY(0)}}' +

  '.tv-head-bar{background:var(--tv-accent);color:var(--tv-accent-ink);padding:18px 26px;font-size:19px;font-weight:900;letter-spacing:-.2px}' +
  '.tv-card-body{padding:26px}' +

  '.tv-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:15px 0;font-size:15px;font-weight:500;border-top:1px solid var(--tv-border)}' +
  '.tv-toggle-row input{display:none}' +
  '.tv-switch{position:relative;width:48px;height:28px;border-radius:14px;background:#43454f;transition:background .2s;flex-shrink:0}' +
  '.tv-switch:before{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 2px 5px rgba(0,0,0,.4)}' +
  '.tv-toggle-row input:checked + .tv-switch{background:var(--tv-success)}' +
  '.tv-toggle-row input:checked + .tv-switch:before{transform:translateX(20px)}' +
  '.tv-empty-hint{font-size:14px;color:var(--tv-text-soft);padding:10px 0}' +

  '.tv-activate-btn{margin-top:22px;width:100%;padding:18px;border:none;border-radius:10px;background:var(--tv-accent);color:var(--tv-accent-ink);font-size:17px;font-weight:900;letter-spacing:.2px;cursor:pointer;box-shadow:0 14px 28px rgba(255,176,32,.28);transition:transform .15s,box-shadow .15s}' +
  '.tv-activate-btn:hover{transform:translateY(-2px);box-shadow:0 18px 34px rgba(255,176,32,.36)}' +
  '.tv-activate-btn:active{transform:scale(.97)}' +

  '.tv-gear-btn{position:fixed;left:22px;bottom:22px;z-index:2147483600;width:56px;height:56px;border-radius:50%;border:2px solid var(--tv-accent);background:var(--tv-surface-2);color:var(--tv-accent);font-size:24px;cursor:pointer;box-shadow:0 10px 26px rgba(0,0,0,.45);transition:transform .18s}' +
  '.tv-gear-btn:hover{transform:rotate(30deg) scale(1.05)}' +
  '.tv-gear-btn.tv-hidden{display:none}' +

  '.tv-status-badge{position:fixed;top:20px;right:24px;z-index:2147483600;display:flex;align-items:center;gap:9px;padding:10px 18px;border-radius:10px;background:var(--tv-surface-2);color:var(--tv-text);border:2px solid var(--tv-accent);font-size:14px;font-weight:800;box-shadow:0 10px 26px rgba(0,0,0,.4);letter-spacing:.1px}' +
  '.tv-status-badge.tv-hidden{display:none}' +
  '.tv-status-dot{width:9px;height:9px;border-radius:50%;background:var(--tv-success);box-shadow:0 0 0 0 rgba(63,207,135,.6);animation:tvStatusPulse 2s ease-in-out infinite}' +
  '@keyframes tvStatusPulse{0%{box-shadow:0 0 0 0 rgba(63,207,135,.55)}70%{box-shadow:0 0 0 7px rgba(63,207,135,0)}100%{box-shadow:0 0 0 0 rgba(63,207,135,0)}}' +

  '.tv-type-badge{display:inline-flex;align-items:center;gap:10px;padding:10px 18px;border-radius:10px;font-weight:900;font-size:18px;margin-bottom:20px;border:2px solid}' +
  '.tv-type-badge.truck{background:var(--tv-truck-bg);color:var(--tv-truck-fg);border-color:var(--tv-truck-fg)}' +
  '.tv-type-badge.courier{background:var(--tv-courier-bg);color:var(--tv-courier-fg);border-color:var(--tv-courier-fg)}' +

  '.tv-info-row{display:flex;justify-content:space-between;font-size:14px;padding:7px 0;color:var(--tv-text-soft);border-bottom:1px solid var(--tv-border)}' +
  '.tv-info-row b{color:var(--tv-text);font-weight:800;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}' +

  '.tv-product-list{margin-top:20px;max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}' +
  '.tv-product-row{padding:14px 16px;border-radius:10px;background:var(--tv-surface-2);border:2px solid var(--tv-border);transition:background .2s,border-color .2s}' +
  '.tv-product-top{display:flex;justify-content:space-between;align-items:flex-start;font-size:15px;font-weight:800;margin-bottom:8px;gap:12px}' +
  '.tv-product-name{display:flex;flex-direction:column;gap:2px;min-width:0}' +
  '.tv-product-barcode{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:600;color:var(--tv-text-soft);letter-spacing:.3px}' +
  '.tv-product-count{flex-shrink:0;color:var(--tv-text-soft);font-weight:800;font-variant-numeric:tabular-nums;padding-top:2px;font-family:ui-monospace,monospace}' +
  '.tv-progress{height:8px;border-radius:2px;background:var(--tv-border);overflow:hidden}' +
  '.tv-progress-fill{height:100%;background:var(--tv-accent);transition:width .25s ease}' +
  '.tv-product-row.done{background:var(--tv-success-tint);border-color:var(--tv-success)}' +
  '.tv-product-row.done .tv-progress-fill{background:var(--tv-success)}' +
  '.tv-product-row.pulse{animation:tvPulse 1s ease-in-out infinite}' +
  '@keyframes tvPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,176,32,.4)}50%{box-shadow:0 0 0 8px rgba(255,176,32,0)}}' +
  '.tv-check{color:var(--tv-success);font-weight:900}' +

  '.tv-barcode-wrap{display:inline-block;background:#fff;padding:14px 16px;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}' +
  '.tv-skip-area{margin-top:22px;text-align:center;border-top:2px solid var(--tv-border);padding-top:18px}' +
  '.tv-skip-label{font-size:13px;font-weight:900;letter-spacing:.3px;color:var(--tv-accent);margin-bottom:10px}' +

  '.tv-flash-ok{animation:tvFlashOk .4s}.tv-flash-err{animation:tvFlashErr .4s}' +
  '@keyframes tvFlashOk{0%{box-shadow:0 0 0 0 rgba(63,207,135,.6)}100%{box-shadow:0 0 0 16px rgba(63,207,135,0)}}' +
  '@keyframes tvFlashErr{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}' +
  '.tv-complete{animation:tvComplete .65s ease}' +
  '@keyframes tvComplete{0%{transform:scale(1)}50%{transform:scale(1.03)}100%{transform:scale(1);opacity:.4}}' +

  '.tv-float-area{position:fixed;z-index:2147483400;display:none}' +
  '.tv-float-area.tv-show{display:block}' +
  '.tv-float-barcode{background:var(--tv-surface);border-radius:12px;border:2px solid var(--tv-border);padding:16px 18px;box-shadow:var(--tv-shadow);text-align:center;animation:tvSlideUp .3s cubic-bezier(.2,.9,.3,1.2)}' +
  '.tv-float-label{font-size:13px;font-weight:900;letter-spacing:.2px;color:var(--tv-accent);margin-bottom:10px}' +
  '.tv-top-right{top:96px;right:26px}.tv-top-left{top:96px;left:26px}';

var ui = {};

function initUI(){
  var host = document.createElement('div');
  host.style.all = 'initial';
  document.documentElement.appendChild(host);
  var shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML =
    '<style>' + CSS + '</style>' +
    '<div class="tv-toast-area"></div>' +
    '<div class="tv-overlay tv-settings-overlay"></div>' +
    '<div class="tv-overlay tv-verify-overlay"></div>' +
    '<div class="tv-float-area tv-waybill-area"></div>' +
    '<div class="tv-float-area tv-reprint-area"></div>' +
    '<div class="tv-status-badge tv-hidden"><span class="tv-status-dot"></span>트럭검증 활성화</div>' +
    '<button class="tv-gear-btn tv-hidden" title="프로그램 설정">⚙</button>';
  ui.shadow = shadow;
  ui.toastArea = shadow.querySelector('.tv-toast-area');
  ui.settingsOverlay = shadow.querySelector('.tv-settings-overlay');
  ui.verifyOverlay = shadow.querySelector('.tv-verify-overlay');
  ui.waybillOverlay = shadow.querySelector('.tv-waybill-area');
  ui.reprintOverlay = shadow.querySelector('.tv-reprint-area');
  ui.statusBadge = shadow.querySelector('.tv-status-badge');
  ui.gearBtn = shadow.querySelector('.tv-gear-btn');
  ui.gearBtn.addEventListener('click', function(){ openSettingsModal(false); });
}

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function showToast(msg, kind){
  var el = document.createElement('div');
  el.className = 'tv-toast ' + (kind === 'error' ? 'tv-toast-err' : 'tv-toast-ok');
  el.textContent = msg;
  ui.toastArea.appendChild(el);
  requestAnimationFrame(function(){ el.classList.add('tv-toast-in'); });
  setTimeout(function(){
    el.classList.remove('tv-toast-in');
    setTimeout(function(){ el.remove(); }, 300);
  }, 2200);
}

function openSettingsModal(center){
  var overlay = ui.settingsOverlay;
  overlay.classList.remove('tv-center', 'tv-corner');
  overlay.innerHTML = renderSettingsHTML();
  overlay.classList.add('tv-show', center ? 'tv-center' : 'tv-corner');
  bindSettingsEvents();
}

function closeSettingsModal(){
  ui.settingsOverlay.classList.remove('tv-show', 'tv-center', 'tv-corner');
  ui.settingsOverlay.innerHTML = '';
}

function toggleSettings(){
  if (ui.settingsOverlay.classList.contains('tv-show')) closeSettingsModal();
  else openSettingsModal(!state.settings.enabled);
}

function renderSettingsHTML(){
  var toggles = SETTING_DEFS.map(function(d){
    return '<label class="tv-toggle-row"><span>' + escapeHtml(d.label) + '</span>' +
      '<input type="checkbox" data-key="' + d.key + '" ' + (state.settings[d.key] ? 'checked' : '') + '/>' +
      '<span class="tv-switch"></span></label>';
  }).join('');
  return '<div class="tv-card tv-settings-card">' +
    '<div class="tv-head-bar">트럭검증 설정</div>' +
    '<div class="tv-card-body">' +
    (toggles || '<div class="tv-empty-hint">추가 설정 예정</div>') +
    '<button class="tv-activate-btn">' + (state.settings.enabled ? '실행 중 ✓' : '활성화') + '</button>' +
    '</div></div>';
}

function bindSettingsEvents(){
  var overlay = ui.settingsOverlay;
  overlay.querySelectorAll('input[type=checkbox]').forEach(function(cb){
    cb.addEventListener('change', function(){
      state.settings[cb.dataset.key] = cb.checked;
      saveSettings();
    });
  });
  var btn = overlay.querySelector('.tv-activate-btn');
  btn.addEventListener('click', function(){
    state.settings.enabled = true;
    saveSettings();
    closeSettingsModal();
    showActiveIndicators();
    showToast('트럭검증 활성화됨');
  });
}

function showActiveIndicators(){
  ui.gearBtn.classList.remove('tv-hidden');
  ui.statusBadge.classList.remove('tv-hidden');
}

function setNativeValue(el, value){
  var proto = Object.getPrototypeOf(el);
  var desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  desc.set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function fmtDate(d){
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function setDateRange(){
  var el = document.querySelector(SEL.dateRange);
  if (!el) return;
  var end = new Date();
  var start = new Date();
  start.setDate(start.getDate() - 7);
  var endStr = fmtDate(end);
  var startStr = fmtDate(start);

  el.setAttribute('enddate', endStr);
  el.setAttribute('startdate', startStr);
  try { el.endDate = endStr; el.startDate = startStr; } catch (e) {}
  ['input', 'change'].forEach(function(t){ el.dispatchEvent(new Event(t, { bubbles: true })); });

  var inner = []
    .concat(el.shadowRoot ? Array.prototype.slice.call(el.shadowRoot.querySelectorAll('input')) : [])
    .concat(Array.prototype.slice.call(el.querySelectorAll('input')));
  if (inner.length >= 2) {
    setNativeValue(inner[0], startStr);
    setNativeValue(inner[1], endStr);
    inner.forEach(function(i){ i.dispatchEvent(new Event('blur', { bubbles: true })); });
  } else if (inner.length === 1) {
    setNativeValue(inner[0], startStr + ' ~ ' + endStr);
    inner[0].dispatchEvent(new Event('blur', { bubbles: true }));
  }
}

var scanBuf = { chars: [], lastTs: 0 };
var SCAN_GAP_MS = 400;
var SCAN_FAST_MS = 40;

function resetScanBuf(){ scanBuf.chars = []; scanBuf.lastTs = 0; }

function onGlobalKeydown(e){
  if (!state.settings.enabled) return;
  var now = Date.now();
  if (now - scanBuf.lastTs > SCAN_GAP_MS) resetScanBuf();
  if (e.key === 'Enter') {
    var chars = scanBuf.chars;
    var code = chars.map(function(c){ return c.ch; }).join('');
    resetScanBuf();
    if (!code) return;
    var isCtrl = code.indexOf('TVCTL_') === 0;
    var looksLikeScan = isCtrl;
    if (!isCtrl && chars.length >= 4) {
      var intervals = [];
      for (var i = 1; i < chars.length; i++) intervals.push(chars[i].ts - chars[i - 1].ts);
      var avg = intervals.reduce(function(a, b){ return a + b; }, 0) / intervals.length;
      looksLikeScan = avg <= SCAN_FAST_MS;
    }
    if (!looksLikeScan) return;
    if (isCtrl) {
      e.preventDefault();
      e.stopPropagation();
      setTimeout(function(){
        var active = document.activeElement;
        if (active && 'value' in active && typeof active.value === 'string' && active.value.indexOf(code) !== -1) {
          setNativeValue(active, active.value.split(code).join(''));
        }
      }, 0);
    }
    handleScan(code, isCtrl);
    return;
  }
  if (e.key.length === 1) {
    scanBuf.chars.push({ ch: e.key, ts: now });
    scanBuf.lastTs = now;
  }
}

function handleScan(code, isCtrl){
  if (state.mode === 'IDLE' && !isCtrl) { startSearch(code); return; }
  if (state.mode === 'VERIFYING') {
    if (isCtrl && code === CTRL.SKIP) completeVerification();
    else if (!isCtrl) markProductScan(code);
    return;
  }
  if (state.mode === 'WAITING_WAYBILL' && isCtrl && code === CTRL.WAYBILL) { clickWaybillSubmit(); return; }
  if (state.mode === 'REPRINT_READY' && isCtrl && code === CTRL.REPRINT) { doReprint(); return; }
}

function getFirstRow(){
  var table = document.querySelector(SEL.resultTable);
  if (!table) return null;
  return table.querySelector('tbody tr') || table.querySelector('tr');
}

function waitForRowChange(prevSig, timeout){
  timeout = timeout || 10000;
  return new Promise(function(resolve, reject){
    var table = document.querySelector(SEL.resultTable);
    if (!table) { reject(new Error('no table')); return; }
    var done = false;
    function finish(row){ if (done) return; done = true; obs.disconnect(); clearTimeout(timer); resolve(row); }
    function check(){
      var row = getFirstRow();
      if (row && row.children.length >= 11 && row.textContent !== prevSig) finish(row);
    }
    var obs = new MutationObserver(check);
    obs.observe(table, { childList: true, subtree: true, characterData: true });
    var timer = setTimeout(function(){ if (!done) { obs.disconnect(); reject(new Error('timeout')); } }, timeout);
    check();
  });
}

function waitForSelector(sel, timeout){
  timeout = timeout || 8000;
  return new Promise(function(resolve, reject){
    var found = document.querySelector(sel);
    if (found) { resolve(found); return; }
    var obs = new MutationObserver(function(){
      var el = document.querySelector(sel);
      if (el) { obs.disconnect(); clearTimeout(timer); resolve(el); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    var timer = setTimeout(function(){ obs.disconnect(); reject(new Error('timeout')); }, timeout);
  });
}

function startSearch(toteBarcode){
  state.mode = 'SEARCHING';
  var input = document.querySelector(SEL.toteInput);
  var btn = document.querySelector(SEL.searchBtn);
  if (!input || !btn) { showToast('조회 요소를 찾을 수 없습니다', 'error'); state.mode = 'IDLE'; return; }
  showToast('조회 중...');
  setNativeValue(input, toteBarcode);
  setDateRange();
  var prevRow = getFirstRow();
  var prevSig = prevRow ? prevRow.textContent : null;
  btn.click();
  waitForRowChange(prevSig).then(processRow).catch(function(){
    showToast('조회 결과를 가져오지 못했습니다', 'error');
    state.mode = 'IDLE';
  });
}

function getTable(doc, idx){ return doc.querySelectorAll('table')[idx]; }
function getRows(table){
  return Array.prototype.filter.call(table.querySelectorAll('tr'), function(tr){ return tr.querySelectorAll('td').length > 0; });
}
function td(tr, idx){
  var tds = tr.querySelectorAll('td');
  return tds[idx] ? tds[idx].textContent.trim() : '';
}

function fetchDoc(url){
  return fetch(url, { credentials: 'include' }).then(function(res){ return res.text(); })
    .then(function(text){ return new DOMParser().parseFromString(text, 'text/html'); });
}

function parseDeliveryType(doc){
  var table = getTable(doc, 1);
  if (!table) return null;
  var rows = getRows(table);
  if (!rows[0]) return null;
  var val = td(rows[0], 3);
  return val.indexOf('트럭') !== -1;
}

function parseToteAndProducts(doc){
  var t1 = getTable(doc, 0);
  var t2 = getTable(doc, 1);
  if (!t1 || !t2) return null;
  var r1 = getRows(t1)[0];
  if (!r1) return null;
  var toteBarcode = td(r1, 0);
  var vendor = td(r1, 4);
  var totalQty = parseInt(td(r1, 7), 10) || 0;
  var products = getRows(t2).map(function(tr){
    return { name: td(tr, 3), barcode: td(tr, 4), qty: parseInt(td(tr, 5), 10) || 1 };
  }).filter(function(p){ return p.barcode; });
  return { toteBarcode: toteBarcode, vendor: vendor, totalQty: totalQty, products: products };
}

function buildExpectedMap(products){
  var map = new Map();
  products.forEach(function(p){
    var existing = map.get(p.barcode);
    if (existing) existing.required += p.qty;
    else map.set(p.barcode, { name: p.name, required: p.qty, scanned: 0 });
  });
  return map;
}

function processRow(row){
  var tds = row.querySelectorAll('td');
  var linkProduct = tds[0] && tds[0].querySelector('a[href]');
  var linkType = tds[1] && tds[1].querySelector('a[href]');
  if (!linkProduct || !linkType) { showToast('링크를 찾을 수 없습니다', 'error'); state.mode = 'IDLE'; return; }
  showToast('상세정보 조회 중...');
  Promise.all([fetchDoc(linkProduct.href), fetchDoc(linkType.href)]).then(function(docs){
    var isTruck = parseDeliveryType(docs[1]);
    var info = parseToteAndProducts(docs[0]);
    if (!info) { showToast('상품 정보를 해석하지 못했습니다', 'error'); state.mode = 'IDLE'; return; }
    state.toteInfo = Object.assign({ isTruck: isTruck }, info);
    state.expected = buildExpectedMap(info.products);
    state.mode = 'VERIFYING';
    openVerifyModal();
  }).catch(function(){
    showToast('상세페이지를 불러오지 못했습니다', 'error');
    state.mode = 'IDLE';
  });
}

function openVerifyModal(){
  var info = state.toteInfo;
  var typeIcon = info.isTruck ? '🚚' : '📦';
  var typeText = info.isTruck ? '트럭' : '택배';
  var typeClass = info.isTruck ? 'truck' : 'courier';
  ui.verifyOverlay.innerHTML =
    '<div class="tv-card tv-verify">' +
    '<div class="tv-head-bar">상품 검증</div>' +
    '<div class="tv-card-body">' +
    '<div class="tv-type-badge ' + typeClass + '"><span>' + typeIcon + '</span><span>' + typeText + '</span></div>' +
    '<div class="tv-info-row"><span>업체명</span><b>' + escapeHtml(info.vendor) + '</b></div>' +
    '<div class="tv-info-row"><span>토트바코드</span><b>' + escapeHtml(info.toteBarcode) + '</b></div>' +
    '<div class="tv-info-row"><span>전체 집품수량</span><b>' + info.totalQty + '</b></div>' +
    '<div class="tv-product-list"></div>' +
    '<div class="tv-skip-area"><div class="tv-skip-label">검증 건너뛰기 (스캔)</div><div class="tv-barcode-wrap"><canvas class="tv-skip-barcode"></canvas></div></div>' +
    '</div></div>';
  ui.verifyOverlay.classList.add('tv-show');
  drawCode128(ui.verifyOverlay.querySelector('.tv-skip-barcode'), CTRL.SKIP);
  updateVerifyProgress();
}

function updateVerifyProgress(){
  var list = ui.verifyOverlay.querySelector('.tv-product-list');
  if (!list) return;
  var html = '';
  var allDone = true;
  state.expected.forEach(function(p, barcode){
    var done = p.scanned >= p.required;
    if (!done) allDone = false;
    var pulsing = p.required > 1 && p.scanned > 0 && !done;
    var pct = Math.min(100, Math.round((p.scanned / p.required) * 100));
    html += '<div class="tv-product-row ' + (done ? 'done' : '') + ' ' + (pulsing ? 'pulse' : '') + '">' +
      '<div class="tv-product-top">' +
      '<span class="tv-product-name">' + escapeHtml(p.name) + '<span class="tv-product-barcode">' + escapeHtml(barcode) + '</span></span>' +
      '<span class="tv-product-count">' + p.scanned + '/' + p.required + (done ? ' <span class="tv-check">✓</span>' : '') + '</span>' +
      '</div>' +
      '<div class="tv-progress"><div class="tv-progress-fill" style="width:' + pct + '%"></div></div>' +
      '</div>';
  });
  list.innerHTML = html;
  if (allDone && state.expected.size > 0) completeVerification();
}

function markProductScan(barcode){
  var p = state.expected.get(barcode);
  if (!p || p.scanned >= p.required) { flashVerify('error'); return; }
  p.scanned += 1;
  flashVerify('success');
  updateVerifyProgress();
}

function flashVerify(kind){
  var card = ui.verifyOverlay.querySelector('.tv-card');
  if (!card) return;
  card.classList.remove('tv-flash-ok', 'tv-flash-err');
  void card.offsetWidth;
  card.classList.add(kind === 'success' ? 'tv-flash-ok' : 'tv-flash-err');
}

function completeVerification(){
  if (state.mode !== 'VERIFYING') return;
  state.mode = 'DONE_VERIFY';
  var card = ui.verifyOverlay.querySelector('.tv-card');
  if (card) card.classList.add('tv-complete');
  setTimeout(function(){
    ui.verifyOverlay.classList.remove('tv-show');
    ui.verifyOverlay.innerHTML = '';
    afterVerification();
  }, 650);
}

function afterVerification(){
  if (state.toteInfo.isTruck) {
    state.mode = 'IDLE';
    showToast('트럭 - 검증 완료');
    return;
  }
  var row = getFirstRow();
  var tds = row && row.querySelectorAll('td');
  var last = tds && tds[tds.length - 1];
  var openBtn = last && last.querySelector('[data-action="open-waybill-modal"]');
  if (!openBtn) { showToast('운송장 생성 버튼을 찾을 수 없습니다', 'error'); state.mode = 'IDLE'; return; }
  openBtn.click();
  state.mode = 'WAITING_WAYBILL_OPEN';
  watchWaybillDialog();
}

function findWaybillModalNode(){
  return document.querySelector(SEL.waybillDialog) ||
    document.querySelector(SEL.waybillSubmit) ||
    document.querySelector(SEL.waybillBoxInput);
}

var waybillObserver = null;
var waybillPollId = null;
var waybillTimeoutId = null;

function clearWaybillWatchers(){
  if (waybillObserver) { waybillObserver.disconnect(); waybillObserver = null; }
  if (waybillPollId) { clearInterval(waybillPollId); waybillPollId = null; }
  if (waybillTimeoutId) { clearTimeout(waybillTimeoutId); waybillTimeoutId = null; }
}

function watchWaybillDialog(){
  clearWaybillWatchers();
  function check(){
    var found = findWaybillModalNode();
    if (found && state.mode === 'WAITING_WAYBILL_OPEN') {
      if (waybillTimeoutId) { clearTimeout(waybillTimeoutId); waybillTimeoutId = null; }
      state.mode = 'WAITING_WAYBILL';
      showWaybillOverlay();
    } else if (!found && state.mode === 'WAITING_WAYBILL') {
      clearWaybillWatchers();
      hideWaybillOverlay();
      afterWaybillClosed();
    }
  }
  waybillObserver = new MutationObserver(check);
  waybillObserver.observe(document.body, { childList: true, subtree: true });
  waybillPollId = setInterval(check, 400);
  waybillTimeoutId = setTimeout(function(){
    if (state.mode === 'WAITING_WAYBILL_OPEN') {
      clearWaybillWatchers();
      showToast('운송장 모달을 찾지 못했습니다', 'error');
      state.mode = 'IDLE';
    }
  }, 6000);
  check();
}

function showWaybillOverlay(){
  var overlay = ui.waybillOverlay;
  overlay.innerHTML = '<div class="tv-float-barcode tv-top-right"><div class="tv-float-label">📮 스캔하여 운송장생성</div><div class="tv-barcode-wrap"><canvas></canvas></div></div>';
  drawCode128(overlay.querySelector('canvas'), CTRL.WAYBILL);
  overlay.classList.add('tv-show');
}
function hideWaybillOverlay(){ ui.waybillOverlay.classList.remove('tv-show'); ui.waybillOverlay.innerHTML = ''; }

function clickWaybillSubmit(){
  var btn = document.querySelector(SEL.waybillSubmit);
  if (btn) btn.click();
}

function afterWaybillClosed(){
  state.mode = 'REFRESHING';
  showToast('운송장 생성 완료 - 재조회 중...');
  var prevRow = getFirstRow();
  var prevSig = prevRow ? prevRow.textContent : null;
  var btn = document.querySelector(SEL.searchBtn);
  if (btn) btn.click();
  waitForRowChange(prevSig).then(showReprintOverlay, showReprintOverlay);
}

function showReprintOverlay(){
  state.mode = 'REPRINT_READY';
  var overlay = ui.reprintOverlay;
  overlay.innerHTML = '<div class="tv-float-barcode tv-top-left"><div class="tv-float-label">🖨 운송장 재출력</div><div class="tv-barcode-wrap"><canvas></canvas></div></div>';
  drawCode128(overlay.querySelector('canvas'), CTRL.REPRINT);
  overlay.classList.add('tv-show');
}
function hideReprintOverlay(){ ui.reprintOverlay.classList.remove('tv-show'); ui.reprintOverlay.innerHTML = ''; }

function doReprint(){
  hideReprintOverlay();
  var row = getFirstRow();
  var tds = row && row.querySelectorAll('td');
  var last = tds && tds[tds.length - 1];
  var btn = last && last.querySelector('.btn-waybill-print-single');
  if (!btn) { showToast('재출력 버튼을 찾을 수 없습니다', 'error'); state.mode = 'IDLE'; return; }
  btn.click();
  waitForSelector(SEL.reprintModal).then(function(){
    var allBtn = document.querySelector(SEL.reprintAllBtn);
    if (allBtn) allBtn.click();
    showToast('재출력 완료');
  }).catch(function(){
    showToast('재출력 모달을 찾지 못했습니다', 'error');
  }).then(function(){ state.mode = 'IDLE'; });
}

function boot(){
  initUI();
  if (state.settings.enabled) showActiveIndicators();
  document.addEventListener('keydown', onGlobalKeydown, true);
  openSettingsModal(true);
}

window.__tvBookmarklet = { openSettings: function(){ openSettingsModal(true); }, toggleSettings: toggleSettings };

boot();
})();
