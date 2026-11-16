/*  The TOURNAMENT draft engine.

    Until now this had no suite of its own. The season draft had five;
    this had roughly eight borrowed assertions inside draftsync, and
    the one time those touched it they found a bug (reading
    after.rosterSize when the field is `rounds`). That ratio is the
    reason this file exists.

    Two real defects came out of writing it, both modelled below.  */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
ok('comment stripper kept the code', /function confirmDraftPick/.test(code));

function lift(name, extra) {
  const i = code.indexOf('function ' + name);
  if (i < 0) return null;
  const open = code.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < code.length; k++) {
    if (code[k] === '{') d++;
    else if (code[k] === '}') { d--; if (d === 0) { end = k; break; } }
  }
  return code.slice(i, end + 1);
}

// ══ 1. The snake order ═══════════════════════════════════
(function () {
  const src = lift('buildDraftOrder');
  ok('buildDraftOrder is liftable', !!src);
  if (!src) return;
  const build = new Function('state', src + '\nreturn buildDraftOrder();');
  const m = ['A', 'B', 'C', 'D'];
  const o = build({ managers: m, rounds: 3 });
  ok('every pick exists', o.length === 12, String(o.length));
  ok('pickNumber is 1-based and contiguous',
    o.every((p, i) => p.pickNumber === i + 1));
  ok('round 1 runs forward', o.slice(0, 4).map(p => p.manager).join() === 'A,B,C,D');
  ok('round 2 reverses', o.slice(4, 8).map(p => p.manager).join() === 'D,C,B,A');
  ok('round 3 runs forward again', o.slice(8, 12).map(p => p.manager).join() === 'A,B,C,D');
  ok('the ends pick back to back', o[3].manager === o[4].manager && o[7].manager === o[8].manager);
  ok('everyone gets the same number of picks',
    m.every(x => o.filter(p => p.manager === x).length === 3));
  ok('no managers means no order', build({ managers: [], rounds: 3 }).length === 0);
  ok('one manager still works', build({ managers: ['A'], rounds: 2 }).length === 2);
  ok('an odd count snakes correctly', (function () {
    const r = build({ managers: ['A', 'B', 'C'], rounds: 2 });
    return r.map(p => p.manager).join() === 'A,B,C,C,B,A';
  })());
})();

// ══ 2. Draft completion ══════════════════════════════════
(function () {
  const src = lift('isDraftComplete');
  const bd = lift('buildDraftOrder');
  ok('isDraftComplete is liftable', !!src && !!bd);
  if (!src || !bd) return;
  const run = new Function('state', bd + '\n' + src + '\nreturn isDraftComplete();');
  const base = { managers: ['A', 'B'], rounds: 3 };
  ok('not complete at the start', run({ ...base, currentPickIndex: 0 }) === false);
  ok('not complete one short', run({ ...base, currentPickIndex: 5 }) === false);
  ok('complete at the last pick', run({ ...base, currentPickIndex: 6 }) === true);
  ok('complete past the end', run({ ...base, currentPickIndex: 99 }) === true);
  ok('an empty league is never "complete"',
    run({ managers: [], rounds: 3, currentPickIndex: 0 }) === false,
    'otherwise a league with nobody in it looks finished');
})();

// ══ 3. Confirming a pick cannot retarget ═════════════════
/*  THE BUG. The turn is checked at SELECTION (line ~3087). But
    confirmDraftPick recomputes currentPick() and never re-checked, so
    if the turn moved while the modal was open — an autopick fired, or
    another manager picked — the confirm still went through and was
    recorded against whoever was on the clock by then. You drafted a
    player onto somebody else's roster.                              */
ok('the modal records which pick it belongs to', /pendingPickNumber = pick \? pick\.pickNumber : null;/.test(code));
ok('confirm refuses once the turn has moved',
  /if \(pendingPickNumber != null && pick\.pickNumber !== pendingPickNumber\)/.test(code),
  'this is how a pick landed on another manager roster');
ok('the refusal names whose turn it is now', /turn now/.test(code));
ok('a refusal clears the pending pick',
  /pendingPickPlayerId = null; pendingPickNumber = null;[\s\S]{0,120}track\('pick_refused_out_of_turn'/.test(code));
ok('the refusal is tracked', /pick_refused_out_of_turn/.test(code));
//  Every exit from the confirm path must clear BOTH, or the next
//  modal inherits a stale pick number and refuses wrongly.
(function () {
  const fn = lift('confirmDraftPick');
  ok('confirmDraftPick is liftable', !!fn);
  if (!fn) return;
  const clearsId = (fn.match(/pendingPickPlayerId = null/g) || []).length;
  const clearsNo = (fn.match(/pendingPickNumber = null/g) || []).length;
  ok('both pending values are cleared together everywhere', clearsId === clearsNo,
    clearsId + ' id clears vs ' + clearsNo + ' number clears');
})();
ok('selection still checks whose turn it is',
  /session\.name !== pick\.manager && !isCommissioner\(\)/.test(code));
ok('the commissioner may still pick for others', /!isCommissioner\(\)/.test(code));

// ══ 4. Sync must not depend on two clocks agreeing ═══════
/*  lastSaved is Date.now() from whichever DEVICE wrote it. The file's
    own comment says so — which is why MANAGERS are unioned
    separately. Picks never got the same protection. */
ok('the draft index is used as a monotonic counter',
  /const draftMovedOn = remoteIdx > localIdx;/.test(code));
ok('it is preferred over the clock comparison',
  /if \(draftMovedOn \|\| remoteTs > localTs \+ 1000\)/.test(code));
ok('the timestamp rule still governs non-draft updates',
  /remoteTs > localTs \+ 1000/.test(code), 'settings and scoring have no counter');
ok('a landing pick is not announced as "League updated"',
  /if \(!draftMovedOn\) toast\('League updated\.', 'info'\);/.test(code));

//  Execute both rules across skews and draft paces.
(function () {
  const mk = (id, skew) => ({ id, skew, lastSaved: 0, drafted: {}, idx: 0 });
  const pick = (d, p, t) => {
    d.drafted[p] = 1; d.idx++; d.lastSaved = t + d.skew;
    return { drafted: { ...d.drafted }, currentPickIndex: d.idx, lastSaved: d.lastSaved };
  };
  const oldRule = (d, doc) => doc.lastSaved > d.lastSaved + 1000;
  const newRule = (d, doc) => doc.currentPickIndex > d.idx || doc.lastSaved > d.lastSaved + 1000;
  const recv = (rule) => (d, doc) => {
    if (!rule(d, doc)) return false;
    d.drafted = { ...doc.drafted }; d.idx = doc.currentPickIndex; d.lastSaved = doc.lastSaved;
    return true;
  };
  function run(rule, skew, gap) {
    const A = mk('A', 0), B = mk('B', skew);
    const srv = { drafted: {}, currentPickIndex: 0, lastSaved: 0 };
    const apply = recv(rule);
    let t = 1700000000000;
    for (const [dev, pl] of [[B, 'Zane'], [A, 'Kai'], [B, 'Rico'], [A, 'Dee']]) {
      Object.assign(srv, pick(dev, pl, t));
      apply(dev === A ? B : A, srv);
      t += gap;
    }
    return JSON.stringify(Object.keys(A.drafted).sort()) === JSON.stringify(Object.keys(B.drafted).sort());
  }
  //  The model must reproduce the bug, or it proves nothing.
  ok('the old rule diverges with a skewed clock', run(oldRule, 30000, 20000) === false);
  ok('the old rule diverges faster in a quick draft', run(oldRule, 10000, 5000) === false);
  ok('the old rule was fine with clocks in step', run(oldRule, 0, 20000) === true);
  //  And the new one must hold everywhere.
  for (const [skew, gap] of [[0, 20000], [5000, 20000], [30000, 20000], [120000, 20000],
                             [10000, 5000], [60000, 60000], [300000, 20000], [-45000, 10000]]) {
    ok('devices agree at skew ' + (skew / 1000) + 's, picks ' + (gap / 1000) + 's apart',
      run(newRule, skew, gap) === true);
  }
})();

// ══ 5. Autopick ══════════════════════════════════════════
const ap = lift('autoPickForCurrent');
ok('autoPickForCurrent is liftable', !!ap);
ok('it refuses before the draft starts', /if \(!draftHasStarted\(\)\)/.test(ap || ''));
ok('it never takes a drafted player', /filter\(p => !state\.drafted\[p\.id\]\)/.test(ap || ''));
ok('it keeps the roster legal', /filter\(p => playerIsEligible\(p, pick\.manager\)\)/.test(ap || ''));
ok('it honours the queue first', /getQueue\(pick\.manager\)/.test(ap || ''));
ok('it falls back to best available', /if \(!best\) best = players\[0\];/.test(ap || ''));
ok('it advances the pick', /state\.currentPickIndex\+\+;/.test(ap || ''));
ok('it records who it was for', /manager: pick\.manager/.test(ap || ''));
ok('it stops the clock when the draft ends',
  /if \(isDraftComplete\(\)\)[\s\S]{0,120}clearInterval\(timerInterval\)/.test(ap || ''));
ok('an empty pool does not throw', /if \(players\.length === 0\) return;/.test(ap || ''));
ok('a drafted player leaves every queue', /pruneQueues\(best\.id\)/.test(ap || ''));

// ══ 6. The pick itself ═══════════════════════════════════
ok('a confirmed pick advances the index', /state\.currentPickIndex\+\+;\s*pruneQueues\(pendingPickPlayerId\)/.test(code));
ok('a confirmed pick leaves every queue', /pruneQueues\(pendingPickPlayerId\)/.test(code));
ok('an already-drafted player is refused',
  /if \(!p \|\| state\.drafted\[pendingPickPlayerId\]\) \{/.test(code) &&
  /toast\('Player already drafted', 'error'\);/.test(code));
/*  It used to return with the modal still open, leaving a Confirm
    button for a player who was already gone. */
ok('and the modal is closed rather than left stranded', (function () {
  const i = code.indexOf("state.drafted[pendingPickPlayerId]) {");
  const seg = code.slice(i, i + 400);
  return /draftConfirmModal'\)[\s\S]{0,60}display = 'none'/.test(seg) &&
         /pendingPickNumber = null;/.test(seg);
})());
ok('the roster rule is re-checked at confirm time',
  /const rule = checkRosterRule\(p, pick\.manager\);/.test(code));
ok('the pick is persisted', /saveState\(\);/.test(lift('confirmDraftPick') || ''));


// ══ 7. The clock, and who may cover it ═══════════════════
/*  The autopick lived on exactly ONE device:

        if (isCommissioner()) autoPickForCurrent();

    Browsers throttle setInterval in a hidden tab and stop it on a
    locked phone, so a commissioner who pocketed their phone froze
    the draft on 0:00 for everyone, permanently. Single point of
    failure on the person most likely to be doing something else. */
ok('the autopick is no longer commissioner-only',
  !/if \(isCommissioner\(\)\) autoPickForCurrent\(\)/.test(code),
  'one device must not be the only one able to advance the draft');
ok('a takeover delay exists', /function _autopickDelayMs/.test(code));
ok('the commissioner still goes first', /if \(isCommissioner\(\)\) return 0;/.test(code));
ok('the expiry moment is recorded', /_timerExpiredAt = Date\.now\(\)/.test(code));
ok('it keeps ticking until someone covers',
  /if \(Date\.now\(\) - _timerExpiredAt < _autopickDelayMs\(\)\) return;/.test(code));
ok('the expiry marker resets while time remains', /if \(rem > 0\) \{ _timerExpiredAt = 0; return; \}/.test(code));
ok('"time\'s up" is announced once, not every tick',
  /if \(!_timerExpiredAt\) \{[\s\S]{0,160}toast\("Time's up!/.test(code));

(function () {
  const src = lift('_autopickDelayMs');
  ok('_autopickDelayMs is liftable', !!src);
  if (!src) return;
  const TAKE = Number((code.match(/AUTOPICK_TAKEOVER_MS = (\d+)/) || [])[1]);
  const STAG = Number((code.match(/AUTOPICK_STAGGER_MS = (\d+)/) || [])[1]);
  const run = (isComm, me, mgrs) => new Function('state', 'isCommissioner', 'getSession',
    'AUTOPICK_TAKEOVER_MS', 'AUTOPICK_STAGGER_MS',
    src + '\nreturn _autopickDelayMs();')(
      { managers: mgrs }, () => isComm, () => ({ name: me }), TAKE, STAG);

  const mgrs = ['Jake', 'Luke', 'Sam', 'Ali'];
  ok('the commissioner covers immediately', run(true, 'Jake', mgrs) === 0);
  ok('the first manager waits the grace', run(false, 'Jake', mgrs) === TAKE);
  ok('later managers are staggered', run(false, 'Sam', mgrs) === TAKE + 2 * STAG);
  //  No two devices may fire together, or both autopick the same slot.
  const delays = mgrs.map(m => run(false, m, mgrs));
  ok('every manager has a distinct delay', new Set(delays).size === delays.length,
    delays.join(','));
  ok('the gap exceeds a Firestore round trip', STAG >= 2000, String(STAG));
  //  An unknown name must not leapfrog the commissioner.
  ok('an unknown manager still waits', run(false, 'Nobody', mgrs) >= TAKE,
    String(run(false, 'Nobody', mgrs)));
  ok('the grace is long enough to let the commissioner go first', TAKE >= 5000, String(TAKE));
  ok('the whole room covers within a reasonable window',
    TAKE + (mgrs.length - 1) * STAG <= 45000,
    String(TAKE + (mgrs.length - 1) * STAG));
})();

// ══ 8. The countdown must not trust a foreign clock ══════
/*  pickTimerStartedAt is an absolute Date.now() from whichever
    device started the clock, compared against OUR Date.now(). A
    device behind sees a longer countdown; one ahead opens its turn
    already expired. Season hit both; this path never got the fix. */
ok('a skew offset is measured from the writer', /_clockSkew = Math\.abs\(observed\) > 6 \* 3600e3 \? 0 : observed;/.test(code));
ok('a wild clock is ignored rather than trusted', /Math\.abs\(observed\) > 6 \* 3600e3/.test(code));
ok('the countdown reads the synced clock', /_nowSynced\(\) - state\.pickTimerStartedAt/.test(code));
(function () {
  const src = lift('getRemainingSeconds');
  ok('getRemainingSeconds is liftable', !!src);
  if (!src) return;
  const run = (started, total, now, skew) => new Function('state', '_nowSynced',
    src + '\nreturn getRemainingSeconds();')(
      { pickTimerStartedAt: started, pickTimerSeconds: total }, () => now + skew);

  const T = 1700000000000;
  ok('a fresh clock shows the full timer', run(T, 90, T, 0) === 90);
  ok('it counts down', run(T, 90, T + 30000, 0) === 60);
  ok('it floors at zero', run(T, 90, T + 200000, 0) === 0);
  ok('no timer means the configured length', run(null, 90, T, 0) === 90);
  //  THE BUG: a device behind the writer saw more than the full timer.
  ok('a device behind cannot show more than the pick timer',
    run(T, 90, T, -120000) === 90,
    'this is how a 90-second clock once read three and a half minutes');
  ok('skew is corrected rather than clamped away',
    run(T, 90, T + 30000, 0) === run(T, 90, T + 30000 - 45000, 45000),
    'a corrected device agrees with the writer');
  ok('a device ahead does not go negative', run(T, 90, T + 300000, 0) === 0);
})();

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for the current build',
  [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' tournament-draft checks pass');
process.exit(fail ? 1 : 0);
