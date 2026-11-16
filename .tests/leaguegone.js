/*  A deleted league must reach everyone else.

    Deleting a league removes its Firestore document. Every other
    manager's onSnapshot then fires with doc.exists === false, and
    BOTH modes did the same thing with it:

        if (!doc.exists) return;

    So nothing happened. They carried on in a league that no longer
    existed, kept writing picks and lineups to a dead document, and
    found out only on a reload when it had silently vanished.

    The risk in fixing it is the opposite failure: evicting somebody
    from a perfectly good league because of an empty CACHED snapshot
    or a code that never existed. Both are checked here.          */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const season = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const A = strip(app), S = strip(season);

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
ok('comment strippers kept the code',
  /_onLeagueDeleted/.test(A) && /onLeagueDeleted/.test(S));

// ══ 1. The silent return is gone, in both modes ══════════
ok('tournament no longer ignores a deleted league',
  !/if \(!doc\.exists\) return;\s*const data = doc\.data\(\);/.test(A));
ok('season no longer ignores a deleted league',
  !/if \(!doc\.exists\) return;\s*var d = doc\.data\(\)/.test(S));
ok('tournament reacts to the deletion', /_onLeagueDeleted\(code\);/.test(A));
ok('season reacts to the deletion', /if \(!fromCache && SYNC\.synced\) onLeagueDeleted\(\);/.test(S));

// ══ 2. It cannot fire on anything but a real deletion ════
/*  Firestore serves a cached snapshot first. An empty cache is not
    evidence that anything was deleted — acting on it would evict a
    manager who simply opened the app offline. */
ok('tournament needs metadata to tell cache from server',
  /onSnapshot\(\{ includeMetadataChanges: true \}, doc =>/.test(A));
ok('tournament ignores a cached empty snapshot',
  /const fromCache = !!\(doc\.metadata && doc\.metadata\.fromCache\);[\s\S]{0,200}?if \(!fromCache/.test(A));
ok('season ignores a cached empty snapshot', /if \(!fromCache && SYNC\.synced\)/.test(S));
/*  And a code that never existed must not look like a deletion. */
ok('season requires having synced at least once', /&& SYNC\.synced\) onLeagueDeleted/.test(S));
/*  A listener left over from a league we already left must not evict
    us from the one we are in now. */
ok('tournament only acts for the league it is in',
  /state && state\.leagueCode === code/.test(A),
  'a stale listener could otherwise evict from a different league');

// ══ 3. Teardown happens before the notice ════════════════
const td = A.slice(A.indexOf('function _onLeagueDeleted'), A.indexOf('function _subscribeLeague'));
ok('the tournament teardown is liftable', td.length > 200);
ok('it fires once per league', /_onLeagueDeleted\._seen === code/.test(td));
ok('it drops the listener first',
  td.indexOf('_leagueUnsubscribe') < td.indexOf('TipoffLeagueGone'));
ok('it stops the draft timer', /clearInterval\(timerInterval\)/.test(td));
ok('it clears the local copy so a reload cannot resurrect it',
  /removeItem\('mmfantasy-league-' \+ id\)/.test(td) &&
  /removeItem\('mmfantasy-code-' \+ code\)/.test(td));
ok('it drops the league from the account list', /forgetLeagueMembership\(code\)/.test(td));
ok('it clears the restore pointer', /TipoffView && window\.TipoffView\.clear\(\)/.test(td));
ok('it resets state before showing anything', /state = freshState\(\);/.test(td));
ok('it lands on the splash afterwards', /TipoffLeagueGone\(name, function \(\) \{ showSplash\(\); \}\)/.test(td));

const ts = S.slice(S.indexOf('function onLeagueDeleted'), S.indexOf('function unsubscribeSeason'));
ok('the season teardown is liftable', ts.length > 200);
ok('it fires once per league', /LEAGUE_GONE === code/.test(ts));
ok('it unsubscribes first', ts.indexOf('unsubscribeSeason()') < ts.indexOf('TipoffLeagueGone'));
ok('it cancels a pending push', /clearTimeout\(SYNC\.timer\)/.test(ts),
  'a queued write would hit a document that no longer exists');
ok('it stops the draft clock', /clearInterval\(open\._tick\)/.test(ts));
ok('it stops the stats poll', /clearInterval\(open\._statsTick\)/.test(ts));
ok('it clears the local copy', /forgetLeagueLocal\(code\)/.test(ts));
ok('it drops the league from the account list', /forgetSeasonLeague\(code\)/.test(ts));
ok('it closes the season view', /close\(\)/.test(ts));
ok('it nulls state before closing', ts.indexOf('state = null;') < ts.indexOf('close()'));

// ══ 4. The notice itself ═════════════════════════════════
const gone = A.slice(A.indexOf('window.TipoffLeagueGone = function'), A.indexOf('window.TipoffLeagues ='));
ok('one shared notice serves both modes', gone.length > 200);
ok('only one can be on screen', /getElementById\('leagueGoneBackdrop'\)\) return;/.test(gone),
  'both modes can detect the same deletion a frame apart');
ok('the league name is escaped', /replace\(\/\[&<>"\]\/g/.test(gone),
  'a league name is user input and goes into innerHTML');
ok('it names the league', /safe \+ /.test(gone));
ok('it says the league ended for everyone', /ended for/.test(gone));
ok('it is honest that this cannot be undone', /cannot be restored/.test(gone));
ok('it reassures about other leagues', /other leagues are unaffected/.test(gone));
ok('it is announced to screen readers', /role="alertdialog"/.test(gone));
ok('the heading is linked for screen readers',
  /aria-labelledby="lgGoneTitle"/.test(gone) && /id="lgGoneTitle"/.test(gone));
ok('it has exactly one way out', (gone.match(/<button/g) || []).length === 1);
/*  A stray tap behind the card is not an acknowledgement that your
    league has ended. */
ok('the backdrop does not dismiss it', !/back\.addEventListener\('click'/.test(gone));
ok('the button takes focus', /focus\(\)/.test(gone));
ok('dismissing runs the caller callback', /onDismiss && onDismiss\(\)/.test(gone));
ok('a failing callback still removes the overlay',
  gone.indexOf('back.remove()') < gone.indexOf('onDismiss && onDismiss()'));

// ══ 5. Styling ═══════════════════════════════════════════
for (const c of ['.lg-gone-backdrop', '.lg-gone', '.lg-gone-icon', '.lg-gone h3', '.lg-gone p']) {
  ok('styled: ' + c, new RegExp('\\' + c.replace(/ /g, '\\s') + '\\s*\\{').test(css));
}
ok('it sits above everything else', /\.lg-gone-backdrop \{[^}]*z-index:\s*(\d{4,})/.test(css));
(function () {
  const z = parseInt((css.match(/\.lg-gone-backdrop \{[^}]*z-index:\s*(\d+)/) || [])[1], 10);
  const others = [...css.matchAll(/z-index:\s*(\d+)/g)].map(m => +m[1]).filter(v => v !== z);
  ok('its z-index beats every other one', z > Math.max(...others),
    z + ' vs max ' + Math.max(...others));
})();
ok('it respects the phone safe area', /\.lg-gone-backdrop \{[^}]*env\(safe-area-inset-bottom\)/.test(css));
ok('it adapts on a small screen', /@media \(max-width: 480px\)[\s\S]{0,160}\.lg-gone/.test(css));

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for the current build',
  [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' league-deleted checks pass');
process.exit(fail ? 1 : 0);
