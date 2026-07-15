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

function sendEnter(page){
  return page.evaluate(function(){
    var target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
}

(async () => {
  var browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  var page = await browser.newPage();
  page.on('pageerror', function(err){ console.error('PAGE ERROR:', err.message); process.exitCode = 1; });

  await page.goto('http://localhost:8934/fixture.html');
  var src = fs.readFileSync(path.join(__dirname, '../src/bookmarklet.js'), 'utf8').replace(/^javascript:/, '');
  await page.evaluate(src);
  await page.locator('.tv-card').waitFor({ timeout: 3000 });

  var simplifiedToggleRow = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="simplifiedMode"]') });

  var toggleCheckedByDefault = await simplifiedToggleRow.locator('input[type=checkbox]').isChecked();
  if (toggleCheckedByDefault) { console.error('FAIL: 트럭검증 간소화 toggle should default to OFF'); process.exitCode = 1; }
  else console.log('OK: 트럭검증 간소화 toggle defaults to off');

  var toggleLabel = (await simplifiedToggleRow.locator('span').first().textContent()).trim();
  if (toggleLabel !== '트럭검증 간소화') { console.error('FAIL: toggle label should read "트럭검증 간소화", got', toggleLabel); process.exitCode = 1; }
  else console.log('OK: toggle label reads "트럭검증 간소화"');

  // Scenario 1: no associated field-row appears/disappears when toggled,
  // unlike the restriction toggles.
  var fieldRowCountBefore = await page.locator('.tv-field-row').count();
  await simplifiedToggleRow.click();
  var fieldRowCountAfter = await page.locator('.tv-field-row').count();
  if (fieldRowCountAfter !== fieldRowCountBefore) { console.error('FAIL: toggling 트럭검증 간소화 should not show/hide any field-row'); process.exitCode = 1; }
  else console.log('OK: 트럭검증 간소화 toggle has no associated field-row');

  // Scenario 1 (cont'd): resets to off on reload, like every other setting.
  await page.locator('.tv-activate-btn').click();
  await page.reload();
  await page.evaluate(src);
  await page.locator('.tv-card').waitFor({ timeout: 3000 });
  var simplifiedToggleRowReloaded = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="simplifiedMode"]') });
  var toggleCheckedAfterReload = await simplifiedToggleRowReloaded.locator('input[type=checkbox]').isChecked();
  if (toggleCheckedAfterReload) { console.error('FAIL: 트럭검증 간소화 toggle should reset to off after reload'); process.exitCode = 1; }
  else console.log('OK: 트럭검증 간소화 toggle resets to off after reload');

  await simplifiedToggleRowReloaded.click();
  await page.locator('.tv-activate-btn').click();

  var simplifiedHeaderVisible = await page.locator('.tv-status-badge-simplified-header').isVisible();
  var simplifiedHeaderText = (await page.locator('.tv-status-badge-simplified-header').textContent()).trim();
  if (!simplifiedHeaderVisible || simplifiedHeaderText !== '간소화 활성화') {
    console.error('FAIL: status badge should show "간소화 활성화" once simplified mode is on, got visible=', simplifiedHeaderVisible, 'text=', simplifiedHeaderText);
    process.exitCode = 1;
  } else {
    console.log('OK: status badge shows "간소화 활성화" once simplified mode is on');
  }

  var simplifiedHeaderColor = await page.locator('.tv-status-badge-simplified-header').evaluate(function(el){ return getComputedStyle(el).color; });
  var mainHeaderColor = await page.locator('.tv-status-badge-main').evaluate(function(el){ return getComputedStyle(el).color; });
  var simplifiedDotBg = await page.locator('.tv-simplified-status-dot').evaluate(function(el){ return getComputedStyle(el).backgroundColor; });
  if (simplifiedHeaderColor !== mainHeaderColor) {
    console.error('FAIL: "간소화 활성화" text color should match "트럭검증 활성화" (white), got', simplifiedHeaderColor, 'vs', mainHeaderColor);
    process.exitCode = 1;
  } else {
    console.log('OK: "간소화 활성화" text color matches "트럭검증 활성화" (white):', simplifiedHeaderColor);
  }
  if (simplifiedDotBg !== 'rgb(79, 124, 255)') {
    console.error('FAIL: "간소화 활성화" dot should use the blue accent color, got', simplifiedDotBg);
    process.exitCode = 1;
  } else {
    console.log('OK: "간소화 활성화" has a blue dot ahead of the text, matching the "트럭검증 활성화" dot pattern');
  }

  var badgeOrder = await page.locator('.tv-status-badge').evaluate(function(el){
    return Array.prototype.map.call(el.children, function(c){ return c.className; });
  });
  var mainIdx = badgeOrder.findIndex(function(c){ return c.indexOf('tv-status-badge-main') !== -1; });
  var simplifiedIdx = badgeOrder.findIndex(function(c){ return c.indexOf('tv-status-badge-simplified-header') !== -1; });
  var restrictIdx = badgeOrder.findIndex(function(c){ return c.indexOf('tv-status-badge-restrict-header') !== -1; });
  if (!(mainIdx < simplifiedIdx && simplifiedIdx < restrictIdx)) {
    console.error('FAIL: "간소화 활성화" should sit between "트럭검증 활성화" and the 상차제한 header, got order', badgeOrder);
    process.exitCode = 1;
  } else {
    console.log('OK: "간소화 활성화" is positioned between "트럭검증 활성화" and the 상차제한 header');
  }

  // Scenario 2: courier + simplifiedMode -- verify modal skipped, waybill opens directly.
  await sendScan(page, 'TOTE001');
  await page.waitForSelector('#modalOutboundWaybill.is-open', { timeout: 5000 });
  var verifyShownDuringCourier = await page.locator('.tv-verify-overlay').evaluate(function(el){ return el.classList.contains('tv-show'); });
  if (verifyShownDuringCourier) { console.error('FAIL: verify modal should never open in simplified mode'); process.exitCode = 1; }
  else console.log('OK: verify modal skipped entirely for courier tote in simplified mode');

  var noticeText = await page.locator('.tv-simplified-notice').textContent();
  if (noticeText.indexOf('업체A') === -1 || noticeText.indexOf('TOTE001') === -1 || noticeText.indexOf('7') === -1 || noticeText.indexOf('EA') === -1) {
    console.error('FAIL: simplified notice should show vendor/tote/qty, got', noticeText);
    process.exitCode = 1;
  } else {
    console.log('OK: simplified notice shows vendor, tote barcode, and pick quantity');
  }

  if (noticeText.indexOf('스캔토트') !== -1) { console.error('FAIL: simplified notice should not show the 스캔토트 label word, got', noticeText); process.exitCode = 1; }
  else console.log('OK: simplified notice shows the tote barcode value without the 스캔토트 label');

  var noticeClass = await page.locator('.tv-simplified-notice').getAttribute('class');
  if (noticeClass.indexOf('courier') === -1) { console.error('FAIL: notice should show the courier (green) variant, got', noticeClass); process.exitCode = 1; }
  else console.log('OK: notice shows the courier (green) variant for a courier tote');

  var noticeCloseBtnCount = await page.locator('.tv-simplified-notice-close').count();
  if (noticeCloseBtnCount !== 0) { console.error('FAIL: simplified notice should no longer have its own close button, got count', noticeCloseBtnCount); process.exitCode = 1; }
  else console.log('OK: simplified notice has no close button (dismissed only by mode-off or being overwritten)');

  // Close the WMS waybill modal manually so we can reset for the next scenario.
  await page.evaluate(function(){ document.querySelector('#modalOutboundWaybill').classList.remove('is-open'); });
  await page.waitForTimeout(500);

  // Scenario 2b: a tote that already has a waybill (reprint button, not the
  // waybill-generation button) must still update the notice from freshly
  // fetched data in simplified mode, not just skip straight to reprint.
  await sendScan(page, 'TOTE_REPRINT');
  await page.locator('.tv-reprint-area canvas').waitFor({ state: 'visible', timeout: 5000 });
  var reprintNoticeText = await page.locator('.tv-simplified-notice').textContent();
  if (reprintNoticeText.indexOf('업체R') === -1 || reprintNoticeText.indexOf('TOTE_REPRINT') === -1 || reprintNoticeText.indexOf('5') === -1) {
    console.error('FAIL: notice should update with the reprint-ready tote\'s own data, got', reprintNoticeText);
    process.exitCode = 1;
  } else {
    console.log('OK: notice updates with freshly fetched data even for a tote that already has a waybill');
  }

  // Scenario 3: truck + simplifiedMode -- big red blocking modal, dismiss via bare Enter.
  await sendScan(page, 'TOTE002');
  await page.locator('.tv-simplified-overlay.tv-show').waitFor({ timeout: 5000 });
  var blockClass = await page.locator('.tv-simplified-block').getAttribute('class');
  if (blockClass.indexOf('truck') === -1) { console.error('FAIL: blocking modal should have the truck variant class, got', blockClass); process.exitCode = 1; }
  else console.log('OK: blocking modal shows the truck (red) variant');

  var truckNoticeClass = await page.locator('.tv-simplified-notice').getAttribute('class');
  if (truckNoticeClass.indexOf('truck') === -1) { console.error('FAIL: notice should show the truck (red) variant, got', truckNoticeClass); process.exitCode = 1; }
  else console.log('OK: notice shows the truck (red) variant for a truck tote');

  var blockText = await page.locator('.tv-simplified-block').textContent();
  if (blockText.indexOf('해당 토트는 트럭 운송 토트입니다.') === -1) {
    console.error('FAIL: truck modal should show the reference copy, got', blockText);
    process.exitCode = 1;
  } else if (blockText.indexOf('택배 스캔 시 오류가 발생할 수 있습니다.') !== -1) {
    console.error('FAIL: truck modal should no longer show the "택배 스캔 시 오류..." line, got', blockText);
    process.exitCode = 1;
  } else {
    console.log('OK: truck modal shows only the single reference line, no error-warning line');
  }

  var auraColor = await page.locator('.tv-simplified-block').evaluate(function(el){ return getComputedStyle(el).boxShadow; });
  if (auraColor.indexOf('248, 113, 113') === -1) { console.error('FAIL: truck modal aura should use the truck red color, got', auraColor); process.exitCode = 1; }
  else console.log('OK: truck modal aura uses the truck red color');

  var confirmBtnCount = await page.locator('.tv-simplified-confirm').count();
  if (confirmBtnCount !== 0) { console.error('FAIL: blocking modal should have no confirm button'); process.exitCode = 1; }
  else console.log('OK: blocking modal has no confirm button (dismissed only via X/Enter/scan)');

  await sendEnter(page);
  await page.locator('.tv-simplified-overlay.tv-show').waitFor({ state: 'detached', timeout: 3000 }).catch(function(){});
  var overlayHiddenAfterEnter = await page.locator('.tv-simplified-overlay').evaluate(function(el){ return !el.classList.contains('tv-show'); });
  if (!overlayHiddenAfterEnter) { console.error('FAIL: bare Enter should dismiss the blocking modal'); process.exitCode = 1; }
  else console.log('OK: bare Enter dismisses the blocking modal');

  var waybillOpenedAfterTruck = await page.evaluate(function(){ return !!document.querySelector('#modalOutboundWaybill.is-open'); });
  if (waybillOpenedAfterTruck) { console.error('FAIL: waybill modal should not open for a truck tote'); process.exitCode = 1; }
  else console.log('OK: no waybill modal opens for a truck tote');

  // A follow-up scan of the same tote should still work (mode returned to IDLE).
  await sendScan(page, 'TOTE002');
  await page.locator('.tv-simplified-overlay.tv-show').waitFor({ timeout: 5000 });
  console.log('OK: a subsequent scan works again after dismissing the modal');

  // Scenario 6: dismiss via a full barcode scan burst, not just bare Enter --
  // and the scanned content must be discarded (no mismatch modal, no new search).
  await sendScan(page, 'BAR999');
  await page.waitForTimeout(300);
  var overlayHiddenAfterScan = await page.locator('.tv-simplified-overlay').evaluate(function(el){ return !el.classList.contains('tv-show'); });
  if (!overlayHiddenAfterScan) { console.error('FAIL: scanning any barcode should dismiss the blocking modal'); process.exitCode = 1; }
  else console.log('OK: scanning any barcode dismisses the blocking modal');

  var mismatchShown = await page.locator('.tv-mismatch-overlay').evaluate(function(el){ return el.classList.contains('tv-show'); });
  if (mismatchShown) { console.error('FAIL: the discarded scan should not trigger a mismatch modal'); process.exitCode = 1; }
  else console.log('OK: the discarded scan content has no side effect');

  // Scenario 7: dismiss via the X close button.
  await sendScan(page, 'TOTE002');
  await page.locator('.tv-simplified-overlay.tv-show').waitFor({ timeout: 5000 });
  await page.locator('.tv-simplified-close').click();
  var overlayHiddenAfterClose = await page.locator('.tv-simplified-overlay').evaluate(function(el){ return !el.classList.contains('tv-show'); });
  if (!overlayHiddenAfterClose) { console.error('FAIL: X button should dismiss the blocking modal'); process.exitCode = 1; }
  else console.log('OK: X button dismisses the blocking modal');

  // Scenario 4: restricted by group only -- vendor shown, no date line.
  await page.locator('.tv-gear-btn').click();
  var groupToggleRow = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="restrictionEnabled"]') });
  await groupToggleRow.click();
  await page.locator('.tv-group-input').fill('GRP1');
  await page.locator('.tv-activate-btn').click();

  await sendScan(page, 'TOTE001');
  await page.locator('.tv-simplified-overlay.tv-show').waitFor({ timeout: 5000 });
  var groupRestrictClass = await page.locator('.tv-simplified-block').getAttribute('class');
  if (groupRestrictClass.indexOf('restricted') === -1) { console.error('FAIL: modal should show the restricted variant, got', groupRestrictClass); process.exitCode = 1; }
  else console.log('OK: group-restricted tote shows the restricted (orange) variant');

  var restrictedNoticeClass = await page.locator('.tv-simplified-notice').getAttribute('class');
  if (restrictedNoticeClass.indexOf('restricted') === -1) { console.error('FAIL: notice should show the restricted (orange) variant, got', restrictedNoticeClass); process.exitCode = 1; }
  else console.log('OK: notice shows the restricted (orange) variant for a restricted tote');

  var groupRestrictText = await page.locator('.tv-simplified-block').textContent();
  if (groupRestrictText.indexOf('제한업체A') === -1) { console.error('FAIL: restricted modal should show the restricted vendor name, got', groupRestrictText); process.exitCode = 1; }
  else console.log('OK: group-restricted modal shows the restricted vendor name');
  if (groupRestrictText.indexOf('생성일시 :') !== -1) { console.error('FAIL: group-only restriction should not show a 생성일시 line, got', groupRestrictText); process.exitCode = 1; }
  else console.log('OK: group-only restriction omits the 생성일시 line');

  await sendEnter(page);
  await page.waitForTimeout(300);

  // Scenario 5: restricted by date -- vendor AND date shown.
  await page.locator('.tv-gear-btn').click();
  await groupToggleRow.click(); // turn group restriction back off
  var dateToggleRow = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="dateRestrictionEnabled"]') });
  await dateToggleRow.click();
  await page.locator('.tv-date-start-input').fill('2026-01-01');
  await page.locator('.tv-date-end-input').fill('2026-01-31');
  await page.locator('.tv-activate-btn').click();

  await sendScan(page, 'TOTE001');
  await page.locator('.tv-simplified-overlay.tv-show').waitFor({ timeout: 5000 });
  var dateRestrictText = await page.locator('.tv-simplified-block').textContent();
  if (dateRestrictText.indexOf('제한업체A') === -1 || dateRestrictText.indexOf('생성일시 : 2026-01-15') === -1) {
    console.error('FAIL: date-restricted modal should show vendor AND creation date, got', dateRestrictText);
    process.exitCode = 1;
  } else {
    console.log('OK: date-restricted modal shows both vendor name and creation date');
  }

  await sendEnter(page);
  await page.waitForTimeout(300);

  // Turn simplified mode + restrictions back off for the regression check.
  await page.locator('.tv-gear-btn').click();
  await dateToggleRow.click();
  var simplifiedToggleRow2 = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="simplifiedMode"]') });
  await simplifiedToggleRow2.click();
  await page.locator('.tv-activate-btn').click();

  var simplifiedHeaderVisibleAfterOff = await page.locator('.tv-status-badge-simplified-header').isVisible();
  if (simplifiedHeaderVisibleAfterOff) { console.error('FAIL: "간소화 활성화" should hide once simplified mode is turned off'); process.exitCode = 1; }
  else console.log('OK: "간소화 활성화" hides once simplified mode is turned off');

  // Scenario 8 (regression guard): with simplifiedMode off, the full verify flow runs unchanged.
  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR002');
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 5000 });
  await page.waitForSelector('#modalOutboundWaybill.is-open', { timeout: 5000 });
  console.log('OK: with simplified mode off, the full verify-modal flow still runs unchanged');

  console.log(process.exitCode ? 'SIMPLIFIED MODE SMOKE TEST: SOME FAILURES' : 'SIMPLIFIED MODE SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
