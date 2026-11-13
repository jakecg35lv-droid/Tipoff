/*  Games played before the draft finished must never score.

    THE BUG, as reported: a two-man league drafted on a Friday
    evening. The moment the draft completed, every player showed
    points for games played Wednesday and Thursday — before anyone
    owned them. Both teams read ~307 fantasy points for a week they
    had not participated in.

    THE CAUSE: preDraft and fpts are computed once, when a week is
    built, and then PERSISTED into state.games. isPreDraftGame()
    returns false whenever completedAt is null, so a week fetched
    DURING the draft froze every game as legal with its real points.
    Finishing the draft set completedAt but never re-asked.

    Nothing downstream re-checked either: seasonPoints() summed
    g.fpts with no preDraft test at all.                          */
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const season = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// ── Lift the real functions and run them ─────────────────
function build(stateObj) {
  const grab = function (startMark, endMark) {
    const a = season.indexOf(startMark);
    const b = season.indexOf(endMark, a);
    return season.slice(a, b);
  };
  const src =
    grab('function isPreDraftGame(g) {', '//  Turns the two collections') +
    grab('function remarkPreDraftGames() {', '//  Turns the two collections') +
    grab('function seasonPoints(pid) {', '// ── Rendering');
  const fn = new Function('state', 'weekRange', src +
    '\nreturn { isPreDraftGame, remarkPreDraftGames, seasonPoints };');
  return fn(stateObj, function () {
    return { start: new Date(2026, 10, 9) };   // Mon 9 Nov
  });
}

//  Draft finished Friday 13 Nov at 7pm.
const DRAFT_DONE = new Date(2026, 10, 13, 19, 0).getTime();
function game(dayOffset, hour, fpts) {
  return {
    day: dayOffset,
    time: new Date(2026, 10, 9 + dayOffset, hour).toISOString(),
    fpts: fpts,
    preDraft: false        // as stored by a build that ran mid-draft
  };
}

function makeState() {
  return {
    week: 1, day: 6,
    draft: { completedAt: DRAFT_DONE },
    games: {
      1: {
        p1: [
          game(2, 19, 38.0),   // Wed, before the draft  -> must not count
          game(3, 19, 42.5),   // Thu, before the draft  -> must not count
          game(5, 21, 12.0)    // Fri 9pm, AFTER         -> counts
        ]
      }
    }
  };
}

// ── The reported symptom ─────────────────────────────────
{
  const st = makeState();
  const api = build(st);
  const before = api.seasonPoints('p1');
  ok('pre-draft games no longer score',
    Math.abs(before.total - 12.0) < 0.001, 'got ' + before.total + ', expected 12');
  ok('they do not count as games played',
    before.gp === 1, 'gp ' + before.gp);
}

// ── The sweep heals already-stored data ──────────────────
{
  const st = makeState();
  const api = build(st);
  const n = api.remarkPreDraftGames();
  ok('the sweep finds the stale games', n === 2, 'fixed ' + n);
  const g = st.games[1].p1;
  ok('their points are zeroed', g[0].fpts === 0 && g[1].fpts === 0);
  ok('they are flagged', g[0].preDraft === true && g[1].preDraft === true);
  ok('the legal game is untouched', g[2].fpts === 12.0 && !g[2].preDraft);
  //  Only ever subtracts, so a double run cannot inflate a score.
  const again = api.remarkPreDraftGames();
  ok('the sweep is idempotent', again === 0, 'second run changed ' + again);
}

// ── A game that tips AFTER the draft always counts ───────
{
  const st = makeState();
  const api = build(st);
  //  Same calendar day as the draft, but six hours later.
  const later = game(4, 23, 30.0);
  ok('a later tip on the draft day counts', api.isPreDraftGame(later) === false);
  //  And one earlier the same day does not.
  const earlier = game(4, 9, 30.0);
  ok('an earlier tip on the draft day does not', api.isPreDraftGame(earlier) === true);
}

// ── Nothing voids while the draft is still running ───────
{
  const st = makeState();
  st.draft.completedAt = null;
  const api = build(st);
  ok('an unfinished draft voids nothing', api.remarkPreDraftGames() === 0);
  ok('isPreDraftGame is false with no completedAt',
    api.isPreDraftGame(game(2, 19, 38)) === false);
}

// ── Wiring: the sweep has to actually be called ──────────
ok('it runs when the draft completes',
  /completedAt = Date\.now\(\);[\s\S]{0,400}remarkPreDraftGames\(\)/.test(season));
ok('it runs when a week is stored',
  /state\.games\[week\] = built;[\s\S]{0,300}remarkPreDraftGames\(\)/.test(season));
//  Leagues that drafted before this fix exists never call
//  finalizeDraft again, so a week-start hook is what heals them.
ok('it runs on week start',
  /function startWeek\(\)[\s\S]{0,400}remarkPreDraftGames\(\)/.test(season));

// ── Read-time guards, so a stale flag cannot leak through ─
ok('seasonPoints re-checks live', /g\.preDraft \|\| isPreDraftGame\(g\)\) return;/.test(season));
ok('a pre-draft game cannot become lockable',
  /gameHasStarted\(g\)\) return;[\s\S]{0,200}isPreDraftGame\(g\)\) return;/.test(season));

// ── Shipped ──────────────────────────────────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build2 = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build2));
ok('no stale ?v= in index.html',
  (html.match(/\?v=(\d+)/g) || []).every(function (v) { return v === '?v=' + build2; }));

console.log('\n' + pass + '/' + (pass + fail) + ' pre-draft scoring checks pass');
process.exit(fail ? 1 : 0);
