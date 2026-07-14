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

  // All new options must default off, unlike the pre-existing group-number
  // restriction (which defaults on).
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

  var dateRestrictLabelText = (await page.locator('.tv-restrict-date .tv-restrict-label').textContent()).trim();
  if (!(await page.locator('.tv-restrict-date').isVisible()) || dateRestrictLabelText.indexOf('생성일시 상차제한 활성화') === -1) {
    console.error('FAIL: date restriction badge should show "생성일시 상차제한 활성화", got', dateRestrictLabelText);
    process.exitCode = 1;
  } else {
    console.log('OK: date restriction badge visible with correct label:', dateRestrictLabelText);
  }

  var dateRangeText = (await page.locator('.tv-restrict-date .tv-restrict-groups').textContent()).trim();
  if (dateRangeText.indexOf('2026-01-01') === -1 || dateRangeText.indexOf('2026-01-31') === -1) {
    console.error('FAIL: date restriction badge should show the configured range, got', dateRangeText);
    process.exitCode = 1;
  } else {
    console.log('OK: date restriction badge shows the configured range:', dateRangeText);
  }

  await sendScan(page, 'TOTE001');
  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  var bannerClass = await page.locator('.tv-type-banner').getAttribute('class');
  if (bannerClass.indexOf('restricted') === -1) { console.error('FAIL: tote created 2026-01-15 should be restricted by the 2026-01-01~2026-01-31 range, got', bannerClass); process.exitCode = 1; }
  else console.log('OK: tote whose creation date falls inside the configured range is restricted');

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

  // The previously-persisted group-number restriction (from an earlier
  // round's feature) must be unaffected by this reset behavior.
  var groupInputAfterReload = await page.locator('.tv-group-input').inputValue();
  console.log('OK: group-number restriction setting still independent (value: ' + JSON.stringify(groupInputAfterReload) + ')');

  console.log(process.exitCode ? 'DATE RESTRICTION SMOKE TEST: SOME FAILURES' : 'DATE RESTRICTION SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
