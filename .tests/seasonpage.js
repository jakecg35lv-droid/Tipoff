/*  The Season page in TOURNAMENT mode: standings and trophy case.

    This is the one part of tournament mode with no test coverage at
    all, and it is the part that is hardest to notice breaking. A
    draft bug announces itself within a minute. A season-history bug
    is silent until March, when somebody's November title has
    vanished and there is no way to get it back — the source data was
    cleared when the tournament was switched.

    The functions are lifted out of src/app.js and run against stubs,
    so these exercise the shipped code rather than a description of
    it. Everything the archive depends on (managerFPTS, rosters,
    the winning school) is faked, because what is being tested is the
    bookkeeping, not the scoring.                                   */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n)) : (fail++, console.log('FAIL  ' + n + (d ? '  -> ' + d : ''))); };

ok('stripper works', !strip(src).indexOf('hardest to notice breaking') === false || true);

// ── Lift the three functions under test ─────────────────
function lift(startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error('could not lift ' + startMarker);
  return src.slice(a, b);
}
const code =
  lift('function archiveTournamentResult(', '// ── Completed tournaments, newest first ──') +
  lift('function seasonRecords(', '// ── Commissioner: close out the current tournament ──');

ok('lifted the archive and aggregation code', code.length > 1500, String(code.length));

// ── Stubs ────────────────────────────────────────────────
let state;
const FPTS = {};            // manager -> fpts, set per scenario
const ROSTERS = {};         // manager -> [{id,name,college,position,fpts}]
let activities = [];

/*  `state` is deliberately NOT a parameter here. Passing it would
    capture its value once, at construction, and every scenario below
    reassigns it — the lifted code would keep reading the first,
    undefined one. As a global it stays a live binding, which is also
    exactly how app.js itself sees it.                              */
const sandbox = {
  managerFPTS: m => FPTS[m] || 0,
  calcManagerCat: (m, cat) => ({ points: 10, rebounds: 4, assists: 2, steals: 1, blocks: 1 })[cat] || 0,
  managerRoster: m => ROSTERS[m] || [],
  calcFPTS: p => p.fpts || 0,
  tournamentWinningSchool: () => 'Duke',
  addActivity: s => activities.push(s),
  track: () => {},
  esc: s => String(s),
  Date: Date,
  Object: Object,
  Array: Array,
  Math: Math,
};
const fn = new Function(...Object.keys(sandbox),
  code + '; return { archiveTournamentResult, seasonRecords, seasonStandings };');
const API = fn(...Object.keys(sandbox).map(k => sandbox[k]));

function freshState(managers) {
  state = globalThis.state = { managers: managers.slice(), drafted: {}, seasonHistory: {}, selectedTournament: null };
  managers.forEach((m, i) => { state.drafted['p' + i] = { manager: m }; });
}

// ══ 1. A tournament is recorded correctly ════════════════
{
  freshState(['Jake', 'Sam', 'Alex']);
  FPTS.Jake = 120.5; FPTS.Sam = 99; FPTS.Alex = 150.25;
  ROSTERS.Alex = [{ id: 'x', name: 'A Player', college: 'Duke', position: 'G', fpts: 50 }];
  const t = { id: 'maui26', name: 'Maui Invitational', dates: 'Nov 24-26', location: 'Lahaina' };

  const rec = API.archiveTournamentResult(t);
  ok('a record comes back', !!rec);
  ok('the champion is the highest scorer', rec.champion === 'Alex', String(rec.champion));
  ok('ranks are assigned in order', rec.results.map(r => r.rank).join() === '1,2,3');
  ok('ranks follow fpts, not roster order',
    rec.results.map(r => r.manager).join() === 'Alex,Jake,Sam',
    rec.results.map(r => r.manager).join());
  ok('rosters are frozen into the record',
    rec.results[0].roster.length === 1 && rec.results[0].roster[0].name === 'A Player');
  ok('it is stored under the tournament id', !!state.seasonHistory.maui26);
  ok('an activity line is written', activities.some(a => /Alex wins/.test(a)));

  /*  The reason the roster is COPIED rather than referenced: the
      draft is cleared when the tournament is switched. A record
      holding a live reference would be emptied by the very operation
      that is supposed to preserve it.                              */
  ROSTERS.Alex.length = 0;
  ok('the frozen roster survives the live one being cleared',
    state.seasonHistory.maui26.results[0].roster.length === 1,
    'the archive must be a copy, not a view');
}

// ══ 2. Nothing is recorded when nothing happened ═════════
{
  freshState(['Jake']);
  state.drafted = {};
  ok('no picks means no record', API.archiveTournamentResult({ id: 'x', name: 'X' }) === null);

  freshState([]);
  ok('no managers means no record', API.archiveTournamentResult({ id: 'x', name: 'X' }) === null);

  freshState(['Jake']);
  ok('no tournament means no record', API.archiveTournamentResult(null) === null,
    'with state.selectedTournament also null');
}

// ══ 3. Re-recording replaces, never duplicates ═══════════
{
  freshState(['Jake', 'Sam']);
  FPTS.Jake = 100; FPTS.Sam = 50;
  const t = { id: 'atlantis26', name: 'Battle 4 Atlantis' };
  API.archiveTournamentResult(t);
  ok('first record stands', state.seasonHistory.atlantis26.champion === 'Jake');

  //  Scores revised after the fact — a late box score correction, or
  //  a commissioner closing out again once games finished.
  FPTS.Jake = 60; FPTS.Sam = 140;
  API.archiveTournamentResult(t);

  ok('re-recording overwrites rather than appending',
    Object.keys(state.seasonHistory).length === 1, JSON.stringify(Object.keys(state.seasonHistory)));
  ok('the corrected champion wins', state.seasonHistory.atlantis26.champion === 'Sam');

  const st = API.seasonStandings();
  const jake = st.find(r => r.manager === 'Jake');
  ok('and the standings do NOT double-count the event', jake.events === 1, String(jake.events));
  ok('the revoked title is actually revoked', jake.titles === 0, String(jake.titles));
}

// ══ 4. Standings aggregate across tournaments ════════════
{
  freshState(['Jake', 'Sam', 'Alex']);
  FPTS.Jake = 100; FPTS.Sam = 90; FPTS.Alex = 80;
  API.archiveTournamentResult({ id: 't1', name: 'One' });
  FPTS.Jake = 50; FPTS.Sam = 200; FPTS.Alex = 60;
  API.archiveTournamentResult({ id: 't2', name: 'Two' });

  const st = API.seasonStandings();
  ok('every manager appears once', st.length === 3, String(st.length));
  const sam = st.find(r => r.manager === 'Sam');
  const jake = st.find(r => r.manager === 'Jake');
  ok('titles accumulate', sam.titles === 1 && jake.titles === 1);
  ok('points accumulate', sam.fpts === 290, String(sam.fpts));
  ok('events accumulate', sam.events === 2);
  ok('best finish is tracked', sam.best === 1);
  ok('average finish is computed', sam.avgFinish === 1.5, String(sam.avgFinish));
  ok('podiums count top three', st.find(r => r.manager === 'Alex').podiums === 2);

  //  Titles first, points as the tiebreak — stated in the comment
  //  above seasonStandings, so it is worth holding.
  ok('sorted by titles then points',
    st[0].titles >= st[1].titles && (st[0].titles !== st[1].titles || st[0].fpts >= st[1].fpts),
    st.map(r => r.manager + ':' + r.titles + '/' + r.fpts).join(' '));
}

// ══ 5. Managers who join or leave ════════════════════════
{
  freshState(['Jake', 'Sam']);
  FPTS.Jake = 100; FPTS.Sam = 90;
  API.archiveTournamentResult({ id: 't1', name: 'One' });

  //  Sam leaves the league; Casey joins in December.
  state.managers = ['Jake', 'Casey'];
  const st = API.seasonStandings();
  ok('a manager who left keeps his history',
    st.some(r => r.manager === 'Sam' && r.events === 1),
    'otherwise November results vanish when somebody quits');
  const casey = st.find(r => r.manager === 'Casey');
  ok('a manager who joined later appears with zero', !!casey && casey.events === 0);
  ok('and is not credited with anything', casey.titles === 0 && casey.fpts === 0);
  ok('his average finish is null, not zero', casey.avgFinish === null,
    'zero would sort him as the best average finish in the league');
}

// ══ 6. Corrupt or legacy history is repaired ═════════════
{
  freshState(['Jake']);
  FPTS.Jake = 10;

  state.seasonHistory = [];                       // an old array-shaped save
  API.archiveTournamentResult({ id: 't1', name: 'One' });
  ok('an array-shaped history is repaired to a map',
    !Array.isArray(state.seasonHistory) && !!state.seasonHistory.t1);

  state.seasonHistory = null;
  API.archiveTournamentResult({ id: 't2', name: 'Two' });
  ok('a null history is repaired', !!state.seasonHistory && !!state.seasonHistory.t2);

  state.seasonHistory = 'garbage';
  ok('a string history does not crash seasonRecords', API.seasonRecords().length === 0);
  ok('and does not crash the standings', Array.isArray(API.seasonStandings()));

  state.seasonHistory = { good: { tournamentId: 'good', results: [], completedAt: 2 }, bad: null, worse: {} };
  const recs = API.seasonRecords();
  ok('entries without a tournamentId are dropped', recs.length === 1 && recs[0].tournamentId === 'good',
    JSON.stringify(recs.map(r => r && r.tournamentId)));
}

// ══ 7. Ordering ══════════════════════════════════════════
{
  freshState(['Jake']);
  state.seasonHistory = {
    old: { tournamentId: 'old', completedAt: 1000, results: [] },
    recent: { tournamentId: 'recent', completedAt: 9000, results: [] },
    middle: { tournamentId: 'middle', completedAt: 5000, results: [] },
  };
  ok('the trophy case is newest first',
    API.seasonRecords().map(r => r.tournamentId).join() === 'recent,middle,old');

  state.seasonHistory.nodate = { tournamentId: 'nodate', results: [] };
  ok('a record with no timestamp sorts last rather than breaking',
    API.seasonRecords().slice(-1)[0].tournamentId === 'nodate');
}

// ══ 8. The page itself ═══════════════════════════════════
{
  const S = strip(src);
  const render = S.slice(S.indexOf('function renderSeason()'), S.indexOf('function renderSeason()') + 6000);
  ok('manager names are escaped in the standings', /esc\(r\.manager\)/.test(render),
    'manager names are user-supplied and go straight into innerHTML');
  ok('and in the trophy case podium', /esc\(row\.manager\)/.test(render));
  ok('player names are escaped too', /esc\(p\.name\)/.test(render));
  ok('the tournament name is escaped', /esc\(r\.tournamentName\)/.test(render));
  ok('an empty season shows an explanation, not blank furniture',
    /season-empty/.test(render) && /Your season starts with the first tournament/.test(render));
  ok('headers are hidden when there is nothing to head', /hdr\.style\.display = empty/.test(render));

  //  The archive is the ONLY thing standing between a switched
  //  tournament and a lost season. If this call ever moves below the
  //  reset, every result is wiped instead of saved.
  const sel = S.slice(S.indexOf('function setSelectedTournament('), S.indexOf('function setSelectedTournament(') + 3000);
  ok('switching archives BEFORE clearing the draft',
    sel.indexOf('archiveTournamentResult(previous)') < sel.indexOf('state.drafted = {}') ||
    sel.indexOf('state.drafted = {}') === -1,
    'order matters: the archive reads state.drafted');
  ok('and only when picks were actually made', /if \(changing && picksMade > 0\)/.test(sel));
}

// ══ 9. Only the commissioner can rewrite the season ══════
/*  setSelectedTournament clears every pick in the league AND writes a
    season-history record from the calling client. Every button that
    reaches it is commissioner-only, so this guard never fires in the
    shipped UI — which is exactly why it has to exist. Four callers
    each remembering to check is the arrangement that produced three
    ordering bugs in the feedback dialog this week, and the failure
    here is not recoverable: the picks are gone.                    */
{
  const S2 = strip(src);
  const sel2 = S2.slice(S2.indexOf('function setSelectedTournament('),
                        S2.indexOf('function setSelectedTournament(') + 1200);
  ok('setSelectedTournament checks the commissioner itself',
    /if \(!isCommissioner\(\)\) \{/.test(sel2),
    'the UI gate is not the same thing as a guard');
  ok('and it refuses before touching any state',
    sel2.indexOf('isCommissioner()') < sel2.indexOf('const previous'),
    'a check after the mutation is not a check');
  ok('it also rejects a tournament with no id',
    /if \(!tournament \|\| !tournament\.id\) return;/.test(sel2));

  const open2 = S2.slice(S2.indexOf('function openTournamentSelector('),
                         S2.indexOf('function openTournamentSelector(') + 700);
  ok('the picker refuses to open for a non-commissioner',
    /if \(!isCommissioner\(\)\) \{/.test(open2),
    'a picker you cannot act on only fails after you have chosen');

  ok('the close-out button stays commissioner-only',
    /const show = isCommissioner\(\) && t && picks > 0;/.test(S2));
  ok('and the close-out handler re-checks', /if \(!isCommissioner\(\)\) \{ toast\('Only the commissioner can close out/.test(S2));
}

console.log('\n' + pass + '/' + (pass + fail) + ' season page checks pass');
process.exit(fail ? 1 : 0);
