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

  // TOTE001's detail page (fetched via the first row's 3rd-td link) carries
  // group number "GRP1" (1st table, 1st td) and restriction vendor name
  // "제한업체A" (2nd table, 1st td) -- distinct from info.vendor ("업체A")
  // so a test that accidentally reused the wrong field would fail here.
  await page.locator('.tv-group-input').fill('99, GRP1 ,88');
  await page.locator('.tv-activate-btn').click();

  var restrictBadgeText = await page.locator('.tv-status-badge-restrict').textContent();
  if (!(await page.locator('.tv-status-badge-restrict').isVisible()) || restrictBadgeText.indexOf('99') === -1 || restrictBadgeText.indexOf('GRP1') === -1 || restrictBadgeText.indexOf('88') === -1) {
    console.error('FAIL: restriction line should show inside the status badge, listing the configured groups, got', restrictBadgeText);
    process.exitCode = 1;
  } else {
    console.log('OK: restriction line visible inside the status badge:', restrictBadgeText.trim());
  }

  var badgeIsOneBox = await page.locator('.tv-status-badge').evaluate(function(el){ return el.querySelector('.tv-status-badge-restrict') !== null; });
  if (!badgeIsOneBox) { console.error('FAIL: restriction line should live inside .tv-status-badge, not a separate floating box'); process.exitCode = 1; }
  else console.log('OK: restriction line is nested inside the single status badge, not a separate box');

  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });

  var bannerClass = await page.locator('.tv-type-banner').getAttribute('class');
  if (bannerClass.indexOf('restricted') === -1) { console.error('FAIL: banner should have the "restricted" class, got', bannerClass); process.exitCode = 1; }
  else console.log('OK: type banner switches to the restricted (orange) variant');

  var bannerText = await page.locator('.tv-type-banner').textContent();
  if (bannerText.indexOf('상차제한') === -1 || bannerText.indexOf('제한업체A') === -1) {
    console.error('FAIL: banner should show the restriction phrase and the restricted vendor name, got', bannerText);
    process.exitCode = 1;
  } else {
    console.log('OK: banner shows restriction phrase + correct vendor name:', bannerText.trim());
  }

  var bannerBg = await page.locator('.tv-type-banner').evaluate(function(el){ return getComputedStyle(el).backgroundImage; });
  if (bannerBg.indexOf('251, 146, 60') === -1) { console.error('FAIL: banner should use the orange gradient, got', bannerBg); process.exitCode = 1; }
  else console.log('OK: banner uses the orange restricted gradient');

  // Fully scan both products -- verification should still run normally.
  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR002');
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 5000 });
  console.log('OK: verification completes normally under restriction');

  // TOTE001 is a courier tote and would normally auto-open the waybill
  // modal -- restriction must skip that, ending like the truck flow.
  await page.waitForTimeout(1500);
  var waybillOpened = await page.evaluate(function(){ return !!document.querySelector('#modalOutboundWaybill.is-open'); });
  if (waybillOpened) { console.error('FAIL: waybill modal should NOT open for a restricted courier tote'); process.exitCode = 1; }
  else console.log('OK: waybill modal correctly skipped for a restricted tote (verify-only, like the truck flow)');

  // Unlike "enabled" (which intentionally resets on reload), the configured
  // group numbers are plain settings and should survive a fresh page load.
  await page.reload();
  await page.evaluate(src);
  await page.locator('.tv-card').waitFor({ timeout: 3000 });
  var persistedValue = await page.locator('.tv-group-input').inputValue();
  if (persistedValue !== '99, GRP1 ,88') { console.error('FAIL: restricted group setting should persist across reload, got', JSON.stringify(persistedValue)); process.exitCode = 1; }
  else console.log('OK: restricted group setting persists across a page reload');

  var toggleChecked = await page.locator('.tv-toggle-row input[type=checkbox]').isChecked();
  if (!toggleChecked) { console.error('FAIL: 상차제한 사용 toggle should default to on'); process.exitCode = 1; }
  else console.log('OK: 상차제한 사용 toggle defaults to on');

  // Turning the switch off must suppress restriction WITHOUT clearing the
  // configured group numbers -- TOTE001's group (GRP1) is still in the list.
  await page.locator('.tv-toggle-row').click();
  await page.locator('.tv-activate-btn').click();

  var restrictBadgeVisibleWhenOff = await page.locator('.tv-status-badge-restrict').isVisible();
  if (restrictBadgeVisibleWhenOff) { console.error('FAIL: restriction badge should be hidden once the toggle is switched off'); process.exitCode = 1; }
  else console.log('OK: restriction badge hides once 상차제한 사용 is switched off');

  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  var bannerClassOff = await page.locator('.tv-type-banner').getAttribute('class');
  if (bannerClassOff.indexOf('restricted') !== -1) { console.error('FAIL: banner should NOT be restricted once the toggle is off, got', bannerClassOff); process.exitCode = 1; }
  else console.log('OK: tote is treated as a normal (non-restricted) courier delivery once the toggle is off');

  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR002');
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 5000 });
  await page.waitForSelector('#modalOutboundWaybill.is-open', { timeout: 5000 });
  console.log('OK: waybill modal opens normally for the same tote once restriction is toggled off');

  console.log(process.exitCode ? 'GROUP RESTRICTION SMOKE TEST: SOME FAILURES' : 'GROUP RESTRICTION SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
