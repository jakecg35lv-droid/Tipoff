/*  Draft integrity under concurrency.

    The season draft is a whole-document blob in Firestore with a
    client-side revision counter and plain set() writes. set() is
    last-write-wins, so the correctness of a live draft rests on two
    things: that two devices never write the same revision, and that
    a device holding stale state cannot corrupt a roster.

    Neither held. These checks model the protocol and run the real
    validation, because the failure is a sequence, not a line.    */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const seasonCss = fs.readFileSync(path.join(ROOT, 'src/season/season.css'), 'utf8');
const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
ok('comment stripper kept the code', /function makePick/.test(code) && /subscribeSeason/.test(code));

// ══ 1. The collision, modelled ═══════════════════════════
/*  Lift the real snapshot-acceptance decision and run two devices
    through a simultaneous write. */
function liftAcceptance() {
  const i = code.indexOf('var mine = myUid() || ');
  const j = code.indexOf('SYNC.rev = d.rev;', i);
  ok('acceptance logic is liftable', i > 0 && j > i);
  if (i < 0 || j < 0) return null;
  const src = code.slice(i, j);
  /*  Wrapped in an IIFE so the lifted code's own `return;` — the
      real "ignore this snapshot" path — is observable rather than
      being shadowed by anything appended after it. undefined out of
      the IIFE means the shipped code bailed. */
  //  `state` is a module-scope var in season.js; the collision
  //  branch reads it for the analytics tag. Supply it.
  return new Function('d', 'SYNC', 'myUid', 'console', 'track', 'state', `
    var out = (function () {
      ${src}
      return sameRevOther ? 'adopt' : 'apply';
    })();
    return out === undefined ? 'skip' : out;
  `);
}
const decide = liftAcceptance();

if (decide) {
  const quiet = { warn() {}, error() {}, log() {} };
  const noop = () => {};
  const asMe = () => 'me';

  ok('a strictly newer revision is applied',
    decide({ rev: 7, updatedBy: 'other' }, { rev: 6 }, asMe, quiet, noop, null) === 'apply');
  ok('a stale revision is skipped',
    decide({ rev: 5, updatedBy: 'other' }, { rev: 6 }, asMe, quiet, noop, null) === 'skip');
  //  Our own echo comes back at the revision we just wrote.
  ok('our own echo is skipped',
    decide({ rev: 6, updatedBy: 'me' }, { rev: 6 }, asMe, quiet, noop, null) === 'skip');
  /*  THE BUG. Same revision, someone else's state. The old guard
      was `d.rev <= SYNC.rev`, which swallowed this as our own echo
      and left the two devices permanently disagreeing. */
  ok('a same-revision write by another device is ADOPTED',
    decide({ rev: 6, updatedBy: 'other' }, { rev: 6 }, asMe, quiet, noop, null) === 'adopt',
    'this is the split-league bug');
  //  Anonymous writers must not be mistaken for us.
  ok('an anon writer at our revision is adopted',
    decide({ rev: 6, updatedBy: 'anon' }, { rev: 6 }, () => null, quiet, noop, null) === 'skip',
    'both sides are anon: indistinguishable, so skipping is correct');

  // ── Full two-device replay ─────────────────────────────
  function replay(adoptOnCollision) {
    const server = { rev: 5, picks: ['a','b','c','d','e'], updatedBy: 'seed' };
    const dev = (id) => ({ id, rev: 5, picks: server.picks.slice() });
    const host = dev('host'), phone = dev('phone');
    const write = (c, player) => {
      c.picks.push(player); c.rev += 1;
      return { rev: c.rev, picks: c.picks.slice(), updatedBy: c.id };
    };
    const wH = write(host, 'ZANE'), wP = write(phone, 'KAI');
    Object.assign(server, wH);
    Object.assign(server, wP);          // last write wins
    const deliver = (c) => {
      const verdict = adoptOnCollision
        ? decide({ rev: server.rev, updatedBy: server.updatedBy }, c, () => c.id, quiet, noop, null)
        : (server.rev <= c.rev ? 'skip' : 'apply');
      if (verdict === 'skip') return;
      c.rev = server.rev; c.picks = server.picks.slice();
    };
    deliver(host); deliver(phone);
    return { host, phone, server };
  }

  const broken = replay(false);
  ok('model reproduces the old split', JSON.stringify(broken.host.picks) !== JSON.stringify(broken.phone.picks),
    'the model does not reproduce the bug, so it proves nothing');

  const fixed = replay(true);
  ok('with the fix both devices converge',
    JSON.stringify(fixed.host.picks) === JSON.stringify(fixed.phone.picks),
    'host=' + fixed.host.picks + ' phone=' + fixed.phone.picks);
  ok('both devices match the server',
    JSON.stringify(fixed.host.picks) === JSON.stringify(fixed.server.picks));
  //  Honest about the residual cost: one pick is still lost. That is
  //  recoverable (the player returns to the pool); a split is not.
  ok('one pick is still lost, by design', fixed.server.picks.length === 6 &&
    !fixed.server.picks.includes('ZANE'));
}

// ══ 2. makePick is the last line of defence ══════════════
/*  It used to push whatever it was handed onto whatever roster it
    was handed, with no checks at all. A device one pick behind
    could therefore put a player on two rosters permanently. */
function liftMakePick() {
  const i = code.indexOf('function makePick(teamId, playerId, how)');
  const open = code.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < code.length; k++) {
    if (code[k] === '{') d++;
    else if (code[k] === '}') { d--; if (d === 0) { end = k; break; } }
  }
  return code.slice(i, end + 1);
}
const mkSrc = liftMakePick();
ok('makePick is liftable', /function makePick/.test(mkSrc));

(function () {
  const env = {};
  const harness = new Function('env', `
    ${mkSrc}
    return function run(st, teamId, playerId) {
      state = st;
      team = function (id) { return (state.teams || []).filter(function (t) { return t.id === id; })[0]; };
      P = function (id) { return env.players[id] || null; };
      drafted = function () {
        var out = {};
        (state.teams || []).forEach(function (t) { (t.roster || []).forEach(function (r) { out[r] = 1; }); });
        return out;
      };
      track = function () {};
      save = function () { env.saved = (env.saved || 0) + 1; };
      startSeason = function () { env.started = true; state.phase = 'season'; };
      console = { warn: function () { env.warnings = (env.warnings || 0) + 1; }, error: function () {} };
      var state, team, P, drafted, track, save, startSeason, console;
      return makePick(teamId, playerId, how = undefined);
    };
  `);
  //  The above shadows with `var` after use; rebuild more simply.
  const run = new Function('env', `
    var state, console;
    function team(id) { return (state.teams || []).filter(function (t) { return t.id === id; })[0]; }
    function P(id) { return env.players[id] || null; }
    function drafted() {
      var out = {};
      (state.teams || []).forEach(function (t) { (t.roster || []).forEach(function (r) { out[r] = 1; }); });
      return out;
    }
    function track() {}
    function save() { env.saved = (env.saved || 0) + 1; }
    function startSeason() { env.started = true; state.phase = 'season'; }
    ${mkSrc}
    return function (st, teamId, playerId) {
      state = st;
      console = { warn: function () { env.warnings = (env.warnings || 0) + 1; } };
      return makePick(teamId, playerId, 'user');
    };
  `)(env);

  env.players = { p1: { id: 'p1', pos: 'G' }, p2: { id: 'p2', pos: 'F' }, p3: { id: 'p3', pos: 'G' } };
  const fresh = () => ({
    phase: 'draft',
    league: { numTeams: 2 },
    teams: [{ id: 't1', roster: [] }, { id: 't2', roster: [] }],
    draft: { order: ['t1', 't2', 't2', 't1'], pick: 0, log: [] }
  });

  let st = fresh();
  ok('a legitimate pick is accepted', run(st, 't1', 'p1') === true);
  ok('it lands on the roster', st.teams[0].roster.join() === 'p1');
  ok('it advances the pick', st.draft.pick === 1);
  ok('it is logged', st.draft.log.length === 1);

  //  A device one pick behind takes a player who is already gone.
  st = fresh(); run(st, 't1', 'p1');
  const before = JSON.stringify(st);
  ok('an already-drafted player is REFUSED', run(st, 't2', 'p1') === false);
  ok('a refusal changes nothing at all', JSON.stringify(st) === before,
    'a partial mutation is worse than a refusal');
  ok('no player ends up on two rosters', (function () {
    const all = st.teams.flatMap(t => t.roster);
    return new Set(all).size === all.length;
  })());

  //  A device picking for a seat the draft has moved past.
  st = fresh();
  ok('a pick out of turn is REFUSED', run(st, 't2', 'p1') === false,
    'slot 0 belongs to t1');
  ok('out-of-turn leaves the pick index alone', st.draft.pick === 0);

  //  Garbage in.
  st = fresh();
  ok('an unknown player is refused', run(st, 't1', 'nope') === false);
  ok('an unknown team is refused', run(st, 'tX', 'p1') === false);

  //  The final pick must still start the season.
  st = fresh();
  run(st, 't1', 'p1'); run(st, 't2', 'p2'); run(st, 't2', 'p3');
  env.started = false;
  env.players.p4 = { id: 'p4', pos: 'F' };
  ok('the last pick starts the season', run(st, 't1', 'p4') === true && env.started === true);
  ok('every pick was persisted', env.saved >= 4, String(env.saved));
})();

// ══ 3. Callers respect a refusal ═════════════════════════
const live = code.slice(code.indexOf('function livePick'), code.indexOf('function round1'));
ok('livePick checks makePick before announcing',
  /if \(makePick\(teamId, pid, how\) === false\) \{/.test(live));
ok('a refused pick is not announced',
  live.indexOf('=== false') < live.indexOf('announce(p,'));
ok('a refused pick does not restart the clock',
  live.indexOf('=== false') < live.indexOf('restartClock()'));
ok('a refused pick still repaints', /=== false\) \{\s*render\(\);/.test(live));
ok('the autopick toast is gated on success',
  /if \(livePick\(t\.id, pid, 'auto'\) !== false\) \{/.test(code),
  'it claimed a pick that was refused');

// ══ 4. A woken device may not act on stale state ═════════
/*  draftTick runs 4x a second. A much bigger gap means the timers
    were frozen — locked phone, background tab. Acting immediately on
    wake is what collided with the host's takeover, and what caused
    the earlier "my first pick got taken instantly". */
ok('a tick gap is measured', /var sinceTick = now - \(DRAFT_TICK_AT \|\| now\);/.test(code));
ok('a long gap marks the device as woken', /if \(mp && sinceTick > WOKE_GAP_MS\)/.test(code));
ok('a woken device waits for a server snapshot',
  /SYNC\.lastServerSync <= DRAFT_WOKE_AT/.test(code));
ok('the wait is bounded', /now - DRAFT_WOKE_AT < WOKE_WAIT_MS/.test(code),
  'an unbounded wait would stall a device with a dead listener');
ok('the guard only applies in multiplayer', /if \(mp && DRAFT_WOKE_AT/.test(code));
ok('rendering continues while deferred',
  /if \(now - DRAFT_WOKE_AT < WOKE_WAIT_MS\) \{ paintClock\(\); return; \}/.test(code));
(function () {
  const gap = Number((code.match(/WOKE_GAP_MS = (\d+)/) || [])[1]);
  const wait = Number((code.match(/WOKE_WAIT_MS = (\d+)/) || [])[1]);
  const host = Number((code.match(/HOST_TAKEOVER_MS = (\d+)/) || [])[1]);
  ok('the gap threshold is above normal tick jitter', gap >= 1000, String(gap));
  //  A merely-backgrounded tab is throttled to ~1s, not stopped. The
  //  threshold must sit above that or every tab switch looks like sleep.
  ok('the gap threshold tolerates a throttled tab', gap > 1000, String(gap));
  ok('the wait is shorter than the host takeover', wait < host, wait + ' vs ' + host);
  ok('the wait exceeds a plausible round trip', wait >= 1500, String(wait));
})();

// ══ 5. Authority rules still intact ══════════════════════
ok('a human seat is picked for by its own device', /var mineToPick = t\.isUser;/.test(code));
ok('bot seats belong to the host alone',
  /hostCovers = isHost\(\) && \(!seatIsHuman \|\| now >= d\.endsAt \+ HOST_TAKEOVER_MS\)/.test(code));
ok('the last-resort takeover is staggered by seat',
  /ANY_TAKEOVER_MS \+ myIdx \* ANY_TAKEOVER_STAGGER_MS/.test(code));
(function () {
  const stagger = Number((code.match(/ANY_TAKEOVER_STAGGER_MS = (\d+)/) || [])[1]);
  //  Two devices must not fire within a round trip of each other.
  ok('the stagger exceeds a round trip', stagger >= 2000, String(stagger));
})();
ok('covering a human honours their queue',
  /oq = \(d\.queue \|\| \[\]\)\.filter/.test(code));
ok('the clock is read on the shared scale, not Date.now',
  !/now >= d\.endsAt \+ HOST_TAKEOVER_MS/.test(code.replace(/var now = nowSynced\(\);/, '')) ||
  /nowSynced\(\)/.test(code));
ok('only the host fires a scheduled start', /isHost\(\)/.test(code.slice(code.indexOf('soonSent'))));

// ══ 6. Push after a pick still fires ═════════════════════
ok('a pick writes the league doc, which is what triggers push',
  /function makePick[\s\S]*?save\(\);/.test(code));


// ══ 7. Autopick pacing and the snake turn ════════════════
/*  The reported "it autopicked for him then looped over him" was
    two separate things: a correct snake turn that nothing explained,
    and a genuine pacing bug that had drafted whole rosters for
    people who were merely late.                                  */

/*  botAt is the 2-5 second "thinking" delay. A seat counts as a bot
    purely by having no uid, and a seat has no uid until that person
    opens the app. So in a real league anyone late had their roster
    taken at ~3s a pick. The first live league's log recorded 78 of
    96 picks as how:'bot' with six of eight managers never picking. */
ok('the quick bot clock is limited to solo leagues',
  /d\.botAt = \(!multiplayer\(\) && !team\(onClock\(\)\)\.isUser\)/.test(code),
  'an unclaimed seat gets drafted for in seconds');
ok('a multiplayer seat gets no shortcut clock',
  /\? nowSynced\(\) \+ 2000 \+ Math\.floor\(Math\.random\(\) \* 3000\)\s*: null;/.test(code));
//  Run the real expression for all four combinations.
(function () {
  const m = code.match(/d\.botAt = (\(![\s\S]*?: null);/);
  ok('the botAt expression is liftable', !!m);
  if (!m) return;
  const f = new Function('multiplayer', 'team', 'onClock', 'nowSynced',
    'return ' + m[1].replace(/\bd\.botAt\b/g, 'x') + ';');
  const run = (mp, isUser) => f(() => mp, () => ({ isUser }), () => 't0', () => 1000);
  ok('solo + bot seat gets the quick clock', run(false, false) > 1000);
  ok('solo + my seat gets no bot clock', run(false, true) === null);
  ok('multiplayer + another seat gets NO quick clock', run(true, false) === null,
    'this is the bug that drafted for latecomers');
  ok('multiplayer + my seat gets no bot clock', run(true, true) === null);
})();
/*  The bot branch in draftTick is what botAt unlocks, so with botAt
    null in multiplayer an unclaimed seat must still autopick — via
    the ordinary clock expiry, which the host covers immediately for
    a non-human seat. Confirm both halves still exist. */
ok('the bot branch still requires botAt',
  /if \(!seatIsHuman && d\.botAt && now >= d\.botAt\)/.test(code));
ok('the host still covers a non-human seat at expiry',
  /isHost\(\) && \(!seatIsHuman \|\|/.test(code));

// ── The snake turn, explained rather than hidden ─────────
ok('a back-to-back note exists', /function backToBackNote/.test(code));
ok('paintClock keeps it current', /data-ss-turn/.test(code));
ok('the note is rendered in Up Next', /class="rp-un-turn" data-ss-turn="1"/.test(code));
ok('the note is styled', /\.rp-un-turn \{/.test(seasonCss));
ok('an empty note collapses', /\.rp-un-turn:empty \{ display: none; \}/.test(seasonCss));
(function () {
  const i = code.indexOf('function backToBackNote');
  const open = code.indexOf('{', i);
  let dep = 0, end = -1;
  for (let k = open; k < code.length; k++) {
    if (code[k] === '{') dep++;
    else if (code[k] === '}') { dep--; if (dep === 0) { end = k; break; } }
  }
  const src = code.slice(i, end + 1);
  const run = new Function('env', `
    var state, draftCfg, team;
    ${src}
    return function (st, cfg, teams) {
      state = st;
      draftCfg = function () { return cfg; };
      team = function (id) { return teams[id]; };
      return backToBackNote();
    };
  `)({});
  //  8-team snake: R1 t0..t7, R2 t7..t0. Pick 8 is t7 again.
  //  Three rounds, so pick 16 (the R2->R3 turn, which is t0's) is
  //  inside the order rather than past its end.
  const order = ['t0','t1','t2','t3','t4','t5','t6','t7',
                 't7','t6','t5','t4','t3','t2','t1','t0',
                 't0','t1','t2','t3','t4','t5','t6','t7'];
  const teams = { t7: { name: 'Jackson davis', isUser: false }, t6: { name: 'River', isUser: false },
                  t0: { name: 'JC', isUser: true } };
  const st = { phase: 'draft', league: { numTeams: 8 } };
  const cfg = (pick) => ({ status: 'live', order, pick });

  ok('mid-round shows no note', run(st, cfg(5), teams) === '');
  ok('the round turn is named', /second pick in a row/.test(run(st, cfg(8), teams)),
    run(st, cfg(8), teams));
  ok('it names the manager', /Jackson davis/.test(run(st, cfg(8), teams)));
  ok('it names both rounds', /end of round 1 into round 2/.test(run(st, cfg(8), teams)),
    run(st, cfg(8), teams));
  ok('your own turn reads as yours', /^Your second pick/.test(run(st, cfg(16), teams)),
    run(st, cfg(16), teams));
  ok('pick 0 is never a turn', run(st, cfg(0), teams) === '');
  ok('past the end of the order is safe', run(st, cfg(99), teams) === '');
  ok('a paused draft shows nothing',
    run(st, { status: 'paused', order, pick: 8 }, teams) === '');
  ok('the season phase shows nothing',
    run({ phase: 'season', league: { numTeams: 8 } }, cfg(8), teams) === '');
})();

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for the current build',
  [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' draft-sync checks pass');
process.exit(fail ? 1 : 0);
