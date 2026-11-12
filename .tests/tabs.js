/*  Players tab strip must be reachable on a phone.

    The bug: this strip was styled for the two tabs the tournament
    draft page has. The season players page renders six — Available,
    Full Pool, Claims, Trades, Injuries, Transactions — and the
    mobile rules were `.draft-inner-tabs { flex: 1 }` with
    `.dit-btn { flex: 1 }` and no overflow property anywhere.

    Flex items default to min-width:auto, so the buttons would not
    shrink below their own labels. Six labels exceed a 390px screen,
    so the strip overflowed its container and everything past the
    third tab was clipped off the edge with no way to scroll to it. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
const season = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

//  The mobile block that owns this strip.
const mi = css.indexOf('@media (max-width: 560px)');
//  Brace-match the media block rather than cutting at the first
//  selector inside it — an early cut silently drops the .dit-btn
//  rules and the checks below pass on an empty string.
let depth = 0, end = mi;
for (let i = css.indexOf('{', mi); i < css.length; i++) {
  if (css[i] === '{') depth++;
  else if (css[i] === '}') { depth--; if (!depth) { end = i; break; } }
}
const mob = css.slice(mi, end);
ok('mobile block found', mi > 0 && mob.length > 100);

function rule(src, sel) {
  const m = src.match(new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
}

const strip = rule(mob, '.draft-inner-tabs');
const btn = rule(mob, '.dit-btn');
ok('strip rule present', strip.length > 0);
ok('button rule present', btn.length > 0);

// ── The strip must actually be able to scroll ────────────
ok('strip scrolls horizontally', /overflow-x:\s*auto/.test(strip), strip.trim().slice(0, 90));
ok('strip does not also scroll vertically', /overflow-y:\s*hidden/.test(strip));
//  Without min-width:0 a flex child still refuses to shrink, so the
//  overflow property alone would not have fixed anything.
ok('strip can shrink below its content', /min-width:\s*0/.test(strip));
//  The desktop rule is width:fit-content, which would size the strip
//  to all six tabs and push it off-screen regardless of overflow.
ok('desktop fit-content is overridden', /width:\s*auto/.test(strip));
ok('scrollbar is hidden, not absent', /scrollbar-width:\s*none/.test(strip));
ok('webkit scrollbar hidden too', /\.draft-inner-tabs::-webkit-scrollbar\s*\{[^}]*display:\s*none/.test(mob));

// ── Buttons keep their real width ────────────────────────
//  flex:1 is the precise cause of the original clipping: it told six
//  buttons to share a width they could not fit into, and min-width:
//  auto meant they refused, so they spilled instead.
ok('buttons are not stretched', !/flex:\s*1\s*;/.test(btn), btn.trim().slice(0, 60));
ok('buttons size to content', /flex:\s*0 0 auto/.test(btn));
ok('labels never wrap mid-tab', /white-space:\s*nowrap/.test(btn));

// ── The row must not wrap the strip away ─────────────────
const row = rule(mob, '.draft-tabs-row');
ok('row keeps the strip on one line', /flex-wrap:\s*nowrap/.test(row), row.trim().slice(0, 60));
//  Autopick sits beside the strip on the tournament page and must
//  not be squeezed by it.
ok('autopick button holds its width', /flex:\s*0 0 auto/.test(rule(mob, '.dit-autopick-btn')));

// ── Tap targets stay legal ───────────────────────────────
//  A separate block sets min-height on .dit-btn; the scroll change
//  must not have removed it.
ok('buttons still clear 44px somewhere', /\.dit-btn \{[^}]*min-height:\s*44px/.test(css));

// ── The active tab is scrolled into view after render ────
//  A scrollable strip that always starts at tab one is only half a
//  fix: selecting Transactions would leave it off-screen.
const render = season.slice(season.indexOf('function render()'), season.indexOf('function myGameIndex'));
ok('render finds the active tab', /\.draft-inner-tabs \.dit-btn\.active/.test(render));
ok('render only scrolls when it overflows',
  /scrollWidth > \w+\.clientWidth/.test(render));
ok('render centres the active tab', /scrollLeft = Math\.max\(0,/.test(render));

// ── Six tabs is what we are solving for ──────────────────
const tabsDef = season.slice(season.indexOf("[['fa', 'Available']"), season.indexOf("[['fa', 'Available']") + 400);
const count = (tabsDef.match(/\['[a-z]+',/g) || []).length;
ok('season players page really has six tabs', count === 6, String(count));

// ── Shipped ──────────────────────────────────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build));
ok('styles.css requested at the current build', html.includes('src/styles.css?v=' + build));

console.log('\n' + pass + '/' + (pass + fail) + ' tab-strip checks pass');
process.exit(fail ? 1 : 0);
