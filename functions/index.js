// ═══════════════════════════════════════════════════════════════
//  TIPOFF FANTASY — Firebase Cloud Function
//  Polls SportsDataIO every 5 minutes during any active tournament.
//  Writes cumulative player stats to Firestore under:
//    tournamentStats/{tournamentId}/players/{sportsDataPlayerId}
//
//  API KEY: stored in functions/index.js (free trial key)
//  DATA SOURCE: SportsDataIO College Basketball API
//    - LivePlayerGameStats   → in-progress box scores (real-time)
//    - PlayerGameStatsByDate → completed game box scores
//    - teams                 → TeamID/Key → School directory
//
//  DEPLOY:
//    cd TipoffFantasy/functions && npm install
//    cd .. && firebase deploy --only functions
//
//  ACTIVE TOURNAMENTS:
//    The app writes to Firestore meta/activeTournaments whenever
//    a commissioner selects a tournament. This function reads that
//    doc to know which team names to filter for.
//
//  IMPORTANT — VERIFIED API SHAPE (checked against live responses):
//    Player stat rows do NOT contain "School" or "TeamName".
//    They contain:
//      Team    : abbreviation string, e.g. "SANCLR", "TXTECH", "UK"
//      TeamID  : stable integer, e.g. 341
//    The teams endpoint maps those to a real school name:
//      { TeamID: 27, Key: "CLMSN", School: "Clemson", Name: "Tigers" }
//    So team resolution MUST go through that directory. Matching on
//    stat.School silently yields '' and matches everything.
// ═══════════════════════════════════════════════════════════════

// firebase-functions v2 API (SDK >= 6). The old v1 style
// `functions.pubsub.schedule().onRun()` is gone in v6.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest }  = require('firebase-functions/v2/https');
const admin          = require('firebase-admin');
const fetch          = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

/*  ── A batch that cannot blow up on a big slate ──────────────
    A Firestore WriteBatch takes at most 500 operations. Past that,
    commit() rejects with INVALID_ARGUMENT and NOTHING in the batch is
    applied — it is all-or-nothing by design.

    Every sync in this file built one batch for the whole night's
    games and one for every player line in them. Measured on 17 Nov
    2026: 24 games and 209 player writes, comfortably under. But that
    was a Tuesday. A full Saturday slate, or Maui week with three
    tournaments running, is 40-plus relevant games at ~17 lines each —
    700 writes, one rejected commit, and not a single stat recorded
    for the entire evening. Every player on every roster reads zero,
    the report says ok:false with a message nobody is reading, and it
    happens on the busiest night of the season rather than a quiet one.

    Same surface as db.batch() for the two methods this file actually
    uses, so it is a drop-in. Chunks are committed in order, 450 at a
    time, leaving headroom under the 500 ceiling.

    Note what this gives up: atomicity across chunks. That is the
    right trade here. These writes are idempotent — a game document
    keyed by event id, a player line keyed by game id — so a partial
    commit followed by a retry converges on the same answer. An
    all-or-nothing batch that is guaranteed to fail is not atomic, it
    is just empty.                                                   */
const BATCH_LIMIT = 450;
function chunkedBatch() {
  const ops = [];
  return {
    set(ref, data, opts) { ops.push({ ref, data, opts }); },
    //  Deletes go through the same chunking as writes. A purge of a
    //  tournament's player documents is in the hundreds, which is
    //  exactly the size that silently rejects a plain batch.
    delete(ref) { ops.push({ ref, del: true }); },
    get size() { return ops.length; },
    async commit() {
      let committed = 0;
      for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
        const slice = ops.slice(i, i + BATCH_LIMIT);
        //  A REAL Firestore batch. This is the one place in the file
        //  that may call db.batch() directly; everywhere else goes
        //  through chunkedBatch(). (A careless find-and-replace made
        //  this line call itself, which is an infinite loop that
        //  type-checks and parses perfectly.)
        const b = db.batch();
        slice.forEach(o => { o.del ? b.delete(o.ref) : (o.opts ? b.set(o.ref, o.data, o.opts) : b.set(o.ref, o.data)); });
        await b.commit();
        committed += slice.length;
      }
      if (ops.length > BATCH_LIMIT) {
        console.log('[Tipoff] chunked commit:', committed, 'writes in',
          Math.ceil(ops.length / BATCH_LIMIT), 'batches');
      }
      ops.length = 0;
      return committed;
    },
  };
}

// ── SportsDataIO Config ────────────────────────────────────────
//  API key removed. It was a deactivated SportsDataIO trial key
//  published in a public repo. The live pipeline is ESPN and needs
//  no credential; nothing in this file appends a key any more.
const BASE     = 'https://api.sportsdata.io/v3/cbb';
const STATS    = `${BASE}/stats/json`;
const SCORES   = `${BASE}/scores/json`;

// ── School name normalizations ─────────────────────────────────
// Maps the School value SportsDataIO returns → the college name used
// in our players.js / tournament team lists. Keys are lowercase.
const SCHOOL_MAP = {
  'ole miss':                  'Ole Miss',
  'mississippi':               'Ole Miss',
  'university of mississippi':  'Ole Miss',
  'mississippi state':         'Mississippi State',
  'colorado state':            'Colorado State',
  'penn state':                'Penn State',
  'texas a&m':                 'Texas A&M',
  'texas a&amp;m':             'Texas A&M',
  'wake forest':               'Wake Forest',
  'vcu':                       'VCU',
  'virginia commonwealth':     'VCU',
  'byu':                       'BYU',
  'brigham young':             'BYU',
  'connecticut':               'UConn',
  'uconn':                     'UConn',
  'saint johns':               "St. John's",
  "st john's":                 "St. John's",
};

// ═══════════════════════════════════════════════════════════════
//  CALL BUDGET / CIRCUIT BREAKER / SYNC WINDOWS
//
//  On 2026-09-14 the trial key started returning 403 on every CBB
//  endpoint. Cause: this function ran every 5 minutes, year round,
//  making up to 3 API calls per run (~864/day) on days with no
//  college basketball being played. Roughly 4,300 calls spent on
//  nothing. Three rules below make that impossible to repeat.
//
//    1. WINDOW   — no API call at all outside a tournament window.
//    2. BUDGET   — hard ceiling on calls per calendar month.
//    3. BREAKER  — after repeated failures, stop until it resets.
//
//  Every outbound request goes through apiFetch(). There is no other
//  path to the API, so the ceiling cannot be bypassed by accident.
// ═══════════════════════════════════════════════════════════════

// Tournament windows as ET calendar dates, inclusive, with a day of
// padding on each side so a late tip or an overtime finish is never
// missed. Derived from the tournament dates in src/app.js.
const SYNC_WINDOWS = [
  { name: 'Thanksgiving week (Maui / Atlantis / ESPN)', start: '2026-11-22', end: '2026-11-29' },
  { name: 'Early December',                            start: '2026-12-07', end: '2026-12-09' },
  { name: 'Conference tournaments',                    start: '2027-03-05', end: '2027-03-15' },
  { name: 'NCAA Tournament',                           start: '2027-03-16', end: '2027-04-07' },
];

/* ══════════════════════════════════════════════════════════
   REGULAR SEASON (conference play)
   The tournament sync above only cares about the handful of schools
   in an active tournament, for a handful of days a year. Season mode
   needs the opposite: 79 schools, every day from the opener to the
   end of conference play.

   It writes ONE shared record rather than per-league copies —
   seasonStats/{season}/players/{espnId} — because a player's box
   score is the same fact in every league that drafted him. Clients
   map it into their own week structure.
══════════════════════════════════════════════════════════ */
const SEASON_ID = '2026-27';
const SEASON_WINDOW = { start: '2026-11-02', end: '2027-03-15' };

// The 79 schools in data/conference-players.js (ACC, Big East, Big Ten,
// Big 12, SEC). Regenerate alongside the pool:
//   node tools/build-conference-pool.mjs --conf=majors
const SEASON_SCHOOLS = new Set([
  "Alabama", "Arizona", "Arizona State", "Arkansas", "Auburn", "BYU",
  "Baylor", "Boston College", "Butler", "California", "Cincinnati",
  "Clemson", "Colorado", "Creighton", "DePaul", "Duke", "Florida",
  "Florida State", "Georgetown", "Georgia", "Georgia Tech", "Houston",
  "Illinois", "Indiana", "Iowa", "Iowa State", "Kansas", "Kansas State",
  "Kentucky", "LSU", "Louisville", "Marquette", "Maryland", "Miami",
  "Michigan", "Michigan State", "Minnesota", "Mississippi State",
  "Missouri", "NC State", "Nebraska", "North Carolina", "Northwestern",
  "Notre Dame", "Ohio State", "Oklahoma", "Oklahoma State", "Ole Miss",
  "Oregon", "Penn State", "Pittsburgh", "Providence", "Purdue", "Rutgers",
  "SMU", "Seton Hall", "South Carolina", "St. John's", "Stanford",
  "Syracuse", "TCU", "Tennessee", "Texas", "Texas A&M", "Texas Tech",
  "UCF", "UCLA", "UConn", "USC", "Utah", "Vanderbilt", "Villanova",
  "Virginia", "Virginia Tech", "Wake Forest", "Washington",
  "West Virginia", "Wisconsin", "Xavier"
//  Keys MUST be built with normName, the same function the scoreboard
//  side uses. An earlier version stripped spaces entirely, so
//  normName('Wake Forest') produced 'wake forest' while the set held
//  'wakeforest' — every multi-word school silently failed to match,
//  which is most of the 79.
].map(normName));

function withinSeasonWindow(todayISO) {
  return todayISO >= SEASON_WINDOW.start && todayISO <= SEASON_WINDOW.end;
}

// Games tip roughly noon ET and the latest finish around 1am ET.
// Outside these hours there is nothing to poll for.
const ACTIVE_HOUR_START = 11; // 11am ET
const ACTIVE_HOUR_END   = 2;  // through 2:59am ET (wraps past midnight)

// Ceiling per calendar month. Set deliberately below whatever the
// plan allows so hitting it is a warning, not an outage.
//
// Raised from 800 when season mode landed. 800 was sized for the paid
// SportsDataIO plan; the season sync polls 79 schools every 10 minutes
// and would spend that in an afternoon — and because the budget is
// SHARED, exhausting it would also have stopped tournament polling
// during Maui. ESPN is free and unauthenticated, so this is now a
// runaway guard rather than a billing limit.
const MAX_CALLS_PER_MONTH = 60000;

// Breaker: after this many consecutive failures, stop calling.
const BREAKER_THRESHOLD  = 5;
const BREAKER_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

const HEALTH_DOC = db.collection('meta').doc('syncHealth');
const TEAMDIR_DOC = db.collection('meta').doc('teamDirectory');

// ── Time, in America/New_York rather than the server's UTC ────
//  The old code built its date string from new Date(), which is UTC
//  on Cloud Functions. A game ending 10pm ET on Nov 23 is Nov 24 in
//  UTC, so the function requested the wrong date and found nothing.
function etParts(d) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  });
  const p = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour };
}

function etISODate(d) {
  const { y, m, d: day } = etParts(d);
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// SportsDataIO accepts 2026-NOV-23
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function etApiDate(d) {
  const { y, m, d: day } = etParts(d);
  return `${y}-${MONTHS[m - 1]}-${String(day).padStart(2, '0')}`;
}

function currentWindow(now) {
  const today = etISODate(now);
  return SYNC_WINDOWS.find(w => today >= w.start && today <= w.end) || null;
}

function withinActiveHours(now) {
  const { h } = etParts(now);
  return h >= ACTIVE_HOUR_START || h <= ACTIVE_HOUR_END;
}

// ── Health state ──────────────────────────────────────────────
async function readHealth() {
  const snap = await HEALTH_DOC.get();
  const base = { month: '', calls: 0, failures: 0, breakerUntil: 0, lastError: '' };
  return snap.exists ? Object.assign(base, snap.data()) : base;
}

function monthKey(now) {
  const { y, m } = etParts(now);
  return `${y}-${String(m).padStart(2, '0')}`;
}

// ── The only way out to the API ───────────────────────────────
//  Counts every call, refuses to exceed the monthly ceiling, and
//  refuses to call at all while the breaker is open.
function makeApiClient(health, now) {
  const mk = monthKey(now);
  if (health.month !== mk) { health.month = mk; health.calls = 0; }

  const state = { calls: 0, failures: 0, blocked: null };

  async function apiFetch(url, label) {
    if (health.breakerUntil > Date.now()) {
      state.blocked = 'breaker open';
      throw new Error(`breaker open until ${new Date(health.breakerUntil).toISOString()}`);
    }
    if (health.calls + state.calls >= MAX_CALLS_PER_MONTH) {
      state.blocked = 'monthly budget exhausted';
      throw new Error(`monthly call budget (${MAX_CALLS_PER_MONTH}) exhausted`);
    }

    state.calls++;
    // ── No API key is appended any more ──────────────────────
    //  The SportsDataIO trial was deactivated long ago, but its key
    //  stayed hardcoded in this file — in a PUBLIC repository, which
    //  is how it ends up in secret scanners and in anyone's git
    //  clone. The live pipeline is ESPN, which needs no credential.
    //
    //  The remaining SportsDataIO endpoints below (probe, probeGames,
    //  rosters, runSync, getTeamDirectory) are dead code kept only
    //  for reference. Without a key they now fail with 401, which is
    //  the honest result given the account no longer exists.
    const res = await fetch(url);

    if (res.status === 401 || res.status === 403 || res.status === 429) {
      state.failures++;
      throw new Error(`${label} HTTP ${res.status}`);
    }
    return res;
  }

  return { apiFetch, state };
}

//  Wraps any one-off handler in the same budget and breaker as the
//  scheduled sync. Diagnostic endpoints that called fetch() directly
//  are how the budget got blown in the first place, so there is now
//  no unmetered path to the API anywhere in this file.
async function budgeted(fn) {
  const now    = new Date();
  const health = await readHealth();
  const client = makeApiClient(health, now);

  if (health.breakerUntil > Date.now()) {
    return { blocked: true,
             reason: `circuit breaker open until ${new Date(health.breakerUntil).toISOString()}`,
             callsThisMonth: health.calls };
  }

  let result, error = null;
  try {
    result = await fn(client.apiFetch);
  } catch (e) {
    error = e.message;
  }

  try { await commitHealth(health, client.state, now); } catch (e) { /* non-fatal */ }

  return {
    blocked: false,
    error,
    result,
    apiCalls: client.state.calls,
    callsThisMonth: health.calls,
    callBudget: MAX_CALLS_PER_MONTH,
  };
}

async function commitHealth(health, state, now) {
  health.calls    = (health.calls || 0) + state.calls;
  health.failures = state.failures > 0 ? (health.failures || 0) + 1 : 0;

  if (health.failures >= BREAKER_THRESHOLD) {
    health.breakerUntil = Date.now() + BREAKER_COOLDOWN_MS;
    console.error(`[Tipoff] BREAKER TRIPPED after ${health.failures} failed runs. ` +
                  `Pausing API calls for ${BREAKER_COOLDOWN_MS / 60000} minutes.`);
  }

  health.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  health.month = monthKey(now);
  await HEALTH_DOC.set(health, { merge: true });
}

// ═══════════════════════════════════════════════════════════════
//  TEAM DIRECTORY  (TeamID / Key → School)
//
//  Previously cached in a module-level variable with a 6h TTL. That
//  only survives while the function instance stays warm, and a v2
//  function on a 5-minute schedule is cold almost every run, so the
//  cache effectively never hit and the full 1,334-team directory was
//  re-fetched ~288 times a day. It now lives in Firestore, where a
//  read costs nothing against the API budget.
// ═══════════════════════════════════════════════════════════════
const TEAM_DIR_TTL_MS = 7 * 24 * 60 * 60 * 1000; // team list barely changes

let _teamDir = null;   // per-instance memo, purely to avoid a repeat
let _teamDirAt = 0;    // Firestore read inside a single invocation

async function getTeamDirectory(apiFetch) {
  if (_teamDir && (Date.now() - _teamDirAt) < 60 * 1000) return _teamDir;

  // 1. Firestore first. Free, and good for a week.
  try {
    const snap = await TEAMDIR_DOC.get();
    if (snap.exists) {
      const d = snap.data();
      if (d && d.fetchedAt && (Date.now() - d.fetchedAt) < TEAM_DIR_TTL_MS && d.byId) {
        _teamDir = { byId: d.byId, byKey: d.byKey || {}, count: d.count || 0, source: 'firestore' };
        _teamDirAt = Date.now();
        return _teamDir;
      }
    }
  } catch (e) {
    console.warn('[Tipoff] team directory cache read failed:', e.message);
  }

  // 2. Cache miss or stale. Spend one API call and store the result.
  const res = await apiFetch(`${SCORES}/teams`, 'teams');
  if (!res.ok) throw new Error(`teams endpoint HTTP ${res.status}`);
  const teams = await res.json();

  const byId  = {};
  const byKey = {};
  for (const t of teams) {
    if (!t || !t.School) continue;
    if (t.TeamID != null) byId[String(t.TeamID)] = t.School;
    if (t.Key)            byKey[String(t.Key).toUpperCase()] = t.School;
  }

  _teamDir   = { byId, byKey, count: teams.length, source: 'api' };
  _teamDirAt = Date.now();

  try {
    await TEAMDIR_DOC.set({ byId, byKey, count: teams.length, fetchedAt: Date.now() });
  } catch (e) {
    console.warn('[Tipoff] team directory cache write failed:', e.message);
  }

  console.log(`[Tipoff] Team directory refreshed from API: ${teams.length} teams`);
  return _teamDir;
}

// ── Turn a raw stat row into a real school name ────────────────
function schoolForStat(stat, dir) {
  if (stat.TeamID != null && dir.byId[String(stat.TeamID)]) {
    return dir.byId[String(stat.TeamID)];
  }
  if (stat.Team && dir.byKey[String(stat.Team).toUpperCase()]) {
    return dir.byKey[String(stat.Team).toUpperCase()];
  }
  return '';
}

// ── Normalize a school string for comparison ───────────────────
function normSchool(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[.']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ═══════════════════════════════════════════════════════════════
//  MAIN SCHEDULED FUNCTION
// ═══════════════════════════════════════════════════════════════
//  The schedule still fires every 5 minutes, because Cloud Scheduler
//  invocations are free and the free tier covers three jobs. What
//  changed is that outside a tournament window this returns before
//  touching the network, so 320 days a year it costs zero API calls.
exports.syncTournamentStats = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/New_York',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const now = new Date();

    const win = currentWindow(now);
    if (!win) {
      console.log(`[Tipoff] ${etISODate(now)} is outside every tournament window. No API calls.`);
      return;
    }
    if (!withinActiveHours(now)) {
      console.log(`[Tipoff] ${win.name}: outside active hours (${etParts(now).h}:00 ET). No API calls.`);
      return;
    }

    const report = await runSyncESPN({ window: win });
    /*  The tournament sync re-reads every game on every poll, so a
        single failed box score heals itself five minutes later — for
        as long as the window is open. The danger is the last poll
        before the window closes: whatever was unread then stays
        unread, with the bracket already advanced past it and nobody
        told. This is the shout that makes that visible. */
    warnOnUnread('[Tipoff]', report);
  }
);

/* ═══════════════════════════════════════════════════════════════
   🧹 TOURNAMENT PURGE AND REBUILD
   ═══════════════════════════════════════════════════════════════
   The tournament sync used to count any game involving a school in
   an active field. Those schools play ordinary November games, so
   `tournamentStats/{tid}/players` is now carrying box scores from
   fixtures that have nothing to do with the tournament — which is
   why a roster showed points for players whose event had not tipped.

   Fixing the sync stops NEW bad writes. It cannot unwrite the old
   ones: the player documents are keyed by athlete and accumulate a
   `games` map, so a wrong entry sits there until something removes
   it. Nothing in the normal flow ever does, because the sync only
   ever merges.

   This wipes a tournament's accumulated stats and, optionally,
   rebuilds them from ESPN for the dates given — under the corrected
   both-teams-in-the-field rule.

     /tournamentPurge?tid=feast-2026
         dry run: counts what would go, deletes nothing
     /tournamentPurge?tid=feast-2026&write=1
         wipe players + games for that tournament
     /tournamentPurge?tid=feast-2026&write=1&rebuild=20261123,20261124
         wipe, then re-sync those ET dates

   Destructive on purpose and dry by default. The data it deletes is
   derived — every figure can be rebuilt from ESPN — so losing it is
   recoverable in a way that keeping it wrong is not.
═══════════════════════════════════════════════════════════════ */
async function purgeTournament(tid, opts) {
  const o = opts || {};
  const report = { ok: true, tournament: tid, dryRun: !o.write, playersDeleted: 0, gamesDeleted: 0 };
  if (!tid) { report.ok = false; report.error = 'tid is required'; return report; }

  const root = db.collection('tournamentStats').doc(tid);
  const batch = chunkedBatch();

  const [players, games] = await Promise.all([
    root.collection('players').get(),
    root.collection('games').get(),
  ]);
  players.forEach(function (d) { report.playersDeleted++; if (o.write) batch.delete(d.ref); });
  games.forEach(function (d) { report.gamesDeleted++; if (o.write) batch.delete(d.ref); });

  if (o.write) await batch.commit();
  return report;
}

exports.tournamentPurge = onRequest(
  { timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    try {
      const tid = String(req.query.tid || '').trim();
      const write = req.query.write === '1';
      const out = await purgeTournament(tid, { write: write });
      if (!out.ok) return res.status(400).json(out);

      /*  Rebuild AFTER the wipe, never before: re-syncing first and
          then deleting would throw away the work that was just done.
          Each date is a separate scoreboard call, so this is kept to
          an explicit list rather than a range. */
      const dates = String(req.query.rebuild || '').split(',').map(x => x.trim()).filter(Boolean);
      out.rebuilt = [];
      if (write && dates.length) {
        for (const d of dates) {
          const r = await runSyncESPN({ dateOverride: d });
          out.rebuilt.push({
            date: d,
            relevantGames: r.relevantGames,
            skippedNonTournament: r.skippedNonTournament,
            playersWritten: r.playersWritten,
            gamesWritten: r.gamesWritten,
          });
        }
      } else if (dates.length) {
        out.note = 'rebuild ignored on a dry run; add write=1';
      }
      res.status(200).json(out);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// ── Manual trigger for testing / backfill ──────────────────────
//  GET https://<region>-<project>.cloudfunctions.net/syncNow
//  Optional query params:
//    ?date=2026-MAR-20   run against a specific past date
//    ?dry=1              resolve + report only, write nothing
exports.syncNow = onRequest(
  { timeoutSeconds: 120, memory: '256MiB' },
  async (req, res) => {
    try {
      const report = await runSyncESPN({
        dateOverride: req.query.date || null,   // YYYYMMDD
        dryRun: req.query.dry === '1',
      });
      res.status(200).json(report);
    } catch (err) {
      console.error('[Tipoff] syncNow error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════
//  ESPN  (replaces SportsDataIO as of 2026-09-21)
//
//  The SportsDataIO trial was deactivated and every endpoint began
//  returning 401. ESPN's public endpoints need no key, carry current
//  2026-27 rosters, real G/F/C positions, class year, headshots and
//  injuries, plus scoreboards and box scores — strictly more than the
//  paid feed provided.
//
//  They are undocumented and unsupported, so two rules apply:
//    1. Cache anything we can live without for a day (rosters) in
//       Firestore, so an ESPN outage cannot empty the draft board.
//    2. Never hammer. This is someone else's free service.
// ═══════════════════════════════════════════════════════════════
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';

//  ── groups=50 is NOT optional ─────────────────────────────
//  Without it the scoreboard returns a FEATURED SUBSET, not the day's
//  slate. Measured 4 Nov 2026 against ESPN directly:
//
//      2 Nov   18 games returned   182 actually played
//     10 Nov    9 games returned    69 actually played
//     11 Nov    6 games returned    67 actually played
//
//  So the sync had been seeing roughly 13% of college basketball.
//  Every missing game is a drafted player who silently scores zero
//  for that day — indistinguishable from an idle team, which is
//  exactly how it went unnoticed.
//
//  groups=50 is ESPN's Division I group. With it, all 79 pool schools
//  appear across a normal week; without it, 18 of 32 rostered schools
//  looked like they had no games at all.
const ESPN_DIVISION_I = 'groups=50';


// Schools across every selectable tournament, exactly as they appear
// in src/app.js. ESPN's "location" field is what we match against.
const TOURNAMENT_SCHOOLS = [
  // Maui Invitational
  'Arizona', 'BYU', 'Clemson', 'Colorado State', 'Ole Miss', 'Providence', 'VCU', 'Washington',
  // Battle 4 Atlantis
  'Penn State', 'Marquette', 'Memphis', 'Mississippi State', 'Texas A&M', 'Virginia', 'Wake Forest', 'Xavier',
  // ESPN Thanksgiving Showcase
  'Akron', 'Wright State', 'App State', 'Belmont',
];

// Our name -> the string ESPN uses, where they disagree.
const ESPN_NAME_MAP = {
  'ole miss': 'Ole Miss',
  'app state': 'Appalachian State',
  'byu': 'BYU',
  'vcu': 'VCU',
  'texas a&m': 'Texas A&M',
  'uconn': 'UConn',
};

function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/&amp;/g, '&').replace(/[.']/g, '')
    .replace(/\s+/g, ' ').trim();
}

// ── ESPN probe ────────────────────────────────────────────────
//  Returns COMPACT summaries only. The raw payloads are enormous and
//  the point here is to learn field names, not to move data.
//    GET .../espnProbe?date=20260320
exports.espnProbe = onRequest(
  { timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
    const date = req.query.date || '20260320';  // a date with real games
    const out = {};

    try {
      // 1. Team directory -> our school names mapped to ESPN ids
      const tRes = await fetch(`${ESPN}/teams?limit=500`);
      out.teamsStatus = tRes.status;
      const tJson = await tRes.json();
      const list = ((((tJson.sports || [])[0] || {}).leagues || [])[0] || {}).teams || [];
      out.totalTeams = list.length;

      const byName = {};
      list.forEach(function (w) {
        const t = w.team || {};
        byName[normName(t.location)] = { id: t.id, abbr: t.abbreviation, display: t.displayName };
        byName[normName(t.displayName)] = { id: t.id, abbr: t.abbreviation, display: t.displayName };
        if (t.shortDisplayName) byName[normName(t.shortDisplayName)] = { id: t.id, abbr: t.abbreviation, display: t.displayName };
      });

      const resolved = {};
      const unresolved = [];
      TOURNAMENT_SCHOOLS.forEach(function (school) {
        const n = normName(school);
        const alias = ESPN_NAME_MAP[n] ? normName(ESPN_NAME_MAP[n]) : null;
        const hit = byName[n] || (alias && byName[alias]);
        if (hit) resolved[school] = hit;
        else unresolved.push(school);
      });
      out.resolvedSchools = resolved;
      out.unresolvedSchools = unresolved;

      // 2. One roster, compacted
      const sampleId = (resolved['Arizona'] || {}).id || '12';
      const rRes = await fetch(`${ESPN}/teams/${sampleId}/roster`);
      out.rosterStatus = rRes.status;
      const rJson = await rRes.json();
      const ath = rJson.athletes || [];
      out.rosterCount = ath.length;
      out.rosterSample = ath.slice(0, 3).map(function (a) {
        return {
          id: a.id,
          name: a.fullName,
          pos: ((a.position || {}).abbreviation) || null,
          cls: ((a.experience || {}).abbreviation) || null,
          jersey: a.jersey,
          height: a.displayHeight,
          headshot: !!(a.headshot && a.headshot.href),
          injuries: (a.injuries || []).length,
        };
      });
      out.rosterKeys = ath.length ? Object.keys(ath[0]) : [];

      // 3. Scoreboard for a date, compacted
      const sRes = await fetch(`${ESPN}/scoreboard?dates=${date}&${ESPN_DIVISION_I}&limit=500`);
      out.scoreboardStatus = sRes.status;
      const sJson = await sRes.json();
      const events = sJson.events || [];
      out.gamesOnDate = events.length;
      if (events.length) {
        const e = events[0];
        const comp = (e.competitions || [])[0] || {};
        out.gameSample = {
          eventId: e.id,
          name: e.shortName,
          date: e.date,
          statusState: ((comp.status || {}).type || {}).state,     // pre | in | post
          completed: ((comp.status || {}).type || {}).completed,
          period: (comp.status || {}).period,
          clock: (comp.status || {}).displayClock,
          competitors: (comp.competitors || []).map(function (c) {
            return {
              teamId: (c.team || {}).id,
              school: (c.team || {}).location,
              homeAway: c.homeAway,
              score: c.score,
              winner: c.winner,
            };
          }),
        };
        out.eventKeys = Object.keys(e);
        out.competitionKeys = Object.keys(comp);

        // 4. Box score for that game, compacted
        const bRes = await fetch(`${ESPN}/summary?event=${e.id}`);
        out.summaryStatus = bRes.status;
        const bJson = await bRes.json();
        out.summaryTopKeys = Object.keys(bJson);

        const bs = bJson.boxscore || {};
        out.boxscoreKeys = Object.keys(bs);
        const players = bs.players || [];
        out.boxTeams = players.length;
        if (players.length) {
          const teamBlock = players[0];
          const statsBlock = (teamBlock.statistics || [])[0] || {};
          out.statLabels = statsBlock.labels || statsBlock.names || null;
          out.statKeys = statsBlock.keys || null;
          const rows = statsBlock.athletes || [];
          out.boxPlayerCount = rows.length;
          out.boxPlayerSample = rows.slice(0, 2).map(function (r) {
            return {
              id: ((r.athlete || {}).id),
              name: ((r.athlete || {}).displayName),
              didNotPlay: r.didNotPlay,
              stats: r.stats,
            };
          });
        }
      }
      // 5. Where do per-player SEASON stats live? The roster endpoint
      //    carries bio only, so the draft board has nothing to rank on.
      //    Try the two plausible sources and report which works.
      const athleteId = req.query.athlete || '5174954';   // Motiejus Krivas
      const season = req.query.season || '2026';

      const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball';
      const candidates = [
        ['core athlete season stats', `${CORE}/seasons/${season}/types/2/athletes/${athleteId}/statistics`],
        ['site athlete overview',     `${ESPN}/athletes/${athleteId}/stats`],
        ['team season statistics',    `${ESPN}/teams/${sampleId}/statistics`],
      ];

      out.statSources = {};
      for (const [label, url] of candidates) {
        try {
          const r = await fetch(url);
          const entry = { status: r.status, ok: r.ok };
          if (r.ok) {
            const j = await r.json();
            entry.topKeys = Object.keys(j).slice(0, 12);
            // The core endpoint nests as splits.categories[].stats[]
            const cats = ((j.splits || {}).categories) || j.categories || null;
            if (Array.isArray(cats)) {
              entry.categories = cats.map(c => c.name);
              const gen = cats.find(c => /general|offensive|defensive/i.test(c.name || '')) || cats[0];
              entry.sampleStats = (gen.stats || []).slice(0, 14).map(s => ({
                name: s.name, abbr: s.abbreviation, value: s.value, display: s.displayValue,
              }));
            }
          }
          out.statSources[label] = entry;
        } catch (e) {
          out.statSources[label] = { error: e.message };
        }
      }

    } catch (e) {
      out.error = e.message;
    }

    res.status(200).json(out);
  }
);

// ═══════════════════════════════════════════════════════════════
//  LIVE SYNC  (ESPN)
//
//  Replaces the SportsDataIO pipeline. Two endpoints do everything:
//    /scoreboard?dates=YYYYMMDD   → every game, score, clock, winner
//    /summary?event={id}          → full box score for one game
//
//  THE BIG RELIABILITY WIN: ESPN box scores key players by the same
//  athlete id that data/players.js now stores as espnId. The old
//  pipeline matched on lowercased NAME, which breaks on accents,
//  suffixes, nicknames and middle initials — "Augusto Cassiá" and
//  "Corey Floyd Jr." were both waiting to fail silently. Matching on
//  id removes that entire class of bug.
//
//  STAT ORDER IS READ, NEVER ASSUMED. ESPN ships a `keys` array with
//  every box score. In the sample it read:
//    0 minutes · 1 points · 2 FG · 3 3PT · 4 FT · 5 rebounds
//    6 assists · 7 turnovers · 8 steals · 9 blocks
//  Note steals sit at 8 and TURNOVERS at 7 — exactly where a person
//  assuming PTS/REB/AST/STL/BLK would have put steals. Hardcoding
//  that would have shipped every player's turnovers as their steals.
// ═══════════════════════════════════════════════════════════════

// "2026-11-23" -> "20261123" for the scoreboard endpoint
//  '20261102' -> '2026-11-02'. The scoreboard is queried by ET date,
//  so every event it returns belongs to that ET day. Slicing ev.date
//  instead would use UTC and file a 10pm ET game under the next day.
function isoFromEspnDate(yyyymmdd) {
  const v = String(yyyymmdd || '');
  return v.length === 8 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v;
}

function espnDateParam(d) {
  const { y, m, d: day } = etParts(d);
  return `${y}${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

function toInt(v) {
  const n = parseInt(String(v == null ? '' : v).trim(), 10);
  return isNaN(n) ? 0 : n;
}

// Pull our five categories out of a positional stats array using the
// `keys` array that came with it.
function statsFromRow(row, keyIndex) {
  const s = row.stats || [];
  const get = k => (keyIndex[k] != null ? toInt(s[keyIndex[k]]) : 0);
  return {
    pts: get('points'),
    reb: get('rebounds'),
    ast: get('assists'),
    stl: get('steals'),
    blk: get('blocks'),
    min: get('minutes'),
  };
}

async function runSyncESPN(opts) {
  const options = opts || {};
  const report = {
    ok: true, dryRun: !!options.dryRun,
    activeTeams: [], gamesOnDate: 0, relevantGames: 0,
    playersWritten: 0, gamesWritten: 0,
    finalGames: 0, liveGames: 0,
    unmatchedSample: [], apiCalls: 0,
    //  Games involving a watched school that are NOT between two
    //  teams in the same field — i.e. ordinary season games this feed
    //  must not score. Reported so the separation is visible.
    skippedNonTournament: 0,
    //  Same three as the season sync, for the same reason — see the
    //  note on runSeasonSyncESPN's report. This side re-fetches every
    //  poll so it self-heals WHILE the sync window is open, which is
    //  precisely why its version of the bug is harder to notice: the
    //  window closes, and whatever was unread stays unread with the
    //  bracket already advanced past it.
    summaryFailures: [], emptyBoxScores: [], unrecordedFinals: [],
  };

  const now = new Date();
  const health = await readHealth();
  const client = makeApiClient(health, now);

  if (health.breakerUntil > Date.now()) {
    report.ok = false;
    report.reason = 'circuit breaker open';
    return report;
  }

  try {
    // 1. Which schools are we watching, and for which tournament?
    const metaDoc = await db.collection('meta').doc('activeTournaments').get();
    if (!metaDoc.exists) { report.ok = false; report.reason = 'no meta/activeTournaments'; return report; }

    /*  school -> EVERY active tournament containing it.

        This used to be school -> one tournament id, assigned by a
        plain overwrite as the loop went. Two consequences, both
        silent:

        1. Overlapping fields stole from each other. Georgia is in
           both the ESPN Events Invitational and the Jimmy V Classic;
           whichever was iterated last won the key, and every league
           on the other event scored zero for its Georgia players
           with nothing anywhere saying why.

        2. Feast Week makes this the normal case, not the edge case.
           It is a combined event over eight sub-tournaments, so if
           one league drafts Feast Week and another drafts Maui, all
           eight Maui schools are claimed by both — and one of those
           two leagues gets nothing.

        A game now writes to every tournament that claims it, which
        is correct: the same box score legitimately counts for a Maui
        league and a Feast Week league at the same time.           */
    const schoolToTourns = {};
    Object.entries(metaDoc.data()).forEach(([tournId, data]) => {
      if (!data || !data.active || !Array.isArray(data.teams)) return;
      data.teams.forEach(t => {
        const k = normName(t);
        (schoolToTourns[k] = schoolToTourns[k] || []).push(tournId);
      });
    });
    //  Kept for the reporting below, which only needs the school set.
    const schoolToTourn = {};
    Object.keys(schoolToTourns).forEach(k => { schoolToTourn[k] = schoolToTourns[k][0]; });
    if (!Object.keys(schoolToTourn).length) {
      report.ok = false; report.reason = 'no active teams'; return report;
    }
    report.activeTeams = Object.keys(schoolToTourn);

    // 2. Scoreboard for the day (ET, not UTC)
    const dateStr = options.dateOverride || espnDateParam(now);
    report.date = dateStr;

    const sbRes = await client.apiFetch(`${ESPN}/scoreboard?dates=${dateStr}&${ESPN_DIVISION_I}&limit=500`, 'scoreboard');
    if (!sbRes.ok) throw new Error(`scoreboard HTTP ${sbRes.status}`);
    const sb = await sbRes.json();
    const events = sb.events || [];
    report.gamesOnDate = events.length;

    const gameBatch = chunkedBatch();
    const playerBatch = chunkedBatch();

    for (const ev of events) {
      const comp = (ev.competitions || [])[0];
      if (!comp) continue;

      const competitors = (comp.competitors || []).map(c => ({
        school: ((c.team || {}).location) || '',
        abbr: ((c.team || {}).abbreviation) || '',
        espnTeamId: ((c.team || {}).id) || '',
        homeAway: c.homeAway,
        score: toInt(c.score),
        winner: c.winner === true,
      }));

      /*  ── BOTH sides, or it is not a tournament game ──────────
          This asked "is EITHER side in an active tournament?", which
          is true of every regular-season game those schools play.
          Gonzaga hosting a non-conference opponent in Feast Week
          week counted toward Feast Week scoring, because Gonzaga is
          in the field. Tournament scoring was quietly absorbing the
          regular season.

          A tournament game is one between two teams in the SAME
          field. That is exactly what separates this feed from the
          season feed, which is deliberately the opposite: it wants
          every game its schools play.                             */
      const sideA = schoolToTourns[normName(competitors[0] && competitors[0].school)] || [];
      const sideB = schoolToTourns[normName(competitors[1] && competitors[1].school)] || [];
      const shared = sideA.filter(id => sideB.indexOf(id) !== -1);

      if (!shared.length) {
        //  Counted so "why did this game not score" is answerable
        //  from the report instead of from a guess.
        if (sideA.length || sideB.length) report.skippedNonTournament++;
        continue;
      }
      report.relevantGames++;

      /*  A game can belong to more than one active event at once —
          a Maui game is also a Feast Week game. It is written to all
          of them. `tournId` remains the first for the log line and
          the legacy single-value paths below.                     */
      const tournId = shared[0];

      const st = (comp.status || {});
      const stType = st.type || {};
      const gameState = stType.state || 'pre';     // pre | in | post
      const completed = stType.completed === true;
      if (completed) report.finalGames++;
      else if (gameState === 'in') report.liveGames++;

      // 3. Game doc — drives live scores AND bracket advancement
      const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
      const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
      const winner = competitors.find(c => c.winner);

      /*  Built now, written by flushGame() after the box score —
          the same inversion as the season sync. Note what does NOT
          wait: winnerSchool. Bracket advancement is decided by the
          scoreboard, which is reliable and cheap, and holding the
          bracket hostage to a box score would mean one bad summary
          call freezes everybody's bracket. Stats and advancement are
          separate facts and now fail separately.                   */
      const gameDoc = {
        eventId: String(ev.id),
        shortName: ev.shortName || ev.name || '',
        startsAt: ev.date || null,
        state: gameState,
        completed: completed,
        period: st.period || 0,
        clock: st.displayClock || '',
        statusDetail: stType.shortDetail || stType.description || '',
        home: { school: home.school, abbr: home.abbr, score: home.score },
        away: { school: away.school, abbr: away.abbr, score: away.score },
        // The app advances its bracket off this field. Null until
        // ESPN itself calls it, so a blowout at halftime cannot
        // eliminate somebody's roster early.
        winnerSchool: (completed && winner) ? winner.school : null,
      };

      let linesFound = 0;
      const flushGame = function (statsRecorded) {
        if (completed && !statsRecorded) report.unrecordedFinals.push(String(ev.id));
        if (options.dryRun) return;
        //  Every event that claims this game gets its own copy. A
        //  Maui game is also a Feast Week game, and both leagues are
        //  entitled to score it.
        shared.forEach(function (tid) {
          gameBatch.set(
            db.collection('tournamentStats').doc(tid).collection('games').doc(String(ev.id)),
            Object.assign({}, gameDoc, {
              statsRecorded: !!statsRecorded,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }),
            { merge: true }
          );
          report.gamesWritten++;
        });
      };

      // 4. Box score — only worth fetching once the ball is up
      if (gameState === 'pre') { flushGame(false); continue; }

      let summary = null;
      try {
        const sumRes = await client.apiFetch(`${ESPN}/summary?event=${ev.id}`, 'summary');
        if (sumRes.ok) summary = await sumRes.json();
        else report.summaryFailures.push(`${ev.id} HTTP ${sumRes.status}`);
      } catch (e) {
        report.summaryFailures.push(`${ev.id} ${e.message}`);
      }
      if (!summary) { flushGame(false); continue; }

      const teamBlocks = ((summary.boxscore || {}).players) || [];
      for (const tb of teamBlocks) {
        const school = ((tb.team || {}).location) || '';
        /*  Only the events that claim BOTH teams in this game — the
            `shared` list — and only if this school is in them. An
            opponent outside the field contributes nothing.        */
        const tIds = (schoolToTourns[normName(school)] || []).filter(function (id) {
          return shared.indexOf(id) !== -1;
        });
        if (!tIds.length) continue;
        const tId = tIds[0];

        const block = (tb.statistics || [])[0] || {};
        const keyIndex = {};
        (block.keys || []).forEach((k, i) => { keyIndex[k] = i; });

        for (const row of (block.athletes || [])) {
          const ath = row.athlete || {};
          if (!ath.id) continue;
          if (row.didNotPlay) continue;

          const s = statsFromRow(row, keyIndex);
          if (!s.min && !s.pts && !s.reb && !s.ast) continue;  // never checked in

          // Finished games are stored per game id; in-progress games sit
          // in `live` and are overwritten on each poll. The app sums the
          // finished games and adds `live`, so re-running the sync can
          // never inflate a total and ESPN correcting a stat mid-game
          // revises the number down rather than stacking on top.
          //
          // Idempotent either way: keyed by game id, so re-running the
          // sync cannot inflate a total.
          const line = { pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, min: s.min };
          const payload = completed
            ? {
                espnId: String(ath.id),
                name: ath.displayName || ath.fullName || '',
                school: school,
                games: { [String(ev.id)]: line },
                live: admin.firestore.FieldValue.delete(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              }
            : {
                espnId: String(ath.id),
                name: ath.displayName || ath.fullName || '',
                school: school,
                live: Object.assign({ gameId: String(ev.id) }, line),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              };

          if (!options.dryRun) {
            //  One copy per claiming event. Each tournament keeps its
            //  own totals, so a Feast Week league and a Maui league
            //  reading the same game never share a document and can
            //  never overwrite one another.
            tIds.forEach(function (id) {
              playerBatch.set(
                db.collection('tournamentStats').doc(id).collection('players').doc(String(ath.id)),
                payload, { merge: true });
              report.playersWritten++;
            });
          }
          linesFound++;
        }
      }

      if (completed && !linesFound) report.emptyBoxScores.push(String(ev.id));
      flushGame(linesFound > 0);
    }

    if (!options.dryRun) {
      await gameBatch.commit();
      await playerBatch.commit();
    }

  } catch (err) {
    console.error('[Tipoff] runSyncESPN error:', err);
    report.ok = false;
    report.error = err.message;
    health.lastError = err.message;
  }

  try { await commitHealth(health, client.state, now); } catch (e) {}
  report.apiCalls = client.state.calls;
  report.callsThisMonth = health.calls;
  return report;
}

// ── ESPN roster generator ─────────────────────────────────────
//  Produces the data behind data/players.js.
//
//    GET .../espnRosters?schools=Arizona|BYU&top=12&season=2026
//
//  Two calls per school (team directory is cached) plus one per player
//  for season averages. Run rarely, not on a schedule.
//
//  Season note: 2026 is the 2025-26 season. The 2026-27 season has not
//  started, so these are LAST season's averages. Freshmen and transfers
//  will legitimately have none — they are returned with zeros and
//  hasStats:false so the UI can badge rather than silently rank them last.
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball';

const WANTED_STATS = {
  avgPoints: 'points', avgRebounds: 'rebounds', avgAssists: 'assists',
  avgSteals: 'steals', avgBlocks: 'blocks',
  avgMinutes: 'minutes', gamesPlayed: 'games',
};

async function espnTeamDirectory() {
  const doc = db.collection('meta').doc('espnTeams');
  try {
    const snap = await doc.get();
    if (snap.exists) {
      const d = snap.data();
      if (d && d.fetchedAt && (Date.now() - d.fetchedAt) < 7 * 24 * 60 * 60 * 1000 && d.byName) {
        return d.byName;
      }
    }
  } catch (e) { /* fall through to a fresh fetch */ }

  const res = await fetch(`${ESPN}/teams?limit=500`);
  if (!res.ok) throw new Error(`ESPN teams HTTP ${res.status}`);
  const json = await res.json();
  const list = ((((json.sports || [])[0] || {}).leagues || [])[0] || {}).teams || [];

  const byName = {};
  list.forEach(function (w) {
    const t = w.team || {};
    const rec = { id: t.id, abbr: t.abbreviation, display: t.displayName, color: t.color };
    [t.location, t.displayName, t.shortDisplayName, t.name].forEach(function (n) {
      const k = normName(n);
      if (k && !byName[k]) byName[k] = rec;
    });
  });

  try { await doc.set({ byName: byName, fetchedAt: Date.now(), count: list.length }); } catch (e) {}
  return byName;
}

// Pull per-game averages for one athlete. Returns zeros when the
// player has no prior season, which is the freshman case.
async function espnPlayerAverages(athleteId, season) {
  const out = { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, minutes: 0, games: 0, hasStats: false };
  try {
    const res = await fetch(`${ESPN_CORE}/seasons/${season}/types/2/athletes/${athleteId}/statistics`);
    if (!res.ok) return out;
    const json = await res.json();
    const cats = ((json.splits || {}).categories) || [];
    cats.forEach(function (c) {
      (c.stats || []).forEach(function (s) {
        const key = WANTED_STATS[s.name];
        if (key && typeof s.value === 'number') {
          out[key] = Math.round(s.value * 10) / 10;
          out.hasStats = true;
        }
      });
    });
    if (out.games) out.games = Math.round(out.games);
  } catch (e) { /* leave zeros */ }
  return out;
}

exports.espnRosters = onRequest(
  { timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    try {
      const season = String(req.query.season || '2026');
      const top = req.query.top != null ? parseInt(req.query.top, 10) : 12;
      const wanted = String(req.query.schools || '')
        .split('|').map(s => s.trim()).filter(Boolean);
      if (!wanted.length) return res.status(400).json({ error: 'pass ?schools=A|B|C' });

      const dir = await espnTeamDirectory();
      const out = {};
      const missing = [];

      for (const school of wanted) {
        const n = normName(school);
        const alias = ESPN_NAME_MAP[n] ? normName(ESPN_NAME_MAP[n]) : null;
        const team = dir[n] || (alias && dir[alias]);
        if (!team) { missing.push(school); continue; }

        const rRes = await fetch(`${ESPN}/teams/${team.id}/roster`);
        if (!rRes.ok) { missing.push(school + ' (roster HTTP ' + rRes.status + ')'); continue; }
        const rJson = await rRes.json();
        const athletes = rJson.athletes || [];

        // Season averages, a few at a time. Sequential would take
        // minutes for 20 schools; unbounded parallelism is rude to a
        // free service. Five at a time is the compromise.
        const players = [];
        for (let i = 0; i < athletes.length; i += 5) {
          const slice = athletes.slice(i, i + 5);
          const stats = await Promise.all(slice.map(a => espnPlayerAverages(a.id, season)));
          slice.forEach(function (a, j) {
            const s = stats[j];
            players.push({
              espnId: a.id,
              name: a.fullName || a.displayName,
              pos: ((a.position || {}).abbreviation) || '',
              cls: ((a.experience || {}).abbreviation) || '',
              jersey: a.jersey || '',
              height: a.displayHeight || '',
              headshot: (a.headshot && a.headshot.href) || '',
              injured: (a.injuries || []).length > 0,
              games: s.games,
              minutes: s.minutes,
              hasStats: s.hasStats,
              stats: {
                points: s.points, rebounds: s.rebounds, assists: s.assists,
                steals: s.steals, blocks: s.blocks,
              },
            });
          });
        }

        // Minutes is the honest proxy for "does this player matter".
        // Players with no prior season sort last but are still returned,
        // so the caller can decide whether to badge or drop them.
        players.sort(function (a, b) {
          return (b.minutes - a.minutes) || (b.stats.points - a.stats.points);
        });

        out[school] = {
          espnId: team.id,
          abbr: team.abbr,
          color: team.color || null,
          rosterSize: athletes.length,
          withStats: players.filter(p => p.hasStats).length,
          players: top > 0 ? players.slice(0, top) : players,
        };
      }

      res.status(200).json({ season, top, missing, schools: out });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ── Status ────────────────────────────────────────────────────
//  Reads Firestore only. Zero API calls, safe to hit any time.
//  SportsDataIO shows no usage meter, so this is the only place to
//  see what has actually been spent.
//    GET .../status
exports.status = onRequest(
  { timeoutSeconds: 30, memory: '256MiB' },
  async (req, res) => {
    const now    = new Date();
    const health = await readHealth();
    const win    = currentWindow(now);

    const upcoming = SYNC_WINDOWS
      .filter(w => etISODate(now) <= w.end)
      .map(w => `${w.name}: ${w.start} to ${w.end}`);

    res.status(200).json({
      nowET: `${etISODate(now)} ${String(etParts(now).h).padStart(2, '0')}:00`,
      polling: win
        ? (withinActiveHours(now)
            ? `ACTIVE — ${win.name}`
            : `window open (${win.name}) but outside game hours`)
        : 'IDLE — outside every tournament window, zero API calls',
      budget: {
        month: health.month || monthKey(now),
        used: health.calls || 0,
        limit: MAX_CALLS_PER_MONTH,
        remaining: Math.max(0, MAX_CALLS_PER_MONTH - (health.calls || 0)),
      },
      breaker: {
        consecutiveFailedRuns: health.failures || 0,
        open: (health.breakerUntil || 0) > Date.now(),
        opensUntil: health.breakerUntil ? new Date(health.breakerUntil).toISOString() : null,
        lastError: health.lastError || null,
      },
      upcomingWindows: upcoming,
    });
  }
);

// ── Endpoint probe ────────────────────────────────────────────
//  Reports which SportsDataIO endpoints this API key can actually reach.
//  Needed to answer: can we generate players.js from the API, or do the
//  rosters have to be maintained by hand?
//    GET .../probe
exports.probe = onRequest(
  { timeoutSeconds: 120, memory: '256MiB' },
  async (req, res) => {
    const season = req.query.season || '2027';
    const team   = req.query.team || 'ARZ';

    const candidates = [
      ['teams (control)',        `${SCORES}/teams`],
      ['Players (all)',          `${SCORES}/Players`],
      ['PlayersByTeam',          `${SCORES}/PlayersByTeam/${team}`],
      ['PlayerDetailsByTeam',    `${SCORES}/PlayerDetailsByTeam/${team}`],
      ['PlayerSeasonStats',      `${STATS}/PlayerSeasonStats/${season}`],
      ['PlayerSeasonStatsByTeam',`${STATS}/PlayerSeasonStatsByTeam/${season}/${team}`],
      ['CurrentSeason',          `${SCORES}/CurrentSeason`],
      ['News',                   `${SCORES}/News`],
    ];

    const out = await budgeted(async (apiFetch) => {
      const results = {};
      for (const [label, url] of candidates) {
        try {
          const r = await apiFetch(url, label);
          const entry = { status: r.status, ok: r.ok };
          if (r.ok) {
            const body = await r.json();
            if (Array.isArray(body)) {
              entry.count = body.length;
              entry.sampleKeys = body.length ? Object.keys(body[0]).slice(0, 14) : [];
              if (body.length) {
                const s = body[0];
                entry.sample = {
                  Name: s.Name, FirstName: s.FirstName, LastName: s.LastName,
                  Team: s.Team, TeamID: s.TeamID, Position: s.Position,
                  Points: s.Points, Rebounds: s.Rebounds, Games: s.Games,
                };
              }
            } else {
              entry.type = typeof body;
              entry.value = body;
            }
          }
          results[label] = entry;
        } catch (e) {
          results[label] = { error: e.message };
        }
      }
      return results;
    });

    const results = out.result || {};
    res.status(200).json({
      season, team, results,
      budget: { apiCalls: out.apiCalls, callsThisMonth: out.callsThisMonth, limit: out.callBudget },
      blocked: out.blocked ? out.reason : undefined,
    });
  }
);

// ── Games probe ───────────────────────────────────────────────
//  Live scores and bracket advancement need the game feed, which is a
//  different shape from the player-stat feed. Verify the field names
//  against real responses before writing any sync against them.
//    GET .../probeGames?date=2026-MAR-20
exports.probeGames = onRequest(
  { timeoutSeconds: 120, memory: '256MiB' },
  async (req, res) => {
    const date   = req.query.date || '2026-MAR-20';
    const season = req.query.season || '2026';

    const candidates = [
      ['GamesByDate',       `${SCORES}/GamesByDate/${date}`],
      ['ScoresBasic',       `${SCORES}/ScoresBasic/${date}`],
      ['Games (season)',    `${SCORES}/Games/${season}`],
      ['TeamGameStatsByDate', `${STATS}/TeamGameStatsByDate/${date}`],
      ['Tournaments',       `${SCORES}/Tournaments/${season}`],
      ['TournamentHierarchy', `${SCORES}/TournamentHierarchy/${season}`],
      ['AreAnyGamesInProgress', `${SCORES}/AreAnyGamesInProgress`],
    ];

    const out = await budgeted(async (apiFetch) => {
      const results = {};
      for (const [label, url] of candidates) {
        try {
          const r = await apiFetch(url, label);
          const entry = { status: r.status, ok: r.ok };
          if (r.ok) {
            const body = await r.json();
            if (Array.isArray(body)) {
              entry.count = body.length;
              entry.allKeys = body.length ? Object.keys(body[0]) : [];
              // Two full rows beat a hand-picked sample: field names we do
              // not anticipate are precisely the ones that break the sync.
              entry.rows = body.slice(0, 2);
            } else {
              entry.type = typeof body;
              entry.value = body;
            }
          }
          results[label] = entry;
        } catch (e) {
          results[label] = { error: e.message };
        }
      }
      return results;
    });

    res.status(200).json({
      date, season,
      results: out.result || {},
      budget: { apiCalls: out.apiCalls, callsThisMonth: out.callsThisMonth, limit: out.callBudget },
      blocked: out.blocked ? out.reason : undefined,
    });
  }
);

// ── Roster generator ──────────────────────────────────────────
//  Builds the data behind data/players.js straight from the API so the
//  player pool never has to be typed by hand again.
//
//    GET .../rosters?schools=Arizona|BYU|Ole%20Miss&season=2026&top=8
//
//  schools : pipe-separated school names as they appear in the app's
//            tournament team lists (NOT API abbreviations).
//  season  : the season to pull per-game averages from. 2027 is the
//            upcoming season and has no games yet, so default to 2026.
//  top     : how many players per school to return (0 = all).
//
//  Season stat rows are SEASON TOTALS, not averages. Divide by Games.
exports.rosters = onRequest(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (req, res) => {
    try {
      const season = String(req.query.season || '2026');
      const top    = req.query.top != null ? parseInt(req.query.top, 10) : 8;
      const wanted = String(req.query.schools || '')
        .split('|').map(s => s.trim()).filter(Boolean);

      if (!wanted.length) {
        return res.status(400).json({ error: 'pass ?schools=A|B|C' });
      }

      // This endpoint makes 2 + N calls and is what finally tipped the
      // trial key over. Everything below runs inside the same budget
      // and breaker as the scheduled sync.
      const run = await budgeted(async (apiFetch) => {

      // 1. Team directory: our school name → { key, teamId, apiSchool }
      const tRes = await apiFetch(`${SCORES}/teams`, 'teams');
      if (!tRes.ok) throw new Error(`teams HTTP ${tRes.status}`);
      const teams = await tRes.json();

      const lookup = {};
      for (const t of teams) {
        if (!t || !t.School || !t.Key) continue;
        const rec = { key: t.Key, teamId: t.TeamID, apiSchool: t.School,
                      name: t.Name, conference: t.Conference };
        const n = normSchool(t.School);
        if (n && !lookup[n]) lookup[n] = rec;
        const alias = SCHOOL_MAP[n];
        if (alias) {
          const a = normSchool(alias);
          if (a && !lookup[a]) lookup[a] = rec;
        }
      }
      // Reverse aliases too: 'ole miss' -> 'Ole Miss' -> whichever API row matched
      for (const [from, to] of Object.entries(SCHOOL_MAP)) {
        const t = normSchool(to);
        if (lookup[t] && !lookup[from]) lookup[from] = lookup[t];
      }

      // 2. Full player list once (~17k rows), indexed by TeamID
      const pRes = await apiFetch(`${SCORES}/Players`, 'Players');
      if (!pRes.ok) throw new Error(`Players HTTP ${pRes.status}`);
      const allPlayers = await pRes.json();

      const byTeamId = {};
      for (const p of allPlayers) {
        if (p.TeamID == null) continue;
        (byTeamId[String(p.TeamID)] = byTeamId[String(p.TeamID)] || []).push(p);
      }

      // 3. Per-school season stats, merged onto the roster
      const out = {};
      const missing = [];

      for (const school of wanted) {
        const rec = lookup[normSchool(school)];
        if (!rec) { missing.push(school); continue; }

        const roster = byTeamId[String(rec.teamId)] || [];

        let statsById = {};
        try {
          const sRes = await apiFetch(
            `${STATS}/PlayerSeasonStatsByTeam/${season}/${rec.key}`, 'PlayerSeasonStatsByTeam');
          if (sRes.ok) {
            const rows = await sRes.json();
            for (const r of (rows || [])) {
              if (r && r.PlayerID != null) statsById[String(r.PlayerID)] = r;
            }
          }
        } catch (e) { /* leave stats empty */ }

        const players = roster.map(p => {
          const s  = statsById[String(p.PlayerID)];
          const g  = s && s.Games ? s.Games : 0;
          const pg = n => (g ? Math.round(((n || 0) / g) * 10) / 10 : 0);
          return {
            playerId: p.PlayerID,
            name: [p.FirstName, p.LastName].filter(Boolean).join(' ').trim(),
            position: p.Position || '',
            cls: p.Class || '',
            jersey: p.Jersey != null ? p.Jersey : '',
            height: p.Height || '',
            games: g,
            mpg: s ? pg(s.Minutes) : 0,
            fppg: s && g ? Math.round(((s.FantasyPoints || 0) / g) * 10) / 10 : 0,
            stats: {
              points:   s ? pg(s.Points)       : 0,
              rebounds: s ? pg(s.Rebounds)     : 0,
              assists:  s ? pg(s.Assists)      : 0,
              steals:   s ? pg(s.Steals)       : 0,
              blocks:   s ? pg(s.BlockedShots) : 0,
            },
            hasStats: !!s,
          };
        });

        // Best first. Players with no prior-season line sink to the bottom;
        // they are freshmen or transfers and need a human decision.
        players.sort((a, b) => (b.fppg - a.fppg) || (b.mpg - a.mpg));

        out[school] = {
          apiSchool: rec.apiSchool,
          key: rec.key,
          teamId: rec.teamId,
          rosterSize: roster.length,
          withStats: players.filter(p => p.hasStats).length,
          players: top > 0 ? players.slice(0, top) : players,
        };
      }

        return { missing, schools: out };
      });

      if (run.blocked) return res.status(429).json({ error: run.reason });
      if (run.error)   return res.status(500).json({ error: run.error,
                                                     budget: { apiCalls: run.apiCalls,
                                                               callsThisMonth: run.callsThisMonth,
                                                               limit: run.callBudget } });

      res.status(200).json({
        season, top,
        missing: run.result.missing,
        schools: run.result.schools,
        budget: { apiCalls: run.apiCalls, callsThisMonth: run.callsThisMonth, limit: run.callBudget },
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════
//  CORE SYNC
// ═══════════════════════════════════════════════════════════════
async function runSync(opts) {
  const options = opts || {};
  const report = {
    ok: true,
    dryRun: !!options.dryRun,
    activeTeams: [],
    teamDirectorySize: 0,
    liveRows: 0, liveMatched: 0,
    finalRows: 0, finalClosed: 0, finalMatched: 0,
    unresolvedSample: [],
    wrote: { live: 0, completed: 0 },
    apiCalls: 0,
  };

  // Budget + breaker. Every outbound request goes through apiFetch.
  const now = new Date();
  const health = await readHealth();
  const client = makeApiClient(health, now);
  const apiFetch = client.apiFetch;

  if (health.breakerUntil > Date.now()) {
    report.ok = false;
    report.reason = `circuit breaker open until ${new Date(health.breakerUntil).toISOString()}`;
    report.callsThisMonth = health.calls;
    return report;
  }

  try {
    // 1. Active tournaments
    const metaDoc = await db.collection('meta').doc('activeTournaments').get();
    if (!metaDoc.exists) {
      console.log('[Tipoff] No active tournaments in Firestore. Exiting.');
      report.ok = false; report.reason = 'no meta/activeTournaments doc';
      return report;
    }

    const activeTournaments = metaDoc.data();
    const teamToTournId = {};
    Object.entries(activeTournaments).forEach(([tournId, data]) => {
      if (!data || !data.active || !Array.isArray(data.teams)) return;
      data.teams.forEach(teamName => {
        teamToTournId[normSchool(teamName)] = tournId;
      });
    });

    if (Object.keys(teamToTournId).length === 0) {
      console.log('[Tipoff] No active tournament teams found. Exiting.');
      report.ok = false; report.reason = 'no active teams';
      return report;
    }
    report.activeTeams = Object.keys(teamToTournId);
    console.log('[Tipoff] Active teams:', report.activeTeams.join(', '));

    // 2. Team directory (abbreviation → school). Firestore-backed, so
    //    this usually costs zero API calls.
    const dir = await getTeamDirectory(apiFetch);
    report.teamDirectorySize = dir.count;
    report.teamDirectorySource = dir.source;

    // 3. Date string in ET, not UTC. SportsDataIO accepts 2026-NOV-23.
    const dateStr = options.dateOverride || etApiDate(new Date());
    report.date = dateStr;

    // 4. Live in-progress stats
    let liveStats = [];
    try {
      const res = await apiFetch(`${STATS}/LivePlayerGameStats`, 'LivePlayerGameStats');
      if (res.ok) {
        liveStats = await res.json();
        if (!Array.isArray(liveStats)) liveStats = [];
      } else {
        console.warn('[Tipoff] Live stats HTTP', res.status);
      }
    } catch (e) {
      console.warn('[Tipoff] Live stats fetch failed:', e.message);
    }
    report.liveRows = liveStats.length;

    // 5. Completed stats for the date
    let finalStats = [];
    try {
      const res = await apiFetch(`${STATS}/PlayerGameStatsByDate/${dateStr}`, 'PlayerGameStatsByDate');
      if (res.ok) {
        finalStats = await res.json();
        if (!Array.isArray(finalStats)) finalStats = [];
      } else {
        console.warn('[Tipoff] Final stats HTTP', res.status);
      }
    } catch (e) {
      console.warn('[Tipoff] Final stats fetch failed:', e.message);
    }
    report.finalRows = finalStats.length;

    // 6. Resolve + filter
    const unresolved = new Set();
    const tally = {};
    const liveFiltered = filterByActiveTeams(liveStats, teamToTournId, dir, unresolved, tally);
    report.liveMatched = liveFiltered.length;

    const completedStats = finalStats.filter(s => s.IsGameOver === true || s.IsClosed === true);
    report.finalClosed = completedStats.length;
    const completedFiltered = filterByActiveTeams(completedStats, teamToTournId, dir, unresolved, tally);
    report.finalMatched = completedFiltered.length;
    report.unresolvedSample = Array.from(unresolved).slice(0, 25);

    // Which schools actually matched, and how many rows each.
    // This is the check that catches a wrong-team attribution.
    const skipped = tally._skipped || {};
    delete tally._skipped;
    report.matchedBySchool = tally;
    report.skippedSchoolsSample = Object.keys(skipped).sort().slice(0, 40);

    console.log(`[Tipoff] live ${liveStats.length}→${liveFiltered.length} matched | ` +
                `final ${finalStats.length}→${completedStats.length} closed→${completedFiltered.length} matched`);

    if (options.dryRun) {
      console.log('[Tipoff] DRY RUN — no writes performed.');
      return report;
    }

    // 7. Write
    if (liveFiltered.length > 0) {
      await writeLiveStats(liveFiltered);
      report.wrote.live = liveFiltered.length;
    }
    if (completedFiltered.length > 0) {
      const n = await writeCompletedStats(completedFiltered);
      report.wrote.completed = n;
    }

  } catch (err) {
    console.error('[Tipoff] runSync error:', err);
    report.ok = false;
    report.error = err.message;
    health.lastError = err.message;
  }

  // Persist the call count and failure state no matter how we got here.
  try {
    await commitHealth(health, client.state, now);
  } catch (e) {
    console.warn('[Tipoff] health write failed:', e.message);
  }

  report.apiCalls       = client.state.calls;
  report.callsThisMonth = health.calls;
  report.callBudget     = MAX_CALLS_PER_MONTH;
  if (client.state.blocked) report.blocked = client.state.blocked;

  return report;
}

// ── Filter player stat rows to only active tournament teams ────
function filterByActiveTeams(stats, teamToTournId, dir, unresolved, tally) {
  const results = [];
  for (const stat of stats) {
    const school = schoolForStat(stat, dir);
    if (!school) {
      if (unresolved && stat.Team) unresolved.add(`${stat.Team}#${stat.TeamID}`);
      continue;
    }
    const tournId = resolveTeam(school, teamToTournId);
    if (tournId) {
      if (tally) tally[school] = (tally[school] || 0) + 1;
      results.push({ ...stat, _tournId: tournId, _school: canonicalSchool(school, teamToTournId) });
    } else if (tally) {
      // Track schools we saw but did NOT match, so a genuine miss
      // (e.g. a naming variant) is visible instead of silent.
      tally._skipped = tally._skipped || {};
      tally._skipped[school] = (tally._skipped[school] || 0) + 1;
    }
  }
  return results;
}

// ── Match a resolved school name to an active tournament ───────
function resolveTeam(school, teamToTournId) {
  const raw = normSchool(school);
  if (!raw) return null;                      // never match on empty

  if (teamToTournId[raw]) return teamToTournId[raw];

  const mapped = SCHOOL_MAP[raw];
  if (mapped && teamToTournId[normSchool(mapped)]) {
    return teamToTournId[normSchool(mapped)];
  }

  // NO substring matching. It looks helpful and is actively dangerous:
  //   'washington state'.includes('washington')  -> true
  //   'arizona state'.includes('arizona')        -> true
  // That silently credits Washington State's box score to Washington.
  // Anything the directory + SCHOOL_MAP can't resolve exactly is reported
  // as unmatched so it can be fixed deliberately.
  return null;
}

// ── Canonical college name for storage ─────────────────────────
function canonicalSchool(school, teamToTournId) {
  const raw = normSchool(school);
  if (SCHOOL_MAP[raw]) return SCHOOL_MAP[raw];
  return school; // already the real School value from the directory
}

// ── Write live (in-progress) stats ────────────────────────────
async function writeLiveStats(players) {
  const byTourn = groupByTournament(players);

  for (const [tournId, rows] of Object.entries(byTourn)) {
    const tournRef = db.collection('tournamentStats').doc(tournId);
    const batch    = chunkedBatch();

    for (const p of rows) {
      if (!p.PlayerID) continue;
      const pRef = tournRef.collection('players').doc(String(p.PlayerID));
      batch.set(pRef, {
        name:         p.Name || '',
        college:      p._school || '',
        sportsDataId: p.PlayerID,
        live: {
          pts:    p.Points       || 0,
          reb:    p.Rebounds     || 0,
          ast:    p.Assists      || 0,
          stl:    p.Steals       || 0,
          blk:    p.BlockedShots || 0,
          gameId: String(p.GameID || ''),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();
    console.log(`[Tipoff] Live update: ${rows.length} players → ${tournId}`);
  }
}

// ── Write completed game stats (increment totals) ──────────────
async function writeCompletedStats(players) {
  const byTourn = groupByTournament(players);
  let written = 0;

  for (const [tournId, rows] of Object.entries(byTourn)) {
    const tournRef = db.collection('tournamentStats').doc(tournId);

    const gameIds = [...new Set(rows.map(p => String(p.GameID)).filter(Boolean))];

    // Skip games already committed (prevents double counting)
    const committedGames = new Set();
    await Promise.all(gameIds.map(async gId => {
      const logDoc = await tournRef.collection('gameLog').doc(gId).get();
      if (logDoc.exists && logDoc.data().committed) committedGames.add(gId);
    }));

    const newRows = rows.filter(p => !committedGames.has(String(p.GameID)));
    if (newRows.length === 0) {
      console.log(`[Tipoff] All games for ${tournId} already committed.`);
      continue;
    }

    const batch = chunkedBatch();

    for (const p of newRows) {
      if (!p.PlayerID) continue;
      const pRef = tournRef.collection('players').doc(String(p.PlayerID));
      batch.set(pRef, {
        name:         p.Name || '',
        college:      p._school || '',
        sportsDataId: p.PlayerID,
        totals: {
          pts:         admin.firestore.FieldValue.increment(p.Points       || 0),
          reb:         admin.firestore.FieldValue.increment(p.Rebounds     || 0),
          ast:         admin.firestore.FieldValue.increment(p.Assists      || 0),
          stl:         admin.firestore.FieldValue.increment(p.Steals       || 0),
          blk:         admin.firestore.FieldValue.increment(p.BlockedShots || 0),
          gamesPlayed: admin.firestore.FieldValue.increment(1),
        },
        live: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      written++;
    }

    const newGameIds = [...new Set(newRows.map(p => String(p.GameID)).filter(Boolean))];
    for (const gId of newGameIds) {
      batch.set(tournRef.collection('gameLog').doc(gId), {
        committed: true,
        committedAt: admin.firestore.FieldValue.serverTimestamp(),
        tournId,
      });
    }

    await batch.commit();
    console.log(`[Tipoff] Committed ${newRows.length} players across games [${newGameIds.join(', ')}] → ${tournId}`);
  }

  return written;
}

// ── Group enriched stat rows by _tournId ──────────────────────
function groupByTournament(players) {
  return players.reduce((acc, p) => {
    const t = p._tournId;
    if (!acc[t]) acc[t] = [];
    acc[t].push(p);
    return acc;
  }, {});
}

/* ══════════════════════════════════════════════════════════
   SEASON SYNC — real box scores for conference play
   Mirrors runSyncESPN, with three differences:
     • it matches against SEASON_SCHOOLS (79) rather than whichever
       teams a league picked for a tournament
     • it writes ONE shared record per player, not per tournament,
       because a box score is the same fact in every league
     • it runs across the whole regular season, not a few days

   Storage, under seasonStats/{SEASON_ID}:
     games/{eventId}    date, teams, scores, status
     players/{espnId}   games: { [eventId]: {pts,reb,ast,stl,blk,min,date} }

   Finished games are keyed by event id so re-running can never
   double-count. An in-progress game is overwritten in `live` on each
   poll, so a stat ESPN revises downward revises here too.
══════════════════════════════════════════════════════════ */
//  ── Did yesterday finish writing itself? ─────────────────────
//  runSeasonSyncESPN syncs ONE ET date: whatever today is. ESPN files a
//  game under the date it TIPPED, so a 9pm or 11:30pm ET tip is still
//  in progress when the ET date rolls over. By the time it goes final
//  the sync has moved to the new date, and nothing ever looks at the
//  old one again — so that game keeps completed:false forever, and its
//  player docs keep the last LIVE box score rather than the final one.
//
//  That is why a manager could not lock a game that had plainly ended:
//  the client was right to refuse, because the data really did say the
//  game was unfinished. Measured on Nov 9 2026: 23 of 23 relevant games
//  final at ESPN, 22 stored as final here. The missing one was a late
//  tip, and every slot pointing at it was locked out for the week.
//
//  This asks, for one Firestore read, whether the previous date still
//  has unfinished business. On a clean day the answer is no and the
//  catch-up costs zero API calls.
/*  Does this date still have work outstanding?

    Two kinds of outstanding, and the second one is new. A game that
    has not finished obviously needs another look. So does a game that
    HAS finished but carries no box score — which the old version of
    this function could not see, because it asked only for
    `completed == false`. On 16 Nov 2026 every game was completed:true
    with no stats behind it, so the overnight sweep looked at the day,
    saw nothing unfinished, and went back to sleep. Twelve games, zero
    points, and the one mechanism built to catch exactly this agreed
    that everything was fine.

    Filtered in code rather than with a second equality clause because
    documents written before statsRecorded existed have no such field,
    and `where('statsRecorded','==',false)` does not match a missing
    field — the stale documents that most need re-reading would be the
    only ones the query could not see.                               */
/*  One place that decides whether a sync result deserves a shout.

    console.error rather than log on purpose: Cloud Logging severity
    is the only thing that separates "ran fine" from "a slate of games
    scored zero for everybody" when nobody is reading the logs. These
    reports used to be identical.                                    */
function warnOnUnread(tag, report) {
  if (!report) return;
  const unread = (report.unrecordedFinals || []).length;
  const failed = (report.summaryFailures || []).length;
  const empty = (report.emptyBoxScores || []).length;
  if (!unread && !failed && !empty) return;
  console.error(tag + ' BOX SCORES MISSING', JSON.stringify({
    date: report.date,
    unrecordedFinals: report.unrecordedFinals,
    summaryFailures: report.summaryFailures,
    emptyBoxScores: report.emptyBoxScores,
  }));
}

async function dateNeedsWork(espnDate) {
  try {
    const snap = await db.collection('seasonStats').doc(SEASON_ID)
      .collection('games')
      .where('date', '==', isoFromEspnDate(espnDate))
      .limit(200)
      .get();
    let needs = false;
    snap.forEach(function (d) {
      const g = d.data() || {};
      if (g.completed !== true) { needs = true; return; }
      if (g.statsRecorded !== true) needs = true;
    });
    return needs;
  } catch (e) {
    //  If the query fails, do NOT sweep: a broken query must not turn
    //  into an API call every ten minutes.
    console.warn('[Tipoff season] outstanding-work lookup failed:', e.message);
    return false;
  }
}

async function runSeasonSyncESPN(opts) {
  const options = opts || {};
  const report = {
    ok: true, season: SEASON_ID, dryRun: !!options.dryRun,
    force: !!options.force,
    date: null, gamesOnDate: 0, relevantGames: 0,
    finalGames: 0, liveGames: 0,
    gamesWritten: 0, playersWritten: 0, apiCalls: 0,
    /*  ── The three fields that make a silent failure audible ──
        A box score that never arrives used to produce exactly the
        same report as one that did: the game was already written
        completed:true, the fetch failure hit a bare `continue`, and
        nothing anywhere said so. Twelve games can go to zero and the
        log reads like a clean run.

        summaryFailures  — ESPN returned an error or threw
        emptyBoxScores   — ESPN answered, but with no usable lines
        unrecordedFinals — final games still carrying no stats after
                           this pass. If this is ever non-empty after
                           a sweep hour, something needs a human.     */
    summaryFailures: [], emptyBoxScores: [], unrecordedFinals: [],
  };

  const now = new Date();
  const health = await readHealth();
  const client = makeApiClient(health, now);

  if (health.breakerUntil > Date.now()) {
    report.ok = false; report.reason = 'circuit breaker open';
    return report;
  }

  try {
    const dateStr = options.dateOverride || espnDateParam(now);
    report.date = dateStr;

    const sbRes = await client.apiFetch(`${ESPN}/scoreboard?dates=${dateStr}&${ESPN_DIVISION_I}&limit=500`, 'season-scoreboard');
    if (!sbRes.ok) throw new Error(`scoreboard HTTP ${sbRes.status}`);
    const sb = await sbRes.json();
    const events = sb.events || [];
    report.gamesOnDate = events.length;

    const gameBatch = chunkedBatch();
    const playerBatch = chunkedBatch();
    const seasonRef = db.collection('seasonStats').doc(SEASON_ID);

    /*  One Firestore read replaces dozens of ESPN summary calls: a
        game whose box score we already HAVE is finished business.

        ── WHY THIS IS NOT `completed == true` ──────────────────
        It used to be, and that is how twelve games went to zero on
        16 Nov 2026 and stayed there. The game document was written
        completed:true BEFORE the box score was fetched, so a summary
        call that failed left a document saying "this game is over"
        with no stats attached. Every later run found it in this set,
        skipped the box score, and moved on. Forever. One transient
        ESPN error at 10:40pm silently zeroed a whole slate, and
        nothing retried because the flag that meant "we are done"
        had been set by the step BEFORE the one that does the work.

        `completed` and `statsRecorded` are now two different facts:
        the game ended, and we read it. Only the second one earns a
        skip, and only flushGame() below can set it, after lines
        have actually been found.

        Existing documents have no statsRecorded field, so they fail
        this test and get re-read exactly once. That is the backfill:
        it costs one summary call per already-final game, once, and
        then settles.                                              */
    const alreadyFinal = new Set();
    try {
      const prior = await seasonRef.collection('games')
        .where('date', '==', isoFromEspnDate(dateStr))
        .where('completed', '==', true)
        .get();
      //  Filtered here rather than in the query on purpose: a third
      //  equality filter is fine for Firestore, but doing it in code
      //  keeps the old documents visible so they can be counted and
      //  reported rather than silently dropping out of the result.
      let staleFinals = 0;
      prior.forEach(function (d) {
        if ((d.data() || {}).statsRecorded === true) alreadyFinal.add(d.id);
        else staleFinals++;
      });
      report.skippedFinal = alreadyFinal.size;
      report.finalsNeedingStats = staleFinals;
    } catch (e) {
      console.warn('[Tipoff season] prior-final lookup failed:', e.message);
    }

    for (const ev of events) {
      const comp = (ev.competitions || [])[0];
      if (!comp) continue;

      const competitors = (comp.competitors || []).map(c => ({
        school: ((c.team || {}).location) || '',
        abbr: ((c.team || {}).abbreviation) || '',
        homeAway: c.homeAway,
        score: toInt(c.score),
        winner: c.winner === true,
      }));

      // Only games involving a school whose players are draftable.
      const touches = competitors.some(c => SEASON_SCHOOLS.has(normName(c.school)));
      if (!touches) continue;
      report.relevantGames++;

      const st = (comp.status || {});
      const stType = st.type || {};
      const gameState = stType.state || 'pre';
      const completed = stType.completed === true;
      if (completed) report.finalGames++;
      else if (gameState === 'in') report.liveGames++;

      const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
      const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};

      /*  ── The game document is no longer written here ─────────
          It is built here and committed by flushGame() below, AFTER
          the box score has been attempted. The old order wrote
          completed:true first and then went looking for stats, so a
          failure left behind a document that claimed the work was
          finished when it had not started. Nothing downstream could
          tell the difference, and the skip set above believed it.

          Every path out of this iteration now goes through
          flushGame(), which is the only writer. If you add an early
          exit below, it must call it too — otherwise the game simply
          vanishes from the collection, which is a worse failure than
          the one this replaces.                                   */
      const gameDoc = {
        eventId: String(ev.id),
        date: isoFromEspnDate(dateStr),   // ET day, matches the query above
        startsAt: ev.date || null,
        shortName: ev.shortName || ev.name || '',
        state: gameState,
        completed: completed,
        statusDetail: stType.shortDetail || stType.detail || '',
        home: { school: home.school, abbr: home.abbr, score: home.score },
        away: { school: away.school, abbr: away.abbr, score: away.score },
        winnerSchool: completed ? ((competitors.find(c => c.winner) || {}).school || null) : null,
        //  Normalised participants, so a client can ask for "games
        //  involving MY schools" instead of pulling an entire week.
        //  With groups=50 a week is ~700 games; a league rosters
        //  about 30 schools and needs maybe 30 of those games.
        //  Without this field the only filter available is the date
        //  range, and every client would read all 700.
        schools: [normName(home.school), normName(away.school)].filter(Boolean),
      };

      let linesFound = 0;
      const flushGame = function (statsRecorded) {
        //  A final game we could not read is reported, every pass,
        //  until somebody or something fixes it. Silence was the
        //  whole problem.
        if (completed && !statsRecorded) report.unrecordedFinals.push(String(ev.id));
        if (options.dryRun) return;
        gameBatch.set(seasonRef.collection('games').doc(String(ev.id)),
          Object.assign({}, gameDoc, {
            statsRecorded: !!statsRecorded,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }), { merge: true });
        report.gamesWritten++;
      };

      // Box score. Nothing to read before tip. A game already stored
      // WITH its stats is finished business — see the long note above
      // on why that is not the same as "completed".
      if (gameState === 'pre') { flushGame(false); continue; }
      if (completed && alreadyFinal.has(String(ev.id)) && !options.force) continue;

      let summary = null;
      try {
        const sumRes = await client.apiFetch(`${ESPN}/summary?event=${ev.id}`, 'season-summary');
        if (sumRes.ok) summary = await sumRes.json();
        else report.summaryFailures.push(`${ev.id} HTTP ${sumRes.status}`);
      } catch (e) {
        report.summaryFailures.push(`${ev.id} ${e.message}`);
      }
      if (!summary) { flushGame(false); continue; }

      const teamBlocks = ((summary.boxscore || {}).players) || [];
      for (const tb of teamBlocks) {
        const school = ((tb.team || {}).location) || '';
        if (!SEASON_SCHOOLS.has(normName(school))) continue;   // opponent outside the pool

        const block = (tb.statistics || [])[0] || {};
        const keyIndex = {};
        (block.keys || []).forEach((k, i) => { keyIndex[k] = i; });

        for (const row of (block.athletes || [])) {
          const ath = row.athlete || {};
          if (!ath.id) continue;
          if (row.didNotPlay) continue;

          const s = statsFromRow(row, keyIndex);
          if (!s.min && !s.pts && !s.reb && !s.ast) continue;   // never checked in

          const ref = seasonRef.collection('players').doc(String(ath.id));
          const line = {
            pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, min: s.min,
            date: isoFromEspnDate(dateStr), gameId: String(ev.id),
          };

          if (!options.dryRun) {
            if (completed) {
              playerBatch.set(ref, {
                espnId: String(ath.id),
                name: ath.displayName || ath.fullName || '',
                school: school,
                games: { [String(ev.id)]: line },
                live: admin.firestore.FieldValue.delete(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              }, { merge: true });
            } else {
              playerBatch.set(ref, {
                espnId: String(ath.id),
                name: ath.displayName || ath.fullName || '',
                school: school,
                live: line,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              }, { merge: true });
            }
            report.playersWritten++;
          }
          //  Counted OUTSIDE the dryRun guard on purpose: a dry run
          //  that reported zero lines for a game it had actually read
          //  fine would send you hunting for a bug that is not there.
          linesFound++;
        }
      }

      /*  statsRecorded is earned here and nowhere else. ESPN
          answering with an empty or unparseable box score is a
          different failure from ESPN not answering, and it is the
          one that looks most like success, so it gets its own list. */
      if (completed && !linesFound) report.emptyBoxScores.push(String(ev.id));
      flushGame(linesFound > 0);
    }

    if (!options.dryRun) {
      await gameBatch.commit();
      await playerBatch.commit();

      //  ── Revision heartbeat on the PARENT document ──────────
      //  Clients were polling the whole week every 90 seconds: the
      //  games query returns ~79 documents and then one read per
      //  rostered player, about 159 reads a tick. That is ~6,400
      //  reads an hour, so a SINGLE person with the app open for an
      //  8-hour game day exhausted the entire 50,000/day free tier.
      //
      //  This one tiny document lets a client ask "has anything
      //  changed?" for one read. The expensive week read then only
      //  happens when the answer is yes, which is at most once per
      //  10-minute sync rather than 40 times an hour.
      await seasonRef.set({
        rev: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastDate: isoFromEspnDate(dateStr),
        gamesOnDate: report.gamesOnDate || 0,
        gamesWritten: report.gamesWritten || 0,
        playersWritten: report.playersWritten || 0,
        // How many of the day's games are still in progress. The
        // client uses this to decide how hard to poll.
        liveGames: report.liveGames || 0,
        season: SEASON_ID
      }, { merge: true });
    }
  } catch (e) {
    report.ok = false;
    report.reason = e.message;
    console.error('[Tipoff season]', e);
  }

  //  Same bookkeeping the tournament sync uses: call counts, the
  //  monthly budget and the failure breaker are shared, so season
  //  polling cannot quietly blow through the ceiling on its own.
  try { await commitHealth(health, client.state, now); } catch (e) {}
  report.apiCalls = client.state.calls;
  report.callsThisMonth = health.calls;
  return report;
}

/* ══════════════════════════════════════════════════════════
   SEASON FIXTURES — games that have NOT been played yet

   WHY THIS IS SEPARATE FROM runSeasonSyncESPN
     That function syncs exactly one date: today. It is the right shape
     for box scores, which only exist after a tip. But it means nothing
     ever writes a future date, so the app could not answer the first
     question any manager asks — "who do my players have this week?"
     A manager who joined mid-week saw an empty screen with no way to
     tell whether his roster was idle or the app simply did not know.

   WHY IT IS CHEAP
     A future game has no box score, so there is nothing to fetch
     beyond the scoreboard itself: one API call per date, versus the
     dozens of summary calls a played date costs. ESPN rejects a date
     RANGE on this endpoint (dates=A-B returns HTTP 400, verified), so
     it is one call per day, walked forward.

     At FIXTURE_DAYS=14 run once daily that is ~420 calls a month
     against a 60,000 ceiling. It shares the same health record and
     circuit breaker as every other sync, so it cannot overrun the
     budget on its own.

   WHAT IT WRITES
     The same games/{eventId} documents, with merge:true and the same
     `schools` array the client queries on. A fixture written today is
     simply overwritten with scores by the box-score sync on the day it
     is played — no second code path, no reconciliation.
══════════════════════════════════════════════════════════ */
const FIXTURE_DAYS = 14;

async function runSeasonFixtures(opts) {
  const options = opts || {};
  const days = Math.max(1, Math.min(28, parseInt(options.days, 10) || FIXTURE_DAYS));
  const report = {
    ok: true, season: SEASON_ID, dryRun: !!options.dryRun,
    days: days, from: null, to: null,
    datesChecked: 0, datesSkipped: 0, gamesSeen: 0,
    relevantGames: 0, fixturesWritten: 0, apiCalls: 0, perDate: {},
  };

  const now = new Date();
  const health = await readHealth();
  const client = makeApiClient(health, now);

  if (health.breakerUntil > Date.now()) {
    report.ok = false; report.reason = 'circuit breaker open';
    return report;
  }

  try {
    const start = options.startDate ? new Date(options.startDate + 'T12:00:00Z') : now;
    const seasonRef = db.collection('seasonStats').doc(SEASON_ID);
    const batch = chunkedBatch();

    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 864e5);
      const dateStr = espnDateParam(d);
      const iso = isoFromEspnDate(dateStr);
      if (i === 0) report.from = iso;
      report.to = iso;

      //  Outside the regular season there is nothing worth a call.
      if (!withinSeasonWindow(iso)) { report.datesSkipped++; continue; }

      let sb;
      try {
        const res = await client.apiFetch(
          `${ESPN}/scoreboard?dates=${dateStr}&${ESPN_DIVISION_I}&limit=500`, 'season-fixtures');
        if (!res.ok) { report.perDate[iso] = `HTTP ${res.status}`; continue; }
        sb = await res.json();
      } catch (e) { report.perDate[iso] = 'fetch failed'; continue; }

      report.datesChecked++;
      const events = sb.events || [];
      report.gamesSeen += events.length;
      let kept = 0;

      for (const ev of events) {
        const comp = (ev.competitions || [])[0];
        if (!comp) continue;
        const competitors = (comp.competitors || []).map(c => ({
          school: ((c.team || {}).location) || '',
          abbr: ((c.team || {}).abbreviation) || '',
          homeAway: c.homeAway,
          score: toInt(c.score),
          winner: c.winner === true,
        }));
        if (!competitors.some(c => SEASON_SCHOOLS.has(normName(c.school)))) continue;
        report.relevantGames++;
        kept++;

        const stType = (comp.status || {}).type || {};
        const gameState = stType.state || 'pre';
        const completed = stType.completed === true;
        const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
        const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};

        if (options.dryRun) continue;
        //  merge:true matters here. If the box-score sync has already
        //  written this game today, this must not blank its scores —
        //  and because every field below is re-derived from the same
        //  scoreboard payload, a merge is always safe.
        batch.set(seasonRef.collection('games').doc(String(ev.id)), {
          eventId: String(ev.id),
          date: iso,
          startsAt: ev.date || null,
          shortName: ev.shortName || ev.name || '',
          state: gameState,
          completed: completed,
          statusDetail: stType.shortDetail || stType.detail || '',
          home: { school: home.school, abbr: home.abbr, score: home.score },
          away: { school: away.school, abbr: away.abbr, score: away.score },
          winnerSchool: completed ? ((competitors.find(c => c.winner) || {}).school || null) : null,
          schools: [normName(home.school), normName(away.school)].filter(Boolean),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        report.fixturesWritten++;
      }
      report.perDate[iso] = kept;
    }

    if (!options.dryRun && report.fixturesWritten) {
      await batch.commit();
      //  Bump the same heartbeat the client's revision gate reads, so
      //  an open app notices new fixtures instead of waiting out its
      //  cache.
      await seasonRef.set({
        rev: admin.firestore.FieldValue.increment(1),
        fixturesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        season: SEASON_ID,
      }, { merge: true });
    }
  } catch (e) {
    report.ok = false;
    report.reason = e.message;
    console.error('[Tipoff fixtures]', e);
  }

  try { await commitHealth(health, client.state, now); } catch (e) {}
  report.apiCalls = client.state.calls;
  report.callsThisMonth = health.calls;
  return report;
}

//  Once a day, early morning ET: the slate for the next two weeks does
//  not change often enough to justify polling it.
exports.syncSeasonFixtures = onSchedule(
  {
    schedule: '15 7 * * *',
    timeZone: 'America/New_York',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    const report = await runSeasonFixtures({});
    console.log('[Tipoff fixtures]', JSON.stringify(report));
  }
);

// On-demand:
//   /seasonFixturesNow                        (dry run, next 14 days)
//   /seasonFixturesNow?write=1
//   /seasonFixturesNow?write=1&days=21&start=2026-11-09
exports.seasonFixturesNow = onRequest(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (req, res) => {
    try {
      const report = await runSeasonFixtures({
        dryRun: req.query.write !== '1',
        days: req.query.days,
        startDate: req.query.start || undefined,
      });
      res.status(200).json(report);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

exports.syncSeasonStats = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'America/New_York',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    const now = new Date();
    const today = etISODate(now);

    if (!withinSeasonWindow(today)) {
      console.log(`[Tipoff season] ${today} is outside the regular season. No API calls.`);
      return;
    }
    if (!withinActiveHours(now)) {
      console.log(`[Tipoff season] outside active hours (${etParts(now).h}:00 ET). No API calls.`);
      return;
    }

    //  ── Catch up on yesterday's late tips ───────────────────
    //  See dateNeedsWork. A game that tipped at 9pm or 11:30pm ET
    //  is still live when the ET date flips, and this sync only ever
    //  looks at today — so the game stayed completed:false and its
    //  roster kept a mid-game box score. Managers could not lock it and
    //  the client was right to refuse, because the data said unfinished.
    //
    //  Bounded on purpose. It runs only in the overnight hours when a
    //  late game would have ended, plus the first hour of the next
    //  slate as a safety net for anything that finished while the sync
    //  was asleep. Without that bound, a game ESPN never marks complete
    //  (a postponement) would cost an API call every ten minutes for
    //  the rest of the day, forever.
    const hourET = etParts(now).h;
    const sweepHour = hourET <= ACTIVE_HOUR_END || hourET === ACTIVE_HOUR_START;
    if (sweepHour) {
      const yest = espnDateParam(new Date(now.getTime() - 864e5));
      if (await dateNeedsWork(yest)) {
        //  force: a final game with no stats is skipped by the
        //  already-recorded set unless the sweep overrides it, which
        //  would make the sweep a no-op for the exact case it exists
        //  to repair.
        const catchUp = await runSeasonSyncESPN({ dateOverride: yest, force: true });
        console.log('[Tipoff season] catch-up', yest, JSON.stringify(catchUp));
        warnOnUnread('[Tipoff season] catch-up', catchUp);
      }
    }

    const report = await runSeasonSyncESPN({});
    console.log('[Tipoff season]', JSON.stringify(report));
    warnOnUnread('[Tipoff season]', report);
  }
);

// On-demand, for testing a specific date before the season opens:
//   /seasonSyncNow?date=20261102       (dry run by default)
//   /seasonSyncNow?date=20261102&write=1
/* ═══════════════════════════════════════════════════════════════
   📈 PROJECTIONS
   ═══════════════════════════════════════════════════════════════
   The app has always priced every player at last season's per-game
   average, frozen in data/conference-players.js on 2026-10-27. A
   junior who has taken a leap, a freshman who won the job in week
   one, a senior who lost it — all three stay at last year's number
   until somebody regenerates that file by hand. A quarter of the
   pool (260 of 1027) has no prior line at all and is currently given
   a RANDOM one, seeded off the player id, which is worse than it
   sounds: a five-star and a walk-on draw from the same distribution.

   The arithmetic lives in projection.js, which is pure and has no
   Firebase in it, so .tests/projection.js backtests the exact code
   that ships rather than a copy of it.

   ── COSTS NOTHING ─────────────────────────────────────────
   Zero ESPN calls. This is a pure recomputation of box scores
   already in Firestore, which is why it can run nightly instead of
   weekly. A weekly refresh is not cheaper — it just leaves a player
   who broke out on Monday mispriced until Sunday, while managers set
   lineups midweek.

   ── WHY STAT LINES AND NOT FANTASY POINTS ─────────────────
   Scoring weights are a league setting. A league that scores blocks
   at 3 and one that ignores them read the same document and must
   reach different, correct answers. Storing a single fpts number
   would bake one league's rules into everybody's projection.
═══════════════════════════════════════════════════════════════ */
const PROJ = require('./projection.js');
const PRIORS = require('./priors.json');

async function runProjections(opts) {
  const options = opts || {};
  const report = {
    ok: true, season: SEASON_ID, dryRun: !!options.dryRun,
    poolPlayers: Object.keys(PRIORS.priors || {}).length,
    withSeasonData: 0, written: 0,
    byMethod: {}, sample: [],
  };

  try {
    const seasonRef = db.collection('seasonStats').doc(SEASON_ID);

    //  Everything the stat sync has recorded this season, keyed by
    //  espnId (which is the document id).
    const played = {};
    const snap = await seasonRef.collection('players').get();
    snap.forEach(function (d) {
      const data = d.data() || {};
      const games = Object.keys(data.games || {}).map(function (gid) {
        return data.games[gid];
      });
      played[d.id] = { games: games, name: data.name || '', school: data.school || '' };
    });
    report.withSeasonData = Object.keys(played).length;

    const batch = chunkedBatch();
    const packed = {};

    /*  Iterate the POOL, not the players who happen to have played.
        A player who has not appeared yet still needs a projection —
        he is on the draft board, and leaving him out would make him
        invisible rather than merely unproven.                      */
    Object.keys(PRIORS.priors).forEach(function (espnId) {
      const prior = PRIORS.priors[espnId];
      const seen = played[espnId] || { games: [], name: '', school: '' };

      const p = PROJ.project({
        prior: prior,
        games: seen.games,
        pos: prior.pos,
        replacement: PRIORS.replacement,
      });

      report.byMethod[p.method] = (report.byMethod[p.method] || 0) + 1;

      if (report.sample.length < 5 && p.n >= 2) {
        report.sample.push({
          name: seen.name || espnId, n: p.n, method: p.method,
          line: p.line, wMin: p.weightMinutes, wRate: p.weightRate,
        });
      }

      /*  ── Packed, not one document per player ─────────────────
          A document each would be 1027 reads every time a client
          builds its draft board. Ten managers opening the app twice
          a day is 20,000 reads against a 50,000/day free tier, for
          data that changes once a night and is identical for
          everyone. Packing them into shards makes it 3 reads.

          The array is positional and ugly on purpose — keys repeated
          1027 times are most of the payload. Order is fixed and
          documented here and in the client's unpack:

            [ min, pts, reb, ast, stl, blk, gamesPlayed, methodCode ]

          methodCode: 0 blend · 1 prior-only · 2 blend-replacement
                      3 replacement-only                            */
      packed[espnId] = [
        p.line.min, p.line.pts, p.line.reb, p.line.ast, p.line.stl, p.line.blk,
        p.n,
        p.method === 'blend' ? 0 : p.method === 'prior-only' ? 1
          : p.method === 'blend-replacement' ? 2 : 3,
      ];
      report.written++;
    });

    if (!options.dryRun) {
      /*  Shards of 400. A Firestore document caps at 1MB; 1027
          packed lines is roughly 60KB so one would fit today — but
          the pool grows when conferences are added, and a feed that
          silently stops writing the day it crosses 1MB is exactly
          the kind of cliff this codebase has been bitten by twice
          this week. Shard now, while it costs nothing.            */
      const ids = Object.keys(packed);
      const SHARD = 400;
      const shards = Math.max(1, Math.ceil(ids.length / SHARD));
      for (let i = 0; i < shards; i++) {
        const slice = {};
        ids.slice(i * SHARD, (i + 1) * SHARD).forEach(function (id) { slice[id] = packed[id]; });
        batch.set(seasonRef.collection('feeds').doc('projections_' + i), {
          shard: i, count: Object.keys(slice).length,
          format: 'min,pts,reb,ast,stl,blk,games,method',
          k: PROJ.K,
          players: slice,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      report.shards = shards;

      /*  Stale shards from a previous, larger pool would otherwise
          linger and the client would merge ghosts into its board. */
      const old = await seasonRef.collection('feeds').get();
      old.forEach(function (d) {
        const m = /^projections_(\d+)$/.exec(d.id);
        if (m && +m[1] >= shards) batch.set(d.ref, { players: {}, count: 0, retired: true });
      });

      await batch.commit();
      //  Same heartbeat pattern the stat feed uses: one tiny document
      //  so a client can ask "are the projections newer than what I
      //  am holding?" for a single read.
      await seasonRef.set({
        projRev: admin.firestore.FieldValue.increment(1),
        projUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        projCount: report.written,
        projShards: report.shards,
      }, { merge: true });
    }
  } catch (e) {
    report.ok = false;
    report.error = e.message;
    console.error('[Tipoff proj]', e);
  }
  return report;
}

/*  THE REAL BACKTEST.

    .tests/projection.js measures the estimator on SIMULATED seasons,
    which proves the arithmetic behaves and nothing about real
    players. This measures it on actual box scores: walk each player's
    games in order, predict game g from games 0..g-1 only, and compare
    against what he actually did. Same three contenders as the test
    suite — the model, last season's average, and season-to-date.

    Read-only. Needs a handful of games per player before it says
    anything; with three it is measuring noise and reports as much.  */
async function runProjectionBacktest(opts) {
  const o = opts || {};
  const minGames = Math.max(2, +o.minGames || 4);
  const W = o.weights || { pts: 1, reb: 1.2, ast: 1.5, stl: 2, blk: 2 };

  const seasonRef = db.collection('seasonStats').doc(SEASON_ID);
  const snap = await seasonRef.collection('players').get();

  const err = { model: 0, prior: 0, std: 0 };
  let n = 0, players = 0, skipped = 0;
  const byN = {};

  snap.forEach(function (d) {
    const data = d.data() || {};
    const prior = PRIORS.priors[d.id];
    //  Games in date order. Out-of-order would let the model see the
    //  future, which is the classic way a backtest flatters itself.
    const games = Object.keys(data.games || {})
      .map(function (g) { return data.games[g]; })
      .filter(function (g) { return g && +g.min > 0; })
      .sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });

    if (games.length < minGames) { skipped++; return; }
    players++;

    for (let g = 1; g < games.length; g++) {
      const hist = games.slice(0, g);
      const actual = games[g];
      const a = PROJ.fptsOf(actual, W);

      const model = PROJ.fptsOf(PROJ.project({
        prior: prior, games: hist, pos: (prior || {}).pos,
        replacement: PRIORS.replacement,
      }).line, W);
      const bp = PROJ.fptsOf(PROJ.baselinePrior(prior || {}), W);
      const bs = PROJ.fptsOf(PROJ.baselineSeasonToDate(hist), W);

      err.model += Math.abs(model - a);
      err.prior += Math.abs(bp - a);
      err.std += Math.abs(bs - a);
      n++;

      const b = byN[g] = byN[g] || { model: 0, prior: 0, std: 0, n: 0 };
      b.model += Math.abs(model - a); b.prior += Math.abs(bp - a);
      b.std += Math.abs(bs - a); b.n++;
    }
  });

  if (!n) {
    return {
      ok: true, season: SEASON_ID, predictions: 0, playersUsed: 0, skipped: skipped,
      note: 'not enough games yet — every player has fewer than ' + minGames +
            '. Run this again once the season has a few weeks in it.',
    };
  }

  const mae = { model: err.model / n, prior: err.prior / n, std: err.std / n };
  return {
    ok: true, season: SEASON_ID, k: PROJ.K,
    playersUsed: players, skippedTooFewGames: skipped, predictions: n,
    maeFantasyPoints: {
      model: +mae.model.toFixed(3),
      lastSeasonAverage: +mae.prior.toFixed(3),
      seasonToDateAverage: +mae.std.toFixed(3),
    },
    beatsLastSeason: mae.model < mae.prior,
    beatsSeasonToDate: mae.model < mae.std,
    //  Honest framing. A thin sample is a thin sample however nice
    //  the number looks.
    verdict: n < 400
      ? 'SAMPLE TOO SMALL to conclude anything — treat as a smoke test'
      : (mae.model < mae.prior && mae.model < mae.std)
        ? 'model beats both baselines'
        : 'MODEL DOES NOT BEAT BOTH BASELINES — do not ship it as-is',
    byGameIndex: Object.keys(byN).sort(function (a, b) { return a - b; }).slice(0, 12)
      .reduce(function (acc, key) {
        const b = byN[key];
        acc['after_' + key + '_games'] = {
          model: +(b.model / b.n).toFixed(2),
          prior: +(b.prior / b.n).toFixed(2),
          s2d: +(b.std / b.n).toFixed(2),
          n: b.n,
        };
        return acc;
      }, {}),
  };
}

/*  Nightly, after the last game has finished and the stat sync's
    overnight sweep has had its chance to repair anything. 3:30am ET
    is deliberately AFTER ACTIVE_HOUR_END (2:59am), so projections are
    never computed from a slate that is still being written.         */
exports.syncProjections = onSchedule(
  { schedule: '30 3 * * *', timeZone: 'America/New_York', timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    const report = await runProjections({});
    console.log('[Tipoff proj]', JSON.stringify(report));
    if (!report.ok) console.error('[Tipoff proj] FAILED', report.error);
  }
);

//  On demand. Dry by default, like every other tool in this file.
//    /projectionsNow                → preview, writes nothing
//    /projectionsNow?write=1        → recompute and store
//    /projectionsNow?backtest=1     → measure against real box scores
exports.projectionsNow = onRequest(
  { timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    try {
      if (req.query.backtest === '1') {
        return res.status(200).json(await runProjectionBacktest({ minGames: +req.query.minGames || 4 }));
      }
      res.status(200).json(await runProjections({ dryRun: req.query.write !== '1' }));
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

exports.seasonSyncNow = onRequest(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (req, res) => {
    try {
      const report = await runSeasonSyncESPN({
        dateOverride: req.query.date || undefined,
        dryRun: req.query.write !== '1',
        /*  force=1 ignores the already-recorded skip and re-reads
            every box score on the date. This is the backfill lever:
            without it there is NO way to repair a day whose games
            were marked final with no stats, because the skip is
            exactly what stops the retry. Costs one summary call per
            relevant game, so it is opt-in rather than the default. */
        force: req.query.force === '1',
      });
      res.status(200).json(report);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);


/* ═══════════════════════════════════════════════════════════════
   🔔 WEB PUSH  —  the sender
   ═══════════════════════════════════════════════════════════════
   Everything the client can do by itself stops at the moment the
   page closes. The whole point of the on-the-clock alert is to
   reach someone whose phone is locked in a pocket, and only a
   server-sent push can do that.

   ── WHY A FIRESTORE TRIGGER AND NOT A SCHEDULE ──
   A scheduled function would have to poll every league every minute
   to notice a turn change, and would still be up to a minute late on
   a 60-second pick clock. The league document is already written on
   every pick by whichever device made it, so the write itself is the
   event. onDocumentWritten fires within a second or two and costs
   nothing when nobody is drafting.

   This also puts the decision in the one place that is always
   awake. The draft clock is client-side: the autopick is performed
   by whichever device happens to be watching. If notifying were the
   client's job too, a league where everybody has the app closed —
   exactly the case that needs the alert — would notify nobody.

   ── THE PRIVATE KEY ──
   VAPID_PRIVATE_KEY is a Cloud Functions secret, declared per
   function below and read at runtime. It is never in source. The
   matching public key is in firebase-config.js, where it belongs.
═══════════════════════════════════════════════════════════════ */
const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const webpush = require('web-push');

const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');

//  Must match window.TIPOFF_VAPID_PUBLIC_KEY in firebase-config.js.
//  A mismatch is silent: every send returns 403 and nobody is told,
//  so sendToUser logs it loudly rather than swallowing the failure.
const VAPID_PUBLIC_KEY = 'BN6ueT1oTMAH5ln1iLPs7JgN-A0HE9rVld5j1HNRrxHAdM3YVDQvwaofnmM4RmC7nCl0fvEFkGk6mTyXNjP7KbM';
const VAPID_SUBJECT = 'mailto:support@tipofffantasy.com';

let _vapidReady = false;
function initVapid() {
  if (_vapidReady) return true;
  const priv = VAPID_PRIVATE_KEY.value();
  if (!VAPID_PUBLIC_KEY || !priv) {
    console.warn('[Push] VAPID keys not configured; no notifications will be sent.');
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, priv);
  _vapidReady = true;
  return true;
}

/*  Send one payload to every device a user has registered.

    Pruning is the part that is easy to skip and expensive to skip.
    Endpoints die constantly — app uninstalled, site data cleared,
    browser rotated the endpoint — and a dead one returns 404 or 410
    forever. Without pruning, a league that ran a draft in November
    is still costing a failed HTTP request per pick next March, and
    the logs fill with errors that look like a bug.

    403 is different and must NOT prune: it means the VAPID key does
    not match the one the subscription was created with. The
    subscription is fine; the server is misconfigured. Deleting on
    403 would quietly wipe every subscription in the database the
    first time somebody rotated a key.                            */
async function sendToUser(uid, payload) {
  if (!uid) return { sent: 0, pruned: 0, failed: 0 };
  if (!initVapid()) return { sent: 0, pruned: 0, failed: 0, reason: 'no-keys' };

  const snap = await db.collection('users').doc(uid).collection('pushSubs').get();
  if (snap.empty) return { sent: 0, pruned: 0, failed: 0, reason: 'no-subs' };

  const body = JSON.stringify(payload);
  let sent = 0, pruned = 0, failed = 0;

  await Promise.all(snap.docs.map(async (doc) => {
    const d = doc.data() || {};
    if (!d.endpoint || !d.keys) { await doc.ref.delete(); pruned++; return; }
    try {
      await webpush.sendNotification(
        { endpoint: d.endpoint, keys: { p256dh: d.keys.p256dh, auth: d.keys.auth } },
        body,
        //  TTL matters for a pick clock. If the push service cannot
        //  reach the device within the pick window the alert is
        //  worthless and actively confusing — "you're on the clock"
        //  arriving twenty minutes after the pick was autodrafted.
        //  Let it expire instead.
        { TTL: payload.ttl || 600, urgency: payload.urgent ? 'high' : 'normal' }
      );
      sent++;
    } catch (e) {
      const code = e && e.statusCode;
      if (code === 404 || code === 410) {
        await doc.ref.delete();
        pruned++;
      } else if (code === 403) {
        failed++;
        console.error('[Push] 403 from push service — VAPID public key in functions/index.js ' +
                      'does not match the one in firebase-config.js. No pushes will work until they agree.');
      } else {
        failed++;
        console.warn('[Push] send failed', code, e && e.message);
      }
    }
  }));

  return { sent, pruned, failed };
}

/*  Dedupe guard.

    Firestore triggers are at-least-once: the same write can be
    delivered twice, and a retry after a transient error will
    re-deliver it. Two identical "you're on the clock" buzzes for one
    pick is the kind of detail that makes an app feel broken.

    The marker is keyed on what makes the event unique — league plus
    pick number — and written with create(), which fails if the
    document already exists. That makes the check atomic, so two
    concurrent deliveries cannot both pass it.                     */
async function claimOnce(key) {
  const ref = db.collection('pushSent').doc(key);
  try {
    await ref.create({ at: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  } catch (e) {
    //  ALREADY_EXISTS (6) is the normal "someone else got here
    //  first" answer. Anything else is a real error, and we would
    //  rather send a duplicate than drop the alert entirely.
    if (e && (e.code === 6 || e.code === 'already-exists')) return false;
    console.warn('[Push] claim check failed, sending anyway:', e && e.message);
    return true;
  }
}

const APP_URL = 'https://app.tipofffantasy.com/';

/* ── SEASON MODE: on the clock ─────────────────────────────────
   seasonLeagues/{code} holds the whole league as one blob:
     state.draft  = { order:[teamId], pick:int, status, endsAt }
     state.teams  = [{ id, name, uid|null, ... }]
   A bot seat has no uid. The team on the clock is
   state.draft.order[state.draft.pick].                          */
exports.onSeasonDraftTurn = onDocumentWritten(
  {
    document: 'seasonLeagues/{code}',
    secrets: [VAPID_PRIVATE_KEY],
    //  Draft writes are bursty — ten managers refreshing one league.
    //  A low cap keeps a runaway league from eating the whole
    //  project's function quota.
    maxInstances: 10,
  },
  async (event) => {
    const before = event.data && event.data.before && event.data.before.data();
    const after = event.data && event.data.after && event.data.after.data();
    if (!after) return;

    const sd = (after.state && after.state.draft) || null;
    const pd = (before && before.state && before.state.draft) || null;
    if (!sd || sd.status !== 'live') return;

    const pick = Number(sd.pick);
    if (!Number.isFinite(pick)) return;
    //  Only a CHANGE of turn is news. The league doc is rewritten on
    //  every roster edit, chat message and clock tick; without this
    //  the same manager gets notified over and over for one pick.
    if (pd && Number(pd.pick) === pick && pd.status === 'live') return;

    const teams = (after.state && after.state.teams) || [];
    const teamId = (sd.order || [])[pick];
    const seat = teams.filter(t => t && t.id === teamId)[0];
    //  No uid = a bot seat. Nobody to tell.
    if (!seat || !seat.uid) return;

    const code = event.params.code;
    if (!await claimOnce('season:' + code + ':' + pick)) return;

    const numTeams = (after.state.league && after.state.league.numTeams) || teams.length || 1;
    const round = Math.floor(pick / numTeams) + 1;
    const leagueName = (after.state.league && after.state.league.name) || 'your league';
    //  Seconds, from the shared clock the league writes.
    const left = sd.endsAt ? Math.max(0, Math.round((sd.endsAt - Date.now()) / 1000)) : null;

    const res = await sendToUser(seat.uid, {
      title: "You're on the clock",
      body: 'Round ' + round + ' in ' + leagueName +
            (left ? ' · ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' to pick.' : '.'),
      tag: 'otc-' + code,
      kind: 'onClock',
      urgent: true,
      //  Expire with the pick clock. A stale alert is worse than none.
      ttl: left && left > 0 ? left + 30 : 180,
      url: APP_URL
    });
    console.log('[Push] season otc', code, 'pick', pick, JSON.stringify(res));
  }
);

/* ── TOURNAMENT MODE: on the clock ─────────────────────────────
   leagues/{code} is shaped differently and predates uids entirely:
     managers        = ["Jake", "Luke"]        (display names)
     managerUids     = { Jake: "abc…" }        (added at join time)
     currentPickIndex = int
   The draft order is snake, rebuilt from managers, so the manager on
   the clock is derived rather than stored. buildDraftOrder() in
   app.js is the source of truth for that shape; this mirrors it.  */
function managerOnClock(managers, idx) {
  const n = (managers || []).length;
  if (!n || !Number.isFinite(idx) || idx < 0) return null;
  const round = Math.floor(idx / n);          // 0-based
  const slot = idx % n;
  //  Snake: even rounds run forward, odd rounds reverse.
  const list = round % 2 === 0 ? managers : managers.slice().reverse();
  return list[slot] || null;
}

exports.onTournamentDraftTurn = onDocumentWritten(
  {
    document: 'leagues/{code}',
    secrets: [VAPID_PRIVATE_KEY],
    maxInstances: 10,
  },
  async (event) => {
    const before = event.data && event.data.before && event.data.before.data();
    const after = event.data && event.data.after && event.data.after.data();
    if (!after) return;

    const idx = Number(after.currentPickIndex);
    if (!Number.isFinite(idx)) return;
    if (before && Number(before.currentPickIndex) === idx) return;

    const managers = Array.isArray(after.managers) ? after.managers.filter(Boolean) : [];
    //  `rounds`, not `rosterSize`. The tournament state calls it
    //  rounds (freshState → rounds: 8) and that is what gets
    //  persisted, so reading rosterSize gave 0 and the completion
    //  guard below never fired — meaning the manager holding the
    //  first slot got told he was on the clock once more after the
    //  final pick. Caught by the push suite, which runs the real
    //  buildDraftOrder from app.js against this file's arithmetic.
    const rounds = Number(after.rounds) || 0;
    if (rounds && idx >= managers.length * rounds) return;   // complete

    const name = managerOnClock(managers, idx);
    if (!name) return;
    const uid = (after.managerUids || {})[name];
    //  A manager who joined before uid claiming existed, or a seat
    //  being run locally. Nothing to send to, and that is fine.
    if (!uid) return;

    const code = event.params.code;
    if (!await claimOnce('tourn:' + code + ':' + idx)) return;

    const round = Math.floor(idx / managers.length) + 1;
    const res = await sendToUser(uid, {
      title: "You're on the clock",
      body: 'Pick ' + (idx + 1) + ' · Round ' + round + ' in ' +
            (after.leagueName || 'your league') + '. Tap to draft.',
      tag: 'otc-' + code,
      kind: 'onClock',
      urgent: true,
      ttl: 180,
      url: APP_URL
    });
    console.log('[Push] tournament otc', code, 'pick', idx, JSON.stringify(res));
  }
);

/*  Manual send, for proving the pipeline end to end before a draft.
      /pushTest?uid=<your uid>
    Returns the per-device result, so "sent: 0, reason: no-subs"
    tells you the subscription never stored, while "sent: 1" and no
    banner points at the service worker instead. Without this you are
    debugging four moving parts through one silent symptom.        */
exports.pushTest = onRequest(
  { secrets: [VAPID_PRIVATE_KEY], timeoutSeconds: 60 },
  async (req, res) => {
    const uid = String(req.query.uid || '');
    if (!uid) { res.status(400).json({ ok: false, error: 'pass ?uid=' }); return; }
    try {
      const out = await sendToUser(uid, {
        title: 'Tipoff test alert',
        body: 'If you can read this on your lock screen, push is working.',
        tag: 'tipoff-test',
        kind: 'test',
        url: APP_URL
      });
      res.status(200).json({ ok: true, uid, result: out });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

/* ═══════════════════════════════════════════════════════════════
   FEEDBACK  →  EMAIL
   ═══════════════════════════════════════════════════════════════
   The client writes a report to `feedback`. This copies it into the
   Trigger Email extension's `mail` collection, which does the
   sending.

   WHY THE EXTRA HOP
   The extension sends whatever it finds in `mail`. If clients could
   write there, anyone with the app open could send arbitrary email
   from this domain — an open relay carrying our name. So `mail` is
   closed to clients in firestore.rules and only this function, on
   the Admin SDK, may write to it.

   SETUP (once):
     1. Firebase console → Extensions → install "Trigger Email from
        Firestore" (firebase/firestore-send-email).
     2. Email documents collection:  mail
     3. SMTP connection URI: for Gmail, create an App Password at
        myaccount.google.com/apppasswords and use
          smtps://admin@tipofffantasy.com:APP_PASSWORD@smtp.gmail.com:465
     4. Default FROM: admin@tipofffantasy.com
   Nothing here needs changing afterwards.
═══════════════════════════════════════════════════════════════ */
const FEEDBACK_TO = 'admin@tipofffantasy.com';

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

exports.onFeedbackCreated = onDocumentCreated(
  { document: 'feedback/{reportId}', maxInstances: 5 },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data() || {};
    const ctx = d.ctx || {};

    const KIND = { bug: 'Bug', stuck: 'Stuck', idea: 'Suggestion' };
    const kind = KIND[d.kind] || 'Report';
    //  The subject carries the triage facts, so the inbox is sortable
    //  without opening anything: what, where, which build.
    const subject = '[Tipoff ' + kind + '] ' +
      (ctx.mode || '?') + '/' + (ctx.page || '?') +
      ' · v' + (ctx.build || '?') +
      (ctx.league ? ' · ' + ctx.league : '');

    const facts = [
      ['From', (d.name || 'Unknown') + (d.email ? ' <' + d.email + '>' : ' (no email)')],
      ['Kind', kind],
      ['Build', 'v' + (ctx.build || '?')],
      ['Mode / page', (ctx.mode || '?') + ' / ' + (ctx.page || '?')],
      ['League', ctx.league ? (ctx.league + (ctx.commissioner ? ' (commissioner)' : '')) : '—'],
      ['Tournament', ctx.tournament || '—'],
      ['Draft', typeof ctx.draftPick === 'number'
        ? ('pick ' + ctx.draftPick + (ctx.draftRunning ? ', clock running' : ', clock stopped'))
        : '—'],
      ['Screen', (ctx.screen || '?') + ' @' + (ctx.dpr || 1) + 'x' +
        (ctx.standalone ? ' (Home Screen install)' : '') +
        (ctx.online === false ? ' (OFFLINE)' : '')],
      ['Device', ctx.ua || '—'],
      ['uid', d.uid || '—'],
      ['Report id', event.params.reportId],
    ];

    const text = d.body + '\n\n' + '-'.repeat(52) + '\n' +
      facts.map(function (f) { return f[0] + ': ' + f[1]; }).join('\n');

    const html =
      '<div style="font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#111">' +
        '<p style="white-space:pre-wrap;margin:0 0 18px">' + esc(d.body) + '</p>' +
        '<table style="border-collapse:collapse;font-size:13px;color:#444">' +
          facts.map(function (f) {
            return '<tr><td style="padding:3px 14px 3px 0;color:#888;vertical-align:top">' +
              esc(f[0]) + '</td><td style="padding:3px 0">' + esc(f[1]) + '</td></tr>';
          }).join('') +
        '</table>' +
      '</div>';

    try {
      await db.collection('mail').add({
        to: [FEEDBACK_TO],
        //  So hitting Reply in the mail client answers the person
        //  rather than the app's own address.
        replyTo: d.email || undefined,
        message: { subject: subject, text: text, html: html },
      });
      //  Record that it was queued. If this flag is ever missing on a
      //  report, the handoff failed and the report is still readable
      //  in Firestore — which is why the client writes here first.
      await snap.ref.update({ mailedAt: Date.now() });
    } catch (e) {
      console.error('[Feedback] could not queue mail for', event.params.reportId, e && e.message);
    }
  }
);

// Tipoff Trivia: Stripe webhook → Unlimited entitlements (see stripe.js)
Object.assign(exports, require('./stripe'));
