/*  The stat pipeline's one-way door.

    On 16 Nov 2026 twelve final games scored zero for everybody and
    stayed that way. Nothing was broken in an obvious sense: ESPN had
    the box scores, the roster ids were right, the ET date handling
    was right, the schedule was right. The bug was an ORDER.

        gameBatch.set(..., completed: true)   // written first
        if (completed && alreadyFinal.has(id)) continue;
        const sumRes = await apiFetch(summary);
        if (!sumRes.ok) continue;             // silent
        } catch (e) { continue; }             // silent

    The flag meaning "this game is finished business" was set by the
    step BEFORE the step that does the work. One failed summary call
    left a document that said done with nothing behind it, and every
    later run believed it. The skip that existed to save API calls
    became the thing that guaranteed the data could never arrive.

    Two facts had been collapsed into one field:
      completed      — the game ended        (ESPN tells us)
      statsRecorded  — we read the box score (we find out)

    This suite holds them apart, in BOTH syncs, and proves every exit
    path still writes the document. An early `continue` added below
    the box-score fetch would silently drop a game from the
    collection, which is worse than the bug being fixed here.        */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
//  Strip comments first. The notes above and in the source quote the
//  deleted code verbatim, so an unstripped search would match the
//  explanation of the bug and call it the fix.
const F = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// Prove the stripper works, so a green run cannot be green because
// the assertions are reading prose.
ok('comment stripper removes block comments', !/one-way door/.test(F));
ok('comment stripper removes line comments',
  F.indexOf('written first') === -1);

const seasonFn = F.slice(F.indexOf('async function runSeasonSyncESPN'),
  F.indexOf('exports.syncSeasonFixtures'));
//  Sliced to the next export, not to a comment marker: comments are
//  stripped above, so a comment-based boundary silently returns -1
//  and swallows the rest of the file — which is how this slice first
//  "failed" by including the season sync's writer in the tournament
//  function's count.
const tourneyFn = F.slice(F.indexOf('async function runSyncESPN'),
  F.indexOf('exports.espnRosters'));

ok('found the season sync body', seasonFn.length > 2000, String(seasonFn.length));
ok('found the tournament sync body', tourneyFn.length > 2000, String(tourneyFn.length));

// ══ 1. The two facts are separate fields ═════════════════
[['season', seasonFn], ['tournament', tourneyFn]].forEach(function (pair) {
  const name = pair[0], fn = pair[1];

  ok(name + ': writes a statsRecorded flag', /statsRecorded: !!statsRecorded/.test(fn));
  ok(name + ': only flushGame sets it', (fn.match(/statsRecorded: /g) || []).length === 1,
    'a second writer could set it true without having read anything');
  ok(name + ': flushGame is the only writer of the game doc',
    (fn.match(/gameBatch\.set\(/g) || []).length === 1,
    'every exit path must go through one writer');

  //  The ordering invariant, stated as a position check rather than
  //  a vibe: the document must be built before the fetch and written
  //  after it.
  const iDoc = fn.indexOf('const gameDoc = {');
  const iFetch = fn.indexOf('summary?event=');
  const iFlushDef = fn.indexOf('const flushGame = function');
  ok(name + ': the game doc is built before the box score call', iDoc > -1 && iDoc < iFetch);
  ok(name + ': flushGame is defined before the box score call', iFlushDef > -1 && iFlushDef < iFetch);
  ok(name + ': statsRecorded is earned after counting lines',
    fn.indexOf('flushGame(linesFound > 0)') > iFetch,
    'the whole bug was setting the done flag before doing the work');

  // ══ 2. No silent exits ═════════════════════════════════
  ok(name + ': a failed summary is recorded', /report\.summaryFailures\.push/.test(fn));
  ok(name + ': an empty box score is recorded', /report\.emptyBoxScores\.push/.test(fn));
  ok(name + ': an unread final is recorded', /report\.unrecordedFinals\.push/.test(fn));
  ok(name + ': no bare `continue` on a failed fetch',
    !/if \(!sumRes\.ok\) continue;/.test(fn),
    'this exact line is how twelve games went quiet');
  ok(name + ': no bare `continue` in the summary catch',
    !/catch \(e\) \{ continue; \}/.test(fn));

  // ══ 3. Every exit writes the doc ═══════════════════════
  ok(name + ': the pre-tip exit flushes', /gameState === 'pre'\) \{ flushGame\(false\); continue; \}/.test(fn),
    'otherwise a scheduled game never appears at all');
  ok(name + ': the no-summary exit flushes', /if \(!summary\) \{ flushGame\(false\); continue; \}/.test(fn));
  ok(name + ': lines are counted outside the dryRun guard',
    /linesFound\+\+;/.test(fn) && fn.indexOf('linesFound++;') > fn.indexOf('report.playersWritten++'),
    'a dry run that under-reports sends you chasing a bug that is not there');
});

// ══ 4. The skip requires stats, not just completion ══════
ok('the skip set is built from statsRecorded, not completed',
  /statsRecorded === true\) alreadyFinal\.add/.test(seasonFn),
  'completed==true was the skip condition, and that is the bug');
ok('games still final-but-unread are counted, not dropped',
  /finalsNeedingStats/.test(seasonFn));
ok('the skip can be overridden', /alreadyFinal\.has\(String\(ev\.id\)\) && !options\.force/.test(seasonFn),
  'without force there is NO way to repair a poisoned day');
ok('force is reachable from the HTTP endpoint',
  /force: req\.query\.force === '1'/.test(F));
ok('force is not the default', /dryRun: req\.query\.write !== '1'/.test(F),
  'a backfill lever that runs by default is not a lever');

// ══ 5. The overnight sweep can see the new failure ═══════
ok('dateHasUnfinished is gone', !/dateHasUnfinished/.test(F),
  'it asked only for completed==false and so could not see this bug at all');
ok('dateNeedsWork replaces it', /async function dateNeedsWork/.test(F));
const sweep = F.slice(F.indexOf('async function dateNeedsWork'), F.indexOf('async function runSeasonSyncESPN'));
ok('the sweep treats unfinished as work', /g\.completed !== true/.test(sweep));
ok('and treats final-without-stats as work', /g\.statsRecorded !== true/.test(sweep));
ok('it does not query statsRecorded == false', !/where\('statsRecorded'/.test(sweep),
  'a missing field does not match an equality filter, so the stale docs would be invisible');
ok('the sweep forces past the skip', /dateOverride: yest, force: true/.test(F),
  'otherwise the repair sweep is a no-op for the case it exists to repair');

// ══ 6. It gets said out loud ═════════════════════════════
ok('there is one place that decides to shout', /function warnOnUnread/.test(F));
ok('it uses error severity', /console\.error\(tag \+ ' BOX SCORES MISSING'/.test(F),
  'log and error read identically when nobody is watching');
ok('it stays quiet on a clean run', /if \(!unread && !failed && !empty\) return;/.test(F));
ok('the season schedule calls it', /warnOnUnread\('\[Tipoff season\]', report\)/.test(F));
ok('the catch-up calls it too', /warnOnUnread\('\[Tipoff season\] catch-up', catchUp\)/.test(F));
ok('the tournament schedule calls it', /warnOnUnread\('\[Tipoff\]', report\)/.test(F));
ok('the tournament sync returns its report to be checked',
  /const report = await runSyncESPN\(\{ window: win \}\)/.test(F),
  'the result used to be thrown away, so nothing could inspect it');

// ══ 7. Bracket advancement stays independent ═════════════
//  Deliberately NOT gated on the box score: a failed summary call
//  must not freeze everybody's bracket.
ok('winnerSchool still comes from the scoreboard',
  /winnerSchool: \(completed && winner\) \? winner\.school : null/.test(tourneyFn));
ok('and is part of the doc built before the fetch',
  tourneyFn.indexOf('winnerSchool:') < tourneyFn.indexOf('summary?event='));

console.log('\n' + pass + '/' + (pass + fail) + ' stat sync checks pass');
process.exit(fail ? 1 : 0);
