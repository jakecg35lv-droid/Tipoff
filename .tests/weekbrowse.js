/*  Matchups: looking back at a finished week.

    Everything the page needs already took an optional `week` —
    teamScore, slotsOf, teamProjected, settledFraction, weekLabel,
    weekDates, matchKind — viewMatchup simply never passed one. So
    the risk here is not the plumbing, it is leaving a `state.week`
    behind somewhere and rendering half of last week beside half of
    this one.                                                      */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/season/season.css'), 'utf8');
const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
ok('comment stripper kept the code', /function viewMatchup/.test(code));

// ══ 1. shownWeek is always in range ══════════════════════
ok('shownWeek exists', /function shownWeek/.test(code));
(function () {
  const i = code.indexOf('function shownWeek');
  const open = code.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < code.length; k++) {
    if (code[k] === '{') d++;
    else if (code[k] === '}') { d--; if (d === 0) { end = k; break; } }
  }
  const run = new Function('viewWeek', 'liveWeek', [
    'var ui = { viewWeek: viewWeek };',
    'var state = { week: liveWeek };',
    code.slice(i, end + 1),
    'return shownWeek();'
  ].join('\n'));
  ok('null follows the live week', run(null, 5) === 5);
  ok('a past week is honoured', run(2, 5) === 2);
  ok('week 1 is reachable', run(1, 5) === 1);
  //  A stale value must never point at a week that was not played.
  ok('a future week clamps to live', run(99, 5) === 5, String(run(99, 5)));
  ok('zero clamps up to week 1', run(0, 5) === 5, 'falsy means follow live');
  ok('a negative clamps to week 1', run(-3, 5) === 1, String(run(-3, 5)));
  //  A rollover must pull a viewer forward, not strand them.
  ok('the live week moving does not strand a follower', run(null, 6) === 6);
})();

// ══ 2. A finished week shows what was RECORDED ═══════════
/*  finalizeWeek wrote homePts/awayPts when the week closed. A later
    feed correction could make a recomputed tally disagree with the
    standings, and the recorded number is the one that counted. */
ok('recordedResult exists', /function recordedResult/.test(code));
(function () {
  const i = code.indexOf('function recordedResult');
  const open = code.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < code.length; k++) {
    if (code[k] === '{') d++;
    else if (code[k] === '}') { d--; if (d === 0) { end = k; break; } }
  }
  const run = new Function('results', 'week', 'a', 'b', [
    'var state = { results: results };',
    code.slice(i, end + 1),
    'return recordedResult(week, a, b);'
  ].join('\n'));
  const rs = [
    { week: 1, home: 't0', away: 't1', homePts: 138.9, awayPts: 141.5 },
    { week: 1, home: 't2', away: 't3', homePts: 168.2, awayPts: 136.8 },
    { week: 2, home: 't0', away: 't2', homePts: 101.1, awayPts: 99.9 }
  ];
  ok('finds the right week and pairing', run(rs, 1, 't0', 't1').homePts === 138.9);
  ok('does not cross weeks', run(rs, 2, 't0', 't2').homePts === 101.1);
  ok('respects home/away order', run(rs, 1, 't1', 't0') === null,
    'reversed is a different pairing');
  ok('an unplayed week has no record', run(rs, 9, 't0', 't1') === null);
  ok('missing results do not throw', run(undefined, 1, 't0', 't1') === null);
})();

// ══ 3. Nothing in the view still reads the live week ═════
/*  The actual risk of this change: one missed state.week renders
    half of last week beside half of this one. */
const view = code.slice(code.indexOf('function viewMatchup'), code.indexOf('function viewStandings'));
const strays = (view.match(/state\.week/g) || []).length;
/*  Exactly two are legitimate inside the view: deriving `past`, and
    bounding the forward arrow. Both are pinned by name below, so
    this count is the tripwire for a THIRD appearing — which would
    mean some part of the page had drifted back to the live week. */
ok('state.week appears only where it bounds the range', strays === 2,
  String(strays) + ': ' + (view.match(/.*state\.week.*/g) || []).map(l => l.trim()).join(' | '));
ok('past is derived from it', /var past = wk < state\.week;/.test(view));
ok('the arrows are bounded by it', /canBack = wk > 1, canFwd = wk < state\.week/.test(view));
for (const call of ['weekLabel(wk)', 'weekDates(wk)', 'slotsOf(lId, wk)', 'slotsOf(rId, wk)',
                    'matchKind(wk, i)', 'matchKind(wk, cur)', 'state.schedule[wk - 1]']) {
  ok('view uses ' + call, view.includes(call));
}
ok('scores go through one week-aware helper', /var scoreOf = function \(id\)/.test(view));
ok('the switcher uses it', /var ls = scoreOf\(l\), rs = scoreOf\(r\);/.test(view));
ok('the detail pane uses it', /var ls = scoreOf\(lId\), rs = scoreOf\(rId\);/.test(view));

// ══ 4. A finished week is read-only and not forecast ═════
ok('no lock decisions are offered on a past week',
  /var dec = \(isMine && !past\)/.test(view),
  'there is nothing left to decide');
ok('a past week is treated as fully settled', /var weekOver = past \|\| settledPct >= 100;/.test(view));
ok('projections are the real scores on a past week',
  /var lp = past \? ls : teamProjected\(lId, wk\)/.test(view));
ok('a past week shows its numbers even at 0-0',
  /var anyLive = past \|\| \(ls \+ rs\) > 0;/.test(view),
  'a real 0-0 must not be hidden as "not started"');
ok('the help button is replaced by a Final tag', /mx-final-tag/.test(view));

// ══ 5. Navigation ════════════════════════════════════════
ok('back steps a week', /case 'weekback': ui\.viewWeek = Math\.max\(1, shownWeek\(\) - 1\)/.test(code));
ok('forward steps a week', /case 'weekfwd':/.test(code));
ok('reaching live resumes following it',
  /if \(ui\.viewWeek >= state\.week\) ui\.viewWeek = null;/.test(code),
  'otherwise a rollover would strand the viewer');
ok('there is a direct way back to live', /case 'weeklive': ui\.viewWeek = null/.test(code));
/*  Matchup index 3 is a different pairing each week, so carrying it
    across a week change lands you on a stranger's game. */
ok('changing week clears the selected matchup',
  (code.match(/ui\.viewWeek = [^;]+; ui\.mview = null;/g) || []).length >= 2 ||
  /weekback[\s\S]{0,160}ui\.mview = null[\s\S]{0,200}weekfwd/.test(code));
ok('leaving the page returns to the live week',
  /case 'nav':[^\n]*ui\.viewWeek = null;/.test(code));

// ══ 6. It cannot blank the page ══════════════════════════
/*  slotsOf indexed straight through state.lineups[week][teamId] and
    threw for any week a freshly loaded device had not got. Fine
    while only the live week was asked for. */
ok('slotsOf tolerates a week with no lineups',
  /return \(state\.lineups\[week \|\| state\.week\] \|\| \{\}\)\[teamId\] \|\| \[\];/.test(code));
(function () {
  const m = code.match(/function slotsOf[\s\S]*?\n  \}/);
  const run = new Function('lineups', 'week', [
    'var state = { lineups: lineups, week: 2 };',
    m[0],
    'return slotsOf("t0", week);'
  ].join('\n'));
  ok('a missing week yields an empty roster', JSON.stringify(run({}, 1)) === '[]');
  ok('a missing team yields an empty roster', JSON.stringify(run({ 1: {} }, 1)) === '[]');
  ok('a present roster is returned as-is',
    JSON.stringify(run({ 1: { t0: [{ playerId: 'p1' }] } }, 1)) === '[{"playerId":"p1"}]');
  ok('the live week still works with no argument',
    JSON.stringify(run({ 2: { t0: [1, 2] } }, undefined)) === '[1,2]');
})();

// ══ 7. Styling ═══════════════════════════════════════════
for (const c of ['.mx-wknav', '.mx-wk-arrow', '.mx-wk-lab', '.mx-wk-live', '.mx-final-tag']) {
  ok('styled: ' + c, new RegExp('\\' + c + '[\\s,{]').test(css));
}
ok('ends are disabled, not hidden', /\.mx-wk-arrow:disabled \{[^}]*opacity/.test(css),
  'hiding them makes the row jump width');
ok('the label has a fixed minimum width', /\.mx-wk-lab \{[^}]*min-width/.test(css));
ok('it adapts on a phone', /@media \(max-width: 768px\)[\s\S]{0,200}\.mx-wk-lab/.test(css));

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for the current build',
  [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' week-browse checks pass');
process.exit(fail ? 1 : 0);
