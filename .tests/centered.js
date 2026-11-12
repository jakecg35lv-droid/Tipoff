/*  Every centred dialog must stay centred.

    The bug: .modal-backdrop said `display: grid; place-items:
    center`, but every modal is opened with an inline
    `el.style.display = 'flex'`. An inline style beats the
    stylesheet, so the box became a flex container — and under
    flex, place-items' align-items half still centres vertically
    while its justify-items half is ignored completely. Delete
    League and Restart League therefore sat vertically centred and
    jammed against the left edge of the window.

    align-items + justify-content are honoured by both layout
    modes. This suite walks every full-screen overlay in both
    stylesheets and insists on them, so no future overlay can
    ship with place-items alone.                                 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = ['src/styles.css', 'src/season/season.css'];

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

//  Deliberate exceptions: these are bottom sheets, not dialogs.
//  They anchor to an edge on purpose.
const SHEETS = ['.tos-modal', '.nav-sheet-backdrop'];

const overlays = [];
FILES.forEach(function (f) {
  const css = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = /([^{}]+)\{([^}]*position:\s*fixed[^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim().split('\n').pop().trim();
    const body = m[2];
    if (!/inset:\s*0/.test(body)) continue;        // not full-screen
    if (!/display:\s*(grid|flex)/.test(body)) continue; // not a layout parent
    if (sel.startsWith('@') || sel.includes('::')) continue;
    overlays.push({ file: f, sel: sel, body: body });
  }
});

ok('found the overlays to check', overlays.length >= 8, String(overlays.length));

overlays.forEach(function (o) {
  if (SHEETS.indexOf(o.sel) >= 0) {
    //  A sheet must actually be anchored, not accidentally so.
    ok(o.sel + ' is an intentional edge sheet',
      /align-items:\s*flex-(end|start)/.test(o.body), o.file);
    return;
  }
  const ai = /align-items:\s*center/.test(o.body);
  const jc = /justify-content:\s*center/.test(o.body);
  ok(o.sel + ' centres under flex and grid', ai && jc,
    o.file + (ai ? '' : ' missing align-items') + (jc ? '' : ' missing justify-content'));
});

//  place-items on its own is the exact shape of the bug. Flag any
//  overlay that relies on it without the two longhands.
overlays.forEach(function (o) {
  if (SHEETS.indexOf(o.sel) >= 0) return;
  if (!/place-items:\s*center/.test(o.body)) return;
  ok(o.sel + ' does not rely on place-items alone',
    /align-items:\s*center/.test(o.body) && /justify-content:\s*center/.test(o.body), o.file);
});

//  No modal may reintroduce an inline align-items in the markup;
//  that is how the Delete League dialog was pinned to the top once
//  before. (Inline display:flex is fine now that the CSS copes.)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const backdrops = html.match(/class="[^"]*modal-backdrop[^"]*"[^>]*/g) || [];
ok('index.html has modal backdrops', backdrops.length > 0, String(backdrops.length));
const inlineAlign = backdrops.filter(function (b) { return /align-items|justify-content|place-items/.test(b); });
ok('no backdrop overrides centring inline', inlineAlign.length === 0, inlineAlign.join(' | '));

console.log('\n' + pass + '/' + (pass + fail) + ' centering checks pass');
process.exit(fail ? 1 : 0);
