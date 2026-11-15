/*  Web push: subscription, delivery, and the two silent killers.

    Push has four moving parts in three runtimes, and almost every
    failure is silent — a denied Firestore write, a VAPID mismatch, a
    missing waitUntil, an endpoint that died in March. The symptom is
    always identical: no notification, no error anyone sees. So these
    checks lean on EXECUTING the logic where possible rather than
    matching source text.                                           */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const season = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const fns = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const cfg = fs.readFileSync(path.join(ROOT, 'firebase-config.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'functions/package.json'), 'utf8'));

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// ══ 1. SERVICE WORKER ════════════════════════════════════
ok('sw has a push listener', /addEventListener\('push'/.test(sw));

//  Without waitUntil the worker can be terminated before
//  showNotification resolves, and the notification never appears.
//  There is no error and nothing to see in any log.
const pushFn = sw.slice(sw.indexOf("addEventListener('push'"), sw.indexOf("addEventListener('notificationclick'"));
ok('push handler wraps the show in waitUntil',
  /event\.waitUntil\(\s*self\.registration\.showNotification/.test(pushFn));

/*  userVisibleOnly is a promise to the browser that every push
    produces a notification. Chrome counts silent pushes and
    eventually revokes the subscription, so no code path in the
    handler may return before showing something. */
ok('push handler has no early return', !/\breturn\b/.test(pushFn), 'an early return means a silent push');
ok('malformed payloads still notify',
  /catch/.test(pushFn) && /d\.title \|\|/.test(pushFn) && /d\.body \|\|/.test(pushFn));

//  Actually run the parse-and-default logic against hostile input.
(function () {
  const body = pushFn.slice(pushFn.indexOf('{') + 1);
  const shown = [];
  const sandbox = {
    event: null,
    self: { registration: { showNotification: (t, o) => { shown.push({ t, o }); return Promise.resolve(); } } }
  };
  //  Rebuild the handler as a callable function over a fake event.
  const src = body.slice(0, body.lastIndexOf('}'));
  let run;
  try {
    run = new Function('event', 'self', src.replace(/event\.waitUntil\(/, 'void ('));
  } catch (e) { ok('push handler is callable in isolation', false, e.message); return; }
  ok('push handler is callable in isolation', true);

  const cases = [
    ['good json', { json: () => ({ title: 'A', body: 'B', urgent: true }) }, 'A'],
    ['json throws, text works', { json: () => { throw new Error('x'); }, text: () => 'plain' }, 'Tipoff Fantasy'],
    ['json and text both throw', { json: () => { throw new Error('x'); }, text: () => { throw new Error('y'); } }, 'Tipoff Fantasy'],
    ['json returns null', { json: () => null }, 'Tipoff Fantasy'],
    ['no data at all', null, 'Tipoff Fantasy'],
  ];
  for (const [label, data, wantTitle] of cases) {
    shown.length = 0;
    let threw = null;
    try { run({ data, waitUntil: () => { } }, sandbox.self); } catch (e) { threw = e; }
    ok('payload case: ' + label + ' does not throw', !threw, threw && threw.message);
    ok('payload case: ' + label + ' shows a notification', shown.length === 1, String(shown.length));
    if (shown.length) ok('payload case: ' + label + ' title', shown[0].t === wantTitle, shown[0].t);
    if (shown.length) ok('payload case: ' + label + ' has a body', !!shown[0].o.body);
  }
  //  urgent must drive requireInteraction, or a time-critical pick
  //  alert auto-dismisses while the phone is in a pocket.
  shown.length = 0;
  run({ data: { json: () => ({ urgent: true }) }, waitUntil: () => { } }, sandbox.self);
  ok('urgent payload sets requireInteraction', shown[0].o.requireInteraction === true);
  shown.length = 0;
  run({ data: { json: () => ({}) }, waitUntil: () => { } }, sandbox.self);
  ok('ordinary payload does not demand interaction', shown[0].o.requireInteraction === false);
})();

//  The click handler computed targetUrl and then opened './'.
ok('notificationclick uses the payload url',
  /clients\.openWindow\(targetUrl\)/.test(sw), 'it was hardcoded to ./');

// ══ 2. CLIENT SUBSCRIPTION ═══════════════════════════════
ok('app exposes TipoffPush', /window\.TipoffPush = \{/.test(app));
for (const m of ['enable', 'disable', 'refresh', 'supported', 'needsInstall']) {
  ok('TipoffPush.' + m + ' is exported', new RegExp('\\b' + m + ':').test(app.slice(app.indexOf('window.TipoffPush = {'))));
}
ok('subscribe asks for userVisibleOnly', /userVisibleOnly: true/.test(app));
ok('subscribe passes the VAPID key', /applicationServerKey: urlBase64ToUint8Array\(vapidPublicKey\(\)\)/.test(app));

/*  A subscription made under a DIFFERENT VAPID key looks perfectly
    valid to getSubscription() and fails to decrypt at the push
    service. Reusing it means every send 403s forever. */
ok('an existing subscription is re-checked against the current key',
  /sub\.options && sub\.options\.applicationServerKey/.test(app) && /sub\.unsubscribe\(\)/.test(app));

//  Exercise the real base64url decoder.
(function () {
  const src = app.slice(app.indexOf('function urlBase64ToUint8Array'));
  const fn = new Function('atob', src.slice(0, src.indexOf('\n}\n') + 3) + '\nreturn urlBase64ToUint8Array;')(
    s => Buffer.from(s, 'base64').toString('binary'));
  //  A real VAPID public key is 65 bytes, base64url, unpadded.
  const key = Buffer.alloc(65, 7); key[0] = 4;
  const b64url = key.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const out = fn(b64url);
  ok('vapid key decodes to 65 bytes', out.length === 65, String(out.length));
  ok('vapid key round-trips byte for byte', Buffer.from(out).equals(key));
})();

//  Endpoint ids must be stable, distinct, and legal Firestore ids.
(function () {
  const src = app.slice(app.indexOf('function endpointId'));
  const fn = new Function(src.slice(0, src.indexOf('\n}\n') + 3) + '\nreturn endpointId;')();
  const a = 'https://fcm.googleapis.com/fcm/send/' + 'a'.repeat(140);
  const b = 'https://fcm.googleapis.com/fcm/send/' + 'a'.repeat(139) + 'b';
  ok('endpoint id is stable', fn(a) === fn(a));
  ok('endpoint id differs on a one-character change', fn(a) !== fn(b), fn(a) + ' vs ' + fn(b));
  ok('endpoint id is a legal firestore id', /^[a-z0-9]{16}$/.test(fn(a)) && fn(a).length < 1500, fn(a));
  ok('endpoint id never contains a slash', !fn(a).includes('/'));
})();

// ── iOS gating ───────────────────────────────────────────
/*  The whole feature is dead on iPhone until the site is installed
    to the Home Screen. Asking for permission first burns the one
    prompt the browser grants and teaches the user it is broken. */
ok('enablePush refuses before install', /if \(iosNeedsInstall\(\)\) return 'needs-install';/.test(app));
const enableFn = app.slice(app.indexOf('async function enablePush'), app.indexOf('async function disablePush'));
ok('the install check precedes the permission prompt',
  enableFn.indexOf("'needs-install'") < enableFn.indexOf('requestPermission'),
  'asking first wastes the only prompt we get');
ok('iPadOS is detected despite reporting as a Mac',
  /Macintosh/.test(app) && /maxTouchPoints/.test(app));
ok('standalone is checked both ways',
  /navigator\.standalone === true/.test(app) && /display-mode: standalone/.test(app));
ok('enable returns a reason, not a bare boolean',
  /return 'denied'/.test(app) && /return 'no-key'/.test(app) && /return 'unsupported'/.test(app));
ok('every reason has user-facing copy', (function () {
  //  app.js has TWO `const msgs` objects — the other is the Firebase
  //  auth error map. Scope to the push one or this check passes on
  //  entirely unrelated copy.
  const scope = app.slice(app.indexOf('async function _turnOnPush'));
  const m = scope.match(/const msgs = \{[\s\S]*?\};/);
  if (!m) return false;
  return ['needs-install', 'denied', 'no-key', 'no-store', 'unsupported', 'error']
    .every(k => m[0].includes("'" + k + "'"));
})());

// ── Lifecycle ────────────────────────────────────────────
ok('subscription is re-asserted on boot',
  /TipoffPush && window\.TipoffPush\.refresh\(\)/.test(app.slice(app.indexOf('onAuthStateChanged'))));
ok('subscription is filed after a fresh sign-in',
  /TipoffPush && window\.TipoffPush\.refresh\(\)/.test(app.slice(app.indexOf('function _afterLoginNav'), app.indexOf('function _afterLoginNav') + 600)));
/*  A subscription left on a shared phone keeps buzzing the previous
    account's picks onto a stranger's lock screen. */
const signOut = app.slice(app.indexOf('function doSignOut'), app.indexOf('function doSignOut') + 900);
ok('sign-out drops the subscription', /TipoffPush && window\.TipoffPush\.disable\(\)/.test(signOut));
ok('it drops it before signOut clears the uid',
  signOut.indexOf('TipoffPush') < signOut.indexOf('_auth.signOut'),
  'after signOut there is no uid to delete under');
//  Storage delete must precede unsubscribe, or a half-failure leaves
//  the server sending to an endpoint nothing will ever prune.
const disableFn = app.slice(app.indexOf('async function disablePush'), app.indexOf('async function refreshPushSubscription'));
ok('stored row is removed before unsubscribing',
  disableFn.indexOf('removePushSubscription') < disableFn.indexOf('sub.unsubscribe'));
ok('refresh is a no-op without permission or opt-in',
  /Notification\.permission !== 'granted'\) return;/.test(app.slice(app.indexOf('async function refreshPushSubscription'))) &&
  /!getNotifPref\(\)\) return;/.test(app.slice(app.indexOf('async function refreshPushSubscription'))));

// ── Storage shape must match what the sender reads ───────
ok('client stores endpoint and both keys',
  /endpoint: json\.endpoint/.test(app) && /p256dh: json\.keys\.p256dh/.test(app) && /auth: json\.keys\.auth/.test(app));
ok('client and sender agree on the collection path',
  /collection\('pushSubs'\)/.test(app) && /collection\('pushSubs'\)/.test(fns));

// ══ 3. SENDER ════════════════════════════════════════════
ok('web-push is a dependency', !!(pkg.dependencies && pkg.dependencies['web-push']));
ok('private key is a secret, not a literal', /defineSecret\('VAPID_PRIVATE_KEY'\)/.test(fns));
ok('no private key is committed', !/BEGIN (EC )?PRIVATE KEY/.test(fns) && !/privateKey\s*[:=]\s*'[A-Za-z0-9_-]{20,}'/.test(fns));

/*  Pruning policy is where this goes wrong in both directions:
    forget 404/410 and dead endpoints cost a failed request per pick
    forever; prune on 403 and the first key rotation silently deletes
    every subscription in the database. */
const sendFn = fns.slice(fns.indexOf('async function sendToUser'), fns.indexOf('async function claimOnce'));
ok('dead endpoints (404/410) are pruned', /code === 404 \|\| code === 410/.test(sendFn) && /doc\.ref\.delete\(\)/.test(sendFn));
ok('403 does NOT prune', (function () {
  const i403 = sendFn.indexOf('code === 403');
  const seg = sendFn.slice(i403, sendFn.indexOf('} else {', i403));
  return i403 > 0 && !/delete\(\)/.test(seg);
})(), 'a VAPID mismatch would wipe every subscription');
ok('403 says what is actually wrong', /does not match/.test(sendFn));
ok('a missing key is reported, not thrown', /VAPID keys not configured/.test(fns));
ok('time-critical pushes get a TTL', /TTL: payload\.ttl/.test(sendFn));
ok('urgency is passed through', /urgency: payload\.urgent \? 'high' : 'normal'/.test(sendFn));

//  Triggers must only fire on a real turn change.
ok('season trigger is on the league document',
  /document: 'seasonLeagues\/\{code\}'/.test(fns));
ok('tournament trigger is on the league document',
  /document: 'leagues\/\{code\}'/.test(fns));
ok('season trigger ignores writes that are not a turn change',
  /Number\(pd\.pick\) === pick/.test(fns));
ok('tournament trigger ignores writes that are not a turn change',
  /Number\(before\.currentPickIndex\) === idx/.test(fns));
ok('season trigger only runs on a live draft', /sd\.status !== 'live'/.test(fns));
/*  The tournament state calls it `rounds`; reading `rosterSize`
    silently yields 0, which disables the completion guard. */
ok('tournament trigger reads the rounds field that exists',
  /Number\(after\.rounds\)/.test(fns) && !/after\.rosterSize/.test(fns));
ok('tournament trigger has no dead draftStarted guard', !/draftStarted/.test(fns));
ok('bot seats are not notified', /if \(!seat \|\| !seat\.uid\) return;/.test(fns));
ok('triggers declare the secret',
  (fns.match(/secrets: \[VAPID_PRIVATE_KEY\]/g) || []).length >= 3);
ok('triggers are instance-capped', (fns.match(/maxInstances: 10/g) || []).length >= 2);

/*  At-least-once delivery means one pick can notify twice. create()
    fails when the doc exists, which makes the claim atomic — a plain
    get-then-set would let two concurrent deliveries both pass. */
const claimFn = fns.slice(fns.indexOf('async function claimOnce'), fns.indexOf('const APP_URL'));
ok('dedupe uses create(), not set()', /ref\.create\(/.test(claimFn) && !/ref\.set\(/.test(claimFn));
ok('dedupe key includes league and pick',
  /'season:' \+ code \+ ':' \+ pick/.test(fns) && /'tourn:' \+ code \+ ':' \+ idx/.test(fns));
ok('an unexpected claim error sends anyway rather than dropping',
  /sending anyway/.test(claimFn) && /return true;/.test(claimFn.slice(claimFn.indexOf('sending anyway'))));

//  The snake order in the sender must match buildDraftOrder in app.js,
//  or the wrong manager is told it is their turn. Run both.
(function () {
  const srcS = fns.slice(fns.indexOf('function managerOnClock'));
  const sender = new Function(srcS.slice(0, srcS.indexOf('\n}\n') + 3) + '\nreturn managerOnClock;')();

  //  Reimplement app.js's buildDraftOrder from its own source.
  const srcA = app.slice(app.indexOf('function buildDraftOrder'));
  const bodyA = srcA.slice(0, srcA.indexOf('\n}\n') + 3);
  let build;
  try {
    build = new Function('state', bodyA + '\nreturn buildDraftOrder;');
  } catch (e) { ok('buildDraftOrder is liftable', false, e.message); return; }
  ok('buildDraftOrder is liftable', true);

  const managers = ['Jake', 'Luke', 'Sam', 'Ali', 'Max'];
  const rounds = 7;
  const order = build({ managers: managers, rounds: rounds })();
  ok('reference order has every pick', order.length === managers.length * rounds, String(order.length));
  let mismatch = null;
  for (let i = 0; i < order.length; i++) {
    const got = sender(managers, i);
    if (got !== order[i].manager) { mismatch = i + ': sender=' + got + ' app=' + order[i].manager; break; }
  }
  ok('sender snake order matches app.js exactly', !mismatch, mismatch);

  //  Odd team counts, two managers, and one manager are the cases
  //  that break naive snake arithmetic.
  for (const n of [1, 2, 3, 4, 11]) {
    const ms = Array.from({ length: n }, (_, k) => 'M' + k);
    const ref = build({ managers: ms, rounds: 5 })();
    let bad = null;
    for (let i = 0; i < ref.length; i++) {
      if (sender(ms, i) !== ref[i].manager) { bad = i; break; }
    }
    ok(n + '-manager snake matches', bad === null, 'diverges at pick ' + bad);
  }
  ok('out-of-range index returns nothing', sender(managers, -1) === null && sender([], 0) === null);
})();

// ══ 4. RULES — the silent killer ═════════════════════════
/*  A rule on users/{uid} does NOT cascade to its subcollections.
    Without an explicit pushSubs block every subscribe write is
    denied, savePushSubscription logs where nobody looks, and the
    toggle reports success while nothing was ever stored. */
ok('pushSubs has its own rule', /match \/pushSubs\/\{subId\}/.test(rules));
ok('pushSubs is owner-only',
  /match \/pushSubs\/\{subId\} \{\s*allow read, write: if request\.auth != null && request\.auth\.uid == uid;/.test(rules));
ok('pushSubs rule is nested inside users/{uid}', (function () {
  const u = rules.indexOf('match /users/{uid}');
  const p = rules.indexOf('match /pushSubs/{subId}');
  const next = rules.indexOf('match /leagues/{leagueCode}');
  return u >= 0 && p > u && p < next;
})());
ok('dedupe markers are closed to clients',
  /match \/pushSent\/\{key\} \{\s*allow read, write: if false;/.test(rules));

// ══ 5. UI ════════════════════════════════════════════════
ok('install card exists in markup', /id="pushInstallCard"/.test(html));
ok('install card is hidden by default', /id="pushInstallCard" class="push-install" style="display:none;"/.test(html));
ok('install card names the real steps',
  /Add to Home Screen/.test(html) && /Share/.test(html));
ok('install card is styled', /\.push-install \{/.test(css) && /\.push-install-steps \{/.test(css));
ok('a disabled master toggle looks disabled', /custom-cb-real:disabled/.test(css));
ok('syncNotifUI shows and hides the card',
  /card\.style\.display = needsInstall \? '' : 'none'/.test(app));
ok('syncNotifUI disables the toggle when install is required',
  /toggle\.disabled = !!needsInstall/.test(app));
ok('the toggle subscribes, not just permissions', /await _turnOnPush\(\)/.test(app));
ok('turning it off unsubscribes', /window\.TipoffPush\.disable\(\)/.test(app.slice(app.indexOf("getElementById('notifToggle')"))));

// Season mode shares the same subscription.
ok('season settings calls into TipoffPush', /function ssEnablePush/.test(season));
ok('season master toggle subscribes', /ssEnablePush\(\)/.test(season.slice(season.indexOf("case 'notifmaster'"))));
ok('season toggle is disabled before install', /needsInstall \|\| notifState === 'unsupported'/.test(season));
ok('season renders its own install card', /push-install-steps/.test(season));
ok('season push helper never throws through the toggle',
  /catch \(e\) \{ \/\* push is optional/.test(season));

// ══ 6. CONFIG AND VERSION ════════════════════════════════
ok('client reads a VAPID public key', /window\.TIPOFF_VAPID_PUBLIC_KEY/.test(cfg) && /window\.TIPOFF_VAPID_PUBLIC_KEY/.test(app));
ok('setup instructions name the generate command', /web-push generate-vapid-keys/.test(cfg));
ok('setup instructions name the secret command', /functions:secrets:set VAPID_PRIVATE_KEY/.test(cfg));
ok('empty key degrades instead of breaking', /return 'no-key';/.test(app));

/*  The public key is pasted in TWO places and a mismatch is silent
    (every send 403s). Once both are filled they must be identical. */
(function () {
  const c = (cfg.match(/TIPOFF_VAPID_PUBLIC_KEY = '([^']*)'/) || [])[1];
  const f = (fns.match(/VAPID_PUBLIC_KEY = '([^']*)'/) || [])[1];
  if (!c && !f) { ok('vapid public key not yet configured (both empty)', true); return; }
  ok('vapid public key is set in both places', !!c && !!f, 'client="' + c + '" functions="' + f + '"');
  ok('the two public keys match', c === f, 'a mismatch 403s on every send');
})();

const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const build = (swSrc.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', swSrc.includes("tipoff-v" + build), build);
ok('index.html asks for the current build',
  [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' push checks pass');
process.exit(fail ? 1 : 0);
