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

  var groupToggleRow = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="restrictionEnabled"]') });

  var toggleCheckedByDefault = await groupToggleRow.locator('input[type=checkbox]').isChecked();
  if (toggleCheckedByDefault) { console.error('FAIL: 그룹번호 상차제한 toggle should default to OFF'); process.exitCode = 1; }
  else console.log('OK: 그룹번호 상차제한 toggle defaults to off');

  var fieldHiddenByDefault = await page.locator('.tv-group-field-row').isVisible();
  if (fieldHiddenByDefault) { console.error('FAIL: group-number input should be hidden by default'); process.exitCode = 1; }
  else console.log('OK: group-number input hidden by default');

  var firstRunBtnText = (await page.locator('.tv-activate-btn').textContent()).trim();
  if (firstRunBtnText !== '활성화') { console.error('FAIL: settings button should read "활성화" before first activation, got', firstRunBtnText); process.exitCode = 1; }
  else console.log('OK: settings button reads "활성화" before first activation');

  var toggleLabel = (await groupToggleRow.locator('span').first().textContent()).trim();
  if (toggleLabel !== '그룹번호 상차제한') { console.error('FAIL: toggle label should read "그룹번호 상차제한", got', toggleLabel); process.exitCode = 1; }
  else console.log('OK: toggle label reads "그룹번호 상차제한"');

  await groupToggleRow.click();
  var fieldVisibleWhenOn = await page.locator('.tv-group-field-row').isVisible();
  if (!fieldVisibleWhenOn) { console.error('FAIL: group-number input should appear right below its own switch when turned on'); process.exitCode = 1; }
  else console.log('OK: group-number input appears directly below its switch when turned on');

  var fieldLabelText = (await page.locator('.tv-group-field-row .tv-field-label').textContent()).trim();
  if (fieldLabelText !== '그룹번호') { console.error('FAIL: field label under the switch should read "그룹번호", got', fieldLabelText); process.exitCode = 1; }
  else console.log('OK: field label under the switch reads "그룹번호"');

  // TOTE001's detail page (fetched via the first row's 3rd-td link) carries
  // group number "GRP1" (1st table, 1st td) and restriction vendor name
  // "제한업체A" (2nd table, 1st td) -- distinct from info.vendor ("업체A")
  // so a test that accidentally reused the wrong field would fail here.
  await page.locator('.tv-group-input').fill('99, GRP1 ,88');
  await page.locator('.tv-activate-btn').click();

  var restrictHeaderText = (await page.locator('.tv-status-badge-restrict-header').textContent()).trim();
  if (!(await page.locator('.tv-status-badge-restrict-header').isVisible()) || restrictHeaderText.indexOf('상차제한 활성화') === -1) {
    console.error('FAIL: restriction header should read "상차제한 활성화", got', restrictHeaderText);
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

  var bannerClass = await page.locator('.tv-verify-type-hero').getAttribute('class');
  if (bannerClass.indexOf('restricted') === -1) { console.error('FAIL: banner should have the "restricted" class, got', bannerClass); process.exitCode = 1; }
  else console.log('OK: type banner switches to the restricted (orange) variant');

  var bannerText = await page.locator('.tv-verify-type-hero').textContent();
  if (bannerText.indexOf('상차제한') === -1) {
    console.error('FAIL: banner should show the restriction phrase, got', bannerText);
    process.exitCode = 1;
  } else {
    console.log('OK: banner shows restriction phrase:', bannerText.trim());
  }

  var tileBg = await page.locator('.tv-verify-type-hero').evaluate(function(el){ return getComputedStyle(el).backgroundImage; });
  if (tileBg.indexOf('251, 146, 60') === -1) { console.error('FAIL: delivery-type tile should use the restricted orange gradient, got', tileBg); process.exitCode = 1; }
  else console.log('OK: delivery-type tile uses the orange restricted gradient');

  // The tile is a generic "상차제한" indicator now -- it must not disclose
  // whether it's a group-number or date restriction (that detail lives
  // only in the top-right status badge), and must not repeat the vendor
  // name (already shown on the separate 업체명 stat tile).
  var typeValueText = (await page.locator('.tv-verify-type-hero-title').textContent()).trim();
  if (typeValueText !== '상차제한') { console.error('FAIL: delivery-type value should read exactly "상차제한" with no group/date/vendor specifics, got', typeValueText); process.exitCode = 1; }
  else console.log('OK: delivery-type value is the generic "상차제한" label:', typeValueText);

  var typeValueFontSize = await page.locator('.tv-verify-type-hero-title').evaluate(function(el){ return getComputedStyle(el).fontSize; });
  if (typeValueFontSize !== '25px') { console.error('FAIL: delivery-type hero title font-size should be 25px (same size for all three variants), got', typeValueFontSize); process.exitCode = 1; }
  else console.log('OK: restricted delivery-type hero title font-size is 25px, same as truck/courier');

  var typeValueFontWeight = await page.locator('.tv-verify-type-hero-title').evaluate(function(el){ return getComputedStyle(el).fontWeight; });
  if (typeValueFontWeight !== '500') { console.error('FAIL: delivery-type hero title font-weight should be 500, got', typeValueFontWeight); process.exitCode = 1; }
  else console.log('OK: delivery-type hero title font-weight is 500');

  var restrictedSubText = (await page.locator('.tv-verify-type-hero-sub').textContent()).trim();
  if (restrictedSubText !== '해당 토트는 상차 제한 토트입니다.') { console.error('FAIL: restricted type-hero subtitle should read "해당 토트는 상차 제한 토트입니다.", got', restrictedSubText); process.exitCode = 1; }
  else console.log('OK: restricted type-hero subtitle reads correctly:', restrictedSubText);

  var cardBorder = await page.locator('.tv-verify').evaluate(function(el){ return getComputedStyle(el).boxShadow; });
  if (cardBorder.indexOf('251, 146, 60') === -1) { console.error('FAIL: verify card border should use the restricted orange color, got', cardBorder); process.exitCode = 1; }
  else console.log('OK: verify card border uses the orange restricted color');

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

  // Every option -- including group-number restriction now -- resets to its
  // default (off/empty) on reload, matching "enabled".
  await page.reload();
  await page.evaluate(src);
  await page.locator('.tv-card').waitFor({ timeout: 3000 });

  var groupToggleRow2 = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="restrictionEnabled"]') });
  var toggleCheckedAfterReload = await groupToggleRow2.locator('input[type=checkbox]').isChecked();
  if (toggleCheckedAfterReload) { console.error('FAIL: 그룹번호 상차제한 toggle should reset to off after reload'); process.exitCode = 1; }
  else console.log('OK: 그룹번호 상차제한 toggle resets to off after reload');

  var btnTextAfterReload = (await page.locator('.tv-activate-btn').textContent()).trim();
  if (btnTextAfterReload !== '활성화') { console.error('FAIL: settings button should read "활성화" again after reload, got', btnTextAfterReload); process.exitCode = 1; }
  else console.log('OK: settings button reads "활성화" again after reload');

  await groupToggleRow2.click();
  var groupInputAfterReload = await page.locator('.tv-group-input').inputValue();
  if (groupInputAfterReload !== '') { console.error('FAIL: group-number input should reset to empty after reload, got', JSON.stringify(groupInputAfterReload)); process.exitCode = 1; }
  else console.log('OK: group-number input resets to empty after reload');

  // Re-configure and activate, then reopen settings via the gear button --
  // the button must now read "저장" since we're already active.
  await page.locator('.tv-group-input').fill('99, GRP1 ,88');
  await page.locator('.tv-activate-btn').click();
  await page.locator('.tv-gear-btn').click();
  var reopenedBtnText = (await page.locator('.tv-activate-btn').textContent()).trim();
  if (reopenedBtnText !== '저장') { console.error('FAIL: settings button should read "저장" once already active, got', reopenedBtnText); process.exitCode = 1; }
  else console.log('OK: settings button reads "저장" once already active');

  // Turning the switch off must hide the input field and suppress
  // restriction WITHOUT clearing the configured group numbers underneath --
  // TOTE001's group (GRP1) is still in the (now-hidden) saved list.
  var groupToggleRow3 = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="restrictionEnabled"]') });
  await groupToggleRow3.click();

  var fieldVisibleWhenOff = await page.locator('.tv-group-field-row').isVisible();
  if (fieldVisibleWhenOff) { console.error('FAIL: group-number input should be hidden once the toggle is off'); process.exitCode = 1; }
  else console.log('OK: group-number input field hides once the toggle is switched off');

  await page.locator('.tv-activate-btn').click();

  var restrictHeaderVisibleWhenOff = await page.locator('.tv-status-badge-restrict-header').isVisible();
  if (restrictHeaderVisibleWhenOff) { console.error('FAIL: restriction header should be hidden once the toggle is switched off'); process.exitCode = 1; }
  else console.log('OK: restriction header hides once 그룹번호 상차제한 is switched off');

  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  var bannerClassOff = await page.locator('.tv-verify-type-hero').getAttribute('class');
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
