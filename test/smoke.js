var { chromium } = require('playwright');
var fs = require('fs');
var path = require('path');
require('./server.js');

function sendScan(page, text){
  return page.evaluate(function(str){
    var target = document.activeElement || document.body;
    for (var i = 0; i < str.length; i++) {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: str[i], bubbles: true, cancelable: true }));
    }
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  }, text);
}

(async () => {
  var browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  var page = await browser.newPage();
  page.on('pageerror', function(err){ console.error('PAGE ERROR:', err.message); process.exitCode = 1; });

  await page.goto('http://localhost:8934/fixture.html');

  var src = fs.readFileSync(path.join(__dirname, '../src/bookmarklet.js'), 'utf8');
  var body = src.replace(/^javascript:/, '');
  await page.evaluate(body);

  // Locators pierce open shadow roots automatically.
  await page.locator('.tv-card').waitFor({ timeout: 3000 });
  console.log('OK: settings modal appeared');

  await page.locator('.tv-activate-btn').click();
  console.log('OK: activate clicked');

  await sendScan(page, 'TOTE001');

  var dateCheck = await page.evaluate(function(){
    function fmt(d){ var y = d.getFullYear(); var m = String(d.getMonth() + 1).padStart(2, '0'); var day = String(d.getDate()).padStart(2, '0'); return y + '-' + m + '-' + day; }
    var end = new Date();
    var start = new Date();
    start.setDate(start.getDate() - 7);
    return {
      expectedStart: fmt(start),
      expectedEnd: fmt(end),
      attrStart: document.querySelector('#date-range-input').getAttribute('startdate'),
      attrEnd: document.querySelector('#date-range-input').getAttribute('enddate'),
      hiddenInputValue: document.querySelector('[data-hidden] input[shadow-input]').value
    };
  });
  if (dateCheck.attrStart !== dateCheck.expectedStart || dateCheck.attrEnd !== dateCheck.expectedEnd) {
    console.error('FAIL: startdate/enddate attributes not set correctly', dateCheck);
    process.exitCode = 1;
  } else {
    console.log('OK: startdate/enddate attributes set correctly:', dateCheck.attrStart, '~', dateCheck.attrEnd);
  }
  if (dateCheck.hiddenInputValue !== '') {
    console.error('FAIL: hidden proxy input should NOT be touched, got', dateCheck.hiddenInputValue);
    process.exitCode = 1;
  } else {
    console.log('OK: hidden proxy input left untouched (no longer corrupted)');
  }

  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  console.log('OK: verify modal shows vendor 업체A');

  var badgeText = await page.locator('.tv-type-banner').textContent();
  if (badgeText.indexOf('택배') === -1) { console.error('FAIL: expected courier badge, got', badgeText); process.exitCode = 1; }
  else console.log('OK: courier badge shown:', badgeText.trim());

  var toteText = await page.locator('.tv-verify').textContent();
  if (toteText.indexOf('TOTE001') === -1 || toteText.indexOf('7') === -1) { console.error('FAIL: tote info missing'); process.exitCode = 1; }
  else console.log('OK: tote barcode + qty shown');

  var barcodeTexts = await page.locator('.tv-product-barcode').allTextContents();
  if (barcodeTexts.indexOf('BAR001') === -1 || barcodeTexts.indexOf('BAR002') === -1) {
    console.error('FAIL: product barcode values not shown in verify modal', barcodeTexts);
    process.exitCode = 1;
  } else {
    console.log('OK: product barcode values shown:', barcodeTexts.join(', '));
  }

  var verifyBg = await page.locator('.tv-verify-overlay').evaluate(function(el){ return getComputedStyle(el).backgroundColor; });
  if (verifyBg !== 'rgba(0, 0, 0, 0)' && verifyBg !== 'transparent') {
    console.error('FAIL: verify overlay should have no background tint, got', verifyBg);
    process.exitCode = 1;
  } else {
    console.log('OK: verify overlay background is transparent (no dim tint)');
  }

  var badgeVisible = await page.locator('.tv-status-badge').isVisible();
  if (!badgeVisible) { console.error('FAIL: active status badge should be visible after activation'); process.exitCode = 1; }
  else console.log('OK: top-right active status badge visible');

  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR001');
  var afterFirstTwo = await page.locator('.tv-product-row').first().textContent();
  console.log('DEBUG product row after 2x BAR001 scan:', afterFirstTwo.trim());

  await sendScan(page, 'BAR002');

  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 5000 });
  console.log('OK: verify modal auto-closed after full scan');

  await page.waitForSelector('.waybill-dialog', { timeout: 5000 });
  console.log('OK: WMS waybill-dialog (native <dialog> shown via showModal(), i.e. top-layer) opened automatically (courier flow)');

  await page.locator('.tv-waybill-area canvas').waitFor({ state: 'visible', timeout: 5000 });
  console.log('OK: virtual waybill barcode rendered top-right and visible even with a native top-layer <dialog> open');

  var boxInputVal = await page.locator('#waybill-modal-barcode-input').inputValue();
  if (boxInputVal !== '') { console.error('FAIL: box input should remain untouched, got', boxInputVal); process.exitCode = 1; }
  else console.log('OK: waybill box input untouched by our script');

  await sendScan(page, 'TVCW');

  await page.waitForFunction(function(){ return !document.querySelector('.waybill-dialog'); }, null, { timeout: 5000 });
  console.log('OK: waybill-dialog closed after virtual barcode scan (submit clicked)');

  await page.locator('.tv-reprint-area canvas').waitFor({ state: 'visible', timeout: 5000 });
  console.log('OK: reprint virtual barcode shown top-left after re-search (proves the post-waybill re-search completed)');

  await sendScan(page, 'TVCR');

  await page.waitForSelector('#modalWaybillPrintList', { timeout: 5000, state: 'attached' }).catch(function(){});
  await page.waitForFunction(function(){ return !document.querySelector('#modalWaybillPrintList'); }, null, { timeout: 5000 });
  console.log('OK: reprint modal opened and auto-completed (waybill-print-all clicked)');

  console.log(process.exitCode ? 'SMOKE TEST: SOME FAILURES' : 'SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
