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

  var restrictHeaderText = (await page.locator('.tv-status-badge-restrict-header').textContent()).trim();
  if (!(await page.locator('.tv-status-badge-restrict-header').isVisible()) || restrictHeaderText.indexOf('상차제한 활성화 중') === -1) {
    console.error('FAIL: restriction header should read "상차제한 활성화 중", got', restrictHeaderText);
    process.exitCode = 1;
  } else {
    console.log('OK: shared restriction header reads correctly:', restrictHeaderText);
  }

  var headerFontSize = await page.locator('.tv-status-badge-restrict-header').evaluate(function(el){ return getComputedStyle(el).fontSize; });
  var mainFontSize = await page.locator('.tv-status-badge-main').evaluate(function(el){ return getComputedStyle(el).fontSize; });
  if (headerFontSize !== mainFontSize) {
    console.error('FAIL: restriction header should match the "트럭검증 활성화" font size, got', headerFontSize, 'vs', mainFontSize);
    process.exitCode = 1;
  } else {
    console.log('OK: restriction header font size matches the main status line (' + headerFontSize + ')');
  }

  var restrictGroupsText = (await page.locator('.tv-restrict-group-line').textContent()).trim();
  if (restrictGroupsText.indexOf('그룹번호 : ') === -1 || restrictGroupsText.indexOf('99') === -1 || restrictGroupsText.indexOf('GRP1') === -1 || restrictGroupsText.indexOf('88') === -1) {
    console.error('FAIL: group numbers should be shown as "그룹번호 : ..." below the header, got', restrictGroupsText);
    process.exitCode = 1;
  } else {
    console.log('OK: group-number detail line reads correctly:', restrictGroupsText);
  }

  var dateLineVisible = await page.locator('.tv-restrict-date-line').isVisible();
  if (dateLineVisible) { console.error('FAIL: date-restriction detail line should stay hidden when date restriction is not configured'); process.exitCode = 1; }
  else console.log('OK: date-restriction detail line stays hidden when only group restriction is configured');

  var badgeIsOneBox = await page.locator('.tv-status-badge').evaluate(function(el){ return el.querySelector('.tv-status-badge-restrict-header') !== null; });
  if (!badgeIsOneBox) { console.error('FAIL: restriction header should live inside .tv-status-badge, not a separate floating box'); process.exitCode = 1; }
  else console.log('OK: restriction header is nested inside the single status badge, not a separate box');

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

  var groupToggleRow = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="restrictionEnabled"]') });
  var toggleLabel = (await groupToggleRow.locator('span').first().textContent()).trim();
  if (toggleLabel !== '그룹번호 상차제한') { console.error('FAIL: toggle label should read "그룹번호 상차제한", got', toggleLabel); process.exitCode = 1; }
  else console.log('OK: toggle label reads "그룹번호 상차제한"');

  var toggleChecked = await groupToggleRow.locator('input[type=checkbox]').isChecked();
  if (!toggleChecked) { console.error('FAIL: 그룹번호 상차제한 toggle should default to on'); process.exitCode = 1; }
  else console.log('OK: 그룹번호 상차제한 toggle defaults to on');

  var fieldVisibleWhenOn = await page.locator('.tv-group-field-row').isVisible();
  if (!fieldVisibleWhenOn) { console.error('FAIL: group-number input should be visible while the toggle is on'); process.exitCode = 1; }
  else console.log('OK: group-number input field is shown while the toggle is on');

  // Turning the switch off must hide the input field and suppress
  // restriction WITHOUT clearing the configured group numbers underneath --
  // TOTE001's group (GRP1) is still in the (now-hidden) saved list.
  await groupToggleRow.click();

  var fieldVisibleWhenOff = await page.locator('.tv-group-field-row').isVisible();
  if (fieldVisibleWhenOff) { console.error('FAIL: group-number input should be hidden once the toggle is off'); process.exitCode = 1; }
  else console.log('OK: group-number input field hides once the toggle is switched off');

  await page.locator('.tv-activate-btn').click();

  var restrictHeaderVisibleWhenOff = await page.locator('.tv-status-badge-restrict-header').isVisible();
  if (restrictHeaderVisibleWhenOff) { console.error('FAIL: restriction header should be hidden once the toggle is switched off'); process.exitCode = 1; }
  else console.log('OK: restriction header hides once 그룹번호 상차제한 is switched off');

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
