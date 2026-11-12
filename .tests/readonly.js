/*  The bracket is read-only. Results come from the feed, full stop.

    What was removed: tapping a team set it as the winner and stored
    that in state.bracketOverrides, which applyAutoAdvance() then
    treated as higher priority than ESPN. A wrong tap was permanent —
    the feed was explicitly forbidden from correcting it, which is how
    a Maui first-round game ended up pinned to the wrong team with a
    banner proudly explaining that live data would not fix it.       */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

//  Comments deliberately name the removed functions to explain why
//  they are gone, so scan the code with comments stripped.
const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');

// ── Nothing can set a winner by hand ─────────────────────
['setBracketOverride', 'isOverriddenSlot', 'clearAllBracketOverrides',
 'wireBracketOverrideClicks'].forEach(function (fn) {
  ok(fn + ' is gone', code.indexOf(fn) === -1);
});
ok('no click handler on bracket rows',
  !/br-team\[data-team\]/.test(code));
ok('bracket rows carry no team data attribute', !/data-team="'\s*\+\s*esc\(team\.name\)/.test(code));

// ── applyAutoAdvance reads ONLY the feed ─────────────────
const adv = code.slice(code.indexOf('function applyAutoAdvance'),
                       code.indexOf('function listenToLiveStats'));
ok('applyAutoAdvance found', adv.length > 200);
ok('it no longer consults overrides', !/overrides/.test(adv));
ok('it only advances completed games',
  /g\.completed && g\.winnerSchool/.test(adv));
ok('an unfinished matchup advances nobody', /winners\[m\] = null/.test(adv));
//  Rebuilding, not patching: a round-1 result changes round 2.
ok('each round feeds the next', /for \(let i = 0; i < winners\.length; i \+= 2\)/.test(adv));
ok('it redraws after applying', /renderBracket\(\)/.test(adv));

// ── Renderer is display-only ─────────────────────────────
const reg = code.slice(code.indexOf('function renderRegionSimple'),
                       code.indexOf('function makeFinalFourTeam'));
ok('renderRegionSimple is read-only', /const canEdit = false/.test(reg));
ok('no clickable class is emitted', !/br-clickable/.test(reg));
ok('no override marker is emitted', !/br-override/.test(reg));

// ── Existing leagues get cleaned up ──────────────────────
//  Overrides were synced to the server, so a league that already has
//  one would keep showing a wrong winner with no UI left to clear it.
const bar = code.slice(code.indexOf('function renderBracketOverrideBar'),
                       code.indexOf('function renderLiveScores'));
ok('stale overrides are cleared on render',
  /state\.bracketOverrides = \{\}/.test(bar) && /saveState\(\)/.test(bar));
ok('clearing triggers a recompute from the feed', /applyAutoAdvance\(\)/.test(bar));
ok('the banner no longer offers a manual revert',
  !/Revert to live data/.test(code) && !/set manually/.test(code));
ok('it states where results come from',
  /Results update automatically from live scores/.test(bar));

// ── Round robins: fixtures with live results ─────────────
const fx = code.slice(code.indexOf('function renderFixtureList'), code.indexOf('function _sameSchool'));
ok('fixture list reads live games', /_liveGames/.test(fx));
ok('fixtures show the score', /fx-score/.test(fx));
ok('fixtures distinguish final from in-progress',
  /fx-final/.test(fx) && /fx-live/.test(fx));
//  Before tip there is no score, so it must fall back to tip time.
ok('fixtures fall back to tip time', /g\.time, g\.tv/.test(fx));
ok('pod events route to the fixture list',
  /fmt === 'pod' \|\| fmt === 'doubleheader' \|\| fmt === 'group6'/.test(code));

// ── Dead styles removed ──────────────────────────────────
['br-clickable', 'br-override', 'bracket-override-bar', 'bov-clear'].forEach(function (c) {
  ok('.' + c + ' styles removed', cssCode.indexOf(c) === -1);
});
ok('the status hint keeps its styles', /\.bracket-edit-hint \{/.test(cssCode));

// ── Shipped ──────────────────────────────────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build));
ok('no stale ?v= in index.html',
  (html.match(/\?v=(\d+)/g) || []).every(function (v) { return v === '?v=' + build; }));

console.log('\n' + pass + '/' + (pass + fail) + ' read-only bracket checks pass');
process.exit(fail ? 1 : 0);
