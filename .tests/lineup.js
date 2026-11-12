/*  Lineup-density checks.

    The lineup page was condensed so a twelve-man roster fits
    without scrolling. The risk in that change is bleed: the
    .ss-slot / .ss-bench-row / .ss-game classes are reused on
    other pages, so every compact rule has to stay scoped to the
    .ss-lineup wrapper, and the wrapper has to actually be
    emitted and closed.                                          */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/season/season.css'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// ── 1. The wrapper exists and is balanced ────────────────
const fn = js.slice(js.indexOf('function viewLineup()'));
const body = fn.slice(0, fn.indexOf('\n  // ── Matchup'));
ok('viewLineup opens an .ss-lineup wrapper', /return '<div class="ss-lineup">'/.test(body));

const ret = body.slice(body.indexOf("return '<div class=\"ss-lineup\">"));
const opens = (ret.match(/<div\b/g) || []).length;
const closes = (ret.match(/<\/div>/g) || []).length;
ok('lineup markup has balanced divs', opens === closes, opens + ' open vs ' + closes + ' close');

// The sub-views (rows, benchRows) are built above the return and
// interpolated in, so they are balanced on their own too.
for (const [label, src] of [['slot row', body.slice(body.indexOf('var rows = slots.map'), body.indexOf('var benchRows'))],
                            ['bench row', body.slice(body.indexOf('var benchRows'), body.indexOf('var hurt'))]]) {
  const o = (src.match(/<div\b/g) || []).length, c = (src.match(/<\/div>/g) || []).length;
  ok(label + ' divs balanced', o === c, o + ' vs ' + c);
}

// ── 2. Every compact rule is scoped ──────────────────────
const block = css.slice(css.indexOf('LINEUP: condensed'));
ok('compact block found in season.css', block.length > 500);

//  Comments in this block legitimately NAME the shared classes to
//  explain why they are scoped, so strip them before scanning —
//  otherwise the checks below fail on their own documentation.
const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^]*?\*\//, '');

const selectors = code
  .split('}')
  .map(s => s.split('{')[0].trim())
  //  .ss-bench-ct is new to this page, so it needs no scoping —
  //  but only as long as nothing else ever renders one.
  .filter(s => s && !s.startsWith('@') && !s.startsWith('.ss-lineup') && s !== '.ss-bench-ct');
ok('no unscoped selectors in the compact block', selectors.length === 0, selectors.join(' | '));
ok('.ss-bench-ct is rendered only by the lineup page',
  (js.match(/class="ss-bench-ct"/g) || []).length === 1);

// The specific classes that are shared with other pages.
for (const shared of ['.ss-slot', '.ss-bench-row', '.ss-game', '.ss-card', '.ss-pl-name', '.ss-st-pts']) {
  //  (?![\w-]) rather than \b: \b matches between "t" and "-", so
  //  .ss-slot-k would otherwise read as an unscoped .ss-slot.
  const re = new RegExp('(^|[,\\s])\\' + shared + '(?![\\w-])', 'm');
  const unscoped = code.replace(/\.ss-lineup [^{]*/g, '').match(re);
  ok('shared class ' + shared + ' never restyled unscoped', !unscoped);
}

// ── 3. Mobile keeps the score beside the player ──────────
const mobile = block.slice(block.indexOf('@media (max-width: 768px)'));
ok('mobile block present', mobile.length > 200);
//  The score is lifted out of the flow on mobile. If it ever goes
//  back into a grid cell the player column starves and the name
//  truncates to one letter, which is what the first attempt did.
ok('mobile lifts the score out of the flow',
  /\.ss-lineup \.ss-st \{[^}]*position:\s*absolute/.test(mobile));
ok('mobile reserves a gutter for it',
  /\.ss-lineup \.ss-slot-main \{[^}]*padding-right:\s*\d+px/.test(mobile));
const gutter = parseFloat((mobile.match(/\.ss-lineup \.ss-slot-main \{[^}]*padding-right:\s*([\d.]+)px/) || [])[1]);
const stw = parseFloat((mobile.match(/\.ss-lineup \.ss-st \{[^}]*width:\s*([\d.]+)px/) || [])[1]);
ok('gutter is wider than the score block', gutter > stw, gutter + ' vs ' + stw);
ok('mobile row is held open for the score block',
  /\.ss-lineup \.ss-slot \{[^}]*min-height:\s*7[0-9]px/.test(mobile));
ok('mobile drops the long status note',
  /\.ss-lineup \.ss-st-note \{[^}]*display:\s*none/.test(mobile));
ok('mobile chips scroll instead of wrapping',
  /\.ss-lineup \.ss-games \{[^}]*flex-wrap:\s*nowrap/.test(mobile) &&
  /\.ss-lineup \.ss-games \{[^}]*overflow-x:\s*auto/.test(mobile));
ok('Swap keeps its width against the scrolling chips',
  /\.ss-lineup \.ss-slot-main \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/.test(mobile));

// Bench: chips at desktop width, a game count on a phone.
ok('bench chips drop weekday and opponent at every width',
  /\.ss-lineup \.ss-bench-row \.ss-game b,[\s\S]{0,80}?\.ss-game u \{[^}]*display:\s*none/.test(code));
ok('bench count is hidden by default', /\.ss-bench-ct \{[^}]*display:\s*none/.test(code));
ok('bench swaps chips for the count on mobile',
  /\.ss-bench-row \.ss-games \{[^}]*display:\s*none/.test(mobile) &&
  /\.ss-bench-row \.ss-bench-ct \{[^}]*display:\s*inline-block/.test(mobile));
ok('viewLineup emits the bench count', /class="ss-bench-ct"/.test(body));
//  The count has to come from the same source the chips do, or the
//  phone shows a different number of games than the desktop.
ok('bench count comes from gamesFor', /var bg = gamesFor\(id\)\.length;/.test(body));

// Wide screens get a third bench column; its first row must also
// lose the top border, or the grid shows a stray rule.
const wide = block.slice(block.indexOf('@media (min-width: 1100px)'), block.indexOf('@media (max-width: 768px)'));
ok('wide screens use three bench columns', /grid-template-columns:\s*repeat\(3, 1fr\)/.test(wide));
ok('three-column bench fixes its first-row borders', /nth-child\(-n\+4\)[^}]*border-top:\s*0/.test(wide));

// ── 4. It is actually smaller than the base sizing ───────
function num(src, sel, prop) {
  const m = src.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*' + prop + ':\\s*([\\d.]+)px'));
  return m ? parseFloat(m[1]) : null;
}
const basePad = num(css, '.ss-slot', 'padding');
const litePad = num(block, '.ss-lineup .ss-slot', 'padding');
ok('slot padding reduced', basePad != null && litePad != null && litePad < basePad, basePad + ' -> ' + litePad);

const basePts = num(css, '.ss-st-pts', 'font-size');
const litePts = num(block, '.ss-lineup .ss-st-pts', 'font-size');
ok('score type reduced', basePts != null && litePts != null && litePts < basePts, basePts + ' -> ' + litePts);
ok('score type still legible', litePts >= 18, String(litePts));

const liteName = num(block, '.ss-lineup .ss-pl-name', 'font-size');
ok('player name still at least 14px', liteName >= 14, String(liteName));

// ── 5. Version bumped with the CSS change ────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cache = (sw.match(/CACHE_NAME = 'tipoff-v(\d+)'/) || [])[1];
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME and BUILD agree', cache && cache === build, cache + ' vs ' + build);
ok('season.css requested at the current build', html.includes('season/season.css?v=' + build));
ok('no stale ?v= left in index.html',
  (html.match(/\?v=(\d+)/g) || []).every(v => v === '?v=' + build));

console.log('\n' + pass + '/' + (pass + fail) + ' lineup checks pass');
process.exit(fail ? 1 : 0);
