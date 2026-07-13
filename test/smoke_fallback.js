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

  // waybill dialog is rendered WITHOUT the expected "waybill-dialog" class,
  // simulating a real WMS whose actual markup differs from our assumed selector.
  await page.goto('http://localhost:8934/fixture.html?mismatch=1');

  var src = fs.readFileSync(path.join(__dirname, '../src/bookmarklet.js'), 'utf8').replace(/^javascript:/, '');
  await page.evaluate(src);

  await page.locator('.tv-card').waitFor({ timeout: 3000 });
  await page.locator('.tv-activate-btn').click();
  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });

  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR002');
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 5000 });

  var dialogHasExpectedClass = await page.evaluate(function(){ return !!document.querySelector('dialog.waybill-dialog'); });
  if (dialogHasExpectedClass) { console.error('FAIL: test setup broken, dialog should NOT have waybill-dialog class'); process.exitCode = 1; }

  await page.locator('.tv-waybill-area canvas').waitFor({ state: 'visible', timeout: 8000 });
  console.log('OK: virtual waybill barcode still detected via fallback selector (#waybill-modal-submit) despite mismatched dialog class');

  await sendScan(page, 'TVCW');
  await page.waitForFunction(function(){ return !document.querySelector('#waybill-modal-submit'); }, null, { timeout: 5000 });
  console.log('OK: fallback-detected modal still closes correctly on virtual barcode scan');

  console.log(process.exitCode ? 'FALLBACK SMOKE TEST: SOME FAILURES' : 'FALLBACK SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
