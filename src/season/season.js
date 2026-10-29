/* ══════════════════════════════════════════════════════════
   TIPOFF FANTASY — Regular Season

   A self-contained season-long mode: commissioner picks roster size
   (8–12), everyone snake-drafts, then each week is a head-to-head
   matchup scored with Sleeper-style LOCK-IN:

     • 5 starting slots: G, G, F, F, UTIL (F accepts F or C; UTIL any)
     • After a starter plays, you may LOCK that game's fantasy score
       into the slot, or PASS and wait for a later game.
     • One locked game per slot per week. A lock is final.
     • A slot that is never locked gets its most recent game
       (a DNP counts as 0). No game at all = 0.
     • Only games played while the player sat in that slot count.
       Bench games never count. You can swap a slot until it locks.

   ISOLATION
     Nothing here reads or writes the tournament state in app.js.
     Storage key: 'tipoff-season-v1' (localStorage). The shape is
     deliberately plain JSON so it can move to Firestore later as a
     single document per league.

   DATA
     Offline lab build: weekly games are SIMULATED from each player's
     real 2025-26 per-game averages (data/players.js). Swap
     generateWeekGames() for a real box-score feed later — nothing
     else needs to change, since everything downstream only reads
     state.games[week][playerId] = [{ day, fpts, line, dnp }].
══════════════════════════════════════════════════════════ */
(function (window, document) {
  'use strict';

  var STORE_KEY = 'tipoff-season-v1';
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var SLOTS = ['G', 'G', 'F', 'F', 'UTIL'];
  var WEIGHTS = { points: 1, rebounds: 1.2, assists: 1.5, steals: 2, blocks: 2 };
  var BOT_NAMES = [
    'Full Court Press', 'Backdoor Cutters', 'Glass Cleaners', 'Mid-Major Mayhem',
    'Bracket Busters', 'Zone Breakers', 'Pick & Pop', 'And-One Army',
    'Buzzer Beaters', 'Paint Protectors', 'Fast Break FC'
  ];

  var state = null;
  var ui = { page: 'home', wiz: null, sheet: false, swapSlot: null, filterPos: '', filterConf: '', search: '', stamp: null, setup: null, toastMsg: '', toastType: '', sel: {}, mview: null };
  var root = null;

  // ── Utilities ───────────────────────────────────────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rngFor(key) { return mulberry32(hashStr(String(state.league.seed) + '|' + key)); }
  function gauss(r) {
    var u = 1 - r(), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function f1(n) { return (Math.round(n * 10) / 10).toFixed(1); }

  /* ══════════════════════════════════════════════════════
     FIRESTORE SYNC
     The module was written for this: one plain-JSON document per
     league. seasonLeagues/{code} holds the shared state; every
     client keeps a local copy in localStorage as a cache and for
     offline reads.

     WHY A REVISION COUNTER
       Every client holds the WHOLE blob, so a naive write is
       last-write-wins and silently clobbers whatever it did not
       know about. `rev` increments on every push; a snapshot older
       than what we already have is ignored, and a snapshot newer
       than ours replaces local state wholesale.

     WHY GAMES ARE EXCLUDED
       state.games grows to roughly 300KB across a full season,
       which crowds Firestore's 1MB document ceiling. It lives in
       seasonLeagues/{code}/weeks/{n} instead — which is also the
       shape the server-side stats job will write.
  ══════════════════════════════════════════════════════ */
  var SYNC = { code: null, unsub: null, rev: 0, applying: false, timer: null };

  function syncDb() { return window._db || null; }
  function seasonDoc(code) {
    var db = syncDb();
    return db ? db.collection('seasonLeagues').doc(String(code).toUpperCase()) : null;
  }
  function myUid() {
    return (window._fbUser && window._fbUser.uid) || null;
  }

  // The blob that travels. Games are stripped; everything else is
  // already plain JSON by design.
  function syncPayload() {
    var copy = JSON.parse(JSON.stringify(state || {}));
    delete copy.games;
    return copy;
  }

  function pushState() {
    if (SYNC.applying) return;                 // echo of a snapshot we just applied
    if (!state || !state.league || !state.league.code) return;
    var ref = seasonDoc(state.league.code);
    if (!ref) return;

    SYNC.rev += 1;
    var payload = {
      rev: SYNC.rev,
      state: syncPayload(),
      updatedAt: Date.now(),
      updatedBy: myUid() || 'anon'
    };
    ref.set(payload, { merge: true })
      .catch(function (e) {
        var code = (e && e.code) || '';
        console.warn('[Season] push failed:', code, e && e.message);
        //  This was silent, which is how a league can look created on
        //  screen while never reaching the database — and then nobody
        //  can join it, with no clue why. Say so once, loudly.
        if (code === 'permission-denied' && !SYNC.warnedDenied) {
          SYNC.warnedDenied = true;
          try {
            notify('This league is not being saved to the server. ' +
                   'Nobody else can join it yet.', 'error');
          } catch (_) { }
        }
      });
  }

  // Writes are debounced: a draft pick touches state several times
  // in a row, and each one does not need its own round trip.
  function schedulePush() {
    if (SYNC.timer) clearTimeout(SYNC.timer);
    SYNC.timer = setTimeout(function () { SYNC.timer = null; pushState(); }, 400);
  }

  function subscribeSeason(code) {
    unsubscribeSeason();
    var ref = seasonDoc(code);
    if (!ref) return;
    SYNC.code = code;
    SYNC.unsub = ref.onSnapshot(function (doc) {
      if (!doc.exists) return;
      var d = doc.data() || {};
      if (typeof d.rev !== 'number' || d.rev <= SYNC.rev) return;   // stale or our own echo
      if (!d.state) return;

      SYNC.rev = d.rev;
      SYNC.applying = true;
      try {
        var games = (state && state.games) || {};   // keep locally cached games
        state = d.state;
        state.games = games;
        markMine();
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { }
        if (typeof render === 'function') { try { render(); } catch (e) { } }
      } finally {
        SYNC.applying = false;
      }
    }, function (e) { console.warn('[Season] snapshot error:', e && e.message); });
  }

  // ── Dev tools gate ───────────────────────────────────────
  //  The week simulator is the only thing that advances a week until
  //  the real stats pipeline lands, so it cannot simply be deleted.
  //  It is hidden from users instead: add ?dev=1 once and it stays on
  //  for this browser. Nothing here is reachable by a normal visitor.
  function devMode() {
    try {
      if (/[?&]dev=1/.test(location.search)) localStorage.setItem('tipoff-season-dev', '1');
      if (/[?&]dev=0/.test(location.search)) localStorage.removeItem('tipoff-season-dev');
      return localStorage.getItem('tipoff-season-dev') === '1';
    } catch (e) { return false; }
  }

  // ── Draft authority ──────────────────────────────────────
  //  Multiplayer only matters once the league is actually shared.
  //  Offline or signed out, every client is trivially the host and
  //  the draft behaves exactly as it did in the lab.
  var HOST_TAKEOVER_MS = 6000;   // grace before the host covers a silent human

  function multiplayer() {
    return !!(syncDb() && state && state.league && state.league.code && SYNC.unsub);
  }
  function isHost() {
    if (!state || !state.league) return true;
    var host = state.league.host;
    if (!host) return true;              // league made before hosts existed
    var uid = myUid();
    return !!(uid && uid === host);
  }

  // ── Whose team is "mine" depends on the device ───────────
  //  Everything downstream reads team.isUser. With one player that
  //  was safe to bake into the stored state; with several it is a
  //  per-client fact, so it is recomputed from uid whenever state
  //  arrives from anywhere.
  function markMine() {
    if (!state || !state.teams) return;
    var uid = myUid();
    var claimed = false;
    state.teams.forEach(function (t) {
      if (!t) return;
      t.isUser = !!(uid && t.uid === uid);
      if (t.isUser) claimed = true;
    });
    // Signed out, or a league created before uids existed: fall back
    // to seat 0 so a solo player still sees a team rather than none.
    if (!claimed && !uid && state.teams[0]) state.teams[0].isUser = true;
  }

  function unsubscribeSeason() {
    if (SYNC.unsub) { try { SYNC.unsub(); } catch (e) { } SYNC.unsub = null; }
    SYNC.code = null;
    SYNC.rev = 0;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* quota or private mode */ }
    schedulePush();
  }
  function load() {
    try { var raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function sessionName() {
    try { var s = JSON.parse(localStorage.getItem('mmfantasy-session') || 'null'); return (s && s.name) || 'You'; } catch (e) { return 'You'; }
  }

  // ── Player pool ─────────────────────────────────────────
  // ── Conferences ─────────────────────────────────────────
  //  Demo pool conference tags. A generated pool
  //  (data/conference-players.js → window.TIPOFF_CONF_POOL) carries
  //  its own conference per player and replaces this entirely.
  var CONF_MAP = {
    'Akron': 'MAC', 'App State': 'Sun Belt', 'Arizona': 'Big 12', 'BYU': 'Big 12', 'Belmont': 'MVC',
    'Clemson': 'ACC', 'Colorado State': 'Mountain West', 'Marquette': 'Big East', 'Memphis': 'American',
    'Mississippi State': 'SEC', 'Ole Miss': 'SEC', 'Penn State': 'Big Ten', 'Providence': 'Big East',
    'Texas A&M': 'SEC', 'VCU': 'A-10', 'Virginia': 'ACC', 'Wake Forest': 'ACC', 'Washington': 'Big Ten',
    'Wright State': 'Horizon', 'Xavier': 'Big East'
  };
  var MAJORS = ['ACC', 'Big East', 'Big Ten', 'Big 12', 'SEC'];
  var CONF_ABBR = { 'ACC': 'ACC', 'Big East': 'BE', 'Big Ten': 'B1G', 'Big 12': 'B12', 'SEC': 'SEC' };
  //  2026-27 membership of the major conferences. Used for simulated
  //  conference opponents; the real feed supplies real opponents.
  var CONF_TEAMS = {
    'ACC': ['Boston College', 'California', 'Clemson', 'Duke', 'Florida State', 'Georgia Tech', 'Louisville', 'Miami', 'NC State', 'North Carolina', 'Notre Dame', 'Pittsburgh', 'SMU', 'Stanford', 'Syracuse', 'Virginia', 'Virginia Tech', 'Wake Forest'],
    'Big East': ['Butler', 'UConn', 'Creighton', 'DePaul', 'Georgetown', 'Marquette', 'Providence', 'Seton Hall', "St. John's", 'Villanova', 'Xavier'],
    'Big Ten': ['Illinois', 'Indiana', 'Iowa', 'Maryland', 'Michigan', 'Michigan State', 'Minnesota', 'Nebraska', 'Northwestern', 'Ohio State', 'Oregon', 'Penn State', 'Purdue', 'Rutgers', 'UCLA', 'USC', 'Washington', 'Wisconsin'],
    'Big 12': ['Arizona', 'Arizona State', 'Baylor', 'BYU', 'Cincinnati', 'Colorado', 'Houston', 'Iowa State', 'Kansas', 'Kansas State', 'Oklahoma State', 'TCU', 'Texas Tech', 'UCF', 'Utah', 'West Virginia'],
    'SEC': ['Alabama', 'Arkansas', 'Auburn', 'Florida', 'Georgia', 'Kentucky', 'LSU', 'Mississippi State', 'Missouri', 'Oklahoma', 'Ole Miss', 'South Carolina', 'Tennessee', 'Texas', 'Texas A&M', 'Vanderbilt']
  };
  //  League calendars. Conference play: week 1 is Mon Dec 28, 2026
  //  (conference openers Dec 30 – Jan 3); 9 regular weeks through
  //  Feb 28, semifinals Mar 1–7 (final week of conference play),
  //  championship Mar 8–14 (conference tournaments, ends Selection
  //  Sunday). Full season: week 1 is Mon Nov 2, 2026 (opening night).
  var CAL = {
    conference: { start: [2026, 11, 28], regWeeks: 9, playoffWeeks: 2 },
    season: { start: [2026, 10, 2], playoffWeeks: 0 }
  };

  var ALL = null, BY_ID = null, POOL = null, POOL_KEY = '';
  // ESPN team info from the generated pool: { school: { abbr, color, conf } }.
  // When present, it also replaces CONF_TEAMS so simulated opponents use
  // the exact school names the real feed uses.
  var SCHOOL_INFO = {};
  (function loadSchoolInfo() {
    var tp = window.TIPOFF_CONF_POOL && window.TIPOFF_CONF_POOL.teams;
    if (!tp) return;
    var byConf = {};
    Object.keys(tp).forEach(function (id) {
      var t = tp[id]; SCHOOL_INFO[t.school] = t;
      (byConf[t.conf] = byConf[t.conf] || []).push(t.school);
    });
    Object.keys(byConf).forEach(function (c) { CONF_TEAMS[c] = byConf[c].sort(); });
  })();
  function toPlayer(p, conf) {
    var st = p.stats || {};
    var avg = {
      points: +st.points || 0, rebounds: +st.rebounds || 0, assists: +st.assists || 0,
      steals: +st.steals || 0, blocks: +st.blocks || 0
    };
    // True freshmen with no prior line: give a modest prior so a top
    // recruit isn't treated as a permanent zero. Deterministic per id.
    if (p.hasStats === false) {
      var r = mulberry32(hashStr(p.id));
      avg = { points: 4 + r() * 6, rebounds: 1.5 + r() * 3, assists: 0.5 + r() * 1.5, steals: 0.4 + r() * 0.5, blocks: 0.2 + r() * 0.5 };
    }
    var raw = String(p.position || p.pos || 'G').toUpperCase();
    var pos = raw === 'C' ? 'C' : raw.indexOf('F') >= 0 ? 'F' : raw.indexOf('C') >= 0 ? 'C' : 'G';
    return { id: p.id, name: p.name, college: p.college, conf: conf || 'Other', pos: pos, cls: p.cls, mins: +p.minutes || 0, gp: +p.games || 0, jersey: p.jersey || '', height: p.height || '',
      fresh: p.hasStats === false, avg: avg, proj: fpts(avg), injury: p.injury || null, injuryNote: p.injuryNote || null };
  }
  function allPlayers() {
    if (ALL) return ALL;
    var seen = {}, src = poolSource() === 'generated';
    ALL = []; BY_ID = {};
    (src ? window.TIPOFF_CONF_POOL.players : (window.MM_PLAYERS || [])).forEach(function (p) {
      if (seen[p.id]) return;
      seen[p.id] = true;
      var pl = toPlayer(p, src ? p.conference : CONF_MAP[p.college]);
      ALL.push(pl); BY_ID[pl.id] = pl;
    });
    // Leagues drafted from the demo pool keep resolving their players
    // after a generated pool is installed.
    if (src) (window.MM_PLAYERS || []).forEach(function (p) {
      if (!BY_ID[p.id]) BY_ID[p.id] = toPlayer(p, CONF_MAP[p.college]);
    });
    ALL.sort(function (a, b) { return b.proj - a.proj; });
    return ALL;
  }
  function poolSource() { return window.TIPOFF_CONF_POOL && window.TIPOFF_CONF_POOL.players && window.TIPOFF_CONF_POOL.players.length ? 'generated' : 'demo'; }
  // The draftable pool for the current league (or for given conferences).
  function poolFor(confs) {
    var all = allPlayers();
    if (!confs || !confs.length) confs = MAJORS; // Tipoff season leagues are power-conference only
    return all.filter(function (p) { return confs.indexOf(p.conf) >= 0; });
  }
  function pool() {
    var confs = state && state.league && state.league.conferences;
    var key = confs ? confs.join('|') : '*';
    if (POOL && POOL_KEY === key) return POOL;
    POOL = poolFor(confs); POOL_KEY = key;
    return POOL;
  }
  // { conf: { schools: n, players: n } } for the setup wizard
  function conferenceSummary() {
    var out = {};
    allPlayers().forEach(function (p) {
      var c = out[p.conf] = out[p.conf] || { schools: {}, players: 0 };
      c.schools[p.college] = 1; c.players++;
    });
    Object.keys(out).forEach(function (k) { out[k].schools = Object.keys(out[k].schools).length; });
    return out;
  }
  function P(id) { allPlayers(); return BY_ID[id]; }
  function code6() {
    var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', o = '';
    for (var i = 0; i < 6; i++) o += c.charAt(Math.floor(Math.random() * c.length));
    return o;
  }
  function snake(round1, rounds) {
    var picks = [];
    for (var rd = 0; rd < rounds; rd++) picks = picks.concat(rd % 2 === 0 ? round1.slice() : round1.slice().reverse());
    return picks;
  }
  // League scoring (Settings → Scoring Categories). A category that is
  // switched off scores 0. Defaults match the tournament app.
  var STAT_KEYS = ['points', 'rebounds', 'assists', 'steals', 'blocks'];
  var STAT_LABEL = { points: 'Points', rebounds: 'Rebounds', assists: 'Assists', steals: 'Steals', blocks: 'Blocks' };
  function defaultScoring() {
    var o = {}; STAT_KEYS.forEach(function (k) { o[k] = { on: true, w: WEIGHTS[k] }; }); return o;
  }
  function weights() {
    var sc = state && state.league && state.league.scoring;
    if (!sc) return WEIGHTS;
    var w = {}; STAT_KEYS.forEach(function (k) { w[k] = sc[k] && sc[k].on ? +sc[k].w || 0 : 0; }); return w;
  }
  function fpts(line) {
    var W = weights();
    return line.points * W.points + line.rebounds * W.rebounds +
      line.assists * W.assists + line.steals * W.steals + line.blocks * W.blocks;
  }
  function resetPool() { ALL = null; POOL = null; POOL_KEY = ''; BY_ID = null; _schoolConf = null; }
  function fitsSlot(pos, slot) {
    if (slot === 'UTIL') return true;
    if (slot === 'G') return pos === 'G';
    if (slot === 'F') return pos === 'F' || pos === 'C';
    return false;
  }

  // ── League creation ─────────────────────────────────────
  function createLeague(opts) {
    var n = opts.numTeams;
    var teams = [];
    var names = BOT_NAMES.slice();
    var r = mulberry32(Date.now() >>> 0);
    for (var i = names.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = names[i]; names[i] = names[j]; names[j] = t; }
    for (var k = 0; k < n; k++) {
      //  uid is what makes a seat human. The creator claims seat 0;
      //  the rest stay bots until somebody joins with the code and
      //  claims one. isUser is a LOCAL view (see markMine) because
      //  "the user" is a different person on every device.
      teams.push({
        id: 't' + k, name: k === 0 ? (opts.teamName || sessionName() + "'s Team") : names[k - 1],
        isUser: k === 0, uid: k === 0 ? myUid() : null, bot: k !== 0, roster: []
      });
    }
    // Randomize draft order (user not always first)
    var order = teams.map(function (t) { return t.id; });
    for (var a = order.length - 1; a > 0; a--) { var b = Math.floor(r() * (a + 1)); var tmp = order[a]; order[a] = order[b]; order[b] = tmp; }
    var picks = [];
    for (var rd = 0; rd < opts.rosterSize; rd++) {
      var row = rd % 2 === 0 ? order.slice() : order.slice().reverse();
      picks = picks.concat(row);
    }
    var fmt = opts.format === 'conference' ? 'conference' : 'season';
    var cal = CAL[fmt];
    var regWeeks = fmt === 'conference' ? cal.regWeeks : opts.weeks;
    state = {
      version: 2,
      phase: 'draft',
      league: {
        name: opts.name || 'Season League', numTeams: n, rosterSize: opts.rosterSize,
        format: fmt, conferences: fmt === 'conference' && opts.conferences && opts.conferences.length ? opts.conferences.slice() : null,
        start: cal.start, regWeeks: regWeeks, playoffWeeks: cal.playoffWeeks, weeks: regWeeks + cal.playoffWeeks,
        code: code6(), scoring: defaultScoring(),
        //  The creator's device drives bot picks and the draft clock.
        //  Without a single authority every client runs the same
        //  timers and they race each other on every pick.
        host: myUid(),
        slots: SLOTS.slice(), weights: WEIGHTS, seed: (Date.now() % 1e9) | 0
      },
      teams: teams,
      draft: { order: picks, round1: order.slice(), pick: 0, log: [], status: 'pre', timerSecs: opts.timerSecs || 90, queue: [], scheduledAt: null },
      schedule: buildSchedule(teams.map(function (t) { return t.id; }), regWeeks),
      kinds: {},
      playoff: null, champion: null,
      week: 0, day: 0,
      games: {}, lineups: {}, results: []
    };
    save();
    // save() pushes the document; subscribing now means the creator
    // is in multiplayer mode immediately rather than only after a
    // reopen, which is what decides whether draft authority applies.
    if (state.league.code) subscribeSeason(state.league.code);

    //  save()'s push is debounced by 400ms and its failure path only
    //  warns. So a league could sit on screen with a code the creator
    //  reads out loud while no document ever reached the server — and
    //  the first anyone learned of it was a friend being told "no
    //  league found". Write once, now, and wait for the answer.
    confirmLeagueSaved();
  }

  //  Writes the new league immediately and tells the creator the truth
  //  either way. Separate from pushState so the debounce, the revision
  //  counter and the echo guard are left exactly as they are.
  function confirmLeagueSaved() {
    var ref = state && state.league && state.league.code ? seasonDoc(state.league.code) : null;
    if (!ref) {
      try { notify('Not connected to the league database. This league is only on this device, so nobody can join it.', 'error'); } catch (_) { }
      return Promise.resolve(false);
    }
    if (!myUid()) {
      try { notify('Sign in to share this league. While signed out it stays on this device.', 'error'); } catch (_) { }
      return Promise.resolve(false);
    }
    return ref.set({
      rev: SYNC.rev || 1,
      state: syncPayload(),
      updatedAt: Date.now(),
      updatedBy: myUid()
    }, { merge: true }).then(function () {
      SYNC.rev = SYNC.rev || 1;
      return true;
    }).catch(function (e) {
      var c = (e && e.code) || '';
      console.warn('[Season] league create write failed:', c, e && e.message);
      SYNC.warnedDenied = true;   // pushState has already said its piece
      try {
        notify(c === 'permission-denied'
          ? 'This league could not be saved to the server, so the code will not work for anyone else. Firestore rules for seasonLeagues may not be deployed yet.'
          : 'This league could not be saved to the server (' + (c || 'network error') + '). The code will not work for anyone else until it saves.',
          'error');
      } catch (_) { }
      return false;
    });
  }

  // Circle-method round robin, cycled to fill the season.
  function buildSchedule(ids, weeks) {
    var list = ids.slice();
    if (list.length % 2) list.push(null);
    var n = list.length, rounds = [];
    for (var r = 0; r < n - 1; r++) {
      var pairs = [];
      for (var i = 0; i < n / 2; i++) {
        var a = list[i], b = list[n - 1 - i];
        if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(pairs);
      list.splice(1, 0, list.pop());
    }
    var out = [];
    for (var w = 0; w < weeks; w++) out.push(rounds[w % rounds.length]);
    return out;
  }

  // ── Draft ───────────────────────────────────────────────
  function onClock() { return state.draft.order[state.draft.pick]; }
  function team(id) { for (var i = 0; i < state.teams.length; i++) if (state.teams[i].id === id) return state.teams[i]; }
  //  Seat 0 is the CREATOR's team, not "my" team. Returning it
  //  unconditionally meant a joiner who claimed seat 3 spent the whole
  //  season setting lineups, drafting and dropping on the host's
  //  roster — 41 call sites all pointed at the wrong person. The seat
  //  that is mine is the one markMine() flagged from my uid.
  function userTeam() {
    if (!state || !state.teams || !state.teams.length) return null;
    for (var i = 0; i < state.teams.length; i++) {
      if (state.teams[i] && state.teams[i].isUser) return state.teams[i];
    }
    //  No seat claimed by this account: recompute once in case a
    //  snapshot arrived before auth did, then fall back to seat 0 so a
    //  solo/offline player still sees a team rather than a blank app.
    markMine();
    for (var j = 0; j < state.teams.length; j++) {
      if (state.teams[j] && state.teams[j].isUser) return state.teams[j];
    }
    return state.teams[0];
  }
  function drafted() {
    var s = {};
    state.teams.forEach(function (t) { t.roster.forEach(function (id) { s[id] = true; }); });
    return s;
  }
  function available() {
    var d = drafted();
    return pool().filter(function (p) { return !d[p.id]; });
  }
  function makePick(teamId, playerId) {
    var t = team(teamId);
    t.roster.push(playerId);
    state.draft.log.push({ pick: state.draft.pick, teamId: teamId, playerId: playerId });
    state.draft.pick++;
    if (state.draft.pick >= state.draft.order.length) startSeason();
    save();
  }
  // Bot: best projection, but make sure the starting slots can be filled.
  function botChoose(teamId) {
    var t = team(teamId), avail = available();
    var g = 0, f = 0;
    t.roster.forEach(function (id) { var p = P(id); if (p.pos === 'G') g++; else f++; });
    var picksLeft = state.league.rosterSize - t.roster.length;
    var needG = Math.max(0, 2 - g), needF = Math.max(0, 2 - f);
    var r = rngFor('draft' + state.draft.pick);
    // Small jitter so bots don't draft identically every league
    var ranked = avail.map(function (p) { return { p: p, s: p.proj * (0.9 + r() * 0.2) }; })
      .sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.p; });
    if (needG + needF >= picksLeft) {
      var want = needG > 0 ? function (p) { return p.pos === 'G'; } : function (p) { return p.pos !== 'G'; };
      for (var i = 0; i < ranked.length; i++) if (want(ranked[i])) return ranked[i].id;
    }
    return ranked[0].id;
  }
  function simToUser() {
    while (state.phase === 'draft' && onClock() !== userTeam().id) makePick(onClock(), botChoose(onClock()));
    if (state.phase === 'draft' && draftLive()) restartClock();
  }

  // ── Live draft (same mechanics as the tournament draft room) ──
  //  status: 'pre' (commissioner hasn't started) → 'live' ⇄ 'paused'.
  //  Each pick gets the pick timer. Bots take their pick a few seconds
  //  into their clock; if YOUR clock runs out, the top eligible player
  //  in your queue is taken, otherwise the best available.
  //  endsAt is a wall-clock time, so a reload mid-draft resumes the
  //  clock where it was instead of resetting it.
  function draftCfg() {
    var d = state.draft;
    if (!d.status) { d.status = d.pick > 0 ? 'live' : 'pre'; }
    if (!d.timerSecs) d.timerSecs = 90;
    if (!d.queue) d.queue = [];
    return d;
  }
  function draftLive() { return state && state.phase === 'draft' && draftCfg().status === 'live'; }
  function restartClock() {
    var d = draftCfg();
    d.endsAt = Date.now() + d.timerSecs * 1000;
    // Lab bots "think" for 2–5 seconds so you can watch the board move.
    d.botAt = team(onClock()).isUser ? null : Date.now() + 2000 + Math.floor(Math.random() * 3000);
    save();
    if (team(onClock()).isUser) deviceNotify('onClock', 'You’re on the clock', 'Round ' + (Math.floor(d.pick / state.league.numTeams) + 1) + ' in ' + state.league.name + '. ' + fmtClock(d.timerSecs) + ' to pick.');
  }
  function startDraft() {
    var d = draftCfg();
    if (d.status !== 'pre') return;
    d.status = 'live'; restartClock();
  }
  function pauseDraft() {
    var d = draftCfg();
    if (d.status !== 'live') return;
    d.status = 'paused'; d.pausedLeft = Math.max(0, d.endsAt - Date.now());
    d.botLeft = d.botAt ? Math.max(0, d.botAt - Date.now()) : null;
    save();
  }
  function resumeDraft() {
    var d = draftCfg();
    if (d.status !== 'paused') return;
    d.status = 'live'; d.endsAt = Date.now() + (d.pausedLeft || d.timerSecs * 1000);
    d.botAt = d.botLeft != null ? Date.now() + d.botLeft : null;
    save();
  }
  function timeLeft() {
    var d = draftCfg();
    if (d.status === 'pre') return d.timerSecs;
    if (d.status === 'paused') return (d.pausedLeft || 0) / 1000;
    return Math.max(0, (d.endsAt - Date.now()) / 1000);
  }
  function fmtClock(secs) {
    var t = Math.max(0, Math.ceil(secs)), m = Math.floor(t / 60);
    return m + ':' + (t % 60 < 10 ? '0' : '') + (t % 60);
  }
  // Roster rule: never let a team paint itself out of 2 G + 2 F/C.
  function needs(teamId) {
    var t = team(teamId), g = 0, f = 0;
    t.roster.forEach(function (id) { if (P(id).pos === 'G') g++; else f++; });
    return { g: Math.max(0, 2 - g), f: Math.max(0, 2 - f), left: state.league.rosterSize - t.roster.length };
  }
  function pickAllowed(teamId, pid) {
    var n = needs(teamId), p = P(pid), isG = p.pos === 'G';
    var after = { g: Math.max(0, n.g - (isG ? 1 : 0)), f: Math.max(0, n.f - (isG ? 0 : 1)), left: n.left - 1 };
    if (after.g + after.f > after.left) {
      return { ok: false, reason: 'You need ' + (n.g ? n.g + ' more guard' + (n.g > 1 ? 's' : '') : '') + (n.g && n.f ? ' and ' : '') + (n.f ? n.f + ' more forward' + (n.f > 1 ? 's' : '') : '') + ' to fill your starters. Take ' + (n.g ? 'a guard' : 'a forward or center') + ' here.' };
    }
    return { ok: true };
  }
  function queueChoice() {
    var d = draftCfg(), taken = drafted(), u = userTeam().id;
    for (var i = 0; i < d.queue.length; i++) {
      var id = d.queue[i];
      if (!taken[id] && P(id) && pickAllowed(u, id).ok) return id;
    }
    return null;
  }
  function toggleQueue(pid) {
    var q = draftCfg().queue, at = q.indexOf(pid);
    if (at >= 0) q.splice(at, 1); else q.push(pid);
    save();
  }
  function moveQueue(pid, dir) {
    var q = draftCfg().queue, at = q.indexOf(pid), to = at + dir;
    if (at < 0 || to < 0 || to >= q.length) return;
    q.splice(at, 1); q.splice(to, 0, pid); save();
  }
  // One pick, announced, then the next clock starts.
  function livePick(teamId, pid, how) {
    var p = P(pid);
    var q = draftCfg().queue, at = q.indexOf(pid); if (at >= 0) q.splice(at, 1);
    var gap = Date.now() - (livePick._last || 0);
    livePick._last = Date.now();
    makePick(teamId, pid);
    // Full-screen card for your picks and for picks made at a human pace.
    // Rapid-fire bot picks just slide into Recent Picks so the room
    // isn't blacked out every few seconds.
    if (team(teamId).isUser || gap > 8000) announce(p, team(teamId), how);
    if (!team(teamId).isUser) deviceNotify('pickMade', 'Pick made', team(teamId).name + ' drafted ' + p.name + '.');
    if (state.phase === 'draft') restartClock();
  }
  // ── Commissioner settings actions ───────────────────────
  function round1() {
    var d = draftCfg();
    if (!d.round1) d.round1 = d.order.slice(0, state.league.numTeams);
    return d.round1;
  }
  function editableDraft() { return state.phase === 'draft' && draftCfg().status === 'pre' && state.draft.pick === 0; }
  function moveInOrder(i, dir) {
    var r = round1(), j = i + dir;
    if (!editableDraft() || j < 0 || j >= r.length) return;
    var t = r[i]; r[i] = r[j]; r[j] = t;
    state.draft.order = snake(r, state.league.rosterSize); save();
  }
  function randomizeOrder() {
    if (!editableDraft()) return;
    var r = round1();
    for (var i = r.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = r[i]; r[i] = r[j]; r[j] = t; }
    state.draft.order = snake(r, state.league.rosterSize); save();
  }
  function setRounds(n) {
    if (!editableDraft()) return false;
    if (poolFor(state.league.conferences).length < Math.ceil(state.league.numTeams * n * 1.25)) return false;
    state.league.rosterSize = n; state.draft.order = snake(round1(), n); save();
    return true;
  }
  function restartLeague() {
    state.teams.forEach(function (t) { t.roster = []; });
    var d = draftCfg();
    d.pick = 0; d.log = []; d.status = 'pre'; d.queue = []; d.endsAt = null; d.botAt = null;
    d.order = snake(round1(), state.league.rosterSize);
    state.phase = 'draft'; state.week = 0; state.day = 0;
    state.games = {}; state.lineups = {}; state.results = [];
    state.kinds = {}; state.playoff = null; state.champion = null; state.fa = null; state.trades = null; state.injuries = null; state.injuryNews = null;
    state.schedule = buildSchedule(state.teams.map(function (t) { return t.id; }), regWeeks());
    save();
  }
  // Scoring changes apply to every game that hasn't been played yet.
  function applyScoring() {
    resetPool();
    Object.keys(state.games).forEach(function (w) {
      var wk = +w;
      Object.keys(state.games[w]).forEach(function (pid) {
        state.games[w][pid].forEach(function (g) {
          if (wk > state.week || (wk === state.week && g.day >= state.day)) g.fpts = Math.round(fpts(g.line) * 10) / 10;
        });
      });
    });
    save();
  }

  // ── Device notifications (Settings → Notifications) ─────
  var NOTIF_KEY = 'tipoff-season-notify';
  var NOTIF_DEFAULT = { master: false, draftSoon: true, onClock: true, pickMade: false, lockDecision: true, weekFinal: true, waivers: true, trades: true, injuries: true, rankChange: false, managerJoined: true };
  function notifPrefs() {
    var o = {}; try { o = JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}') || {}; } catch (e) { o = {}; }
    var out = {}; Object.keys(NOTIF_DEFAULT).forEach(function (k) { out[k] = k in o ? !!o[k] : NOTIF_DEFAULT[k]; }); return out;
  }
  function setNotifPref(k, v) {
    var o = notifPrefs(); o[k] = v;
    try { localStorage.setItem(NOTIF_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ }
  }
  function canNotify() { return typeof Notification !== 'undefined' && Notification.permission === 'granted'; }
  // Only when the tab is in the background, same as the tournament.
  function deviceNotify(kind, title, body) {
    var pr = notifPrefs();
    if (!pr.master || !pr[kind] || !canNotify() || !document.hidden) return;
    try { new Notification(title, { body: body, icon: 'icons/icon-192.png', tag: 'tipoff-season-' + kind }); } catch (e) { /* ignore */ }
  }

  // Called 4× a second while the season view is open.
  function draftTick() {
    if (state && state.phase === 'draft' && draftCfg().status === 'pre' && state.draft.scheduledAt) {
      var at = state.draft.scheduledAt, now0 = Date.now();
      if (!state.draft.soonSent && at - now0 <= 15 * 60000 && at > now0) {
        state.draft.soonSent = true; save();
        deviceNotify('draftSoon', 'Draft starts soon', state.league.name + ' drafts in 15 minutes.');
      }
      if (now0 >= at) { startDraft(); ui.toastMsg = 'Scheduled start reached. The draft is live.'; ui.toastType = 'success'; render(); return; }
      var cd = root && root.querySelectorAll('[data-ss-countdown]');
      if (cd) cd.forEach(function (el) { el.textContent = countdownText(at); });
    }
    if (!draftLive()) return;
    var d = draftCfg(), now = Date.now(), t = team(onClock());

    /* ── Who is allowed to make this pick ──────────────────
       Every client runs this tick. Solo, that is harmless. With
       several people in a league it is not: `!t.isUser` is true on
       YOUR device whenever SOMEONE ELSE is on the clock, so without
       a guard your client would happily draft for your friend as
       though he were a bot — and his client would do the same to
       you, at the same moment, for the same slot.

       The rule:
         • a human seat is picked for by its own device only
         • bot seats are picked for by the host alone
         • if a human's device is gone, the host takes over after a
           grace period so a disconnect cannot stall the draft    */
    var mp = multiplayer();
    var seatIsHuman = !!(t && t.uid);
    var mineToPick = t.isUser;
    var hostCovers = isHost() && (!seatIsHuman || now >= d.endsAt + HOST_TAKEOVER_MS);
    var mayAct = !mp || mineToPick || hostCovers;

    if (!mayAct) { paintClock(); return; }

    // Bot clock: only ever for a seat with nobody behind it.
    if (!seatIsHuman && d.botAt && now >= d.botAt) {
      livePick(t.id, botChoose(t.id), 'bot'); afterPick(); return;
    }
    if (now >= d.endsAt) {
      if (mineToPick) {
        var qid = queueChoice(), pid = qid || botChoose(t.id);
        ui.confirmId = null;
        livePick(t.id, pid, 'auto');
        ui.toastMsg = 'Time ran out. ' + (qid ? 'Took ' + P(pid).name + ' from your queue.' : 'Autopicked ' + P(pid).name + '.'); ui.toastType = 'info';
      } else livePick(t.id, botChoose(t.id), 'bot');
      afterPick(); return;
    }
    paintClock();
  }
  function afterPick() {
    if (state.phase !== 'draft') { ui.page = 'lineup'; ui.toastMsg = 'Draft complete. Set your week 1 lineup.'; ui.toastType = 'success'; }
    render();
  }

  // ── Season / weeks ──────────────────────────────────────
  function startSeason() {
    faCfg();
    state.phase = 'season';
    state.week = 1;
    startWeek();
  }
  // ── Injuries ────────────────────────────────────────────
  //  Status per player: GTD (game-time decision, ~50% to sit each game),
  //  OUT (misses every game until he's back), SEASON (out for the year).
  //  In the lab, injuries are simulated at the start of each week. A
  //  generated pool's ESPN injury flags seed the preseason list, and a
  //  real feed replaces updateInjuries() entirely.
  var INJ_PARTS = ['Ankle', 'Knee', 'Hamstring', 'Back', 'Foot', 'Shoulder', 'Concussion', 'Illness', 'Wrist', 'Hip'];
  function injuries() {
    if (!state.injuries) {
      state.injuries = {};
      allPlayers().forEach(function (p) {
        if (p.injury) state.injuries[p.id] = { status: p.injury, part: p.injuryNote || 'Undisclosed', since: 0, until: p.injury === 'SEASON' ? 99 : 1 };
      });
    }
    return state.injuries;
  }
  function injuryOf(pid) {
    var inj = injuries()[pid];
    if (!inj) return null;
    if (state.phase === 'season' && inj.until < state.week) return null;
    return inj;
  }
  function updateInjuries(week) {
    var inj = injuries(), news = [];
    Object.keys(inj).forEach(function (pid) { if (inj[pid].until < week) { delete inj[pid]; news.push({ pid: pid, back: true }); } });
    pool().forEach(function (p) {
      if (inj[p.id]) return;
      var r = rngFor('inj' + week + '|' + p.id), x = r();
      var part = INJ_PARTS[Math.floor(r() * INJ_PARTS.length)];
      if (x < 0.003) inj[p.id] = { status: 'SEASON', part: part, since: week, until: 99 };
      else if (x < 0.018) inj[p.id] = { status: 'OUT', part: part, since: week, until: week + Math.floor(r() * 3) };
      else if (x < 0.045) inj[p.id] = { status: 'GTD', part: part, since: week, until: week };
      if (inj[p.id]) news.push({ pid: p.id, back: false });
    });
    state.injuryNews = { week: week, items: news };
    var mine = news.filter(function (n) { return !n.back && userTeam().roster.indexOf(n.pid) >= 0; });
    if (mine.length) deviceNotify('injuries', 'Injury update', mine.map(function (n) { return P(n.pid).name + ' ' + injLabel(inj[n.pid]); }).join(', '));
  }
  function injLabel(i) { return i.status === 'SEASON' ? 'out for the season' : i.status === 'OUT' ? 'is out' : 'is a game-time decision'; }
  function injTag(pid) {
    var i = injuryOf(pid);
    if (!i) return '';
    var txt = i.status === 'SEASON' ? 'OUT-SZN' : i.status;
    var tip = i.part + (i.status === 'OUT' ? ', out through week ' + i.until : i.status === 'GTD' ? ', game-time decision this week' : ', out for the season');
    return '<span class="ss-inj ss-inj-' + i.status.toLowerCase() + '" title="' + esc(tip) + '">' + txt + '</span>';
  }
  function startWeek() {
    state.day = 0;
    updateInjuries(state.week);
    state.games[state.week] = generateWeekGames(state.week);
    //  Simulation first so the week is never empty, then replaced by
    //  real box scores if the feed has any for these dates.
    upgradeWeekToReal(state.week);
    state.lineups[state.week] = {};
    state.teams.forEach(function (t) {
      var prev = state.lineups[state.week - 1] && state.lineups[state.week - 1][t.id];
      var slots;
      if (t.isUser && prev) {
        // Carry last week's lineup forward for the user; any slot whose
        // player was dropped gets the best eligible bench player.
        slots = prev.map(function (s) { return newSlot(s.slot, t.roster.indexOf(s.playerId) >= 0 ? s.playerId : null); });
        var used = {}; slots.forEach(function (s) { if (s.playerId) used[s.playerId] = 1; });
        slots.forEach(function (s) {
          if (s.playerId) return;
          var best = t.roster.filter(function (id) { return !used[id] && fitsSlot(P(id).pos, s.slot); })
            .sort(function (a, b) { return P(b).proj - P(a).proj; })[0];
          if (best) { s.playerId = best; used[best] = 1; }
        });
      } else {
        slots = autoLineup(t).map(function (pid, i) { return newSlot(SLOTS[i], pid); });
      }
      state.lineups[state.week][t.id] = slots;
    });
    save();
  }
  function newSlot(slot, playerId) {
    return { slot: slot, playerId: playerId, eligible: [], locked: null, pending: null };
  }
  // Best projected weekly output (proj × games this week), fill G,G,F,F then UTIL.
  function autoLineup(t) {
    var wk = state.games[state.week] || {};
    var scored = t.roster.map(function (id) {
      var g = (wk[id] || []).length, inj = injuryOf(id);
      var mult = !inj ? 1 : inj.status === 'GTD' ? 0.5 : 0;
      return { id: id, v: (P(id).proj * g + P(id).proj * 0.01) * mult + (mult ? 0 : -1000) };
    }).sort(function (a, b) { return b.v - a.v; });
    var used = {}, out = [];
    SLOTS.forEach(function (slot) {
      for (var i = 0; i < scored.length; i++) {
        var c = scored[i];
        if (!used[c.id] && fitsSlot(P(c.id).pos, slot)) { used[c.id] = true; out.push(c.id); return; }
      }
      out.push(null);
    });
    return out;
  }

  // Simulated weekly schedule + box scores. One school = one schedule.
  /* ══════════════════════════════════════════════════════
     REAL BOX SCORES
     generateWeekGames invents a week from season averages. This
     replaces it with what actually happened, read from the shared
     seasonStats collection the Cloud Function writes.

     It never blocks. startWeek() still fills the week from the
     simulation immediately, then this upgrades it in place when the
     real data arrives and re-renders. A league drafted before the
     season opens therefore still works, and starts showing real
     games the moment there are any.

     Shape out is identical to the simulation, because everything
     downstream reads state.games[week][playerId] and nothing else.
  ══════════════════════════════════════════════════════ */
  var SEASON_STATS_ID = '2026-27';

  function weekRange(week) {
    var st = state && state.league && state.league.start
      ? new Date(state.league.start[0], state.league.start[1], state.league.start[2])
      : SEASON_START;
    var a = new Date(st.getTime() + (week - 1) * 7 * 864e5);
    var b = new Date(a.getTime() + 6 * 864e5);
    var iso = function (d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
        '-' + String(d.getDate()).padStart(2, '0');
    };
    return { startISO: iso(a), endISO: iso(b), start: a };
  }

  // Which 0-6 day of the league week an ET date falls on.
  function dayIndexFor(dateISO, week) {
    var r = weekRange(week);
    var parts = String(dateISO).split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    var diff = Math.round((d - r.start) / 864e5);
    return diff >= 0 && diff <= 6 ? diff : -1;
  }

  function normSchool(s) {
    return String(s || '').toLowerCase()
      .replace(/&amp;/g, '&').replace(/[.']/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  //  Rostered players only. Reading all 1,027 player documents every
  //  week to find the eighty that matter would be wasteful.
  function rosteredPlayers() {
    var ids = {};
    (state.teams || []).forEach(function (t) {
      (t.roster || []).forEach(function (pid) { ids[pid] = true; });
    });
    return Object.keys(ids);
  }

  function loadRealWeek(week) {
    var db = syncDb();
    if (!db || !state) return Promise.resolve(null);

    var r = weekRange(week);
    var statsRef = db.collection('seasonStats').doc(SEASON_STATS_ID);

    return statsRef.collection('games')
      .where('date', '>=', r.startISO)
      .where('date', '<=', r.endISO)
      .get()
      .then(function (snap) {
        if (snap.empty) return null;              // nothing real for this week

        // school -> the games it played this week
        var bySchool = {};
        snap.forEach(function (doc) {
          var g = doc.data() || {};
          [['home', 'away'], ['away', 'home']].forEach(function (pair) {
            var me = g[pair[0]] || {}, them = g[pair[1]] || {};
            var key = normSchool(me.school);
            if (!key) return;
            (bySchool[key] = bySchool[key] || []).push({
              gameId: doc.id,
              day: dayIndexFor(g.date, week),
              opp: them.school || 'TBD',
              home: pair[0] === 'home',
              ts: me.score, os: them.score,
              time: g.startsAt || '',
              completed: !!g.completed
            });
          });
        });

        var ids = rosteredPlayers();
        if (!ids.length) return { bySchool: bySchool, lines: {} };

        return Promise.all(ids.map(function (pid) {
          var p = P(pid);
          var espnId = (p && p.espnId) || String(pid).replace(/^e/, '');
          return statsRef.collection('players').doc(String(espnId)).get()
            .then(function (d) { return { pid: pid, data: d.exists ? d.data() : null }; })
            .catch(function () { return { pid: pid, data: null }; });
        })).then(function (rows) {
          var lines = {};
          rows.forEach(function (row) { if (row.data) lines[row.pid] = row.data; });
          return { bySchool: bySchool, lines: lines };
        });
      })
      .catch(function (e) {
        console.warn('[Season] real stats read failed:', e && e.message);
        return null;
      });
  }

  //  Turns the two collections into the exact structure the
  //  simulation produced, so nothing downstream changes.
  function buildRealWeek(week, real) {
    var out = {};
    rosteredPlayers().forEach(function (pid) {
      var p = P(pid);
      if (!p) return;
      var sched = real.bySchool[normSchool(p.college)] || [];
      if (!sched.length) return;

      var rec = real.lines[pid] || {};
      var played = rec.games || {};
      var liveLine = rec.live || null;

      out[pid] = sched.filter(function (g) { return g.day >= 0; }).map(function (g) {
        var raw = played[g.gameId] ||
          (liveLine && liveLine.gameId === g.gameId ? liveLine : null);
        //  The team played but this player has no line: a genuine DNP,
        //  which is a zero rather than a missing game.
        var dnp = !raw;
        var line = {
          points: raw ? raw.pts : 0, rebounds: raw ? raw.reb : 0,
          assists: raw ? raw.ast : 0, steals: raw ? raw.stl : 0,
          blocks: raw ? raw.blk : 0
        };
        return {
          day: g.day, line: line, fpts: Math.round(fpts(line) * 10) / 10, dnp: dnp,
          opp: g.opp, home: g.home, time: g.time, ts: g.ts, os: g.os,
          real: true, final: g.completed
        };
      });
    });
    return out;
  }

  //  Called after the simulated week is already in place. Swaps in
  //  real games if any exist, then repaints.
  function upgradeWeekToReal(week) {
    if (!state || !syncDb()) return;
    loadRealWeek(week).then(function (real) {
      if (!real || !state || state.week !== week) return;
      var built = buildRealWeek(week, real);
      if (!Object.keys(built).length) return;
      state.games[week] = built;
      save();
      try { render(); } catch (e) { }
    });
  }

  function generateWeekGames(week) {
    var bySchool = {};
    pool().forEach(function (p) { (bySchool[p.college] = bySchool[p.college] || []).push(p); });
    var games = {};
    Object.keys(bySchool).forEach(function (school) {
      var r = rngFor('w' + week + '|' + school);
      var x = r();
      var count = x < 0.15 ? 1 : x < 0.8 ? 2 : 3;
      var days = [0, 1, 2, 3, 4, 5, 6];
      for (var i = days.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = days[i]; days[i] = days[j]; days[j] = t; }
      days = days.slice(0, count).sort();
      // Simulated schedule detail per game: opponent, venue, tip time,
      // final score. A real feed fills the same fields.
      var oppPool = opponentPool(school);
      var meta = days.map(function (d) {
        var opp = oppPool[Math.floor(r() * oppPool.length)];
        var mine = 58 + Math.floor(r() * 36), theirs = 58 + Math.floor(r() * 36);
        if (mine === theirs) mine += 1;
        return { opp: opp, home: r() < 0.55, time: TIPS[Math.floor(r() * TIPS.length)], ts: mine, os: theirs };
      });
      bySchool[school].forEach(function (p) {
        var pr = rngFor('w' + week + '|' + p.id);
        games[p.id] = days.map(function (d) {
          var inj = injuryOf(p.id), roll = pr();
          var dnp = inj && inj.status !== 'GTD' ? true : inj && inj.status === 'GTD' ? roll < 0.5 : roll < 0.04;
          var line = { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 };
          if (!dnp) {
            Object.keys(line).forEach(function (k) {
              var m = p.avg[k];
              var sd = m * 0.45 + (k === 'points' ? 1.5 : 0.5);
              line[k] = Math.max(0, Math.round(m + gauss(pr) * sd));
            });
          }
          var m = meta[days.indexOf(d)];
          return { day: d, line: line, fpts: Math.round(fpts(line) * 10) / 10, dnp: dnp,
                   opp: m.opp, home: m.home, time: m.time, ts: m.ts, os: m.os };
        });
      });
    });
    return games;
  }
  var TIPS = ['12:00pm', '2:00pm', '4:30pm', '6:30pm', '7:00pm', '8:00pm', '9:00pm'];
  var OPP_FALLBACK = ['Kentucky', 'Duke', 'Kansas', 'Gonzaga', 'Purdue', 'Houston', 'UConn', 'Baylor', 'Creighton',
    'Marquette', 'Villanova', 'Indiana', 'Ohio State', 'Florida', 'Tennessee', 'Arkansas', 'Oregon', 'UCLA', 'Butler', 'Dayton'];
  var _oppCache = null;
  function opponentPool(self) {
    var conf = state && state.league && state.league.format === 'conference' && P && confOfSchool(self);
    if (conf && CONF_TEAMS[conf]) return CONF_TEAMS[conf].filter(function (n) { return n !== self; });
    if (conf && conf !== 'Other') {
      var same = {}; allPlayers().forEach(function (p) { if (p.conf === conf && p.college !== self) same[p.college] = 1; });
      var list = Object.keys(same);
      if (list.length >= 3) return list;
    }
    if (!_oppCache) {
      var names = [];
      try { if (typeof SCHOOL_COLORS !== 'undefined') names = Object.keys(SCHOOL_COLORS); } catch (e) { /* not loaded */ }
      _oppCache = names.length > 20 ? names : OPP_FALLBACK;
    }
    return _oppCache.filter(function (n) { return n !== self; });
  }
  var _schoolConf = null;
  function confOfSchool(school) {
    if (!_schoolConf) { _schoolConf = {}; allPlayers().forEach(function (p) { _schoolConf[p.college] = p.conf; }); }
    return _schoolConf[school] || null;
  }
  function abbr(name) {
    if (!name) return '—';
    if (SCHOOL_INFO[name] && SCHOOL_INFO[name].abbr) return SCHOOL_INFO[name].abbr;
    var w = name.replace(/[^A-Za-z&\s]/g, '').trim().split(/\s+/);
    if (w.length > 1) return w.map(function (x) { return x.charAt(0); }).join('').slice(0, 4).toUpperCase();
    return name.slice(0, 4).toUpperCase();
  }
  // Week 1 starts Monday, Nov 2, 2026 (opening week of the season).
  var SEASON_START = new Date(2026, 10, 2);
  function weekDates(week) {
    var st = state && state.league && state.league.start ? new Date(state.league.start[0], state.league.start[1], state.league.start[2]) : SEASON_START;
    var a = new Date(st.getTime() + (week - 1) * 7 * 864e5), b = new Date(a.getTime() + 6 * 864e5);
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return M[a.getMonth()] + ' ' + a.getDate() + '–' + (a.getMonth() === b.getMonth() ? '' : M[b.getMonth()] + ' ') + b.getDate();
  }
  function gamesFor(pid, week) { return ((state.games[week || state.week] || {})[pid]) || []; }
  function gameOn(pid, day) {
    var g = gamesFor(pid);
    for (var i = 0; i < g.length; i++) if (g[i].day === day) return g[i];
    return null;
  }
  function slotsOf(teamId, week) { return state.lineups[week || state.week][teamId]; }

  // Play one day: every unlocked starter who plays that day gets an
  // eligible game; that game becomes the pending lock decision.
  function simDay() {
    if (state.day > 6) return;
    if (state.trades) botTradeReplies();
    var d = state.day;
    state.teams.forEach(function (t) {
      slotsOf(t.id).forEach(function (s) {
        if (s.locked || !s.playerId) return;
        var g = gameOn(s.playerId, d);
        if (g) {
          var rec = { playerId: s.playerId, day: d, fpts: g.fpts, dnp: g.dnp };
          s.eligible.push(rec);
          s.pending = rec;
        }
      });
      if (!t.isUser) botDecide(t);
    });
    state.day++;
    if (state.day > 6) finalizeWeek();
    save();
    var pend = slotsOf(userTeam().id).filter(function (s) { return s.pending && !s.locked; }).length;
    if (pend && state.day <= 7) deviceNotify('lockDecision', 'Lock or pass', pend + ' of your starters played. Decide before their next game.');
  }
  function lockSlot(teamId, idx) {
    var s = slotsOf(teamId)[idx];
    if (!s || s.locked || !s.pending) return;
    s.locked = s.pending; s.pending = null;
    save();
  }
  function passSlot(teamId, idx) {
    var s = slotsOf(teamId)[idx];
    if (!s || s.locked) return;
    s.pending = null;
    save();
  }
  function remainingGames(pid, fromDay) {
    return gamesFor(pid).filter(function (g) { return g.day >= fromDay; }).length;
  }
  // Bot policy: lock a strong game, or lock when no games remain.
  function botDecide(t) {
    slotsOf(t.id).forEach(function (s, i) {
      if (s.locked || !s.pending) return;
      var p = P(s.pending.playerId);
      var left = remainingGames(s.playerId, state.day + 1);
      if (left === 0 || s.pending.fpts >= p.proj * 1.15) lockSlot(t.id, i);
      else s.pending = null;
    });
  }
  function slotScore(s) {
    if (s.locked) return { v: s.locked.fpts, kind: 'locked' };
    if (s.eligible.length) return { v: s.eligible[s.eligible.length - 1].fpts, kind: 'live' };
    return { v: 0, kind: 'none' };
  }
  function teamScore(teamId, week) {
    return slotsOf(teamId, week).reduce(function (sum, s) { return sum + slotScore(s).v; }, 0);
  }
  function finalizeWeek() {
    var rankBefore = 0; standings().forEach(function (r, i) { if (r.isUser) rankBefore = i + 1; });
    state.teams.forEach(function (t) {
      slotsOf(t.id).forEach(function (s) {
        if (!s.locked && s.eligible.length) s.locked = Object.assign({ auto: true }, s.eligible[s.eligible.length - 1]);
        s.pending = null;
      });
    });
    state.schedule[state.week - 1].forEach(function (m, i) {
      state.results.push({
        week: state.week, home: m[0], away: m[1], kind: matchKind(state.week, i),
        homePts: Math.round(teamScore(m[0]) * 10) / 10, awayPts: Math.round(teamScore(m[1]) * 10) / 10
      });
    });
    var mine = state.results.filter(function (r) { return r.week === state.week && (r.home === 't0' || r.away === 't0'); })[0];
    if (mine) {
      var me = mine.home === 't0', mp = me ? mine.homePts : mine.awayPts, op = me ? mine.awayPts : mine.homePts;
      deviceNotify('weekFinal', (mp > op ? 'Win' : mp < op ? 'Loss' : 'Tie') + ', ' + f1(mp) + '–' + f1(op), 'Week ' + state.week + ' is final.');
    }
    var wk = state.results.filter(function (r) { return r.week === state.week; });
    if (wk.length) {
      var hi = null; wk.forEach(function (r) { [[r.home, r.homePts], [r.away, r.awayPts]].forEach(function (x) { if (!hi || x[1] > hi[1]) hi = x; }); });
      chatSys(weekLabel() + ' is final. ' + wk.map(function (r) { var hw = r.homePts >= r.awayPts; return team(hw ? r.home : r.away).name + ' ' + f1(Math.max(r.homePts, r.awayPts)) + '–' + f1(Math.min(r.homePts, r.awayPts)); }).join(' · ') + '. Top score: ' + team(hi[0]).name + ', ' + f1(hi[1]) + '.');
    }
    var rankAfter = 0; standings().forEach(function (r, i) { if (r.isUser) rankAfter = i + 1; });
    if (rankBefore && rankAfter !== rankBefore) deviceNotify('rankChange', 'You moved to #' + rankAfter, 'Standings after week ' + state.week + '.');
  }
  // ── Playoffs ────────────────────────────────────────────
  //  Top 4 by regular-season standings. Semifinals 1v4, 2v3; then the
  //  championship and a 3rd-place game. Everyone else keeps playing
  //  consolation games so no one's season ends early.
  function regWeeks() { return state.league.regWeeks || state.league.weeks; }
  function isPlayoffWeek(w) { return (w || state.week) > regWeeks(); }
  function matchKind(week, i) { return (state.kinds && state.kinds[week] && state.kinds[week][i]) || 'reg'; }
  function KIND_LABEL(k) { return { semi: 'Semifinal', final: 'Championship', third: '3rd Place', cons: 'Consolation', reg: '' }[k] || ''; }
  function winnerOf(res, seeds) {
    if (res.homePts !== res.awayPts) return res.homePts > res.awayPts ? res.home : res.away;
    return seeds.indexOf(res.home) < seeds.indexOf(res.away) ? res.home : res.away;
  }
  function pairUp(ids) {
    var out = [];
    for (var i = 0; i + 1 < ids.length; i += 2) out.push([ids[i], ids[i + 1]]);
    return out;
  }
  function setupPlayoffRound(week) {
    var n = week - regWeeks();
    var games = [], kinds = [];
    if (n === 1) {
      var seeds = standings().map(function (r) { return r.id; });
      state.playoff = { seeds: seeds };
      games.push([seeds[0], seeds[3]], [seeds[1], seeds[2]]); kinds.push('semi', 'semi');
      pairUp(seeds.slice(4)).forEach(function (g) { games.push(g); kinds.push('cons'); });
    } else {
      var sd = state.playoff.seeds;
      var semis = state.results.filter(function (r) { return r.week === week - 1 && r.kind === 'semi'; });
      var w = semis.map(function (r) { return winnerOf(r, sd); });
      var l = semis.map(function (r) { var x = winnerOf(r, sd); return x === r.home ? r.away : r.home; });
      w.sort(function (a, b) { return sd.indexOf(a) - sd.indexOf(b); });
      l.sort(function (a, b) { return sd.indexOf(a) - sd.indexOf(b); });
      games.push(w); kinds.push('final');
      games.push(l); kinds.push('third');
      pairUp(sd.slice(4)).forEach(function (g) { games.push(g); kinds.push('cons'); });
    }
    state.schedule[week - 1] = games;
    state.kinds[week] = kinds;
  }
  function nextWeek() {
    if (state.day <= 6) return;
    if (state.week >= state.league.weeks) {
      state.phase = 'done';
      if (state.league.playoffWeeks) {
        var fin = state.results.filter(function (r) { return r.week === state.week && r.kind === 'final'; })[0];
        if (fin) state.champion = winnerOf(fin, state.playoff.seeds);
      }
      save(); return;
    }
    botMoves();
    processWaivers();
    state.week++;
    if (isPlayoffWeek(state.week)) setupPlayoffRound(state.week);
    startWeek();
    expireTrades();
    botTradeOffer();
    save();
  }
  // ── Free agency & waivers ───────────────────────────────
  //  After the draft every undrafted player in the league's pool is a
  //  free agent: add him instantly (dropping someone if your roster is
  //  full). A dropped player goes on waivers until the next weekly
  //  processing (start of each new week, Monday). Claims on waiver
  //  players are resolved then:
  //    rolling  → best priority wins; a winning team moves to the back.
  //               Starting priority is reverse round-1 draft order.
  //    faab     → highest blind bid wins (ties: rolling priority);
  //               each team has a season budget, $0 bids are allowed.
  //  Rules: rosters must keep 2 G and 2 F/C; a player whose score is
  //  locked in this week can't be dropped until the week ends.
  function faCfg() {
    if (!state.fa) {
      var r1 = round1();
      state.fa = { type: 'rolling', budget: 100, budgets: {}, priority: r1.slice().reverse(), claims: [], waivers: {}, tx: [], seq: 1 };
      state.teams.forEach(function (t) { state.fa.budgets[t.id] = 100; });
    }
    return state.fa;
  }
  function rosteredBy() {
    var m = {}; state.teams.forEach(function (t) { t.roster.forEach(function (id) { m[id] = t.id; }); }); return m;
  }
  function playerStatus(pid) {
    if (rosteredBy()[pid]) return 'rostered';
    return faCfg().waivers[pid] ? 'waivers' : 'fa';
  }
  function rosterOk(roster) {
    var g = 0, f = 0; roster.forEach(function (id) { if (P(id).pos === 'G') g++; else f++; });
    return g >= 2 && f >= 2;
  }
  function lockedThisWeek(teamId, pid) {
    if (state.phase !== 'season' || !state.lineups[state.week]) return false;
    return (slotsOf(teamId) || []).some(function (s) { return s.locked && s.locked.playerId === pid; });
  }
  // Can this team add `add` (dropping `drop`, may be null)? Returns {ok, reason}.
  function checkMove(teamId, add, drop) {
    var t = team(teamId), full = t.roster.length >= state.league.rosterSize;
    if (state.phase === 'draft') return { ok: false, reason: 'Free agency opens after the draft.' };
    if (state.phase === 'done') return { ok: false, reason: 'The season is over.' };
    if (add && rosteredBy()[add]) return { ok: false, reason: P(add).name + ' is already on a roster.' };
    if (full && !drop) return { ok: false, reason: 'Your roster is full. Pick someone to drop.' };
    if (drop && t.roster.indexOf(drop) < 0) return { ok: false, reason: 'That player isn’t on your roster.' };
    if (drop && lockedThisWeek(teamId, drop)) return { ok: false, reason: P(drop).name + '’s score is locked in this week. You can drop him once the week ends.' };
    var after = t.roster.filter(function (id) { return id !== drop; });
    if (add) after.push(add);
    if (!rosterOk(after)) return { ok: false, reason: 'Your roster needs at least 2 guards and 2 forwards or centers.' };
    return { ok: true };
  }
  function logTx(o) { o.week = state.week; o.day = state.day; o.id = faCfg().seq++; faCfg().tx.unshift(o); }
  function removeFromTeam(teamId, pid) {
    var t = team(teamId); t.roster = t.roster.filter(function (id) { return id !== pid; });
    if (state.phase === 'season' && state.lineups[state.week]) {
      (slotsOf(teamId) || []).forEach(function (s) { if (s.playerId === pid && !s.locked) { s.playerId = null; s.pending = null; } });
    }
    faCfg().waivers[pid] = true;                 // dropped players clear waivers next Monday
    faCfg().claims = faCfg().claims.filter(function (c) { return !(c.teamId === teamId && c.drop === pid); });
  }
  function applyMove(teamId, add, drop, kind, bid) {
    if (drop) removeFromTeam(teamId, drop);
    if (add) {
      team(teamId).roster.push(add);
      delete faCfg().waivers[add];
      faCfg().claims = faCfg().claims.filter(function (c) { return c.add !== add; });
    }
    logTx({ type: kind, teamId: teamId, add: add, drop: drop, bid: bid == null ? null : bid });
  }
  function addFreeAgent(teamId, add, drop) {
    if (playerStatus(add) !== 'fa') return { ok: false, reason: P(add).name + ' is on waivers. Put in a claim instead.' };
    var c = checkMove(teamId, add, drop); if (!c.ok) return c;
    applyMove(teamId, add, drop, 'add'); save(); return { ok: true };
  }
  function dropOnly(teamId, drop) {
    var c = checkMove(teamId, null, drop); if (!c.ok) return c;
    applyMove(teamId, null, drop, 'drop'); save(); return { ok: true };
  }
  function placeClaim(teamId, add, drop, bid) {
    var f = faCfg();
    if (playerStatus(add) !== 'waivers') return { ok: false, reason: 'He’s a free agent. Add him directly.' };
    var c = checkMove(teamId, add, drop); if (!c.ok) return c;
    if (f.type === 'faab') {
      bid = Math.max(0, Math.floor(+bid || 0));
      if (bid > f.budgets[teamId]) return { ok: false, reason: 'You only have $' + f.budgets[teamId] + ' left.' };
    } else bid = null;
    f.claims = f.claims.filter(function (x) { return !(x.teamId === teamId && x.add === add); });
    f.claims.push({ id: f.seq++, teamId: teamId, add: add, drop: drop || null, bid: bid });
    save(); return { ok: true };
  }
  function cancelClaim(id) { var f = faCfg(); f.claims = f.claims.filter(function (c) { return c.id !== id; }); save(); }
  function moveClaim(id, dir) {
    var f = faCfg(), mine = f.claims.filter(function (c) { return c.teamId === userTeam().id; });
    var i = mine.findIndex(function (c) { return c.id === id; }), j = i + dir;
    if (i < 0 || j < 0 || j >= mine.length) return;
    var a = f.claims.indexOf(mine[i]), b = f.claims.indexOf(mine[j]);
    var t = f.claims[a]; f.claims[a] = f.claims[b]; f.claims[b] = t; save();
  }
  // Bots: claim a clear upgrade on waivers or in free agency now and then.
  // Bots judge players on projection blended with how they've actually
  // played this season, so hot free agents get picked up.
  function botValue(pid) {
    var sp = seasonPoints(pid), pr = P(pid).proj, inj = injuryOf(pid);
    var v = sp.gp >= 2 ? pr * 0.4 + (sp.total / sp.gp) * 0.6 : pr;
    return !inj ? v : inj.status === 'SEASON' ? v * 0.05 : inj.status === 'OUT' ? v * 0.6 : v * 0.9;
  }
  function botMoves() {
    var f = faCfg(), taken = rosteredBy();
    var avail = pool().filter(function (p) { return !taken[p.id]; })
      .sort(function (a, b) { return botValue(b.id) - botValue(a.id); });
    state.teams.forEach(function (t) {
      if (t.isUser) return;
      var r = rngFor('bw' + state.week + t.id);
      if (r() > 0.6) return;
      var worst = t.roster.slice().sort(function (a, b) { return botValue(a) - botValue(b); });
      for (var i = 0; i < avail.length && i < 25; i++) {
        var cand = avail[i];
        for (var k = 0; k < Math.min(3, worst.length); k++) {
          var dropId = worst[k];
          if (botValue(cand.id) < botValue(dropId) + 1.5) continue;
          if (!checkMove(t.id, cand.id, dropId).ok) continue;
          if (playerStatus(cand.id) === 'waivers') {
            placeClaim(t.id, cand.id, dropId, f.type === 'faab' ? Math.min(f.budgets[t.id], 1 + Math.floor(r() * 15)) : null);
          } else { applyMove(t.id, cand.id, dropId, 'add'); taken[cand.id] = t.id; }
          return;
        }
      }
    });
  }
  // Weekly processing, run as each new week starts.
  function processWaivers() {
    var f = faCfg(), results = [];
    var prio = function (tid) { return f.priority.indexOf(tid); };
    var pending = f.claims.slice();
    if (f.type === 'faab') {
      pending.sort(function (a, b) { return (b.bid || 0) - (a.bid || 0) || prio(a.teamId) - prio(b.teamId) || a.id - b.id; });
      pending.forEach(function (c) {
        var ok = playerStatus(c.add) === 'waivers' && (c.bid || 0) <= f.budgets[c.teamId] && checkMove(c.teamId, c.add, c.drop).ok;
        if (ok) { applyMove(c.teamId, c.add, c.drop, 'waiver', c.bid || 0); f.budgets[c.teamId] -= (c.bid || 0); }
        results.push({ c: c, won: ok });
      });
    } else {
      var progress = true;
      while (progress) {
        progress = false;
        for (var i = 0; i < f.priority.length; i++) {
          var tid = f.priority[i];
          var mine = pending.filter(function (c) { return c.teamId === tid; });
          for (var k = 0; k < mine.length; k++) {
            var c = mine[k];
            pending.splice(pending.indexOf(c), 1);
            if (playerStatus(c.add) === 'waivers' && checkMove(tid, c.add, c.drop).ok) {
              applyMove(tid, c.add, c.drop, 'waiver');
              results.push({ c: c, won: true });
              f.priority.splice(i, 1); f.priority.push(tid);
              progress = true; break;
            }
            results.push({ c: c, won: false });
          }
          if (progress) break;
        }
      }
      pending.forEach(function (c) { results.push({ c: c, won: false }); });
    }
    f.claims = [];
    f.waivers = {};          // everyone left over clears to free agency
    var mine = results.filter(function (x) { return x.c.teamId === userTeam().id; });
    f.lastRun = { week: state.week, mine: mine.map(function (x) { return { add: x.c.add, won: x.won, bid: x.c.bid }; }) };
    if (mine.length) {
      var won = mine.filter(function (x) { return x.won; }).length;
      deviceNotify('waivers', 'Waivers processed', won + ' of ' + mine.length + ' claim' + (mine.length > 1 ? 's' : '') + ' won.');
    }
  }
  // ── Trades ──────────────────────────────────────────────
  //  Propose any players-for-players deal. Rules: no trades during the
  //  playoffs or after the deadline; a player whose score is locked
  //  this week can't move; both rosters must stay within the roster
  //  size and keep 2 G + 2 F/C. Review: instant on acceptance, or the
  //  commissioner approves (in the lab you are the commissioner).
  //  Bots answer when the next day is played, and now and then offer
  //  you a deal at the start of a week. Offers expire when the week ends.
  function trCfg() {
    if (!state.trades) state.trades = { review: 'none', deadline: Math.max(1, regWeeks() - 2), list: [], seq: 1 };
    return state.trades;
  }
  function tradesOpen() {
    if (state.phase !== 'season') return { ok: false, reason: state.phase === 'draft' ? 'Trading opens after the draft.' : 'The season is over.' };
    if (isPlayoffWeek()) return { ok: false, reason: 'No trades during the playoffs.' };
    if (state.week > trCfg().deadline) return { ok: false, reason: 'The trade deadline (week ' + trCfg().deadline + ') has passed.' };
    return { ok: true };
  }
  function checkTrade(from, to, give, get) {
    var open = tradesOpen(); if (!open.ok) return open;
    if (!give.length && !get.length) return { ok: false, reason: 'Pick at least one player.' };
    if (!give.length || !get.length) return { ok: false, reason: 'Both sides have to send at least one player.' };
    var A = team(from), B = team(to);
    if (give.some(function (id) { return A.roster.indexOf(id) < 0; }) || get.some(function (id) { return B.roster.indexOf(id) < 0; })) return { ok: false, reason: 'Someone in this deal is no longer on that roster.' };
    var lk = give.filter(function (id) { return lockedThisWeek(from, id); }).concat(get.filter(function (id) { return lockedThisWeek(to, id); }));
    if (lk.length) return { ok: false, reason: P(lk[0]).name + '’s score is locked in this week. He can be traded once the week ends.' };
    var a2 = A.roster.filter(function (id) { return give.indexOf(id) < 0; }).concat(get);
    var b2 = B.roster.filter(function (id) { return get.indexOf(id) < 0; }).concat(give);
    if (a2.length > state.league.rosterSize) return { ok: false, reason: (A.isUser ? 'You' : A.name) + ' would have too many players. Drop someone first or even it out.' };
    if (b2.length > state.league.rosterSize) return { ok: false, reason: B.name + ' would have too many players. Even out the deal.' };
    if (!rosterOk(a2)) return { ok: false, reason: (A.isUser ? 'Your' : A.name + '’s') + ' roster would fall below 2 guards and 2 forwards.' };
    if (!rosterOk(b2)) return { ok: false, reason: B.name + '’s roster would fall below 2 guards and 2 forwards.' };
    return { ok: true };
  }
  function proposeTrade(from, to, give, get) {
    var c = checkTrade(from, to, give, get); if (!c.ok) return c;
    var T = trCfg();
    T.list.unshift({ id: T.seq++, from: from, to: to, give: give.slice(), get: get.slice(), status: 'pending', week: state.week, day: state.day });
    save(); return { ok: true };
  }
  function tradeValue(ids) { return ids.reduce(function (s, id) { return s + botValue(id); }, 0); }
  function executeTrade(tr) {
    var c = checkTrade(tr.from, tr.to, tr.give, tr.get);
    if (!c.ok) { tr.status = 'failed'; tr.note = c.reason; return false; }
    var A = team(tr.from), B = team(tr.to);
    tr.give.forEach(function (id) { A.roster.splice(A.roster.indexOf(id), 1); B.roster.push(id); });
    tr.get.forEach(function (id) { B.roster.splice(B.roster.indexOf(id), 1); A.roster.push(id); });
    [tr.from, tr.to].forEach(function (tid) {
      (slotsOf(tid) || []).forEach(function (s) { if (s.playerId && team(tid).roster.indexOf(s.playerId) < 0 && !s.locked) { s.playerId = null; s.pending = null; } });
      if (!team(tid).isUser) refillSlots(tid);
    });
    var moved = tr.give.concat(tr.get);
    faCfg().claims = faCfg().claims.filter(function (cl) { return moved.indexOf(cl.drop) < 0; });
    tr.status = 'done';
    logTx({ type: 'trade', teamId: tr.from, other: tr.to, give: tr.give.slice(), get: tr.get.slice() });
    chatSys('Trade: ' + A.name + ' send ' + tr.give.map(function (id) { return P(id).name; }).join(', ') + ' to ' + B.name + ' for ' + tr.get.map(function (id) { return P(id).name; }).join(', ') + '.');
    // anything else pending that involved these players is dead now
    trCfg().list.forEach(function (o) {
      if (o !== tr && o.status === 'pending' && o.give.concat(o.get).some(function (id) { return moved.indexOf(id) >= 0; })) { o.status = 'failed'; o.note = 'A player in this deal was traded.'; }
    });
    return true;
  }
  function refillSlots(tid) {
    var t = team(tid), slots = slotsOf(tid) || [], used = {};
    slots.forEach(function (s) { if (s.playerId) used[s.playerId] = 1; });
    slots.forEach(function (s) {
      if (s.playerId || s.locked) return;
      var best = t.roster.filter(function (id) { return !used[id] && fitsSlot(P(id).pos, s.slot) && !(injuryOf(id) && injuryOf(id).status !== 'GTD'); })
        .sort(function (a, b) { return P(b).proj - P(a).proj; })[0];
      if (best) { s.playerId = best; used[best] = 1; }
    });
  }
  function respondTrade(tr, accept) {
    if (tr.status !== 'pending') return;
    if (!accept) { tr.status = 'declined'; return; }
    if (trCfg().review === 'commish' && !tr.approved) { tr.status = 'review'; return; }
    executeTrade(tr);
  }
  function approveTrade(tr, ok) {
    if (tr.status !== 'review') return;
    if (!ok) { tr.status = 'vetoed'; return; }
    tr.approved = true; executeTrade(tr);
  }
  // Bots answer offers sent to them (called as each day is played).
  function botTradeReplies() {
    trCfg().list.forEach(function (tr) {
      if (tr.status !== 'pending' || team(tr.to).isUser) return;
      var gets = tradeValue(tr.give), gives = tradeValue(tr.get);
      var accept = gets >= gives * 1.05 && checkTrade(tr.from, tr.to, tr.give, tr.get).ok;
      if (!accept) tr.note = gets < gives * 0.85 ? 'Not close. They want a lot more value.' : 'Close. They want a little more.';
      respondTrade(tr, accept);
      deviceNotify('trades', 'Trade ' + (tr.status === 'declined' ? 'declined' : tr.status === 'review' ? 'awaiting approval' : 'accepted'), team(tr.to).name + ' ' + (tr.status === 'declined' ? 'declined' : 'accepted') + ' your offer.');
    });
  }
  // Now and then a bot offers you a deal at the start of a week.
  function botTradeOffer() {
    if (!tradesOpen().ok) return;
    var r = rngFor('tro' + state.week);
    if (r() > 0.4) return;
    var u = userTeam(), bots = state.teams.filter(function (t) { return !t.isUser; });
    var bot = bots[Math.floor(r() * bots.length)];
    var myBest = u.roster.slice().sort(function (a, b) { return botValue(b) - botValue(a); });
    var want = myBest[1 + Math.floor(r() * 3)];
    if (!want) return;
    var theirs = bot.roster.filter(function (id) { return P(id).pos === P(want).pos || (P(id).pos !== 'G') === (P(want).pos !== 'G'); })
      .sort(function (a, b) { return Math.abs(botValue(a) - botValue(want) * 0.97) - Math.abs(botValue(b) - botValue(want) * 0.97); });
    var give = theirs[0];
    if (!give || !checkTrade(bot.id, u.id, [give], [want]).ok) return;
    var T = trCfg();
    T.list.unshift({ id: T.seq++, from: bot.id, to: u.id, give: [give], get: [want], status: 'pending', week: state.week, day: state.day });
    deviceNotify('trades', 'Trade offer', bot.name + ' wants ' + P(want).name + ' for ' + P(give).name + '.');
  }
  function expireTrades() {
    trCfg().list.forEach(function (tr) { if (tr.status === 'pending' && tr.week < state.week) { tr.status = 'expired'; } });
  }
  function championId() {
    if (state.champion) return state.champion;
    return standings()[0].id;
  }
  function swapInto(idx, pid) {
    var slots = slotsOf(userTeam().id);
    var s = slots[idx];
    if (!s || s.locked) return;
    // If that player already starts elsewhere, swap them (only if that slot is unlocked and fits)
    for (var i = 0; i < slots.length; i++) {
      if (i !== idx && slots[i].playerId === pid) {
        if (slots[i].locked || (s.playerId && !fitsSlot(P(s.playerId).pos, slots[i].slot))) return;
        slots[i].playerId = s.playerId; slots[i].pending = null;
      }
    }
    s.playerId = pid; s.pending = null;
    save();
  }
  function opponentOf(teamId, week) {
    var w = state.schedule[(week || state.week) - 1] || [];
    for (var i = 0; i < w.length; i++) {
      if (w[i][0] === teamId) return w[i][1];
      if (w[i][1] === teamId) return w[i][0];
    }
    return null;
  }
  function standings() {
    var rows = {};
    state.teams.forEach(function (t) { rows[t.id] = { id: t.id, name: t.name, isUser: t.isUser, w: 0, l: 0, t: 0, pf: 0, pa: 0 }; });
    state.results.forEach(function (r) {
      if (r.kind && r.kind !== 'reg') return;   // playoffs don't change the regular-season table
      var h = rows[r.home], a = rows[r.away];
      h.pf += r.homePts; h.pa += r.awayPts; a.pf += r.awayPts; a.pa += r.homePts;
      if (r.homePts > r.awayPts) { h.w++; a.l++; } else if (r.homePts < r.awayPts) { a.w++; h.l++; } else { h.t++; a.t++; }
    });
    return Object.keys(rows).map(function (k) { return rows[k]; })
      .sort(function (a, b) { return (b.w + b.t / 2) - (a.w + a.t / 2) || b.pf - a.pf; });
  }
  function seasonPoints(pid) {
    var total = 0, gp = 0;
    Object.keys(state.games).forEach(function (w) {
      (state.games[w][pid] || []).forEach(function (g) {
        if (+w < state.week || g.day < state.day) { total += g.fpts; gp++; }
      });
    });
    return { total: total, gp: gp };
  }

  // ── Rendering ───────────────────────────────────────────
  //  The season mode renders inside the SAME shell as the tournament
  //  app: .sidebar, .main-content, .right-panel, .page, and the app's
  //  own components (home hero, stat tiles, quick actions, draft room,
  //  standings rows, team cards, the setup wizard). Those classes are
  //  global in styles.css, so the season pages inherit the tournament
  //  look exactly and stay in sync when it changes.
  //
  //  Helpers borrowed from app.js when present (all global functions):
  //    getSchoolLogoHTML(college, size)   school colour badges
  //    makeAvatarHTML(name, size)         manager avatars
  //    toast(msg, type)                   app toasts
  function logoHTML(college, size) {
    var si = SCHOOL_INFO[college];
    if (si && si.abbr) {
      var c = si.color || '#1e2235', r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
      var light = (r * 299 + g * 587 + b * 114) / 1000 > 150, len = si.abbr.length;
      return '<span class="school-badge" style="width:' + size + 'px;height:' + size + 'px;background:' + c + ';color:' + (light ? 'rgba(0,0,0,.82)' : '#fff') +
        ';font-size:' + Math.max(7, Math.round(size * (len > 3 ? .26 : len > 2 ? .31 : .36))) + 'px;" title="' + esc(college) + '">' + esc(si.abbr) + '</span>';
    }
    return typeof window.getSchoolLogoHTML === 'function' ? window.getSchoolLogoHTML(college, size)
      : '<span class="school-badge" style="width:' + size + 'px;height:' + size + 'px;">' + esc((college || '?').charAt(0)) + '</span>';
  }
  function avatarHTML(name, size) {
    return typeof window.makeAvatarHTML === 'function' ? window.makeAvatarHTML(name, size)
      : '<span class="ss-avatar" style="width:' + size + 'px;height:' + size + 'px;">' + esc(name.charAt(0)) + '</span>';
  }
  function notify(msg, type) {
    if (typeof window.toast === 'function') window.toast(msg, type);
  }
  // Reuse the tournament sidebar's own icons so both modes match.
  function appIcon(page) {
    var b = document.querySelector('#mainApp .sidebar-nav .nav-btn[data-page="' + page + '"] svg');
    return b ? b.outerHTML : '';
  }
  var ICON = {
    lineup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/></svg>',
    matchup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l6 6-6 6M20 6l-6 6 6 6"/></svg>',
    players: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M19 8v6M16 11h6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.6" fill="currentColor"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    swap: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 5h8l-2.2-2.2M12 11H4l2.2 2.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    burger: '<svg class="mnav-burger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    chev: '<svg class="mnav-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>'
  };
  var lastPage = '';
  // Season mode has one look: glass. Clear the old Appearance choice.
  try { localStorage.removeItem('tipoff-season-theme'); } catch (e) { /* ignore */ }
  // Count-up: any element with data-cu="key" data-v="number" animates from
  // the value it showed last render (or from 0 on a fresh page) to the new one.
  var cuMem = {};
  function cu(key, v, txt) { return '<b data-cu="' + key + '" data-v="' + v + '">' + (txt != null ? txt : f1(v)) + '</b>'; }
  function runCountUps(fresh) {
    var still = false;
    try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ }
    root.querySelectorAll('[data-cu]').forEach(function (el) {
      var k = el.getAttribute('data-cu'), to = +el.getAttribute('data-v');
      var from = k in cuMem ? cuMem[k] : (fresh ? 0 : to);
      cuMem[k] = to;
      if (still || from === to || isNaN(to)) return;
      var t0 = performance.now(), dur = 700;
      el.classList.add('cu-run');
      (function step(now) {
        var t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
        el.textContent = f1(from + (to - from) * e);
        if (t < 1 && el.isConnected) requestAnimationFrame(step); else { el.textContent = f1(to); el.classList.remove('cu-run'); }
      })(t0);
    });
  }
  function isLiveWeek() { return state && state.phase === 'season' && state.day > 0 && state.day <= 6; }
  function theme() { return 'glass'; }

  function navItems() {
    var draft = state && state.phase === 'draft';
    var items = [['home', 'Home', appIcon('home')]];
    if (draft) items.push(['draft', 'Draft', appIcon('players')]);
    else {
      items.push(['matchup', 'Matchups', ICON.matchup]);
      items.push(['lineup', 'Lineup', ICON.lineup]);
      items.push(['players', 'Players', ICON.players]);
    }
    items.push(['standings', 'Standings', appIcon('standings')]);
    items.push(['teams', 'Teams', appIcon('teams')]);
    items.push(['chat', 'Chat' + (unreadChat() ? ' <span class="ss-badge">' + unreadChat() + '</span>' : ''), appIcon('chat')]);
    items.push(['settings', 'Settings', appIcon('settings')]);
    return items;
  }

  function render() {
    if (!root) return;
    var mc = root.querySelector('.main-content');
    var keepScroll = mc ? mc.scrollTop : 0;
    // A bot pick re-renders the room; don't steal the search box from someone typing.
    var ae = document.activeElement, focusSearch = ae && ae.id === 'ssSearch', caret = focusSearch ? ae.selectionStart : 0;
    var focusChat = ae && ae.id === 'ssChatInput', chatCaret = focusChat ? ae.selectionStart : 0;
    // Pages that don't exist in the current phase fall back to home
    var valid = navItems().map(function (n) { return n[0]; }).concat(['rules']);
    if (valid.indexOf(ui.page) < 0) ui.page = 'home';
    var changed = ui.page !== lastPage;
    lastPage = ui.page;

    var glass = theme() === 'glass';
    root.classList.toggle('ss-glass', glass);
    var page = !state ? viewEmpty() :
      ui.page === 'home' && glass ? (state.phase === 'draft' ? viewHomeGlassDraft() : viewHomeGlass()) :
      ui.page === 'draft' ? viewDraft() :
      ui.page === 'lineup' ? viewLineup() :
      ui.page === 'matchup' ? viewMatchup() :
      ui.page === 'standings' ? viewStandings() :
      ui.page === 'teams' ? viewTeams() :
      ui.page === 'players' ? viewPlayers() :
      ui.page === 'settings' ? viewSettings() :
      ui.page === 'rules' ? viewRules() :
      ui.page === 'chat' ? viewChat() : viewHome();

    var label = '';
    navItems().forEach(function (n) { if (n[0] === ui.page) label = n[1]; });
    if (ui.page === 'rules') label = 'How It Works';
    var navBtns = navItems().map(function (n) {
      return '<button class="nav-btn' + (ui.page === n[0] ? ' active' : '') + '" data-act="nav" data-page="' + n[0] + '">' + n[2] + n[1] + '</button>';
    }).join('');
    // The phone sheet (More) lists only what the tab bar doesn't.
    var TAB_PAGES = ['home', 'draft', 'matchup', 'lineup', 'players', 'chat'].concat(state && state.phase === 'draft' ? ['teams'] : []);
    var sheetBtns = navItems().filter(function (n) { return TAB_PAGES.indexOf(n[0]) < 0; }).map(function (n) {
      return '<button class="nav-btn' + (ui.page === n[0] ? ' active' : '') + '" data-act="nav" data-page="' + n[0] + '">' + n[2] + n[1] + '</button>';
    }).join('');

    root.innerHTML =
      '<div class="ss-shell">' +
        '<aside class="sidebar">' +
          '<div class="sidebar-logo">' +
            '<img src="logo-icon.png" class="logo-mark sidebar-logo-img" width="42" height="42" alt="Tipoff Fantasy" />' +
            '<span class="sidebar-logo-text"><strong>TIPOFF</strong><span class="slt-light">FANTASY</span></span>' +
          '</div>' +
          '<div class="ss-mode-tag"><span>Regular season</span><em title="Scores are simulated until the live stats feed is connected.">Preview</em></div>' +
          '<nav class="sidebar-nav">' + (state ? navBtns : '') + '</nav>' +
          '<div class="sidebar-footer">' +
            '<button class="nav-btn signout-btn" data-act="exit">' + ICON.back + 'All Leagues</button>' +
          '</div>' +
        '</aside>' +
        (state ? '<button class="mnav-trigger' + (ui.sheet ? ' open' : '') + '" data-act="sheet" type="button" aria-expanded="' + !!ui.sheet + '">' +
          ICON.burger + '<span class="mnav-label">' + label + '</span>' + ICON.chev + '</button>' +
          '<div class="nav-sheet-backdrop' + (ui.sheet ? ' open' : '') + '" data-act="sheet"' + (ui.sheet ? '' : ' hidden') + '></div>' +
          '<nav class="nav-sheet' + (ui.sheet ? ' open' : '') + '"' + (ui.sheet ? '' : ' hidden') + ' aria-label="Season menu"><div class="nav-sheet-grabber" aria-hidden="true"></div>' +
            '<div class="nav-sheet-items">' + sheetBtns + '<button class="nav-btn" data-act="nav" data-page="rules">' + ICON.lineup + 'How It Works</button>' +
            '<button class="nav-btn signout-btn" data-act="exit">' + ICON.back + 'All Leagues</button></div></nav>' : '') +
        '<main class="main-content">' +
          (state ? '<header class="ss-topbar"><div class="ss-tb-brand"><img src="logo-icon.png" width="28" height="28" alt="" /><span>' + esc(state.league.name) + '</span>' + livePill() + '</div>' +
            '<nav class="ss-tb-nav" aria-label="Season">' + navItems().filter(function (n) { return n[0] !== 'settings'; }).map(function (n) {
              return '<button class="ss-tb-pill' + (ui.page === n[0] ? ' on' : '') + '" data-act="nav" data-page="' + n[0] + '">' + n[1] + '</button>';
            }).join('') + '</nav>' +
            '<div class="ss-tb-right">' + (devMode() ? '<button class="ss-lab-chip" data-act="labtoggle" aria-expanded="' + !!ui.lab + '" title="Week simulator (dev)">Dev</button>' : '') +
              '<button class="ss-tb-icon' + (ui.page === 'settings' ? ' on' : '') + '" data-act="nav" data-page="settings" aria-label="Settings">' + appIcon('settings') + '</button>' +
              '<button class="ss-tb-icon" data-act="exit" aria-label="All leagues">' + ICON.back + '</button></div></header>' + ticker() : '') +
          '<div class="mobile-clock-bar ss-mobile-bar">' +
            '<button class="ss-mb-back" data-act="exit" aria-label="All leagues">' + ICON.back + '</button>' +
            '<div class="mcb-clock-info"><div class="mcb-label">' + (state ? mobileBarLabel() : 'Regular season') + '</div>' +
            '<div class="mcb-manager">' + (state ? mobileBarValue() : 'New league') + '</div></div>' +
            (devMode() && state ? '<button class="ss-lab-chip" data-act="labtoggle" aria-expanded="' + !!ui.lab + '" title="Week simulator (dev)">Dev</button>' : '') +
          '</div>' +
          '<section class="page ' + (changed ? 'active-page' : 'ss-static') + '">' + page + '</section>' +
        '</main>' +
        (state ? rightPanel() : '') +
      (state ? tabBar() : '') +
      '</div>' + labPanel() + (ui.pcard && state ? viewPlayerCard(ui.pcard) : '') + (ui.invite && state ? viewInvite() : '') +
      (ui.wiz !== null ? viewWizard() : '') +
      (ui.explain != null && state && ui.wiz === null ? viewExplainer() : '');

    var mc2 = root.querySelector('.main-content');
    if (mc2) mc2.scrollTop = changed ? 0 : keepScroll;
    var cur = root.querySelector('.doc-chip.current');
    var wrap = cur && cur.closest('.draft-order-strip-wrap');
    if (cur && wrap) {
      var x = cur.getBoundingClientRect().left - wrap.getBoundingClientRect().left + wrap.scrollLeft;
      wrap.scrollLeft = Math.max(0, x - wrap.clientWidth / 2 + cur.clientWidth / 2);
    }
    if (focusSearch) { var si = document.getElementById('ssSearch'); if (si) { si.focus(); try { si.setSelectionRange(caret, caret); } catch (er) { /* ignore */ } } }
    if (ui.toastMsg) { notify(ui.toastMsg, ui.toastType || 'info'); ui.toastMsg = ''; }
    var cl = document.getElementById('ssChatList');
    if (cl) cl.scrollTop = cl.scrollHeight;
    if (focusChat || ui.chatFocus) {
      var ci = document.getElementById('ssChatInput');
      if (ci) { ci.focus(); try { var cp = ui.chatFocus ? ci.value.length : chatCaret; ci.setSelectionRange(cp, cp); } catch (er) { /* ignore */ } }
      ui.chatFocus = false;
    }
    if (glass) runCountUps(changed);
    ui.stamp = null;
  }

  function myGameIndex(week) {
    var g = state.schedule[(week || state.week) - 1] || [], u = userTeam().id;
    for (var i = 0; i < g.length; i++) if (g[i][0] === u || g[i][1] === u) return i;
    return -1;
  }
  function weekLabel(week) {
    week = week || state.week;
    if (week > regWeeks()) return week - regWeeks() === 1 ? 'Semifinals' : 'Championship Week';
    return 'Week ' + week;
  }
  // Phone tab bar: the pages people hit every day, one tap away.
  function tabBar() {
    var draft = state.phase === 'draft', unread = unreadChat();
    var tabs = draft
      ? [['home', 'Home', appIcon('home')], ['draft', 'Draft', appIcon('players')], ['teams', 'Teams', appIcon('teams')], ['chat', 'Chat', appIcon('chat')]]
      : [['home', 'Home', appIcon('home')], ['matchup', 'Matchups', ICON.matchup], ['lineup', 'Lineup', ICON.lineup], ['players', 'Players', ICON.players], ['chat', 'Chat', appIcon('chat')]];
    var inTabs = tabs.some(function (t) { return t[0] === ui.page; });
    var dec = !draft && state.phase === 'season' ? slotsOf(userTeam().id).filter(function (x) { return x.pending && !x.locked; }).length : 0;
    return '<nav class="ss-tabbar" aria-label="Season tabs">' + tabs.map(function (t) {
      var badge = t[0] === 'chat' && unread ? '<span class="tb-dot">' + unread + '</span>' : t[0] === 'matchup' && dec ? '<span class="tb-dot hot">' + dec + '</span>' : '';
      var on = ui.page === t[0] && !ui.sheet;
      return '<button class="ss-tab' + (on ? ' on' : '') + '" data-act="nav" data-page="' + t[0] + '"' + (on ? ' aria-current="page"' : '') + '>' +
        '<span class="tb-ic">' + t[2] + badge + '</span><span class="tb-l">' + t[1] + '</span></button>';
    }).join('') +
    '<button class="ss-tab' + (!inTabs || ui.sheet ? ' on' : '') + '" data-act="sheet" aria-expanded="' + !!ui.sheet + '"><span class="tb-ic">' + ICON.burger.replace('mnav-burger', '') + '</span><span class="tb-l">More</span></button></nav>';
  }
  function mobileBarLabel() {
    if (state.phase === 'draft') return draftCfg().status === 'pre' ? (draftCfg().scheduledAt ? 'Draft starts in ' + countdownText(draftCfg().scheduledAt) : 'Draft not started') : 'On the clock';
    if (state.phase === 'done') return 'Season complete';
    return weekLabel() + (state.day > 6 ? ', final' : ', ' + DAYS_FULL[state.day]);
  }
  function mobileBarValue() {
    if (state.phase === 'draft') { var t = team(onClock()), st = draftCfg().status; if (st === 'pre') return 'First pick: ' + (t.isUser ? 'You' : t.name); return (t.isUser ? 'You' : t.name) + (st === 'paused' ? ' · paused' : ' · ' + fmtClock(timeLeft())); }
    var u = userTeam(), o = opponentOf(u.id);
    if (state.phase === 'done') return esc(team(championId()).name) + ' won';
    return f1(teamScore(u.id)) + ' – ' + (o ? f1(teamScore(o)) : '0.0');
  }

  // ── Setup wizard (same component as the tournament setup) ──
  function wizSteps() {
    var conf = ui.setup.format === 'conference';
    var steps = [
      { id: 'welcome', title: 'Welcome, Commissioner', body: 'You’re setting up a season-long league. This takes about 60 seconds.' },
      { id: 'format', title: 'League Format', body: 'When does your league play? You can’t change this after the draft.' }
    ];
    if (conf) steps.push({ id: 'confs', title: 'Pick Your Conference', body: 'Draft from one conference, or mix the power conferences together.' });
    steps.push(
      { id: 'name', title: 'League Name', body: 'Name your league and your own team. Other managers name theirs when they join.', inputs: true },
      { id: 'teams', title: 'League Size', body: 'How many teams will play? Everyone faces a new opponent each week.', pills: 'teams', values: [4, 6, 8, 10, 12], unit: 'teams' },
      { id: 'roster', title: 'Roster Size', body: 'How many players does each team draft? Five start each week and the rest sit on the bench.', pills: 'roster', values: [8, 9, 10, 11, 12], unit: 'players' },
      { id: 'timer', title: 'Pick Timer', body: 'How long does each manager get to pick? When the clock runs out, the top of their queue is taken, or the best available player.', pills: 'timer', values: [30, 60, 90, 120], unit: 'seconds' }
    );
    if (!conf) steps.push({ id: 'weeks', title: 'Season Length', body: 'How many weeks of head-to-head matchups, starting opening week?', pills: 'weeks', values: [6, 8, 10, 12, 14, 16], unit: 'weeks' });
    steps.push(
      { id: 'lockin', title: 'How Lock-In Works', body: 'After one of your starters plays, you choose: lock that score for the week, or pass and wait for his next game. Locks are final. If you never lock, the slot keeps his most recent game.', rules: true },
      { id: 'done', title: 'You’re All Set', body: '', summary: true }
    );
    return steps;
  }
  function setupConfs() { return ui.setup.format === 'conference' ? ui.setup.conferences : null; }
  function poolNeeded() { return Math.ceil(ui.setup.teams * ui.setup.roster * 1.25); }
  function poolOk() { return poolFor(setupConfs()).length >= poolNeeded(); }
  function confOrder() {
    var sum = conferenceSummary();
    return Object.keys(sum).filter(function (c) { return c !== 'Other'; }).sort(function (a, b) {
      var ma = MAJORS.indexOf(a), mb = MAJORS.indexOf(b);
      if (ma >= 0 || mb >= 0) return (ma < 0 ? 99 : ma) - (mb < 0 ? 99 : mb);
      return sum[b].players - sum[a].players;
    });
  }
  function fmtDate(arr, addDays) {
    var d = new Date(arr[0], arr[1], arr[2] + (addDays || 0));
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return M[d.getMonth()] + ' ' + d.getDate();
  }
  function viewWizard() {
    var steps = wizSteps();
    if (ui.wiz > steps.length - 1) ui.wiz = steps.length - 1;
    var step = steps[ui.wiz], s = ui.setup, total = steps.length;
    var pct = Math.round((ui.wiz + 1) / total * 100);
    var html = '<h2 class="tut-title">' + step.title + '</h2>';
    if (step.body) html += '<p class="tut-body-text">' + step.body + '</p>';
    var blocked = false;
    if (step.id === 'format') {
      var c = CAL.conference, f = CAL.season;
      html += '<div class="tut-tourn-list">' +
        '<button class="tut-tourn-card' + (s.format === 'conference' ? ' tut-tourn-card--active' : '') + '" data-act="setfmt" data-v="conference">' +
          '<div class="ttc-name">Conference Play <span class="ss-rec">Recommended</span></div>' +
          '<div class="ttc-meta">' + fmtDate(c.start) + ' – Mar 14 · ' + c.regWeeks + ' weeks + 2 playoff weeks · ends Selection Sunday</div></button>' +
        '<button class="tut-tourn-card' + (s.format === 'season' ? ' tut-tourn-card--active' : '') + '" data-act="setfmt" data-v="season">' +
          '<div class="ttc-name">Full Season</div>' +
          '<div class="ttc-meta">Starts ' + fmtDate(f.start) + ' (opening week) · you pick the length · no playoffs</div></button>' +
      '</div>';
    }
    if (step.id === 'confs') {
      var sum = conferenceSummary(), sel = s.conferences.length ? s.conferences : MAJORS.slice();
      var one = s.confMode === 'one';
      html += '<div class="ss-conf-presets">' +
          '<button class="ss-preset' + (one ? ' on' : '') + '" data-act="confmode" data-v="one">One conference</button>' +
          '<button class="ss-preset' + (!one ? ' on' : '') + '" data-act="confmode" data-v="mix">Power conference mix</button>' +
        '</div>' +
        '<div class="ss-conf-grid ss-p5">' + MAJORS.map(function (cn) {
          var on = sel.indexOf(cn) >= 0, c = sum[cn] || { schools: 0, players: 0 };
          return '<button class="ss-conf' + (on ? ' on' : '') + '" data-act="conftoggle" data-v="' + esc(cn) + '" aria-pressed="' + on + '"' + (c.players ? '' : ' disabled') + '>' +
            '<i class="ss-conf-mk ' + cn.replace(/\W/g, '').toLowerCase() + '">' + CONF_ABBR[cn] + '</i>' +
            '<b>' + esc(cn) + '</b><span>' + (CONF_TEAMS[cn] || []).length + ' teams · ' + c.players + ' players</span></button>';
        }).join('') + '</div>';
      var have = poolFor(setupConfs()).length;
      html += '<p class="ss-pool-count' + (poolOk() ? '' : ' warn') + '">' + (one ? esc(sel[0] || '') + ' only · ' : sel.length + ' conferences · ') + have + ' draftable players' +
        (poolOk() ? '' : '. Not enough for ' + s.teams + ' teams × ' + s.roster + ' players (needs ' + poolNeeded() + '). ' + (one ? 'Pick a bigger conference, the mix, or fewer teams.' : 'Add a conference.')) + '</p>';
      if (!poolOk() || !sel.length) blocked = true;
      if (poolSource() === 'demo') html += '<p class="tut-code-hint">Lab pool: 20 demo schools. The real rosters load from data/conference-players.js.</p>';
    }
    if (step.inputs) {
      html += '<div class="tut-inputs">' +
        '<div class="tut-input-group"><label class="tut-label" for="ssName">League name</label><input class="tut-input" id="ssName" type="text" maxlength="40" value="' + esc(s.name) + '" /></div>' +
        '<div class="tut-input-group"><label class="tut-label" for="ssTeam">Your team name</label><input class="tut-input" id="ssTeam" type="text" maxlength="30" value="' + esc(s.team) + '" /></div>' +
      '</div>';
    }
    if (step.pills) {
      html += '<div class="tut-size-grid' + (step.values.length > 5 ? ' ss-size-6' : '') + '">' + step.values.map(function (n) {
        return '<button class="tut-size-pill' + (s[step.pills] === n ? ' tut-size-pill--active' : '') + '" data-act="opt" data-k="' + step.pills + '" data-v="' + n + '">' +
          '<span class="tut-size-num">' + n + '</span><span class="tut-size-label">' + step.unit + '</span></button>';
      }).join('') + '</div>';
      if ((step.id === 'teams' || step.id === 'roster') && !poolOk()) {
        html += '<p class="ss-pool-count warn">Only ' + poolFor(setupConfs()).length + ' players in your conferences. This size needs ' + poolNeeded() + '.</p>';
      }
    }
    if (step.rules) {
      html += '<div class="ss-wiz-rules">' +
        '<div><b>Starters</b><span>G, G, F, F and a utility spot</span></div>' +
        '<div><b>Bench</b><span>Bench games never count</span></div>' +
        '<div><b>No lock</b><span>The slot keeps its latest game. A DNP is zero.</span></div>' +
        '<div><b>Standings</b><span>Record first, then total points</span></div>' +
        (s.format === 'conference' ? '<div><b>Playoffs</b><span>Top 4: semifinals Mar 1–7, title Mar 8–14</span></div>' : '') + '</div>';
    }
    if (step.summary) {
      var confTxt = s.format === 'conference' ? (s.conferences.length === 1 ? s.conferences[0] + ' only' : s.conferences.length === 5 ? 'All 5 power conferences' : s.conferences.join(', ')) : '';
      html += '<div class="ss-wiz-rules">' +
        '<div><b>Format</b><span>' + (s.format === 'conference' ? 'Conference Play' : 'Full Season') + '</span></div>' +
        (s.format === 'conference' ? '<div><b>Conferences</b><span>' + esc(confTxt) + '</span></div>' : '') +
        '<div><b>Draft</b><span>' + s.teams + ' teams, ' + s.roster + ' rounds, ' + fmtClock(s.timer) + ' per pick</span></div>' +
        '<div><b>Season</b><span>' + (s.format === 'conference' ? fmtDate(CAL.conference.start) + ' – Feb 28, then playoffs to Mar 14' : s.weeks + ' weeks from ' + fmtDate(CAL.season.start)) + '</span></div>' +
      '</div>';
      if (!poolOk()) { blocked = true; html += '<p class="ss-pool-count warn">Not enough players for this league size. Go back and add conferences or make the league smaller.</p>'; }
      html += '<p class="tut-code-hint">In the lab, the other teams are bots and games are simulated from real 2025–26 averages.</p>';
    }
    var last = ui.wiz === total - 1;
    return '<div class="tut-overlay ss-wiz" style="display:flex;">' +
      '<div class="tut-card">' +
        '<div class="tut-header"><div class="tut-bar-track"><div class="tut-bar-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="tut-step-label">' + (ui.wiz + 1) + ' / ' + total + '</span></div>' +
        '<div class="tut-body">' + html + '</div>' +
        '<div class="tut-footer">' +
          '<button class="tut-back-btn" data-act="wizback">' + (ui.wiz === 0 ? 'Cancel' : 'Back') + '</button>' +
          '<button class="tut-next-btn" data-act="' + (last ? 'create' : 'wiznext') + '"' + (blocked ? ' disabled aria-disabled="true"' : '') + '>' + (last ? 'Start the Draft' : 'Continue') + '</button>' +
        '</div>' +
      '</div></div>';
  }

  function viewEmpty() {
    return '<div class="page-header"><h2>Regular Season</h2></div>' +
      '<div class="ss-empty-card"><p>Set up a league to get started.</p><button class="btn-primary" data-act="wizopen">Set up a league</button></div>';
  }

  // ── Home ────────────────────────────────────────────────
  function statusPill() {
    if (state.phase === 'draft') return '<span class="status-pill status-draft">Drafting</span>';
    if (state.phase === 'done') return '<span class="status-pill status-done">Complete</span>';
    if (isPlayoffWeek()) return '<span class="status-pill status-live">Playoffs</span>';
    return '<span class="status-pill status-live">Week ' + state.week + '</span>';
  }
  function statTile(icon, val, label, sub, extra) {
    return '<div class="stat-tile' + (extra || '') + '"><div class="st-icon st-icon-' + icon + '">' + TILE_ICON[icon] + '</div>' +
      '<div class="st-val' + (String(val).length > 6 ? ' st-val-sm' : '') + '">' + val + '</div><div class="st-label">' + label + '</div><div class="st-sub">' + sub + '</div></div>';
  }
  var TILE_ICON = {
    gold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    blue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    green: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    purple: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
  };
  function homeCard(page, color, label, sub) {
    var icon = page === 'lineup' ? ICON.lineup : page === 'matchup' ? ICON.matchup : page === 'players' ? ICON.players : appIcon(page === 'draft' ? 'players' : page);
    return '<div class="home-card" data-act="nav" data-page="' + page + '"><div class="hc-icon hc-' + color + '">' + icon + '</div>' +
      '<div class="hc-info"><div class="hc-label">' + label + '</div><div class="hc-sub">' + sub + '</div></div></div>';
  }
  function myRank() {
    var st = standings();
    for (var i = 0; i < st.length; i++) if (st[i].isUser) return { rank: i + 1, row: st[i] };
    return { rank: 1, row: st[0] };
  }

  function viewHome() {
    var u = userTeam(), out = '<div class="page-header"><h2>' + esc(state.league.name) + '</h2>' + statusPill() + '</div>';
    if (state.phase === 'draft') {
      var d = state.draft, dc = draftCfg(), n = state.league.numTeams;
      if (dc.status === 'pre' && dc.scheduledAt) {
        out += '<div class="dcb" style="display:flex;"><div class="dcb-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>' +
          '<div class="dcb-text"><span class="dcb-label">Draft starts in <strong data-ss-countdown="1">' + countdownText(dc.scheduledAt) + '</strong></span><span class="dcb-time">' + fmtWhen(dc.scheduledAt) + '</span></div></div>';
      }
      var round = Math.floor(d.pick / n) + 1, inRound = (d.pick % n) + 1;
      var clock = team(onClock()), mine = clock.isUser;
      var away = 0; for (var i = d.pick; i < d.order.length; i++) { if (d.order[i] === u.id) break; away++; }
      out += '<div class="home-hero-card">' +
        '<div class="hero-bg-player"></div>' +
        '<div class="hero-left">' +
          '<div class="hero-label"><span>' + (dc.status === 'pre' ? 'Draft Room Open' : 'Round ' + round + ', Pick ' + inRound + (dc.status === 'paused' ? ' · Paused' : '')) + '</span></div>' +
          '<div class="hero-manager">' + (dc.status === 'pre' ? 'Ready to draft' : mine ? 'Your pick' : esc(clock.name)) + '</div>' +
          '<div class="hero-pick-label">' + (dc.status === 'pre' ? 'You pick ' + ordinal(dc.order.indexOf(u.id) + 1) + ' in round 1' : mine ? 'You’re on the clock' : 'You pick in ' + away) + '</div>' +
          '<div class="hero-timer-controls">' +
            (dc.status === 'pre' ? '<button class="btn-hero-primary" data-act="startdraft">Start Draft</button><button class="btn-hero-ghost" data-act="nav" data-page="draft">Draft Room</button>' :
             dc.status === 'paused' ? '<button class="btn-hero-primary" data-act="resumedraft">Resume</button><button class="btn-hero-ghost" data-act="nav" data-page="draft">Draft Room</button>' :
             '<button class="btn-hero-primary" data-act="nav" data-page="draft">' + (mine ? 'Make Pick' : 'Draft Room') + '</button><button class="btn-hero-ghost" data-act="pausedraft">Pause</button>') +
          '</div>' +
        '</div>' +
        '<div class="hero-clock-wrap"><svg class="hero-ring" viewBox="0 0 160 160"><circle class="hero-ring-bg" cx="80" cy="80" r="70"/>' +
          '<circle class="hero-ring-progress" data-ss-ring="1" cx="80" cy="80" r="70" style="stroke-dashoffset:' + (439.82 * (1 - Math.max(0, Math.min(1, timeLeft() / dc.timerSecs)))) + '"/></svg>' +
          '<div class="hero-clock-inner"><div class="hero-timer" data-ss-clock="1">' + fmtClock(timeLeft()) + '</div><div class="hero-timer-label">' + (dc.status === 'pre' ? 'PER PICK' : dc.status === 'paused' ? 'PAUSED' : 'TIME REMAINING') + '</div></div></div>' +
      '</div>';
      var g = 0, f = 0; u.roster.forEach(function (id) { if (P(id).pos === 'G') g++; else f++; });
      out += '<div class="home-stats-grid">' +
        statTile('gold', state.league.numTeams, 'Teams', state.league.playoffWeeks ? regWeeks() + ' weeks + playoffs' : state.league.weeks + '-week season') +
        statTile('blue', u.roster.length + '/' + state.league.rosterSize, 'My Roster', g + ' guards, ' + f + ' forwards') +
        statTile('green', state.league.rosterSize - u.roster.length, 'Picks Left', state.league.rosterSize + ' rounds') +
        statTile('purple', '5', 'Starters', 'G, G, F, F, UTIL', ' stat-tile-leader') +
      '</div>';
      out += '<h3 class="section-title" style="margin-bottom:10px;">Quick Actions</h3><div class="home-grid">' +
        homeCard('draft', 'blue', 'Draft', 'Draft room & player pool') +
        homeCard('teams', 'purple', 'Teams', 'Every roster so far') +
        homeCard('standings', 'orange', 'Standings', 'Starts after the draft') +
      '</div>';
      out += activity();
      return out;
    }
    var oppId = opponentOf(u.id), opp = oppId ? team(oppId) : null;
    var my = teamScore(u.id), their = opp ? teamScore(oppId) : 0;
    var over = state.day > 6, mr = myRank();
    var dec = slotsOf(u.id).filter(function (s) { return s.pending && !s.locked; }).length;
    var locked = slotsOf(u.id).filter(function (s) { return s.locked; }).length;
    var kind = matchKind(state.week, myGameIndex());
    var nextLbl = state.week >= state.league.weeks ? 'Finish Season' : state.week + 1 > regWeeks() ? 'Start ' + weekLabel(state.week + 1) : 'Start Week ' + (state.week + 1);
    var ctrl = state.phase === 'done' ? '<button class="btn-hero-primary" data-act="nav" data-page="standings">Final Standings</button>' :
      '<button class="btn-hero-primary" data-act="nav" data-page="matchup">View Matchup</button>' +
      '<button class="btn-hero-ghost" data-act="nav" data-page="lineup">Set Lineup</button>';
    out += '<div class="home-hero-card ss-hero-matchup">' +
      '<div class="hero-bg-player"></div>' +
      '<div class="hero-left">' +
        '<div class="hero-label"><span>' + (state.phase === 'done' && state.champion ? 'Champion: ' + esc(team(state.champion).name) : (KIND_LABEL(kind) || 'Week ' + state.week + ' Matchup') + (over ? ', Final' : '')) + '</span></div>' +
        '<div class="hero-manager">' + (opp ? 'vs ' + esc(opp.name) : 'Bye week') + '</div>' +
        '<div class="ss-hero-score"><span class="' + (my >= their ? 'lead' : '') + '">' + f1(my) + '</span><i>–</i><span class="' + (their > my ? 'lead' : '') + '">' + f1(their) + '</span></div>' +
        '<div class="hero-timer-controls">' + ctrl + '</div>' +
      '</div>' +
      '<div class="hero-clock-wrap"><div class="hero-clock-inner"><div class="hero-timer">' + (state.phase === 'done' ? 'END' : over ? 'FINAL' : DAYS[state.day].toUpperCase()) + '</div>' +
        '<div class="hero-timer-label">' + (state.phase === 'done' || over ? weekLabel().toUpperCase() : weekDates(state.week).toUpperCase()) + '</div></div></div>' +
    '</div>';
    out += '<div class="home-stats-grid">' +
      statTile('gold', '#' + mr.rank, 'My Rank', 'of ' + state.league.numTeams + ' teams') +
      statTile('blue', mr.row.w + '–' + mr.row.l + (mr.row.t ? '–' + mr.row.t : ''), 'Record', mr.row.pf ? f1(mr.row.pf) + ' points for' : 'No games final yet') +
      statTile('green', locked + '/5', 'Locked In', 'Starters final this week') +
      statTile('purple', dec, 'To Decide', dec ? 'Lock or pass now' : 'Nothing waiting', dec ? ' stat-tile-leader' : '') +
    '</div>';
    var inbox = tradeInbox();
    if (inbox) out += '<div class="ss-inj-banner ss-tr-banner" data-act="trgo"><b>' + inbox + ' trade ' + (inbox > 1 ? 'offers need' : 'offer needs') + ' your answer.</b> Open Trades ›</div>';
        out += '<h3 class="section-title" style="margin-bottom:10px;">Quick Actions</h3><div class="home-grid">' +
      homeCard('lineup', 'blue', 'Lineup', dec ? dec + ' lock decision' + (dec > 1 ? 's' : '') + ' waiting' : 'Starters, bench and lock-ins') +
      homeCard('matchup', 'orange', 'Matchups', opp ? 'You vs ' + esc(opp.name) : 'Bye week') +
      homeCard('players', 'pink', 'Players', 'Free agents and waivers') +
      homeCard('standings', 'purple', 'Standings', 'Record and points for every team') +
      homeCard('teams', 'teal', 'Teams', 'Every roster in the league') +
    '</div>';
    out += activity();
    return out;
  }

  // ── Live pill + league ticker (glass, desktop top bar) ──
  function livePill() {
    if (!state || state.phase === 'draft') return draftLive() ? '<span class="ss-live">Draft live</span>' : '';
    if (state.phase === 'done') return '<span class="ss-live off">Final</span>';
    if (isLiveWeek()) return '<span class="ss-live">Live · ' + DAYS[state.day] + '</span>';
    return '<span class="ss-live off">' + (state.day > 6 ? 'Week final' : 'Tips ' + DAYS[0]) + '</span>';
  }
  function tickerName(n) { return n.length > 14 ? n.split(' ').map(function (w) { return w.charAt(0); }).join('').toUpperCase() : n; }
  function ticker() {
    if (!state || state.phase !== 'season') return '';
    var games = state.schedule[state.week - 1] || [], u = userTeam().id;
    if (!games.length) return '';
    var items = games.map(function (m, i) {
      var a = teamScore(m[0]), b = teamScore(m[1]), mine = m[0] === u || m[1] === u;
      return '<button class="ss-tk' + (mine ? ' mine' : '') + '" data-act="tkgo" data-i="' + i + '">' +
        '<span class="' + (a >= b ? 'w' : '') + '">' + esc(tickerName(team(m[0]).name)) + ' <b>' + f1(a) + '</b></span>' +
        '<i></i><span class="' + (b > a ? 'w' : '') + '"><b>' + f1(b) + '</b> ' + esc(tickerName(team(m[1]).name)) + '</span></button>';
    }).join('');
    return '<div class="ss-ticker" aria-label="League scores"><span class="ss-tk-lbl">' + weekLabel() + '</span><div class="ss-tk-vp"><div class="ss-tk-run">' + items + '<span class="ss-tk-gap" aria-hidden="true"></span>' + items.replace(/<button /g, '<button tabindex="-1" aria-hidden="true" ') + '</div></div></div>';
  }

  // ── Glass draft home ────────────────────────────────────
  function viewHomeGlassDraft() {
    var u = userTeam(), d = state.draft, dc = draftCfg(), n = state.league.numTeams;
    var total = d.order.length, round = Math.floor(d.pick / n) + 1, inRound = (d.pick % n) + 1;
    var clock = team(onClock()), mine = clock.isUser && dc.status !== 'pre';
    var away = 0; for (var i = d.pick; i < d.order.length; i++) { if (d.order[i] === u.id) break; away++; }
    var first = sessionName() === 'You' ? '' : ', ' + esc(sessionName().split(' ')[0]);
    var title = dc.status === 'pre' ? 'Draft day' + first : mine ? 'You’re on the clock' : esc(clock.name) + ' is picking';
    var pickPct = Math.round(d.pick / total * 100), rosterPct = Math.round(u.roster.length / state.league.rosterSize * 100);
    var qn = dc.queue.filter(function (id) { return !drafted()[id]; }).length;
    var head = '<div class="g-hero"><div class="g-hero-l"><h1>' + title + '</h1><div class="g-bars">' +
        '<div class="g-bar dark"><span style="width:' + Math.max(10, pickPct) + '%"></span><em>' + (dc.status === 'pre' ? 'Not started' : 'Round ' + round + ', pick ' + inRound) + '</em></div>' +
        '<div class="g-bar gold"><span style="width:' + Math.max(8, rosterPct) + '%"></span><em>' + u.roster.length + '/' + state.league.rosterSize + ' drafted</em></div>' +
        '<div class="g-bar light"><span style="width:' + Math.min(100, qn * 10) + '%"></span><em>' + qn + ' in queue</em></div>' +
      '</div></div>' +
      '<div class="g-hero-r"><div><b>' + n + '</b><span>Teams</span></div><div><b>' + ordinal(dc.order.indexOf(u.id) + 1) + '</b><span>Your slot</span></div><div class="dim"><b>' + (dc.status === 'pre' ? total : total - d.pick) + '</b><span>Picks left</span></div></div></div>';

    var ctrl = dc.status === 'pre' ? '<button class="g-btn solid" data-act="startdraft">Start Draft</button><button class="g-btn" data-act="nav" data-page="draft">Draft Room</button>' :
      dc.status === 'paused' ? '<button class="g-btn solid" data-act="resumedraft">Resume</button><button class="g-btn" data-act="nav" data-page="draft">Draft Room</button>' :
      '<button class="g-btn solid" data-act="nav" data-page="draft">' + (mine ? 'Make Pick' : 'Draft Room') + '</button><button class="g-btn" data-act="pausedraft">Pause</button>';
    if (dc.status === 'pre') ctrl += '<button class="g-btn" data-act="invite">Invite Friends</button>';
    var frac = Math.max(0, Math.min(1, timeLeft() / dc.timerSecs));
    var countdown = dc.status === 'pre' && dc.scheduledAt ? '<p class="g-note">Starts in <b data-ss-countdown="1">' + countdownText(dc.scheduledAt) + '</b> · ' + fmtWhen(dc.scheduledAt) + '</p>' : '';
    var clockCard = gCard('g-clock' + (mine ? ' hot' : ''), dc.status === 'pre' ? 'Pick Timer' : 'On the Clock', '<span class="g-pill">' + (dc.status === 'live' ? 'Live' : dc.status === 'paused' ? 'Paused' : 'Pre-draft') + '</span>',
      '<div class="g-clockwrap"><svg viewBox="0 0 160 160" aria-hidden="true"><circle class="g-ck-bg" cx="80" cy="80" r="70"/><circle class="g-ck-fg" data-ss-ring="1" cx="80" cy="80" r="70" style="stroke-dashoffset:' + (439.82 * (1 - frac)) + '"/></svg>' +
        '<div class="g-ck-in"><b data-ss-clock="1">' + fmtClock(timeLeft()) + '</b><span>' + (dc.status === 'pre' ? 'per pick' : esc(clock.isUser ? 'You' : clock.name)) + '</span></div></div>' +
      countdown + '<div class="g-ctrl center">' + ctrl + '</div>');

    var upcoming = [];
    for (var k = d.pick; k < Math.min(total, d.pick + 10); k++) upcoming.push(k);
    var orderCard = gCard('g-span2 g-order', 'Up Next', '<span class="g-pill">' + (dc.status === 'pre' ? 'You pick ' + ordinal(dc.order.indexOf(u.id) + 1) : mine ? 'Your pick' : 'You pick in ' + away) + '</span>',
      '<div class="g-ochips">' + upcoming.map(function (k, j) {
        var t = team(d.order[k]);
        return '<div class="g-ochip' + (j === 0 && dc.status !== 'pre' ? ' now' : '') + (t.isUser ? ' me' : '') + '"><em>R' + (Math.floor(k / n) + 1) + '.' + ((k % n) + 1) + '</em>' + avatarHTML(t.name, 30) + '<span>' + esc(t.isUser ? 'You' : t.name) + '</span></div>';
      }).join('') + '</div>');

    var best = available().slice().sort(function (a, b) { return b.proj - a.proj; }).slice(0, 7);
    var q = {}; dc.queue.forEach(function (id) { q[id] = true; });
    var bestCard = gCard('g-tall g-stand', 'Best Available', gArrow('draft'),
      '<div class="g-inner">' + best.map(function (p, i) {
        return '<div class="g-srow"><span class="n">' + (i + 1) + '</span>' + logoHTML(p.college, 24) + '<span class="t" data-act="pcard" data-id="' + p.id + '">' + esc(shortName(p.name)) + ' <em class="g-pos">' + p.pos + '</em></span><b>' + f1(p.proj) + '</b>' +
          '<button class="g-star' + (q[p.id] ? ' on' : '') + '" data-act="queue" data-id="' + p.id + '" aria-label="Queue">★</button></div>';
      }).join('') + '</div><p class="g-note">Projected fantasy points per game. ★ adds to your queue.</p>');

    var g = 0, f = 0; u.roster.forEach(function (id) { if (P(id).pos === 'G') g++; else f++; });
    var rosterCard = gCard('g-span2 g-roster', 'Your Roster', '<span class="g-pill">' + g + ' G · ' + f + ' F/C</span>',
      u.roster.length ? '<div class="g-rgrid">' + u.roster.map(function (id) {
        var p = P(id);
        return '<div class="g-rp" data-act="pcard" data-id="' + p.id + '">' + logoHTML(p.college, 28) + '<div><b>' + esc(shortName(p.name)) + '</b><span>' + p.pos + ' · ' + esc(p.college) + '</span></div><em>' + f1(p.proj) + '</em></div>';
      }).join('') + '</div>' : '<p class="g-note">Nobody yet. You need at least 2 guards and 2 forwards to fill your starters.</p>');

    var recent = d.log.slice(-5).reverse();
    var recentCard = gCard('g-recent', 'Recent Picks', '',
      recent.length ? '<div class="g-list">' + recent.map(function (l) {
        return '<div class="g-row"><span>' + esc(shortName(P(l.playerId).name)) + ' <em>' + esc(team(l.teamId).isUser ? 'You' : team(l.teamId).name) + '</em></span><em>#' + (l.pick + 1) + '</em></div>';
      }).join('') + '</div>' : '<p class="g-note">Picks show up here as they happen.</p>');

    return head + '<div class="g-grid">' + clockCard + orderCard + bestCard + rosterCard + recentCard + '</div>';
  }

  // ── Glass matchup scoreboard ────────────────────────────
  function gScoreboard(L, R, a, b, ls, rs, isMine, cur) {
    var share = ls + rs ? Math.round(ls / (ls + rs) * 100) : 50;
    var kind = KIND_LABEL(matchKind(state.week, cur));
    var rows = a.map(function (s, i) {
      var x = slotScore(s).v, y = slotScore(b[i]).v, mx = Math.max(x, y, 1);
      var tag = function (sl) { return sl.locked ? ' lk' : sl.pending ? ' pd' : ''; };
      return '<div class="g-cmp"><span class="g-cmp-n">' + (s.playerId ? esc(shortName(P(s.playerId).name)) : '—') + '</span>' +
        '<div class="g-cmp-bar l"><span class="' + tag(s) + (x >= y ? ' win' : '') + '" style="width:' + Math.round(x / mx * 100) + '%"></span></div>' +
        '<b class="g-cmp-v' + tag(s) + '">' + f1(x) + '</b><span class="g-cmp-k">' + (s.slot === 'UTIL' ? 'U' : s.slot) + '</span><b class="g-cmp-v r' + tag(b[i]) + '">' + f1(y) + '</b>' +
        '<div class="g-cmp-bar r"><span class="' + tag(b[i]) + (y > x ? ' win' : '') + '" style="width:' + Math.round(y / mx * 100) + '%"></span></div>' +
        '<span class="g-cmp-n r">' + (b[i].playerId ? esc(shortName(P(b[i].playerId).name)) : '—') + '</span></div>';
    }).join('');
    return '<section class="g-card g-board">' +
      '<div class="g-head"><h3>' + (kind || weekLabel()) + ' <small>' + weekDates(state.week) + '</small></h3>' + (isLiveWeek() ? '<span class="ss-live">Live</span>' : '<span class="g-pill">' + (state.day > 6 ? 'Final' : 'Upcoming') + '</span>') + '</div>' +
      '<div class="g-score big"><div class="' + (ls >= rs ? 'lead' : '') + '"><span>' + avatarHTML(L.name, 26) + esc(L.name) + ' · ' + recordOf(L.id) + '</span>' + cu('sbL' + cur, ls) + '</div>' +
        '<div class="g-vs">vs</div>' +
        '<div class="r ' + (rs > ls ? 'lead' : '') + '"><span>' + recordOf(R.id) + ' · ' + esc(R.name) + avatarHTML(R.name, 26) + '</span>' + cu('sbR' + cur, rs) + '</div></div>' +
      '<div class="g-share"><span style="width:' + share + '%"></span></div>' +
      '<div class="g-cmps">' + rows + '</div>' +
      (isMine ? weekBar() : '') +
    '</section>';
  }

  // ── Glass home: a bento dashboard of the season ─────────
  function gCard(cls, title, right, body) {
    return '<section class="g-card ' + cls + '">' + (title ? '<div class="g-head"><h3>' + title + '</h3>' + (right || '') + '</div>' : '') + body + '</section>';
  }
  function gArrow(page) { return '<button class="g-arrow" data-act="nav" data-page="' + page + '" aria-label="Open">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg></button>'; }
  function viewHomeGlass() {
    var u = userTeam(), oppId = opponentOf(u.id), opp = oppId ? team(oppId) : null;
    var my = teamScore(u.id), their = opp ? teamScore(oppId) : 0, over = state.day > 6;
    var mr = myRank(), slots = slotsOf(u.id);
    var locked = slots.filter(function (s) { return s.locked; }).length;
    var dec = slots.filter(function (s) { return s.pending && !s.locked; });
    var dayPct = Math.round(Math.min(7, state.day) / 7 * 100), lockPct = Math.round(locked / 5 * 100);
    var share = my + their ? Math.round(my / (my + their) * 100) : 50;
    var first = sessionName() === 'You' ? '' : ', ' + esc(sessionName().split(' ')[0]);
    var kind = KIND_LABEL(matchKind(state.week, myGameIndex()));

    var head = '<div class="g-hero">' +
      '<div class="g-hero-l"><h1>' + (state.phase === 'done' ? 'Season complete' + first : 'Welcome back' + first) + '</h1>' +
        '<div class="g-bars">' +
          '<div class="g-bar dark"><span style="width:' + dayPct + '%"></span><em>' + (over ? 'Week final' : DAYS_FULL[state.day]) + '</em></div>' +
          '<div class="g-bar gold"><span style="width:' + Math.max(8, lockPct) + '%"></span><em>' + locked + '/5 locked</em></div>' +
          '<div class="g-bar light"><span style="width:' + share + '%"></span><em>' + share + '% of points</em></div>' +
        '</div></div>' +
      '<div class="g-hero-r"><div><b>' + mr.row.w + '–' + mr.row.l + '</b><span>Record</span></div><div><b>#' + mr.rank + '</b><span>Rank</span></div><div class="dim"><b>' + Math.round(mr.row.pf) + '</b><span>Points for</span></div></div>' +
    '</div>';

    var ctrl = state.phase === 'done' ? '<button class="g-btn solid" data-act="nav" data-page="standings">Final Standings</button>' :
      '<button class="g-btn solid" data-act="nav" data-page="matchup">' + (dec.length ? 'Decide ' + dec.length + ' lock' + (dec.length > 1 ? 's' : '') : 'View Matchup') + '</button>' +
      '<button class="g-btn" data-act="nav" data-page="lineup">Set Lineup</button><span class="ss-wk-status">' + weekStatus() + '</span>';
    var dots = slots.map(function (s, si) {
      var c = (s.locked ? 'lk' : s.pending ? 'pd' : slotScore(s).kind === 'live' ? 'lv' : '') + (ui.stamp === si ? ' stamp' : '');
      return '<span class="g-dot ' + c + '" title="' + s.slot + '"><i>' + (s.slot === 'UTIL' ? 'U' : s.slot) + '</i>' + (s.locked ? f1(s.locked.fpts) : slotScore(s).kind === 'live' ? f1(slotScore(s).v) : '–') + '</span>';
    }).join('');
    var matchCard = gCard('g-span2 g-match', (kind || 'Week ' + state.week) + ' <small>' + weekDates(state.week) + '</small>', gArrow('matchup'),
        '<div class="g-score"><div class="' + (my >= their ? 'lead' : '') + '"><span>' + esc(u.name) + '</span>' + cu('hmY', my) + '</div>' +
        '<div class="g-vs">' + (isLiveWeek() ? '<span class="ss-live sm">Live</span>' : 'vs') + '</div>' +
        '<div class="r ' + (their > my ? 'lead' : '') + '"><span>' + (opp ? esc(opp.name) : 'Bye') + '</span>' + cu('hmO', their) + '</div></div>' +
      '<div class="g-share"><span style="width:' + share + '%"></span></div>' +
      '<div class="g-dots">' + dots + '</div>' +
      '<div class="g-ctrl">' + ctrl + '</div>');

    var ringPct = dec.length ? 100 : Math.round(locked / 5 * 100);
    var lockCard = gCard('g-lock', 'Lock-In', gArrow('matchup'),
      '<div class="g-ring' + (dec.length ? ' hot' : '') + (ui.stamp != null ? ' flash' : '') + '" style="--p:' + ringPct + '"><div><b>' + (dec.length ? dec.length : locked + '/5') + '</b><span>' + (dec.length ? 'to decide' : 'locked') + '</span></div></div>' +
      (dec.length ? '<div class="g-list">' + dec.slice(0, 3).map(function (s) {
        var i = slots.indexOf(s);
        return '<div class="g-row"><span>' + esc(shortName(P(s.pending.playerId).name)) + ' <em>' + f1(s.pending.fpts) + '</em></span><button class="g-chip-btn" data-act="lock" data-i="' + i + '">Lock</button></div>';
      }).join('') + '</div>' : '<p class="g-note">' + (locked === 5 ? 'Every starter is locked in.' : 'Nothing waiting. Scores appear after games.') + '</p>'));

    var st = standings();
    var standCard = gCard('g-tall g-stand', 'Standings', gArrow('standings'),
      '<div class="g-inner">' + st.map(function (r, i) {
        return '<div class="g-srow' + (r.isUser ? ' me' : '') + (state.league.playoffWeeks && i === 3 ? ' cut' : '') + '"><span class="n">' + (i + 1) + '</span>' + avatarHTML(r.name, 22) + '<span class="t">' + esc(r.name) + '</span><b>' + r.w + '–' + r.l + '</b></div>';
      }).join('') + '</div>' + (state.league.playoffWeeks ? '<p class="g-note">Top 4 make the playoffs.</p>' : ''));

    var weekRows = DAYS.map(function (d, di) {
      var chips = slots.filter(function (s) { return s.playerId && gameOn(s.playerId, di); }).map(function (s) {
        var g = gameOn(s.playerId, di), played = di < state.day;
        return '<span class="g-ev' + (played ? ' done' : '') + (s.locked && s.locked.day === di && s.locked.playerId === s.playerId ? ' lk' : '') + '">' + esc(shortName(P(s.playerId).name)) + (played ? '<small>' + (g.dnp ? 'DNP' : f1(g.fpts)) + '</small>' : '') + '</span>';
      }).join('');
      return '<div class="g-day' + (di === state.day && !over ? ' now' : di < state.day ? ' past' : '') + '"><span class="g-dn">' + d + '</span><div class="g-evs">' + (chips || '<span class="g-none">–</span>') + '</div></div>';
    }).join('');
    var weekCard = gCard('g-span2 g-week', 'Your starters this week', '<span class="g-pill">' + weekLabel() + '</span>', '<div class="g-cal">' + weekRows + '</div>');

    var weeks = state.results.filter(function (r) { return (!r.kind || r.kind === 'reg') && (r.home === u.id || r.away === u.id); });
    var pts = weeks.map(function (r) { return r.home === u.id ? r.homePts : r.awayPts; });
    var wins = weeks.map(function (r) { var me = r.home === u.id; return (me ? r.homePts : r.awayPts) > (me ? r.awayPts : r.homePts); });
    var maxP = Math.max.apply(null, pts.concat([1]));
    var bars = pts.length ? pts.slice(-8).map(function (v, i, arr) {
      var w = wins.slice(-8)[i];
      return '<div class="g-col"><span class="' + (w ? 'w' : 'l') + '" style="height:' + Math.max(12, Math.round(v / maxP * 100)) + '%"></span><em>W' + (weeks.length - arr.length + i + 1) + '</em></div>';
    }).join('') : '<p class="g-note">Your weekly scores show up here after week 1.</p>';
    var avg = pts.length ? pts.reduce(function (a, b) { return a + b; }, 0) / pts.length : 0;
    var seasonCard = gCard('g-season', 'Season', '<span class="g-pill">' + (pts.length ? f1(avg) + ' avg' : '—') + '</span>',
      '<div class="g-big">' + cu('hmPF', mr.row.pf) + '<small>points for</small></div><div class="g-cols">' + bars + '</div>');

    var f = faCfg(), myClaims = f.claims.filter(function (c) { return c.teamId === u.id; }).length, offers = tradeInbox();
    var hurt = u.roster.filter(function (id) { return injuryOf(id); });
    var movesCard = gCard('g-moves', 'Roster Moves', gArrow('players'),
      '<div class="g-list">' +
        '<div class="g-row" data-act="nav" data-page="players"><span>' + (f.type === 'faab' ? 'FAAB left' : 'Waiver priority') + '</span><b>' + (f.type === 'faab' ? '$' + f.budgets[u.id] : '#' + (f.priority.indexOf(u.id) + 1)) + '</b></div>' +
        '<div class="g-row"><span>Pending claims</span><b>' + myClaims + '</b></div>' +
        '<div class="g-row' + (offers ? ' hot' : '') + '" data-act="trgo"><span>Trade offers</span><b>' + offers + '</b></div>' +
        '<div class="g-row"><span>Injured on roster</span><b' + (hurt.length ? ' class="bad"' : '') + '>' + hurt.length + '</b></div>' +
      '</div>' + (hurt.length ? '<div class="g-inj">' + hurt.slice(0, 3).map(function (id) { return '<span>' + esc(shortName(P(id).name)) + injTag(id) + '</span>'; }).join('') + '</div>' : ''));

    var feed = [];
    faCfg().tx.slice(0, 3).forEach(function (t) { feed.push({ msg: txText(t), sub: weekLabel(t.week || 1) }); });
    state.results.slice(-4).reverse().forEach(function (r) {
      var h = team(r.home), a = team(r.away), hw = r.homePts >= r.awayPts;
      feed.push({ msg: (hw ? h.name : a.name) + ' beat ' + (hw ? a.name : h.name) + ', ' + f1(Math.max(r.homePts, r.awayPts)) + '–' + f1(Math.min(r.homePts, r.awayPts)), sub: weekLabel(r.week) });
    });
    var actCard = gCard('g-span2 g-act', 'League Activity', '', feed.length ? '<div class="g-list">' + feed.slice(0, 6).map(function (x) { return '<div class="g-row"><span>' + esc(x.msg) + '</span><em>' + x.sub + '</em></div>'; }).join('') + '</div>' : '<p class="g-note">Results, adds, drops and trades show up here.</p>');

    var cm = chatList().msgs.slice(-3), unread = unreadChat();
    var chatCard = gCard('g-chat', 'League Chat' + (unread ? ' <span class="ss-badge">' + unread + '</span>' : ''), gArrow('chat'),
      cm.length ? '<div class="ch-mini">' + chatRows(cm) + '</div>' : '<p class="g-note">Nothing yet. Start the trash talk.</p>');
    return head + '<div class="g-grid">' + matchCard + lockCard + standCard + weekCard + seasonCard + movesCard + chatCard + actCard + '</div>';
  }

  function activity() {
    var items = [];
    if (state.phase === 'draft') {
      state.draft.log.slice(-8).reverse().forEach(function (l) {
        items.push({ icon: '🏀', cls: 'feed-draft', msg: team(l.teamId).name + ' drafted ' + P(l.playerId).name, sub: 'Pick ' + (l.pick + 1) });
      });
    } else {
      faCfg().tx.slice(0, 4).forEach(function (t) {
        items.push({ icon: t.type === 'drop' ? '−' : '+', cls: 'feed-draft', msg: txText(t), sub: weekLabel(t.week || 1) });
      });
      state.results.slice(-8).reverse().forEach(function (r) {
        var h = team(r.home), a = team(r.away), hw = r.homePts >= r.awayPts;
        items.push({ icon: '🏆', cls: 'feed-bracket', msg: (hw ? h.name : a.name) + ' beat ' + (hw ? a.name : h.name) + ', ' + f1(Math.max(r.homePts, r.awayPts)) + '–' + f1(Math.min(r.homePts, r.awayPts)), sub: 'Week ' + r.week });
      });
    }
    return '<div class="home-section"><h3 class="section-title">Activity</h3><div class="activity-feed">' +
      (items.length ? items.map(function (it) {
        return '<div class="feed-item ' + it.cls + '"><span class="feed-icon-badge">' + it.icon + '</span><div class="feed-body"><span class="feed-msg">' + esc(it.msg) + '</span><span class="feed-time">' + it.sub + '</span></div></div>';
      }).join('') : '<p class="feed-empty">No activity yet. Results show up here as weeks finish.</p>') +
    '</div></div>';
  }

  // ── Right panel ─────────────────────────────────────────
  function rightPanel() {
    var u = userTeam(), html = '<aside class="right-panel">';
    if (state.phase === 'draft') {
      var d = state.draft, n = state.league.numTeams, t = team(onClock());
      html += '<div class="rp-section"><div class="rp-section-title">Up Next</div>' +
        '<div class="rp-up-next-card">' + avatarHTML(t.name, 38) +
          '<div class="rp-un-info"><div class="rp-un-pre">Round ' + (Math.floor(d.pick / n) + 1) + ', Pick ' + ((d.pick % n) + 1) + '</div><div class="rp-un-name">' + esc(t.isUser ? 'You' : t.name) + '</div></div>' +
          '<div class="rp-un-timer"' + (draftCfg().status === 'pre' ? '>' + fmtClock(draftCfg().timerSecs) : ' data-ss-clock="1">' + fmtClock(timeLeft())) + '</div></div>' +
        '<button class="rp-view-all-btn" data-act="nav" data-page="draft">Open Draft Room</button></div>';
    } else {
      var oppId = opponentOf(u.id);
      html += '<div class="rp-section"><div class="rp-section-title">' + (KIND_LABEL(matchKind(state.week, myGameIndex())) || 'Week ' + state.week + ' Matchup') + '</div>' +
        rpScoreRow(u, teamScore(u.id), oppId && teamScore(u.id) >= teamScore(oppId)) +
        (oppId ? rpScoreRow(team(oppId), teamScore(oppId), teamScore(oppId) > teamScore(u.id)) : '') +
        '<button class="rp-view-all-btn" data-act="nav" data-page="matchup">Open Matchups</button></div>';
    }
    var st = standings(), mineIdx = 0;
    st.forEach(function (r, i) { if (r.isUser) mineIdx = i; });
    var show = st.slice(0, 4);
    if (mineIdx > 3) show.push(st[mineIdx]);
    html += '<div class="rp-section"><div class="rp-section-header"><span class="rp-section-title">Standings</span>' +
      '<button class="rp-link-btn" data-act="nav" data-page="standings">View All</button></div>' +
      show.map(function (r) {
        var rank = st.indexOf(r) + 1;
        return '<div class="rp-standing-row"><span class="rp-sr-rank">' + rank + '</span>' + avatarHTML(r.name, 26) +
          '<span class="rp-sr-name">' + esc(r.name) + (r.isUser ? '<span class="rp-you-badge">You</span>' : '') + '</span>' +
          '<span class="rp-sr-score">' + r.w + '–' + r.l + '</span></div>';
      }).join('') +
      '<button class="rp-view-all-btn" data-act="nav" data-page="standings">Full Standings</button></div>';
    if (state.phase === 'season') {
      var today = slotsOf(u.id).filter(function (s) { return s.playerId && gameOn(s.playerId, state.day); });
      html += '<div class="rp-section"><div class="rp-section-title">' + (state.day > 6 ? 'Week Final' : 'Your Starters ' + DAYS_FULL[state.day]) + '</div>' +
        (state.day > 6 ? '<div class="rp-empty">All games are in. Start the next week from Home.</div>' :
          today.length ? today.map(function (s) {
            var p = P(s.playerId);
            return '<div class="rp-standing-row">' + logoHTML(p.college, 26) + '<span class="rp-sr-name">' + esc(p.name) + '</span><span class="rp-sr-score ss-rp-slot">' + (s.slot === 'UTIL' ? 'UTL' : s.slot) + '</span></div>';
          }).join('') : '<div class="rp-empty">None of your unlocked starters play ' + DAYS_FULL[state.day] + '.</div>') +
        '<button class="rp-view-all-btn" data-act="nav" data-page="lineup">Open Lineup</button></div>';
    }
    return html + '</aside>';
  }
  function rpScoreRow(t, pts, lead) {
    return '<div class="rp-standing-row' + (lead ? ' ss-rp-lead' : '') + '">' + avatarHTML(t.name, 26) +
      '<span class="rp-sr-name">' + esc(t.name) + (t.isUser ? '<span class="rp-you-badge">You</span>' : '') + '</span>' +
      '<span class="rp-sr-score">' + f1(pts) + '</span></div>';
  }

  // ── Draft room ──────────────────────────────────────────
  function viewDraft() {
    var d = draftCfg(), n = state.league.numTeams;
    var round = Math.floor(d.pick / n) + 1, inRound = (d.pick % n) + 1;
    var clock = team(onClock()), mine = clock.isUser, u = userTeam();
    var away = 0; for (var i = d.pick; i < d.order.length; i++) { if (d.order[i] === u.id) break; away++; }
    var live = d.status === 'live', pre = d.status === 'pre', paused = d.status === 'paused';
    var canPick = mine && live;

    var nd = needs(u.id);
    var forcedG = nd.g + nd.f >= nd.left && nd.g > 0, forcedF = nd.g + nd.f >= nd.left && nd.f > 0;
    var req = '<span class="rr-label">' + esc(u.name) + '</span>' +
      '<span class="rr-chip' + (!nd.g ? ' rr-chip--met' : '') + (forcedG ? ' rr-chip--forced' : '') + '">Guards ' + (2 - nd.g) + '/2' + (!nd.g ? ' ✓' : '') + '</span>' +
      '<span class="rr-chip' + (!nd.f ? ' rr-chip--met' : '') + (forcedF ? ' rr-chip--forced' : '') + '">Forwards ' + (2 - nd.f) + '/2' + (!nd.f ? ' ✓' : '') + '</span>' +
      '<span class="rr-left">' + nd.left + ' pick' + (nd.left === 1 ? '' : 's') + ' left</span>' +
      (forcedG || forcedF ? '<span class="rr-warn">Must take ' + (forcedG ? 'a guard' : 'a forward or center') + '</span>' : '');

    var list = available().filter(function (p) {
      if (ui.filterPos && p.pos !== ui.filterPos) return false;
      if (ui.filterConf && p.conf !== ui.filterConf) return false;
      if (ui.search && (p.name + ' ' + p.college).toLowerCase().indexOf(ui.search.toLowerCase()) < 0) return false;
      return true;
    }).slice(0, 80);
    var q = d.queue;
    var rows = list.map(function (p, k) {
      var qPos = q.indexOf(p.id) + 1;
      var locked = !pickAllowed(u.id, p.id).ok;
      return '<div class="pool-row' + (locked ? ' pool-row--locked' : '') + '" data-pid="' + p.id + '">' +
        '<span class="pool-rank">' + (k + 1) + '</span>' +
        '<div class="pool-player-cell">' + logoHTML(p.college, 26) +
          '<div class="pool-player-info" data-act="pcard" data-id="' + p.id + '"><div class="pool-player-name">' + esc(p.name) + injTag(p.id) + (qPos ? '<span class="q-chip">Q' + qPos + '</span>' : '') + (p.fresh ? '<span class="q-chip ss-fr-chip">FR</span>' : '') + '</div>' +
          '<div class="pool-player-college">' + esc(p.college) + (p.conf && p.conf !== 'Other' ? ' · ' + esc(p.conf) : '') + '</div></div>' +
          '<button class="q-star' + (qPos ? ' q-star--on' : '') + '" data-act="queue" data-id="' + p.id + '" aria-label="' + (qPos ? 'Remove from queue' : 'Add to queue') + '" title="' + (qPos ? 'Remove from queue' : 'Add to queue') + '">&#9733;</button>' +
        '</div>' +
        '<span class="pool-seed-cell"><span class="pos-badge">' + p.pos + '</span></span>' +
        '<span class="pool-stat">' + f1(p.avg.points) + '</span>' +
        '<span class="pool-stat">' + f1(p.avg.rebounds) + '</span>' +
        '<span class="pool-stat">' + f1(p.avg.assists) + '</span>' +
        '<span class="pool-stat">' + f1(p.avg.steals) + '</span>' +
        '<span class="pool-stat">' + f1(p.avg.blocks) + '</span>' +
        '<span class="pool-fpts">' + f1(p.proj) + '</span>' +
        '<span class="pool-action">' + (canPick ? '<button class="pick-btn" data-act="pick" data-id="' + p.id + '">Pick ›</button>' : '<span class="ss-wait">–</span>') + '</span>' +
      '</div>';
    }).join('') || '<div style="padding:20px;color:var(--muted);text-align:center;">No players found.</div>';

    var queueRows = q.length ? q.map(function (pid, i) {
      var p = P(pid); if (!p) return '';
      var gone = drafted()[pid];
      return '<div class="q-row' + (gone || !pickAllowed(u.id, pid).ok ? ' q-row--locked' : '') + '">' +
        '<span class="q-rank">' + (i + 1) + '</span>' +
        '<div class="q-info" data-act="pcard" data-id="' + pid + '"><span class="q-name">' + esc(p.name) + '</span><span class="q-meta">' + p.pos + ' · ' + esc(p.college) + (gone ? ' · Drafted' : '') + '</span></div>' +
        '<div class="q-actions">' +
          '<button class="q-btn" data-act="qmove" data-id="' + pid + '" data-dir="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>&#9650;</button>' +
          '<button class="q-btn" data-act="qmove" data-id="' + pid + '" data-dir="1" aria-label="Move down"' + (i === q.length - 1 ? ' disabled' : '') + '>&#9660;</button>' +
          '<button class="q-btn q-btn--x" data-act="queue" data-id="' + pid + '" aria-label="Remove from queue">&times;</button>' +
        '</div></div>';
    }).join('') : '<p class="queue-empty">Star players to build a shortlist. If your clock runs out, the top of your queue is picked instead of whoever the app thinks is best.</p>';

    // ── Glass draft room ──
    var frac = Math.max(0, Math.min(1, timeLeft() / d.timerSecs));
    var title = pre ? 'Draft room is open' : paused ? 'Draft paused' : canPick ? 'You’re on the clock' : esc(clock.name) + ' is picking';
    var sub = pre ? n + ' teams · ' + state.league.rosterSize + ' rounds · ' + fmtClock(d.timerSecs) + ' per pick · you pick ' + ordinal(d.order.indexOf(u.id) + 1) :
      'Round ' + round + ' of ' + state.league.rosterSize + ', pick ' + inRound + (!mine && away > 0 ? ' · you pick in ' + away : '');
    var deck = [];
    for (var k = d.pick; k < Math.min(d.order.length, d.pick + 8); k++) deck.push(k);
    var deckHtml = '<div class="dg-deck">' + deck.map(function (k, j) {
      var t = team(d.order[k]);
      return '<div class="dg-dk' + (j === 0 && !pre ? ' now' : '') + (t.isUser ? ' me' : '') + '"><em>R' + (Math.floor(k / n) + 1) + '.' + ((k % n) + 1) + '</em>' + avatarHTML(t.name, 26) + '<span>' + esc(t.isUser ? 'You' : t.name) + '</span></div>';
    }).join('') + '</div>';
    var ctrls = (pre ? '<button class="g-btn solid" data-act="startdraft">Start Draft</button>' :
        paused ? '<button class="g-btn solid" data-act="resumedraft">Resume</button>' :
        (canPick ? '<button class="g-btn solid" data-act="autopick">Autopick</button>' : '') + '<button class="g-btn" data-act="pausedraft">Pause</button>') +
      (!pre && devMode() ? '<button class="g-btn ghost" data-act="simdraft"' + (mine ? ' disabled' : '') + ' title="Dev: jump past bot picks">Skip to my pick</button>' : '');
    var hero = '<section class="g-card dg-hero' + (canPick ? ' hot' : '') + '">' +
      '<div class="dg-hl"><div class="dg-kick">' + (pre ? 'Snake draft' : canPick ? '<span class="ss-live sm">Your pick</span>' : '<span class="ss-live sm' + (paused ? ' off' : '') + '">' + (paused ? 'Paused' : 'Live') + '</span>') + '</div>' +
        '<h1>' + title + '</h1><p>' + sub + '</p><div class="g-ctrl">' + ctrls + '</div></div>' +
      '<div class="dg-clock' + (canPick ? ' hot' : '') + '"><svg viewBox="0 0 160 160" aria-hidden="true"><circle class="g-ck-bg" cx="80" cy="80" r="70"/><circle class="g-ck-fg" data-ss-ring="1" cx="80" cy="80" r="70" style="stroke-dashoffset:' + (439.82 * (1 - (pre ? 1 : frac))) + '"/></svg>' +
        '<div class="g-ck-in"><b' + (pre ? '' : ' data-ss-clock="1"') + '>' + fmtClock(pre ? d.timerSecs : timeLeft()) + '</b><span>' + (pre ? 'per pick' : esc(mine ? 'You' : clock.name)) + '</span></div></div>' +
      '<div class="dg-deckwrap"><div class="dg-lbl">Up next</div>' + deckHtml + '</div>' +
    '</section>';

    var pool = '<section class="g-card dg-pool"><div class="g-head"><h3>Player Pool <small>' + available().length + ' available</small></h3></div>' +
      '<div class="roster-req-bar dg-req">' + req + '</div>' +
      '<div class="draft-toolbar">' +
        '<input type="text" id="ssSearch" placeholder="Search players or schools…" class="pool-search" value="' + esc(ui.search) + '" />' +
        confSelect() +
        '<select id="ssPos" class="pool-select">' + [['', 'All Positions'], ['G', 'Guards'], ['F', 'Forwards'], ['C', 'Centers']].map(function (o) {
          return '<option value="' + o[0] + '"' + (ui.filterPos === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select>' +
      '</div>' +
      '<div class="pool-table-wrap dg-table"><div class="pool-header">' +
        '<span class="ph-rank">#</span><span class="ph-player">Player</span><span class="ph-seed">Pos</span>' +
        '<span class="ph-stat">PTS</span><span class="ph-stat">REB</span><span class="ph-stat">AST</span><span class="ph-stat">STL</span><span class="ph-stat">BLK</span>' +
        '<span class="ph-stat">FPTS</span><span class="ph-action">Action</span></div>' + rows + '</div>' +
      '<p class="dg-tip">Tap a name for his full card. ★ adds him to your queue.</p></section>';

    var queue = '<section class="g-card dg-queue queue-panel"><div class="g-head"><h3>Your Queue' + (q.length ? ' <small>' + q.length + '</small>' : '') + '</h3>' +
      (q.length ? '<button class="g-chip-btn ghost" data-act="qclear">Clear</button>' : '') + '</div>' + queueRows + '</section>';

    var slots = u.roster.map(function (id) { var pl = P(id); return '<div class="g-rp" data-act="pcard" data-id="' + id + '">' + logoHTML(pl.college, 26) + '<div><b>' + esc(shortName(pl.name)) + '</b><span>' + pl.pos + ' · ' + esc(pl.college) + '</span></div><em>' + f1(pl.proj) + '</em></div>'; }).join('');
    for (var e2 = u.roster.length; e2 < state.league.rosterSize; e2++) slots += '<div class="g-rp empty"><span>Round ' + (e2 + 1) + '</span></div>';
    var roster = '<section class="g-card dg-roster"><div class="g-head"><h3>My Roster <small>' + u.roster.length + '/' + state.league.rosterSize + '</small></h3></div><div class="dg-rlist">' + slots + '</div></section>';

    var recentCard = '<section class="g-card dg-recent"><div class="g-head"><h3>Recent Picks</h3></div><div class="g-list">' +
      (d.log.length ? d.log.slice(-6).reverse().map(function (l) {
        var pl = P(l.playerId), t = team(l.teamId);
        return '<div class="g-row"><span data-act="pcard" data-id="' + l.playerId + '">' + logoHTML(pl.college, 22) + ' ' + esc(shortName(pl.name)) + ' <em>' + esc(t.isUser ? 'You' : t.name) + '</em></span><em>#' + (l.pick + 1) + '</em></div>';
      }).join('') : '<p class="g-note">Picks show up here as they happen.</p>') + '</div></section>';

    return hero + '<div class="dg-body">' + pool + '<div class="dg-side">' + queue + roster + recentCard + '</div></div>' +
      '<p class="ss-lab-note dg-labnote">Open seats are filled by auto-pick.</p>' + confirmModal();
  }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function confirmModal() {
    if (!ui.confirmId || !draftLive() || !team(onClock()).isUser) { ui.confirmId = null; return ''; }
    var p = P(ui.confirmId);
    var stats = [[f1(p.avg.points), 'PTS'], [f1(p.avg.rebounds), 'REB'], [f1(p.avg.assists), 'AST'], [f1(p.avg.steals), 'STL'], [f1(p.avg.blocks), 'BLK'], [f1(p.proj), 'FPTS']];
    return '<div class="modal-backdrop ss-confirm" style="display:flex;" data-act="cancelpick"><div class="modal-card" role="dialog" aria-modal="true" aria-label="Confirm pick">' +
      '<div class="confirm-logo">' + logoHTML(p.college, 52) + '</div>' +
      '<h3>' + esc(p.name) + '</h3>' +
      '<p class="modal-sub">' + p.pos + ' · ' + esc(p.college) + (p.conf && p.conf !== 'Other' ? ' · ' + esc(p.conf) : '') + (p.fresh ? ' · No prior stats' : '') + '</p>' +
      '<div class="confirm-stats">' + stats.map(function (x) { return '<div class="cs-item"><div class="cs-val">' + x[0] + '</div><div class="cs-label">' + x[1] + '</div></div>'; }).join('') + '</div>' +
      '<p class="ss-confirm-clock">Clock: <b data-ss-clock="1">' + fmtClock(timeLeft()) + '</b></p>' +
      '<div class="modal-actions"><button class="btn-ghost" data-act="cancelpick">Cancel</button>' +
      '<button class="btn-primary draft-go" data-act="confirmpick">Confirm Pick ›</button></div>' +
    '</div></div>';
  }
  // Pick announcement (same card as the tournament draft).
  function announce(p, t, how) {
    var el = document.getElementById('ssPickAnnounce');
    if (!el) { el = document.createElement('div'); el.id = 'ssPickAnnounce'; el.className = 'pick-announce ss-pa'; document.body.appendChild(el); }
    el.innerHTML = '<div class="pa-card"><div class="pa-logo">' + logoHTML(p.college, 72) + '</div>' +
      '<div class="pa-player">' + esc(p.name) + '</div><div class="pa-college">' + esc(p.college) + '</div>' +
      '<div class="pa-pos"><span class="pos-badge">' + p.pos + '</span></div>' +
      '<div class="pa-by">' + (t.isUser ? (how === 'auto' ? 'Autopicked for you' : 'Drafted by You') : 'Drafted by ' + esc(t.name)) + '</div></div>';
    el.style.display = 'flex';
    clearTimeout(announce._t);
    announce._t = setTimeout(function () { el.style.display = 'none'; }, 1600);
  }
  // Update every clock on screen without a full re-render.
  function paintClock() {
    if (!root || state.phase !== 'draft') return;
    var left = timeLeft(), d = draftCfg();
    var urgent = d.status === 'live' && team(onClock()).isUser && left <= 10;
    root.querySelectorAll('[data-ss-clock]').forEach(function (el) {
      el.textContent = fmtClock(left);
      el.classList.toggle('urgency', urgent);
    });
    var ring = root.querySelector('[data-ss-ring]');
    if (ring) {
      ring.style.strokeDashoffset = String(439.82 * (1 - Math.max(0, Math.min(1, left / d.timerSecs))));
      ring.classList.toggle('urgency', urgent);
    }
    var mb = root.querySelector('.ss-mobile-bar .mcb-manager');
    if (mb) mb.textContent = mobileBarValue();
  }

  function confSelect() {
    var confs = {}; pool().forEach(function (p) { confs[p.conf] = 1; });
    var list = Object.keys(confs).sort();
    if (list.length < 2) return '';
    return '<select id="ssConf" class="pool-select"><option value="">All Conferences</option>' + list.map(function (c) {
      return '<option value="' + esc(c) + '"' + (ui.filterConf === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('') + '</select>';
  }

  // ── Players: free agents, waivers, claims, transactions ─
  function nextProcessing() {
    if (state.week >= state.league.weeks) return null;
    var st = state.league.start ? new Date(state.league.start[0], state.league.start[1], state.league.start[2]) : SEASON_START;
    var d = new Date(st.getTime() + state.week * 7 * 864e5);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function seasonAvg(pid) { var sp = seasonPoints(pid); return sp.gp ? sp.total / sp.gp : null; }
  function txText(t) {
    var who = team(t.teamId).isUser ? 'You' : team(t.teamId).name;
    if (t.type === 'drop') return who + ' dropped ' + P(t.drop).name;
    if (t.type === 'trade') {
      var oth = team(t.other).isUser ? 'you' : team(t.other).name;
      return who + ' traded ' + t.give.map(function (id) { return P(id).name; }).join(', ') + ' to ' + oth + ' for ' + t.get.map(function (id) { return P(id).name; }).join(', ');
    }
    var verb = t.type === 'waiver' ? ' claimed ' : ' added ';
    return who + verb + P(t.add).name + (t.type === 'waiver' && t.bid != null && faCfg().type === 'faab' ? ' ($' + t.bid + ')' : '') + (t.drop ? ', dropped ' + P(t.drop).name : '');
  }
  function viewPlayers() {
    var f = faCfg(), u = userTeam(), taken = rosteredBy();
    var tab = ui.ptab || 'fa';
    var myClaims = f.claims.filter(function (c) { return c.teamId === u.id; });
    var open = state.league.rosterSize - u.roster.length;
    var prioRank = f.priority.indexOf(u.id) + 1;
    var nextRun = nextProcessing();
    var head = '<div class="page-header"><h2>Players</h2><span class="muted-badge">' + (nextRun ? 'Waivers clear ' + nextRun : 'Season over') + '</span></div>';
    var tiles = '<div class="home-stats-grid ss-fa-tiles">' +
      statTile('gold', f.type === 'faab' ? '$' + f.budgets[u.id] : '#' + prioRank, f.type === 'faab' ? 'FAAB Left' : 'Waiver Priority', f.type === 'faab' ? 'of $' + f.budget + ' budget' : 'of ' + state.league.numTeams + ' teams') +
      statTile('blue', myClaims.length, 'Pending Claims', myClaims.length ? 'Run ' + (nextRun || '') : 'Nothing waiting') +
      statTile('green', open, 'Open Spots', u.roster.length + ' of ' + state.league.rosterSize + ' rostered') +
      statTile('purple', f.tx.filter(function (t) { return t.teamId === u.id; }).length, 'Your Moves', 'This season') +
    '</div>';
    var last = f.lastRun && f.lastRun.mine && f.lastRun.mine.length ? '<div class="ss-wv-result">' + f.lastRun.mine.map(function (m) {
      return '<span class="' + (m.won ? 'won' : 'lost') + '">' + (m.won ? 'Won ' : 'Lost ') + esc(P(m.add).name) + (m.bid != null && f.type === 'faab' ? ' ($' + m.bid + ')' : '') + '</span>';
    }).join('') + '<em>Last waiver run</em></div>' : '';
    var tabs = '<div class="draft-tabs-row"><div class="draft-inner-tabs">' +
      [['fa', 'Available'], ['claims', 'Claims' + (myClaims.length ? ' (' + myClaims.length + ')' : '')], ['trades', 'Trades' + (tradeInbox() ? ' (' + tradeInbox() + ')' : '')], ['inj', 'Injuries'], ['tx', 'Transactions']].map(function (t) {
        return '<button class="dit-btn' + (tab === t[0] ? ' active' : '') + '" data-act="ptab" data-v="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div></div>';
    var body;
    if (tab === 'claims') body = viewClaims(myClaims);
    else if (tab === 'tx') body = viewTx();
    else if (tab === 'trades') body = viewTrades();
    else if (tab === 'inj') body = viewInjuries();
    else {
      var list = pool().filter(function (p) {
        if (taken[p.id]) return false;
        var stt = f.waivers[p.id] ? 'waivers' : 'fa';
        if (ui.fstatus && ui.fstatus !== stt) return false;
        if (ui.filterPos && p.pos !== ui.filterPos) return false;
        if (ui.filterConf && p.conf !== ui.filterConf) return false;
        if (ui.search && (p.name + ' ' + p.college).toLowerCase().indexOf(ui.search.toLowerCase()) < 0) return false;
        return true;
      });
      var sortKey = ui.fsort || 'proj';
      list.sort(function (a, b) {
        if (sortKey === 'avg') return (seasonAvg(b.id) || 0) - (seasonAvg(a.id) || 0);
        if (sortKey === 'games') return remainingGames(b.id, state.phase === 'season' ? state.day : 0) - remainingGames(a.id, state.phase === 'season' ? state.day : 0) || b.proj - a.proj;
        return b.proj - a.proj;
      });
      var rows = list.slice(0, 80).map(function (p, k) {
        var w = !!f.waivers[p.id], claimed = myClaims.some(function (c) { return c.add === p.id; });
        var left = state.phase === 'season' ? remainingGames(p.id, state.day) : 0, avg = seasonAvg(p.id);
        return '<div class="pool-row ss-fa-row">' +
          '<span class="pool-rank">' + (k + 1) + '</span>' +
          '<div class="pool-player-cell">' + logoHTML(p.college, 26) +
            '<div class="pool-player-info" data-act="pcard" data-id="' + p.id + '"><div class="pool-player-name">' + esc(p.name) + injTag(p.id) + (p.fresh ? '<span class="q-chip ss-fr-chip">FR</span>' : '') + '</div>' +
            '<div class="pool-player-college">' + esc(p.college) + (p.conf && p.conf !== 'Other' ? ' · ' + esc(p.conf) : '') + '</div></div></div>' +
          '<span class="pool-seed-cell"><span class="pos-badge">' + p.pos + '</span></span>' +
          '<span class="pool-stat"><span class="ss-st-badge ' + (w ? 'w' : 'fa') + '">' + (w ? 'W' : 'FA') + '</span></span>' +
          '<span class="pool-stat" title="Games left this week">' + left + '</span>' +
          '<span class="pool-stat">' + f1(p.avg.points) + '</span>' +
          '<span class="pool-stat">' + f1(p.avg.rebounds) + '</span>' +
          '<span class="pool-stat">' + (avg == null ? '–' : f1(avg)) + '</span>' +
          '<span class="pool-fpts">' + f1(p.proj) + '</span>' +
          '<span class="pool-action">' + (claimed ? '<span class="ss-claimed">Claimed</span>' :
            '<button class="pick-btn ' + (w ? 'ss-claim-btn' : '') + '" data-act="faopen" data-id="' + p.id + '">' + (w ? 'Claim' : 'Add') + '</button>') + '</span>' +
        '</div>';
      }).join('') || '<div style="padding:20px;color:var(--muted);text-align:center;">No players match.</div>';
      body = '<div class="draft-toolbar">' +
          '<input type="text" id="ssSearch" placeholder="Search players…" class="pool-search" value="' + esc(ui.search) + '" />' +
          '<select id="ssFStatus" class="pool-select">' + [['', 'All Available'], ['fa', 'Free Agents'], ['waivers', 'On Waivers']].map(function (o) { return '<option value="' + o[0] + '"' + ((ui.fstatus || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          confSelect() +
          '<select id="ssPos" class="pool-select">' + [['', 'All Positions'], ['G', 'Guards'], ['F', 'Forwards'], ['C', 'Centers']].map(function (o) { return '<option value="' + o[0] + '"' + (ui.filterPos === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          '<select id="ssFSort" class="pool-select">' + [['proj', 'Sort: Projection'], ['avg', 'Sort: Season Avg'], ['games', 'Sort: Games Left']].map(function (o) { return '<option value="' + o[0] + '"' + (sortKey === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
        '</div>' +
        '<div class="pool-table-wrap"><div class="pool-header ss-fa-row">' +
          '<span class="ph-rank">#</span><span class="ph-player">Player</span><span class="ph-seed">Pos</span><span class="ph-stat">Status</span><span class="ph-stat" title="Games left this week">Wk</span>' +
          '<span class="ph-stat">PTS</span><span class="ph-stat">REB</span><span class="ph-stat">Avg</span><span class="ph-stat">Proj</span><span class="ph-action">Action</span></div>' + rows + '</div>' +
        '<p class="ss-hint"><b>FA</b> free agent: add now. <b>W</b> on waivers: claim, and it’s decided ' + (nextRun || 'next week') + ' by ' + (f.type === 'faab' ? 'highest bid' : 'waiver priority') + '. Proj is fantasy points per game from last season.</p>';
    }
    return head + tiles + last + tabs + body + faModal() + tradeModal();
  }
  function viewClaims(myClaims) {
    var f = faCfg();
    var claims = myClaims.length ? myClaims.map(function (c, i) {
      return '<div class="q-row"><span class="q-rank">' + (i + 1) + '</span>' +
        '<div class="q-info"><span class="q-name">Add ' + esc(P(c.add).name) + (f.type === 'faab' ? ' · $' + (c.bid || 0) : '') + '</span>' +
        '<span class="q-meta">' + (c.drop ? 'Drop ' + esc(P(c.drop).name) : 'No drop (open roster spot)') + '</span></div>' +
        '<div class="q-actions"><button class="q-btn" data-act="cmove" data-i="' + c.id + '" data-dir="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move up">&#9650;</button>' +
        '<button class="q-btn" data-act="cmove" data-i="' + c.id + '" data-dir="1"' + (i === myClaims.length - 1 ? ' disabled' : '') + ' aria-label="Move down">&#9660;</button>' +
        '<button class="q-btn q-btn--x" data-act="ccancel" data-i="' + c.id + '" aria-label="Cancel claim">&times;</button></div></div>';
    }).join('') : '<p class="queue-empty">No pending claims. Claim a player on waivers from Available.</p>';
    var order = f.priority.map(function (tid, i) {
      var t = team(tid);
      return '<div class="rp-standing-row"><span class="rp-sr-rank">' + (i + 1) + '</span>' + avatarHTML(t.name, 26) +
        '<span class="rp-sr-name">' + esc(t.name) + (t.isUser ? '<span class="rp-you-badge">You</span>' : '') + '</span>' +
        '<span class="rp-sr-score">' + (f.type === 'faab' ? '$' + f.budgets[tid] : '') + '</span></div>';
    }).join('');
    return '<div class="queue-panel"><div class="queue-head"><span class="queue-title">Your Claims</span></div>' + claims +
      '<p class="ss-hint">' + (f.type === 'faab' ? 'Bids are blind. Highest bid wins, ties go to waiver priority.' : 'Claims run in this order. Each time you win one you drop to the back of the priority list.') + '</p></div>' +
      '<div class="ss-card"><div class="ss-card-head"><h3 class="section-title">' + (f.type === 'faab' ? 'Budgets (tie-break order)' : 'Waiver Priority') + '</h3></div>' + order + '</div>';
  }
  // ── Trades UI ──
  function tradeInbox() {
    if (!state.trades) return 0;
    return trCfg().list.filter(function (t) { return (t.status === 'pending' && team(t.to).isUser) || t.status === 'review'; }).length;
  }
  function namesList(ids) { return ids.map(function (id) { return esc(P(id).name) + injTag(id); }).join(', '); }
  function tradeCard(tr) {
    var A = team(tr.from), B = team(tr.to), u = userTeam();
    var toMe = B.isUser && tr.status === 'pending', fromMe = A.isUser;
    var lbl = { pending: toMe ? 'Offer to you' : 'Waiting on ' + esc(B.name), review: 'Awaiting commissioner approval', done: 'Completed', declined: 'Declined', expired: 'Expired', vetoed: 'Vetoed by commissioner', failed: 'Couldn’t go through', cancelled: 'Cancelled' }[tr.status];
    var ctrl = '';
    if (toMe) ctrl = '<button class="btn-sm btn-green" data-act="tracc" data-i="' + tr.id + '">Accept</button><button class="btn-sm btn-ghost" data-act="trdec" data-i="' + tr.id + '">Decline</button>';
    else if (tr.status === 'pending' && fromMe) ctrl = '<button class="btn-sm btn-ghost" data-act="trcancel" data-i="' + tr.id + '">Cancel Offer</button>';
    else if (tr.status === 'review') ctrl = '<button class="btn-sm btn-green" data-act="trok" data-i="' + tr.id + '">Approve</button><button class="btn-sm btn-red" data-act="trveto" data-i="' + tr.id + '">Veto</button>';
    var sides = '<div class="ss-tr-sides"><div><span class="ss-tr-who">' + (A.isUser ? 'You send' : esc(A.name) + ' sends') + '</span>' + tr.give.map(function (id) { return playerLine(P(id), f1(P(id).proj) + ' proj'); }).join('') + '</div>' +
      '<div class="ss-tr-arrow" aria-hidden="true">⇄</div>' +
      '<div><span class="ss-tr-who">' + (B.isUser ? 'You send' : esc(B.name) + ' sends') + '</span>' + tr.get.map(function (id) { return playerLine(P(id), f1(P(id).proj) + ' proj'); }).join('') + '</div></div>';
    return '<div class="ss-tr-card ' + tr.status + (toMe ? ' tome' : '') + '"><div class="ss-tr-head"><span class="ss-tr-status">' + lbl + '</span><span class="ss-tr-when">' + weekLabel(tr.week) + '</span></div>' +
      sides + (tr.note ? '<p class="ss-hint">' + esc(tr.note) + '</p>' : '') + (ctrl ? '<div class="ss-tr-ctrl">' + ctrl + '</div>' : '') + '</div>';
  }
  function viewTrades() {
    var T = trCfg(), open = tradesOpen();
    var active = T.list.filter(function (t) { return t.status === 'pending' || t.status === 'review'; });
    var past = T.list.filter(function (t) { return t.status !== 'pending' && t.status !== 'review'; }).slice(0, 20);
    return '<div class="ss-tr-top"><div><b>' + (open.ok ? 'Trading is open' : 'Trading is closed') + '</b><span>' + (open.ok ? 'Deadline: end of week ' + T.deadline + '. ' + (T.review === 'commish' ? 'The commissioner approves trades.' : 'Trades go through when accepted.') : open.reason) + '</span></div>' +
        (open.ok ? '<button class="btn-primary" data-act="tropen">Propose a Trade</button>' : '') + '</div>' +
      (active.length ? active.map(tradeCard).join('') : '<p class="queue-empty">No open offers. Propose one, or check back: other managers send offers too.</p>') +
      (past.length ? '<div class="home-section"><h3 class="section-title">History</h3>' + past.map(tradeCard).join('') + '</div>' : '');
  }
  function tradeModal() {
    if (!ui.tr) return '';
    var u = userTeam(), others = state.teams.filter(function (t) { return !t.isUser; });
    if (!ui.tr.to) ui.tr.to = others[0].id;
    var B = team(ui.tr.to), give = ui.tr.give, get = ui.tr.get;
    function side(t, picked, key) {
      return t.roster.slice().sort(function (a, b) { return P(b).proj - P(a).proj; }).map(function (id) {
        var p = P(id), on = picked.indexOf(id) >= 0, lk = lockedThisWeek(t.id, id);
        return '<label class="ss-drop-row' + (on ? ' on' : '') + (lk ? ' off' : '') + '"><input type="checkbox" data-act="trpick" data-k="' + key + '" value="' + id + '"' + (on ? ' checked' : '') + (lk ? ' disabled' : '') + ' />' +
          logoHTML(p.college, 24) + '<span class="ss-drop-name">' + esc(p.name) + ' <span class="pos-badge">' + p.pos + '</span>' + injTag(id) + '</span><span class="ss-drop-meta">' + (lk ? 'Locked' : f1(botValue(id))) + '</span></label>';
      }).join('');
    }
    var gv = tradeValue(give), tv = tradeValue(get), tot = gv + tv;
    var pct = tot ? Math.round(tv / tot * 100) : 50;
    var chk = give.length && get.length ? checkTrade(u.id, B.id, give, get) : { ok: false, reason: 'Pick players on both sides.' };
    return '<div class="modal-backdrop ss-confirm" style="display:flex;" data-act="trclose"><div class="modal-card ss-tr-modal" role="dialog" aria-modal="true" aria-label="Propose a trade">' +
      '<h3>Propose a Trade</h3>' +
      '<div class="form-group"><label>Trade with</label><select id="ssTrTeam" class="pool-select">' + others.map(function (t) { return '<option value="' + t.id + '"' + (t.id === B.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="ss-tr-build"><div><div class="ss-drop-head">You send</div><div class="ss-drop-list">' + side(u, give, 'give') + '</div></div>' +
        '<div><div class="ss-drop-head">' + esc(B.name) + ' sends</div><div class="ss-drop-list">' + side(B, get, 'get') + '</div></div></div>' +
      '<div class="ss-tr-meter"><div class="ss-tr-meter-bar"><span style="width:' + pct + '%"></span></div><div class="ss-tr-meter-txt"><span>You get ' + f1(tv) + '</span><span>You give ' + f1(gv) + '</span></div>' +
        '<p class="ss-hint">Value blends projection with how each player has played this season. Bots usually want a little more than they give.</p></div>' +
      (give.length || get.length ? '<p class="ss-pool-count' + (chk.ok ? '' : ' warn') + '">' + (chk.ok ? 'Ready to send.' : esc(chk.reason)) + '</p>' : '') +
      '<div class="modal-actions"><button class="btn-ghost" data-act="trclose">Cancel</button><button class="btn-primary draft-go" data-act="trsend"' + (chk.ok ? '' : ' disabled') + '>Send Offer</button></div>' +
    '</div></div>';
  }
  function viewInjuries() {
    var inj = injuries(), owner = rosteredBy();
    var ids = Object.keys(inj).filter(function (id) { return injuryOf(id) && P(id) && owner[id]; })
      .sort(function (a, b) { return (team(owner[a]).isUser ? -1 : 0) - (team(owner[b]).isUser ? -1 : 0) || P(b).proj - P(a).proj; });
    var news = state.injuryNews && state.injuryNews.week === state.week ? state.injuryNews.items.filter(function (n) { return owner[n.pid]; }) : [];
    var rows = ids.map(function (id) {
      var i = injuryOf(id), t = team(owner[id]);
      return '<div class="ss-inj-row' + (t.isUser ? ' mine' : '') + '">' + logoHTML(P(id).college, 26) +
        '<div class="ss-inj-main"><b>' + esc(P(id).name) + injTag(id) + '</b><span>' + esc(i.part) + ' · ' + (t.isUser ? 'Your team' : esc(t.name)) + '</span></div>' +
        '<span class="ss-inj-ret">' + (i.status === 'SEASON' ? 'Season' : i.status === 'GTD' ? 'Day to day' : 'Back week ' + (i.until + 1)) + '</span></div>';
    }).join('') || '<p class="queue-empty">No injuries on any roster right now.</p>';
    var newsHtml = news.length ? '<div class="home-section"><h3 class="section-title">This Week’s News</h3><div class="activity-feed">' + news.map(function (n) {
      var i = injuryOf(n.pid), t = team(owner[n.pid]);
      return '<div class="feed-item ' + (n.back ? 'feed-draft' : 'feed-undo') + '"><span class="feed-icon-badge">' + (n.back ? '✓' : '✚') + '</span><div class="feed-body"><span class="feed-msg">' + esc(P(n.pid).name) + (n.back ? ' is back' : ' ' + injLabel(i) + ' (' + esc(i.part) + ')') + '</span><span class="feed-time">' + esc(t.isUser ? 'Your team' : t.name) + '</span></div></div>';
    }).join('') + '</div></div>' : '';
    return '<div class="ss-card"><div class="ss-card-head"><h3 class="section-title">Injury Report</h3><span class="ss-hint-inline">Rostered players</span></div>' + rows + '</div>' + newsHtml +
      '<p class="ss-hint"><span class="ss-inj ss-inj-gtd">GTD</span> game-time decision, about a coin flip to play each game. <span class="ss-inj ss-inj-out">OUT</span> misses every game until he’s back. <span class="ss-inj ss-inj-season">OUT-SZN</span> done for the year. In the lab, injuries are simulated each week.</p>';
  }
  function viewTx() {
    var tx = faCfg().tx;
    return '<div class="activity-feed">' + (tx.length ? tx.slice(0, 60).map(function (t) {
      var icon = t.type === 'drop' ? '−' : t.type === 'waiver' ? '⏱' : t.type === 'trade' ? '⇄' : '+';
      return '<div class="feed-item ' + (t.type === 'drop' ? 'feed-undo' : 'feed-draft') + '"><span class="feed-icon-badge">' + icon + '</span><div class="feed-body"><span class="feed-msg">' + esc(txText(t)) + '</span>' +
        '<span class="feed-time">' + weekLabel(t.week || 1) + (t.type === 'waiver' ? ', waivers' : ', ' + DAYS_FULL[Math.min(6, t.day || 0)]) + '</span></div></div>';
    }).join('') : '<p class="feed-empty">No moves yet. Adds, drops and waiver claims show up here.</p>') + '</div>';
  }
  function faModal() {
    if (!ui.faId) return '';
    var f = faCfg(), u = userTeam(), p = P(ui.faId), w = !!f.waivers[p.id];
    var full = u.roster.length >= state.league.rosterSize;
    var drops = u.roster.slice().sort(function (a, b) { return P(a).proj - P(b).proj; }).map(function (id) {
      var q = P(id), lk = lockedThisWeek(u.id, id), chk = checkMove(u.id, p.id, id);
      var dis = !chk.ok;
      return '<label class="ss-drop-row' + (dis ? ' off' : '') + (ui.faDrop === id ? ' on' : '') + '"><input type="radio" name="ssDrop" value="' + id + '"' + (ui.faDrop === id ? ' checked' : '') + (dis ? ' disabled' : '') + ' data-act="fadrop" />' +
        logoHTML(q.college, 24) + '<span class="ss-drop-name">' + esc(q.name) + ' <span class="pos-badge">' + q.pos + '</span>' + injTag(q.id) + '</span>' +
        '<span class="ss-drop-meta">' + (lk ? 'Locked this week' : dis ? 'Needed for positions' : f1(q.proj) + ' proj') + '</span></label>';
    }).join('');
    return '<div class="modal-backdrop ss-confirm" style="display:flex;" data-act="faclose"><div class="modal-card ss-fa-card" role="dialog" aria-modal="true" aria-label="' + (w ? 'Claim' : 'Add') + ' player">' +
      '<div class="confirm-logo">' + logoHTML(p.college, 52) + '</div><h3>' + (w ? 'Claim ' : 'Add ') + esc(p.name) + '</h3>' +
      '<p class="modal-sub">' + p.pos + ' · ' + esc(p.college) + (p.conf !== 'Other' ? ' · ' + esc(p.conf) : '') + ' · ' + f1(p.proj) + ' proj</p>' +
      (w ? '<p class="ss-hint" style="text-align:center;margin-top:0;">He’s on waivers. Claims are decided ' + (nextProcessing() || 'next week') + '.</p>' : '') +
      (w && f.type === 'faab' ? '<div class="form-group ss-bid"><label>Your bid (you have $' + f.budgets[u.id] + ')</label><input type="number" id="ssBid" min="0" max="' + f.budgets[u.id] + '" step="1" value="' + (ui.faBid != null ? ui.faBid : 1) + '" /></div>' : '') +
      '<div class="ss-drop-head">' + (full ? 'Drop a player to make room' : 'Drop a player (optional, you have an open spot)') + '</div>' +
      '<div class="ss-drop-list">' + (full ? '' : '<label class="ss-drop-row' + (!ui.faDrop ? ' on' : '') + '"><input type="radio" name="ssDrop" value=""' + (!ui.faDrop ? ' checked' : '') + ' data-act="fadrop" /><span class="ss-drop-name">Don’t drop anyone</span></label>') + drops + '</div>' +
      '<div class="modal-actions"><button class="btn-ghost" data-act="faclose">Cancel</button>' +
      '<button class="btn-primary draft-go" data-act="faconfirm">' + (w ? 'Place Claim' : 'Add Player') + '</button></div>' +
    '</div></div>';
  }

  // ── Lineup ──────────────────────────────────────────────
  function dayStrip() {
    return '<div class="ss-days" aria-label="Days this week">' + DAYS.map(function (d, i) {
      var st = i < state.day ? 'done' : i === state.day ? 'now' : '';
      return '<span class="' + st + '">' + d + '</span>';
    }).join('') + '</div>';
  }
  // Games are driven by the live feed: no play buttons in the league.
  function weekStatus() {
    if (state.phase === 'done') return 'Season complete';
    if (state.day > 6) return 'Week final · ' + (state.week >= state.league.weeks ? 'season wraps up' : weekLabel(state.week + 1) + ' starts Monday');
    return 'Scores update live as games finish';
  }
  function weekControls() {
    if (state.phase === 'done') return '';
    return '<span class="ss-wk-status">' + (isLiveWeek() ? '<span class="ss-live sm">Live</span>' : '') + weekStatus() + '</span>';
  }
  // Lab only: stands in for the live game feed until the pipeline exists.
  function labPanel() {
    if (!devMode()) return '';
    if (!state || state.phase === 'draft' || state.phase === 'done') return '';
    var over = state.day > 6;
    var btns = over
      ? '<button class="g-btn solid" data-act="nextweek">' + (state.week >= state.league.weeks ? 'Finish Season' : state.week + 1 > regWeeks() ? 'Start ' + weekLabel(state.week + 1) : 'Start Week ' + (state.week + 1)) + '</button>'
      : '<button class="g-btn solid" data-act="simday">Play ' + DAYS_FULL[state.day] + '</button><button class="g-btn" data-act="simweek">Rest of Week</button>';
    return '<div class="ss-labpanel"' + (ui.lab ? '' : ' hidden') + ' role="dialog" aria-label="Lab game simulator">' +
      '<div class="ss-lp-h"><b>Week simulator</b><button class="ss-lp-x" data-act="labtoggle" aria-label="Close">×</button></div>' +
      '<p>Developer tool. Advances the week from simulated box scores until the live stats feed is connected.</p>' +
      '<div class="ss-lp-btns">' + btns + '</div></div>';
  }
  function weekBar() {
    return '<div class="ss-weekbar">' + dayStrip() + '<div class="ss-weekbar-ctrl">' + weekControls() + '</div></div>';
  }
  function gameChips(pid, slotRec) {
    var g = gamesFor(pid);
    if (!g.length) return '<div class="ss-games"><span class="ss-games-none">No games this week</span></div>';
    return '<div class="ss-games">' + g.map(function (x) {
      var played = x.day < state.day;
      var isLocked = slotRec && slotRec.locked && slotRec.locked.playerId === pid && slotRec.locked.day === x.day;
      return '<span class="ss-game ' + (isLocked ? 'lk' : played ? 'pl' : 'up') + '"><b>' + DAYS[x.day] + '</b>' + (played ? '<i>' + (x.dnp ? 'DNP' : f1(x.fpts)) + '</i>' : '') + '</span>';
    }).join('') + '</div>';
  }
  function slotStatus(s, idx) {
    if (!s.playerId) return '<div class="ss-st"><span class="ss-st-note">Empty</span></div>';
    var stamp = ui.stamp === idx ? ' stamp' : '';
    if (s.locked) {
      var who = s.locked.playerId !== s.playerId ? ', ' + esc(P(s.locked.playerId).name) : '';
      return '<div class="ss-st locked' + stamp + '"><span class="ss-st-label">' + ICON.lock + (s.locked.auto ? 'Final' : 'Locked') + '</span>' +
        '<span class="ss-st-pts">' + f1(s.locked.fpts) + '</span><span class="ss-st-note">' + DAYS_FULL[s.locked.day] + who + '</span></div>';
    }
    var left = remainingGames(s.playerId, state.day);
    if (s.pending) {
      return '<div class="ss-st pending"><span class="ss-st-label">' + DAYS_FULL[s.pending.day] + (s.pending.dnp ? ', DNP' : '') + '</span>' +
        '<span class="ss-st-pts">' + f1(s.pending.fpts) + '</span>' +
        '<span class="ss-st-note">' + (left ? left + ' more game' + (left > 1 ? 's' : '') + ' this week' : 'Last game, so it counts') + '</span>' +
        '<div class="ss-lp"><button class="ss-lock-btn" data-act="lock" data-i="' + idx + '">' + ICON.lock + 'Lock</button>' +
        (left ? '<button class="btn-sm btn-ghost" data-act="pass" data-i="' + idx + '">Pass</button>' : '') + '</div></div>';
    }
    var inj = injuryOf(s.playerId);
    if (inj && inj.status !== 'GTD' && !s.eligible.length) {
      return '<div class="ss-st idle"><span class="ss-st-note ss-inj-note">' + (inj.status === 'SEASON' ? 'Out for the season' : 'Out this week') + ' (' + esc(inj.part) + '). Swap him for a healthy player.</span></div>';
    }
    var sc = slotScore(s);
    if (sc.kind === 'live') {
      return '<div class="ss-st live"><span class="ss-st-label">Holding</span><span class="ss-st-pts">' + f1(sc.v) + '</span>' +
        '<span class="ss-st-note">' + (left ? 'Counts unless you lock a later game' : 'No games left, so this counts') + '</span></div>';
    }
    return '<div class="ss-st idle"><span class="ss-st-note">' + (left ? 'Next game ' + DAYS_FULL[nextGameDay(s.playerId)] : 'No games left. Scores zero.') + '</span></div>';
  }
  function nextGameDay(pid) {
    var g = gamesFor(pid).filter(function (x) { return x.day >= state.day; });
    return g.length ? g[0].day : 0;
  }
  function playerLine(p, meta, noCard) {
    return '<div class="ss-pl">' + logoHTML(p.college, 30) +
      '<div class="ss-pl-txt"' + (noCard ? '' : ' data-act="pcard" data-id="' + p.id + '"') + '><span class="ss-pl-name">' + esc(p.name) + '<span class="pos-badge">' + p.pos + '</span>' + injTag(p.id) + '</span>' +
      '<span class="ss-pl-meta">' + esc(p.college) + (meta ? ' · ' + meta : '') + '</span></div></div>';
  }

  function viewLineup() {
    var u = userTeam(), slots = slotsOf(u.id);
    var starters = {}; slots.forEach(function (s) { if (s.playerId) starters[s.playerId] = true; });
    var bench = u.roster.filter(function (id) { return !starters[id]; });
    var open = ui.swapSlot;
    var dec = slots.filter(function (s) { return s.pending && !s.locked; }).length;

    var rows = slots.map(function (s, i) {
      var p = s.playerId ? P(s.playerId) : null;
      var canSwap = !s.locked && state.phase !== 'done';
      var swapList = '';
      if (open === i && canSwap) {
        var cands = u.roster.filter(function (id) { return id !== s.playerId && fitsSlot(P(id).pos, s.slot); })
          .filter(function (id) { for (var k = 0; k < slots.length; k++) if (slots[k].playerId === id && slots[k].locked) return false; return true; });
        swapList = '<div class="ss-swap"><div class="ss-swap-h">Move into ' + (s.slot === 'UTIL' ? 'UTIL' : s.slot) + '</div>' + (cands.map(function (id) {
          var q = P(id), l = remainingGames(id, state.day);
          return '<button class="ss-swap-row" data-act="swapto" data-i="' + i + '" data-id="' + id + '">' + playerLine(q, l + ' game' + (l === 1 ? '' : 's') + ' left', true) +
            (starters[id] ? '<span class="tc-onclock">Starting</span>' : '') + '</button>';
        }).join('') || '<div class="rp-empty">Nobody on your roster fits this slot.</div>') + '</div>';
      }
      return '<div class="ss-slot' + (s.locked ? ' is-locked' : s.pending ? ' is-pending' : '') + '">' +
        '<span class="ss-slot-k">' + (s.slot === 'UTIL' ? 'UTL' : s.slot) + '</span>' +
        '<div class="ss-slot-main">' + (p ? playerLine(p, f1(p.proj) + ' proj') + gameChips(p.id, s) : '<span class="rp-empty">Empty slot</span>') +
          (canSwap ? '<button class="ss-swap-link" data-act="swap" data-i="' + i + '">' + ICON.swap + (open === i ? 'Cancel' : 'Swap') + '</button>' : '') +
        '</div>' +
        slotStatus(s, i) + swapList +
      '</div>';
    }).join('');

    var benchRows = bench.map(function (id) {
      var p = P(id);
      return '<div class="ss-bench-row">' + playerLine(p, f1(p.proj) + ' proj') + '<div class="ss-bench-r">' + gameChips(id, null) +
        (state.phase === 'season' ? '<button class="ss-drop-link" data-act="dropone" data-id="' + id + '">Drop</button>' : '') + '</div></div>';
    }).join('') || '<div class="rp-empty">Everyone on your roster is starting.</div>';

    var hurt = slots.filter(function (s) { var i = s.playerId && !s.locked && injuryOf(s.playerId); return i && i.status !== 'GTD'; });
    return '<div class="page-header"><h2>Lineup</h2><span class="muted-badge">Week ' + state.week + ' of ' + state.league.weeks + '</span></div>' +
      (hurt.length ? '<div class="ss-inj-banner">' + hurt.length + ' of your starters ' + (hurt.length > 1 ? 'are' : 'is') + ' injured and won’t play: ' + hurt.map(function (s) { return esc(P(s.playerId).name); }).join(', ') + '. Swap in a healthy player.</div>' : '') +
      weekBar() +
      '<div class="ss-card"><div class="ss-card-head"><h3 class="section-title">Starters</h3>' +
        (dec ? '<span class="ss-decide">' + dec + ' to decide</span>' : '') + '</div>' + rows +
        '<p class="ss-hint">Lock a score to keep it. Pass to wait for his next game. If you never lock, the slot keeps its most recent game.</p></div>' +
      '<div class="ss-card"><div class="ss-card-head"><h3 class="section-title">Bench</h3><span class="ss-hint-inline">Bench games don’t count</span></div>' + benchRows + '</div>';
  }

  // ── Matchup (head-to-head, lock-in) ─────────────────────
  //  One row per starting slot: your card on the left, the opponent's
  //  mirrored on the right, the slot badge between them. Each card
  //  shows the game that counts (locked, or latest played), the week's
  //  schedule as a row of opponent badges, and the selected game's
  //  detail with its box-score line. You lock or pass from your card.
  function countingGame(s) {
    if (s.locked) return gameRec(s.locked.playerId, s.locked.day);
    if (s.eligible.length) { var e = s.eligible[s.eligible.length - 1]; return gameRec(e.playerId, e.day); }
    return null;
  }
  function gameRec(pid, day) {
    var g = gamesFor(pid);
    for (var i = 0; i < g.length; i++) if (g[i].day === day) return g[i];
    return null;
  }
  function defaultSel(s) {
    var g = gamesFor(s.playerId);
    if (!g.length) return -1;
    if (s.pending) for (var i = 0; i < g.length; i++) if (g[i].day === s.pending.day) return i;
    for (var k = 0; k < g.length; k++) if (g[k].day >= state.day) return k;
    return g.length - 1;
  }
  function vsText(p, g) { return g ? (g.home ? 'vs ' : '@ ') + abbr(g.opp) : '—'; }
  function resultText(g) {
    if (!g) return '';
    if (g.day >= state.day) return DAYS[g.day] + ' ' + (g.time || '');
    if (g.ts == null) return 'Final';
    var w = g.ts > g.os;
    return '<span class="' + (w ? 'mx-w' : 'mx-l') + '">' + (w ? 'W ' : 'L ') + Math.max(g.ts, g.os) + '-' + Math.min(g.ts, g.os) + '</span>';
  }
  function statLine(g) {
    if (g.dnp) return 'Did not play';
    var L = g.line;
    return L.points + ' PTS, ' + L.rebounds + ' REB, ' + L.assists + ' AST, ' + L.steals + ' STL, ' + L.blocks + ' BLK';
  }
  function mxCard(s, idx, side, interactive, kp) {
    var right = side === 'b';
    if (!s.playerId) return '<div class="mx-card mx-empty">Empty slot</div>';
    var p = P(s.playerId), games = gamesFor(s.playerId);
    var cg = countingGame(s), sc = slotScore(s);
    var key = (kp || '') + side + idx;
    var sel = ui.sel[key] != null && ui.sel[key] < games.length ? ui.sel[key] : defaultSel(s);
    var sg = sel >= 0 ? games[sel] : null;
    var topG = cg || sg;
    var state_ = s.locked ? 'locked' : s.pending ? 'pending' : '';

    var topLogo = topG ? logoHTML(topG.opp, 46) : '<span class="mx-nogame"></span>';
    var badge = s.locked ? '<span class="mx-lockdot" title="Locked">' + ICON.lock + '</span>' :
      s.pending && interactive ? '<span class="mx-decdot" title="Decide">!</span>' : '';
    var top =
      '<div class="mx-top">' +
        '<div class="mx-logo">' + topLogo + badge + '</div>' +
        '<div class="mx-game"><span class="mx-vs">' + (topG ? vsText(p, topG) : 'No games') + '</span><span class="mx-res">' + resultText(cg ? cg : null) + (cg && cg.dnp ? '<span class="mx-dnp">DNP</span>' : '') + '</span></div>' +
        '<div class="mx-score"><b class="' + sc.kind + '"' + (sc.kind === 'none' ? '' : ' data-cu="' + key + '" data-v="' + sc.v + '"') + '>' + (sc.kind === 'none' ? '–' : f1(sc.v)) + '</b><small>' + f1(p.proj) + '</small></div>' +
      '</div>';
    if (!s.locked && !interactive) top += '<div class="mx-notlock"><span></span>Not locked</div>';

    var track = games.length ? '<div class="mx-sched">' +
      '<div class="mx-logos">' + games.map(function (g, gi) {
        var cls = 'mx-sl' + (gi === sel ? ' on' : '') + (g.day < state.day ? ' played' : '') +
          (s.locked && s.locked.playerId === s.playerId && s.locked.day === g.day ? ' lk' : '');
        return '<button class="' + cls + '" data-act="selgame" data-k="' + key + '" data-g="' + gi + '" aria-label="' + DAYS_FULL[g.day] + ' vs ' + esc(g.opp || '') + '">' + logoHTML(g.opp, 26) + '</button>';
      }).join('') + '</div>' +
      '<div class="mx-track"><span style="width:' + (100 / games.length) + '%;transform:translateX(' + (sel * 100) + '%)"></span></div>' +
    '</div>' : '<div class="mx-sched mx-none">No games this week</div>';

    var detail = '';
    if (sg) {
      var played = sg.day < state.day;
      var mine = abbr(p.college), opp = abbr(sg.opp);
      detail = '<div class="mx-detail">' +
        '<div class="mx-d-row"><span class="mx-d-teams">' + (sg.home ? opp + ' @ <em>' + mine + '</em>' : mine + ' @ <em>' + opp + '</em>') + '</span>' +
          '<span class="mx-d-when">' + (played ? resultText(sg) : 'Yet to play') + '</span></div>' +
        '<div class="mx-d-row"><span class="mx-d-line">' + (played ? statLine(sg) : DAYS_FULL[sg.day] + ' ' + (sg.time || '')) + '</span>' +
          '<span class="mx-d-pts"><b>' + (played ? f1(sg.fpts) : '-') + '</b><small>' + f1(p.proj) + '</small></span></div>' +
      '</div>';
    }

    var actions = '';
    if (interactive && s.pending && !s.locked) {
      var left = remainingGames(s.playerId, state.day);
      actions = '<div class="mx-actions"><button class="ss-lock-btn" data-act="lock" data-i="' + idx + '">' + ICON.lock + 'Lock ' + f1(s.pending.fpts) + '</button>' +
        (left ? '<button class="btn-sm btn-ghost" data-act="pass" data-i="' + idx + '">Pass</button>' : '<span class="mx-note">Last game counts</span>') + '</div>';
    }
    return '<div class="mx-card ' + state_ + (right ? ' r' : '') + (ui.stamp === idx && interactive ? ' stamp' : '') + '">' + top + track + detail + actions + '</div>';
  }
  function mxHead(s, right) {
    if (!s.playerId) return '<div class="mx-name' + (right ? ' r' : '') + '"><b>Empty</b></div>';
    var p = P(s.playerId);
    return '<div class="mx-name' + (right ? ' r' : '') + '" data-act="pcard" data-id="' + p.id + '"><b>' + (right ? injTag(p.id) : '') + esc(shortName(p.name)) + (right ? '' : injTag(p.id)) + '</b><span><em class="mx-pos">' + p.pos + '</em> · ' + esc(p.college) + '</span></div>';
  }
  function shortName(n) {
    var w = n.split(' ');
    return w.length > 1 ? w[0].charAt(0) + '. ' + w.slice(1).join(' ') : n;
  }

  function viewMatchup() {
    var u = userTeam(), games = state.schedule[state.week - 1] || [];
    var mineIdx = -1;
    games.forEach(function (m, i) { if (m[0] === u.id || m[1] === u.id) mineIdx = i; });
    var cur = ui.mview != null && ui.mview < games.length ? ui.mview : mineIdx;
    var head = '<div class="page-header"><h2>Matchups</h2><div class="ss-ph-r"><button class="ss-help" data-act="exshow" aria-label="How lock-in works">?</button><span class="muted-badge">' + weekLabel() + ' · ' + weekDates(state.week) + '</span></div></div>';

    // Switcher: every matchup this week, yours first.
    var order = games.map(function (m, i) { return i; });
    if (mineIdx > 0) { order.splice(order.indexOf(mineIdx), 1); order.unshift(mineIdx); }
    var switcher = '<div class="mx-switch" role="tablist" aria-label="Matchups this week">' + order.map(function (i) {
      var m = games[i], mine = i === mineIdx;
      var l = mine && m[1] === u.id ? m[1] : m[0], r = l === m[0] ? m[1] : m[0];
      var ls = teamScore(l), rs = teamScore(r);
      return '<button role="tab" aria-selected="' + (i === cur) + '" class="mx-sw' + (i === cur ? ' on' : '') + (mine ? ' mine' : '') + '" data-act="mview" data-i="' + i + '">' +
        (mine || matchKind(state.week, i) !== 'reg' ? '<span class="mx-sw-tag' + (mine ? '' : ' k') + '">' + (mine ? 'Your matchup' : '') + (mine && matchKind(state.week, i) !== 'reg' ? ' · ' : '') + KIND_LABEL(matchKind(state.week, i)) + '</span>' : '') +
        '<span class="mx-sw-row' + (ls >= rs ? ' lead' : '') + '">' + avatarHTML(team(l).name, 22) + '<span class="mx-sw-n">' + esc(team(l).name) + '</span><b>' + f1(ls) + '</b></span>' +
        '<span class="mx-sw-row' + (rs > ls ? ' lead' : '') + '">' + avatarHTML(team(r).name, 22) + '<span class="mx-sw-n">' + esc(team(r).name) + '</span><b>' + f1(rs) + '</b></span>' +
      '</button>';
    }).join('') + '</div>';

    if (cur < 0) return head + switcher + '<div class="ss-card"><p class="rp-empty">You have a bye this week. Pick a matchup above to follow it.</p></div>';
    var m = games[cur], isMine = cur === mineIdx;
    var lId = isMine && m[1] === u.id ? m[1] : m[0], rId = lId === m[0] ? m[1] : m[0];
    var L = team(lId), R = team(rId), a = slotsOf(lId), b = slotsOf(rId);
    var ls = teamScore(lId), rs = teamScore(rId);
    var dec = isMine ? a.filter(function (s) { return s.pending && !s.locked; }).length : 0;
    var board = '<div class="ss-vs-card' + (isMine ? '' : ' other') + '">' +
      '<div class="ss-vs-side' + (ls >= rs ? ' lead' : '') + '">' + avatarHTML(L.name, 44) + '<div><div class="ss-vs-name">' + esc(L.name) + '</div><div class="ss-vs-sub">' + recordOf(lId) + '</div></div><div class="ss-vs-pts">' + f1(ls) + '</div></div>' +
      '<div class="ss-vs-mid">VS</div>' +
      '<div class="ss-vs-side r' + (rs > ls ? ' lead' : '') + '"><div class="ss-vs-pts">' + f1(rs) + '</div><div><div class="ss-vs-name">' + esc(R.name) + '</div><div class="ss-vs-sub">' + recordOf(rId) + '</div></div>' + avatarHTML(R.name, 44) + '</div>' +
    '</div>';
    var kp = 'm' + cur;
    var pairs = a.map(function (s, i) {
      var slot = s.slot === 'UTIL' ? 'UTL' : s.slot;
      return '<div class="mx-pair">' +
        '<div class="mx-head">' + mxHead(s, false) + '<span class="mx-slot mx-slot-' + s.slot + '">' + slot + '</span>' + mxHead(b[i], true) + '</div>' +
        '<div class="mx-cards">' + mxCard(s, i, 'a', isMine, kp) + mxCard(b[i], i, 'b', false, kp) + '</div>' +
      '</div>';
    }).join('');
    var past = state.results.filter(function (r) { return r.home === u.id || r.away === u.id; }).slice().reverse().map(function (r) {
      var me = r.home === u.id, mp = me ? r.homePts : r.awayPts, op = me ? r.awayPts : r.homePts;
      var res = mp > op ? 'W' : mp < op ? 'L' : 'T';
      return '<div class="feed-item"><span class="ss-res ' + res + '">' + res + '</span><div class="feed-body"><span class="feed-msg">' + (KIND_LABEL(r.kind || 'reg') || 'Week ' + r.week) + ' vs ' + esc(team(me ? r.away : r.home).name) + '</span><span class="feed-time">' + f1(mp) + ' – ' + f1(op) + '</span></div></div>';
    }).join('') || '<p class="feed-empty">Finished weeks show up here.</p>';
    if (theme() === 'glass') { board = gScoreboard(L, R, a, b, ls, rs, isMine, cur); }
    return head + switcher + board + (theme() === 'glass' && isMine ? '' : weekBar()) +
      '<div class="mx-starters-head"><h3>' + (KIND_LABEL(matchKind(state.week, cur)) ? '<span class="mx-kind">' + KIND_LABEL(matchKind(state.week, cur)) + '</span>' : '') + (isMine ? 'Starters' : 'Starters, ' + esc(L.name) + ' vs ' + esc(R.name)) + (dec ? '<span class="ss-decide">' + dec + ' to decide</span>' : '') + '</h3>' +
        (isMine ? '' : '<button class="btn-sm btn-ghost" data-act="mview" data-i="' + mineIdx + '">Back to my matchup</button>') + '</div>' +
      pairs +
      '<div class="home-section"><h3 class="section-title">Your Results</h3><div class="activity-feed">' + past + '</div></div>';
  }
  function recordOf(teamId) {
    var r = standings().filter(function (x) { return x.id === teamId; })[0];
    return r ? r.w + '–' + r.l + (r.t ? '–' + r.t : '') : '0–0';
  }

  // ── Standings ───────────────────────────────────────────
  function streakOf(teamId) {
    var res = state.results.filter(function (r) { return (!r.kind || r.kind === 'reg') && (r.home === teamId || r.away === teamId); }).map(function (r) {
      var mp = r.home === teamId ? r.homePts : r.awayPts, op = r.home === teamId ? r.awayPts : r.homePts;
      return mp > op ? 'W' : mp < op ? 'L' : 'T';
    });
    if (!res.length) return '-';
    var last = res[res.length - 1], n = 0;
    for (var i = res.length - 1; i >= 0 && res[i] === last; i--) n++;
    return last + n;
  }
  function viewStandings() {
    var medal = ['rank-gold', 'rank-silver', 'rank-bronze'];
    var rows = standings().map(function (r, i) {
      var rank = i < 3 ? '<span class="rank-medal ' + medal[i] + '">' + (i + 1) + '</span>' : '<span class="rank-num">' + (i + 1) + '</span>';
      var stk = streakOf(r.id);
      var cut = state.league.playoffWeeks && i === 3 && state.league.numTeams > 4;
      return '<div class="standings-row ss-st-row' + (r.isUser ? ' current-user' : '') + (cut ? ' ss-cut' : '') + '">' +
        '<span class="sr-rank">' + rank + '</span>' +
        '<span class="sr-name ss-sr-name">' + avatarHTML(r.name, 28) + '<span>' + esc(r.name) + '</span>' + (state.league.playoffWeeks && i < 4 ? '<span class="ss-seed">' + (state.playoff ? 'Seed ' + (i + 1) : 'Playoff spot') + '</span>' : '') + '</span>' +
        '<span class="sr-fpts">' + r.w + '–' + r.l + (r.t ? '–' + r.t : '') + '</span>' +
        '<span class="sr-cat">' + f1(r.pf) + '</span>' +
        '<span class="sr-cat ss-pa">' + f1(r.pa) + '</span>' +
        '<span class="sr-delta ' + (stk.charAt(0) === 'W' ? 'delta-up' : stk.charAt(0) === 'L' ? 'delta-down' : 'delta-same') + '">' + stk + '</span>' +
      '</div>';
    }).join('');
    var wk = state.phase === 'draft' ? null : state.week;
    var games = wk ? state.schedule[wk - 1].map(function (m, gi) {
      var a = teamScore(m[0]), b = teamScore(m[1]), k = KIND_LABEL(matchKind(wk, gi));
      return (k ? '<div class="ss-score-kind">' + k + '</div>' : '') + '<div class="ss-score-row"><span class="' + (a > b ? 'w' : '') + '">' + esc(team(m[0]).name) + '</span><b class="' + (a > b ? 'w' : '') + '">' + f1(a) + '</b><b class="' + (b > a ? 'w' : '') + '">' + f1(b) + '</b><span class="' + (b > a ? 'w' : '') + '">' + esc(team(m[1]).name) + '</span></div>';
    }).join('') : '';
    var thru = wk ? Math.min(regWeeks(), state.day > 6 ? wk : wk - 1) : 0;
    return '<div class="page-header"><h2>Standings</h2>' + (wk ? '<span class="muted-badge">' + (thru >= regWeeks() ? 'Final regular season' : 'Through week ' + thru) + '</span>' : '') + '</div>' +
      playoffCard() +
      '<div class="ss-standings">' +
        '<div class="standings-header-row ss-st-row"><span class="sh-rank">Rank</span><span class="sh-name">Team</span><span class="sh-pts">W–L</span><span class="sh-cat">PF</span><span class="sh-cat ss-pa">PA</span><span class="sh-delta">Strk</span></div>' +
        '<div class="standings-list">' + rows + '</div>' +
      '</div>' +
      (state.league.playoffWeeks && !state.playoff ? '<p class="ss-hint">Top 4 make the playoffs: semifinals ' + weekDates(regWeeks() + 1) + ', championship ' + weekDates(regWeeks() + 2) + '. Ties go to points for.</p>' : '') +
      (wk ? '<div class="home-section"><h3 class="section-title">' + weekLabel(wk) + ' Scoreboard</h3><div class="ss-card">' + games + '</div></div>' : '');
  }
  // Bracket card once the playoffs start: semis, then championship.
  function playoffCard() {
    if (!state.playoff) return '';
    var sd = state.playoff.seeds, R = regWeeks();
    function games(week, kind) {
      var g = state.schedule[week - 1] || [], list = [];
      ((state.kinds || {})[week] || []).forEach(function (k, i) { if (k === kind) list.push(g[i]); });
      return list;
    }
    function line(id, pts, win) {
      return '<div class="ss-br-team' + (win ? ' win' : '') + (team(id).isUser ? ' me' : '') + '"><span class="ss-br-seed">' + (sd.indexOf(id) + 1) + '</span>' + avatarHTML(team(id).name, 22) +
        '<span class="ss-br-name">' + esc(team(id).name) + '</span><b>' + (pts == null ? '' : f1(pts)) + '</b></div>';
    }
    function box(m, week, label) {
      if (!m) return '<div class="ss-br-box tbd"><div class="ss-br-label">' + label + '</div><div class="ss-br-team"><span class="ss-br-name">TBD</span></div><div class="ss-br-team"><span class="ss-br-name">TBD</span></div></div>';
      var done = state.results.filter(function (r) { return r.week === week && r.home === m[0] && r.away === m[1]; })[0];
      var live = state.week === week && !done;
      var a = done ? done.homePts : state.week === week ? teamScore(m[0]) : null, b = done ? done.awayPts : state.week === week ? teamScore(m[1]) : null;
      var w = done ? winnerOf(done, sd) : null;
      return '<div class="ss-br-box' + (live ? ' live' : '') + '"><div class="ss-br-label">' + label + (live ? '<span class="ss-br-live">Live</span>' : '') + '</div>' + line(m[0], a, w === m[0]) + line(m[1], b, w === m[1]) + '</div>';
    }
    var semis = games(R + 1, 'semi'), fin = games(R + 2, 'final')[0], third = games(R + 2, 'third')[0];
    var champ = state.champion ? '<div class="ss-br-champ">' + avatarHTML(team(state.champion).name, 34) + '<div><span>League Champion</span><b>' + esc(team(state.champion).name) + '</b></div></div>' : '';
    return '<div class="home-section"><h3 class="section-title">Playoffs</h3><div class="ss-bracket">' +
      '<div class="ss-br-col">' + box(semis[0], R + 1, 'Semifinal, ' + weekDates(R + 1)) + box(semis[1], R + 1, 'Semifinal, ' + weekDates(R + 1)) + '</div>' +
      '<div class="ss-br-col ss-br-final">' + box(fin, R + 2, 'Championship, ' + weekDates(R + 2)) + box(third, R + 2, '3rd Place') + champ + '</div>' +
    '</div></div>';
  }

  // ── Teams ───────────────────────────────────────────────
  function viewTeams() {
    var st = standings();
    var medal = ['rank-gold', 'rank-silver', 'rank-bronze'];
    var cards = st.map(function (r, i) {
      var t = team(r.id);
      var players = t.roster.slice().sort(function (a, b) { return seasonPoints(b).total - seasonPoints(a).total || P(b).proj - P(a).proj; });
      var onClockNow = state.phase === 'draft' && onClock() === t.id;
      return '<div class="team-card' + (t.isUser ? ' current-user' : '') + (i < 3 && state.results.length ? ' rank-' + (i + 1) + '-card' : '') + '">' +
        '<div class="team-card-header">' + avatarHTML(t.name, 38) +
          '<div class="tc-header-info"><span class="tc-name">' + esc(t.name) + '</span><span class="tc-badges">' +
            (onClockNow ? '<span class="tc-onclock">On Clock</span>' : '') + (t.isUser ? '<span class="tc-you">You</span>' : '<span class="tc-commissioner">Bot</span>') +
          '</span></div>' +
          '<span class="tc-rank-badge' + (i < 3 && state.results.length ? ' ' + medal[i] : '') + '">' + (i + 1) + '</span>' +
        '</div>' +
        (!t.isUser && state.phase === 'season' && tradesOpen().ok ? '<button class="btn-ghost btn-sm ss-tc-trade" data-act="tropen" data-id="' + t.id + '">Propose Trade</button>' : '') +
        '<div class="tc-fpts">' + (state.phase === 'draft' ? t.roster.length + '/' + state.league.rosterSize : r.w + '–' + r.l) + '</div>' +
        '<div class="tc-fpts-label">' + (state.phase === 'draft' ? 'Players drafted' : f1(r.pf) + ' points for') + '</div>' +
        '<div class="tc-players">' + (players.length ? players.map(function (id) {
          var p = P(id), sp = seasonPoints(id);
          return '<div class="tc-player-row" data-act="pcard" data-id="' + id + '">' + logoHTML(p.college, 22) + '<span class="tc-player-name">' + esc(p.name) + injTag(p.id) + '</span>' +
            '<span class="pos-badge" style="font-size:10px;">' + p.pos + '</span><span class="tc-player-fpts">' + (sp.gp ? f1(sp.total) : f1(p.proj)) + '</span></div>';
        }).join('') : '<span style="color:var(--muted);font-size:13px;">No players drafted yet</span>') + '</div>' +
      '</div>';
    }).join('');
    return '<div class="page-header"><h2>Teams &amp; Rosters</h2><button class="g-btn solid ss-ph-btn" data-act="invite">Invite Friends</button></div><div class="teams-grid">' + cards + '</div>' + tradeModal();
  }

  // ── League settings ─────────────────────────────────────
  // ── Settings (same sections as the tournament Settings page) ──
  var CB_SVG = '<svg class="custom-cb-svg" viewBox="0 0 12 10" fill="none"><polyline points="1,5 4.5,8.5 11,1" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function sessionEmail() {
    try { var s = JSON.parse(localStorage.getItem('mmfantasy-session') || 'null'); return (s && s.email) || ''; } catch (e) { return ''; }
  }
  function countdownText(at) {
    var ms = at - Date.now();
    if (ms <= 0) return 'now';
    var m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60, ss = Math.floor(ms / 1000) % 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + mm + 'm';
    return mm + 'm ' + (ss < 10 ? '0' : '') + ss + 's';
  }
  function fmtWhen(at) {
    var d = new Date(at);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function setRow(title, sub, control, extra) {
    return '<div class="set-row' + (extra || '') + '"><div class="set-row-main"><span class="set-row-title">' + title + '</span><span class="set-row-sub">' + sub + '</span></div>' + (control || '') + '</div>';
  }
  // ── Invite friends ──────────────────────────────────────
  //  Codes and links are final; joining is wired once leagues live in
  //  Firestore (seasonLeagues/{code}). Until then the lab league's
  //  other spots are bots, shown here as open spots.
  function inviteLink() {
    var base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : 'https://app.tipofffantasy.com/';
    return base + '?sjoin=' + encodeURIComponent(state.league.code);
  }
  function viewInvite() {
    var L = state.league, u = userTeam();
    var open = state.teams.filter(function (t) { return !t.isUser; }).length;
    var rows = state.teams.map(function (t, i) {
      return '<div class="iv-row' + (t.isUser ? ' me' : '') + '">' + (t.isUser ? avatarHTML(t.name, 30) : '<span class="iv-open">' + (i + 1) + '</span>') +
        '<div><b>' + (t.isUser ? esc(t.name) : 'Open spot') + '</b><span>' + (t.isUser ? 'You · commissioner' : 'A bot drafts here until a friend joins') + '</span></div></div>';
    }).join('');
    var canShare = typeof navigator !== 'undefined' && !!navigator.share;
    return '<div class="pc-backdrop" data-act="ivclose"><div class="pc-card iv-card" role="dialog" aria-modal="true" aria-labelledby="ivTitle">' +
      '<div class="pc-grab" aria-hidden="true"></div>' +
      '<div class="pc-head"><div class="pc-id"><h2 id="ivTitle">Invite friends</h2><span>' + esc(L.name) + ' · ' + open + ' of ' + L.numTeams + ' spots open</span></div><button class="pc-x" data-act="ivclose" aria-label="Close">×</button></div>' +
      '<div class="iv-code"><span>League code</span><b>' + esc(L.code) + '</b><button class="g-btn" data-act="ivcopy" data-v="code">' + (ui.ivCopied === 'code' ? 'Copied ✓' : 'Copy code') + '</button></div>' +
      '<div class="iv-link"><input readonly value="' + esc(inviteLink()) + '" aria-label="Invite link" /><button class="g-btn solid" data-act="ivcopy" data-v="link">' + (ui.ivCopied === 'link' ? 'Copied ✓' : 'Copy link') + '</button></div>' +
      (canShare ? '<button class="g-btn iv-share" data-act="ivshare">Share invite…</button>' : '') +
      '<div class="pc-sec"><h3>Managers</h3><div class="iv-list">' + rows + '</div></div>' +
      '<p class="iv-note">Friends enter the code under <b>Join League</b>, or tap the link. Draft day: ' + (draftCfg().scheduledAt ? esc(fmtWhen(draftCfg().scheduledAt)) : 'not scheduled yet (Settings → Schedule Draft)') + '.</p>' +
      '<p class="iv-lab">Anyone with this code can claim an open seat in your league.</p>' +
    '</div></div>';
  }
  function copyToClipboard(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t); } catch (e) { /* fall through */ }
    var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove();
    return Promise.resolve();
  }

  // ── Player card: tap any player ─────────────────────────
  function ownerOf(pid) { var t = rosteredBy()[pid]; return t ? team(t) : null; }
  function gameLog(pid) {
    var out = [];
    Object.keys(state.games || {}).map(Number).sort(function (a, b) { return b - a; }).forEach(function (w) {
      (state.games[w][pid] || []).slice().reverse().forEach(function (g) {
        if (w < state.week || g.day < state.day) out.push({ w: w, g: g });
      });
    });
    return out;
  }
  function viewPlayerCard(pid) {
    var p = P(pid); if (!p) return '';
    var owner = ownerOf(pid), u = userTeam(), mine = owner && owner.isUser, draft = state.phase === 'draft';
    var inj = injuryOf(pid), sp = draft ? { total: 0, gp: 0 } : seasonPoints(pid);
    var status = draft ? (owner ? 'Drafted by ' + (mine ? 'you' : esc(owner.name)) : 'Available') :
      owner ? (mine ? 'On your team' : 'On ' + esc(owner.name)) : playerStatus(pid) === 'waivers' ? 'On waivers until ' + (nextProcessing() || 'next week') : 'Free agent';
    var avg = p.avg, last = [[f1(avg.points), 'PTS'], [f1(avg.rebounds), 'REB'], [f1(avg.assists), 'AST'], [f1(avg.steals), 'STL'], [f1(avg.blocks), 'BLK']];
    var head = '<div class="pc-head">' + logoHTML(p.college, 58) +
      '<div class="pc-id"><h2>' + esc(p.name) + '</h2><span>' + [p.pos === 'G' ? 'Guard' : p.pos === 'C' ? 'Center' : 'Forward', p.cls, p.height, p.jersey ? '#' + esc(p.jersey) : ''].filter(Boolean).join(' · ') + '</span>' +
        '<span>' + esc(p.college) + (p.conf && p.conf !== 'Other' ? ' · ' + esc(p.conf) : '') + '</span></div>' +
      '<button class="pc-x" data-act="pcclose" aria-label="Close">×</button></div>';
    var chips = '<div class="pc-chips"><span class="pc-own' + (mine ? ' me' : owner ? '' : ' free') + '">' + status + '</span>' + injTag(pid) +
      (inj ? '<span class="pc-injnote">' + esc(inj.part) + (inj.status === 'OUT' ? ', out through week ' + inj.until : inj.status === 'GTD' ? ', game-time decision' : ', out for the season') + '</span>' : '') + '</div>';
    var big = '<div class="pc-big"><div><b>' + f1(p.proj) + '</b><span>Proj FPTS/G</span></div>' +
      (sp.gp ? '<div><b>' + f1(sp.total / sp.gp) + '</b><span>This season</span></div><div><b>' + f1(sp.total) + '</b><span>Total FPTS</span></div>' :
        '<div><b>' + (p.gp || '–') + '</b><span>Games last yr</span></div><div><b>' + (p.mins ? f1(p.mins) : '–') + '</b><span>Min/G last yr</span></div>') + '</div>';
    var lastYr = '<div class="pc-sec"><h3>' + (p.fresh ? 'Projection' : 'Last season per game') + '</h3>' +
      (p.fresh ? '<p class="pc-note">No prior college stats, so this is a baseline estimate. It updates once he plays.</p>' : '') +
      '<div class="pc-stats">' + last.map(function (x) { return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join('') + '</div></div>';
    var week = '';
    if (!draft) {
      var gs = gamesFor(pid);
      week = '<div class="pc-sec"><h3>' + weekLabel() + ' <small>' + weekDates(state.week) + '</small></h3>' + (gs.length ? '<div class="pc-week">' + gs.map(function (g) {
        var played = g.day < state.day;
        return '<div class="pc-g' + (played ? ' done' : '') + '"><span class="d">' + DAYS[g.day] + '</span>' + logoHTML(g.opp, 24) + '<span class="o">' + (g.home ? 'vs ' : '@ ') + esc(abbr(g.opp)) + '</span>' +
          '<span class="r">' + (played ? (g.dnp ? 'DNP' : '<b>' + f1(g.fpts) + '</b>') : esc(g.time || '')) + '</span></div>';
      }).join('') + '</div>' : '<p class="pc-note">No games this week.</p>') + '</div>';
    }
    var log = draft ? [] : gameLog(pid).slice(0, 8);
    var logSec = draft ? '' : '<div class="pc-sec"><h3>Game log</h3>' + (log.length ? '<div class="pc-log"><div class="pc-lh"><span>Game</span><span>PTS</span><span>REB</span><span>AST</span><span>STL</span><span>BLK</span><span>FPTS</span></div>' + log.map(function (x) {
      var g = x.g, L = g.line || {};
      return '<div class="pc-lr"><span>W' + x.w + ' ' + DAYS[g.day] + ' ' + (g.home ? 'v' : '@') + ' ' + esc(abbr(g.opp)) + '</span>' +
        (g.dnp ? '<span class="dnp">Did not play</span><b>0.0</b>' : '<span>' + (L.points || 0) + '</span><span>' + (L.rebounds || 0) + '</span><span>' + (L.assists || 0) + '</span><span>' + (L.steals || 0) + '</span><span>' + (L.blocks || 0) + '</span><b>' + f1(g.fpts) + '</b>') + '</div>';
    }).join('') + '</div>' : '<p class="pc-note">Games show up here once he plays.</p>') + '</div>';

    var acts = [];
    if (draft) {
      if (!owner) {
        var qd = draftCfg().queue.indexOf(pid) >= 0;
        if (draftLive() && team(onClock()).isUser) acts.push('<button class="g-btn solid" data-act="pick" data-id="' + pid + '">Draft</button>');
        acts.push('<button class="g-btn" data-act="queue" data-id="' + pid + '">' + (qd ? '★ In queue' : '☆ Add to queue') + '</button>');
      }
    } else if (state.phase === 'season') {
      if (mine) {
        acts.push('<button class="g-btn" data-act="pcgo" data-page="lineup">Set Lineup</button>');
        acts.push('<button class="g-btn danger" data-act="dropone" data-id="' + pid + '">Drop</button>');
      } else if (owner) {
        if (tradesOpen().ok) acts.push('<button class="g-btn solid" data-act="tropen" data-id="' + owner.id + '" data-get="' + pid + '">Propose Trade</button>');
      } else {
        acts.push('<button class="g-btn solid" data-act="faopen" data-id="' + pid + '">' + (playerStatus(pid) === 'waivers' ? 'Claim' : 'Add') + '</button>');
      }
    }
    return '<div class="pc-backdrop" data-act="pcclose"><div class="pc-card" role="dialog" aria-modal="true" aria-label="' + esc(p.name) + '">' +
      '<div class="pc-grab" aria-hidden="true"></div>' + head + chips + big + week + lastYr + logSec +
      (acts.length ? '<div class="pc-acts">' + acts.join('') + '</div>' : '') +
    '</div></div>';
  }

  // ── League chat ─────────────────────────────────────────
  //  Lab: stored with the league on this device. With multiplayer it
  //  moves to Firestore (leagues/{code}/chat) unchanged in shape:
  //  { id, teamId|null, text, ts, sys }.
  function chatList() { if (!state.chat) state.chat = { msgs: [], seq: 1, read: 0 }; return state.chat; }
  function chatPost(teamId, text, sys) {
    var c = chatList();
    c.msgs.push({ id: c.seq++, teamId: teamId, text: String(text).slice(0, 500), ts: Date.now(), sys: !!sys });
    if (c.msgs.length > 300) c.msgs = c.msgs.slice(-300);
    if (teamId === userTeam().id) c.read = c.msgs[c.msgs.length - 1].id;
  }
  function chatSys(text) { if (state) chatPost(null, text, true); }
  function unreadChat() {
    if (!state || ui.page === 'chat') return 0;
    var c = chatList(); return c.msgs.filter(function (m) { return m.id > c.read && m.teamId !== userTeam().id; }).length;
  }
  function timeAgo(ts) {
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    var d = new Date(ts); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getDate();
  }
  function chatRows(msgs) {
    var u = userTeam().id, prev = null;
    return msgs.map(function (m) {
      if (m.sys) { prev = null; return '<div class="ch-sys"><span>' + esc(m.text) + '</span></div>'; }
      var t = team(m.teamId), mine = m.teamId === u, cont = prev && prev.teamId === m.teamId && m.ts - prev.ts < 300000;
      prev = m;
      return '<div class="ch-msg' + (mine ? ' me' : '') + (cont ? ' cont' : '') + '">' +
        (mine || cont ? '' : '<span class="ch-av">' + avatarHTML(t ? t.name : '?', 30) + '</span>') +
        '<div class="ch-body">' + (cont ? '' : '<div class="ch-meta"><b>' + esc(mine ? 'You' : t ? t.name : 'Manager') + '</b><span>' + timeAgo(m.ts) + '</span></div>') +
        '<div class="ch-bubble">' + esc(m.text) + '</div></div></div>';
    }).join('');
  }
  function viewChat() {
    var c = chatList();
    if (c.msgs.length) c.read = c.msgs[c.msgs.length - 1].id;
    var empty = '<div class="ch-empty"><b>No messages yet</b><span>Talk some trash. Trades, waiver results and final scores post here too.</span></div>';
    return '<div class="page-header"><h2>League Chat</h2><span class="muted-badge">' + state.league.numTeams + ' managers</span></div>' +
      '<section class="g-card ch-wrap"><div class="ch-list" id="ssChatList">' + (c.msgs.length ? chatRows(c.msgs) : empty) + '</div>' +
      '<form class="ch-form" onsubmit="return false"><input id="ssChatInput" class="ch-input" type="text" maxlength="500" autocomplete="off" placeholder="Message ' + esc(state.league.name) + '" value="' + esc(ui.chatDraft || '') + '" />' +
      '<button class="ch-send" type="submit" data-act="chatsend" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button></form></section>' +
      '<p class="ch-note">Messages are shared with everyone in your league.</p>';
  }
  function sendChat() {
    var inp = document.getElementById('ssChatInput');
    var txt = inp ? inp.value.trim() : '';
    if (!txt) return false;
    chatPost(userTeam().id, txt, false);
    ui.chatDraft = ''; ui.chatFocus = true;
    save(); return true;
  }

  // ── How lock-in works: 3-card explainer + full rules page ──
  var EXPLAIN_KEY = 'tipoff-season-explainer-v1';
  function explainerSeen() { try { return localStorage.getItem(EXPLAIN_KEY) === '1'; } catch (e) { return false; } }
  function markExplainerSeen() { try { localStorage.setItem(EXPLAIN_KEY, '1'); } catch (e) { /* ignore */ } }
  var EXPLAIN = [
    { t: 'Your starters play', b: 'Every week you start 5 players: 2 guards, 2 forwards and a utility spot anyone can fill. Each plays 1 to 3 games that week.',
      demo: '<div class="ex-slots">' + ['G', 'G', 'F', 'F', 'U'].map(function (k, i) { return '<span class="ex-slot" style="--d:' + (i * 80) + 'ms"><i>' + k + '</i></span>'; }).join('') + '</div>' +
        '<div class="ex-week">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (d, i) { return '<span class="' + ([0, 3, 5].indexOf(i) >= 0 ? 'g' : '') + '">' + d + '</span>'; }).join('') + '</div>' },
    { t: 'Lock it or pass', b: 'After each game you see his fantasy score. Lock it to keep that score for the week, or pass and bet his next game is better.',
      demo: '<div class="ex-game"><span class="ex-day">Mon</span><b>18.4</b><span class="ex-btns"><em class="lock">Lock</em><em>Pass</em></span></div>' +
        '<div class="ex-game dim"><span class="ex-day">Thu</span><b>?</b><span class="ex-btns"><em class="ghost">next game</em></span></div>' },
    { t: 'Locked is final', b: 'A locked score can’t change. If you never lock, his last game counts, and a game he sits out scores 0. Most total points wins the week.',
      demo: '<div class="ex-final"><span class="ex-stamp">Locked</span><b>18.4</b></div><div class="ex-vs"><span>You <b>96.2</b></span><span class="w">Win</span><span><b>88.7</b> Opp</span></div>' }
  ];
  function viewExplainer() {
    var i = Math.max(0, Math.min(EXPLAIN.length - 1, ui.explain)), c = EXPLAIN[i], last = i === EXPLAIN.length - 1;
    return '<div class="ex-backdrop" role="dialog" aria-modal="true" aria-labelledby="exTitle"><div class="ex-card">' +
      '<button class="ex-skip" data-act="exdone">Skip</button>' +
      '<div class="ex-kicker">How lock-in works · ' + (i + 1) + ' of ' + EXPLAIN.length + '</div>' +
      '<div class="ex-demo" key="' + i + '">' + c.demo + '</div>' +
      '<h2 id="exTitle">' + c.t + '</h2><p>' + c.b + '</p>' +
      '<div class="ex-dots">' + EXPLAIN.map(function (x, k) { return '<span class="' + (k === i ? 'on' : '') + '"></span>'; }).join('') + '</div>' +
      '<div class="ex-ctrl">' + (i ? '<button class="g-btn" data-act="exstep" data-v="' + (i - 1) + '">Back</button>' : '<button class="g-btn" data-act="exrules">Full rules</button>') +
        (last ? '<button class="g-btn solid" data-act="exdone">Got it</button>' : '<button class="g-btn solid" data-act="exstep" data-v="' + (i + 1) + '">Next</button>') + '</div>' +
    '</div></div>';
  }
  function weekEnd(w) {
    var parts = weekDates(w).split('–'), end = parts[1];
    return /^\d/.test(end) ? parts[0].split(' ')[0] + ' ' + end : end;
  }
  function viewRules() {
    var L = state.league, W = weights(), f = faCfg(), tr = trCfg();
    var scoring = STAT_KEYS.filter(function (k) { return W[k]; }).map(function (k) { return '<li><b>' + STAT_LABEL[k] + '</b><span>' + (W[k] > 0 ? '+' : '') + W[k] + '</span></li>'; }).join('');
    var sec = function (title, body) { return '<section class="g-card ru-sec"><h3>' + title + '</h3>' + body + '</section>'; };
    var cal = L.playoffWeeks ? 'Weeks 1–' + regWeeks() + ' are the regular season (' + weekDates(1).split('–')[0] + ' to ' + weekEnd(regWeeks()) + '). The top 4 make the playoffs: semifinals in week ' + (regWeeks() + 1) + ', the championship in week ' + (regWeeks() + 2) + '.'
      : L.weeks + ' weeks, starting ' + weekDates(1) + '. No playoffs: best record wins, points for breaks ties.';
    return '<div class="page-header"><h2>How It Works</h2><button class="btn-sm btn-ghost" data-act="nav" data-page="settings">Back to Settings</button></div>' +
      '<div class="ru-grid">' +
      sec('The week', '<p>Every week you face one team in your league. Your 5 starters’ scores are added up; most points wins. ' + cal + '</p>') +
      sec('Lock-in', '<ol class="ru-steps"><li>When a starter finishes a game, you see his score.</li><li><b>Lock</b> keeps it for the week. <b>Pass</b> skips it and waits for his next game.</li><li>A lock is final. If you never lock, his most recent game counts.</li><li>A game he sits out counts as 0, so watch for injuries.</li><li>Only games played while he is in your lineup count. Bench games don’t.</li></ol>') +
      sec('Lineup', '<p>Starters: <b>G, G, F, F, UTIL</b>. Centers play F or UTIL. You can swap any starter who isn’t locked, any time before his game.</p>') +
      sec('Scoring', '<ul class="ru-score">' + scoring + '</ul><p class="ru-note">Per stat. Set by the commissioner in Settings.</p>') +
      sec('Draft', '<p>Snake draft, ' + L.rosterSize + ' rounds, ' + fmtClock(draftCfg().timerSecs) + ' per pick. If your clock runs out, the top player in your queue is taken, or the best available. Every roster needs at least 2 guards and 2 forwards.</p>') +
      sec('Free agents & waivers', '<p>' + (f.type === 'faab' ? 'FAAB: every team gets a $' + f.budget + ' budget; highest blind bid wins a player, ties go to waiver order.' : 'Rolling waivers: claims are processed in priority order and a successful claim sends you to the back of the line.') + ' Claims run when each week ends. Players nobody claims become free agents you can add instantly.</p>') +
      sec('Trades', '<p>' + (tr.review === 'commish' ? 'Accepted trades go to the commissioner for approval.' : 'Accepted trades go through right away.') + ' Trade deadline: end of week ' + tr.deadline + '. No trades in the playoffs.</p>') +
      sec('Injuries', '<p><span class="ss-inj ss-inj-gtd">GTD</span> may sit some games. <span class="ss-inj ss-inj-out">OUT</span> won’t play this week. <span class="ss-inj ss-inj-season">OUT-SZN</span> is done for the year. A player who doesn’t play scores 0, so swap him out before his game.</p>') +
      '</div><div class="ru-again"><button class="g-btn" data-act="exshow">Replay the lock-in walkthrough</button></div>';
  }

  function viewSettings() {
    var L = state.league, d = draftCfg(), u = userTeam(), name = sessionName(), email = sessionEmail();
    var editable = editableDraft(), pr = notifPrefs();
    var notifState = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    var sc = L.scoring || (L.scoring = defaultScoring());
    var html = '<div class="page-header"><h2>Settings</h2></div>';

    // Profile + account
    html += '<div class="settings-profile-row ss-static-row"><div class="spr-avatar">' + avatarHTML(name, 44) + '</div>' +
      '<div class="spr-info"><span class="spr-name">' + esc(name) + '</span><span class="spr-sub">' + esc(u.name) + ' in ' + esc(L.name) + '</span></div></div>';
    html += '<div class="set-label">Account</div><div class="panel set-panel">' +
      setRow('Email', esc(email || 'Not signed in')) +
      setRow('Password', 'Change it from the tournament Settings page', '<button class="set-row-btn" disabled title="Offline in the lab">Change</button>') +
      setRow('Sign Out', 'You’ll stay in your leagues', '<button class="set-row-btn" data-act="signout">Sign Out</button>') +
    '</div>';

    // My leagues
    html += '<div class="set-label">My Leagues</div><div class="panel set-panel">' +
      '<div class="ml-list"><div class="ss-ml-row on"><span class="ss-splash-tag">Season</span><div><b>' + esc(L.name) + '</b><span>' + esc(mobileBarLabel()) + ' · ' + L.numTeams + ' teams</span></div><span class="ss-ml-cur">Current</span></div></div>' +
      '<div class="ml-join-row"><input type="text" class="ml-join-input" id="ssJoinCode" placeholder="Enter league code" maxlength="6" autocapitalize="characters" />' +
        '<button type="button" class="ml-join-btn" data-act="joinleague">Join</button></div>' +
      '<p class="muted ml-hint">Your tournament leagues are under All Leagues. Switching keeps your place in every league.</p>' +
    '</div>';

    html += '<div class="set-label">Invite</div><div class="panel set-panel">' +
      setRow('League code: ' + esc(L.code), 'Share the code or a link with friends', '<button class="set-row-btn" data-act="invite">Invite</button>') +
    '</div>';
    html += '<div class="set-label">How to Play</div><div class="panel set-panel">' +
      setRow('How it works', 'Lock-in, lineups, scoring, waivers, trades', '<button class="set-row-btn" data-act="nav" data-page="rules">Open</button>') +
      setRow('Lock-in walkthrough', 'The 3-card intro', '<button class="set-row-btn" data-act="exshow">Show</button>') +
    '</div>';
    // League rules: scoring + timer + format
    html += '<div class="set-label">League Rules</div>' +
      '<div class="panel"><h3 class="panel-title">Scoring Categories</h3><div class="scoring-grid">' +
      STAT_KEYS.map(function (k) {
        return '<div class="scoring-row"><label class="toggle-label"><input type="checkbox" class="custom-cb-real" data-sc-on="' + k + '"' + (sc[k].on ? ' checked' : '') + ' />' +
          '<span class="custom-cb-box" aria-hidden="true">' + CB_SVG + '</span>' + STAT_LABEL[k] + '</label>' +
          '<div class="weight-group"><label>Weight</label><input type="number" class="weight-input" data-sc-w="' + k + '" value="' + sc[k].w + '" min="0.1" max="10" step="0.1" /></div></div>';
      }).join('') + '</div>' +
      '<p class="ss-hint">Changes apply to every game that hasn’t been played yet. Finished games keep their scores.</p>' +
      '<button class="btn-save" data-act="savescoring">Save Scoring</button></div>';
    var mins = Math.floor(d.timerSecs / 60), secs = d.timerSecs % 60;
    html += '<div class="panel"><h3 class="panel-title">Pick Timer</h3><div class="timer-setup-row">' +
      '<div class="form-group"><label>Minutes</label><select id="ssTimerMin" class="pool-select">' + [0, 1, 2, 3, 4, 5].map(function (m) { return '<option value="' + m + '"' + (m === mins ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>Seconds</label><select id="ssTimerSec" class="pool-select">' + [0, 15, 30, 45].map(function (x) { return '<option value="' + x + '"' + (x === secs ? ' selected' : '') + '>' + (x < 10 ? '0' : '') + x + '</option>'; }).join('') + '</select></div>' +
      '</div>' + (state.phase !== 'draft' ? '<p class="ss-hint">The draft is over. This applies if you restart the league.</p>' : '') +
      '<button class="btn-save" data-act="savetimer">Save Timer</button></div>';
    var fw = faCfg();
    html += '<div class="panel"><h3 class="panel-title">Waivers</h3>' +
      '<div class="timer-setup-row"><div class="form-group"><label>Waiver type</label><select id="ssWType" class="pool-select">' +
        '<option value="rolling"' + (fw.type === 'rolling' ? ' selected' : '') + '>Rolling priority</option><option value="faab"' + (fw.type === 'faab' ? ' selected' : '') + '>FAAB (blind bidding)</option></select></div>' +
        '<div class="form-group"><label>FAAB budget</label><input type="number" id="ssWBudget" min="1" max="1000" step="1" value="' + fw.budget + '" /></div></div>' +
      '<p class="ss-hint">Dropped players sit on waivers until the next week starts (Mondays). Rolling: the claimer with the best priority wins and moves to the back. FAAB: highest blind bid wins. Switching types resets budgets.</p>' +
      '<button class="btn-save" data-act="savewaivers">Save Waivers</button></div>';
    var tc = trCfg();
    html += '<div class="panel"><h3 class="panel-title">Trades</h3>' +
      '<div class="timer-setup-row"><div class="form-group"><label>Trade review</label><select id="ssTrReview" class="pool-select">' +
        '<option value="none"' + (tc.review === 'none' ? ' selected' : '') + '>Instant when accepted</option><option value="commish"' + (tc.review === 'commish' ? ' selected' : '') + '>Commissioner approves</option></select></div>' +
        '<div class="form-group"><label>Trade deadline</label><select id="ssTrDeadline" class="pool-select">' + Array.apply(null, { length: regWeeks() }).map(function (x, k) { return '<option value="' + (k + 1) + '"' + (tc.deadline === k + 1 ? ' selected' : '') + '>End of week ' + (k + 1) + ' (' + weekDates(k + 1) + ')</option>'; }).join('') + '</select></div></div>' +
      '<p class="ss-hint">No trades during the playoffs. Offers expire when the week ends.</p>' +
      '<button class="btn-save" data-act="savetrades">Save Trades</button></div>';
    html += '<div class="panel"><h3 class="panel-title">Season Format</h3>' +
      setRow('Format', L.format === 'conference' ? 'Conference Play' : 'Full Season') +
      (L.format === 'conference' ? setRow('Conferences', esc(!L.conferences || L.conferences.length === 5 ? 'All 5 power conferences' : L.conferences.length === 1 ? L.conferences[0] + ' only' : L.conferences.join(', '))) : '') +
      setRow('Starting lineup', 'G, G, F, F, UTIL. Everyone else is bench.') +
      setRow('Regular season', regWeeks() + ' weeks from ' + weekDates(1).split('–')[0]) +
      (L.playoffWeeks ? setRow('Playoffs', 'Top 4. Semifinals ' + weekDates(regWeeks() + 1) + ', championship ' + weekDates(regWeeks() + 2)) : '') +
      setRow('Lock-in', 'One locked game per starter per week. Unlocked slots keep their latest game.') +
      '<p class="ss-hint">Format and conferences are set when the league is created.</p></div>';

    // Notifications
    var pills = { granted: ['On', 'status-on'], denied: ['Blocked', 'status-off'], 'default': ['Off', 'status-off'], unsupported: ['Not supported', 'status-off'] };
    var on = pr.master && notifState === 'granted';
    html += '<div class="set-label">Notifications</div><div class="panel">' +
      '<div class="sc-settings-row"><label class="toggle-label"><input type="checkbox" class="custom-cb-real" data-act="notifmaster"' + (on ? ' checked' : '') + (notifState === 'unsupported' || notifState === 'denied' ? ' disabled' : '') + ' />' +
        '<span class="custom-cb-box" aria-hidden="true">' + CB_SVG + '</span>“On the Clock” alerts</label>' +
        '<span class="status-pill ' + (on ? 'status-on' : pills[notifState][1]) + '">' + (on ? 'On' : pills[notifState][0]) + '</span></div>' +
      '<p class="muted" style="margin-top:8px;font-size:13px;">' + (notifState === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then come back.' :
        'Get a browser notification when it’s your pick or a lock decision is waiting, even if the app is in the background.') + '</p>' +
      '<div class="notif-prefs' + (on ? '' : ' ss-np-off') + '"><div class="notif-prefs-head">Alert me about</div>' +
      [['draftSoon', 'Draft starting soon', '15 minutes before the scheduled start'],
       ['onClock', 'Your pick', 'You’re on the clock in the draft'],
       ['pickMade', 'Pick made', 'Someone drafts a player'],
       ['lockDecision', 'Lock decision waiting', 'One of your starters finished a game'],
       ['weekFinal', 'Matchup final', 'Your weekly result is in'],
       ['waivers', 'Waivers processed', 'Your claims were won or lost'],
       ['trades', 'Trades', 'Offers, answers and approvals'],
       ['injuries', 'Injuries', 'One of your players is hurt or back'],
       ['rankChange', 'Standings change', 'You move up or down a spot'],
       ['managerJoined', 'Manager joined', 'Someone new enters your league']].map(function (n) {
        return '<label class="notif-pref"><span class="np-main"><span class="np-title">' + n[1] + '</span><span class="np-sub">' + n[2] + '</span></span>' +
          '<input type="checkbox" class="np-switch" data-np="' + n[0] + '"' + (pr[n[0]] ? ' checked' : '') + (on ? '' : ' disabled') + ' /><span class="np-track" aria-hidden="true"></span></label>';
      }).join('') + '</div></div>';

    // Commissioner
    html += '<div class="set-label">Commissioner</div>';
    var r1 = round1();
    html += '<div class="panel"><h3 class="panel-title">Draft Setup</h3>' +
      '<div class="form-group" style="margin-bottom:18px;"><label>League Name</label><input type="text" id="ssSetName" value="' + esc(L.name) + '" maxlength="40" /></div>' +
      '<div class="ds-rounds-row"><span class="ds-label">Rounds</span><div class="ds-stepper">' +
        '<button type="button" class="ds-step-btn" data-act="rounds" data-dir="-1"' + (editable && L.rosterSize > 8 ? '' : ' disabled') + '>−</button>' +
        '<span>' + L.rosterSize + '</span>' +
        '<button type="button" class="ds-step-btn" data-act="rounds" data-dir="1"' + (editable && L.rosterSize < 12 ? '' : ' disabled') + '>+</button></div></div>' +
      '<div class="ds-section-header"><span class="ds-section-title">Draft Order</span><span class="ds-hint">' + (editable ? 'Round 1. Snake order after that.' : 'Locked once the draft starts') + '</span></div>' +
      '<ul class="ds-order-list">' + r1.map(function (tid, i) {
        var t = team(tid);
        return '<li class="ds-item ss-ds-item"><span class="ds-pick-num">' + (i + 1) + '</span><span class="ds-name">' + esc(t.name) + (t.isUser ? ' <span class="ds-comm-tag">You</span>' : '') + '</span>' +
          (editable ? '<span class="ss-ds-move"><button class="q-btn" data-act="ordermove" data-i="' + i + '" data-dir="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>&#9650;</button>' +
            '<button class="q-btn" data-act="ordermove" data-i="' + i + '" data-dir="1" aria-label="Move down"' + (i === r1.length - 1 ? ' disabled' : '') + '>&#9660;</button></span>' : '') + '</li>';
      }).join('') + '</ul>' +
      (editable ? '<button class="btn-ghost btn-sm" data-act="orderrandom" style="margin-top:10px;">Randomize Order</button>' : '') +
      '<p class="ds-join-hint">Managers appear here when they join with your league code. In the lab, the other teams are bots.</p>' +
      '<button class="btn-save" data-act="savesetup">Save Draft Setup</button></div>';

    var at = d.scheduledAt;
    var dt = at ? new Date(at) : null;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    html += '<div class="panel"><h3 class="panel-title">Schedule Draft</h3>' +
      '<p class="panel-sub">Set a date and time. Everyone in your league sees a countdown, and the draft starts automatically when it’s time.</p>' +
      (at && d.status === 'pre' ? '<div class="sd-current" style="display:flex;"><div class="sd-current-left"><span class="sd-current-label">Draft scheduled for</span><span class="sd-current-time">' + fmtWhen(at) + '</span>' +
        '<span class="sd-countdown">Starts in <b data-ss-countdown="1">' + countdownText(at) + '</b></span></div><button type="button" class="sd-clear-btn" data-act="clearschedule">Clear</button></div>' : '') +
      (d.status === 'pre' ? '<div class="sd-inputs"><div class="form-group"><label>Date</label><input type="date" id="ssSdDate" value="' + (dt ? dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) : '') + '" /></div>' +
        '<div class="form-group"><label>Time</label><input type="time" id="ssSdTime" value="' + (dt ? pad(dt.getHours()) + ':' + pad(dt.getMinutes()) : '') + '" /></div></div>' +
        '<button class="btn-save" data-act="saveschedule">' + (at ? 'Update Schedule' : 'Schedule Draft') + '</button>' :
        '<p class="ss-hint">The draft has already started.</p>') + '</div>';

    html += '<div class="panel"><h3 class="panel-title">League Management</h3>' +
      '<div class="form-group"><label>League Code</label><div class="code-display-row"><span class="league-code-badge">' + esc(L.code || (L.code = code6())) + '</span>' +
        '<button class="btn-ghost btn-sm" data-act="copycode">Copy Code</button><button class="btn-ghost btn-sm" data-act="copyinvite">Invite Link</button></div></div>' +
      '<div class="set-divide"></div>' +
      setRow('Restart League', 'Clears every pick and every week, and resets the draft to round one. Teams, settings and the league code stay the same.', '<button class="set-row-btn" data-act="restart">Restart</button>', ' set-row--stack') +
      setRow('Delete League', 'Permanently deletes this league for every manager in it. This cannot be undone.', '<button class="set-row-btn set-row-btn--danger" data-act="reset">Delete</button>', ' set-row--stack') +
    '</div>';

    html += '<div class="set-label set-label--danger">Danger Zone</div><div class="panel panel--danger">' +
      setRow('Leave League', 'Removes you from this league. Your other leagues are untouched.', '<button class="set-row-btn set-row-btn--warn" data-act="leave">Leave</button>') +
    '</div>';
    return html;
  }
  function copyText(t, okMsg) {
    var done = function () { notify(okMsg, 'success'); };
    try { navigator.clipboard.writeText(t).then(done, function () { notify(t, 'info'); }); } catch (e) { notify(t, 'info'); }
  }

  // ── Events ──────────────────────────────────────────────
  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    var act = el.getAttribute('data-act');
    var i = +el.getAttribute('data-i');
    switch (act) {
      case 'exit': close(); return;
      case 'nav': ui.page = el.getAttribute('data-page'); ui.swapSlot = null; ui.sheet = false; ui.mview = null; break;
      case 'sheet': ui.sheet = !ui.sheet; break;
      case 'wizopen': ui.wiz = 0; break;
      case 'wiznext': if (el.disabled) return; ui.wiz = Math.min(wizSteps().length - 1, ui.wiz + 1); break;
      case 'setfmt': ui.setup.format = el.getAttribute('data-v'); break;
      case 'confmode':
        ui.setup.confMode = el.getAttribute('data-v');
        if (ui.setup.confMode === 'one') ui.setup.conferences = [ui.setup.conferences[0] || 'Big Ten'];
        else ui.setup.conferences = MAJORS.slice();
        break;
      case 'conftoggle':
        var cn = el.getAttribute('data-v');
        if (ui.setup.confMode === 'one') { ui.setup.conferences = [cn]; break; }
        var cur = ui.setup.conferences.length ? ui.setup.conferences.slice() : MAJORS.slice();
        var at = cur.indexOf(cn);
        if (at >= 0) { if (cur.length > 2) cur.splice(at, 1); else ui.toastMsg = 'A mix needs at least 2 conferences. Switch to One conference for a single league.'; }
        else cur.push(cn);
        ui.setup.conferences = MAJORS.filter(function (m) { return cur.indexOf(m) >= 0; });
        break;
      case 'wizback':
        if (ui.wiz === 0) { ui.wiz = null; if (!state) { close(); return; } }
        else ui.wiz--;
        break;
      case 'create':
        if (!poolOk()) return;
        createLeague({
          timerSecs: ui.setup.timer, format: ui.setup.format, conferences: ui.setup.format === 'conference' ? ui.setup.conferences : null,
          name: ui.setup.name.trim() || 'Season League', teamName: ui.setup.team.trim(),
          numTeams: ui.setup.teams, rosterSize: ui.setup.roster, weeks: ui.setup.weeks
        });
        ui.wiz = null; ui.page = 'home';
        if (!explainerSeen()) ui.explain = 0;
        else { ui.toastMsg = 'League created. Start the draft when everyone’s ready.'; ui.toastType = 'success'; }
        break;
      case 'opt': ui.setup[el.getAttribute('data-k')] = +el.getAttribute('data-v'); break;
      case 'pick':
        var pid = el.getAttribute('data-id'), rule = pickAllowed(userTeam().id, pid);
        if (!draftLive() || !team(onClock()).isUser) return;
        if (!rule.ok) { notify(rule.reason, 'error'); return; }
        ui.pcard = null; ui.confirmId = pid; break;
      case 'cancelpick':
        if (e.target !== el && el.classList.contains('modal-backdrop')) return;   // clicks inside the card
        ui.confirmId = null; break;
      case 'confirmpick':
        if (!ui.confirmId || !draftLive() || !team(onClock()).isUser) { ui.confirmId = null; break; }
        var cp = ui.confirmId; ui.confirmId = null; ui.search = '';
        livePick(userTeam().id, cp, 'user');
        if (state.phase !== 'draft') { ui.page = 'lineup'; ui.toastMsg = 'Draft complete. Set your week 1 lineup.'; ui.toastType = 'success'; }
        break;
      case 'autopick':
        if (!draftLive() || !team(onClock()).isUser) return;
        var ap = queueChoice() || botChoose(userTeam().id);
        livePick(userTeam().id, ap, 'auto');
        if (state.phase !== 'draft') { ui.page = 'lineup'; ui.toastMsg = 'Draft complete. Set your week 1 lineup.'; ui.toastType = 'success'; }
        break;
      case 'simdraft': if (draftCfg().status === 'pre') startDraft(); simToUser(); break;
      case 'startdraft': startDraft(); ui.page = 'draft'; ui.toastMsg = 'The draft is live.'; ui.toastType = 'success'; break;
      case 'pausedraft': pauseDraft(); break;
      case 'resumedraft': resumeDraft(); break;
      case 'queue': toggleQueue(el.getAttribute('data-id')); break;
      case 'qmove': moveQueue(el.getAttribute('data-id'), +el.getAttribute('data-dir')); break;
      case 'qclear': draftCfg().queue = []; save(); break;
      case 'simday': simDay(); ui.sel = {}; break;
      case 'simweek':
        ui.sel = {};
        var startDay = state.day;
        do { simDay(); } while (state.day <= 6 && !hasPending());
        if (state.day <= 6 && state.day !== startDay) { ui.toastMsg = 'Paused after ' + DAYS_FULL[state.day - 1] + '. You have a lock decision.'; ui.toastType = 'info'; }
        break;
      case 'nextweek':
        ui.sel = {}; ui.mview = null;
        nextWeek(); ui.swapSlot = null;
        if (state.phase === 'done') { ui.page = 'standings'; ui.toastMsg = team(championId()).name + (state.champion ? ' win the championship.' : ' finish first.'); ui.toastType = 'success'; }
        else if (state.week === regWeeks() + 1) { ui.toastMsg = 'Playoffs set. Top 4 are in the semifinals.'; ui.toastType = 'success'; }
        break;
      case 'lock': lockSlot(userTeam().id, i); ui.stamp = i; break;
      case 'pass': passSlot(userTeam().id, i); break;
      case 'swap': ui.swapSlot = ui.swapSlot === i ? null : i; break;
      case 'mview': ui.mview = +el.getAttribute('data-i'); break;
      case 'selgame': ui.sel[el.getAttribute('data-k')] = +el.getAttribute('data-g'); break;
      case 'swapto': swapInto(i, el.getAttribute('data-id')); ui.swapSlot = null; break;
      case 'ptab': ui.ptab = el.getAttribute('data-v'); break;
      case 'labtoggle': ui.lab = !ui.lab; break;
      case 'invite': ui.invite = true; ui.ivCopied = null; break;
      case 'ivclose':
        if (e.target !== el && el.classList.contains('pc-backdrop')) return;
        ui.invite = false; break;
      case 'ivcopy':
        var what = el.getAttribute('data-v');
        copyToClipboard(what === 'code' ? state.league.code : inviteLink()).then(function () { ui.ivCopied = what; render(); });
        return;
      case 'ivshare':
        try { navigator.share({ title: 'Join ' + state.league.name + ' on Tipoff Fantasy', text: 'Join my college hoops league. Code: ' + state.league.code, url: inviteLink() }).catch(function () {}); } catch (er) { /* ignore */ }
        return;
      case 'pcard': ui.pcard = el.getAttribute('data-id'); break;
      case 'pcclose':
        if (e.target !== el && el.classList.contains('pc-backdrop')) return;
        ui.pcard = null; break;
      case 'pcgo': ui.pcard = null; ui.page = el.getAttribute('data-page'); break;
      case 'chatsend': e.preventDefault(); if (!sendChat()) return; break;
      case 'exstep': ui.explain = +el.getAttribute('data-v'); break;
      case 'exdone': ui.explain = null; markExplainerSeen(); break;
      case 'exshow': ui.explain = 0; break;
      case 'exrules': ui.explain = null; markExplainerSeen(); ui.page = 'rules'; break;
      case 'tkgo': ui.page = 'matchup'; ui.mview = +el.getAttribute('data-i'); break;
      case 'trgo': ui.page = 'players'; ui.ptab = 'trades'; break;
      case 'tropen':
        var to = tradesOpen(); if (!to.ok) { notify(to.reason, 'error'); return; }
        ui.pcard = null;
        ui.tr = { to: el.getAttribute('data-id') || null, give: [], get: el.getAttribute('data-get') ? [el.getAttribute('data-get')] : [] }; break;
      case 'trclose':
        if (e.target !== el && el.classList.contains('modal-backdrop')) return;
        ui.tr = null; break;
      case 'trpick':
        var arr = ui.tr[el.getAttribute('data-k')], v = el.value, at2 = arr.indexOf(v);
        if (at2 >= 0) arr.splice(at2, 1); else arr.push(v);
        break;
      case 'trsend':
        var sr = proposeTrade(userTeam().id, ui.tr.to, ui.tr.give, ui.tr.get);
        if (!sr.ok) { notify(sr.reason, 'error'); return; }
        ui.toastMsg = 'Offer sent to ' + team(ui.tr.to).name + '. They’ll answer as the next day is played.'; ui.toastType = 'success';
        ui.tr = null; ui.page = 'players'; ui.ptab = 'trades'; break;
      case 'tracc': case 'trdec': case 'trcancel': case 'trok': case 'trveto':
        var trx = trCfg().list.filter(function (x) { return x.id === i; })[0]; if (!trx) return;
        if (act === 'tracc') { respondTrade(trx, true); ui.toastMsg = trx.status === 'done' ? 'Trade complete.' : trx.status === 'review' ? 'Accepted. Waiting on commissioner approval.' : (trx.note || 'The trade couldn’t go through.'); ui.toastType = trx.status === 'failed' ? 'error' : 'success'; }
        if (act === 'trdec') respondTrade(trx, false);
        if (act === 'trcancel') trx.status = 'cancelled';
        if (act === 'trok') { approveTrade(trx, true); ui.toastMsg = trx.status === 'done' ? 'Trade approved and processed.' : (trx.note || 'The trade couldn’t go through.'); ui.toastType = trx.status === 'done' ? 'success' : 'error'; }
        if (act === 'trveto') approveTrade(trx, false);
        save(); break;
      case 'savetrades':
        var rv = (document.getElementById('ssTrReview') || {}).value, dl = +(document.getElementById('ssTrDeadline') || {}).value;
        trCfg().review = rv === 'commish' ? 'commish' : 'none'; trCfg().deadline = dl || trCfg().deadline; save();
        ui.toastMsg = 'Trade settings saved.'; ui.toastType = 'success'; break;
      case 'faopen': ui.pcard = null; ui.faId = el.getAttribute('data-id'); ui.faDrop = null; ui.faBid = null; break;
      case 'faclose':
        if (e.target !== el && el.classList.contains('modal-backdrop')) return;
        ui.faId = null; break;
      case 'fadrop': ui.faDrop = el.value || null; break;
      case 'faconfirm':
        var bidEl = document.getElementById('ssBid'); if (bidEl) ui.faBid = bidEl.value;
        var fp = ui.faId, res = playerStatus(fp) === 'waivers' ? placeClaim(userTeam().id, fp, ui.faDrop, ui.faBid) : addFreeAgent(userTeam().id, fp, ui.faDrop);
        if (!res.ok) { notify(res.reason, 'error'); return; }
        ui.toastMsg = playerStatus(fp) === 'waivers' ? 'Claim placed for ' + P(fp).name + '.' : 'Added ' + P(fp).name + (ui.faDrop ? ', dropped ' + P(ui.faDrop).name : '') + '.';
        ui.toastType = 'success'; ui.faId = null; break;
      case 'ccancel': cancelClaim(i); break;
      case 'cmove': moveClaim(i, +el.getAttribute('data-dir')); break;
      case 'dropone':
        if (!el.classList.contains('confirm')) { el.classList.add('confirm'); el.textContent = 'Tap to drop'; return; }
        var dr = dropOnly(userTeam().id, el.getAttribute('data-id'));
        if (!dr.ok) { notify(dr.reason, 'error'); return; }
        ui.toastMsg = 'Dropped. He’s on waivers until ' + (nextProcessing() || 'next week') + '.'; ui.toastType = 'info'; break;
      case 'savewaivers':
        var wt = (document.getElementById('ssWType') || {}).value, wb = parseInt((document.getElementById('ssWBudget') || {}).value, 10);
        var fc = faCfg();
        if (wt === 'faab' && !(wb >= 1 && wb <= 1000)) { notify('Budget must be between $1 and $1000.', 'error'); return; }
        if (wt !== fc.type || (wt === 'faab' && wb !== fc.budget)) {
          fc.type = wt; if (wt === 'faab') { fc.budget = wb; state.teams.forEach(function (t) { fc.budgets[t.id] = wb; }); }
          fc.claims.forEach(function (c) { c.bid = wt === 'faab' ? 0 : null; });
        }
        save(); ui.toastMsg = 'Waiver settings saved.'; ui.toastType = 'success'; break;
      case 'signout':
        close();
        var so = document.getElementById('signOutBtn'); if (so) so.click();
        return;
      case 'joinleague':
        var jc = ((document.getElementById('ssJoinCode') || {}).value || '').trim().toUpperCase();
        if (jc.length !== 6) { notify('Enter the 6-character league code.', 'info'); return; }
        //  Was a dead end while the lab had no shared database. It
        //  resolves against Firestore now, so the same dialog the
        //  invite link uses is reused here.
        notify('Looking up ' + jc + '…', 'info');
        lookupSeasonLeague(jc).then(function (info) {
          if (info && info.error) { notify(joinErrorText(info.error), 'error'); return; }
          if (info) { showSeasonJoin(info, jc); return; }
          //  The hint under this box says tournament leagues live in
          //  All Leagues, so a tournament code typed here used to be
          //  rejected outright. Hand it to the tournament flow instead
          //  of blaming the code.
          close();
          var tInput = document.getElementById('joinCodeInput');
          var tBtn = document.getElementById('joinConfirmBtn');
          var tModal = document.getElementById('joinModal');
          if (!tInput || !tBtn) { notify('No league found with that code.', 'error'); return; }
          if (tModal) tModal.style.display = 'flex';
          tInput.value = jc;
          bypassJoin = true;
          try { tBtn.click(); } finally { bypassJoin = false; }
        }).catch(function () { notify('Could not reach the league database.', 'error'); });
        return;
      case 'savescoring':
        var scn = state.league.scoring || defaultScoring();
        root.querySelectorAll('[data-sc-on]').forEach(function (cb) { scn[cb.getAttribute('data-sc-on')].on = cb.checked; });
        var bad = false;
        root.querySelectorAll('[data-sc-w]').forEach(function (inp) {
          var v = parseFloat(inp.value); if (!(v >= 0.1 && v <= 10)) bad = true; else scn[inp.getAttribute('data-sc-w')].w = Math.round(v * 10) / 10;
        });
        if (bad) { notify('Weights must be between 0.1 and 10.', 'error'); return; }
        if (!STAT_KEYS.some(function (k) { return scn[k].on; })) { notify('Keep at least one scoring category on.', 'error'); return; }
        state.league.scoring = scn; applyScoring();
        ui.toastMsg = 'Scoring saved.'; ui.toastType = 'success'; break;
      case 'savetimer':
        var tm = +(document.getElementById('ssTimerMin') || {}).value || 0, ts = +(document.getElementById('ssTimerSec') || {}).value || 0;
        if (tm * 60 + ts < 15) { notify('The pick timer needs at least 15 seconds.', 'error'); return; }
        draftCfg().timerSecs = tm * 60 + ts; save();
        ui.toastMsg = 'Pick timer set to ' + fmtClock(tm * 60 + ts) + (draftLive() ? '. It starts with the next pick.' : '.'); ui.toastType = 'success'; break;
      case 'notifmaster':
        if (el.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission().then(function (perm) { setNotifPref('master', perm === 'granted'); render(); });
          return;
        }
        setNotifPref('master', el.checked && canNotify()); break;
      case 'rounds':
        var want = state.league.rosterSize + +el.getAttribute('data-dir');
        if (!setRounds(want)) { notify('Not enough players in your conferences for ' + want + ' rounds.', 'error'); return; }
        break;
      case 'ordermove': moveInOrder(i, +el.getAttribute('data-dir')); break;
      case 'orderrandom': randomizeOrder(); break;
      case 'savesetup':
        var nm = ((document.getElementById('ssSetName') || {}).value || '').trim();
        if (!nm) { notify('Give your league a name.', 'error'); return; }
        state.league.name = nm.slice(0, 40); save();
        ui.toastMsg = 'Draft setup saved.'; ui.toastType = 'success'; break;
      case 'saveschedule':
        var dv = (document.getElementById('ssSdDate') || {}).value, tv = (document.getElementById('ssSdTime') || {}).value;
        if (!dv || !tv) { notify('Pick a date and a time.', 'error'); return; }
        var when = new Date(dv + 'T' + tv).getTime();
        if (!(when > Date.now())) { notify('Pick a time in the future.', 'error'); return; }
        draftCfg().scheduledAt = when; state.draft.soonSent = false; save();
        ui.toastMsg = 'Draft scheduled for ' + fmtWhen(when) + '.'; ui.toastType = 'success'; break;
      case 'clearschedule': draftCfg().scheduledAt = null; save(); break;
      case 'copycode': copyText(state.league.code, 'League code copied.'); return;
      case 'copyinvite': copyText(location.origin + location.pathname + '?join=' + state.league.code, 'Invite link copied.'); return;
      case 'restart':
        if (!el.classList.contains('confirm')) { el.classList.add('confirm'); el.textContent = 'Tap again'; return; }
        restartLeague(); ui.page = 'home'; ui.toastMsg = 'League restarted. The draft is back to round one.'; ui.toastType = 'success'; break;
      case 'leave':
        if (!el.classList.contains('confirm')) { el.classList.add('confirm'); el.textContent = 'Tap again'; return; }
        state = null; try { localStorage.removeItem(STORE_KEY); } catch (er) { /* ignore */ }
        close(); return;
      case 'reset':
        if (!el.classList.contains('confirm')) { el.classList.add('confirm'); el.textContent = 'Tap again to delete'; return; }
        state = null; try { localStorage.removeItem(STORE_KEY); } catch (er) { /* ignore */ }
        close(); return;
    }
    render();
  }
  function hasPending() {
    return slotsOf(userTeam().id).some(function (s) { return s.pending && !s.locked; });
  }
  function onInput(e) {
    if (e.target.id === 'ssName') { ui.setup.name = e.target.value; return; }
    if (e.target.id === 'ssTeam') { ui.setup.team = e.target.value; return; }
    if (e.target.id === 'ssBid') { ui.faBid = e.target.value; return; }
    if (e.target.id === 'ssChatInput') { ui.chatDraft = e.target.value; return; }
    if (e.target.id === 'ssSearch') {
      ui.search = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var el = document.getElementById('ssSearch');
      if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (er) { /* ignore */ } }
    }
  }
  function onChange(e) {
    if (e.target.id === 'ssPos') { ui.filterPos = e.target.value; render(); }
    if (e.target.id === 'ssConf') { ui.filterConf = e.target.value; render(); }
    if (e.target.id === 'ssFStatus') { ui.fstatus = e.target.value; render(); }
    if (e.target.id === 'ssTrTeam') { ui.tr = { to: e.target.value, give: ui.tr.give, get: [] }; render(); }
    if (e.target.id === 'ssFSort') { ui.fsort = e.target.value; render(); }
    if (e.target.getAttribute && e.target.getAttribute('data-np')) setNotifPref(e.target.getAttribute('data-np'), e.target.checked);
  }
  function onKey(e) {
    if (e.key === 'Escape' && ui.sheet) { ui.sheet = false; render(); }
    if (e.key === 'Escape' && ui.explain != null) { ui.explain = null; markExplainerSeen(); render(); }
    if (e.key === 'Escape' && ui.pcard) { ui.pcard = null; render(); }
    if (e.key === 'Escape' && ui.invite) { ui.invite = false; render(); }
    if (e.key === 'Enter' && ui.wiz !== null && e.target.classList && e.target.classList.contains('tut-input')) {
      var next = root.querySelector('.tut-next-btn'); if (next) next.click();
    }
  }

  // ── Open / close ────────────────────────────────────────
  var prevDisplay = null;
  function open() {
    root = document.getElementById('seasonApp');
    if (!root) return;
    state = load();
    markMine();
    // Reconnect to the shared league so other managers' picks and
    // lineups arrive while this device is open.
    if (state && state.league && state.league.code) subscribeSeason(state.league.code);
    resetPool();

    //  Pull real box scores for the current week on open, then keep
    //  checking while the app is up: games finish, and a week that
    //  was simulated at kickoff becomes real as results land.
    if (state && state.week) upgradeWeekToReal(state.week);
    clearInterval(open._statsTick);
    open._statsTick = setInterval(function () {
      if (state && state.week) upgradeWeekToReal(state.week);
    }, 90000);
    ui.setup = { name: 'Season League', team: sessionName() === 'You' ? 'My Team' : sessionName() + "'s Team", teams: 8, roster: 10, weeks: 12, timer: 90,
      format: 'conference', confMode: 'mix', conferences: MAJORS.slice() };
    ui.page = 'home'; ui.wiz = state ? null : 0; ui.explain = state && !explainerSeen() ? 0 : null; ui.sheet = false; ui.swapSlot = null; ui.search = ''; ui.filterPos = ''; ui.filterConf = ''; ui.confirmId = null; ui.faId = null; ui.tr = null; ui.ptab = 'fa'; ui.fstatus = ''; ui.fsort = 'proj';
    lastPage = '';
    var splash = document.getElementById('splashScreen');
    if (splash) { prevDisplay = splash.style.display; splash.style.display = 'none'; }
    root.style.display = 'block';
    document.body.classList.add('ss-open');
    clearInterval(open._tick);
    open._tick = setInterval(function () { try { draftTick(); } catch (er) { console.warn('[Season] tick', er); } }, 250);
    if (!root._wired) {
      root.addEventListener('click', onClick);
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
      root.addEventListener('keydown', onKey);
      root._wired = true;
    }
    render();
  }
  function close() {
    clearInterval(open._tick);
    clearInterval(open._statsTick);
    // Drop the listener; leaving it running would keep applying
    // remote state to a module nobody is looking at.
    unsubscribeSeason();
    var pa = document.getElementById('ssPickAnnounce'); if (pa) pa.style.display = 'none';
    if (root) { root.style.display = 'none'; root.innerHTML = ''; }
    document.body.classList.remove('ss-open');
    var splash = document.getElementById('splashScreen');
    if (splash) { splash.style.display = prevDisplay && prevDisplay !== 'none' ? prevDisplay : 'flex'; splash.style.opacity = ''; }
    renderSplashCard();
  }

  // ── League-type chooser on "+ Create League" ────────────
  //  Intercepts the splash button in the capture phase so app.js is
  //  untouched. "Tournament" re-fires the original click with a bypass
  //  flag; "Regular Season" opens this module.
  var bypass = false;
  function showModeChooser() {
    var bd = document.createElement('div');
    bd.className = 'mode-backdrop';
    bd.innerHTML =
      '<div class="mode-card" role="dialog" aria-modal="true" aria-labelledby="modeTitle">' +
        '<h3 id="modeTitle">Start a league</h3>' +
        '<p>Choose the format. Everyone who joins with your code plays the same one.</p>' +
        '<div class="mode-opts">' +
          '<button class="mode-opt" data-mode="tournament">' +
            '<svg class="mode-ic" viewBox="0 0 48 48" aria-hidden="true"><path d="M6 10h10v8h8M6 26h10v-8M6 30h10v8h8M6 46h10v-8M24 18v20h8v-10h10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>' +
            '<b>Tournament</b><span>One draft, then players score until their team is knocked out.</span><i>March and in-season events</i></button>' +
          '<button class="mode-opt" data-mode="season">' +
            '<svg class="mode-ic" viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="9" width="36" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M6 18h36M15 5v8M33 5v8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="13" y="25" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="29" y="25" width="6" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>' +
            '<b>Regular season</b><span>Draft 8 to 12 players and face a new opponent every week with lock-in scoring.</span><i>November through March</i></button>' +
        '</div>' +
        //  Joining had no reachable entry point for the one person who
        //  needs it: the season join box lived in season Settings, which
        //  you can only open once you are ALREADY in a season league.
        //  Someone handed a code had nowhere to type it. One box here
        //  serves both modes, because codes are unique across them.
        '<div class="mode-join">' +
          '<label class="mode-join-label" for="modeJoinCode">Got a code from a friend?</label>' +
          '<div class="mode-join-row">' +
            '<input type="text" id="modeJoinCode" class="mode-join-input" placeholder="ABC123" maxlength="6" ' +
              'autocapitalize="characters" autocomplete="off" spellcheck="false" inputmode="text" />' +
            '<button type="button" class="mode-join-btn" data-mode="join">Join</button>' +
          '</div>' +
          '<p class="mode-join-msg" id="modeJoinMsg" role="status" aria-live="polite"></p>' +
        '</div>' +
        '<button class="mode-cancel" data-mode="cancel">Cancel</button>' +
      '</div>';
    document.body.appendChild(bd);
    requestAnimationFrame(function () { bd.classList.add('in'); });
    function onKey(ev) {
      if (ev.key === 'Escape') { finish('cancel'); return; }
      //  Phone keyboards show "Go", not a Join button they can see
      //  while the keyboard is up. Enter has to work.
      if (ev.key === 'Enter' && ev.target && ev.target.id === 'modeJoinCode') {
        ev.preventDefault(); finish('join');
      }
    }
    document.addEventListener('keydown', onKey);
    //  Resolve a code without closing the dialog, so a typo can be
    //  corrected in place instead of starting the flow over.
    function tryJoin() {
      var inp = bd.querySelector('#modeJoinCode');
      var msg = bd.querySelector('#modeJoinMsg');
      var btn = bd.querySelector('.mode-join-btn');
      var code = ((inp && inp.value) || '').trim().toUpperCase();
      function say(text, kind) {
        if (!msg) return;
        msg.textContent = text || '';
        msg.className = 'mode-join-msg' + (kind ? ' is-' + kind : '');
      }
      if (!/^[A-Z0-9]{6}$/.test(code)) { say('League codes are six letters and numbers.', 'err'); if (inp) inp.focus(); return; }
      if (!myUid()) { say('Sign in first, then join with your code.', 'err'); return; }
      if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
      say('Looking up ' + code + '…', '');

      function reset() { if (btn) { btn.disabled = false; btn.textContent = 'Join'; } }

      lookupSeasonLeague(code).then(function (info) {
        if (info && info.error) { reset(); say(joinErrorText(info.error), 'err'); return; }
        if (info) {
          // A season league. Hand off to the join sheet.
          document.removeEventListener('keydown', onKey);
          bd.remove();
          showSeasonJoin(info, code);
          return;
        }
        //  Not a season code. It may still be a tournament code, so
        //  hand it to the tournament join modal pre-filled rather than
        //  telling the user it does not exist.
        document.removeEventListener('keydown', onKey);
        bd.remove();
        var tInput = document.getElementById('joinCodeInput');
        var tBtn = document.getElementById('joinConfirmBtn');
        var tModal = document.getElementById('joinModal');
        if (!tInput || !tBtn) { notify('No league found with that code.', 'error'); return; }
        if (tModal) tModal.style.display = 'flex';
        tInput.value = code;
        bypassJoin = true;
        try { tBtn.click(); } finally { bypassJoin = false; }
      }).catch(function () {
        reset(); say('Could not reach the league database.', 'err');
      });
    }

    function finish(mode) {
      if (mode === 'join') { tryJoin(); return; }
      document.removeEventListener('keydown', onKey);
      bd.remove();
      if (mode === 'tournament') {
        bypass = true;
        var btn = document.getElementById('createLeagueSplashBtn');
        if (btn) btn.click();
        bypass = false;
      } else if (mode === 'season') {
        open();
      }
    }
    bd.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b && e.target !== bd) return;
      finish(b ? b.getAttribute('data-mode') : 'cancel');
    });
    var first = bd.querySelector('.mode-opt');
    if (first) first.focus();
  }
  // ── Join a season league ────────────────────────────────
  //  One code box serves both modes: codes are unique, so the season
  //  lookup runs first and falls through to the tournament join.
  //  lookupSeasonLeague is the one place Firestore plugs in:
  //    db.collection('seasonLeagues').doc(code).get()
  //  It resolves { code, name, format, conferences, numTeams, joined,
  //  draftAt, member } or null.
  var bypassJoin = false;
  function lookupSeasonLeague(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return Promise.resolve(null);

    // Already the league open on this device.
    var s = load();
    if (s && s.league && s.league.code === code) {
      return Promise.resolve({ code: code, name: s.league.name, format: s.league.format, conferences: s.league.conferences,
        numTeams: s.league.numTeams, joined: 1, draftAt: s.draft && s.draft.scheduledAt, member: true });
    }

    // Otherwise ask the shared database.
    var ref = seasonDoc(code);
    if (!ref) return Promise.resolve(null);
    return ref.get().then(function (doc) {
      if (!doc.exists) return null;
      var d = doc.data() || {};
      var st = d.state || {};
      var lg = st.league || {};
      var teams = st.teams || [];
      var uid = myUid();
      var taken = teams.filter(function (t) { return t && t.uid; }).length;
      return {
        code: code,
        name: lg.name || 'Season League',
        format: lg.format,
        conferences: lg.conferences,
        numTeams: lg.numTeams || teams.length,
        joined: taken,
        draftAt: st.draft && st.draft.scheduledAt,
        member: !!(uid && teams.some(function (t) { return t && t.uid === uid; })),
        _doc: d
      };
    }).catch(function (e) {
      //  A denied read and a missing league both used to return null,
      //  so a rules problem showed the user "No league found with that
      //  code" — which sent them hunting for a typo in a code that was
      //  perfectly correct. Surface the difference.
      var code = (e && e.code) || '';
      console.warn('[Season] lookup failed:', code, e && e.message);
      if (code === 'permission-denied') {
        return { error: 'permission-denied' };
      }
      return { error: (e && e.message) || 'lookup failed' };
    });
  }

  function joinErrorText(code) {
    if (code === 'permission-denied') {
      return 'The league database is not accepting requests. ' +
             'Firestore rules may not be deployed yet.';
    }
    return 'Could not look up that league. ' + (code || '');
  }

  // ── Join: claim a seat in a league that already exists ──
  //  Seats are the bot teams the league was created with. Claiming
  //  one swaps the bot for a person; `uid` is what marks a seat as
  //  human, so a rejoin from the same account finds its own team
  //  rather than taking a second one.
  function joinSeasonLeague(code) {
    code = String(code || '').trim().toUpperCase();
    var ref = seasonDoc(code);
    var uid = myUid();
    if (!ref) return Promise.reject(new Error('Not connected.'));
    if (!uid) return Promise.reject(new Error('Sign in first.'));

    return ref.get().then(function (doc) {
      if (!doc.exists) throw new Error('No league with that code.');
      var d = doc.data() || {};
      var st = d.state;
      if (!st || !st.teams) throw new Error('That league is not ready yet.');

      var mine = st.teams.filter(function (t) { return t && t.uid === uid; })[0];
      if (!mine) {
        var seat = st.teams.filter(function (t) { return t && !t.uid; })[0];
        if (!seat) throw new Error('That league is full.');
        seat.uid = uid;
        seat.name = sessionName();
        seat.bot = false;
      }

      SYNC.rev = (typeof d.rev === 'number' ? d.rev : 0) + 1;
      return ref.set({ rev: SYNC.rev, state: st, updatedAt: Date.now(), updatedBy: uid }, { merge: true })
        .then(function () {
          SYNC.applying = true;
          try {
            state = st;
            state.games = state.games || {};
            markMine();
            try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { }
          } finally { SYNC.applying = false; }
          subscribeSeason(code);
          return state;
        });
    });
  }
  function showSeasonJoin(info, code) {
    var bd = document.createElement('div');
    bd.className = 'mode-backdrop ss-join';
    var confs = info && info.format === 'conference' ? (!info.conferences || info.conferences.length === 5 ? 'All 5 power conferences' : info.conferences.length === 1 ? info.conferences[0] + ' only' : info.conferences.join(', ')) : 'Full season';
    bd.innerHTML = '<div class="mode-card sj-card" role="dialog" aria-modal="true" aria-labelledby="sjTitle">' + (info ?
      '<span class="ss-splash-tag">Season league</span><h3 id="sjTitle">' + esc(info.name) + '</h3>' +
      '<div class="sj-facts"><div><b>' + info.joined + '/' + info.numTeams + '</b><span>Managers</span></div><div><b>' + esc(confs) + '</b><span>Players from</span></div><div><b>' + (info.draftAt ? esc(new Date(info.draftAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) : 'TBD') + '</b><span>Draft</span></div></div>' +
      (info.member ? '<p>You’re already in this league.</p><div class="sj-actions"><button class="btn-ghost" data-sj="cancel">Close</button><button class="btn-primary" data-sj="open">Open League</button></div>'
        : '<label class="tut-label" for="sjTeam">Your team name</label><input id="sjTeam" class="tut-input" maxlength="30" value="' + esc(sessionName() === 'You' ? 'My Team' : sessionName() + "'s Team") + '" />' +
          '<div class="sj-actions"><button class="btn-ghost" data-sj="cancel">Cancel</button><button class="btn-primary" data-sj="join">Join League</button></div>')
      : '<span class="ss-splash-tag">Season league</span><h3 id="sjTitle">Invite code ' + esc(code) + '</h3>' +
        '<p>No league found with that code. Check it with whoever invited you — codes are six characters and are case-insensitive.</p>' +
        '<div class="sj-actions"><button class="btn-primary" data-sj="cancel">Close</button></div>') +
      '</div>';
    document.body.appendChild(bd);
    requestAnimationFrame(function () { bd.classList.add('in'); });
    bd.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sj]');
      if (!b && e.target !== bd) return;
      var act = b ? b.getAttribute('data-sj') : 'cancel';

      if (act === 'join') {
        if (b.disabled) return;
        b.disabled = true; b.textContent = 'Joining…';
        var nameEl = bd.querySelector('#sjTeam');
        var teamName = (nameEl && nameEl.value || '').trim();

        joinSeasonLeague(code).then(function () {
          // Name the seat we just claimed, then let the league open.
          if (teamName && state && state.teams) {
            var mine = state.teams.filter(function (t) { return t && t.isUser; })[0];
            if (mine) { mine.name = teamName; save(); }
          }
          bd.remove();
          open();
        }).catch(function (err) {
          b.disabled = false; b.textContent = 'Join League';
          var msg = bd.querySelector('.sj-error');
          if (!msg) {
            msg = document.createElement('p');
            msg.className = 'sj-error';
            msg.style.cssText = 'color:#f05252;font-size:13px;margin:10px 0 0;';
            var card = bd.querySelector('.sj-card');
            if (card) card.appendChild(msg);
          }
          msg.textContent = (err && err.message) || 'Could not join. Try again.';
        });
        return;
      }

      bd.remove();
      if (act === 'open') open();
    });
  }
  function interceptJoin(e) {
    var btn = e.target.closest && e.target.closest('#joinConfirmBtn');
    if (!btn || bypassJoin) return;
    var input = document.getElementById('joinCodeInput');
    var code = input ? input.value.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{6}$/.test(code)) return; // let the tournament flow show its own error
    e.preventDefault(); e.stopImmediatePropagation();
    lookupSeasonLeague(code).then(function (info) {
      if (info && info.error) {
        //  A lookup that failed is not the same as a tournament code.
        //  Falling through to the tournament flow here would tell the
        //  user the code was wrong when the database simply refused us.
        notify(joinErrorText(info.error), 'error');
        return;
      }
      if (info) {
        var jm = document.getElementById('joinModal'); if (jm) jm.style.display = 'none';
        showSeasonJoin(info, code);
      } else {
        bypassJoin = true; btn.click(); bypassJoin = false;
      }
    });
  }
  function checkInviteLink() {
    try {
      var params = new URLSearchParams(location.search), code = (params.get('sjoin') || '').toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return;
      params.delete('sjoin');
      history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
      lookupSeasonLeague(code).then(function (info) {
        if (info && info.error) { notify(joinErrorText(info.error), 'error'); return; }
        showSeasonJoin(info, code);
      });
    } catch (e) { /* ignore */ }
  }

  function renderSplashCard() {
    var slot = document.getElementById('seasonLeagueSlot');
    if (!slot) return;
    var s = load();
    if (!s) { slot.innerHTML = ''; return; }
    var sub = s.phase === 'draft' ? 'Drafting, pick ' + (s.draft.pick + 1) + ' of ' + s.draft.order.length :
      s.phase === 'done' ? 'Season complete' : 'Week ' + s.week + ' of ' + s.league.weeks;
    slot.innerHTML = '<button class="ss-splash-card" data-season-open="1"><span class="ss-splash-tag">Season</span>' +
      '<span class="ss-splash-txt"><b>' + esc(s.league.name) + '</b><span>' + esc(sub) + ', ' + s.league.numTeams + ' teams</span></span>' +
      '<span aria-hidden="true">&#8250;</span></button>';
  }
  function wireSplash() {
    document.addEventListener('click', function (e) {
      var create = e.target.closest && e.target.closest('#createLeagueSplashBtn');
      if (create && !bypass) {
        e.preventDefault(); e.stopImmediatePropagation();
        showModeChooser();
        return;
      }
      if (e.target.closest && e.target.closest('[data-season-open]')) open();
      interceptJoin(e);
    }, true);
    setTimeout(checkInviteLink, 1200);
    var splash = document.getElementById('splashScreen');
    renderSplashCard();
    if (splash && window.MutationObserver) {
      new MutationObserver(function () { if (splash.style.display !== 'none') renderSplashCard(); })
        .observe(splash, { attributes: true, attributeFilter: ['style'] });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireSplash);
  else wireSplash();

  window.TipoffSeason = {
    open: open, close: close,
    // exposed for testing in the lab
    _debug: function () { return state; }
  };
})(window, document);
