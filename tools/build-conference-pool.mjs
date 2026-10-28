#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
//  TIPOFF FANTASY — Conference player pool builder
//
//  Builds data/conference-players.js: every rostered player at every
//  school in the chosen conferences, with last season's per-game
//  averages. The Regular Season mode (src/season/season.js) loads it
//  automatically and uses it instead of the 20-school demo pool.
//
//  RUN (from the TipoffFantasyLab folder, Node 18 or newer):
//    node tools/build-conference-pool.mjs                 major 5 conferences
//    node tools/build-conference-pool.mjs --conf=all      every D-I conference
//    node tools/build-conference-pool.mjs --conf="Big Ten,ACC,A-10"
//    node tools/build-conference-pool.mjs --top=13 --season=2026
//
//  --season is the ESPN season for the averages: 2026 = the 2025-26
//  season (last season). Rosters and conference membership use
//  --rosterSeason (default season+1, i.e. 2026-27). Freshmen and transfers without a line get
//  hasStats:false and the app gives them a modest prior.
//  --top keeps each school's N players with the most minutes.
//
//  Uses ESPN's public endpoints, the same ones functions/index.js
//  (espnRosters) uses. Nothing is written anywhere but the output file.
//  Majors take ~3–5 minutes; every conference takes ~20–30.
// ══════════════════════════════════════════════════════════════
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball';

// ESPN conference group ids (men's D-I).
const CONFERENCES = {
  'ACC': 2, 'Big East': 4, 'Big Ten': 7, 'Big 12': 8, 'SEC': 23,
  'A-10': 3, 'American': 62, 'Mountain West': 44, 'WCC': 29, 'MVC': 18,
  'America East': 1, 'ASUN': 46, 'Big Sky': 5, 'Big South': 6, 'Big West': 9, 'CAA': 10,
  'C-USA': 11, 'Horizon': 45, 'Ivy': 12, 'MAAC': 13, 'MAC': 14, 'MEAC': 16, 'NEC': 19,
  'OVC': 20, 'Patriot': 22, 'SoCon': 24, 'Southland': 25, 'SWAC': 26, 'Summit': 49,
  'Sun Belt': 27, 'WAC': 30
};
const MAJORS = ['ACC', 'Big East', 'Big Ten', 'Big 12', 'SEC'];

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true];
}));
const season = String(args.season || '2026');
const top = parseInt(args.top || '13', 10);
const confArg = String(args.conf || 'majors');
const wanted = confArg === 'majors' ? MAJORS
  : confArg === 'all' ? Object.keys(CONFERENCES)
  : confArg.split(',').map(s => s.trim()).filter(Boolean);

const unknown = wanted.filter(c => !(c in CONFERENCES));
if (unknown.length) {
  console.error('Unknown conference(s): ' + unknown.join(', '));
  console.error('Known: ' + Object.keys(CONFERENCES).join(', '));
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
let calls = 0;
async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      calls++;
      const res = await fetch(url, { headers: { 'accept': 'application/json' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw new Error(url + ' → ' + e.message);
      await sleep(600 * (i + 1));
    }
  }
}

// The site API's ?groups= filter is ignored (it returns every D-I team),
// so membership comes from the core API's group listing for this season.
const ROSTER_SEASON = String(args.rosterSeason || (Number(season) + 1));
async function conferenceTeams(groupId) {
  const json = await getJSON(`${CORE}/seasons/${ROSTER_SEASON}/types/2/groups/${groupId}/teams?limit=50`);
  return (json?.items || []).map(i => ({ id: (i.$ref.match(/teams\/(\d+)/) || [])[1] })).filter(t => t.id);
}

async function averages(athleteId) {
  const out = { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, minutes: 0, games: 0, hasStats: false };
  const map = { avgPoints: 'points', avgRebounds: 'rebounds', avgAssists: 'assists', avgSteals: 'steals', avgBlocks: 'blocks', avgMinutes: 'minutes', gamesPlayed: 'games' };
  try {
    const json = await getJSON(`${CORE}/seasons/${season}/types/2/athletes/${athleteId}/statistics`, 2);
    (json?.splits?.categories || []).forEach(c => (c.stats || []).forEach(s => {
      const k = map[s.name];
      if (k && typeof s.value === 'number') { out[k] = Math.round(s.value * 10) / 10; out.hasStats = true; }
    }));
  } catch (e) { /* no line: freshman / transfer from a non-D-I school */ }
  return out;
}

// ESPN roster injury → app status: OUT, GTD (day-to-day / questionable), SEASON.
function injuryFields(a) {
  const i = (a.injuries || [])[0];
  if (!i) return {};
  const st = String(i.status || i.type?.description || '').toLowerCase();
  const status = /season/.test(st) ? 'SEASON' : /out/.test(st) ? 'OUT' : 'GTD';
  const note = i.details?.type || i.type?.abbreviation || i.shortComment || 'Undisclosed';
  return { injury: status, injuryNote: String(note).slice(0, 40) };
}

async function teamPlayers(team, conference) {
  const json = await getJSON(`${SITE}/teams/${team.id}/roster`);
  const t = json?.team || {};
  team.school = t.location || t.shortDisplayName || t.displayName || team.id;
  team.abbr = t.abbreviation || '';
  team.color = t.color ? '#' + t.color : null;
  const athletes = json?.athletes || [];
  const players = [];
  for (let i = 0; i < athletes.length; i += 5) {
    const slice = athletes.slice(i, i + 5);
    const stats = await Promise.all(slice.map(a => averages(a.id)));
    slice.forEach((a, j) => {
      const s = stats[j];
      // ESPN uses G/F/C and sometimes PG/SG/SF/PF: map to the app's G/F/C.
      const raw = ((a.position || {}).abbreviation || 'G').toUpperCase();
      const pos = raw === 'C' ? 'C' : raw.includes('F') ? 'F' : raw.includes('C') ? 'C' : 'G';
      players.push({
        id: 'e' + a.id, espnId: String(a.id), espnTeam: String(team.id),
        name: a.fullName || a.displayName,
        college: team.school, conference,
        position: pos,
        cls: (a.experience || {}).abbreviation || '',
        jersey: a.jersey || '', height: a.displayHeight || '',
        hasStats: s.hasStats, minutes: s.minutes, games: s.games,
        ...injuryFields(a),
        stats: { points: s.points, rebounds: s.rebounds, assists: s.assists, steals: s.steals, blocks: s.blocks }
      });
    });
    await sleep(120);
  }
  players.sort((a, b) => (b.minutes - a.minutes) || (b.stats.points - a.stats.points));
  return { total: athletes.length, kept: top > 0 ? players.slice(0, top) : players };
}

async function main() {
  const started = Date.now();
  console.log(`Building pool: ${wanted.join(', ')} · averages from season ${season} · top ${top} per school\n`);
  const confs = {}, all = [], problems = [], teamsOut = {};
  for (const conf of wanted) {
    let teams = [];
    try { teams = await conferenceTeams(CONFERENCES[conf]); }
    catch (e) { problems.push(`${conf}: ${e.message}`); continue; }
    if (!teams.length) { problems.push(`${conf}: ESPN returned no teams`); continue; }
    console.log(`${conf}: ${teams.length} schools`);
    confs[conf] = { espnGroup: CONFERENCES[conf], schools: [] };
    for (const t of teams) {
      try {
        const r = await teamPlayers(t, conf);
        all.push(...r.kept);
        confs[conf].schools.push(t.school);
        teamsOut[t.id] = { school: t.school, abbr: t.abbr, color: t.color, conf };
        const withStats = r.kept.filter(p => p.hasStats).length;
        console.log(`  ${t.school.padEnd(22)} ${String(r.kept.length).padStart(2)} of ${r.total} kept, ${withStats} with last-season stats`);
      } catch (e) {
        problems.push(`${t.school}: ${e.message}`);
        console.log(`  ${t.school.padEnd(22)} FAILED (${e.message})`);
      }
    }
  }
  if (!all.length) {
    console.error('\nNo players fetched. Nothing written.');
    problems.forEach(p => console.error(' - ' + p));
    process.exit(1);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.resolve(here, '..', 'data', 'conference-players.js');
  const header =
`// ══════════════════════════════════════════════════════════
//  TIPOFF FANTASY — Conference player pool (GENERATED)
//  Do not hand-edit. Rebuild with:
//    node tools/build-conference-pool.mjs --conf=${confArg} --top=${top} --season=${season}
//  Generated: ${new Date().toISOString().slice(0, 10)}  ·  ${all.length} players  ·  ${Object.values(confs).reduce((n, c) => n + c.schools.length, 0)} schools
//  Averages: ESPN season ${season} (last season). hasStats:false = no prior D-I line.
// ══════════════════════════════════════════════════════════
`;
  const body = 'window.TIPOFF_CONF_POOL = ' + JSON.stringify({
    generated: new Date().toISOString(), season, top, conferences: confs, teams: teamsOut, players: all
  }) + ';\n';
  await writeFile(outPath, header + body, 'utf8');
  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`\nWrote ${outPath}`);
  console.log(`${all.length} players from ${Object.keys(confs).length} conferences in ${secs}s (${calls} requests)`);
  if (problems.length) { console.log('\nProblems:'); problems.forEach(p => console.log(' - ' + p)); }
  console.log('\nReload the app (Ctrl+Shift+R). New season leagues will draft from this pool.');
}

main().catch(e => { console.error(e); process.exit(1); });
