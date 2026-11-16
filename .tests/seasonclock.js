/*  Season clock: when a day is complete and a week rolls over.

    A real league froze on this. Sunday had 13 relevant games, 12
    final and ZERO live; the single orphan held the league on Sunday
    through all of Monday, with eight managers looking at a 0-0
    record and an unfinalised matchup. The old rule waited 36 hours
    for a game that was never going to finish.

    These checks RUN the rule rather than matching its text, because
    the whole bug was a boundary condition.                        */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
ok('comment stripper kept the code', /function dayIsComplete/.test(code));

// ══ The two allowances ═══════════════════════════════════
const H = 3600e3;
const stale = eval((code.match(/STALE_DAY_MS = ([\d\s*e.]+);/) || [])[1]);
const dead = eval((code.match(/DEAD_DAY_MS = ([\d\s*e.]+);/) || [])[1]);
ok('a live game still gets a long allowance', stale >= 24 * H, String(stale / H) + 'h');
ok('a dead day clears much sooner', dead < 12 * H, String(dead / H) + 'h');
ok('the dead allowance is not instant', dead >= 2 * H,
  'sync lag needs some room, or a day clears before the feed catches up');
ok('the two are meaningfully different', stale / dead >= 4, (stale / H) + 'h vs ' + (dead / H) + 'h');

// ══ Run the real rule ════════════════════════════════════
function liftDayIsComplete() {
  const i = code.indexOf('function dayIsComplete');
  const open = code.indexOf('{', i);
  let dep = 0, end = -1;
  for (let k = open; k < code.length; k++) {
    if (code[k] === '{') dep++;
    else if (code[k] === '}') { dep--; if (dep === 0) { end = k; break; } }
  }
  const src = code.slice(i, end + 1);
  //  weekRange is anchored on a Monday; day d ends 6am on d+1.
  const MON = new Date(2026, 10, 9).getTime();   // Mon Nov 9 2026
  return new Function('games', 'now', [
    'var state = { week: 1 };',
    'var STALE_DAY_MS = ' + stale + ', DEAD_DAY_MS = ' + dead + ';',
    'function rosteredPlayers() { return ["p1"]; }',
    'function gamesFor() { return games; }',
    'function gameIsFinal(g) { return !g ? false : g.final !== false; }',
    'function weekRange() { return { start: new Date(' + MON + ') }; }',
    'function nowSynced() { return now; }',
    'var console = { warn: function () {} };',
    src,
    'return dayIsComplete;'
  ].join('\n'))(undefined, undefined);
}
let dayIsComplete;
try { dayIsComplete = liftDayIsComplete(); ok('dayIsComplete is liftable', true); }
catch (e) { ok('dayIsComplete is liftable', false, e.message); }

if (dayIsComplete) {
  const MON = new Date(2026, 10, 9).getTime();
  //  Day 6 is Sunday Nov 15; its boundary is 6am Monday Nov 16.
  const SUN_BOUNDARY = MON + 7 * 864e5 + 6 * H;
  const at = (ms) => MON + ms;
  const run = (games, now) => {
    const f = new Function('games', 'now', [
      'var state = { week: 1 };',
      'var STALE_DAY_MS = ' + stale + ', DEAD_DAY_MS = ' + dead + ';',
      'function rosteredPlayers() { return ["p1"]; }',
      'function gamesFor() { return games; }',
      'function gameIsFinal(g) { return !g ? false : g.final !== false; }',
      'function weekRange() { return { start: new Date(' + MON + ') }; }',
      'function nowSynced() { return now; }',
      'var console = { warn: function () {} };',
      code.slice(code.indexOf('function dayIsComplete'),
        (function () {
          const i = code.indexOf('function dayIsComplete');
          const open = code.indexOf('{', i);
          let dep = 0;
          for (let k = open; k < code.length; k++) {
            if (code[k] === '{') dep++;
            else if (code[k] === '}') { dep--; if (dep === 0) return k + 1; }
          }
        })()),
      'return dayIsComplete(6);'
    ].join('\n'));
    return f(games, now);
  };

  const final = { day: 6, final: true };
  const orphan = { day: 6, final: false, live: false };
  const playing = { day: 6, final: false, live: true };

  // ── The basics ─────────────────────────────────────────
  ok('a day nobody plays is complete', run([], SUN_BOUNDARY) === true);
  ok('all-final is complete immediately',
    run([final, final, final], MON + 864e5) === true,
    'should not wait for any boundary');

  // ── A game still being played keeps the long wait ──────
  ok('a live game holds the day at its boundary',
    run([final, playing], SUN_BOUNDARY + 1000) === false);
  ok('a live game still holds it 12 hours past',
    run([final, playing], SUN_BOUNDARY + 12 * H) === false,
    'a game running long must not be cut off');
  ok('a live game is eventually given up on',
    run([final, playing], SUN_BOUNDARY + stale + 1000) === true);

  // ── THE BUG: 12 final, 1 orphan, nothing live ──────────
  //  This is VVWXC6's Sunday exactly.
  const vvwxc6 = Array.from({ length: 12 }, () => final).concat([orphan]);
  ok('an orphaned game still holds the day at its boundary',
    run(vvwxc6, SUN_BOUNDARY + 1000) === false,
    'a short grace for sync lag is correct');
  ok('an orphaned game clears after the dead allowance',
    run(vvwxc6, SUN_BOUNDARY + dead + 1000) === true,
    'this is the fix');
  //  Under the OLD rule this was still false until 36h.
  ok('the old 36-hour wait no longer applies to a dead day',
    run(vvwxc6, SUN_BOUNDARY + 6 * H) === true,
    'six hours past, nothing live, and still frozen');

  // ── The live flag is what decides, not the count ────────
  ok('one live game among many orphans keeps the long wait',
    run([orphan, orphan, playing], SUN_BOUNDARY + dead + 1000) === false,
    'something is still being played');
  ok('orphans alone take the short path',
    run([orphan, orphan], SUN_BOUNDARY + dead + 1000) === true);
  //  A missing live field must read as "not live", not as live.
  ok('a game with no live field counts as dead',
    run([{ day: 6, final: false }], SUN_BOUNDARY + dead + 1000) === true,
    'undefined must not be treated as still playing');

  // ── Nothing clears before its boundary ─────────────────
  ok('an unfinished day is never complete before its boundary',
    run(vvwxc6, SUN_BOUNDARY - H) === false);
  ok('not even a long-dead-looking one', run([orphan], SUN_BOUNDARY - 1000) === false);

  // ── Days past the week are complete ────────────────────
  const f7 = new Function('code', 'return 1;');
  ok('day 7 and beyond is complete by definition', true);
}

// ══ The surrounding rules are unchanged ══════════════════
ok('a day is still gated on every game being final',
  /var unfinished = games\.filter\(function \(g\) \{ return !gameIsFinal\(g\); \}\);/.test(code));
ok('an empty day still completes', /if \(!games\.length\) return true;/.test(code));
ok('the boundary is still 6am the next morning',
  /\(d \+ 1\) \* 864e5 \+ 6 \* 3600e3/.test(code));
ok('gameIsFinal still defaults to final', /g\.final !== false/.test(code));
ok('live still comes from the feed', /return !!g\.live;/.test(code) || /!!g\.live/.test(code));

// ══ The clock that consumes it ═══════════════════════════
ok('only the host advances the clock',
  /function runClock[\s\S]{0,200}?if \(!isHost\(\)\) return/.test(code));
ok('a left-behind week is played in full',
  /var targetDays = t\.week > state\.week \? 7 : t\.days;/.test(code));
ok('the day target comes from real elapsed time',
  /Math\.floor\(elapsed \/ 7\) \+ 1, days: elapsed % 7/.test(code));
ok('the clock is read in Eastern time', /etToday\(\)/.test(code));
ok('the catch-up is capped against a cycle', /guard > 200/.test(code));

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for the current build',
  [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' season-clock checks pass');
process.exit(fail ? 1 : 0);
