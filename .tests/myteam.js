/*  The Draft tab becomes a team sheet once the draft is done.

    Two complaints from the first live tournament draft: the Draft tab
    stays in the primary nav slot after it is useless, and there is
    nowhere to see how your own players actually performed — the Teams
    page shows totals for everybody, which answers who is winning, not
    how your guys played.

    The thing most worth protecting here is the distinction this page
    exists to show. `p.stats` is tournament-EARNED and `p.seasonAvg`
    is last season's RATE; they were the same field until tonight, and
    that is what printed 166 fantasy points before a ball was tipped.
    If a future edit sums the rate into the total, this page becomes
    the bug it was built to expose.                                  */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
const A = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n)) : (fail++, console.log('FAIL  ' + n + (d ? '  -> ' + d : ''))); };
ok('stripper works', !/the bug it was built to expose/.test(A));

// ══ Markup ═══════════════════════════════════════════════
ok('the My Team tab button exists', /id="ditMyTeamBtn"/.test(html));
ok('it is hidden until the draft ends', /id="ditMyTeamBtn"[^>]*style="display:none;"/.test(html));
ok('the pane exists', /id="myTeamTab"/.test(html) && /id="myTeamBody"/.test(html));
ok('the Draft Room pane is NOT removed', /id="draftRoomTab"/.test(html),
  'people go back to read the pick history');
ok('the player pool survives too', /data-tab="pool"/.test(html));

// ══ Mode switch ══════════════════════════════════════════
ok('syncDraftTabMode exists', /function syncDraftTabMode\(\)/.test(A));
ok('it keys off the draft being complete', /const done = isDraftComplete\(\);/.test(A));
ok('it relabels the nav item', /nav-btn\[data-page="players"\]/.test(A));
ok('the label changes to My Team', /done \? ' My Team ' : ' Draft '/.test(A),
  'leaving it reading Draft after the draft is the exact complaint');
ok('it lands on My Team only once', /syncDraftTabMode\._landed/.test(A),
  'flipping the pane under somebody who chose Draft Room is a new bug');
ok('it is called on navigation', /try \{ syncDraftTabMode\(\); \}/.test(A));
ok('the tab switcher knows the third pane', /tab === 'myteam'/.test(A));

// ══ The earned/rate distinction ══════════════════════════
const fn = A.slice(A.indexOf('function _myTeamRow'), A.indexOf('function renderMyTeam'));
ok('found the row renderer', fn.length > 300);
ok('the stat line is tournament-EARNED', /const st = p\.stats \|\| \{\};/.test(fn));
ok('the rate is read separately', /const avg = p\.seasonAvg \|\| \{\};/.test(fn));
ok('the big number is earned', /const earned = calcFPTS\(p\);/.test(fn));
ok('the small number is the rate', /seasonFPTS\(p\)/.test(fn));
ok('the rate is labelled as an average', /avg<\/span>/.test(fn),
  'an unlabelled second number is how the original confusion started');

const tot = A.slice(A.indexOf('function renderMyTeam'), A.indexOf('function renderMyTeam') + 2200);
ok('the team total sums EARNED points only', /sum \+ calcFPTS\(x\.p\)/.test(tot));
ok('and never sums the rate', !/sum \+ seasonFPTS/.test(tot),
  'this is the 166.2 bug, rebuilt');

// ══ Ordering and states ══════════════════════════════════
ok('roster is in draft order', /\(a\.d\.pickNumber \|\| 0\) - \(b\.d\.pickNumber \|\| 0\)/.test(tot),
  'your first-round pick should be the first name');
ok('only your own players', /x\.d\.manager === me/.test(tot));
ok('a missing player is dropped, not rendered blank', /\.filter\(function \(x\) \{ return x\.p; \}\)/.test(tot));
ok('an empty roster says so', /No players yet/.test(tot));
ok('signed-out is handled', /Sign in to see your team/.test(tot));
ok('live players are flagged', /mt-live/.test(fn));
ok('"yet to play" is distinguished from "no games"',
  /Yet to play/.test(fn) && /No games yet/.test(fn),
  'a zero before tip-off and a zero after a DNP are different facts');
ok('names are escaped', /esc\(p\.name\)/.test(fn));

// ══ Phone ════════════════════════════════════════════════
ok('the row has styles', /\.mt-row \{/.test(css));
ok('long names truncate rather than shove the columns',
  /\.mt-name \{[^}]*text-overflow: ellipsis/.test(css));
ok('numbers are tabular', /\.mt-stat \{[^}]*tabular-nums/.test(css));
ok('it reflows on a phone', /@media \(max-width: 560px\)[\s\S]{0,400}\.mt-row \{ grid-template-columns/.test(css));
ok('the column header is hidden there', /@media \(max-width: 560px\)[\s\S]{0,200}\.mt-colhead \{ display: none/.test(css));

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for it', [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' my team checks pass');
process.exit(fail ? 1 : 0);
