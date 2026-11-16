/*  The draft queue is per team.

    It used to be one array — state.draft.queue — in the shared
    league document. Every manager wrote to it and every manager read
    it, so starring a player put him in all eight "Your queue" lists.
    That reads as the queue auto-populating.

    It was not only cosmetic. queueChoice() feeds the autopick, so a
    manager's clock expiring could hand him a player somebody else
    had lined up, and the host-covering branch claimed to honour an
    absent manager's queue while reading the shared blob.          */
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
ok('comment stripper kept the code', /function queueOf/.test(code));

// ══ 1. The shared array is gone ══════════════════════════
/*  One missed read and that surface still shows the whole league's
    queue, which is exactly the reported symptom. */
/*  The migration block legitimately reads the legacy field in order
    to retire it. Cut it out and require the REST of the file to be
    clean — that is where a missed read would still show the whole
    league's queue. */
const migStart = code.indexOf('if (!d.queues)');
const migEnd = code.indexOf('delete d.queue;') + 'delete d.queue;'.length;
ok('the migration block was located', migStart > 0 && migEnd > migStart);
const outside = code.slice(0, migStart) + code.slice(migEnd);
const strays = (outside.match(/\.queue\b(?!s)/g) || []).length;
ok('nothing outside the migration reads a shared .queue', strays === 0,
  strays + ' left: ' + (outside.match(/.*\.queue\b(?!s).*/g) || []).map(l => l.trim()).join(' | '));
ok('the migration reads the legacy field then deletes it',
  /Array\.isArray\(d\.queue\)/.test(code) && /delete d\.queue;/.test(code));
ok('queues is keyed by team', /if \(!d\.queues\[teamId\]\) d\.queues\[teamId\] = \[\];/.test(code));
ok('restart clears every queue', /d\.queues = \{\};/.test(code));

// ══ 2. Migration is deterministic ════════════════════════
/*  Every device runs it independently, so they must all reach the
    same answer or they will fight over the synced document. */
(function () {
  const i = code.indexOf('function draftCfg');
  const open = code.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < code.length; k++) {
    if (code[k] === '{') d++;
    else if (code[k] === '}') { d--; if (d === 0) { end = k; break; } }
  }
  const run = new Function('st', [
    'var state = st;',
    code.slice(i, end + 1),
    'return draftCfg();'
  ].join('\n'));

  const mk = (teams, queue) => ({ teams, draft: { pick: 0, status: 'pre', timerSecs: 60, queue } });

  //  Solo / nobody has claimed a seat: the array has one owner.
  const solo = run(mk([{ id: 't0' }, { id: 't1' }], ['p1', 'p2']));
  ok('a solo league keeps its queue', JSON.stringify(solo.queues.t0) === '["p1","p2"]');
  ok('and nobody else inherits it', solo.queues.t1 === undefined);

  //  One claimed seat is still unambiguous.
  const one = run(mk([{ id: 't0', uid: 'uA' }, { id: 't1' }], ['p1']));
  ok('one claimed seat keeps its queue', JSON.stringify(one.queues.t0) === '["p1"]');

  //  THE REAL CASE: a live league. Unattributable, so dropped.
  const many = run(mk([{ id: 't0', uid: 'uA' }, { id: 't1', uid: 'uB' }], ['p1', 'p2', 'p3']));
  ok('a multi-manager league drops the shared entries',
    JSON.stringify(many.queues) === '{}',
    'inheriting a stranger queue is the bug; losing one is an annoyance');

  //  Idempotent, and the legacy field is removed either way.
  ok('the legacy field is deleted', solo.queue === undefined && many.queue === undefined);
  const twice = run(mk([{ id: 't0' }], ['p1']));
  const again = run({ teams: [{ id: 't0' }], draft: twice });
  ok('running the migration twice changes nothing',
    JSON.stringify(again.queues.t0) === '["p1"]');
  ok('an empty legacy queue migrates to nothing',
    JSON.stringify(run(mk([{ id: 't0' }], [])).queues) === '{}');
  ok('a missing legacy queue is fine',
    JSON.stringify(run(mk([{ id: 't0' }], undefined)).queues) === '{}');
})();

// ══ 3. Writes only ever touch my own seat ════════════════
/*  userTeam() still falls back to seat 0 when it cannot identify the
    account, so anything that WRITES must refuse rather than edit a
    stranger's list. */
(function () {
  const i = code.indexOf('function myQueueId');
  const open = code.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < code.length; k++) {
    if (code[k] === '{') d++;
    else if (code[k] === '}') { d--; if (d === 0) { end = k; break; } }
  }
  const run = new Function('team', 'uid', [
    'function userTeam() { return team; }',
    'function myUid() { return uid; }',
    code.slice(i, end + 1),
    'return myQueueId();'
  ].join('\n'));
  ok('my own seat is mine', run({ id: 't3', uid: 'uA' }, 'uA') === 't3');
  ok('a seat I do not hold is refused', run({ id: 't0', uid: 'uB' }, 'uA') === null,
    'this is the seat-0 fallback writing into a stranger list');
  ok('an unclaimed seat is allowed', run({ id: 't0' }, 'uA') === 't0');
  ok('no team at all is refused', run(null, 'uA') === null);
  ok('no uid falls back to the seat', run({ id: 't0', uid: 'uB' }, null) === 't0',
    'solo and offline play must still work');
})();
ok('adding refuses without a seat',
  /var id = myQueueId\(\);\s*if \(!id\) return;/.test(code));
ok('clearing only clears mine',
  /case 'qclear': \(function \(\) \{ var id = myQueueId\(\); if \(id\) draftCfg\(\)\.queues\[id\] = \[\]; \}\)\(\);/.test(code),
  'it used to empty the whole league');

// ══ 4. Autopick reads the right queue ════════════════════
ok('queueChoice takes a team', /function queueChoice\(teamId\)/.test(code));
ok('it defaults to my seat', /var taken = drafted\(\), u = teamId \|\| myQueueId\(\);/.test(code));
ok('it refuses when there is no seat', /if \(!u\) return null;/.test(code));
ok('my own autopick uses my queue', /var qid = queueChoice\(\), pid = qid \|\| botChoose\(t\.id\);/.test(code));
/*  The covering branch always SAID it honoured the absent manager's
    queue. With one shared array it could not. Now it can. */
ok('covering an absent manager honours HIS queue',
  /var oq = queueChoice\(t\.id\);/.test(code));
ok('the manual autopick button uses my queue',
  /var ap = queueChoice\(\) \|\| botChoose\(onClock\(\)\);/.test(code));

// ══ 5. A drafted player leaves every queue ═══════════════
/*  He is out of the pool. Left behind in seven other lists he is
    seven autopicks that skip a dead entry. */
ok('a pick is removed from all queues',
  /Object\.keys\(qs\)\.forEach\(function \(tid\) \{[\s\S]{0,160}?indexOf\(pid\)/.test(code));
(function () {
  const m = code.match(/var qs = draftCfg\(\)\.queues \|\| \{\};[\s\S]*?\}\);/);
  ok('the removal is liftable', !!m);
  if (!m) return;
  const run = new Function('queues', 'pid', [
    'function draftCfg() { return { queues: queues }; }',
    m[0],
    'return queues;'
  ].join('\n'));
  const qs = { t0: ['p1', 'p2'], t1: ['p2', 'p3'], t2: [], t3: ['p9'] };
  const after = run(qs, 'p2');
  ok('it is gone from every list that had it',
    JSON.stringify(after.t0) === '["p1"]' && JSON.stringify(after.t1) === '["p3"]');
  ok('lists that lacked him are untouched',
    JSON.stringify(after.t3) === '["p9"]' && JSON.stringify(after.t2) === '[]');
})();

// ══ 6. Every display surface shows MY queue ══════════════
for (const [what, re] of [
  ['the draft hero count', /var qn = myQueue\(\)\.filter/],
  ['the best-available stars', /var q = \{\}; myQueue\(\)\.forEach/],
  ['the player pool ordering', /var q = myQueue\(\);/],
  ['the player card state', /var qd = myQueue\(\)\.indexOf\(pid\) >= 0;/],
  ['reordering', /var q = myQueue\(\), at = q\.indexOf\(pid\), to = at \+ dir;/],
]) ok(what + ' reads my queue', re.test(code));

// ══ 7. Firestore shape ═══════════════════════════════════
/*  Firestore rejects an array that directly contains an array. A map
    whose values are arrays is fine, which is what queues is. */
ok('queues is a map, not an array of arrays',
  /d\.queues = \{\};/.test(code) && !/d\.queues = \[\]/.test(code));
ok('queues rides inside state.draft and is synced',
  !/delete copy\.draft/.test(code) && !/delete .*queues/.test(code));

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for the current build',
  [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' queue checks pass');
process.exit(fail ? 1 : 0);
