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
  var src = fs.readFileSync(path.join(__dirname, '../src/bookmarklet.js'), 'utf8').replace(/^javascript:/, '');
  await page.evaluate(src);
  await page.locator('.tv-card').waitFor({ timeout: 3000 });
  await page.locator('.tv-activate-btn').click();

  // TOTE_REPRINT is preset in the fixture as already having a waybill, so
  // scanning it skips straight to REPRINT_READY (reprint barcode top-left).
  await sendScan(page, 'TOTE_REPRINT');
  await page.locator('.tv-reprint-area canvas').waitFor({ state: 'visible', timeout: 5000 });
  console.log('OK: reprint barcode shown after scanning a tote with an existing waybill');

  // Scanning a fresh real tote barcode while REPRINT_READY used to be
  // silently dropped -- it must now start a brand-new search instead.
  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  console.log('OK: scanning a new tote while reprint barcode is showing starts a fresh search');

  var reprintStillVisible = await page.locator('.tv-reprint-area canvas').isVisible().catch(function(){ return false; });
  if (reprintStillVisible) { console.error('FAIL: stale reprint barcode should be hidden once a new search starts'); process.exitCode = 1; }
  else console.log('OK: stale reprint barcode hidden once the new search took over');

  console.log(process.exitCode ? 'SCAN DURING REPRINT SMOKE TEST: SOME FAILURES' : 'SCAN DURING REPRINT SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
