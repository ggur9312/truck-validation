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
  var page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  page.on('pageerror', function(err){ console.error('PAGE ERROR:', err.message); process.exitCode = 1; });

  await page.goto('http://localhost:8934/fixture.html');
  var src = fs.readFileSync(path.join(__dirname, '../src/bookmarklet.js'), 'utf8').replace(/^javascript:/, '');
  await page.evaluate(src);
  await page.locator('.tv-card').waitFor({ timeout: 3000 });
  await page.locator('.tv-activate-btn').click();
  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });

  // The product list only sets overflow-y:auto -- per the CSS overflow spec,
  // leaving overflow-x unset in that case makes it compute to "auto" too
  // (not "visible"), which let the row error-shake's translateX transiently
  // flash a real horizontal scrollbar. Must stay explicitly hidden.
  var overflowX = await page.locator('.tv-product-list').evaluate(function(el){ return getComputedStyle(el).overflowX; });
  if (overflowX !== 'hidden') { console.error('FAIL: .tv-product-list overflow-x should be "hidden", got', overflowX); process.exitCode = 1; }
  else console.log('OK: product list has overflow-x:hidden (prevents the transient scrollbar flash)');

  // BAR001 requires 2 scans. Fully complete it, then scan it a 3rd time --
  // this is the repro for both the scrollbar flash and the weak mismatch
  // feedback (a barely-visible shake was the only signal before this fix).
  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR001');

  var scanPromise = sendScan(page, 'BAR001');
  var sawScrollbar = false;
  for (var i = 0; i < 12; i++) {
    var hasScrollbar = await page.locator('.tv-product-list').evaluate(function(el){
      return getComputedStyle(el).overflowX !== 'hidden';
    });
    if (hasScrollbar) sawScrollbar = true;
    await page.waitForTimeout(40);
  }
  await scanPromise;
  if (sawScrollbar) { console.error('FAIL: overflow-x briefly left "hidden" during the error shake'); process.exitCode = 1; }
  else console.log('OK: no scrollbar flash during repeat-scan error shake');

  var toastText = await page.locator('.tv-status-overlay.tv-show .tv-status-text').textContent().catch(function(){ return null; });
  if (!toastText || toastText.indexOf('이미 스캔') === -1) {
    console.error('FAIL: expected a clear "already scanned" toast, got', toastText);
    process.exitCode = 1;
  } else {
    console.log('OK: unmistakable center-screen toast shown for an already-completed product:', toastText.trim());
  }

  await page.waitForTimeout(2200); // let toast auto-hide before the next one

  // Scanning a barcode that isn't in the expected list at all used to give
  // almost no feedback (no row to highlight, just a subtle card shake).
  var scanPromise2 = sendScan(page, 'BAR_TOTALLY_UNKNOWN');
  await page.locator('.tv-status-overlay.tv-show .tv-status-text').filter({ hasText: '등록되지 않은' }).waitFor({ timeout: 2000 });
  console.log('OK: unmistakable toast shown for a barcode not in the expected list at all');
  await scanPromise2;

  console.log(process.exitCode ? 'MISMATCH FEEDBACK SMOKE TEST: SOME FAILURES' : 'MISMATCH FEEDBACK SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
