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

  var src = fs.readFileSync(path.join(__dirname, '../src/bookmarklet.js'), 'utf8');
  var body = src.replace(/^javascript:/, '');
  await page.evaluate(body);

  // Locators pierce open shadow roots automatically.
  await page.locator('.tv-card').waitFor({ timeout: 3000 });
  console.log('OK: settings modal appeared');

  await page.locator('.tv-activate-btn').click();
  console.log('OK: activate clicked');

  await sendScan(page, 'TOTE001');

  var dateCheck = await page.evaluate(function(){
    function fmt(d){ var y = d.getFullYear(); var m = String(d.getMonth() + 1).padStart(2, '0'); var day = String(d.getDate()).padStart(2, '0'); return y + '-' + m + '-' + day; }
    var end = new Date();
    var start = new Date();
    start.setDate(start.getDate() - 7);
    return {
      expectedStart: fmt(start),
      expectedEnd: fmt(end),
      attrStart: document.querySelector('#date-range-input').getAttribute('startdate'),
      attrEnd: document.querySelector('#date-range-input').getAttribute('enddate'),
      hiddenInputValue: document.querySelector('[data-hidden] input[shadow-input]').value
    };
  });
  if (dateCheck.attrStart !== dateCheck.expectedStart || dateCheck.attrEnd !== dateCheck.expectedEnd) {
    console.error('FAIL: startdate/enddate attributes not set correctly', dateCheck);
    process.exitCode = 1;
  } else {
    console.log('OK: startdate/enddate attributes set correctly:', dateCheck.attrStart, '~', dateCheck.attrEnd);
  }
  if (dateCheck.hiddenInputValue !== '') {
    console.error('FAIL: hidden proxy input should NOT be touched, got', dateCheck.hiddenInputValue);
    process.exitCode = 1;
  } else {
    console.log('OK: hidden proxy input left untouched (no longer corrupted)');
  }

  await page.locator('.tv-verify').filter({ hasText: '업체A' }).waitFor({ timeout: 5000 });
  console.log('OK: verify modal shows vendor 업체A');

  var badgeText = await page.locator('.tv-verify-type-hero').textContent();
  if (badgeText.indexOf('택배') === -1 || badgeText.indexOf('상품 정보를 확인하고 스캔해주세요') === -1) {
    console.error('FAIL: expected courier type hero with title + subtitle, got', badgeText);
    process.exitCode = 1;
  } else {
    console.log('OK: courier type hero banner shown with title + subtitle:', badgeText.trim());
  }

  var toteText = await page.locator('.tv-verify').textContent();
  if (toteText.indexOf('TOTE001') === -1 || toteText.indexOf('7') === -1) { console.error('FAIL: tote info missing'); process.exitCode = 1; }
  else console.log('OK: tote barcode + qty shown');

  var qtyTileText = (await page.locator('.tv-stat-tile').filter({ hasText: '전체 집품수량' }).textContent()).trim();
  if (qtyTileText.indexOf('7') === -1) { console.error('FAIL: 전체 집품수량 stat tile should show the total qty, got', qtyTileText); process.exitCode = 1; }
  else console.log('OK: 전체 집품수량 stat tile shows the total qty:', qtyTileText);

  // Every pictographic icon in the verify modal (type-hero banner icon,
  // vendor/tote/qty stat tile icons, close button) is now a hand-drawn
  // inline SVG, not an emoji glyph -- lock that in.
  var verifyIconSelectors = ['.tv-verify-header-icon svg', '.tv-verify-type-hero-icon svg', '.tv-stat-icon.vendor svg', '.tv-stat-icon.tote svg', '.tv-stat-icon.qty svg', '.tv-verify-close svg'];
  var allVerifyIconsSvg = true;
  for (var vi = 0; vi < verifyIconSelectors.length; vi++) {
    var count = await page.locator(verifyIconSelectors[vi]).count();
    if (count !== 1) { console.error('FAIL: expected exactly one <svg> for', verifyIconSelectors[vi], 'got', count); allVerifyIconsSvg = false; process.exitCode = 1; }
  }
  if (allVerifyIconsSvg) console.log('OK: verify modal type-hero + stat-tile + close icons are all hand-drawn SVG, not emoji');

  var barcodeTexts = await page.locator('.tv-product-barcode').allTextContents();
  if (barcodeTexts.indexOf('BAR001') === -1 || barcodeTexts.indexOf('BAR002') === -1) {
    console.error('FAIL: product barcode values not shown in verify modal', barcodeTexts);
    process.exitCode = 1;
  } else {
    console.log('OK: product barcode values shown:', barcodeTexts.join(', '));
  }

  var nameColor = await page.locator('.tv-product-name').first().evaluate(function(el){ return getComputedStyle(el).color; });
  var barcodeColor = await page.locator('.tv-product-barcode').first().evaluate(function(el){ return getComputedStyle(el).color; });
  if (nameColor === barcodeColor) {
    console.error('FAIL: product name and barcode should use different text colors so they are visually distinguishable, both got', nameColor);
    process.exitCode = 1;
  } else {
    console.log('OK: product name and barcode use different text colors:', nameColor, 'vs', barcodeColor);
  }

  var verifyBg = await page.locator('.tv-verify-overlay').evaluate(function(el){ return getComputedStyle(el).backgroundColor; });
  if (verifyBg === 'rgba(0, 0, 0, 0)' || verifyBg === 'transparent') {
    console.error('FAIL: verify overlay should now have a dim backdrop tint, got', verifyBg);
    process.exitCode = 1;
  } else {
    console.log('OK: verify overlay has a dim backdrop tint to focus attention on the modal');
  }

  var badgeVisible = await page.locator('.tv-status-badge').isVisible();
  if (!badgeVisible) { console.error('FAIL: active status badge should be visible after activation'); process.exitCode = 1; }
  else console.log('OK: top-right active status badge visible');

  // Before any product barcode is scanned, the stepper's 1st step (준비)
  // should be the active one -- not already "done" -- since nothing has
  // actually been verified yet.
  var stepClassesBefore = await page.locator('.tv-stepper-dot').evaluateAll(function(els){ return els.map(function(e){ return e.className; }); });
  if (stepClassesBefore[0].indexOf('active') === -1 || stepClassesBefore[0].indexOf('done') !== -1) {
    console.error('FAIL: stepper step 1 (준비) should be "active" (not "done") before any scan, got', stepClassesBefore);
    process.exitCode = 1;
  } else {
    console.log('OK: stepper starts with step 1 (준비) active, not done:', stepClassesBefore);
  }

  await sendScan(page, 'BAR001');

  // Hero counter tracks scanned *units* against total required units (BAR001
  // needs 2 + BAR002 needs 1 = 3 total), not "product types done" -- after
  // one of BAR001's two units, it should read 1/3, not 0/2. It now lives in
  // the stepper's 검증 중 label, not a separate header element.
  var heroAfterOne = (await page.locator('.tv-stepper-label').nth(1).textContent()).trim();
  if (heroAfterOne !== '검증 중 (1/3)') { console.error('FAIL: 검증 중 stepper label should read "검증 중 (1/3)" after scanning 1 of 3 total required units, got', heroAfterOne); process.exitCode = 1; }
  else console.log('OK: 검증 중 stepper label tracks scanned units against total required units:', heroAfterOne);

  var heroTitleGone = await page.locator('.tv-hero-title').count();
  if (heroTitleGone !== 0) { console.error('FAIL: .tv-hero-title should no longer exist in the header'); process.exitCode = 1; }
  else console.log('OK: the separate header counter element is gone');

  var pillHasSvg = await page.locator('.tv-scan-status-pill svg').count();
  var pillText = (await page.locator('.tv-scan-status-pill').textContent()).trim();
  if (pillHasSvg !== 1 || pillText.indexOf('정상') === -1) { console.error('FAIL: scan status pill should show a check-mark SVG plus "정상", got svg count', pillHasSvg, 'text', pillText); process.exitCode = 1; }
  else console.log('OK: scan status pill shows a hand-drawn checkmark SVG instead of a text glyph');

  // Scanning even one product barcode should move the stepper to step 2
  // (검증 중): step 1 becomes done, step 2 becomes active.
  var stepClassesAfter = await page.locator('.tv-stepper-dot').evaluateAll(function(els){ return els.map(function(e){ return e.className; }); });
  if (stepClassesAfter[0].indexOf('done') === -1 || stepClassesAfter[1].indexOf('active') === -1) {
    console.error('FAIL: stepper should advance to step 2 (검증 중) after the first scan, got', stepClassesAfter);
    process.exitCode = 1;
  } else {
    console.log('OK: stepper advances to step 2 (검증 중) after the first scan:', stepClassesAfter);
  }

  await sendScan(page, 'BAR001');
  var afterFirstTwo = await page.locator('.tv-product-row').first().textContent();
  console.log('DEBUG product row after 2x BAR001 scan:', afterFirstTwo.trim());

  var doneRowIconCount = await page.locator('.tv-product-row.done .tv-product-status svg').count();
  if (doneRowIconCount !== 1) { console.error('FAIL: a fully-scanned product row should show a checkmark SVG, got count', doneRowIconCount); process.exitCode = 1; }
  else console.log('OK: fully-scanned product row shows a hand-drawn checkmark SVG instead of a text glyph');

  await sendScan(page, 'BAR002');

  await page.locator('.tv-verify-overlay').waitFor({ state: 'hidden', timeout: 5000 });
  console.log('OK: verify modal auto-closed after full scan');

  await page.waitForSelector('#modalOutboundWaybill.is-open', { timeout: 5000 });
  console.log('OK: WMS waybill modal (#modalOutboundWaybill gains "is-open" class) opened automatically (courier flow)');

  await page.locator('.tv-status-badge-waybill canvas').waitFor({ state: 'visible', timeout: 5000 });
  console.log('OK: virtual waybill barcode rendered inside the status badge and visible while the WMS waybill modal is open');

  var waybillLabelStyle = await page.locator('.tv-status-badge-waybill-label').evaluate(function(el){ return { justifyContent: getComputedStyle(el).justifyContent, iconCount: el.querySelectorAll('svg').length }; });
  if (waybillLabelStyle.justifyContent !== 'center' || waybillLabelStyle.iconCount !== 1) {
    console.error('FAIL: 운송장생성 label should be center-aligned with one hand-drawn icon, got', waybillLabelStyle);
    process.exitCode = 1;
  } else {
    console.log('OK: 운송장생성 label is center-aligned and uses a hand-drawn SVG icon instead of an emoji');
  }

  var boxInputVal = await page.locator('#waybill-modal-barcode-input').inputValue();
  if (boxInputVal !== '') { console.error('FAIL: box input should remain untouched, got', boxInputVal); process.exitCode = 1; }
  else console.log('OK: waybill box input untouched by our script');

  await sendScan(page, 'TVCW');

  await page.waitForFunction(function(){ return !document.querySelector('#modalOutboundWaybill.is-open'); }, null, { timeout: 5000 });
  console.log('OK: waybill modal closed (is-open class removed) after virtual barcode scan (submit clicked)');

  await page.locator('.tv-reprint-area canvas').waitFor({ state: 'visible', timeout: 5000 });
  console.log('OK: reprint virtual barcode shown top-left after re-search (proves the post-waybill re-search completed)');

  var reprintLabelIconCount = await page.locator('.tv-float-label svg').count();
  if (reprintLabelIconCount !== 1) { console.error('FAIL: reprint label should use a hand-drawn printer SVG icon, got count', reprintLabelIconCount); process.exitCode = 1; }
  else console.log('OK: reprint label uses a hand-drawn printer SVG icon instead of an emoji');

  await sendScan(page, 'TVCR');

  await page.waitForSelector('#modalWaybillPrintList', { timeout: 5000, state: 'attached' }).catch(function(){});
  await page.waitForFunction(function(){ return !document.querySelector('#modalWaybillPrintList'); }, null, { timeout: 5000 });
  console.log('OK: reprint modal opened and auto-completed (waybill-print-all clicked)');

  console.log(process.exitCode ? 'SMOKE TEST: SOME FAILURES' : 'SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
