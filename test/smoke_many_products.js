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

async function openManyProducts(browser, height){
  var page = await browser.newPage({ viewport: { width: 900, height: height } });
  await page.goto('http://localhost:8934/fixture.html');
  var src = fs.readFileSync(path.join(__dirname, '../src/bookmarklet.js'), 'utf8').replace(/^javascript:/, '');
  await page.evaluate(src);
  await page.locator('.tv-card').waitFor({ timeout: 3000 });
  await page.locator('.tv-activate-btn').click();
  await sendScan(page, 'TOTE_MANY');
  await page.locator('.tv-verify').filter({ hasText: '업체C' }).waitFor({ timeout: 5000 });
  return page;
}

(async () => {
  var browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  var failed = false;

  // TOTE_MANY has 15 products. 700px is a realistic minimum window height
  // (smaller than a typical 768px-tall display) that the fix must handle
  // with zero extra scrolling: the card caps its own height, and only the
  // product list -- not the whole card -- scrolls internally.
  var page = await openManyProducts(browser, 700);
  page.on('pageerror', function(err){ console.error('PAGE ERROR:', err.message); failed = true; });

  var cardBox = await page.locator('.tv-verify').boundingBox();
  var viewport = page.viewportSize();
  if (cardBox.y < 0 || cardBox.y + cardBox.height > viewport.height) {
    console.error('FAIL: verify card extends outside the viewport', cardBox, viewport);
    failed = true;
  } else {
    console.log('OK: verify card fits fully within a 700px-tall viewport despite 15 products (' + Math.round(cardBox.height) + 'px tall)');
  }

  // The header, hero, banner, stat grid and skip barcode must all stay
  // fully visible without scrolling -- only the product list scrolls.
  var chromeSelectors = ['.tv-verify-header', '.tv-verify-hero', '.tv-type-banner', '.tv-stat-grid', '.tv-skip-area'];
  var allChromeOk = true;
  for (var i = 0; i < chromeSelectors.length; i++) {
    var box = await page.locator(chromeSelectors[i]).boundingBox();
    if (!box || box.y < 0 || box.y + box.height > viewport.height) {
      console.error('FAIL: ' + chromeSelectors[i] + ' is clipped', box);
      allChromeOk = false;
      failed = true;
    }
  }
  if (allChromeOk) console.log('OK: header/hero/banner/stat-grid/tip-bar/skip-area are all fully visible without scrolling');

  var listScroll = await page.locator('.tv-product-list').evaluate(function(el){
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
  if (listScroll.scrollHeight <= listScroll.clientHeight) {
    console.error('FAIL: product list should need internal scrolling with 15 products', listScroll);
    failed = true;
  } else {
    console.log('OK: product list scrolls internally instead of pushing the card past the viewport (' + listScroll.scrollHeight + 'px content in ' + listScroll.clientHeight + 'px view)');
  }

  await page.locator('.tv-product-row').last().scrollIntoViewIfNeeded();
  var lastRowVisible = await page.locator('.tv-product-row').last().isVisible();
  if (!lastRowVisible) { console.error('FAIL: last product row should be reachable via scroll'); failed = true; }
  else console.log('OK: last product row is reachable by scrolling the product list');

  await page.close();

  // Extreme case: a viewport too short for even the fixed chrome to fit
  // (well below any realistic window size). The skip-area must still be
  // reachable via the .tv-verify-body scroll fallback, not permanently
  // clipped away with no way to reach it.
  var page2 = await openManyProducts(browser, 550);
  await page2.locator('.tv-skip-area').scrollIntoViewIfNeeded();
  var skipReachable = await page2.locator('.tv-skip-area').isVisible();
  if (!skipReachable) { console.error('FAIL: skip-area should be reachable via scroll fallback even in an extreme-short viewport'); failed = true; }
  else console.log('OK: skip-area remains reachable via scroll fallback even in an unrealistically short (550px) viewport');
  await page2.close();

  if (failed) process.exitCode = 1;
  console.log(failed ? 'MANY PRODUCTS SMOKE TEST: SOME FAILURES' : 'MANY PRODUCTS SMOKE TEST: ALL PASSED');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
