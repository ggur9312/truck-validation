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

  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR002');
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 5000 });

  await page.waitForSelector('.waybill-dialog', { timeout: 5000 });
  await page.locator('.tv-waybill-area canvas').waitFor({ state: 'visible', timeout: 5000 });
  console.log('OK: waybill dialog open, virtual barcode visible');

  // Close the native <dialog> directly (as a user would with its own X/close
  // button), WITHOUT scanning our virtual barcode. dialog.close() does not
  // remove the element from the DOM -- it just becomes closed/hidden.
  await page.click('#manual-close-x');

  await page.locator('.tv-waybill-area canvas').waitFor({ state: 'hidden', timeout: 5000 });
  console.log('OK: virtual waybill barcode disappears when the WMS dialog is closed manually (not via our scan)');

  var dialogStillInDom = await page.evaluate(function(){ return !!document.querySelector('.waybill-dialog'); });
  var dialogOpen = await page.evaluate(function(){ var d = document.querySelector('.waybill-dialog'); return d ? d.open : null; });
  if (!dialogStillInDom) {
    console.error('FAIL: test setup broken, dialog element should remain in DOM after close() (not remove())');
    process.exitCode = 1;
  } else if (dialogOpen !== false) {
    console.error('FAIL: test setup broken, dialog.open should be false after manual close');
    process.exitCode = 1;
  } else {
    console.log('OK: confirmed this genuinely exercises the "closed but still in DOM" case, not just element removal');
  }

  console.log(process.exitCode ? 'MANUAL CLOSE SMOKE TEST: SOME FAILURES' : 'MANUAL CLOSE SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
