var { chromium } = require('playwright');
var fs = require('fs');
var path = require('path');
require('./server.js');

(async () => {
  var browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  var page = await browser.newPage();
  page.on('pageerror', function(err){ console.error('PAGE ERROR:', err.message); process.exitCode = 1; });

  await page.goto('http://localhost:8934/fixture.html');
  var src = fs.readFileSync(path.join(__dirname, '../src/bookmarklet.js'), 'utf8').replace(/^javascript:/, '');
  await page.evaluate(src);
  await page.locator('.tv-card').waitFor({ timeout: 3000 });

  var titleIconCount = await page.locator('.tv-settings-title-icon svg').count();
  var titleText = (await page.locator('.tv-settings-title').textContent()).trim();
  if (titleIconCount !== 1 || titleText !== 'INC14 Return') {
    console.error('FAIL: settings title should have a rocket icon and read "INC14 Return", got iconCount=', titleIconCount, 'text=', titleText);
    process.exitCode = 1;
  } else {
    console.log('OK: settings title has a rocket icon ahead of "INC14 Return"');
  }

  // The icon sits only left of the text -- a plain flex row centered as one
  // block would shift the text right of the card's true center by about
  // half the icon's width. Measure the actual text run, not just a CSS
  // property, so this catches that regression.
  var centering = await page.locator('.tv-settings-title').evaluate(function(el){
    var textNode = Array.prototype.filter.call(el.childNodes, function(n){ return n.nodeType === 3 && n.textContent.trim(); })[0];
    var range = document.createRange();
    range.selectNodeContents(textNode);
    var textRect = range.getBoundingClientRect();
    var containerRect = el.getBoundingClientRect();
    return { textCenter: textRect.left + textRect.width / 2, containerCenter: containerRect.left + containerRect.width / 2 };
  });
  var centerDiff = Math.abs(centering.textCenter - centering.containerCenter);
  if (centerDiff > 2) {
    console.error('FAIL: "INC14 Return" text should be visually centered in the title row despite the icon sitting to its left, got offset=', centerDiff, centering);
    process.exitCode = 1;
  } else {
    console.log('OK: "INC14 Return" text is visually centered in the title row (offset=' + centerDiff.toFixed(2) + 'px)');
  }

  var windowStroke = await page.locator('.tv-settings-title-icon svg circle').evaluate(function(el){ return el.getAttribute('stroke'); });
  var outlineStrokeCount = await page.locator('.tv-settings-title-icon svg path[stroke]').count();
  var flameFill = await page.locator('.tv-settings-title-icon svg path[fill="#fb923c"]').count();
  if (windowStroke !== 'currentColor' || outlineStrokeCount !== 3 || flameFill !== 1) {
    console.error('FAIL: rocket should be a stroked outline (body + 2 fins) with an outlined window and one filled flame accent, got windowStroke=', windowStroke, 'outlineStrokeCount=', outlineStrokeCount, 'flameFill=', flameFill);
    process.exitCode = 1;
  } else {
    console.log('OK: rocket icon is a stroked classic outline (body + 2 fins + outlined window) with an orange flame accent');
  }

  var iconSize = await page.locator('.tv-settings-title-icon svg').evaluate(function(el){ return { width: getComputedStyle(el).width, height: getComputedStyle(el).height }; });
  if (iconSize.width !== '32px' || iconSize.height !== '32px') { console.error('FAIL: rocket icon should render at 32px so it is easier to see, got', iconSize); process.exitCode = 1; }
  else console.log('OK: rocket icon renders at a larger, more visible 32px size');

  var initialBtnText = (await page.locator('.tv-activate-btn').textContent()).trim();
  if (initialBtnText !== '활성화') { console.error('FAIL: settings button should say "활성화" before first activation, got', initialBtnText); process.exitCode = 1; }
  else console.log('OK: settings button says "활성화" before first activation');

  await page.locator('.tv-activate-btn').click();
  await page.locator('.tv-status-badge').waitFor({ state: 'visible', timeout: 3000 });
  console.log('OK: activated');

  // Reopening settings later (e.g. via the gear button) while already
  // running must say "저장", not "활성화" or "실행 중" -- this is a settings
  // window, not a running-status display.
  await page.locator('.tv-gear-btn').click();
  await page.locator('.tv-settings-card').waitFor({ state: 'visible', timeout: 3000 });
  var reopenedBtnText = (await page.locator('.tv-activate-btn').textContent()).trim();
  if (reopenedBtnText !== '저장') { console.error('FAIL: settings button should still say "저장" while already running, got', reopenedBtnText); process.exitCode = 1; }
  else console.log('OK: settings button still says "저장" while already active');

  // Clicking the gear button again while settings are open must close it
  // (toggle), not just re-render the same modal.
  await page.locator('.tv-gear-btn').click();
  await page.locator('.tv-settings-overlay').waitFor({ state: 'hidden', timeout: 3000 }).catch(function(){});
  var settingsVisibleAfterToggle = await page.locator('.tv-settings-card').isVisible().catch(function(){ return false; });
  if (settingsVisibleAfterToggle) { console.error('FAIL: clicking the gear button while settings are open should close them'); process.exitCode = 1; }
  else console.log('OK: clicking the gear button again closes the settings window');

  // And a third click reopens it.
  await page.locator('.tv-gear-btn').click();
  var settingsVisibleAgain = await page.locator('.tv-settings-card').isVisible().catch(function(){ return false; });
  if (!settingsVisibleAgain) { console.error('FAIL: clicking the gear button after closing should reopen settings'); process.exitCode = 1; }
  else console.log('OK: clicking the gear button again reopens the settings window');

  // Typing into a settings field must NOT live-update the top-right status
  // badge -- only clicking 저장 should apply and reflect the change.
  var groupToggleRow = page.locator('.tv-toggle-row').filter({ has: page.locator('[data-key="restrictionEnabled"]') });
  await groupToggleRow.click();
  await page.locator('.tv-group-input').fill('GRP9');
  var restrictHeaderVisibleBeforeSave = await page.locator('.tv-status-badge-restrict-header').isVisible().catch(function(){ return false; });
  if (restrictHeaderVisibleBeforeSave) { console.error('FAIL: status badge should not reflect unsaved settings changes'); process.exitCode = 1; }
  else console.log('OK: typing into a settings field does not live-update the status badge');

  await page.locator('.tv-activate-btn').click();
  await page.locator('.tv-status-badge-restrict-header').waitFor({ state: 'visible', timeout: 3000 });
  var restrictGroupLineText = (await page.locator('.tv-restrict-group-line').textContent()).trim();
  if (restrictGroupLineText.indexOf('GRP9') === -1) { console.error('FAIL: status badge should reflect the saved group number after clicking 저장, got', restrictGroupLineText); process.exitCode = 1; }
  else console.log('OK: clicking 저장 applies and displays the changed settings:', restrictGroupLineText);

  console.log(process.exitCode ? 'SETTINGS TOGGLE SMOKE TEST: SOME FAILURES' : 'SETTINGS TOGGLE SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(process.exitCode || 0);
})();
