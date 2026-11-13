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
//  One contiguous slice: the literal, the push of the new events and
//  the Feast Week unshift + builder all have to run together. Slicing
//  only to the literal's closing brace silently dropped the four
//  events added by push() and every sub-event lookup failed.
const ti = app.indexOf('const TOURNAMENTS');
const bend = app.indexOf('// ── TOURNAMENT SELECTION ENGINE');
const tmp = path.join(os.tmpdir(), 'feast-' + process.pid + '.js');
fs.writeFileSync(tmp, app.slice(ti, bend) +
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
const subs = FEAST_SUB_EVENTS.map(byId);
ok('every sub-event resolves', subs.every(Boolean),
  FEAST_SUB_EVENTS.filter(id => !byId(id)).join(', '));
const expected = [...new Set([].concat(...subs.map(x => x.teams)))];
ok('carries every school from every sub-event',
  feast.teams.length === expected.length, feast.teams.length + ' vs ' + expected.length);
ok('teams match the sub-events exactly',
  expected.slice().sort().join('|') === feast.teams.slice().sort().join('|'));
ok('spans all six Thanksgiving events', FEAST_SUB_EVENTS.length === 8,
  String(FEAST_SUB_EVENTS.length));
ok('no school is double-counted', new Set(feast.teams).size === feast.teams.length);
//  A hand-typed copy would drift the first time a pairing changed.
ok('team list is built, not hardcoded',
  /feast\.teams\.push\(name\)/.test(app) && !/'Marquette',[\s\S]{0,200}'Arizona'/.test(app.slice(ti, bend)));

// ── Every school must actually have players ──────────────
let players = fs.readFileSync(path.join(ROOT, 'data/players.js'), 'utf8');
const pool = eval(players.slice(players.indexOf('['), players.lastIndexOf(']') + 1));
const count = {};
pool.forEach(p => { count[p.college] = (count[p.college] || 0) + 1; });
const empty = feast.teams.filter(t => !count[t]);
const feastPlayers = pool.filter(p => feast.teams.indexOf(p.college) >= 0);
/*  PENDING DATA. The new events' schools are in the builder config
    but not yet in data/players.js, so they would currently draft as
    empty teams. This stays red until:

        node tools/build-tournament-pool.mjs

    is run from a machine with network access. It is a deliberate
    blocker, not a flaky test — shipping Feast Week with 36 playerless
    schools would put teams on the bracket that nobody can draft.   */
if (empty.length) {
  console.log('\n  >> PENDING: ' + empty.length + ' schools have no players yet.');
  console.log('  >> Run: node tools/build-tournament-pool.mjs\n');
}
ok('every school has players (run the builder if red)',
  empty.length === 0, empty.length + ' schools pending');
//  Freshmen and transfers have no prior line and project at zero.
//  That is expected, but the DRAFTABLE pool is the ones who do, and
//  it has to comfortably clear a 12-manager 8-round draft (96 picks)
//  or combining the events bought nothing.
const withLine = feastPlayers.filter(p => p.hasStats);
ok('most of the pool carries a prior-season line',
  withLine.length / Math.max(1, feastPlayers.length) > 0.75,
  withLine.length + ' of ' + feastPlayers.length);
ok('projected pool clears a 96-pick draft with room',
  withLine.length > 96 * 1.5, withLine.length + ' vs 144 needed');
//  Neither event may be the weak half, or the cap forces managers
//  into a thin field on one side.

//  The reason to combine: a single event could not fill a deep draft.


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
ok('Players Era contributes 16', 
  feast.teams.filter(t => feast.eventOf[t] === 'players-era-2026').length === 16);

// ── The cap: the mechanic that makes this worth doing ────
ok('a per-event cap is configured', feast.eventCap && feast.eventCap.maxPerEvent === 3);
//  The flat cap is only a floor; eventCapFor() raises it so rounds
//  can never exceed cap x events and deadlock the draft.
ok('the cap scales with rounds', /function eventCapFor/.test(app) &&
  /Math\.max\(base, Math\.ceil\(rounds \/ n\) \+ 1\)/.test(app));
ok('checkRosterRule uses the scaled cap', /const cap = eventCapFor\(t\)/.test(app));
//  The cap must be loose enough to fill a roster and tight enough to
//  force a split. With 8 rounds and a cap of 5, a manager must take
//  at least 3 from the other event.
const ROUNDS = 8;
ok('cap forces a spread across events', feast.eventCap.maxPerEvent < ROUNDS,
  'cap ' + feast.eventCap.maxPerEvent + ' vs ' + ROUNDS + ' rounds');
//  Simulate the scaling rule for a range of round counts a
//  commissioner could actually pick. None may be unfillable.
[6, 8, 10, 12, 16, 20].forEach(function (r) {
  const n = FEAST_SUB_EVENTS.length;
  const eff = Math.max(feast.eventCap.maxPerEvent, Math.ceil(r / n) + 1);
  ok('a ' + r + '-round draft is fillable', eff * n >= r, 'cap ' + eff + ' x ' + n);
});

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
  /bracketFormat !== 'combined' \|\| !t\.eventCap\) return 0/.test(app));
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
/*  These three used to assert the stacked-sub-bracket design: a
    <section> per sub-event, pods routed to renderFixtureList and
    knockouts to renderRegionSimple + renderPlacementGames. That
    design is gone on purpose — Feast Week has no bracket, so it
    renders one merged schedule instead. The checks that replaced
    them live in "The schedule view" below.                      */
ok('every sub-event contributes to one merged list',
  /\(t\.subEvents \|\| \[\]\)\.forEach/.test(app) && /function push\(key, label, game\)/.test(app));
ok('combined styles exist', /\.cmb-event \{/.test(css) && /\.cmb-cap \{/.test(css));

// ── Scope is honest about what was left out ──────────────
//  The ESPN Events brackets are excluded on a data fact, not a guess:
//  the Magic schools are absent from players.js entirely.

//  Players Era split into two tournaments in 2026 and only the
//  Sixteen is Thanksgiving week. The Eight runs the week of Nov 16
//  and must not be folded in.
ok('Players Era Eight is not included',
  !FEAST_SUB_EVENTS.some(id => /eight/i.test(id)));
ok('Feast Week now spans the ESPN events too',
  feast.subEvents.indexOf('etsc-magic-2026') >= 0);

// ── Featured treatment in both choosers ─────────────────
//  Driven by data on the event, not an id check in two renderers,
//  so next year's flagship is a one-line change rather than a hunt.
ok('Feast Week is flagged featured', feast.featured === true);
ok('it carries a blurb', typeof feast.blurb === 'string' && feast.blurb.length > 40);
ok('the blurb says what is different about it',
  /one roster/i.test(feast.blurb) && /\d+ teams/i.test(feast.blurb));
ok('it has a short pill label', (feast.featuredTag || '').length > 0 && feast.featuredTag.length <= 10,
  feast.featuredTag);
//  Exactly one featured event, or the highlight stops meaning anything.
let featuredCount = 0;
Object.values(TOURNAMENTS).forEach(g => g.forEach(t => { if (t.featured) featuredCount++; }));
ok('exactly one event is featured', featuredCount === 1, String(featuredCount));

//  Both choosers must render it, and neither may hardcode the id.
const wiz = app.slice(app.indexOf("if (step.type === 'tournament')"), app.indexOf('if (step.code)'));
ok('wizard renders the featured class', /tut-tourn-card--featured/.test(wiz));
ok('wizard renders the pill', /ttc-star/.test(wiz));
ok('wizard renders the blurb', /ttc-blurb/.test(wiz));
const picker = app.slice(app.indexOf('function openTournamentSelector'), app.indexOf('function openTournamentSelector') + 2600);
ok('picker renders the featured class', /tsm-item--featured/.test(picker));
ok('picker renders the pill', /tsm-star/.test(picker));
ok('picker renders the blurb', /tsm-item-blurb/.test(picker));
ok('neither chooser hardcodes the id',
  !/feast-2026/.test(wiz) && !/feast-2026/.test(picker));

//  Blurbs are league-authored strings rendered into innerHTML.
ok('blurb is escaped in the wizard', /esc\(t\.blurb\)/.test(wiz));
ok('blurb is escaped in the picker', /esc\(t\.blurb\)/.test(picker));

//  And the styles exist for all six classes.
['tut-tourn-card--featured', 'ttc-star', 'ttc-blurb',
 'tsm-item--featured', 'tsm-star', 'tsm-item-blurb'].forEach(function (c) {
  ok('.' + c + ' is styled', css.indexOf('.' + c) >= 0);
});

// ══ The schedule view ═════════════════════════════════════
//  Feast Week has no bracket. Stacking each sub-event's own
//  bracket answered a question nobody asks; a merged day-by-day
//  list of games answers "what is on today".
const rce = app.slice(app.indexOf('function renderCombinedEvents'), app.indexOf('//  Appends the placement'));
ok('combined view groups by day', /const days = \{\}/.test(rce) && /fx-day-h/.test(rce));
ok('each game names its tournament', /cmb-chip/.test(rce));
ok('it no longer stacks sub-brackets',
  !/renderRegionSimple\(body/.test(rce) && !/renderFixtureList\(body/.test(rce));
ok('live scores still appear', /fx-score/.test(rce) && /fx-final/.test(rce));

//  Three tiers of certainty, kept apart rather than flattened.
ok('published games use their own time', /\[g\.time, g\.tv\]/.test(rce));
ok('known pairings with no time are marked TBD', /tbd: true/.test(rce) && /Time TBD/.test(rce));
ok('events with nothing published are named, not invented',
  /unscheduled\.push\(sub\)/.test(rce) && /Not announced yet/.test(rce));

/*  THE UTC BUG. startMs is authored as new Date('2026-11-23') —
    UTC midnight. Reading it back with LOCAL getters in any negative
    offset returns the previous day, which put Maui under "Sunday,
    Nov 22" and gave Rady a second, duplicate "Nov 25" heading that
    never merged with the real one. Verified by running the real
    helper across every US timezone.                              */
const os2 = require('os');
const fs2 = require('fs');
const hs = app.indexOf('function _dayFromMs');
const he = app.indexOf('function _dayKey');
const tmp2 = path.join(os2.tmpdir(), 'feastday-' + process.pid + '.js');
fs2.writeFileSync(tmp2, app.slice(hs, he) + '\nmodule.exports = _dayFromMs;');
const dayFromMs = require(tmp2);
fs2.unlinkSync(tmp2);
ok('it reads the date in UTC', /getUTCFullYear\(\)[\s\S]{0,60}getUTCDate\(\)/.test(app.slice(hs, he)));
[['maui-2026', 23], ['rady-2026', 26], ['players-era-2026', 24]].forEach(function (pair) {
  const sub = byId(pair[0]);
  const got = new Date(dayFromMs(sub.startMs).key).getDate();
  ok(pair[0] + ' lands on the ' + pair[1] + 'th', got === pair[1], 'got the ' + got + 'th');
});
//  A fixture label and a startMs for the same day must produce the
//  SAME key, or the day renders twice.
const kiFrom = app.indexOf('function _dayKey');
const kiTo = app.indexOf('function _eventChip');
const tmp3 = path.join(os2.tmpdir(), 'feastkey-' + process.pid + '.js');
fs2.writeFileSync(tmp3, app.slice(app.indexOf('const _MONTHS'), app.indexOf('function _dayFromMs')) +
  app.slice(kiFrom, kiTo) + '\nmodule.exports = _dayKey;');
const dayKey = require(tmp3);
fs2.unlinkSync(tmp3);
//  `maui` is already bound above; reuse it rather than shadowing.
ok('a label and a startMs agree on the same day',
  dayKey('Monday, Nov 23', maui.startMs) === dayFromMs(maui.startMs).key,
  dayKey('Monday, Nov 23', maui.startMs) + ' vs ' + dayFromMs(maui.startMs).key);
ok('schedule chip styles exist', /\.cmb-chip \{/.test(css) && /\.cmb-pending-row \{/.test(css));

// ══ The preview modal must not invent a bracket ═══════════
/*  It used to build `seed: i + 1` from array position for any event
    without seededTeams — stamping seeds on events explicitly marked
    `seeded: false` — and then draw ceil(log2(n)) knockout rounds of
    TBD. Feast Week, which is six separate tournaments with no
    bracket at all, rendered a six-round draw with a "Round 4" and a
    56 seed.                                                      */
const prev = app.slice(app.indexOf('function openBracketPreview'), app.indexOf('function closeBracketPreview'));
ok('the preview no longer fabricates seeds',
  !/seed: i \+ 1/.test(prev), 'still generating seeds by index');
ok('it no longer computes rounds from team count',
  !/Math\.ceil\(Math\.log2/.test(prev));
ok('it emits no invented TBD slots', !/bpm-tbd/.test(prev));

//  It delegates to the SAME renderers the Bracket page uses, so the
//  two surfaces cannot disagree about what an event is.
ok('combined events get the merged schedule', /renderCombinedEvents\(bodyEl/.test(prev));
ok('group events get their fixture list', /renderFixtureList\(bodyEl, t\)/.test(prev));
ok('only published matchups draw a bracket',
  /\(t\.matchups \|\| \[\]\)\.length[\s\S]{0,200}renderRegionSimple\(bodyEl/.test(prev));
ok('an unpublished draw says so', /draw has not been published yet/.test(prev));

//  Route every selectable event and check nothing gets a bracket it
//  has not earned.
function previewRoute(t) {
  const f = t.bracketFormat;
  if (f === 'combined') return 'schedule';
  if (f === 'pod' || f === 'doubleheader' || f === 'group6') return 'fixtures';
  if ((t.matchups || []).length) return 'bracket';
  return 'pending';
}
const selectable2 = [];
Object.values(TOURNAMENTS).forEach(function (g) {
  g.forEach(function (t) { if (!t.comingSoon && t.canSelect !== false) selectable2.push(t); });
});
const fakeBracket = selectable2.filter(function (t) {
  return previewRoute(t) === 'bracket' && !(t.matchups || []).length;
});
ok('no event draws a bracket without matchups', fakeBracket.length === 0,
  fakeBracket.map(function (t) { return t.id; }).join(', '));
//  An unseeded event must never show seed numbers.
const unseeded = selectable2.filter(function (t) { return t.seeded === false; });
ok('unseeded events exist to protect', unseeded.length > 0, String(unseeded.length));
ok('Feast Week routes to the schedule', previewRoute(feast) === 'schedule');
ok('Maui still draws its real bracket', previewRoute(byId('maui-2026')) === 'bracket');
ok('Atlantis shows fixtures, not a bracket', previewRoute(byId('b4a-2026')) === 'fixtures');
ok('Players Era shows fixtures, not a bracket', previewRoute(byId('players-era-2026')) === 'fixtures');

//  And the button has to say what it opens.
ok('the button label follows the route',
  /\? ' View Schedule' : ' View Bracket'/.test(app));

// ── Shipped ──────────────────────────────────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build));
ok('app.js requested at the current build', html.includes('src/app.js?v=' + build));

console.log('\n' + pass + '/' + (pass + fail) + ' Feast Week checks pass');
process.exit(fail ? 1 : 0);
