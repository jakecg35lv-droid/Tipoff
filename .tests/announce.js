/*  The draft's one full-screen moment, on a phone.

    .pa-* had NO mobile rules at all — every value was sized for a
    desktop card and inherited unchanged onto a 360px screen. The
    card is max-width:360px with 36px side padding inside an overlay
    adding 20px either side, leaving a 248px content box for a 36px
    display-face name with no wrapping control. A two-part surname
    overflowed the card it was being announced in.                 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
//  All blocks for a selector, because CSS cascades.
function rule(sel, scope) {
  const sheet = scope || css;
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?:^|\\n)\\s*' + esc + '\\s*\\{([^}]*)\\}', 'g');
  let m, out = '';
  while ((m = re.exec(sheet))) out += m[1] + '\n';
  return out;
}
const phone = (function () {
  const i = css.indexOf('PICK ANNOUNCEMENT ON A PHONE');
  return i > 0 ? css.slice(i) : '';
})();
ok('the phone block exists', phone.length > 200);

// ══ 1. A name cannot overflow its own card ═══════════════
ok('the player name breaks rather than overflowing',
  /overflow-wrap:\s*anywhere/.test(rule('.pa-player')),
  'a long surname used to run outside the card');
ok('the card drops its desktop max-width on a phone',
  /max-width:\s*none/.test(rule('.pa-card', phone)));
ok('the card has tighter padding on a phone',
  /padding:\s*28px 20px/.test(rule('.pa-card', phone)));

/*  Does the name actually fit? Content box at 360px =
    360 - 2*16 (overlay) - 2*20 (card) = 288px. */
(function () {
  const m = rule('.pa-player', phone).match(/font-size:\s*clamp\(([\d.]+)px,\s*([\d.]+)vw,\s*([\d.]+)px\)/);
  ok('the name scales with the viewport', !!m, rule('.pa-player', phone).trim().slice(0, 60));
  if (!m) return;
  const [lo, vw, hi] = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  const at = w => Math.min(hi, Math.max(lo, w * vw / 100));
  const box = w => w - 32 - 40;
  //  A condensed display face averages roughly 0.5em per character.
  const chars = w => Math.floor(box(w) / (at(w) * 0.5));
  ok('a small phone fits a usable name length', chars(320) >= 11, chars(320) + ' chars at 320px');
  ok('a large phone fits more', chars(430) >= 13, chars(430) + ' chars at 430px');
  ok('it never gets smaller than readable', lo >= 22, lo + 'px');
  ok('it is not larger than the desktop size', hi <= 36, hi + 'px');
  //  And anything longer wraps instead of overflowing, which is what
  //  overflow-wrap:anywhere above guarantees.
})();

// ══ 2. The overlay respects the device ═══════════════════
ok('the overlay honours the safe area',
  /env\(safe-area-inset-top\)/.test(rule('.pick-announce')) &&
  /env\(safe-area-inset-bottom\)/.test(rule('.pick-announce')));
ok('a short landscape screen is handled',
  /@media \(max-height: 480px\)[\s\S]{0,200}\.pa-card/.test(phone),
  'the card must not run off the top and bottom');
ok('reduced motion gets a plain fade',
  /prefers-reduced-motion[\s\S]{0,140}\.pa-card \{ animation: fade-in/.test(phone),
  'a sudden full-screen spring is exactly what that setting is for');

// ══ 3. Rapid picks must not cut each other off ═══════════
/*  This was a bare setTimeout per announcement. Two picks inside
    1.6s — routine in an autopick run, and more likely now that any
    device can cover an expired clock — left the FIRST timer armed.
    It fired during the second card and pulled it off screen after a
    few hundred milliseconds. */
ok('the dismiss timer is kept on the function', /showPickAnnounce\._t/.test(code));
ok('a new announcement cancels the outgoing one',
  /if \(showPickAnnounce\._t\) clearTimeout\(showPickAnnounce\._t\);/.test(code),
  'otherwise a cascade of picks flashes past unreadably');
ok('the timer clears itself when it fires',
  /showPickAnnounce\._t = null;/.test(code));
(function () {
  const fn = code.slice(code.indexOf('function showPickAnnounce'), code.indexOf('function getSortedPlayers'));
  ok('clearTimeout comes before the new timer',
    fn.indexOf('clearTimeout') < fn.indexOf('_t = setTimeout'));
  ok('the hold is long enough to read', /\}, 1600\);/.test(fn));
  //  The animation must still be restarted per announcement, or the
  //  second card appears with no entrance at all.
  ok('the entrance animation is re-triggered',
    /card\.style\.animation = 'none'; card\.offsetHeight; card\.style\.animation = '';/.test(fn));
})();

// ══ 4. The on-the-clock banner ═══════════════════════════
ok('the OTC banner clears the status bar',
  /padding:\s*env\(safe-area-inset-top\)/.test(rule('.otc-banner')),
  'it is sticky at top:0 on a phone');
ok('it slides in rather than appearing', /animation:\s*otc-slide-in/.test(rule('.otc-banner')));
ok('that keyframe exists', /@keyframes otc-slide-in/.test(css));
ok('it goes full bleed on a phone', /\.otc-banner \{\s*border-radius: 0;/.test(css));


// ══ 5. The league entry overlay ══════════════════════════
/*  .leo is position:fixed, inset:0, z-index:9999. While it is up the
    app is completely unreachable, and the only thing removing it was
    a bare setTimeout. .leo-name was 36px on mobile with padding:
    0 32px and no wrapping control — a 296px box, about 16 characters
    of 900-weight Inter. "HomeFantasyLeague" is seventeen with no
    space to break at, so it ran off both sides.                   */
const leoPhone = (function () {
  const i = css.indexOf('LEAGUE ENTRY OVERLAY ON A PHONE');
  return i > 0 ? css.slice(i) : '';
})();
ok('the entry-overlay phone block exists', leoPhone.length > 200);

ok('a league name breaks instead of overflowing',
  /overflow-wrap:\s*anywhere/.test(rule('.leo-name')),
  'league names are user input');
ok('it cannot exceed the overlay', /max-width:\s*100%/.test(rule('.leo-name')));
ok('wrapped lines sit tight', /line-height:\s*1\.0\d/.test(rule('.leo-name')));
ok('the overlay honours the safe area',
  /env\(safe-area-inset-top\)/.test(rule('.leo')),
  'the corner marks are pinned 24px in and sat under the notch');
ok('the name scales with the viewport on a phone',
  /font-size:\s*clamp\(/.test(rule('.leo-name', leoPhone)));
(function () {
  const m = rule('.leo-name', leoPhone).match(/clamp\(([\d.]+)px,\s*([\d.]+)vw,\s*([\d.]+)px\)/);
  ok('the clamp is readable at both ends', !!m && parseFloat(m[1]) >= 24 && parseFloat(m[3]) <= 40,
    m ? m[0] : 'no clamp');
})();
/*  background-clip:text with a transparent fill renders NOTHING
    where unsupported — an overlay announcing a league, with no
    league name on it. */
ok('there is a fallback when background-clip:text is unsupported',
  /@supports not \(\(-webkit-background-clip: text\)[\s\S]{0,200}\.leo-name/.test(css));
ok('that fallback restores a visible colour',
  /@supports not[\s\S]{0,260}-webkit-text-fill-color:\s*var\(--text\)/.test(css));
ok('reduced motion stills the rings',
  /prefers-reduced-motion[\s\S]{0,200}\.leo-ring \{ animation: none;/.test(leoPhone));

// ── The overlay must always come down ────────────────────
ok('the dismiss timer is single and cancellable',
  /if \(enterLeague\._leoT\) clearTimeout\(enterLeague\._leoT\);/.test(code),
  'entering twice left one timer hiding what the other had raised');
ok('the hide runs in a finally',
  /try \{ showMainApp\(\); \}\s*finally \{ leoEl\.style\.display = 'none'; \}/.test(code),
  'a throw in showMainApp would otherwise strand a full-screen overlay');
ok('the timer handle is cleared when it fires', /enterLeague\._leoT = null;/.test(code));
(function () {
  const fn = code.slice(code.indexOf('function enterLeague'), code.indexOf('function showMainApp'));
  ok('the overlay is raised before the timer is armed',
    fn.indexOf("leoEl.style.display = 'flex'") < fn.indexOf('_leoT = setTimeout'));
  ok('there is still a path when the overlay is missing',
    /\} else \{\s*showMainApp\(\);/.test(fn),
    'a missing element must not block entry');
})();

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for the current build',
  [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' announcement checks pass');
process.exit(fail ? 1 : 0);
