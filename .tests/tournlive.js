/*  Three defects from the first live tournament draft, 23 Nov 2026.

    1. Teams & Rosters showed "166.2 Fantasy Points" before a single
       Feast Week game had tipped. calcFPTS summed player.stats, and
       the pool seeded player.stats from data/players.js, whose
       numbers are LAST SEASON'S PER-GAME AVERAGES. Not a crash — a
       confident, wrong score, which a league believes.

    2. The tournament stat feed counted any game involving a watched
       school. Those schools also play ordinary season games during
       Thanksgiving week, so tournament scoring was absorbing the
       regular season. And school -> tournament was a single-value
       map, so when Feast Week and Maui were both active the second
       one written silently took every shared school.

    3. tickTimer() set state.timerRunning = false and then called
       autoPickForCurrent(), which only re-arms the clock `else if
       (state.timerRunning)`. Never true. Every auto-pick stopped the
       draft and the commissioner had to press Start for each round.

    All three are invisible in a screenshot that looks fine. That is
    what these checks are for.                                      */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const fns = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const A = strip(app), F = strip(fns);

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n)) : (fail++, console.log('FAIL  ' + n + (d ? '  -> ' + d : ''))); };

ok('stripper works', !/confident, wrong score/.test(A + F));

// ══ 1. Earned and projected are different numbers ════════
ok('there are two separate functions', /function calcFPTS\(/.test(A) && /function seasonFPTS\(/.test(A));
ok('calcFPTS reads the EARNED column', /function calcFPTS\([\s\S]{0,200}player\.stats/.test(A));
ok('seasonFPTS reads the RATE', /function seasonFPTS\([\s\S]{0,200}player\.seasonAvg/.test(A));

ok('the pool zeroes earned points on build',
  /p\.stats = \{ points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 \};/.test(A),
  'this single line is the whole bug: stats was seeded from last season');
ok('the rate is copied out BEFORE the zeroing',
  A.indexOf('p.seasonAvg = {') < A.indexOf('p.stats = { points: 0'),
  'zero first and the rate is gone forever');
ok('games played starts at zero too', /p\._gamesPlayed = 0;/.test(A));

//  The draft board cannot sort on a column that is all zeroes.
ok('the draft board sorts on the rate', /poolSortCol === 'fpts'\) \{ va = seasonFPTS\(a\); vb = seasonFPTS\(b\)/.test(A));
ok('the secondary sort too', /effectiveCol === 'fpts'\) \{ va = seasonFPTS\(a\); vb = seasonFPTS\(b\)/.test(A));
ok('the card grid sorts on the rate', /players\.sort\(\(a, b\) => seasonFPTS\(b\) - seasonFPTS\(a\)\)/.test(A));
ok('and its per-stat sort reads seasonAvg, not stats',
  /\(\(b\.seasonAvg \|\| \{\}\)\[col\] \|\| 0\) - \(\(a\.seasonAvg \|\| \{\}\)\[col\] \|\| 0\)/.test(A),
  'sorting by points on an all-zero column shuffles the board at random');

ok('the draft confirm dialog shows the scouting line',
  /const avg = p\.seasonAvg \|\| \{\};[\s\S]{0,200}val: avg\.points/.test(A),
  'reading p.stats there would show a wall of noughts next to every name');

//  Totals must stay EARNED. If any of these flip to seasonFPTS the
//  original bug is back, wearing a different name.
ok("a manager's total is earned, not projected",
  /function managerFPTS[\s\S]{0,300}total \+= calcFPTS\(p\)/.test(A));
ok('the team card roster is earned', /const pfpts = calcFPTS\(p\);/.test(A));
ok('the season archive records earned', /position: p\.position, fpts: calcFPTS\(p\)/.test(A));

// ══ 2. Tournament feed ≠ season feed ═════════════════════
ok('school maps to EVERY claiming tournament', /const schoolToTourns = \{\};/.test(F),
  'a single-value map let one event silently steal another events schools');
ok('tournaments accumulate per school', /\(schoolToTourns\[k\] = schoolToTourns\[k\] \|\| \[\]\)\.push\(tournId\)/.test(F));

ok('a game needs BOTH teams in the same field',
  /const shared = sideA\.filter\(id => sideB\.indexOf\(id\) !== -1\);/.test(F),
  'either-side matching scores ordinary season games as tournament games');
ok('and is skipped otherwise', /if \(!shared\.length\) \{/.test(F));
ok('the skip is counted, not silent', /report\.skippedNonTournament\+\+/.test(F));
ok('the counter is initialised', /skippedNonTournament: 0,/.test(F));

ok('game docs are written to every claiming event', /shared\.forEach\(function \(tid\) \{/.test(F));
ok('player lines are too', /tIds\.forEach\(function \(id\) \{/.test(F));
ok('a school only scores for events that claim BOTH teams',
  /\(schoolToTourns\[normName\(school\)\] \|\| \[\]\)\.filter\(function \(id\) \{\s*return shared\.indexOf\(id\) !== -1;/.test(F));

//  The season feed must stay the opposite: every game its schools play.
const seasonFn = F.slice(F.indexOf('async function runSeasonSyncESPN'), F.indexOf('exports.syncSeasonFixtures'));
ok('the SEASON feed still matches on either side',
  /const touches = competitors\.some\(c => SEASON_SCHOOLS\.has\(normName\(c\.school\)\)\);/.test(seasonFn),
  'season scoring wants every game, which is exactly why it is a separate function');
ok('the two feeds write to different collections',
  /seasonStats/.test(seasonFn) && !/tournamentStats/.test(seasonFn));
ok('and run on different schedules',
  /schedule: 'every 5 minutes'/.test(F) && /schedule: 'every 10 minutes'/.test(F));

// ══ 3. The clock survives an auto-pick ═══════════════════
const tick = A.slice(A.indexOf('function tickTimer()'), A.indexOf('function updateTimerDisplay()'));
ok('found tickTimer', tick.length > 200);
ok('it no longer stops the clock before auto-picking',
  !/state\.timerRunning = false;\s*\n\s*_timerExpiredAt = 0;\s*\n\s*updateTimerBtnState\(\);\s*\n\s*autoPickForCurrent\(\);/.test(tick),
  'that exact order is what made every round need a manual start');
ok('auto-pick is called while the clock is still armed',
  tick.indexOf('autoPickForCurrent()') < tick.indexOf('state.timerRunning = false'),
  'autoPickForCurrent only re-arms the clock when timerRunning is true');
ok('auto-pick re-stamps the clock for the next manager',
  /\} else if \(state\.timerRunning\) \{\s*\n\s*state\.pickTimerStartedAt = Date\.now\(\);/.test(A));

ok('a stalled auto-pick stops the clock instead of spinning',
  /if \(state\.currentPickIndex === idxBefore\) \{/.test(tick),
  'leaving it armed re-fires every tick: the 20-second lockup, again');
ok('and says so rather than freezing silently',
  /Auto-pick could not complete/.test(tick));
ok('a finished draft still stops the clock', /\} else if \(isDraftComplete\(\)\) \{/.test(tick));
ok('progress is measured, not assumed', /const idxBefore = state\.currentPickIndex;/.test(tick));

// ══ 4. Build hygiene ═════════════════════════════════════
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for it', [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' tournament live checks pass');
process.exit(fail ? 1 : 0);
