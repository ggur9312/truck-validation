var { chromium } = require('playwright');
var fs = require('fs');
var path = require('path');
require('./server.js');

(async () => {
  var browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  var page = await browser.newPage();
  page.on('pageerror', function(err){ console.error('PAGE ERROR:', err.message); process.exitCode = 1; });

  await page.goto('http://localhost:8934/fixture.html');
  var src = fs.readFileSync(path.join(__dirname, '../src/bookmarklet.js'), 'utf8').replace(/^javascript:/, '');
  await page.evaluate(src);
  await page.locator('.tv-card').waitFor({ timeout: 3000 });
  await page.locator('.tv-activate-btn').click();

  // Real, human-speed typing (well below scanner speed) with focus elsewhere should NOT trigger a search.
  await page.evaluate(function(){ document.body.focus(); document.body.tabIndex = -1; document.body.focus(); });
  await page.keyboard.type('SOMETHINGELSE', { delay: 80 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  var falseTriggered = await page.evaluate(function(){ return !!document.querySelector('[data-search-count]'); });
  if (falseTriggered) {
    console.error('FAIL: slow typing with focus elsewhere should NOT trigger a search');
    process.exitCode = 1;
  } else {
    console.log('OK: slow typing with focus elsewhere correctly ignored (no false trigger)');
  }

  // Manually clicking into the tote input and typing at human speed, then pressing Enter, SHOULD trigger a search.
  await page.click('input[name="toteBarcode"]');
  await page.keyboard.type('TOTE001', { delay: 80 });
  await page.keyboard.press('Enter');

  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  console.log('OK: manually typing into the tote input + Enter triggers the search, even at non-scanner (human) speed');

  console.log(process.exitCode ? 'MANUAL TYPING SMOKE TEST: SOME FAILURES' : 'MANUAL TYPING SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
