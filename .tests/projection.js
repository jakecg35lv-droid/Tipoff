/*  Does the projection actually beat the alternatives?

    "Make sure the projections are accurate" cannot be satisfied by
    care. It can only be measured, against the two things a
    reasonable person would do instead:

      baseline A — quote last season's per-game average
      baseline B — quote this season's average so far

    A model that does not beat BOTH is ceremony with extra steps and
    should not ship. So this suite is half correctness checks and half
    a walk-forward backtest that produces actual error numbers.

    ── WHAT THIS BACKTEST IS, AND IS NOT ─────────────────────
    It runs on SIMULATED seasons, not real ones, because there is no
    2026-27 history to fit on yet — five games exist. What it proves
    is that the ESTIMATOR behaves correctly on data whose true answer
    is known: that shrinkage beats both naive alternatives when the
    prior is imperfect and the sample is small, that it converges to
    the season average as games accumulate, and that splitting
    minutes from rate catches a role change faster than blending
    fantasy points as one number.

    What it does NOT prove is the real-world error on real players.
    That number comes from projectionsNow?backtest=1 against actual
    Firestore data, and it will be worse than these figures. Anyone
    quoting a simulation's MAE as a product claim is lying.

    The simulation is deliberately unkind: priors carry year-over-year
    drift (players change), game-to-game variance is high (college
    basketball), and a tenth of the population changes role entirely
    between seasons.                                                 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const M = require(path.join(ROOT, 'functions/projection.js'));
const priorsFile = require(path.join(ROOT, 'functions/priors.json'));

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// Deterministic RNG. A backtest whose number moves between runs is
// not a measurement.
function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) {
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const W = { pts: 1, reb: 1.2, ast: 1.5, stl: 2, blk: 2 };

// ══ 1. The arithmetic does what it claims ════════════════
{
  const prior = { games: 30, min: 30, pts: 15, reb: 5, ast: 3, stl: 1, blk: 0.5 };

  const none = M.project({ prior, games: [], pos: 'G' });
  ok('no games played falls back to the prior', none.method === 'prior-only');
  ok('and reproduces the prior line', Math.abs(none.line.pts - 15) < 0.2,
    String(none.line.pts));
  ok('weights are zero with no evidence', none.weightMinutes === 0 && none.weightRate === 0);

  // A player doing exactly his prior should project at his prior.
  const same = [];
  for (let i = 0; i < 10; i++) same.push({ min: 30, pts: 15, reb: 5, ast: 3, stl: 1, blk: 0.5 });
  const s = M.project({ prior, games: same, pos: 'G' });
  ok('a player repeating his prior still projects at it',
    Math.abs(s.line.pts - 15) < 0.3, String(s.line.pts));

  // A hot start must move the number, but not all the way.
  const hot = [{ min: 30, pts: 30, reb: 5, ast: 3, stl: 1, blk: 0.5 },
               { min: 30, pts: 30, reb: 5, ast: 3, stl: 1, blk: 0.5 }];
  const h = M.project({ prior, games: hot, pos: 'G' });
  ok('two huge games move the projection up', h.line.pts > 15.5, String(h.line.pts));
  ok('but nowhere near the hot average', h.line.pts < 24,
    h.line.pts + ' — 2 games should not be believed');
  ok('the season-to-date baseline DOES believe it',
    M.baselineSeasonToDate(hot).pts === 30, 'this is what we are improving on');

  // Convergence: lots of evidence should win.
  const many = [];
  for (let i = 0; i < 40; i++) many.push({ min: 32, pts: 24, reb: 6, ast: 4, stl: 1, blk: 0.5 });
  const m = M.project({ prior, games: many, pos: 'G' });
  ok('40 games of 24 points converges toward 24', m.line.pts > 22.5, String(m.line.pts));
  ok('weight on current data is high by then', m.weightRate > 0.9, String(m.weightRate));

  const zero = M.project({ prior: null, games: [], pos: 'C' });
  ok('a player with no prior at all still projects something',
    zero.line.pts > 0 && zero.method === 'replacement-only', JSON.stringify(zero.line));
  ok('and it is modest, not a starter', zero.line.min < 20, String(zero.line.min));
}

// ══ 2. The minutes split earns its place ═════════════════
{
  //  The case the whole design exists for: a bench player whose role
  //  changes. Same efficiency throughout, minutes nearly triple.
  const prior = { games: 30, min: 9, pts: 3, reb: 1.5, ast: 0.6, stl: 0.3, blk: 0.2 };
  const breakout = [];
  for (let i = 0; i < 4; i++) breakout.push({ min: 26, pts: 9, reb: 4.3, ast: 1.7, stl: 0.9, blk: 0.6 });

  const split = M.project({ prior, games: breakout, pos: 'G' });

  //  What a single-number blend would have said: shrink FPTS itself
  //  on games, with the same k. Reconstructed here rather than
  //  assumed, so the comparison is honest.
  const kG = M.K.minGames;
  const wNaive = breakout.length / (breakout.length + kG);
  const naiveF = wNaive * M.fptsOf(breakout[0], W) + (1 - wNaive) * M.fptsOf(
    { pts: 3, reb: 1.5, ast: 0.6, stl: 0.3, blk: 0.2 }, W);

  const truth = M.fptsOf(breakout[0], W);
  const splitErr = Math.abs(M.fptsOf(split.line, W) - truth);
  const naiveErr = Math.abs(naiveF - truth);

  /*  ── A claim I had to withdraw ───────────────────────────
      The original version of this asserted that the minutes/rate
      split BEATS a single-number blend on a role change. Swept
      against a properly tuned per-stat blend over 500 players x 28
      games x 6 seeds, the difference is -0.01% — noise.

      It only looked like a win while the comparator was badly tuned
      (k=6 against the split's k=2), which is a comparison with my
      thumb on the scale rather than a result.

      And the deeper problem: the simulator GENERATES production as
      rate x minutes, which is precisely the decomposition's own
      assumption. A simulation built on the model's structure cannot
      test that structure — both estimators are correctly specified,
      so of course they tie. This is uninformative, not negative, and
      only real box scores can settle it.

      The decomposition is kept anyway, for two reasons that are not
      about MAE: it outputs projected MINUTES, which is independently
      useful to show a manager, and it is the physically motivated
      model if the two ever do come apart. It is not kept because it
      is more accurate, because nothing here shows that.           */
  ok('the split is at least not WORSE than a single blend on a role change',
    splitErr <= naiveErr * 1.05,
    'split ' + splitErr.toFixed(2) + ' vs naive ' + naiveErr.toFixed(2) +
    ' — these are expected to tie; a large gap either way means something changed');
  ok('it has moved most of the way after 4 games',
    split.line.min > 20, split.line.min + ' projected minutes — ' +
    'at the old minGames=5 this was 16.6 and trailed reality for a fortnight');

  //  The reverse case must work too, or it is just an upward bias.
  const benched = [];
  for (let i = 0; i < 4; i++) benched.push({ min: 7, pts: 2, reb: 1, ast: 0.3, stl: 0.2, blk: 0.1 });
  const b = M.project({
    prior: { games: 30, min: 31, pts: 14, reb: 5, ast: 3, stl: 1, blk: 0.4 },
    games: benched, pos: 'F',
  });
  ok('a player who loses his role projects down fast', b.line.pts < 9, String(b.line.pts));
}

// ══ 3. Walk-forward backtest vs both baselines ═══════════
/*  Build a population whose TRUE talent we know, give each player an
    imperfect prior (last season, plus drift), simulate a season, and
    at every point predict the NEXT game from only what has happened
    so far. Mean absolute error, in fantasy points, lower is better. */
function simulate(seed, opts) {
  const o = opts || {};
  const r = rng(seed);
  const N = o.players || 600;
  const G = o.games || 28;
  const roleChangeRate = o.roleChangeRate == null ? 0.10 : o.roleChangeRate;
  const pop = [];

  for (let i = 0; i < N; i++) {
    const pos = r() < 0.5 ? 'G' : r() < 0.75 ? 'F' : 'C';
    const repl = priorsFile.replacement[pos];
    //  True per-minute rates: replacement-ish, scaled by a talent
    //  factor, so the population spans bench to star.
    const talent = 0.55 + r() * 1.4;
    const trueRate = {};
    M.STAT_KEYS.forEach(function (k) { trueRate[k] = repl.rate[k] * talent * (0.75 + r() * 0.5); });
    const trueMin = Math.min(38, 6 + r() * 28);

    //  Last season: the same player, observed with noise and a year
    //  of drift. A perfect prior would make this test meaningless.
    const drift = 1 + gauss(r) * 0.18;
    const priorMin = Math.max(2, trueMin * (1 + gauss(r) * 0.22) / (r() < roleChangeRate ? 2.4 : 1));
    const prior = { games: 28 + Math.floor(r() * 6), min: +priorMin.toFixed(1) };
    M.STAT_KEYS.forEach(function (k) {
      prior[k] = +Math.max(0, repl.rate[k] * talent * drift * priorMin * (0.85 + r() * 0.3)).toFixed(2);
    });

    //  A tenth of the league changes role between seasons, which is
    //  exactly the population the prior is worst at and the whole
    //  reason a pure prior-quote loses.
    pop.push({ pos, trueRate, trueMin, prior });
  }

  const err = { model: 0, prior: 0, std: 0, n: 0 };
  const byGame = {};

  pop.forEach(function (p, idx) {
    const played = [];
    const pr = rng(seed * 7919 + idx);
    for (let g = 0; g < G; g++) {
      //  Predict the NEXT game using only games already played.
      const proj = M.project({ prior: p.prior, games: played, pos: p.pos });
      const bPrior = M.baselinePrior(p.prior);
      const bStd = played.length ? M.baselineSeasonToDate(played) : bPrior;

      //  Realise the next game. Minutes wobble (foul trouble,
      //  blowouts); production is noisy around the true rate.
      const mins = Math.max(0, p.trueMin * (1 + gauss(pr) * 0.30));
      const actual = { min: mins };
      M.STAT_KEYS.forEach(function (k) {
        actual[k] = Math.max(0, p.trueRate[k] * mins * (1 + gauss(pr) * 0.55));
      });

      const a = M.fptsOf(actual, W);
      const e = {
        model: Math.abs(M.fptsOf(proj.line, W) - a),
        prior: Math.abs(M.fptsOf(bPrior, W) - a),
        std: Math.abs(M.fptsOf(bStd, W) - a),
      };
      err.model += e.model; err.prior += e.prior; err.std += e.std; err.n++;

      const bucket = g < 3 ? '0-2' : g < 8 ? '3-7' : g < 16 ? '8-15' : '16+';
      const b = byGame[bucket] = byGame[bucket] || { model: 0, prior: 0, std: 0, n: 0 };
      b.model += e.model; b.prior += e.prior; b.std += e.std; b.n++;

      played.push(actual);
    }
  });

  const mae = k => err[k] / err.n;
  return {
    mae: { model: mae('model'), prior: mae('prior'), std: mae('std') },
    byGame: Object.keys(byGame).reduce(function (acc, key) {
      const b = byGame[key];
      acc[key] = { model: b.model / b.n, prior: b.prior / b.n, std: b.std / b.n, n: b.n };
      return acc;
    }, {}),
  };
}

const sim = simulate(20261117);
console.log('\n── walk-forward backtest (simulated, 600 players x 28 games) ──');
console.log('  MAE fantasy points per game, lower is better');
console.log('    model            ', sim.mae.model.toFixed(3));
console.log('    last-season avg  ', sim.mae.prior.toFixed(3));
console.log('    season-to-date   ', sim.mae.std.toFixed(3));
console.log('  by games played:');
['0-2', '3-7', '8-15', '16+'].forEach(function (b) {
  const x = sim.byGame[b];
  if (!x) return;
  console.log('    ' + b.padEnd(6) + ' model ' + x.model.toFixed(2) +
    '   prior ' + x.prior.toFixed(2) + '   s2d ' + x.std.toFixed(2));
});
console.log('');

ok('the model beats quoting last season', sim.mae.model < sim.mae.prior,
  sim.mae.model.toFixed(3) + ' vs ' + sim.mae.prior.toFixed(3));
ok('the model beats quoting season-to-date', sim.mae.model < sim.mae.std,
  sim.mae.model.toFixed(3) + ' vs ' + sim.mae.std.toFixed(3));
ok('it wins EARLY, where season-to-date is noise',
  sim.byGame['0-2'].model < sim.byGame['0-2'].std,
  'this is the window your managers draft in');
ok('and it still wins LATE, where the prior is stale',
  sim.byGame['16+'].model < sim.byGame['16+'].prior);
ok('season-to-date overtakes the prior eventually, as it should',
  sim.byGame['16+'].std < sim.byGame['16+'].prior,
  'if not, the simulation is not modelling a real season');

//  Stability: the result must not depend on one lucky seed.
const seeds = [1, 7, 99, 4242].map(s => simulate(s, { players: 250, games: 24 }));
ok('the win holds across independent seeds',
  seeds.every(s => s.mae.model < s.mae.prior && s.mae.model < s.mae.std),
  JSON.stringify(seeds.map(s => +(s.mae.std - s.mae.model).toFixed(2))));

// ══ 4. k is tuned, not decided by vibes ══════════════════
{
  const sweep = [];
  [[1.5, 60], [2, 70], [3, 90], [5, 90], [10, 300], [20, 600]].forEach(function (pair) {
    const k = { minGames: pair[0], rateMinutes: pair[1] };
    const r = rng(1);
    //  Re-run a smaller population with k overridden.
    let tot = 0, n = 0;
    for (let i = 0; i < 200; i++) {
      const pos = 'G';
      const repl = priorsFile.replacement[pos];
      const talent = 0.6 + r() * 1.3;
      const trueRate = {}; M.STAT_KEYS.forEach(x => trueRate[x] = repl.rate[x] * talent);
      const trueMin = 8 + r() * 26;
      const priorMin = Math.max(2, trueMin * (1 + gauss(r) * 0.22));
      const prior = { games: 30, min: priorMin };
      M.STAT_KEYS.forEach(x => prior[x] = repl.rate[x] * talent * (1 + gauss(r) * 0.18) * priorMin);
      const played = [];
      for (let g = 0; g < 20; g++) {
        const proj = M.project({ prior, games: played, pos, k });
        const mins = Math.max(0, trueMin * (1 + gauss(r) * 0.3));
        const act = { min: mins };
        M.STAT_KEYS.forEach(x => act[x] = Math.max(0, trueRate[x] * mins * (1 + gauss(r) * 0.55)));
        tot += Math.abs(M.fptsOf(proj.line, W) - M.fptsOf(act, W)); n++;
        played.push(act);
      }
    }
    sweep.push({ k: pair.join('/'), mae: tot / n });
  });
  sweep.sort((a, b) => a.mae - b.mae);
  console.log('── k sweep (minGames/rateMinutes) ──');
  sweep.forEach(s => console.log('    ' + s.k.padEnd(9) + s.mae.toFixed(3)));
  console.log('');
  const shipped = M.K.minGames + '/' + M.K.rateMinutes;
  const best = sweep[0];
  const ours = sweep.find(s => s.k === shipped);
  ok('the shipped k is on the sweep', !!ours, shipped);
  ok('and is within 3% of the best value tried',
    ours && (ours.mae - best.mae) / best.mae < 0.03,
    ours ? ours.mae.toFixed(3) + ' vs best ' + best.mae.toFixed(3) + ' (' + best.k + ')' : 'missing');
}

// ══ 5. Priors file is sane ═══════════════════════════════
ok('priors.json exists and has the pool', priorsFile.playerCount > 900, String(priorsFile.playerCount));
ok('it records what it was built from', !!priorsFile.poolGenerated);
['G', 'F', 'C'].forEach(function (p) {
  const r = priorsFile.replacement[p];
  ok('replacement ' + p + ' has believable minutes', r.min > 6 && r.min < 20, String(r.min));
  ok('replacement ' + p + ' has a non-zero scoring rate', r.rate.pts > 0.1, String(r.rate.pts));
  ok('replacement ' + p + ' is drawn from a real sample', r.sample > 40, String(r.sample));
});

// ══ 6. Garbage in does not produce garbage out ═══════════
{
  const bad = M.project({ prior: { games: 10, min: 0, pts: 99 }, games: [{ min: 0, pts: 50 }], pos: 'G' });
  ok('a zero-minute prior cannot divide by zero',
    isFinite(bad.line.pts) && bad.line.pts >= 0, JSON.stringify(bad.line));
  ok('zero-minute game lines are not counted', bad.n === 0, String(bad.n));

  const junk = M.project({ prior: { games: 'x', min: null, pts: undefined }, games: null, pos: null });
  ok('null and undefined survive', isFinite(junk.line.pts), JSON.stringify(junk.line));

  const neg = M.project({ prior: { games: 30, min: 20, pts: -5 }, games: [], pos: 'G' });
  ok('a negative stat cannot produce a negative projection', neg.line.pts >= 0, String(neg.line.pts));

  const huge = [];
  for (let i = 0; i < 5; i++) huge.push({ min: 60, pts: 80, reb: 40, ast: 30, stl: 10, blk: 10 });
  const cap = M.project({ prior: { games: 30, min: 30, pts: 15 }, games: huge, pos: 'G' });
  ok('minutes are capped at a real basketball number', cap.line.min <= 40, String(cap.line.min));
}

// ══ 7. Output shape the app can consume ══════════════════
{
  const p = M.project({ prior: { games: 30, min: 28, pts: 12, reb: 6, ast: 2, stl: 1, blk: 1 }, games: [], pos: 'F' });
  ['min', 'pts', 'reb', 'ast', 'stl', 'blk'].forEach(function (k) {
    ok('line carries ' + k, typeof p.line[k] === 'number' && isFinite(p.line[k]));
  });
  ok('it reports how it got there', !!p.method && typeof p.weightRate === 'number');
  ok('it does NOT bake in scoring weights', p.line.fpts === undefined,
    'leagues score differently; storing fpts would be wrong for most of them');
}

console.log('\n' + pass + '/' + (pass + fail) + ' projection checks pass');
process.exit(fail ? 1 : 0);
