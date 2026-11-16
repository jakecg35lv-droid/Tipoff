/*  Nothing may be clipped where the user cannot reach it.

    .main-content is display:flex with overflow-x:hidden. A flex item
    defaults to min-width:auto, so .page refused to shrink below its
    content's intrinsic width — and when it refused, the parent clipped
    it with no scrollbar. The cut-off text was simply unreachable.

    I could NOT reproduce this on the live build by sweeping widths
    from 400 to 1440: the trigger is content-dependent, which is
    exactly why it shows up on some news loads and not others. These
    checks pin the structural cause rather than one symptom.       */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
const scss = fs.readFileSync(path.join(ROOT, 'src/season/season.css'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
/*  CSS cascades, so a selector can be declared more than once and
    the later block wins. Returning only the FIRST match read
    .pool-table-wrap's background block and missed the second one
    that sets overflow-x:auto — reporting a correctly contained
    scroll container as unprotected. Concatenate them all. */
function rule(sheet, sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?:^|\\n)\\s*' + esc + '\\s*\\{([^}]*)\\}', 'g');
  let m, out = '';
  while ((m = re.exec(sheet))) out += m[1] + '\n';
  return out;
}

// ══ 1. The flex child can shrink ═════════════════════════
const page = rule(css, '.page');
ok('.page exists', page.length > 0);
ok('.page can shrink below its content', /min-width:\s*0/.test(page),
  'a flex item defaults to min-width:auto and will not shrink');

// ══ 2. The parent that would clip it ═════════════════════
const main = rule(css, '.main-content');
ok('.main-content is the clipping parent', /overflow-x:\s*hidden/.test(main));
/*  Keeping overflow-x:hidden is deliberate — it stops a stray wide
    element producing a horizontal scrollbar across the whole app.
    The fix is to stop content forcing the width, not to let the page
    scroll sideways. But it means any remaining overflow is INVISIBLE,
    so the shrink valve above is what makes it safe. */
ok('it is a flex container', /display:\s*flex/.test(main));

// ══ 3. Third-party text cannot set the layout width ══════
/*  Headlines come from ESPN. One unbreakable token — a hyphen-free
    name, a URL, a hashtag — would otherwise set the card's intrinsic
    width and push the page past the clip edge. */
for (const sel of ['.news-card-title', '.news-card-body', '.news-featured-title']) {
  ok(sel + ' breaks a long token', /overflow-wrap:\s*anywhere/.test(rule(css, sel)),
    rule(css, sel).trim().slice(0, 60));
}
ok('the news text column can still shrink',
  /min-width:\s*0/.test(rule(css, '.news-card-content')),
  'the image is fixed-width, so the text column must absorb the slack');
ok('the card clips its own overflow as a backstop',
  /overflow:\s*hidden/.test(rule(css, '.news-card')));

// ══ 4. The image cannot squeeze the text out ═════════════
const img = rule(css, '.news-card-img');
ok('the thumbnail has a fixed width', /width:\s*\d+px/.test(img));
ok('it does not shrink', /flex-shrink:\s*0/.test(img));
(function () {
  const w = parseFloat((img.match(/width:\s*([\d.]+)px/) || [])[1]);
  const gap = parseFloat((rule(css, '.news-card').match(/gap:\s*([\d.]+)px/) || [])[1]);
  //  On the narrowest phone the text column must still be usable.
  const narrow = 320 - 2 * 4;            // viewport minus the card's padding
  ok('text has room left at 320px', narrow - w - gap > 150,
    Math.round(narrow - w - gap) + 'px for text');
})();

// ══ 5. No other page-level element forces a width ════════
/*  A fixed min-width on anything inside .page re-creates the problem
    one level down. Catch a new one being added. */
/*  A wide min-width is only safe inside a scroll container: an
    element with overflow-x:auto has a min-content width of zero, so
    it does not propagate its children's intrinsic width upward. The
    draft pool uses exactly that pattern deliberately.

    Anything else with a page-sized minimum WILL force .page wide and
    get clipped. This is the tripwire for a new one. */
(function () {
  const CONTAINED = {
    //  Both live inside .pool-table-wrap, which is overflow-x:auto.
    '.pool-header': '.pool-table-wrap',
    '.pool-row': '.pool-table-wrap',
  };
  //  Verify the exemption is real rather than asserted.
  const wrap = rule(css, '.pool-table-wrap');
  ok('the draft pool really is inside a scroll container',
    /overflow-x:\s*auto/.test(wrap), wrap.trim().slice(0, 60));

  const offenders = [];
  const re = /(?:^|\n)\s*([^{@\n][^{\n]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim(), body = m[2];
    const mw = body.match(/min-width:\s*(\d+)px/);
    if (!mw) continue;
    if (+mw[1] < 600) continue;          // buttons, badges, cells
    const base = sel.split(/[\s,>]/)[0];
    if (CONTAINED[base]) continue;
    offenders.push(sel + ' (' + mw[1] + 'px)');
  }
  ok('nothing outside a scroll container sets a page-sized min-width',
    offenders.length === 0, offenders.join(' | '));
})();

// ══ 6. The season shell has the same protection ══════════
/*  The season module renders into its own shell, and the news page
    the report came from was a SEASON league. */
ok('season content can shrink too',
  /min-width:\s*0/.test(rule(scss, '.ss-shell')) || /min-width:\s*0/.test(rule(css, '.page')),
  'the season news feed renders inside .page, which is now fixed');

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for the current build',
  [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' overflow checks pass');
process.exit(fail ? 1 : 0);
