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

  // TOTE_EXTRACOL has an unexpected extra <td> before the delivery-type
  // field. A stray front-indexed read would land on neither 트럭 nor 택배
  // and default to courier; counting from the end of the row must still
  // correctly detect this as a truck tote.
  await sendScan(page, 'TOTE_EXTRACOL');
  await page.locator('.tv-verify').filter({ hasText: '업체X' }).waitFor({ timeout: 5000 });
  var badgeText = await page.locator('.tv-verify-type-hero').textContent();
  if (badgeText.indexOf('트럭') === -1) { console.error('FAIL: TOTE_EXTRACOL should be detected as truck despite the extra column, got', badgeText); process.exitCode = 1; }
  else console.log('OK: extra unexpected column before the type field does not fool detection -- still correctly reads truck');

  await page.locator('.tv-verify-close').click();
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 3000 });

  // TOTE_BADTYPE's delivery-type field is neither 트럭 nor 택배. This must
  // never silently proceed as courier -- it should block with a warning
  // modal instead.
  await sendScan(page, 'TOTE_BADTYPE');
  await page.locator('.tv-mismatch-overlay').waitFor({ state: 'visible', timeout: 5000 });
  var mismatchVisible = await page.locator('.tv-mismatch-overlay').isVisible();
  var verifyVisible = await page.locator('.tv-verify-overlay').isVisible().catch(function(){ return false; });
  if (!mismatchVisible || verifyVisible) { console.error('FAIL: an unrecognized delivery-type value should block with a warning modal, not open the verify modal, got mismatchVisible=', mismatchVisible, 'verifyVisible=', verifyVisible); process.exitCode = 1; }
  else console.log('OK: unrecognized delivery-type value blocks with a warning modal instead of defaulting to courier');

  var mismatchMessage = (await page.locator('.tv-mismatch-message').textContent()).trim();
  var mismatchScanned = (await page.locator('.tv-mismatch-scanned').textContent()).trim();
  if (mismatchMessage.indexOf('판별') === -1 || mismatchScanned.indexOf('TOTE_BADTYPE') === -1) {
    console.error('FAIL: warning modal should explain the delivery type could not be determined and show the tote barcode, got message=', mismatchMessage, 'scanned=', mismatchScanned);
    process.exitCode = 1;
  } else {
    console.log('OK: warning modal shows the reason and the scanned tote barcode:', mismatchMessage, '/', mismatchScanned);
  }

  // Dismiss via Enter and confirm a normal tote still works right after.
  await page.keyboard.press('Enter');
  await page.locator('.tv-mismatch-overlay').waitFor({ state: 'hidden', timeout: 3000 });

  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  console.log('OK: a normal tote still verifies correctly right after the warning modal is dismissed');

  console.log(process.exitCode ? 'DELIVERY TYPE UNKNOWN SMOKE TEST: SOME FAILURES' : 'DELIVERY TYPE UNKNOWN SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
