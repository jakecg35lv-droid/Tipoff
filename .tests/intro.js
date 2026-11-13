/*  The intro has a hard 2.5s budget, door to door.

    It used to run its last motion at 2.06s, then sit on a fixed
    2.3s setTimeout and an 0.8s crossfade — about 1.1 seconds of
    dead air and a 3.15s gate before the splash was usable.

    Nothing at runtime enforces the relationship between the CSS
    keyframes and the two setTimeouts in showSplash(). This suite
    is that enforcement: it reads the real delays out of both files
    and does the arithmetic.                                      */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const BUDGET = 2.5;

// ── Read the real numbers ────────────────────────────────
const tl = css.slice(css.indexOf('TIMELINE — hard budget'),
                     css.indexOf('@media (prefers-reduced-motion', css.indexOf('TIMELINE — hard budget')));
ok('the timeline block exists', tl.length > 400);

const re = /animation:\s*([a-z-]+)\s+([\d.]+)s[^;]*?\s([\d.]+)s/g;
let m, lastEnd = 0, count = 0;
while ((m = re.exec(tl))) {
  lastEnd = Math.max(lastEnd, parseFloat(m[2]) + parseFloat(m[3]));
  count++;
}
ok('animations were parsed', count >= 6, String(count));

const timers = app.match(/\}, (\d+)\);\n\s*\}, (\d+)\);/);
ok('showSplash timers were parsed', !!timers);
const crossfade = parseInt(timers[1], 10) / 1000;
const hold = parseInt(timers[2], 10) / 1000;

// ── The budget ───────────────────────────────────────────
const total = hold + crossfade;
ok('total is within 2.5s', total <= BUDGET, total.toFixed(2) + 's');
//  The hold must outlast the animation or the crossfade starts
//  over a half-drawn court.
ok('the hold outlasts the last motion', hold >= lastEnd,
  'hold ' + hold.toFixed(2) + 's vs motion ' + lastEnd.toFixed(2) + 's');
//  And not by much, or we are back to dead air.
ok('dead air stays under 0.4s', (hold - lastEnd) <= 0.4,
  ((hold - lastEnd)).toFixed(2) + 's of dead air');
//  The CSS transition duration and the cleanup timer have to agree,
//  or the intro is torn down mid-fade or lingers after it.
const fadeCss = parseFloat((app.match(/intro\.style\.transition = 'opacity ([\d.]+)s/) || [])[1]);
ok('the cleanup timer matches the fade', Math.abs(crossfade - fadeCss) <= 0.05,
  'timer ' + crossfade + 's vs css ' + fadeCss + 's');

// ── The wordmark ─────────────────────────────────────────
ok('the intro resolves into TIPOFF', />TIPOFF<\/div>/.test(html));
ok('it is the only word left', !/mm-intro-sub/.test(html));
/*  There are two `.mm-intro-word {` rules: the hidden state
    (opacity:0) and the appearance. Pick the one that actually
    styles the type, not whichever comes first in the file.    */
const word = (function () {
  let at = -1, from = 0;
  for (;;) {
    const i = css.indexOf('.mm-intro-word {', from);
    if (i < 0) break;
    const body = css.slice(i, css.indexOf('}', i));
    if (/font-family/.test(body)) { at = i; break; }
    from = i + 1;
  }
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
})();
ok('the wordmark styling rule was found', word.length > 50);
//  "Correct font" means the app's display face, not a one-off.
ok('it uses the app display font', /font-family:\s*var\(--font-display\)/.test(word));
ok('--font-display is Barlow Condensed', /--font-display:\s*'Barlow Condensed'/.test(css));
//  Tracked-out type pads only the right of the last glyph.
ok('tracking is optically centred', /text-indent/.test(word));
ok('the wordmark animates in', /mm-intro-word \{[\s\S]{0,200}mm-word-in/.test(tl));
ok('it lands with the court dim',
  Math.abs(lastEnd - 1.50) < 0.001, 'last motion at ' + lastEnd.toFixed(2) + 's');

// ── The baskets are gone ─────────────────────────────────
ok('no basket circles in the markup', !/mm-court-basket/.test(html));
ok('no basket styles left behind', !/\.mm-court-basket/.test(css));

// ── Dead weight removed ──────────────────────────────────
//  The logo <img> was display:none but still fetched, on the
//  critical path of a 2.5s intro. .mm-flash never animated.
ok('the hidden logo image is gone', !/mm-intro-logo/.test(html) && !/mm-intro-logo/.test(css));
ok('the hidden title is gone', !/mm-intro-title/.test(html) && !/mm-intro-title/.test(css));
ok('the unused flash layer is gone', !/mm-flash/.test(css));

// ── Reduced motion covers the whole thing ────────────────
//  The old rule only quieted the tagline; the court still drew
//  itself, which is the bulk of the movement.
const rm = css.slice(css.indexOf('@media (prefers-reduced-motion', css.indexOf('TIMELINE — hard budget')));
const rmBlock = rm.slice(0, rm.indexOf('\n}\n', rm.indexOf('mm-intro-word')) + 3);
ok('reduced motion stops the court drawing', /\.mm-path \{[\s\S]{0,120}animation: none/.test(rmBlock));
ok('reduced motion still shows the wordmark', /mm-intro-word \{[\s\S]{0,80}fade-in/.test(rmBlock));

// ── Shipped ──────────────────────────────────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const b = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + b));
ok('no stale ?v=', (html.match(/\?v=(\d+)/g) || []).every(function (v) { return v === '?v=' + b; }));

console.log('\n  timeline ends ' + lastEnd.toFixed(2) + 's · hold ' + hold.toFixed(2) +
            's · fade ' + crossfade.toFixed(2) + 's · TOTAL ' + total.toFixed(2) + 's');
console.log('\n' + pass + '/' + (pass + fail) + ' intro checks pass');
process.exit(fail ? 1 : 0);
