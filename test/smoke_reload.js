var { chromium } = require('playwright');
var fs = require('fs');
var path = require('path');
require('./server.js');

(async () => {
  var browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  var page = await browser.newPage();
  page.on('pageerror', function(err){ console.error('PAGE ERROR:', err.message); process.exitCode = 1; });

  var src = fs.readFileSync(path.join(__dirname, '../src/bookmarklet.js'), 'utf8').replace(/^javascript:/, '');

  await page.goto('http://localhost:8934/fixture.html');
  await page.evaluate(src);
  await page.locator('.tv-card').waitFor({ timeout: 3000 });
  await page.locator('.tv-activate-btn').click();
  await page.locator('.tv-status-badge').waitFor({ state: 'visible', timeout: 3000 });
  console.log('OK: activated in first session, status badge visible');

  await page.reload();
  await page.evaluate(src);

  var btnText = await page.locator('.tv-activate-btn').textContent();
  if (btnText.indexOf('활성화') === -1 || btnText.indexOf('실행 중') !== -1) {
    console.error('FAIL: after reload, activate button should show "활성화" (deactivated state), got', btnText);
    process.exitCode = 1;
  } else {
    console.log('OK: after page reload, settings modal shows deactivated "활성화" button (not auto-running)');
  }

  var badgeVisibleAfterReload = await page.locator('.tv-status-badge').isVisible();
  if (badgeVisibleAfterReload) {
    console.error('FAIL: status badge should NOT be visible immediately after reload without pressing activate again');
    process.exitCode = 1;
  } else {
    console.log('OK: status badge hidden after reload until activate is pressed again');
  }

  console.log(process.exitCode ? 'RELOAD SMOKE TEST: SOME FAILURES' : 'RELOAD SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
