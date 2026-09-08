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

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const fetch     = require('node-fetch');

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
exports.syncTournamentStats = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    await runSync();
    return null;
  });

// ── Manual trigger for testing / backfill ──────────────────────
//  GET https://<region>-<project>.cloudfunctions.net/syncNow
//  Optional query params:
//    ?date=2026-MAR-20   run against a specific past date
//    ?dry=1              resolve + report only, write nothing
exports.syncNow = functions.https.onRequest(async (req, res) => {
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
});

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
    const liveFiltered = filterByActiveTeams(liveStats, teamToTournId, dir, unresolved);
    report.liveMatched = liveFiltered.length;

    const completedStats = finalStats.filter(s => s.IsGameOver === true || s.IsClosed === true);
    report.finalClosed = completedStats.length;
    const completedFiltered = filterByActiveTeams(completedStats, teamToTournId, dir, unresolved);
    report.finalMatched = completedFiltered.length;
    report.unresolvedSample = Array.from(unresolved).slice(0, 25);

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
function filterByActiveTeams(stats, teamToTournId, dir, unresolved) {
  const results = [];
  for (const stat of stats) {
    const school = schoolForStat(stat, dir);
    if (!school) {
      if (unresolved && stat.Team) unresolved.add(`${stat.Team}#${stat.TeamID}`);
      continue;
    }
    const tournId = resolveTeam(school, teamToTournId);
    if (tournId) {
      results.push({ ...stat, _tournId: tournId, _school: canonicalSchool(school, teamToTournId) });
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

  // Guarded substring match — both sides must be substantial.
  // Without the length guard, '' matches every team.
  for (const [team, tournId] of Object.entries(teamToTournId)) {
    if (!team || team.length < 4 || raw.length < 4) continue;
    if (raw === team) return tournId;
    if (raw.includes(team) || team.includes(raw)) return tournId;
  }

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
