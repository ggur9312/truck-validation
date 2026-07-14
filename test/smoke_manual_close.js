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

  await page.waitForSelector('#modalOutboundWaybill.is-open', { timeout: 5000 });
  await page.locator('.tv-waybill-area canvas').waitFor({ state: 'visible', timeout: 5000 });
  console.log('OK: waybill modal open, virtual barcode visible');

  // Close the modal directly (as a user would with its own X/close button),
  // WITHOUT scanning our virtual barcode. The real WMS modal never leaves the
  // DOM -- it just loses the "is-open" class -- so this must be detected via
  // that class, not via element presence/removal.
  await page.click('#manual-close-x');

  await page.locator('.tv-waybill-area canvas').waitFor({ state: 'hidden', timeout: 5000 });
  console.log('OK: virtual waybill barcode disappears when the WMS modal is closed manually (not via our scan)');

  var dialogStillInDom = await page.evaluate(function(){ return !!document.getElementById('modalOutboundWaybill'); });
  var dialogOpenClass = await page.evaluate(function(){ var d = document.getElementById('modalOutboundWaybill'); return d ? d.classList.contains('is-open') : null; });
  if (!dialogStillInDom) {
    console.error('FAIL: test setup broken, modal element should remain in DOM after manual close (class toggle, not removal)');
    process.exitCode = 1;
  } else if (dialogOpenClass !== false) {
    console.error('FAIL: test setup broken, is-open class should be removed after manual close');
    process.exitCode = 1;
  } else {
    console.log('OK: confirmed this genuinely exercises the "closed via class toggle but still in DOM" case, not element removal');
  }

  console.log(process.exitCode ? 'MANUAL CLOSE SMOKE TEST: SOME FAILURES' : 'MANUAL CLOSE SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
