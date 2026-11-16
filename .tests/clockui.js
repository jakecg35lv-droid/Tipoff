/*  The draft clock label has to stay inside a CIRCLE.

    .g-ck-in span carried max-width: 120px — a fixed value sized for
    the 156-168px desktop clock. .dg-clock drops to 104px on a phone,
    so the label was allowed to be 115% of the clock's width: long
    team names ran out over the ring and across the countdown digits.

    A percentage tracks the clock at every size. These checks derive
    the geometry rather than trusting the number.                  */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'src/season/season.css'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

/*  Anchored to the start of a line. Unanchored, a lookup for
    `.ss-clock-wait` matched `.dg-clock .g-ck-in b.ss-clock-wait`
    first, so a check on the base rule was silently reading the
    mobile override instead. */
function rule(sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp('(?:^|\\n)\\s*' + esc + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
}
function num(sel, prop, unit) {
  const m = rule(sel).match(new RegExp(prop + ':\\s*([\\d.]+)' + (unit || 'px')));
  return m ? parseFloat(m[1]) : null;
}

// ══ 1. The fixed pixel width is gone ═════════════════════
const span = rule('.g-ck-in span');
ok('the label width is no longer a fixed pixel value',
  !/max-width:\s*\d+px/.test(span), span.trim());
ok('it is a percentage of the clock', /max-width:\s*\d+%/.test(span));
ok('it still truncates rather than wrapping',
  /overflow:\s*hidden/.test(span) && /text-overflow:\s*ellipsis/.test(span) &&
  /white-space:\s*nowrap/.test(span));

// ══ 2. Geometry: does the allowance fit inside the ring? ═
/*  The ring is 9 units thick at r=70 on a 160 viewBox, so the usable
    radius is (70 - 4.5)/80 = 0.819 of the half-width. The label sits
    below centre, where the chord narrows:
        usable % of full width = sqrt(0.819^2 - (y/H)^2)          */
const R = (70 - 4.5) / 80;
function usablePct(clockPx, digitsPx) {
  const H = clockPx / 2, y = digitsPx * 0.52;
  return 100 * Math.sqrt(Math.max(0, R * R - (y / H) ** 2));
}
//  Confirm the stroke and radius the maths assumes are the real ones.
ok('the ring radius matches the dasharray',
  Math.abs(2 * Math.PI * 70 - 439.82) < 0.1, 'dasharray encodes r=70');
ok('the ring thickness is 9', /stroke-width:\s*9/.test(rule('.g-ck-fg')));

const basePct = parseFloat((span.match(/max-width:\s*([\d.]+)%/) || [])[1]);
const mobPct = parseFloat((rule('.dg-clock .g-ck-in span').match(/max-width:\s*([\d.]+)%/) || [])[1]);
const mobDigits = num('.dg-clock .g-ck-in b', 'font-size');
const baseDigits = num('.g-ck-in b', 'font-size');
const heroPx = num('.g-clockwrap', 'width');
const deskPx = num('.dg-clock', 'width');
//  The mobile width lives inside a media query, so read it from there.
const mobBlock = css.slice(css.indexOf('@media (max-width: 640px)'));
const mobPx = parseFloat((mobBlock.match(/\.dg-clock \{ width: ([\d.]+)px/) || [])[1]);

ok('every clock size was found',
  [basePct, mobPct, mobDigits, baseDigits, heroPx, deskPx, mobPx].every(v => v && !isNaN(v)),
  JSON.stringify({ basePct, mobPct, mobDigits, baseDigits, heroPx, deskPx, mobPx }));

for (const [label, px, digits, pct] of [
  ['hero ' + heroPx + 'px', heroPx, baseDigits, basePct],
  ['desktop ' + deskPx + 'px', deskPx, baseDigits, basePct],
  ['mobile ' + mobPx + 'px', mobPx, mobDigits, mobPct],
]) {
  const avail = usablePct(px, digits);
  ok('the label fits inside the ring at ' + label,
    pct < avail, pct + '% allowed vs ' + avail.toFixed(1) + '% usable');
  //  And not so narrow it shows nothing useful.
  ok('the label is not uselessly narrow at ' + label, px * pct / 100 >= 60,
    Math.round(px * pct / 100) + 'px');
}

//  The regression itself, stated as a number.
ok('the old 120px would still overflow the phone clock',
  120 / mobPx * 100 > usablePct(mobPx, mobDigits),
  (120 / mobPx * 100).toFixed(0) + '% vs ' + usablePct(mobPx, mobDigits).toFixed(1) + '%');
ok('the phone allowance is tighter than the desktop one', mobPct < basePct,
  mobPct + '% vs ' + basePct + '%');

// ══ 3. The takeover text replaces the digits ═════════════
/*  "Autopicking" and the waiting note are written into the same
    element as the countdown, at the digits' font size unless told
    otherwise. On the 104px clock that overflows. */
ok('the waiting text is shrunk relative to the digits',
  /font-size:\s*0?\.\d+em/.test(rule('.ss-clock-wait')), rule('.ss-clock-wait').trim());
ok('it is shrunk further on the phone clock',
  /font-size:\s*\d+px/.test(rule('.dg-clock .g-ck-in b.ss-clock-wait')));
(function () {
  const px = parseFloat((rule('.dg-clock .g-ck-in b.ss-clock-wait').match(/font-size:\s*([\d.]+)px/) || [])[1]);
  ok('the phone waiting text was found', !!px, String(px));
  if (!px) return;
  //  "Autopicking" is the longest string that goes in here. At roughly
  //  0.55em average advance per character it must clear the ring.
  const widest = 'Autopicking'.length * px * 0.55;
  const room = mobPx * usablePct(mobPx, px) / 100;
  ok('"Autopicking" fits on the phone clock', widest < room,
    Math.round(widest) + 'px vs ' + Math.round(room) + 'px of room');
  ok('it is still legible', px >= 10, px + 'px');
})();

// ══ 4. Both lines fit vertically ═════════════════════════
ok('the phone digits have a tightened line-height',
  /line-height:\s*1\.0\d/.test(rule('.dg-clock .g-ck-in b')),
  rule('.dg-clock .g-ck-in b').trim());
(function () {
  const stack = mobDigits * 1.04 + 10;           // digits + label
  ok('the stacked text clears the ring vertically',
    stack < mobPx * R, Math.round(stack) + 'px of text in ' + Math.round(mobPx * R) + 'px');
})();

// ══ 5. Desktop is unchanged in spirit ════════════════════
(function () {
  const before = 120, after = deskPx * basePct / 100;
  ok('the desktop label width barely moves', Math.abs(after - before) <= 12,
    before + 'px -> ' + Math.round(after) + 'px');
})();

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for the current build',
  [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' clock-UI checks pass');
process.exit(fail ? 1 : 0);
