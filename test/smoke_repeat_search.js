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
  console.log('OK: first search of TOTE001 opens verify modal');

  await page.locator('.tv-verify-close').click();
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 3000 });

  // Re-searching the exact same tote used to render byte-identical markup,
  // which the old content-equality check never saw as "changed" -- it hung
  // for the full timeout and then showed a misleading error. It must now
  // resolve quickly via the mutation-settle detection instead.
  var start = Date.now();
  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  var elapsed = Date.now() - start;
  console.log('OK: re-searching the same tote opens verify modal again (took ' + elapsed + 'ms)');

  if (elapsed > 3000) {
    console.error('FAIL: repeat search took ' + elapsed + 'ms, expected well under the old 10s timeout path');
    process.exitCode = 1;
  } else {
    console.log('OK: repeat search resolved quickly, not via the timeout fallback');
  }

  var errorShown = await page.locator('.tv-status-card.error').isVisible().catch(function(){ return false; });
  if (errorShown) { console.error('FAIL: an error status was shown for a valid repeat search'); process.exitCode = 1; }
  else console.log('OK: no error status shown for the repeat search');

  console.log(process.exitCode ? 'REPEAT SEARCH SMOKE TEST: SOME FAILURES' : 'REPEAT SEARCH SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
