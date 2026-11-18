/*  The diagnostic that stops "player X shows 0" costing an evening.

    Twice now the answer has been found by reading source and guessing
    across text messages, and both times the feed itself was healthy.
    A player showing zero and the pipeline working are perfectly
    compatible: he can be off every roster, his school can be idle,
    the game can fall outside the league's week window, the box score
    can be genuinely missing, or the game can have tipped before the
    draft ended. Identical in the UI, completely different causes.

    _whyZero reports WHICH. These checks hold it honest: read-only,
    and it must name every link in the chain rather than stopping at
    the first thing it finds.                                        */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const raw=fs.readFileSync(path.join(ROOT,'src/season/season.js'),'utf8');
const S=raw.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
let pass=0,fail=0;
const ok=(n,c,d)=>{c?(pass++,console.log('PASS  '+n)):(fail++,console.log('FAIL  '+n+(d?'  -> '+d:'')));};

ok('stripper works', !/costing an evening/.test(S));
const fn=S.slice(S.indexOf('_whyZero: function'), S.indexOf('_clock: function'));
ok('_whyZero exists', fn.length>400, String(fn.length));
ok('it is exported on TipoffSeason', /_whyZero: function \(who\)/.test(S));

// Every link in the chain must be reported, in order.
[['roster membership','NOT ON ANY ROSTER'],
 ['the league week window','weekWindow'],
 ['which week the league is on','leagueWeek'],
 ['the feed returning nothing','FEED RETURNED NOTHING'],
 ['his school having no game','NO GAME INSIDE THIS LEAGUE WEEK'],
 ['whether the player doc exists','feedDocFound'],
 ['the live line','liveLine'],
 ['finished game ids','finishedGameIds'],
 ['whether each game matched a line','matched'],
 ['final vs live source','source'],
 ['the pre-draft rule','preDraft'],
 ['draft completion time','draftCompletedAt'],
 ['an explicit reason per game','scoredZeroBecause'],
 ['and the all-clear case','NOTHING WRONG']
].forEach(p=>ok('reports '+p[0], fn.indexOf(p[1])>-1, p[1]));

// It must not be able to change anything.
['save(','render(','state.games =','state.week =','state.day =','encodeState','schedulePush','makePick']
  .forEach(w=>ok('does not call '+w.replace('(',''), fn.indexOf(w)===-1, w));

ok('it reuses the real scoring predicate', /isPreDraftGame\(g\)/.test(fn),
  'a diagnostic that reimplements the rule can disagree with the app and send you the wrong way');
ok('it reuses the real feed loader', /loadRealWeek\(wk\)/.test(fn));
ok('it reuses the real school normaliser', /normSchool\(p\.college\)/.test(fn));
ok('it matches the live line the same way the scorer does',
  /rec\.live && rec\.live\.gameId === g\.gameId/.test(fn),
  'must mirror buildRealWeek exactly or it will clear a bug that is real');
ok('buildRealWeek still uses that same match', /liveLine && liveLine\.gameId === g\.gameId/.test(S));

ok('accepts a name, an id or an espnId',
  /String\(cand\.espnId \|\| ''\) === q/.test(fn) && /cand\.name \|\| ''\)\.toLowerCase\(\)\.indexOf\(q\) === 0/.test(fn));
ok('survives having no league loaded', /no season league on this device/.test(fn));
ok('catches its own errors', /catch\(function \(e\) \{ out\.stop = 'ERROR: '/.test(fn.replace(/\s+/g,' ')) ||
   /\.catch\(function \(e\)/.test(fn));

const sw=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
const build=(sw.match(/BUILD = '(\d+)'/)||[])[1];
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v'+build), build);
ok('index.html asks for it', [...new Set(html.match(/\?v=(\d+)/g)||[])].join()==='?v='+build, build);

console.log('\n'+pass+'/'+(pass+fail)+' whyZero checks pass');
process.exit(fail?1:0);
