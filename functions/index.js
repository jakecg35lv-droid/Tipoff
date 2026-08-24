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
//
//  DEPLOY:
//    cd TipoffFantasy/functions && npm install
//    cd .. && firebase deploy --only functions
//
//  ACTIVE TOURNAMENTS:
//    The app writes to Firestore meta/activeTournaments whenever
//    a commissioner selects a tournament. This function reads that
//    doc to know which team names to filter for.
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
// SportsDataIO School field vs our players.js college field.
// Add entries here if a team's name doesn't match exactly.
// Format: 'sportsdata school name (lowercase)': 'players.js college name'
const SCHOOL_MAP = {
  'ole miss':               'Ole Miss',
  'mississippi':            'Ole Miss',
  'university of mississippi': 'Ole Miss',
  'mississippi state':      'Mississippi State',
  'colorado state':         'Colorado State',
  'penn state':             'Penn State',
  'texas a&m':              'Texas A&M',
  'wake forest':            'Wake Forest',
  'vcu':                    'VCU',
  'byu':                    'BYU',
};

// ── MAIN SCHEDULED FUNCTION ────────────────────────────────────
exports.syncTournamentStats = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    try {
      // 1. Read active tournaments from Firestore
      const metaDoc = await db.collection('meta').doc('activeTournaments').get();
      if (!metaDoc.exists) {
        console.log('[Tipoff] No active tournaments in Firestore. Exiting.');
        return null;
      }

      const activeTournaments = metaDoc.data();

      // Build lookup: normalized team name → tournamentId
      const teamToTournId = {};
      Object.entries(activeTournaments).forEach(([tournId, data]) => {
        if (!data.active || !data.teams) return;
        data.teams.forEach(teamName => {
          teamToTournId[teamName.toLowerCase()] = tournId;
        });
      });

      if (Object.keys(teamToTournId).length === 0) {
        console.log('[Tipoff] No active tournament teams found. Exiting.');
        return null;
      }

      console.log('[Tipoff] Active teams:', Object.keys(teamToTournId).join(', '));

      // 2. Build today's date string for SportsDataIO (YYYY-MMM-DD)
      const now    = new Date();
      const months = ['JAN','FEB','MAR','APR','MAY','JUN',
                      'JUL','AUG','SEP','OCT','NOV','DEC'];
      const dateStr = `${now.getFullYear()}-${months[now.getMonth()]}-${String(now.getDate()).padStart(2,'0')}`;

      // 3. Fetch live in-progress stats
      let liveStats = [];
      try {
        const res = await fetch(`${STATS}/LivePlayerGameStats?key=${API_KEY}`);
        if (res.ok) {
          liveStats = await res.json();
          console.log(`[Tipoff] Live stats: ${liveStats.length} player rows`);
        } else {
          console.warn('[Tipoff] Live stats HTTP', res.status);
        }
      } catch (e) {
        console.warn('[Tipoff] Live stats fetch failed:', e.message);
      }

      // 4. Fetch final stats for today
      let finalStats = [];
      try {
        const res = await fetch(`${STATS}/PlayerGameStatsByDate/${dateStr}?key=${API_KEY}`);
        if (res.ok) {
          finalStats = await res.json();
          console.log(`[Tipoff] Final stats for ${dateStr}: ${finalStats.length} player rows`);
        } else {
          console.warn('[Tipoff] Final stats HTTP', res.status);
        }
      } catch (e) {
        console.warn('[Tipoff] Final stats fetch failed:', e.message);
      }

      // 5. Write live stats (overwrites live field, never touches totals)
      const liveFiltered = filterByActiveTeams(liveStats, teamToTournId);
      if (liveFiltered.length > 0) {
        await writeLiveStats(liveFiltered);
      }

      // 6. Write final/committed stats (increments totals, clears live)
      const completedStats = finalStats.filter(s => s.IsClosed === true);
      const completedFiltered = filterByActiveTeams(completedStats, teamToTournId);
      if (completedFiltered.length > 0) {
        await writeCompletedStats(completedFiltered);
      }

    } catch (err) {
      console.error('[Tipoff] syncTournamentStats error:', err);
    }
    return null;
  });

// ── Filter player stats rows to only active tournament teams ───
function filterByActiveTeams(stats, teamToTournId) {
  const results = [];
  for (const stat of stats) {
    const tournId = resolveTeam(stat, teamToTournId);
    if (tournId) results.push({ ...stat, _tournId: tournId });
  }
  return results;
}

// ── Match a stat row's school to a known tournament team ───────
function resolveTeam(stat, teamToTournId) {
  // SportsDataIO may use School, TeamName, or Team (abbrev)
  const raw = (stat.School || stat.TeamName || '').toLowerCase().trim();

  // Direct match
  if (teamToTournId[raw]) return teamToTournId[raw];

  // Override map
  const mapped = SCHOOL_MAP[raw];
  if (mapped && teamToTournId[mapped.toLowerCase()]) {
    return teamToTournId[mapped.toLowerCase()];
  }

  // Partial match: does any active team name appear in the school string?
  for (const [team, tournId] of Object.entries(teamToTournId)) {
    if (raw.includes(team) || team.includes(raw)) return tournId;
  }

  return null;
}

// ── Resolve canonical college name from stat row ───────────────
function resolveCollegeName(stat, teamToTournId) {
  const raw = (stat.School || stat.TeamName || '').toLowerCase().trim();
  const mapped = SCHOOL_MAP[raw];
  if (mapped) return mapped;
  // Return title-cased match from active team list
  for (const team of Object.keys(teamToTournId)) {
    if (raw.includes(team) || team.includes(raw)) {
      // Return the original-case team name from teamToTournId keys
      // (keys are lowercase, find original from activeTournaments — just title-case it)
      return team.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }
  return stat.School || stat.TeamName || '';
}

// ── Write live (in-progress) stats ────────────────────────────
async function writeLiveStats(players) {
  // Group by tournament
  const byTourn = groupByTournament(players);

  for (const [tournId, rows] of Object.entries(byTourn)) {
    const tournRef = db.collection('tournamentStats').doc(tournId);
    const batch    = db.batch();

    for (const p of rows) {
      if (!p.PlayerID) continue;
      const pRef = tournRef.collection('players').doc(String(p.PlayerID));
      batch.set(pRef, {
        name:        p.Name || '',
        college:     p.School || p.TeamName || '',
        sportsDataId: p.PlayerID,
        live: {
          pts:    p.Points       || 0,
          reb:    p.Rebounds     || p.TotalRebounds || 0,
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

  for (const [tournId, rows] of Object.entries(byTourn)) {
    const tournRef = db.collection('tournamentStats').doc(tournId);

    // Find unique game IDs in this batch
    const gameIds = [...new Set(rows.map(p => String(p.GameID)).filter(Boolean))];

    // Check which games are already committed (avoid double-counting)
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
        name:        p.Name || '',
        college:     p.School || p.TeamName || '',
        sportsDataId: p.PlayerID,
        totals: {
          pts:         admin.firestore.FieldValue.increment(p.Points       || 0),
          reb:         admin.firestore.FieldValue.increment(p.Rebounds     || p.TotalRebounds || 0),
          ast:         admin.firestore.FieldValue.increment(p.Assists      || 0),
          stl:         admin.firestore.FieldValue.increment(p.Steals       || 0),
          blk:         admin.firestore.FieldValue.increment(p.BlockedShots || 0),
          gamesPlayed: admin.firestore.FieldValue.increment(1),
        },
        live: admin.firestore.FieldValue.delete(), // clear live snapshot
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    // Mark new games as committed
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
}

// ── Group an array of enriched stat rows by _tournId ──────────
function groupByTournament(players) {
  return players.reduce((acc, p) => {
    const t = p._tournId;
    if (!acc[t]) acc[t] = [];
    acc[t].push(p);
    return acc;
  }, {});
}
