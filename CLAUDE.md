# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser bookmarklet (Korean UI) that automates a warehouse WMS's "집품 현황 조회" (pick-status lookup) page: scan a tote barcode → auto-search → detect truck vs. courier delivery → verify scanned products against expected quantities → for courier shipments, auto-open the WMS's waybill-generation modal and drive it via a scannable virtual barcode. There is no access to the real WMS; all development is verified against a hand-rolled mock (`test/fixture.html` + `test/server.js`).

## Commands

    npm install                          # installs playwright (only dev dependency, needed for smoke tests)
    node build.js                        # builds src/bookmarklet.js -> dist/bookmarklet.txt (the installable javascript: URI)
    node test/code128.test.js            # CODE128 encoder unit tests (no browser)
    node test/smoke.js                   # courier flow e2e (waybill generate + reprint)
    node test/smoke_truck.js             # truck flow e2e
    node test/smoke_fallback.js          # waybill modal detected via fallback selector when its id mismatches
    node test/smoke_reload.js            # activation must NOT persist across a fresh page reload
    node test/smoke_manual_typing.js     # manual typing + Enter still triggers search (not just scanner speed)
    node test/smoke_reprint_immediate.js # tote that already has a waybill skips straight to reprint
    node test/smoke_manual_close.js      # closing the WMS's waybill modal manually (is-open class removed) still clears our overlay
    node test/smoke_repeat_search.js     # re-searching the same tote twice in a row must not hang
    node test/smoke_no_results.js        # a tote with zero matching rows is reported as "no results", not a timeout error
    node test/smoke_scan_during_reprint.js # scanning a new tote while the reprint barcode is showing must start a fresh search
    node test/smoke_mismatch_feedback.js # mismatched/duplicate scans get an unmissable toast, and never flash a scrollbar
    node test/screenshot.js              # renders settings/verify/waybill states to dist/screenshots/*.png

`package.json`'s `test:smoke` script only wires up `smoke.js` + `smoke_truck.js` — the other smoke files above are not in any npm script and must be run individually. There is no test runner/framework; each file is a plain Node script that `console.log`s `OK:`/`FAIL:` lines and sets `process.exitCode`. Every smoke test starts its own instance of `test/server.js` (a plain `http` server on port 8934) as a side effect of `require`, so run smoke tests as separate `node` processes (as above), not concurrently in the same process.

After any change to `src/bookmarklet.js`, run **all** of the commands above (unit test + all 11 smoke files) before considering the change done, then `node build.js` and sanity-check `dist/bookmarklet.txt` (e.g. `node -e "new Function(require('fs').readFileSync('dist/bookmarklet.txt','utf8').replace(/^javascript:/,''))"`) — `dist/bookmarklet.txt` is the actual shipped artifact and is committed to git (not gitignored), so it must be rebuilt and committed alongside any `src/` change.

## Architecture

**Everything lives in one file, `src/bookmarklet.js`.** It is a single IIFE prefixed with the `javascript:` scheme (a labeled statement, not a syntax error) and has zero runtime dependencies — no CDN, no bundler, no framework. This is a hard constraint, not an oversight: the target network's CSP blocks external scripts, so the CODE128B barcode encoder + `<canvas>` renderer is hand-written inline (`code128Values`/`code128Patterns`/`drawCode128`) rather than pulled from a library.

Top-of-file constants are the seams for adapting to a real WMS whose DOM differs from the mock:
- `SEL` — every DOM selector the script touches on the *host* WMS page (tote input, search button, date-range picker, waybill dialog, etc.)
- `CTRL` — the short strings (`TVCS`/`TVCW`/`TVCR`) encoded into the virtual barcodes; kept intentionally short (4 chars) because the CODE128 module count — and therefore the on-screen widget width — scales directly with string length (this was cut down from `TVCTL_WAYBILL`-style 13-char codes in a prior round specifically to shrink the floating barcode without thinning the bars past scannable width)

**Virtual barcode mechanism**: barcode scanners are keyboard-emulation devices. A CODE128 barcode is rendered on a `<canvas>`; scanning it types the encoded string into whatever's focused, followed by Enter. The global `keydown` listener (`onGlobalKeydown`) buffers keystrokes and uses inter-key timing to distinguish scanner input (fast) from human typing (slow), then checks whether the buffered string starts with `TVC` to route it to `handleScan` as a control code vs. letting it fall through as a real product/tote/box barcode typed into the WMS's own input.

**State machine**: `state.mode` drives everything (`IDLE` → `SEARCHING` → `VERIFYING` → `WAITING_WAYBILL_OPEN` → `WAITING_WAYBILL` → `REFRESHING` → `REPRINT_READY` → back to `IDLE`). Most functions are guarded by a mode check so stray scans in the wrong state are no-ops.

**UI isolation**: a single host `<div>` is appended to `document.documentElement` with `attachShadow({mode:'open'})`; the entire stylesheet is one big JS string (`CSS`) injected as a `<style>` tag inside the shadow root, using CSS custom properties (`--tv-*` tokens on `:host`) for the whole dark theme. Nothing is written to global document styles.

**Waybill modal detection, worth knowing before touching the waybill-watching logic:** the real WMS's waybill modal is a persistent `<div id="modalOutboundWaybill">` — it is never added to or removed from the DOM by opening/closing; instead its `class` toggles between `waybill-overlay is-open` (open) and `waybill-overlay` (closed). `findWaybillModalNode()` therefore treats presence of the `is-open` class on `SEL.waybillDialog` (`#modalOutboundWaybill`) as the *authoritative* open/closed signal when that element is found at all — it does **not** fall back to geometry checks for it, since a hidden-but-still-rendered descendant (e.g. via `visibility`/`opacity` instead of `display:none`) could report nonzero `offsetWidth`/`offsetHeight` forever and mask a real close. Geometry-based visibility (`isElementVisible`, via `offsetWidth`/`offsetHeight`/`getClientRects().length`) is used only for the two fallback candidates (`SEL.waybillSubmit`/`SEL.waybillBoxInput`), which is what kicks in when `SEL.waybillDialog` doesn't match at all (real WMS markup drifted from our assumed id — see `smoke_fallback.js`). Because the modal is a persistent element with a toggled class rather than a node that gets inserted/removed, `watchWaybillDialog()`'s `MutationObserver` watches `attributes`/`class` (not just `childList`) so a manual close is caught immediately instead of waiting for the 400ms poll fallback.

The floating virtual-barcode overlays (`.tv-waybill-area`/`.tv-reprint-area`) use the CSS Popover API (`popover="manual"` + `showPopover()`/`hidePopover()`, see `setPopoverVisible`) to render above the WMS's own high-z-index overlay, with a `classList.toggle('tv-show', …)` fallback for browsers without Popover support.

**Watch out for the `overflow-x`/`overflow-y` coupling gotcha**: per the CSS Overflow spec, setting only one of `overflow-x`/`overflow-y` to a non-`visible` value computes the *other* axis to `auto` too (never `visible`) if left unset. `.tv-product-list` only needs vertical scrolling (`overflow-y:auto`), but leaving `overflow-x` unset made it implicitly `auto` as well — and a product row's error-shake animation (`tvRowFocusErr`, `translateX` up to 6px) transiently pushed `scrollWidth` past `clientWidth`, flashing a real horizontal scrollbar on every mismatched/duplicate scan. Any scrollable container that should only scroll on one axis needs the other axis pinned to `hidden` explicitly, not left to default.

**Watch out for the `CSS` name collision**: the file's own top-level stylesheet variable is `var CSS = '...'`, which shadows the global `window.CSS` namespace object *everywhere in this file's scope*. Calling `CSS.escape(...)` will silently resolve to a property on the stylesheet string, not the browser API, and throw `CSS.escape is not a function` at runtime — this bit us once already. Find elements by attribute value via a manual `Array.prototype.filter` over `.children` (see `findProductRow`) instead.

**Row/element animations use a specific pattern to avoid killing each other**: several CSS keyframe animations are triggered by adding a class, and re-triggered later by `classList.remove(cls); void el.offsetWidth; classList.add(cls)` (forces a reflow so the animation restarts). Entrance animations (`.tv-row-enter`) are intentionally *not* combined with `animation-fill-mode: forwards` on the same element that later gets a different animation class (`.tv-row-pop`/`.tv-row-focus`) — two different animation-name values on overlapping classes fully override each other (CSS `animation` is not additive across selectors), so relying on `forwards` to hold a value (e.g. opacity) breaks the moment a second animation class gets added later. Give each transient animation its own modifier class with a self-contained resting state instead of depending on fill-mode carryover from an earlier one.

**Testing strategy**: there is no access to the real WMS, so `test/fixture.html` + `test/server.js` (plain Node `http` server, no deps) is a hand-rolled stand-in matching just the DOM shape the script depends on (`SEL`/`CTRL` contract). Playwright smoke tests load `src/bookmarklet.js` directly from disk (`fs.readFileSync` + strip the `javascript:` prefix + `page.evaluate`), not the built `dist/bookmarklet.txt` — so tests exercise source, and rebuilding dist is a separate manual verification step, not something the test suite covers.

`dist/screenshots/*.png` (written by `test/screenshot.js`) is not gitignored but is treated as a scratch/review artifact in this workflow — generated to inspect visually or send to the user, then deleted (`rm -rf dist/screenshots`) rather than committed.
