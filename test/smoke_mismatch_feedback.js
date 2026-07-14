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

  var modalText = await page.locator('.tv-mismatch-overlay.tv-show .tv-mismatch-message').textContent().catch(function(){ return null; });
  if (!modalText || modalText.indexOf('이미 스캔') === -1) {
    console.error('FAIL: expected a blocking modal for an already-scanned product, got', modalText);
    process.exitCode = 1;
  } else {
    console.log('OK: blocking modal shown for an already-completed product:', modalText.trim());
  }

  var scannedText = (await page.locator('.tv-mismatch-scanned').textContent()).trim();
  if (scannedText.indexOf('BAR001') === -1) { console.error('FAIL: modal should show the barcode that was actually scanned, got', scannedText); process.exitCode = 1; }
  else console.log('OK: modal shows the scanned barcode:', scannedText);

  var backdropAlpha = await page.locator('.tv-mismatch-overlay').evaluate(function(el){
    var m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    return m ? parseFloat(m[3] === undefined ? '1' : m[3]) : null;
  });
  if (backdropAlpha === null || backdropAlpha < 0.9) {
    console.error('FAIL: mismatch modal backdrop should be opaque (not see-through), got alpha', backdropAlpha);
    process.exitCode = 1;
  } else {
    console.log('OK: mismatch modal backdrop is opaque (alpha=' + backdropAlpha + ')');
  }

  // Unlike the old toast (which auto-hid after 2s), this modal must stay up
  // until explicitly dismissed.
  await page.waitForTimeout(2200);
  var stillVisibleAfterDelay = await page.locator('.tv-mismatch-overlay').evaluate(function(el){ return el.classList.contains('tv-show'); });
  if (!stillVisibleAfterDelay) { console.error('FAIL: mismatch modal should NOT auto-hide, it must require explicit dismissal'); process.exitCode = 1; }
  else console.log('OK: mismatch modal stays open, does not auto-hide like the old toast');

  // Close it via the close button.
  await page.locator('.tv-mismatch-close').click();
  var hiddenAfterClose = await page.locator('.tv-mismatch-overlay').evaluate(function(el){ return !el.classList.contains('tv-show'); });
  if (!hiddenAfterClose) { console.error('FAIL: clicking the close button should dismiss the mismatch modal'); process.exitCode = 1; }
  else console.log('OK: close button dismisses the mismatch modal');

  // Scanning a barcode that isn't in the expected list at all used to give
  // almost no feedback (no row to highlight, just a subtle card shake).
  var scanPromise2 = sendScan(page, 'BAR_TOTALLY_UNKNOWN');
  await page.locator('.tv-mismatch-overlay.tv-show .tv-mismatch-message').filter({ hasText: '등록되지 않은' }).waitFor({ timeout: 2000 });
  console.log('OK: blocking modal shown for a barcode not in the expected list at all');
  var scannedText2 = (await page.locator('.tv-mismatch-scanned').textContent()).trim();
  if (scannedText2.indexOf('BAR_TOTALLY_UNKNOWN') === -1) { console.error('FAIL: modal should show the unrecognized scanned barcode, got', scannedText2); process.exitCode = 1; }
  else console.log('OK: modal shows the unrecognized scanned barcode:', scannedText2);
  await scanPromise2;

  // Enter must also dismiss it (scanners emit Enter after every scan).
  await page.evaluate(function(){
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  var hiddenAfterEnter = await page.locator('.tv-mismatch-overlay').evaluate(function(el){ return !el.classList.contains('tv-show'); });
  if (!hiddenAfterEnter) { console.error('FAIL: pressing Enter should dismiss the mismatch modal'); process.exitCode = 1; }
  else console.log('OK: pressing Enter dismisses the mismatch modal');

  // A fresh scan after dismissal must be processed normally, not swallowed
  // by residual modal-blocking state.
  await sendScan(page, 'BAR002');
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 5000 });
  console.log('OK: scanning normally after dismissing the modal completes verification');

  console.log(process.exitCode ? 'MISMATCH FEEDBACK SMOKE TEST: SOME FAILURES' : 'MISMATCH FEEDBACK SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
