/*  Turns data/conference-players.js into functions/priors.json.

    The projection needs last season's per-game line for every player
    as its prior. That data already exists in the pool file — but the
    pool file is a browser script (`window.TIPOFF_CONF_POOL = {...}`)
    that lives outside the functions/ directory, and `firebase deploy`
    only uploads functions/. Reading it at runtime is not an option.

    So it is extracted at build time into a plain JSON file that ships
    WITH the functions. Deterministic, diffable, no network, and the
    deploy cannot silently go out carrying a stale copy of a file it
    never had.

    Run after regenerating the pool:
        node tools/build-priors.mjs

    Also computes replacement level per position from the real pool
    rather than the hand-written literals in projection.js. A player
    with no prior at all — a true freshman — is projected at this, and
    "a plausible bench rotation player" is much better answered by the
    35th percentile of actual rotation players than by me guessing.  */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data/conference-players.js');
const OUT = path.join(ROOT, 'functions/priors.json');

const raw = fs.readFileSync(SRC, 'utf8');
const start = raw.indexOf('{', raw.indexOf('window.TIPOFF_CONF_POOL'));
if (start < 0) throw new Error('could not find the pool object in ' + SRC);
const pool = JSON.parse(raw.slice(start).replace(/;\s*$/, '').trim());

const players = pool.players || [];
if (!players.length) throw new Error('pool parsed but contains no players');

function posKey(pos) {
  const r = String(pos || 'G').toUpperCase();
  if (r === 'C' || r.indexOf('C') === 0) return 'C';
  if (r.indexOf('F') >= 0) return 'F';
  return 'G';
}

const STATS = { points: 'pts', rebounds: 'reb', assists: 'ast', steals: 'stl', blocks: 'blk' };

const priors = {};
const ratesByPos = { G: [], F: [], C: [] };
const minsByPos = { G: [], F: [], C: [] };
let withStats = 0;

for (const p of players) {
  const espnId = String(p.espnId || '').trim();
  if (!espnId) continue;
  const pos = posKey(p.position || p.pos);
  const min = +p.minutes || 0;
  const games = +p.games || 0;
  const st = p.stats || {};

  const rec = { pos, games, min };
  for (const [from, to] of Object.entries(STATS)) rec[to] = +st[from] || 0;
  priors[espnId] = rec;

  /*  Two different populations on purpose.

      RATES come from rotation players only (12+ min, 10+ games).
      Efficiency measured over 40 total minutes of garbage time is
      not efficiency, it is a rounding error, and letting those lines
      into the percentile drags the replacement rate toward nonsense.

      MINUTES come from every player who has a prior at all. The
      question being answered is "how many minutes should we expect
      from a player we know nothing about, who is good enough to be
      in the top 13 at his school" — and the rotation-only population
      answers a different and much more flattering question. Measured
      on this pool: rotation-only p25 is 21.8 minutes for a guard,
      which would project every true freshman as a starter.          */
  if (p.hasStats === true) minsByPos[pos].push(min);

  if (p.hasStats === true && min >= 12 && games >= 10) {
    withStats++;
    const r = {};
    for (const to of Object.values(STATS)) r[to] = rec[to] / min;
    ratesByPos[pos].push(r);
  }
}

function pct(arr, q) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

const replacement = {};
for (const pos of ['G', 'F', 'C']) {
  const rate = {};
  for (const to of Object.values(STATS)) {
    rate[to] = +pct(ratesByPos[pos].map(r => r[to]), 0.35).toFixed(4);
  }
  replacement[pos] = {
    //  25th percentile across everyone with a prior: roughly 14
    //  minutes. A bench piece who plays, which is what an unknown
    //  player in a top-13 roster slot most likely is. Shrinkage
    //  moves off this fast — after 5 real games the player's own
    //  minutes carry half the weight.
    min: +pct(minsByPos[pos], 0.25).toFixed(1),
    rate,
    sample: ratesByPos[pos].length,
    minutesSample: minsByPos[pos].length,
  };
}

const out = {
  generated: new Date().toISOString().slice(0, 10),
  source: 'data/conference-players.js',
  poolGenerated: pool.generated || null,
  priorSeason: pool.season || null,
  playerCount: Object.keys(priors).length,
  rotationSample: withStats,
  replacement,
  priors,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
console.log('wrote', OUT);
console.log('  players:', out.playerCount, ' rotation sample:', withStats);
for (const pos of ['G', 'F', 'C']) {
  const r = replacement[pos];
  console.log(`  replacement ${pos}: ${r.min} min, ${r.rate.pts} pts/min (n=${r.sample})`);
}
