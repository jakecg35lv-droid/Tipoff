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
//  TEAM DIRECTORY  (TeamID / Key → School)
//  Fetched once per cold start and cached for warm invocations.
// ═══════════════════════════════════════════════════════════════
let _teamDir = null;
let _teamDirAt = 0;
const TEAM_DIR_TTL_MS = 6 * 60 * 60 * 1000; // refresh every 6h

async function getTeamDirectory() {
  const fresh = _teamDir && (Date.now() - _teamDirAt) < TEAM_DIR_TTL_MS;
  if (fresh) return _teamDir;

  const res = await fetch(`${SCORES}/teams?key=${API_KEY}`);
  if (!res.ok) throw new Error(`teams endpoint HTTP ${res.status}`);
  const teams = await res.json();

  const byId  = {};
  const byKey = {};
  for (const t of teams) {
    if (!t || !t.School) continue;
    if (t.TeamID != null) byId[String(t.TeamID)] = t.School;
    if (t.Key)            byKey[String(t.Key).toUpperCase()] = t.School;
  }

  _teamDir   = { byId, byKey, count: teams.length };
  _teamDirAt = Date.now();
  console.log(`[Tipoff] Team directory loaded: ${teams.length} teams ` +
              `(${Object.keys(byId).length} by id, ${Object.keys(byKey).length} by key)`);
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
exports.syncTournamentStats = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/New_York',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    await runSync();
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

    const results = {};
    for (const [label, url] of candidates) {
      try {
        const r = await fetch(`${url}?key=${API_KEY}`);
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
    res.status(200).json({ season, team, results });
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
  };

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

    // 2. Team directory (abbreviation → school)
    const dir = await getTeamDirectory();
    report.teamDirectorySize = dir.count;

    // 3. Date string — SportsDataIO accepts 2026-MAR-20 and 2026-03-20
    let dateStr = options.dateOverride;
    if (!dateStr) {
      const now = new Date();
      const months = ['JAN','FEB','MAR','APR','MAY','JUN',
                      'JUL','AUG','SEP','OCT','NOV','DEC'];
      dateStr = `${now.getFullYear()}-${months[now.getMonth()]}-${String(now.getDate()).padStart(2,'0')}`;
    }
    report.date = dateStr;

    // 4. Live in-progress stats
    let liveStats = [];
    try {
      const res = await fetch(`${STATS}/LivePlayerGameStats?key=${API_KEY}`);
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
      const res = await fetch(`${STATS}/PlayerGameStatsByDate/${dateStr}?key=${API_KEY}`);
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
  }

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
