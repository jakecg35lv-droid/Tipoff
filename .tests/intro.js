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
  //  Strip comments. This rule documents the two mistakes it fixes
  //  by naming `text-indent` and `text-shadow`, and a raw search
  //  then finds the explanation and reports the bug as present.
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at)).replace(/\/\*[\s\S]*?\*\//g, '');
})();
ok('the wordmark styling rule was found', word.length > 50);
//  "Correct font" means the app's display face, not a one-off.
ok('it uses the app display font', /font-family:\s*var\(--font-display\)/.test(word));
ok('--font-display is Barlow Condensed', /--font-display:\s*'Barlow Condensed'/.test(css));
/*  Tracked-out type pads only AFTER the last glyph, so the glyph
    mass sits half a tracking-unit left of the box centre. The
    compensation is half the tracking, to the right — and because
    mm-word-in animates the tracking, it has to live in the same
    transform so the two interpolate together. A fixed text-indent
    was wrong twice: full tracking instead of half, and static
    while the tracking moved.                                     */
ok('centring is folded into the transform',
  /transform:\s*translate\(calc\(-50% \+ 0\.15em\), -50%\)/.test(word));
ok('no fixed text-indent is used', !/text-indent/.test(word));

//  The X offset must equal letter-spacing / 2 at BOTH ends of the
//  keyframes, or the word drifts sideways as it resolves.
const kf = css.slice(css.indexOf('@keyframes mm-word-in'),
                     css.indexOf('}', css.indexOf('to {', css.indexOf('@keyframes mm-word-in'))) + 200);
const pairs = [...kf.matchAll(/letter-spacing:\s*([\d.]+)em[\s\S]{0,220}?translate\(calc\(-50% \+ ([\d.]+)em\)/g)]
  .map(function (m) { return [parseFloat(m[1]), parseFloat(m[2])]; });
ok('both keyframe ends were parsed', pairs.length === 2, JSON.stringify(pairs));
pairs.forEach(function (pr) {
  ok('offset is half the ' + pr[0] + 'em tracking',
    Math.abs(pr[1] - pr[0] / 2) < 0.001, pr[1] + 'em');
});
//  The animation's end state must equal the base rule, or the word
//  jumps the moment the animation hands control back.
const baseOff = parseFloat((word.match(/translate\(calc\(-50% \+ ([\d.]+)em\)/) || [])[1]);
ok('the animation lands on the base transform',
  Math.abs(baseOff - pairs[1][1]) < 0.001, baseOff + 'em vs ' + pairs[1][1] + 'em');

// ── Orange, the same one the court uses ──────────────────
ok('the wordmark carries the court orange', /#f26b21/.test(word));
ok('the court outline is that same orange',
  /\.mm-court-outline \{[^}]*stroke: #f26b21/.test(css));
//  White at the top, orange washing up from the baseline — a touch,
//  not an orange word.
ok('it is a wash, not a flat fill', /linear-gradient\(180deg[^;]*#f26b21 100%\)/.test(word));
ok('the gradient is clipped to the glyphs', /background-clip: text/.test(word));
/*  text-shadow paints behind the text box, and the fill is
    transparent for the gradient, so a shadow had nothing to cast
    from. The glow has to be a filter.                           */
ok('the glow survives the transparent fill', /filter:\s*drop-shadow/.test(word));
ok('no text-shadow glow that cannot render', !/text-shadow/.test(word));
//  A transparent fill with no clip support leaves an invisible word.
ok('there is a no-background-clip fallback',
  /@supports not \(\(-webkit-background-clip: text\)/.test(css));
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

/*  ══ No font-swap jump on the wordmark ════════════════════
    Reported: on mobile the word sits "slightly on the left for a
    fraction of a second and then it looks good."

    Cause: the stylesheet requests Barlow Condensed from Google
    Fonts with display=swap, so the first paint uses the fallback
    stack — 'Arial Narrow', system-ui — which is materially WIDER
    than Barlow Condensed. The word was laid out and centred at the
    fallback's width, then reflowed narrower the instant the
    webfont landed. Worst on a phone, where the font request
    competes with everything else on the connection.             */
ok('the stylesheet still uses display=swap', /display=swap/.test(html));
ok('gstatic is preconnected', /preconnect[^>]*fonts\.gstatic/.test(html));

const wordBase = css.slice(css.indexOf('.mm-intro-word {'), css.indexOf('.mm-glow {'));
ok('the word is hidden before its animation runs', /opacity:\s*0/.test(wordBase));
ok('it stays in layout while hidden',
  !/\.mm-intro-word \{[^}]*display:\s*none/.test(css) &&
  !/\.mm-intro-word \{[^}]*visibility:\s*hidden/.test(css));
//  A synthesised bold on the fallback is wider still.
ok('no faux-bold on the fallback', /font-synthesis:\s*none/.test(wordBase));

/*  ── The second attempt, and why it also failed ────────────
    The first fix held the word at visibility:hidden until the font
    resolved, capped at 1200ms. But the word's animation is cued at
    1050ms, so a font slower than a second meant visibility flipped
    150ms INTO a 450ms animation. The easing is front-loaded, so it
    appeared abruptly at ~85% progress — still low, still tracked
    open. The reflow had become a pop, which is what was still
    visible on the phone.

    The invariant now is arithmetic, not vibes: the reveal can
    never land mid-animation, because the gate is on the ANIMATION
    and its delay is recomputed to absorb however late the font
    was. These checks prove that property holds for every arrival
    time, rather than asserting the shape of one implementation. */
ok('the animation is gated on fonts-ready, not visibility',
  /#mmIntro\.playing\.fonts-ready \.mm-intro-word \{\s*animation: mm-word-in/.test(css));
ok('no rule reveals the word by visibility any more',
  !/visibility:\s*visible/.test(css.slice(css.indexOf('#mmIntro {'), css.indexOf('.mm-glow {'))));

const fontGate = app.slice(app.indexOf('var WORD_CUE_MS'), app.indexOf('if (fromInit && intro)'));
ok('the font load is kicked explicitly', /document\.fonts\.load\('600 1em "Barlow Condensed"'\)/.test(fontGate));
ok('the cue constant matches the CSS delay', (function () {
  const js = (fontGate.match(/WORD_CUE_MS = (\d+)/) || [])[1];
  const cssDelay = (css.match(/#mmIntro\.playing\.fonts-ready \.mm-intro-word \{\s*animation: mm-word-in [\d.]+s [^)]*\)\s*([\d.]+)s/) || [])[1];
  return js && cssDelay && Math.abs(Number(js) / 1000 - Number(cssDelay)) < 0.001;
})(), 'drifting these apart reintroduces the bug silently');
//  A font that never resolves must not mean a missing wordmark.
ok('the wait is capped', /setTimeout\(markReady, FONT_CAP_MS\)/.test(fontGate));
ok('the cap lands before the cue, not after', (function () {
  const cue = Number((fontGate.match(/WORD_CUE_MS = (\d+)/) || [])[1]);
  const cap = Number((fontGate.match(/FONT_CAP_MS = (\d+)/) || [])[1]);
  return cap < cue;
})(), 'a cap past the cue is exactly what caused the pop');
ok('markReady is idempotent', /if \(intro\._fontsMarked\) return;/.test(fontGate),
  'the race and the cap both call it');
ok('a rejected load still reveals it', /\.catch\(function \(\) \{ clearTimeout\(cap\); markReady\(\); \}\)/.test(fontGate));
ok('a browser with no Font Loading API still reveals it',
  /\} else \{\s*markReady\(\);/.test(fontGate));
ok('a throw inside markReady still applies the class',
  /catch \(e\) \{[\s\S]{0,200}classList\.add\('fonts-ready'\)/.test(fontGate),
  'the word is invisible without it');
ok('the play instant is stamped before .playing',
  /intro\._playAt = [\s\S]{0,80}\n\s*intro\.classList\.add\('playing'\)/.test(app));
ok('a replay clears the previous run\'s computed delay',
  /_w\.style\.animationDelay = '';/.test(app));

/*  Run the real delay arithmetic for every font arrival time and
    assert the animation never starts before its cue and never
    starts partway through. */
(function () {
  const cue = Number((fontGate.match(/WORD_CUE_MS = (\d+)/) || [])[1]);
  const cap = Number((fontGate.match(/FONT_CAP_MS = (\d+)/) || [])[1]);
  //  The one line that decides it, lifted verbatim.
  const expr = (fontGate.match(/var delay = (Math\.max\(0, WORD_CUE_MS - elapsed\));/) || [])[1];
  ok('the delay expression is liftable', !!expr, fontGate.slice(0, 80));
  if (!expr) return;
  const delayFor = new Function('WORD_CUE_MS', 'elapsed', 'return ' + expr + ';');

  let worstStart = 0, everMidFlight = false, everMissing = false;
  for (let fontAt = 0; fontAt <= 4000; fontAt += 10) {
    //  markReady runs at whichever comes first: the font, or the cap.
    const markAt = Math.min(fontAt, cap);
    const delay = delayFor(cue, markAt);
    const startsAt = markAt + delay;
    //  Invariant 1: never begins before the designed cue.
    if (startsAt < cue - 0.001) everMidFlight = true;
    //  Invariant 2: the element becomes animatable exactly when the
    //  animation begins, so it can never be revealed part-way.
    if (markAt > startsAt + 0.001) everMidFlight = true;
    //  Invariant 3: it always runs.
    if (!(startsAt >= 0 && isFinite(startsAt))) everMissing = true;
    worstStart = Math.max(worstStart, startsAt);
  }
  ok('the animation never starts before its cue, for any font arrival', !everMidFlight);
  ok('the word always animates, for any font arrival', !everMissing);
  //  The 450ms animation plus the worst start must finish inside the
  //  1700ms hold, or the word is still moving when the crossfade begins.
  ok('worst case still lands inside the 1.70s hold', worstStart + 450 <= 1700,
    'worst start ' + worstStart + 'ms -> ends ' + (worstStart + 450) + 'ms');
  ok('normal case lands exactly on the designed cue', delayFor(cue, 0) + 0 === cue,
    String(delayFor(cue, 0)));
})();

/*  Reduced motion must not clobber the computed delay. `animation:
    ... !important` as a shorthand sets animation-delay !important
    too, which beats the inline catch-up value — the fade would
    then start 1.0s after the class landed rather than 1.0s into
    the timeline, finishing after the intro had crossfaded away. */
(function () {
  /*  There is more than one reduced-motion block in this
      stylesheet now, and indexOf found an unrelated one. Anchor on
      the block that actually contains the intro rules. */
  const rmStart = css.lastIndexOf('@media (prefers-reduced-motion: reduce)',
    css.indexOf('#mmIntro.playing .mm-path'));
  ok('the intro reduced-motion block was located', rmStart > 0);
  const rm = css.slice(rmStart, css.indexOf('@keyframes mm-logo-rise'));
  const block = rm.slice(rm.indexOf('.mm-intro-word'), rm.indexOf('}', rm.indexOf('.mm-intro-word')) + 1);
  ok('reduced motion still shows the wordmark', /animation-name:\s*fade-in/.test(block));
  ok('reduced motion uses the same two-class gate',
    /#mmIntro\.playing\.fonts-ready \.mm-intro-word/.test(rm));
  ok('reduced motion does not force the delay',
    !/animation-delay:[^;]*!important/.test(block) && !/animation:\s*fade-in[^;]*!important/.test(block),
    'an !important delay overrides the catch-up');
})();

/*  The cap has to sit past the word's own cue but inside the hold,
    or a slow font either shows the word mid-flight for no reason
    or leaves it hidden when the crossfade starts.               */
const CAP = 1.2;
const wordCue = (function () {
  const m = tl.match(/mm-intro-word \{[\s\S]{0,160}?mm-word-in\s+[\d.]+s[^;]*?\s([\d.]+)s/);
  return m ? parseFloat(m[1]) : null;
})();
ok('the word cue was parsed', wordCue !== null, String(wordCue));
ok('the cap is past the word cue', CAP > wordCue, CAP + 's vs ' + wordCue + 's');
ok('the cap lands before the hold ends', CAP < hold, CAP + 's vs ' + hold + 's');

// ── Shipped ──────────────────────────────────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const b = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + b));
ok('no stale ?v=', (html.match(/\?v=(\d+)/g) || []).every(function (v) { return v === '?v=' + b; }));

console.log('\n  timeline ends ' + lastEnd.toFixed(2) + 's · hold ' + hold.toFixed(2) +
            's · fade ' + crossfade.toFixed(2) + 's · TOTAL ' + total.toFixed(2) + 's');
console.log('\n' + pass + '/' + (pass + fail) + ' intro checks pass');
process.exit(fail ? 1 : 0);
