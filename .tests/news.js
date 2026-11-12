/*  News renders in both modes from ONE implementation.

    The ask was to "duplicate" the news into season leagues. Copying
    it would have meant two school-alias indexes, two span-blanking
    matchers and two tier rules — and the matcher is the part that
    already had a real bug (Arizona matching "Arizona State"). A
    second copy means the next fix lands in only one of them.

    So: app.js keeps the renderer, season.js provides a mount and the
    one thing that genuinely differs — which schools are "yours".   */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const season = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
const scss = fs.readFileSync(path.join(ROOT, 'src/season/season.css'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// ── Exactly one implementation ───────────────────────────
ok('app.js owns the renderer', /function renderNews\(forceRefresh, opts\)/.test(app));
ok('season has no renderer of its own', !/function renderNews/.test(season));
ok('season does not refetch the feed', !/NEWS_API/.test(season));
//  The matcher and the alias index are the fragile parts. Neither
//  may be duplicated.
['newsSchoolNames', 'articleSchools', 'NEWS_SCHOOL_ALIASES', 'displayNewsArticles']
  .forEach(function (fn) {
    ok(fn + ' exists only in app.js', app.indexOf(fn) >= 0 && season.indexOf(fn) === -1);
  });

// ── The renderer is parameterised, not hardcoded ─────────
ok('the container is an argument', /opts\.feed \|\| document\.getElementById\('newsFeed'\)/.test(app));
ok('the school list is an argument', /displayNewsArticles\(articles, feed, teams\)/.test(app));
ok('display accepts an override', /function displayNewsArticles\(articles, feed, teamsOverride\)/.test(app));
//  null is a real value meaning "no school list" (a season league
//  before the draft), and must not fall through to the tournament.
ok('null means untiered, not "use the tournament"',
  /teamsOverride === null \? null : getActiveTeamNames\(\)/.test(app));
ok('the tournament mount still works unchanged',
  /document\.getElementById\('newsFeed'\)/.test(app));

// ── The bridge ───────────────────────────────────────────
ok('app.js exposes TipoffNews', /window\.TipoffNews = \{/.test(app));
ok('the bridge passes the container through', /feed: feedEl/.test(app));
ok('the bridge passes the schools through', /teams: teamNames \|\| null/.test(app));
//  The season page has its own refresh control, so the bridge must
//  not try to wire the tournament page's button.
ok('the bridge does not grab the tournament refresh button', /refreshBtn: null/.test(app));
ok('a failed render cannot break the season page', /catch \(e\) \{ console\.warn\('\[News\] season render'/.test(app));

// ── Shared cache: no double fetch ────────────────────────
ok('both mounts share one cache', /if \(_newsCache && !forceRefresh\)/.test(app));
ok('the cache is filled once', (app.match(/_newsCache = articles/g) || []).length === 1);

// ── Season mount ─────────────────────────────────────────
ok('season has a News nav item', /items\.push\(\['news', 'News'/.test(season));
ok('it is routed', /ui\.page === 'news' \? viewNews\(\)/.test(season));
const vn = season.slice(season.indexOf('function viewNews()'), season.indexOf('function viewAccount()'));
ok('it renders the shared feed container', /id="ssNewsFeed"/.test(vn) && /class="news-feed"/.test(vn));
ok('season reuses the global news styles', /\.news-feed/.test(css));
ok('season.css adds no duplicate news styles', !/\.news-(feed|card|loading|empty)\b/.test(scss));

//  The feed is filled after render, because the node must exist.
ok('the feed is painted after render',
  /ui\.page === 'news'[\s\S]{0,260}window\.TipoffNews\.render\(nf/.test(season));
ok('refresh forces a refetch', /case 'newsrefresh'[\s\S]{0,80}ui\.newsForce = true/.test(season));
ok('the force flag is cleared after use', /ui\.newsForce = false/.test(season));

// ── "Your schools" is the one real difference ────────────
const mns = season.slice(season.indexOf('function myNewsSchools()'), season.indexOf('function viewNews()'));
ok('season derives schools from the roster', /u\.roster/.test(mns) && /p\.college/.test(mns));
ok('they are lowercased to match the renderer', /toLowerCase\(\)/.test(mns));
ok('duplicates are removed', /seen\[k\]/.test(mns));
//  An empty array would tier every article as "not yours"; null
//  renders one honest untiered feed instead.
ok('an undrafted roster returns null, not []', /return out\.length \? out : null/.test(mns));
ok('the page explains the pre-draft state', /move to the top/.test(vn));

// ── Icons that exist ─────────────────────────────────────
//  ICON.refresh was never defined — using it rendered "undefined".
ok('no undefined ICON is used for refresh', !/ICON\.refresh/.test(season));
ok('the refresh control is styled', /\.ss-news-refresh \{/.test(scss));

// ── Shipped ──────────────────────────────────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build));
ok('no stale ?v= in index.html',
  (html.match(/\?v=(\d+)/g) || []).every(function (v) { return v === '?v=' + build; }));

console.log('\n' + pass + '/' + (pass + fail) + ' news checks pass');
process.exit(fail ? 1 : 0);
