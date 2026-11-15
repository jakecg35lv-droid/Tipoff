/*  Leagues showing up in the UI.

    The reported symptom: after adding the app to the iPhone Home
    Screen you had to sign out and sign back in before any league
    appeared. That points at wiring, not data — signing in again is
    the one path that explicitly calls subscribeAccountLeagues().

    These checks replay the real onAuthStateChanged SEQUENCE rather
    than pattern-matching the source, because the bug was entirely
    about ordering: every individual line was correct.            */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const season = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');

/*  Comment-stripped copy, for checks that assert a line is GONE.
    The fix's own comment block quotes the deleted line verbatim to
    explain what went wrong, so scanning raw source found it and
    reported the bug as unfixed. This is the fourth time a test in
    this suite family has matched its own documentation; strip once,
    here, and use appCode for every absence assertion.            */
const appCode = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// ══ 1. The latch is gone ═════════════════════════════════
/*  The exact line that caused it. The second fire — the one
    carrying the restored user — returned before reaching any of
    the wiring. */
ok('the early-return latch is gone',
  !/if \(_authBootFired\) \{ window\._fbUser = user; return; \}/.test(appCode),
  'a late-arriving user is swallowed again');
//  Prove the stripper works, or this check could pass vacuously.
ok('the comment stripper kept the real code',
  /onAuthStateChanged/.test(appCode) && /_wireAuthedUser/.test(appCode));
ok('the comment stripper removed the explanatory block',
  !/the one carrying the restored user/.test(appCode));
ok('wiring is factored out of the boot branch', /function _wireAuthedUser\(uid\)/.test(app));
ok('wiring is keyed on uid so repeats are free', /if \(_authWiredUid === uid\) return;/.test(app));
ok('navigation is still guarded', /_authNavUid/.test(app));
ok('a spurious null cannot navigate mid-session', (function () {
  const i = app.indexOf('// Firebase says no user');
  const seg = app.slice(i, i + 900);
  return /if \(!_authBootFired\) \{/.test(seg);
})(), 'a null re-fire would throw a signed-in user to the landing screen');

// ══ 2. Replay the sequence that broke ════════════════════
/*  Lift the real handler body and run it against fakes. This is the
    only honest way to test an ordering bug.                      */
function buildHarness() {
  const start = app.indexOf('window._auth.onAuthStateChanged(function (user) {');
  const open = app.indexOf('{', app.indexOf('function (user)', start));
  // Walk braces to find the handler's end.
  let d = 0, end = -1;
  for (let i = open; i < app.length; i++) {
    if (app[i] === '{') d++;
    else if (app[i] === '}') { d--; if (d === 0) { end = i; break; } }
  }
  const body = app.slice(open + 1, end);

  const calls = [];
  const env = {
    _authBootFired: false, _authWiredUid: undefined, _authNavUid: undefined,
    landingVisible: false, session: null, lastUid: null,
    state: { leagueId: null, leagueCode: null }
  };
  const fns = {
    getSession: () => env.session,
    setSession: (n, e, u) => { env.session = { name: n, email: e, uid: u }; calls.push('setSession:' + u); },
    clearUserScopedStorage: () => calls.push('clearUserScoped'),
    freshState: () => ({ leagueId: null, leagueCode: null }),
    poolForCurrentTournament: () => [],
    loadState: () => false,
    cameFromExternalLink: () => false,
    lastViewWantsSeason: () => false,
    _subscribeLeague: (c) => calls.push('subLeague:' + c),
    enterLeague: () => calls.push('enterLeague'),
    showSplash: () => { calls.push('showSplash'); env.landingVisible = false; },
    showLanding: () => { calls.push('showLanding'); env.landingVisible = true; },
    subscribeAccountLeagues: () => calls.push('subscribeAccountLeagues'),
    unsubscribeAccountLeagues: () => calls.push('unsubscribeAccountLeagues'),
    _landingIsShowing: () => env.landingVisible,
  };
  const win = { TipoffSeason: { onAuthChanged: (u) => calls.push('seasonAuth:' + u) },
                TipoffPush: { refresh: () => calls.push('pushRefresh') } };

  // _wireAuthedUser, lifted too.
  const wStart = app.indexOf('function _wireAuthedUser(uid) {');
  let wd = 0, wEnd = -1;
  const wOpen = app.indexOf('{', wStart);
  for (let i = wOpen; i < app.length; i++) {
    if (app[i] === '{') wd++;
    else if (app[i] === '}') { wd--; if (wd === 0) { wEnd = i; break; } }
  }
  const wireSrc = app.slice(wStart, wEnd + 1);

  const src = `
    let _authBootFired = env._authBootFired, _authWiredUid = env._authWiredUid, _authNavUid = env._authNavUid;
    let state = env.state;
    const { getSession, setSession, clearUserScopedStorage, freshState, poolForCurrentTournament,
            loadState, cameFromExternalLink, lastViewWantsSeason, _subscribeLeague, enterLeague,
            showSplash, showLanding, subscribeAccountLeagues, unsubscribeAccountLeagues,
            _landingIsShowing } = fns;
    const localStorage = { setItem(){}, getItem(){ return env.lastUid; } };
    ${wireSrc}
    return function fire(user) {
      ${body}
      env._authBootFired = _authBootFired;
      env._authWiredUid = _authWiredUid;
      env._authNavUid = _authNavUid;
    };
  `;
  const fire = new Function('env', 'fns', 'window', 'console', src)(env, fns, win, console);
  return { fire, calls, env };
}

let H;
try { H = buildHarness(); ok('auth handler is liftable and runs', true); }
catch (e) { ok('auth handler is liftable and runs', false, e.message); }

if (H) {
  /*  THE REGRESSION. Firebase reports null first on a cold start
      while it reads its own IndexedDB, then delivers the real user.
      A fresh Home Screen install is the slowest possible cold
      start, which is why it showed up there.                     */
  H.calls.length = 0;
  H.fire(null);                                   // fire 1: nobody
  const afterNull = H.calls.slice();
  H.fire({ uid: 'u1', email: 'jake@example.com', displayName: 'Jake' });  // fire 2: the real user
  const afterUser = H.calls.slice(afterNull.length);

  ok('fire 1 (null) shows the landing screen', afterNull.includes('showLanding'), afterNull.join(','));
  ok('fire 2 attaches the account listener',
    afterUser.includes('subscribeAccountLeagues'),
    'got: ' + afterUser.join(',') + '  <- this was the bug');
  ok('fire 2 wires the season module', afterUser.includes('seasonAuth:u1'), afterUser.join(','));
  ok('fire 2 refreshes the push subscription', afterUser.includes('pushRefresh'), afterUser.join(','));
  ok('fire 2 moves off the landing screen',
    afterUser.includes('showSplash') || afterUser.includes('enterLeague'), afterUser.join(','));
  ok('fire 2 records a session', afterUser.some(c => c.startsWith('setSession:u1')), afterUser.join(','));

  //  A repeat fire for the SAME user must not re-wire or re-navigate.
  H.calls.length = 0;
  H.fire({ uid: 'u1', email: 'jake@example.com', displayName: 'Jake' });
  ok('a repeat fire for the same user is inert', H.calls.length === 0, H.calls.join(','));

  //  A spurious null mid-session must not eject the user. It may
  //  tear the listener down (auth really did drop) but must not
  //  navigate.
  H.calls.length = 0;
  H.fire(null);
  ok('a mid-session null does not navigate',
    !H.calls.includes('showLanding') && !H.calls.includes('showSplash'), H.calls.join(','));

  //  And the user coming back re-attaches.
  H.calls.length = 0;
  H.fire({ uid: 'u1', email: 'jake@example.com', displayName: 'Jake' });
  ok('the user returning re-attaches the listener',
    H.calls.includes('subscribeAccountLeagues'), H.calls.join(','));

  //  Normal warm boot: one fire, with a user. Must still work.
  const W = buildHarness();
  W.fire({ uid: 'u2', email: 'luke@example.com', displayName: 'Luke' });
  ok('a warm boot (single fire, user present) still wires and navigates',
    W.calls.includes('subscribeAccountLeagues') && W.calls.includes('showSplash'), W.calls.join(','));

  //  Genuinely signed out: one null fire, no session.
  const S = buildHarness();
  S.fire(null);
  ok('a genuinely signed-out boot lands on the landing screen',
    S.calls.includes('showLanding') && S.calls.includes('unsubscribeAccountLeagues'), S.calls.join(','));

  //  Account switch must still wipe the previous user's local data.
  const X = buildHarness();
  X.env.lastUid = 'old-uid';
  X.fire({ uid: 'new-uid', email: 'x@example.com', displayName: 'X' });
  ok('a different account still clears local data',
    X.calls.includes('clearUserScoped'), X.calls.join(','));
}

// ══ 3. The listener survives a dropped connection ════════
ok('subscribe retries while auth is still resolving',
  /_accountRetry = setTimeout\(subscribeAccountLeagues, 500\)/.test(app),
  'one early call used to disable the listener permanently');
ok('the retry is bounded', /_accountRetries < 10/.test(app));
ok('sign-out cancels a pending retry',
  /clearTimeout\(_accountRetry\)/.test(app.slice(app.indexOf('function unsubscribeAccountLeagues'))));

/*  iOS suspends a Home Screen app and does not reliably resume its
    sockets. Nothing listened for a resume at all, so a listener
    torn down in the background stopped delivering silently. */
ok('the account listener re-attaches on resume', /function _rewireAccountOnResume/.test(app));
for (const ev of ['visibilitychange', 'focus', 'pageshow']) {
  ok('resume is detected via ' + ev, new RegExp("'" + ev + "', _rewireAccountOnResume").test(app));
}
ok('resume also re-attaches the active league listener',
  /_subscribeLeague\(state\.leagueCode\)/.test(app.slice(app.indexOf('function _rewireAccountOnResume'),
    app.indexOf('function _rewireAccountOnResume') + 900)));
ok('resume does no work in a hidden tab',
  /visibilityState === 'hidden'\) return;/.test(app.slice(app.indexOf('function _rewireAccountOnResume'))));
ok('resume does no work when signed out',
  /!_uid\(\)\) return;/.test(app.slice(app.indexOf('function _rewireAccountOnResume'))));
ok('the resume hook is wired once', /window\._accountResumeWired/.test(app));

// ══ 4. The screen stops lying while it loads ═════════════
/*  "No leagues yet" was printed whenever no card was on screen,
    including before the account document had arrived. A signed-in
    user with leagues was told in plain words they had none — which
    is exactly what this report looked like. */
const emptyFn = app.slice(app.indexOf('function _syncLeagueEmptyState'), app.indexOf('//  The season module paints the other half'));
ok('loading is distinguished from genuinely empty',
  /ACCOUNT_LEAGUES === null\) && !!_uid\(\)/.test(emptyFn));
/*  The season module calls this through window.TipoffLeagues inside
    its own try/catch, so a throw here is swallowed and leaves the
    screen with no message at all — the exact failure this function
    exists to prevent. The state read must not be able to throw. */
ok('the state read cannot throw across the module boundary',
  /typeof ACCOUNT_LEAGUES !== 'undefined'/.test(emptyFn) &&
  /catch \(e\) \{ stillLoading = false; \}/.test(emptyFn));
ok('an unreadable state degrades to the plain message', (function () {
  const src = emptyFn.slice(emptyFn.indexOf('let stillLoading'), emptyFn.indexOf('if (!msg)'));
  // No ACCOUNT_LEAGUES, no _uid in scope at all.
  const r = new Function(src + '\nreturn {stillLoading, text};')();
  return r.stillLoading === false && r.text.includes('No leagues yet');
})());
ok('it says loading, not "no leagues"', /Loading your leagues/.test(emptyFn));
ok('it still says "no leagues" once the account is known',
  /No leagues yet\. Create or join one above\./.test(emptyFn));
ok('the message element is reused, not duplicated',
  (emptyFn.match(/createElement\('p'\)/g) || []).length === 1);
ok('the loading state is styled', /\.no-leagues-loading \{/.test(css));
ok('the pulse respects reduced motion',
  /prefers-reduced-motion[\s\S]{0,120}no-leagues-loading/.test(css));

//  Run the real branch logic for all four states.
(function () {
  //  Lift from the guarded read through to the text choice.
  const src = emptyFn.slice(emptyFn.indexOf('let stillLoading'), emptyFn.indexOf('if (!msg)'));
  const run = new Function('ACCOUNT_LEAGUES', '_uid', src + '\nreturn {stillLoading, text};');
  const cases = [
    ['signed in, account unknown', null, () => 'u1', true, 'Loading'],
    ['signed in, account empty', [], () => 'u1', false, 'No leagues yet'],
    ['signed out, account unknown', null, () => null, false, 'No leagues yet'],
    ['signed in, account has leagues', [{ code: 'A' }], () => 'u1', false, 'No leagues yet'],
  ];
  for (const [label, acct, uid, wantLoading, wantText] of cases) {
    const r = run(acct, uid);
    ok('empty state: ' + label, r.stillLoading === wantLoading && r.text.includes(wantText),
      'loading=' + r.stillLoading + ' text="' + r.text + '"');
  }
})();

// ══ 5. The two renderers still cooperate ═════════════════
ok('the snapshot repaints the tournament list',
  /ACCOUNT_LEAGUES = Array\.isArray\(data\.leagues\)[\s\S]{0,200}renderSavedLeagues\(\)/.test(app));
ok('the snapshot hands the same list to the season module',
  /TipoffSeason\.setAccountLeagues\(ACCOUNT_LEAGUES\)/.test(app));
ok('one function owns the empty message', /window\.TipoffLeagues = \{ syncEmpty: _syncLeagueEmptyState \}/.test(app));
ok('renderSavedLeagues delegates the message', /_syncLeagueEmptyState\(\);/.test(app));
ok('season leagues are not sent down the tournament path',
  /if \(l\.kind === 'season'\) return;/.test(app));
ok('the local cache still covers an account write that has not landed',
  /function _localOnlyLeagues/.test(app) && /ACCOUNT_LEAGUES === null\) return local;/.test(app));
ok('a failed listen is not treated as deletion',
  /not evidence that anything was deleted/.test(app));
ok('season still repaints its splash card from the shared list',
  /function setAccountLeagues\(list\)[\s\S]{0,400}renderSplashCard\(\)/.test(season));

// ══ 6. Version ═══════════════════════════════════════════
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for the current build',
  [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' league-visibility checks pass');
process.exit(fail ? 1 : 0);
