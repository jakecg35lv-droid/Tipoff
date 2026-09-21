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

// ── SportsDataIO Config ────────────────────────────────────────
const API_KEY  = 'fcdd1c3aece74a0f8684e3958035ec80';
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

// Games tip roughly noon ET and the latest finish around 1am ET.
// Outside these hours there is nothing to poll for.
const ACTIVE_HOUR_START = 11; // 11am ET
const ACTIVE_HOUR_END   = 2;  // through 2:59am ET (wraps past midnight)

// Ceiling per calendar month. Set deliberately below whatever the
// plan allows so hitting it is a warning, not an outage. Raise this
// once SportsDataIO confirms the real limit.
const MAX_CALLS_PER_MONTH = 800;

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
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}key=${API_KEY}`);

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

    await runSync({ window: win });
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
      const report = await runSync({
        dateOverride: req.query.date || null,
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
      const sRes = await fetch(`${ESPN}/scoreboard?dates=${date}&limit=400`);
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
    const batch    = db.batch();

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

    const batch = db.batch();

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
