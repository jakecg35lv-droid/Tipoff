/*  Profile page: account-level, mobile-first.

    What it was: the current league's settings header. League Rank,
    Proj. FPTS and Drafted sat at the top unlabelled, but all three
    are scoped to whichever league you are standing in — so they
    read 0 / 0 / #1 on any freshly created league and looked like a
    career record that had never been earned.                      */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const page = html.slice(html.indexOf('id="profilePage"'), html.indexOf('id="newsPage"'));
const render = app.slice(app.indexOf('const careerEl'), app.indexOf('// ── DRAFT ──'));

// ── Account-level content exists ─────────────────────────
['profileCareer', 'profileLeagues', 'profileLeagueCount'].forEach(function (id) {
  ok(id + ' is in the markup', page.indexOf('id="' + id + '"') >= 0);
});
ok('career totals come from the account list', /accountLeagues\(\)/.test(render));
//  accountLeagues() is users/{uid}.leagues — identical on every
//  device. Anything read off `state` would be per-league again.
ok('career does not read league state',
  !/careerEl[\s\S]{0,900}state\.(drafted|managers)/.test(render));
ok('it splits season from tournament', /kind === 'season'/.test(render));
ok('member-since comes from the auth record, not invented',
  /metadata\.creationTime/.test(render) && /if \(ct\)/.test(render));

// ── League-scoped stats are labelled as such ─────────────
ok('the league section names the league', page.indexOf('profileThisLeagueName') >= 0);
ok('it is filled with the real league name', /tlName\.textContent = state\.leagueName/.test(render));
//  With no league open those numbers are meaningless, so the whole
//  section goes rather than showing zeros.
ok('the section hides when no league is open',
  /tlSec\.style\.display = state\.leagueId \? '' : 'none'/.test(render));
ok('stats grid moved inside that section',
  page.indexOf('profileThisLeagueSec') < page.indexOf('id="profileStats"'));

// ── League list is navigable and honest ──────────────────
ok('every league is listed', /leagues\.slice\(\)\.sort\(_leagueOrder\)/.test(render));
ok('season leagues open the season module',
  /TipoffSeason && window\.TipoffSeason\.open\(code\)/.test(render));
ok('tournament leagues open the tournament path', /_loadAndEnterLeague\(code\)/.test(render));
//  Tapping the league you are already in should do nothing rather
//  than reload you into the same place.
ok('the current league is marked and inert',
  /is-here/.test(render) && /classList\.contains\('is-here'\)\) return/.test(render));
ok('an empty account says so', /No leagues yet/.test(render));
//  League names are user input rendered into innerHTML.
ok('league names are escaped', /esc\(l\.name \|\| 'League'\)/.test(render));
ok('codes are escaped', /esc\(code\)/.test(render));

// ── Mobile first ─────────────────────────────────────────
//  The phone layout is the base rule and desktop is the override,
//  not the other way round.
function rule(sel) {
  const m = css.match(new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
}
const career = rule('.pf-career');
ok('career is 2-up by default', /repeat\(2, minmax\(0, 1fr\)\)/.test(career), career.trim());
const wide = css.slice(css.indexOf('@media (min-width: 720px)', css.indexOf('.pf-career')));
ok('desktop widens it with a min-width query', /repeat\(4, minmax\(0, 1fr\)\)/.test(wide.slice(0, 300)));
ok('no max-width query drives the profile',
  !/@media \(max-width[^}]*\)\s*\{[^}]*\.pf-/.test(css));

//  Tap targets and overflow — the two things that break first.
ok('league rows clear 44px', /min-height:\s*5[0-9]px|min-height:\s*4[4-9]px/.test(rule('.pf-league')));
ok('tiles can shrink', /min-width:\s*0/.test(rule('.pf-tile')));
ok('a date in a tile cannot overflow',
  /text-overflow:\s*ellipsis/.test(rule('.pf-tile b')));
ok('long league names truncate', /text-overflow:\s*ellipsis/.test(rule('.pf-lg-main b')));
ok('the name column can shrink', /min-width:\s*0/.test(rule('.pf-lg-main')));

// ── Styles exist for everything rendered ─────────────────
['pf-sec', 'pf-sec-h', 'pf-career', 'pf-tile', 'pf-leagues', 'pf-league',
 'pf-lg-main', 'pf-lg-kind', 'pf-lg-here', 'pf-empty'].forEach(function (c) {
  ok('.' + c + ' is styled', css.indexOf('.' + c) >= 0);
});

// ── Shipped ──────────────────────────────────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build));
ok('no stale ?v= in index.html',
  (html.match(/\?v=(\d+)/g) || []).every(function (v) { return v === '?v=' + build; }));

console.log('\n' + pass + '/' + (pass + fail) + ' profile checks pass');
process.exit(fail ? 1 : 0);
