/*  An expired draft clock must always resolve.

    REPORTED: "when time runs out and it autopicks, it does not move
    on to the next person... maybe it's just really laggy."

    Three compounding causes, none of them lag:

    1. Only the seat-holder or the HOST could make an expired pick.
       If the host's own device was asleep, nothing covered and the
       draft sat on 0:00 indefinitely.

    2. setInterval is clamped to ~1s in a hidden tab, throttled to
       ~1/min after a few minutes, and stopped outright on a locked
       phone. So the device that most needs to fire the autopick —
       the one belonging to the manager who walked away — is the
       least able to.

    3. The clock rendered a frozen 0:00 while waiting, which is
       indistinguishable from a hung app.                          */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const season = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const scss = fs.readFileSync(path.join(ROOT, 'src/season/season.css'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const tick = season.slice(season.indexOf('function draftTick'), season.indexOf('function afterPick'));

// ── 1. Somebody always covers ────────────────────────────
ok('the seat-holder may pick for itself', /var mineToPick = t\.isUser/.test(tick));
ok('the host covers an absent human', /hostCovers = isHost\(\)[\s\S]{0,120}HOST_TAKEOVER_MS/.test(tick));
ok('a last-resort takeover exists', /anyCovers/.test(tick) && /ANY_TAKEOVER_MS/.test(season));
ok('it is part of the authority rule',
  /mayAct = !mp \|\| mineToPick \|\| hostCovers \|\| anyCovers/.test(tick));

//  Run the real windows. A sleeping host must not be able to stall
//  the draft forever.
const HOST = parseInt((season.match(/HOST_TAKEOVER_MS = (\d+)/) || [])[1], 10);
const ANY = parseInt((season.match(/ANY_TAKEOVER_MS = (\d+)/) || [])[1], 10);
const STAG = parseInt((season.match(/ANY_TAKEOVER_STAGGER_MS = (\d+)/) || [])[1], 10);
ok('host window is read', HOST > 0, String(HOST));
ok('any-client window is longer than the host window', ANY > HOST, ANY + ' vs ' + HOST);
//  Staggered so clients fire one at a time, not all at once.
ok('clients are staggered', STAG > 0, String(STAG));
ok('the stagger separates seats by more than a tick',
  STAG > 250, STAG + 'ms vs 250ms tick');
//  A 12-team league's last seat must still act in a sane time.
ok('even the last seat covers within 2 minutes',
  ANY + 11 * STAG < 120000, (ANY + 11 * STAG) + 'ms');

// ── 2. A throttled tab catches up ────────────────────────
ok('a returning tab fires a tick immediately',
  /visibilitychange/.test(season) && /draftTick\(\)/.test(season));
ok('focus also kicks it', /addEventListener\('focus', kick\)/.test(season));
ok('a restored page kicks it', /addEventListener\('pageshow', kick\)/.test(season));
//  open() runs many times per session; the listeners must not stack.
ok('the listeners are wired once', /open\._visWired = true/.test(season));
ok('a hidden tab does not tick on the way out',
  /visibilityState === 'hidden'\) return/.test(season));

// ── 3. The wait is visible, not a frozen clock ───────────
const paint = season.slice(season.indexOf('function paintClock'), season.indexOf('function paintClock') + 1200);
ok('a stalled clock says what it is doing', /stalled \? 'Autopicking'/.test(paint));
ok('it only applies to someone else\'s expired clock',
  /left <= 0 && !team\(onClock\(\)\)\.isUser/.test(paint));
ok('the waiting state is styled', /\.ss-clock-wait \{/.test(scss));

// ── Covering for a human honours their queue ─────────────
//  Autopicking a human's seat with botChoose() throws away a queue
//  they deliberately set. Their own device would have used it.
ok('a covered human gets their queue', /oq \|\| botChoose\(t\.id\)/.test(tick));
ok('it only takes available players', /available\(\)\.some/.test(tick));
ok('the pick is labelled auto, not bot', /seatIsHuman \? 'auto' : 'bot'/.test(tick));

// ── The pick still advances and syncs ────────────────────
const mk = season.slice(season.indexOf('function makePick'), season.indexOf('function botChoose'));
ok('a pick advances the turn', /state\.draft\.pick\+\+/.test(mk));
ok('and is saved', /save\(\);/.test(mk));
ok('afterPick repaints', /function afterPick[\s\S]{0,200}render\(\)/.test(season));

// ── Shipped ──────────────────────────────────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const b = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + b));
ok('no stale ?v=', (html.match(/\?v=(\d+)/g) || []).every(function (v) { return v === '?v=' + b; }));

console.log('\n' + pass + '/' + (pass + fail) + ' draft clock checks pass');
process.exit(fail ? 1 : 0);
