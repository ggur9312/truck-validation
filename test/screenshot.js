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

  var outDir = path.join(__dirname, '../dist/screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (var mode = 0; mode < 2; mode++) {
    var scheme = mode === 0 ? 'light' : 'dark';
    var page = await browser.newPage({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
    await page.goto('http://localhost:8934/fixture.html');
    var src = fs.readFileSync(path.join(__dirname, '../src/bookmarklet.js'), 'utf8').replace(/^javascript:/, '');
    await page.evaluate(src);

    await page.locator('.tv-card').waitFor({ timeout: 3000 });
    await page.screenshot({ path: path.join(outDir, 'settings-' + scheme + '.png') });

    await page.locator('.tv-activate-btn').click();
    await sendScan(page, 'TOTE001');
    await page.locator('.tv-status-text').waitFor({ timeout: 2000 }).catch(function(){});
    await page.screenshot({ path: path.join(outDir, 'loading-' + scheme + '.png') });
    await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
    await page.screenshot({ path: path.join(outDir, 'verify-' + scheme + '.png') });

    await sendScan(page, 'BAR001');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, 'verify-partial-' + scheme + '.png') });

    await sendScan(page, 'BAR001');
    await sendScan(page, 'BAR002');
    await page.locator('.tv-waybill-area canvas').waitFor({ state: 'visible', timeout: 5000 });
    await page.screenshot({ path: path.join(outDir, 'waybill-' + scheme + '.png') });

    await page.close();
  }

  console.log('screenshots written to dist/screenshots/');
  await browser.close();
  process.exit(0);
})();
