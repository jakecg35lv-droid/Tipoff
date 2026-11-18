/* ══════════════════════════════════════════════════════════
   TIPOFF FANTASY — fantasy point projections

   Pure arithmetic. No Firebase, no network, no clock. Everything
   here is a function of its arguments, so the backtest in
   .tests/projection.js runs the EXACT code that ships rather than a
   reimplementation that can quietly disagree with it.

   ── THE PROBLEM THIS SOLVES ───────────────────────────────
   The app currently projects a player at last season's per-game
   average, forever. A junior who has taken a leap, a freshman who
   won the starting job in week one, a senior who lost it — all three
   are priced at what they did last year until somebody regenerates
   the pool file by hand.

   The obvious fix, "use this season's average instead", is worse.
   Five games into a season a 28-point outlier moves a player's
   average by six points. Early-season raw averages are a NOISIER
   predictor of the next game than last year's numbers are, and they
   stay that way until roughly January.

   ── WHAT IT DOES INSTEAD ──────────────────────────────────
   Shrinkage. Blend this season toward a prior, weighted by how much
   evidence this season actually carries:

       projection = w · current + (1 - w) · prior,  w = n / (n + k)

   At 2 games w is small and you are mostly reading last year. At 25
   games you are mostly reading this year. Nothing switches over on a
   date; the weight moves continuously as evidence accumulates, which
   is also why there is no "the model turned on today" cliff for a
   manager to notice and distrust.

   ── WHY MINUTES ARE SPLIT OUT ─────────────────────────────
   This is the part that earns its keep. Production per MINUTE is
   fairly stable early; MINUTES are what move. A bench freshman going
   from 9 minutes to 26 triples his output with no change whatever in
   how he plays, and a model blending fantasy points as one number
   takes a month to believe it. Blending the two factors separately
   catches it in about two games, because the minutes series is short
   and noisy while the rate series is long and calm:

       projected per-game = projected MINUTES × projected RATE

   The two use different amounts of shrinkage for the same reason —
   minutes shrink on GAMES PLAYED, rates shrink on MINUTES PLAYED.
   One game tells you a lot about a player's role and almost nothing
   about his efficiency; 90 minutes of floor time tells you plenty
   about efficiency. Using games for both would throw away the fact
   that a 38-minute night is far more evidence than an 8-minute one.

   ── WHAT IT DOES NOT DO ───────────────────────────────────
   No opponent adjustment, no pace, no home/away, no rest. All real,
   all second-order next to minutes, and each one doubles the surface
   area to get wrong. Add them only if the backtest says the current
   version has stopped improving.

   Nothing here knows your league's scoring weights, and that is
   deliberate: the output is a projected STAT LINE. A league that
   scores blocks at 3 and one that ignores them entirely read the
   same document and reach different, correct answers.
══════════════════════════════════════════════════════════ */

'use strict';

const STAT_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk'];

/*  Shrinkage constants.

    K.minGames = 5     a player's minutes are believed ~50% after 5
                       games, ~75% after 15
    K.rateMinutes = 90 efficiency is believed ~50% after 90 minutes of
                       floor time, which is 3 starter games or 10 off
                       the bench

    These are priors, not measurements — there is no 2026-27 history
    to fit them on yet. They are in one place, exported, and swept by
    the backtest precisely so they can be re-fit in January against
    real data instead of argued about.                              */
/*  These values are swept, not chosen. See .tests/projection.js.

    Measured over 400 players x 28 games x 5 seeds, with foul trouble
    and mid-season role changes in the simulation, the surface is very
    flat — every pair tried lands between 6.94 and 7.09 MAE, so k is
    worth about 2% of accuracy. It is worth much more than that in
    RESPONSIVENESS, which is what a manager actually notices: at the
    old minGames=5 a player who won the starting job was still only
    44% believed after four games, and the projection trailed reality
    for a fortnight.

    minutes shrink fast (minGames=2) because a player's ROLE is
    directly observable — you can see he played 26 minutes. Efficiency
    is not; it has to be inferred through a lot of noise, so rates
    shrink slowly (rateMinutes=70, about two and a half starter
    games).                                                          */
const K = { minGames: 2, rateMinutes: 70 };

//  A player with no prior and no minutes has to be projected as
//  SOMETHING, and zero is the one answer that is certainly wrong —
//  it makes every freshman undraftable. These are per-minute rates
//  at roughly the 35th percentile of rotation players by position,
//  with modest minutes: a real bench contributor, not a star and not
//  a walk-on. Overwritten by build-priors.mjs from the actual pool,
//  so these literals are only the fallback's fallback.
const REPLACEMENT = {
  G: { min: 13, rate: { pts: 0.300, reb: 0.090, ast: 0.075, stl: 0.028, blk: 0.008 } },
  F: { min: 13, rate: { pts: 0.290, reb: 0.150, ast: 0.045, stl: 0.024, blk: 0.030 } },
  C: { min: 12, rate: { pts: 0.300, reb: 0.185, ast: 0.035, stl: 0.020, blk: 0.060 } },
};

function num(v) { const n = +v; return isFinite(n) ? n : 0; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function posKey(pos) {
  const raw = String(pos || 'G').toUpperCase();
  if (raw === 'C' || raw.indexOf('C') === 0) return 'C';
  if (raw.indexOf('F') >= 0) return 'F';
  return 'G';
}

/*  Season-to-date totals from the per-game lines the stat sync
    stores. Lines with no minutes are dropped rather than counted as
    a zero game: the sync already refuses to write a player who never
    checked in, so a zero-minute line here means a garbage-time
    rounding artefact, and averaging it in drags a starter's rate
    down for no reason.                                             */
function aggregate(games) {
  const out = { n: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
  (games || []).forEach(function (g) {
    if (!g) return;
    const m = num(g.min);
    if (m <= 0) return;
    out.n++;
    out.min += m;
    STAT_KEYS.forEach(function (k) { out[k] += num(g[k]); });
  });
  return out;
}

/*  Last season's per-game averages, turned into the same per-minute
    shape as the current season so the two can be blended.

    A prior with games but no minutes recorded is treated as having
    no usable rate: dividing by zero minutes would produce Infinity
    and poison every downstream number silently.                    */
function priorRates(prior, pos) {
  const p = prior || {};
  const minPerGame = num(p.min);
  const games = num(p.games);
  if (!(minPerGame > 0) || !(games > 0)) return null;

  const rate = {};
  STAT_KEYS.forEach(function (k) { rate[k] = num(p[k]) / minPerGame; });
  return { min: minPerGame, rate: rate, games: games };
}

/*  The projection.

    opts:
      prior       { games, min, pts, reb, ast, stl, blk }  per game, last season
      games       [ { min, pts, reb, ast, stl, blk }, ... ] this season
      pos         'G' | 'F' | 'C'
      replacement optional override of REPLACEMENT
      k           optional override of K

    Returns a projected per-game line plus the inputs that produced
    it. `method` and the two weights are returned on purpose: a
    number a manager disagrees with is far easier to defend when the
    app can say "80% last season, 20% this season, 3 games in".     */
function project(opts) {
  const o = opts || {};
  const pos = posKey(o.pos);
  const k = Object.assign({}, K, o.k || {});
  const repl = (o.replacement && o.replacement[pos]) || REPLACEMENT[pos];

  const cur = aggregate(o.games);
  const pri = priorRates(o.prior, pos);

  //  Which prior are we blending toward, and what do we call it.
  const base = pri || { min: repl.min, rate: repl.rate, games: 0 };
  const method = pri ? (cur.n ? 'blend' : 'prior-only')
                     : (cur.n ? 'blend-replacement' : 'replacement-only');

  //  ── Minutes: shrink on GAMES ────────────────────────────
  const wMin = cur.n / (cur.n + k.minGames);
  const curMinPerGame = cur.n ? cur.min / cur.n : 0;
  const projMin = clamp(wMin * curMinPerGame + (1 - wMin) * base.min, 0, 40);

  //  ── Rates: shrink on MINUTES ────────────────────────────
  //  A 38-minute game is real evidence about efficiency; an 8-minute
  //  cameo is not. Weighting by floor time rather than appearances
  //  is the whole reason these are two separate blends.
  const wRate = cur.min / (cur.min + k.rateMinutes);
  const rate = {};
  STAT_KEYS.forEach(function (key) {
    const curRate = cur.min > 0 ? cur[key] / cur.min : 0;
    rate[key] = Math.max(0, wRate * curRate + (1 - wRate) * num(base.rate[key]));
  });

  const line = { min: round1(projMin) };
  STAT_KEYS.forEach(function (key) { line[key] = round1(projMin * rate[key]); });

  return {
    line: line,
    perMin: rate,
    n: cur.n,
    minutesPlayed: round1(cur.min),
    weightMinutes: round3(wMin),
    weightRate: round3(wRate),
    method: method,
    pos: pos,
  };
}

function round1(v) { return Math.round(num(v) * 10) / 10; }
function round3(v) { return Math.round(num(v) * 1000) / 1000; }

//  Scoring is a league setting, so this is only for the backtest and
//  for any caller that already knows its weights.
function fptsOf(line, weights) {
  const w = weights || { pts: 1, reb: 1.2, ast: 1.5, stl: 2, blk: 2 };
  if (!line) return 0;
  return STAT_KEYS.reduce(function (s, k) { return s + num(line[k]) * num(w[k]); }, 0);
}

/*  Baselines, so "is the model any good" is answerable rather than
    assertable. Both are what a reasonable person would do instead:
    quote last year, or quote this year so far. A projection that
    cannot beat BOTH of these is ceremony and should not ship.      */
function baselinePrior(prior) {
  const p = prior || {};
  const line = { min: num(p.min) };
  STAT_KEYS.forEach(function (k) { line[k] = num(p[k]); });
  return line;
}

function baselineSeasonToDate(games) {
  const a = aggregate(games);
  const line = { min: a.n ? round1(a.min / a.n) : 0 };
  STAT_KEYS.forEach(function (k) { line[k] = a.n ? round1(a[k] / a.n) : 0; });
  return line;
}

module.exports = {
  project, aggregate, priorRates, fptsOf,
  baselinePrior, baselineSeasonToDate,
  posKey, STAT_KEYS, K, REPLACEMENT,
};
