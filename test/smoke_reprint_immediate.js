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

  // TOTE_REPRINT is preset in the fixture as a tote that already has a
  // waybill (its row already carries .btn-waybill-print-single).
  await sendScan(page, 'TOTE_REPRINT');

  await page.locator('.tv-reprint-area canvas').waitFor({ state: 'visible', timeout: 5000 });
  console.log('OK: reprint barcode appears immediately after scanning a tote that already has a waybill (verification skipped)');

  var reprintBg = await page.locator('.tv-reprint-area').evaluate(function(el){ return getComputedStyle(el).backgroundColor; });
  if (reprintBg !== 'rgb(27, 33, 50)') { console.error('FAIL: reprint area should use the dark background (#1b2132), got', reprintBg); process.exitCode = 1; }
  else console.log('OK: reprint area uses the dark background');

  var verifyShown = await page.locator('.tv-verify-overlay').evaluate(function(el){ return el.classList.contains('tv-show'); });
  if (verifyShown) { console.error('FAIL: verify modal should NOT have opened for an already-generated tote'); process.exitCode = 1; }
  else console.log('OK: verify modal correctly skipped');

  await sendScan(page, 'TVCR');
  await page.waitForSelector('#modalWaybillPrintList', { timeout: 5000, state: 'attached' }).catch(function(){});
  await page.waitForFunction(function(){ return !document.querySelector('#modalWaybillPrintList'); }, null, { timeout: 5000 });
  console.log('OK: scanning the reprint barcode completes reprint end to end');

  // Some totes genuinely need reprinting more than once (lost/damaged label
  // etc.) -- the barcode must stay available instead of vanishing after one use.
  var stillVisible = await page.locator('.tv-reprint-area canvas').isVisible();
  if (!stillVisible) { console.error('FAIL: reprint barcode should stay visible for repeated reprints'); process.exitCode = 1; }
  else console.log('OK: reprint barcode is still visible after one reprint (does not disappear)');

  await sendScan(page, 'TVCR');
  await page.waitForSelector('#modalWaybillPrintList', { timeout: 5000, state: 'attached' }).catch(function(){});
  await page.waitForFunction(function(){ return !document.querySelector('#modalWaybillPrintList'); }, null, { timeout: 5000 });
  console.log('OK: scanning the reprint barcode a second time reprints again successfully');

  var stillVisible2 = await page.locator('.tv-reprint-area canvas').isVisible();
  if (!stillVisible2) { console.error('FAIL: reprint barcode should still be visible after a second reprint'); process.exitCode = 1; }
  else console.log('OK: reprint barcode remains available for further reprints');

  console.log(process.exitCode ? 'REPRINT IMMEDIATE SMOKE TEST: SOME FAILURES' : 'REPRINT IMMEDIATE SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
