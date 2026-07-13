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

  await sendScan(page, 'TOTE002');

  await page.locator('.tv-verify').filter({ hasText: '업체B' }).waitFor({ timeout: 5000 });
  var badgeText = await page.locator('.tv-type-badge').textContent();
  if (badgeText.indexOf('트럭') === -1) { console.error('FAIL: expected truck badge, got', badgeText); process.exitCode = 1; }
  else console.log('OK: truck badge shown:', badgeText.trim());

  await sendScan(page, 'BAR003');
  await sendScan(page, 'BAR003');
  await sendScan(page, 'BAR003');

  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 5000 });
  console.log('OK: verify modal closed after truck-flow scan completion');

  await page.waitForTimeout(1500);
  var dialogPresent = await page.evaluate(function(){ return !!document.querySelector('.waybill-dialog'); });
  if (dialogPresent) { console.error('FAIL: waybill-dialog should NOT open for truck flow'); process.exitCode = 1; }
  else console.log('OK: waybill-dialog correctly NOT opened for truck flow');

  console.log(process.exitCode ? 'TRUCK SMOKE TEST: SOME FAILURES' : 'TRUCK SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
