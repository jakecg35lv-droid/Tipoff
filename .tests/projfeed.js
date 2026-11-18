/*  The projection PLUMBING, as distinct from the projection maths.

    .tests/projection.js proves the estimator. None of that matters if
    the number never reaches the draft board, reaches it in the wrong
    units, costs a thousand reads to fetch, or replaces a working
    board with zeros the first time a deploy half-finishes.

    Three things this holds down, each of which has a real failure
    behind it elsewhere in this codebase:

      1. the packed array order is identical on both sides
      2. an empty or failed read degrades to the old behaviour
         rather than to zero
      3. the feed is paid for once per revision, not per player     */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fns = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
const season = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const F = strip(fns), S = strip(season);

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n)) : (fail++, console.log('FAIL  ' + n + (d ? '  -> ' + d : ''))); };

ok('comment stripper works', !/the projection PLUMBING/.test(F + S));

// ══ 1. Writer and reader agree on the packed order ═══════
const writeOrder = (F.match(/packed\[espnId\] = \[([\s\S]*?)\];/) || [])[1] || '';
ok('the writer packs an array', !!writeOrder, 'not found');
ok('writer order is min,pts,reb,ast,stl,blk',
  /p\.line\.min,\s*p\.line\.pts,\s*p\.line\.reb,\s*p\.line\.ast,\s*p\.line\.stl,\s*p\.line\.blk/.test(writeOrder),
  writeOrder.replace(/\s+/g, ' ').slice(0, 90));
ok('reader unpacks the SAME order',
  /min: a\[0\], pts: a\[1\], reb: a\[2\], ast: a\[3\], stl: a\[4\], blk: a\[5\]/.test(S),
  'a positional format that disagrees puts rebounds in the points column silently');
ok('games is index 6 on both sides',
  /p\.n,/.test(writeOrder) && /games: a\[6\]/.test(S));
ok('the format is written into the document too', /format: 'min,pts,reb,ast,stl,blk,games,method'/.test(F),
  'so the shape is discoverable from the data, not only from this file');
ok('method codes match the reader order',
  /'blend' \? 0 : p\.method === 'prior-only' \? 1/.test(F) &&
  /\['blend', 'prior-only', 'blend-replacement', 'replacement-only'\]/.test(S));

// ══ 2. Cost ══════════════════════════════════════════════
ok('projections are sharded, not one doc per player',
  /feeds'\)\.doc\('projections_' \+ i\)/.test(F),
  '1027 documents is 1027 reads per client per load');
ok('shard size leaves headroom under the 1MB cap', /const SHARD = 400/.test(F));
ok('retired shards are emptied', /retired: true/.test(F),
  'a shrinking pool would otherwise leave ghosts the client merges in');
ok('the client gates on a revision counter', /rev === PROJ_REV/.test(S),
  'without this it re-reads the whole pool on every tick');
ok('the revision lives on the parent doc', /projRev: admin\.firestore\.FieldValue\.increment\(1\)/.test(F));
ok('and the client knows how many shards to read', /projShards/.test(F) && /projShards/.test(S));

// ══ 3. Failure degrades to the OLD behaviour, not zero ═══
ok('an empty feed is ignored', /if \(!Object\.keys\(next\)\.length\) return false;/.test(S),
  'a half-finished deploy must not zero every projection in the app');
ok('a failed read is caught and logged', /projections read failed/.test(S));
ok('a missing player falls back to his prior average',
  /var pj = PROJ\[String\(p\.espnId \|\| ''\)\.trim\(\)\];/.test(S) && /if \(pj && pj\.line\)/.test(S),
  'no projection must mean last season, not zero');
ok('the old random-freshman path still exists as the offline fallback',
  /if \(p\.hasStats === false\)/.test(S));

// ══ 4. Units: a stat line, not fantasy points ════════════
ok('the feed stores a stat line', /line: p\.line/.test(F) || /p\.line\.pts/.test(F));
ok('it does NOT store fpts', !/fpts: /.test(F.slice(F.indexOf('async function runProjections'), F.indexOf('async function runProjectionBacktest'))),
  'leagues score differently; one baked-in number would be wrong for most of them');
ok('the client applies its own weights', /proj: fpts\(avg\)/.test(S));
ok('the pool is rebuilt when the feed changes', /resetPool\(\);/.test(S.slice(S.indexOf('function loadProjections'), S.indexOf('function loadRealWeek'))),
  'the pool is memoised; without this the numbers never reach the UI');

// ══ 5. It runs, and it cannot cost API calls ═════════════
ok('there is a nightly schedule', /exports\.syncProjections = onSchedule/.test(F));
ok('it runs after the stat sweep window ends',
  /schedule: '30 3 \* \* \*'/.test(F),
  'ACTIVE_HOUR_END is 2:59am ET; computing from a slate still being written is worse than waiting');
const projFn = F.slice(F.indexOf('async function runProjections'), F.indexOf('async function runProjectionBacktest'));
ok('it makes no ESPN calls at all', !/apiFetch|fetch\(/.test(projFn),
  'this is a recomputation of data already stored; it must not touch quota');
ok('it uses the chunked batch', /const batch = chunkedBatch\(\)/.test(projFn),
  '1027 writes would reject a plain 500-op batch');
ok('the HTTP trigger is dry by default', /dryRun: req\.query\.write !== '1'/.test(F));

// ══ 6. The real backtest is honest ═══════════════════════
const bt = F.slice(F.indexOf('async function runProjectionBacktest'), F.indexOf('exports.syncProjections'));
ok('a real backtest exists', bt.length > 500);
ok('it sorts games by date', /localeCompare/.test(bt),
  'out-of-order games let the model see the future, which is how a backtest flatters itself');
ok('it predicts from history only', /games\.slice\(0, g\)/.test(bt));
ok('it compares against BOTH baselines', /baselinePrior/.test(bt) && /baselineSeasonToDate/.test(bt));
ok('it refuses to conclude from a thin sample', /SAMPLE TOO SMALL/.test(bt));
ok('and says so plainly when the model loses', /MODEL DOES NOT BEAT BOTH BASELINES/.test(bt));
ok('it writes nothing', !/batch|\.set\(/.test(bt), 'a backtest that writes is not a backtest');

// ══ 7. Clients cannot forge projections ══════════════════
ok('seasonStats subcollections are read-only to clients',
  /match \/seasonStats\/\{season\} \{[\s\S]*?match \/\{sub=\*\*\} \{[\s\S]*?allow write: if false;/.test(rules),
  'a client that could write projections could inflate its own draft board');

// ══ 8. Build hygiene ═════════════════════════════════════
const priors = require(path.join(ROOT, 'functions/priors.json'));
ok('priors.json ships with the functions', fs.existsSync(path.join(ROOT, 'functions/priors.json')));
ok('it covers the pool', priors.playerCount > 900, String(priors.playerCount));
ok('the generator is committed', fs.existsSync(path.join(ROOT, 'tools/build-priors.mjs')),
  'a generated file with no generator is a file nobody can regenerate');
ok('projection.js has no Firebase in it',
  !/firebase|admin\./.test(fs.readFileSync(path.join(ROOT, 'functions/projection.js'), 'utf8')),
  'the test suite must be able to run the shipped code directly');

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for it', [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' projection feed checks pass');
process.exit(fail ? 1 : 0);
