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

  var dateToggleRow = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="dateRestrictionEnabled"]') });

  // Every option (including group-number restriction) defaults off.
  var dateToggleChecked = await dateToggleRow.locator('input[type=checkbox]').isChecked();
  if (dateToggleChecked) { console.error('FAIL: 생성일시 상차제한 toggle should default to OFF'); process.exitCode = 1; }
  else console.log('OK: 생성일시 상차제한 toggle defaults to off');

  var dateFieldVisibleByDefault = await page.locator('.tv-date-field-row').isVisible();
  if (dateFieldVisibleByDefault) { console.error('FAIL: date-range picker should be hidden until the switch is on'); process.exitCode = 1; }
  else console.log('OK: date-range picker hidden by default');

  await dateToggleRow.click();
  var dateFieldVisibleAfterOn = await page.locator('.tv-date-field-row').isVisible();
  if (!dateFieldVisibleAfterOn) { console.error('FAIL: date-range picker should appear once the switch is turned on'); process.exitCode = 1; }
  else console.log('OK: date-range picker (calendar inputs) appears once the switch is turned on');

  var startInputType = await page.locator('.tv-date-start-input').getAttribute('type');
  var endInputType = await page.locator('.tv-date-end-input').getAttribute('type');
  if (startInputType !== 'date' || endInputType !== 'date') {
    console.error('FAIL: date-range inputs should be native <input type="date"> (browser calendar picker), got', startInputType, endInputType);
    process.exitCode = 1;
  } else {
    console.log('OK: date-range inputs are native calendar (type=date) inputs');
  }

  // TOTE001's creation date is 2026-01-15 (1st table, 6th td of the doc
  // linked from the first row's 3rd td). A range that contains it must
  // restrict the tote.
  await page.locator('.tv-date-start-input').fill('2026-01-01');
  await page.locator('.tv-date-end-input').fill('2026-01-31');
  await page.locator('.tv-activate-btn').click();

  var restrictHeaderVisible = await page.locator('.tv-status-badge-restrict-header').isVisible();
  var restrictHeaderText = (await page.locator('.tv-status-badge-restrict-header').textContent()).trim();
  if (!restrictHeaderVisible || restrictHeaderText.indexOf('상차제한 활성화 중') === -1) {
    console.error('FAIL: shared restriction header should show "상차제한 활성화 중" once date restriction is active, got', restrictHeaderText);
    process.exitCode = 1;
  } else {
    console.log('OK: shared restriction header visible once date restriction is active:', restrictHeaderText);
  }

  var groupLineVisible = await page.locator('.tv-restrict-group-line').isVisible();
  if (groupLineVisible) { console.error('FAIL: group-restriction detail line should stay hidden when only date restriction is configured'); process.exitCode = 1; }
  else console.log('OK: group-restriction detail line stays hidden when only date restriction is configured');

  var dateRangeText = (await page.locator('.tv-restrict-date-line').textContent()).trim();
  if (dateRangeText.indexOf('생성일시 : ') === -1 || dateRangeText.indexOf('2026-01-01') === -1 || dateRangeText.indexOf('2026-01-31') === -1) {
    console.error('FAIL: date detail line should read "생성일시 : ..." with the configured range, got', dateRangeText);
    process.exitCode = 1;
  } else {
    console.log('OK: date detail line reads correctly:', dateRangeText);
  }

  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  var bannerClass = await page.locator('.tv-type-banner').getAttribute('class');
  if (bannerClass.indexOf('restricted') === -1) { console.error('FAIL: tote created 2026-01-15 should be restricted by the 2026-01-01~2026-01-31 range, got', bannerClass); process.exitCode = 1; }
  else console.log('OK: tote whose creation date falls inside the configured range is restricted');

  // The tile is a generic "상차제한" indicator -- it must not disclose
  // whether it's a group-number or date restriction (that detail lives
  // only in the top-right status badge).
  var dateTypeValueText = (await page.locator('.tv-type-value').textContent()).trim();
  if (dateTypeValueText !== '상차제한') { console.error('FAIL: delivery-type value should read exactly "상차제한" with no date specifics, got', dateTypeValueText); process.exitCode = 1; }
  else console.log('OK: delivery-type value is the generic "상차제한" label:', dateTypeValueText);

  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR001');
  await sendScan(page, 'BAR002');
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 5000 });
  await page.waitForTimeout(1500);
  var waybillOpened = await page.evaluate(function(){ return !!document.querySelector('#modalOutboundWaybill.is-open'); });
  if (waybillOpened) { console.error('FAIL: waybill modal should NOT open for a date-restricted courier tote'); process.exitCode = 1; }
  else console.log('OK: waybill modal correctly skipped for a date-restricted tote');

  // TOTE002's creation date is 2026-02-20, outside the configured range --
  // must NOT be restricted.
  await sendScan(page, 'TOTE002');
  await page.locator('.tv-verify').filter({ hasText: '업체B' }).waitFor({ timeout: 5000 });
  var bannerClassOutside = await page.locator('.tv-type-banner').getAttribute('class');
  if (bannerClassOutside.indexOf('restricted') !== -1) { console.error('FAIL: tote created 2026-02-20 should NOT be restricted by the 2026-01-01~2026-01-31 range, got', bannerClassOutside); process.exitCode = 1; }
  else console.log('OK: tote whose creation date falls outside the configured range is not restricted');

  await page.locator('.tv-verify-close').click();
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 3000 });

  // Open-ended ranges: a start date alone restricts that date and
  // everything after it; an end date alone restricts that date and
  // everything before it. Badge shows a trailing/leading "~" with no
  // spaces in these cases (unlike the spaced "start ~ end" closed form).
  await page.locator('.tv-gear-btn').click();
  await page.locator('.tv-date-end-input').fill('');
  await page.locator('.tv-date-start-input').fill('2026-02-01');
  await page.locator('.tv-activate-btn').click();

  var startOnlyBadgeText = (await page.locator('.tv-restrict-date-line').textContent()).trim();
  if (startOnlyBadgeText !== '생성일시 : 2026-02-01~') {
    console.error('FAIL: start-only badge should read "생성일시 : 2026-02-01~", got', startOnlyBadgeText);
    process.exitCode = 1;
  } else {
    console.log('OK: start-only badge shows open-ended trailing-tilde format:', startOnlyBadgeText);
  }

  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  var bannerTote001StartOnly = await page.locator('.tv-type-banner').getAttribute('class');
  if (bannerTote001StartOnly.indexOf('restricted') !== -1) { console.error('FAIL: TOTE001 (2026-01-15) should NOT be restricted by a start-only range beginning 2026-02-01, got', bannerTote001StartOnly); process.exitCode = 1; }
  else console.log('OK: tote before a start-only date is not restricted');
  await page.locator('.tv-verify-close').click();
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 3000 });

  await sendScan(page, 'TOTE002');
  await page.locator('.tv-verify').filter({ hasText: '업체B' }).waitFor({ timeout: 5000 });
  var bannerTote002StartOnly = await page.locator('.tv-type-banner').getAttribute('class');
  if (bannerTote002StartOnly.indexOf('restricted') === -1) { console.error('FAIL: TOTE002 (2026-02-20) should be restricted by a start-only range beginning 2026-02-01, got', bannerTote002StartOnly); process.exitCode = 1; }
  else console.log('OK: tote on/after a start-only date is restricted (open-ended forward)');
  await page.locator('.tv-verify-close').click();
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 3000 });

  await page.locator('.tv-gear-btn').click();
  await page.locator('.tv-date-start-input').fill('');
  await page.locator('.tv-date-end-input').fill('2026-02-01');
  await page.locator('.tv-activate-btn').click();

  var endOnlyBadgeText = (await page.locator('.tv-restrict-date-line').textContent()).trim();
  if (endOnlyBadgeText !== '생성일시 : ~2026-02-01') {
    console.error('FAIL: end-only badge should read "생성일시 : ~2026-02-01", got', endOnlyBadgeText);
    process.exitCode = 1;
  } else {
    console.log('OK: end-only badge shows open-ended leading-tilde format:', endOnlyBadgeText);
  }

  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  var bannerTote001EndOnly = await page.locator('.tv-type-banner').getAttribute('class');
  if (bannerTote001EndOnly.indexOf('restricted') === -1) { console.error('FAIL: TOTE001 (2026-01-15) should be restricted by an end-only range ending 2026-02-01, got', bannerTote001EndOnly); process.exitCode = 1; }
  else console.log('OK: tote on/before an end-only date is restricted (open-ended backward)');
  await page.locator('.tv-verify-close').click();
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 3000 });

  await sendScan(page, 'TOTE002');
  await page.locator('.tv-verify').filter({ hasText: '업체B' }).waitFor({ timeout: 5000 });
  var bannerTote002EndOnly = await page.locator('.tv-type-banner').getAttribute('class');
  if (bannerTote002EndOnly.indexOf('restricted') !== -1) { console.error('FAIL: TOTE002 (2026-02-20) should NOT be restricted by an end-only range ending 2026-02-01, got', bannerTote002EndOnly); process.exitCode = 1; }
  else console.log('OK: tote after an end-only date is not restricted');
  await page.locator('.tv-verify-close').click();
  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 3000 });

  // Restore a closed range before continuing.
  await page.locator('.tv-gear-btn').click();
  await page.locator('.tv-date-start-input').fill('2026-01-01');
  await page.locator('.tv-date-end-input').fill('2026-01-31');
  await page.locator('.tv-activate-btn').click();

  // With BOTH restrictions configured, both detail lines must show at once
  // under the same shared header.
  await page.locator('.tv-gear-btn').click();
  var groupToggleRowBoth = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="restrictionEnabled"]') });
  await groupToggleRowBoth.click();
  await page.locator('.tv-group-input').fill('GRP1');
  await page.locator('.tv-activate-btn').click();

  var bothGroupLineVisible = await page.locator('.tv-restrict-group-line').isVisible();
  var bothDateLineVisible = await page.locator('.tv-restrict-date-line').isVisible();
  if (!bothGroupLineVisible || !bothDateLineVisible) {
    console.error('FAIL: with both restrictions configured, both detail lines should be visible', bothGroupLineVisible, bothDateLineVisible);
    process.exitCode = 1;
  } else {
    console.log('OK: both detail lines shown at once when group and date restriction are both configured');
  }

  var headerCountWhenBoth = await page.locator('.tv-status-badge-restrict-header').count();
  if (headerCountWhenBoth !== 1) { console.error('FAIL: there should still be exactly one shared header, got count', headerCountWhenBoth); process.exitCode = 1; }
  else console.log('OK: exactly one shared "상차제한 활성화 중" header, not duplicated per restriction type');

  // Reload -- unlike restrictedGroups, the date-restriction switch and its
  // input values must NOT survive a reload (always reset to off/empty).
  await page.reload();
  await page.evaluate(src);
  await page.locator('.tv-card').waitFor({ timeout: 3000 });

  var dateToggleRow2 = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="dateRestrictionEnabled"]') });
  var toggleCheckedAfterReload = await dateToggleRow2.locator('input[type=checkbox]').isChecked();
  if (toggleCheckedAfterReload) { console.error('FAIL: 생성일시 상차제한 toggle should reset to off after reload'); process.exitCode = 1; }
  else console.log('OK: 생성일시 상차제한 toggle resets to off after reload');

  await dateToggleRow2.click();
  var startValueAfterReload = await page.locator('.tv-date-start-input').inputValue();
  var endValueAfterReload = await page.locator('.tv-date-end-input').inputValue();
  if (startValueAfterReload !== '' || endValueAfterReload !== '') {
    console.error('FAIL: date-range input values should reset to empty after reload, got', JSON.stringify(startValueAfterReload), JSON.stringify(endValueAfterReload));
    process.exitCode = 1;
  } else {
    console.log('OK: date-range input values reset to empty after reload');
  }

  // Group-number restriction now resets on reload too, same as date
  // restriction -- no setting persists across a reload anymore.
  var groupInputAfterReload = await page.locator('.tv-group-input').inputValue();
  if (groupInputAfterReload !== '') { console.error('FAIL: group-number input should also reset to empty after reload, got', JSON.stringify(groupInputAfterReload)); process.exitCode = 1; }
  else console.log('OK: group-number input also resets to empty after reload');

  console.log(process.exitCode ? 'DATE RESTRICTION SMOKE TEST: SOME FAILURES' : 'DATE RESTRICTION SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
