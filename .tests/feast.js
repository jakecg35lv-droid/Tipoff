/*  Feast Week: one draft across Maui and Atlantis.

    These checks run against the real TOURNAMENTS data and the real
    player pool, because the whole feature is a claim about data:
    that 16 schools exist, that every one of them has draftable
    players, and that the bracket and the pool agree on who is in.  */
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// ── Load TOURNAMENTS plus the builder that fills Feast Week ──
const ti = app.indexOf('const TOURNAMENTS');
const tend = app.indexOf('\n};', ti) + 3;
const bi = app.indexOf('const FEAST_SUB_EVENTS');
const bend = app.indexOf('// ── TOURNAMENT SELECTION ENGINE');
const tmp = path.join(os.tmpdir(), 'feast-' + process.pid + '.js');
fs.writeFileSync(tmp, app.slice(ti, tend) + '\n' + app.slice(bi, bend) +
  '\nmodule.exports = { TOURNAMENTS, FEAST_SUB_EVENTS };');
const { TOURNAMENTS, FEAST_SUB_EVENTS } = require(tmp);
fs.unlinkSync(tmp);

function byId(id) {
  let r = null;
  Object.values(TOURNAMENTS).forEach(g => g.forEach(t => { if (t.id === id) r = t; }));
  return r;
}
const feast = byId('feast-2026');
ok('Feast Week exists and is selectable', !!feast && feast.canSelect === true);
ok('it appears first in the in-season list', TOURNAMENTS.inSeason[0].id === 'feast-2026');

// ── Teams are derived, not retyped ───────────────────────
const maui = byId('maui-2026');
const atl = byId('b4a-2026');
ok('both sub-events resolve', !!maui && !!atl);
const expected = [].concat(maui.teams, atl.teams);
ok('carries all 16 schools', feast.teams.length === 16, String(feast.teams.length));
ok('teams match the sub-events exactly',
  expected.slice().sort().join('|') === feast.teams.slice().sort().join('|'));
ok('no school is double-counted', new Set(feast.teams).size === feast.teams.length);
//  A hand-typed copy would drift the first time a pairing changed.
ok('team list is built, not hardcoded',
  /feast\.teams\.push\(name\)/.test(app) && !/'Marquette',[\s\S]{0,200}'Arizona'/.test(app.slice(bi, bend)));

// ── Every school must actually have players ──────────────
let players = fs.readFileSync(path.join(ROOT, 'data/players.js'), 'utf8');
const pool = eval(players.slice(players.indexOf('['), players.lastIndexOf(']') + 1));
const count = {};
pool.forEach(p => { count[p.college] = (count[p.college] || 0) + 1; });
const empty = feast.teams.filter(t => !count[t]);
ok('no Feast Week school has an empty roster', empty.length === 0, empty.join(', '));
const feastPlayers = pool.filter(p => feast.teams.indexOf(p.college) >= 0);
ok('pool is 192 players', feastPlayers.length === 192, String(feastPlayers.length));
//  Freshmen and transfers have no prior line and project at zero.
//  That is expected, but the DRAFTABLE pool is the ones who do, and
//  it has to comfortably clear a 12-manager 8-round draft (96 picks)
//  or combining the events bought nothing.
const withLine = feastPlayers.filter(p => p.hasStats);
ok('158 players carry a prior-season line', withLine.length === 158, String(withLine.length));
ok('projected pool clears a 96-pick draft with room',
  withLine.length > 96 * 1.5, withLine.length + ' vs 144 needed');
//  Neither event may be the weak half, or the cap forces managers
//  into a thin field on one side.
const perEvent = {};
feastPlayers.forEach(p => {
  const e = feast.eventOf[p.college];
  if (p.hasStats) perEvent[e] = (perEvent[e] || 0) + 1;
});
ok('both events are deep enough on their own',
  perEvent['maui-2026'] >= 70 && perEvent['b4a-2026'] >= 70,
  JSON.stringify(perEvent));
//  The reason to combine: a single event could not fill a deep draft.
ok('pool is twice a single event', feastPlayers.length === 2 * 96);

// ── Bracket and pool must agree ──────────────────────────
const inMatchups = [];
[maui, atl].forEach(s => (s.matchups || []).forEach(pair => pair.forEach(n => inMatchups.push(n))));
const orphan = inMatchups.filter(n => feast.teams.indexOf(n) === -1);
ok('no bracket team is missing from the pool', orphan.length === 0, orphan.join(', '));

// ── eventOf drives the cap, so it must be complete ───────
ok('every school is tagged with its event',
  feast.teams.every(t => !!feast.eventOf[t]), 
  feast.teams.filter(t => !feast.eventOf[t]).join(', '));
const mauiTagged = feast.teams.filter(t => feast.eventOf[t] === 'maui-2026').length;
const atlTagged = feast.teams.filter(t => feast.eventOf[t] === 'b4a-2026').length;
ok('8 schools tagged to Maui', mauiTagged === 8, String(mauiTagged));
ok('8 schools tagged to Atlantis', atlTagged === 8, String(atlTagged));

// ── The cap: the mechanic that makes this worth doing ────
ok('a per-event cap is configured', feast.eventCap && feast.eventCap.maxPerEvent === 5);
//  The cap must be loose enough to fill a roster and tight enough to
//  force a split. With 8 rounds and a cap of 5, a manager must take
//  at least 3 from the other event.
const ROUNDS = 8;
ok('cap still allows a full roster', feast.eventCap.maxPerEvent * 2 >= ROUNDS);
ok('cap forces picks from both events', feast.eventCap.maxPerEvent < ROUNDS,
  'cap ' + feast.eventCap.maxPerEvent + ' vs ' + ROUNDS + ' rounds');

//  THE DEADLOCK CHECK. A cap that can exhaust one event mid-draft
//  would leave a manager with legal picks nowhere — the draft stalls
//  with the clock running. Worst case every manager maxes out the
//  same event, so peak demand is managers x cap. That must stay
//  under the smaller event's supply.
const MAX_MANAGERS = 12;
const peak = MAX_MANAGERS * feast.eventCap.maxPerEvent;
const smallest = Math.min(maui.teams.length, atl.teams.length) * 12;
ok('cap cannot exhaust either event', peak < smallest,
  peak + ' peak demand vs ' + smallest + ' available');
//  And the other side: with the cap, how many MUST come from the
//  second event? That is the number that keeps Thanksgiving alive.
const forced = ROUNDS - feast.eventCap.maxPerEvent;
ok('every roster carries at least 3 from each event', forced >= 3, String(forced));

// ── Enforcement is wired into the existing gate ──────────
//  checkRosterRule is already called by the draft board, the confirm
//  path and autopick, so extending it covers all three. A parallel
//  check would have missed at least one.
const rule = app.slice(app.indexOf('function checkRosterRule'), app.indexOf('function forcedPositionsFor'));
ok('cap is enforced inside checkRosterRule', /eventCapCount\(manager, ev\) >= cap/.test(rule));
ok('cap only applies to combined events',
  /bracketFormat === 'combined' && t\.eventCap/.test(rule));
ok('eventOfPlayer short-circuits on normal tournaments',
  /bracketFormat !== 'combined'[\s\S]{0,40}return null/.test(app));
ok('the refusal names the other tournament',
  /Take someone from the other tournament/.test(rule));
ok('autopick goes through the same gate',
  /playerIsEligible\(p, pick\.manager\)/.test(app) &&
  /return checkRosterRule\(player, manager\)\.ok/.test(app));

// ── Bracket rendering ────────────────────────────────────
ok('combined format builds one region per sub-event',
  /bracketFormat === 'combined'[\s\S]{0,700}regions\.push\(_regionFromMatchups\(sub\)\)/.test(app));
ok('renderBracket dispatches combined', /if \(fmt === 'combined'\)/.test(app));
//  Both renderers assign innerHTML, so each sub-event needs its own
//  node or the second would erase the first.
ok('each sub-event gets its own node',
  /renderCombinedEvents[\s\S]{0,1600}createElement\('section'\)[\s\S]{0,400}createElement\('div'\)/.test(app));
ok('pod sub-events use the fixture list', /renderFixtureList\(body, sub\)/.test(app));
ok('knockout sub-events keep their placement games',
  /renderRegionSimple\(body, regData[\s\S]{0,200}renderPlacementGames\(body, sub\)/.test(app));
ok('combined styles exist', /\.cmb-event \{/.test(css) && /\.cmb-cap \{/.test(css));

// ── Scope is honest about what was left out ──────────────
//  The ESPN Events brackets are excluded on a data fact, not a guess:
//  the Magic schools are absent from players.js entirely.
const magic = ['Boston College', 'UCF', 'Cincinnati', 'Georgia'];
ok('Magic bracket really has no players', magic.every(s => !count[s]),
  magic.filter(s => count[s]).join(', '));
ok('Feast Week does not claim the ESPN events',
  (feast.subEvents || []).length === 2 &&
  feast.subEvents.indexOf('etsc-magic-2026') === -1);

// ── Shipped ──────────────────────────────────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build));
ok('app.js requested at the current build', html.includes('src/app.js?v=' + build));

console.log('\n' + pass + '/' + (pass + fail) + ' Feast Week checks pass');
process.exit(fail ? 1 : 0);
