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

  // TOTE_MISMATCH's row deliberately shows a different tote in the first
  // td than what was searched -- must be rejected before verification.
  await sendScan(page, 'TOTE_MISMATCH');
  await page.locator('.tv-status-text').filter({ hasText: '일치하지' }).waitFor({ timeout: 5000 });
  console.log('OK: mismatched first-td tote value is rejected with a clear error');

  var verifyShownAfterMismatch = await page.locator('.tv-verify-overlay').evaluate(function(el){ return el.classList.contains('tv-show'); });
  if (verifyShownAfterMismatch) { console.error('FAIL: verify modal should NOT open after a tote mismatch'); process.exitCode = 1; }
  else console.log('OK: verify modal correctly did not open after a tote mismatch');

  // The toast must appear top-center, not vertically centered.
  var overlayBox = await page.locator('.tv-status-card').boundingBox();
  var viewport = page.viewportSize();
  if (!overlayBox || overlayBox.y > viewport.height / 3) {
    console.error('FAIL: status toast should appear near the top of the viewport, got', overlayBox, 'viewport', viewport);
    process.exitCode = 1;
  } else {
    console.log('OK: status toast appears near the top of the viewport (y=' + Math.round(overlayBox.y) + ')');
  }
  await page.waitForTimeout(2200);

  // TOTE_NOBTN's row has neither a reprint nor an "운송장생성" button --
  // the tote cannot be loaded at all, so verification must never start.
  await sendScan(page, 'TOTE_NOBTN');
  await page.locator('.tv-status-text').filter({ hasText: '상차 불가한 토트입니다' }).waitFor({ timeout: 5000 });
  console.log('OK: a row with neither action button shows "상차 불가한 토트입니다"');

  var verifyShownAfterNoBtn = await page.locator('.tv-verify-overlay').evaluate(function(el){ return el.classList.contains('tv-show'); });
  if (verifyShownAfterNoBtn) { console.error('FAIL: verify modal should NOT open when the row has no action button'); process.exitCode = 1; }
  else console.log('OK: verify modal correctly did not open for a "상차 불가" tote');
  await page.waitForTimeout(2200);

  // A normal tote must still work after these rejections (state returned to IDLE).
  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  console.log('OK: a normal tote still opens verification after prior rejections');

  console.log(process.exitCode ? 'ROW VALIDATION SMOKE TEST: SOME FAILURES' : 'ROW VALIDATION SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
