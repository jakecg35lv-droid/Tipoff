/*  Setup-wizard checks.

    The bug this suite exists to prevent: a step that is only a
    title and a sentence, sitting inside a card with a fixed
    height floor, which rendered as ~300px of empty navy above
    the Continue button. Two halves to that — the card must not
    force a height, and no step may be content-free.            */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const season = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

function rule(src, sel) {
  const m = src.match(new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
}

// ── 1. The card must size to its content ─────────────────
const cardRule = rule(css, '.tut-card');
ok('card rule found', cardRule.length > 0);
ok('card no longer forces a height', !/min-height/.test(cardRule), cardRule.trim().slice(0, 80));
ok('card still caps at the viewport', /max-height:\s*calc\(100dvh/.test(cardRule));
//  A flex:1 body inside a fixed-height card is what turned the
//  missing content into a visible hole, so the body must not
//  stretch either.
const bodyRule = rule(css, '.tut-body');
ok('body does not stretch to fill', !/flex:\s*1/.test(bodyRule), bodyRule.trim().slice(0, 60));

// The mobile card had its own floor.
const mob = css.slice(css.indexOf('@media (max-width: 480px)'));
const mobCard = rule(mob.slice(0, 1200), '.tut-card');
ok('mobile card has no height floor either', !/min-height/.test(mobCard), mobCard.trim().slice(0, 60));

// ── 2. No step may be title-and-sentence only ────────────
const stepsSrc = app.slice(app.indexOf('const TUT_STEPS = ['), app.indexOf('let tutData'));
const stepLines = stepsSrc.split('\n').filter(l => /\{\s*type:/.test(l));
ok('all nine tournament steps parsed', stepLines.length === 9, String(stepLines.length));

const CONTENT_KEYS = ['input:', 'size:', 'code:', 'checklist:', 'scoreGrid:', 'summary:', "type: 'tournament'"];
const bare = stepLines
  .filter(l => !CONTENT_KEYS.some(k => l.includes(k)))
  .map(l => (l.match(/title: ['"]([^'"]+)/) || [])[1]);
ok('no tournament step is content-free', bare.length === 0, bare.join(' | '));

// Season wizard: same rule for its welcome step.
const seasonSteps = season.slice(season.indexOf('function wizSteps()'), season.indexOf('function setupConfs'));
ok('season welcome step carries a checklist',
  /id: 'welcome'[^}]*checklist:\s*true/.test(seasonSteps));

// ── 3. The new blocks actually render ────────────────────
const render = app.slice(app.indexOf('function renderTutStep()'), app.indexOf('// ── HELPERS'));
ok('checklist renders', /if \(step\.checklist\)/.test(render) && /tut-list-row/.test(render));
ok('scoring grid renders', /if \(step\.scoreGrid\)/.test(render) && /tut-score-cell/.test(render));
ok('summary renders', /if \(step\.summary\)/.test(render));
ok('season checklist renders', /if \(step\.checklist\)/.test(season) && /tut-list-row/.test(season));

//  The summary is a confirmation, so it has to read the user's
//  real answers rather than restate the defaults.
for (const [label, re] of [
  ['league name', /tutData\.leagueName/],
  ['tournament', /tutData\.tournamentId/],
  ['managers', /tutData\.maxManagers/],
  ['rounds', /tutData\.rounds/],
  ['timer', /tutData\.timerMin/],
  ['join code', /state\.leagueCode/]
]) {
  const sum = render.slice(render.indexOf('if (step.summary)'), render.indexOf('if (step.input)'));
  ok('summary reports the real ' + label, re.test(sum));
}
//  Values come from the user, so they go through esc().
const sumBlock = render.slice(render.indexOf('if (step.summary)'), render.indexOf('if (step.input)'));
ok('summary escapes its values', /esc\(String\(r\[1\]\)\)/.test(sumBlock));

// Every class the renderers emit must exist in the stylesheet.
for (const cls of ['tut-list', 'tut-list-row', 'tut-list-n', 'tut-list-t', 'tut-list-v',
                   'tut-score-grid', 'tut-score-cell', 'tut-note']) {
  ok('.' + cls + ' is styled', css.includes('.' + cls + ' {') || css.includes('.' + cls + ' b'));
}

// ── 4. Footer layout ─────────────────────────────────────
//  Back is display:none on step 1, not visibility:hidden — a
//  hidden flex item still holds its box, which left the primary
//  button floating beside an empty gap.
ok('Back is removed from the flow on step 1',
  /backBtn\.style\.display = tutStep === 0 \? 'none'/.test(render));
ok('no visibility toggle left behind', !/backBtn\.style\.visibility/.test(render));

// ── 5. One accent colour ─────────────────────────────────
const nextRule = rule(css, '.tut-next-btn');
ok('primary button is a single solid colour', !/gradient/.test(nextRule), nextRule.trim().slice(0, 70));
ok('primary button is brand orange', /background:\s*var\(--orange\)/.test(nextRule));
ok('no purple anywhere in the wizard',
  !/7c5af7/i.test(css.slice(css.indexOf('SETUP WIZARD'), css.indexOf('── TOAST'))));

// Tap targets stay legal.
ok('primary button clears 42px', /min-height:\s*4[2-9]px|min-height:\s*[5-9]\dpx/.test(nextRule));
ok('back button clears 42px', /min-height:\s*4[2-9]px|min-height:\s*[5-9]\dpx/.test(rule(css, '.tut-back-btn')));

// ── 6. Shipped ───────────────────────────────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes("tipoff-v" + build));
ok('styles.css requested at the current build', html.includes('src/styles.css?v=' + build));
ok('no stale ?v= in index.html',
  (html.match(/\?v=(\d+)/g) || []).every(v => v === '?v=' + build));


// ── 7. Tournament picker: counts and duplicate names ─────
//  Every event carries `seededTeams: []` and an empty array is
//  truthy, so the old ternary chain always took the first branch
//  and printed "0 teams" on every card.
const fsx = require('fs');
const srcx = app;
const ti = srcx.indexOf('const TOURNAMENTS');
const tend = srcx.indexOf('\n};', ti) + 3;
const hi = srcx.indexOf('function tournamentTeamCount');
const hend = srcx.indexOf('let tutData', hi);
const tmp = path.join(require('os').tmpdir(), 'tipoff-tourn-' + process.pid + '.js');
fsx.writeFileSync(tmp, srcx.slice(ti, tend) + '\n' + srcx.slice(hi, hend) +
  '\nmodule.exports={TOURNAMENTS,tournamentTeamCount};');
const T = require(tmp);
fsx.unlinkSync(tmp);

const selectable = [];
Object.values(T.TOURNAMENTS).forEach(function (g) {
  g.forEach(function (t) { if (!t.comingSoon && t.canSelect !== false) selectable.push(t); });
});
ok('picker has selectable events', selectable.length > 0, String(selectable.length));

const zero = selectable.filter(function (t) { return T.tournamentTeamCount(t) === 0; }).map(function (t) { return t.id; });
ok('no selectable event reports zero teams', zero.length === 0, zero.join(', '));

//  The count must match the data, not just be non-zero.
const byId = {};
selectable.forEach(function (t) { byId[t.id] = T.tournamentTeamCount(t); });
ok('Maui counts 8', byId['maui-2026'] === 8, String(byId['maui-2026']));
ok('Atlantis counts 8 from its pods', byId['b4a-2026'] === 8, String(byId['b4a-2026']));
ok('Adventure bracket counts 6', byId['etsc-adventure-2026'] === 6, String(byId['etsc-adventure-2026']));
ok('Magic bracket counts 4', byId['etsc-magic-2026'] === 4, String(byId['etsc-magic-2026']));

//  An empty seededTeams array must not win over a real team list.
ok('empty seededTeams does not shadow teams',
  T.tournamentTeamCount({ seededTeams: [], teams: ['a', 'b', 'c'] }) === 3);
ok('seeds win when they exist',
  T.tournamentTeamCount({ seededTeams: [1, 2], teams: ['a', 'b', 'c'] }) === 2);
ok('unknown returns 0 so the caller can omit it',
  T.tournamentTeamCount({ seededTeams: [], teams: [] }) === 0);
ok('picker omits the count rather than printing zero',
  /\(n \? ' · ' \+ n \+ ' teams' : ''\)/.test(render));

//  Duplicate names need a distinguishing tag; unique names must not
//  get one, or Maui reads "Maui Invitational [Southwest Maui
//  Invitational]".
const names = {};
selectable.forEach(function (t) { names[t.name] = (names[t.name] || 0) + 1; });
const dupeNames = Object.keys(names).filter(function (n) { return names[n] > 1; });
ok('duplicate-named events exist to disambiguate', dupeNames.length > 0, dupeNames.join(', '));
dupeNames.forEach(function (n) {
  const missing = selectable.filter(function (t) { return t.name === n && !t.subtitle; });
  ok('every "' + n + '" has a subtitle to tag with', missing.length === 0);
});
ok('tag is gated on the name being duplicated', /var dupe = available\.filter|const dupe = available\.filter/.test(render));
ok('ttc-tag is styled', css.includes('.ttc-tag {'));


console.log('\n' + pass + '/' + (pass + fail) + ' wizard checks pass');
process.exit(fail ? 1 : 0);
