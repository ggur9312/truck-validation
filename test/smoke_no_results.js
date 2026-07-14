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

  // TOTE_NONE is preset in the fixture to render an empty result table
  // (no <tr> at all), simulating a tote with no matching WMS results.
  var start = Date.now();
  await sendScan(page, 'TOTE_NONE');
  await page.locator('.tv-status-text').filter({ hasText: '결과가 없습니다' }).waitFor({ timeout: 5000 });
  var elapsed = Date.now() - start;
  console.log('OK: empty result table is reported as "no results" (took ' + elapsed + 'ms)');

  if (elapsed > 3000) {
    console.error('FAIL: empty-result detection took ' + elapsed + 'ms, expected well under the old 10s timeout path');
    process.exitCode = 1;
  } else {
    console.log('OK: empty-result detection resolved quickly, not via the timeout fallback');
  }

  var verifyShown = await page.locator('.tv-verify-overlay').evaluate(function(el){ return el.classList.contains('tv-show'); });
  if (verifyShown) { console.error('FAIL: verify modal should NOT open when there are no results'); process.exitCode = 1; }
  else console.log('OK: verify modal correctly did not open');

  // Confirm state returned to IDLE: a normal search should work right after.
  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  console.log('OK: a normal search still works right after a no-results search (state returned to IDLE)');

  console.log(process.exitCode ? 'NO RESULTS SMOKE TEST: SOME FAILURES' : 'NO RESULTS SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
