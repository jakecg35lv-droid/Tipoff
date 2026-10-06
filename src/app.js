/* ══════════════════════════════════════════════════════════
   TIPOFF FANTASY: app.js
   Vanilla JS, no frameworks, localStorage persistence
══════════════════════════════════════════════════════════ */

'use strict';

// ── SCHOOL COLORS (primary color per school, no logos for copyright) ────
const SCHOOL_COLORS = {
  'Auburn': '#E87722',
  'Michigan State': '#18453B',
  'Iowa State': '#C8102E',
  'Texas A&M': '#500000',
  'Michigan': '#00274C',
  'Mississippi': '#CE1126',
  'Marquette': '#003082',
  'Louisville': '#AD0000',
  'Creighton': '#005CA9',
  'New Mexico': '#BA0C2F',
  'San Diego State': '#CC0033',
  'UC San Diego': '#182B49',
  'Yale': '#00356B',
  'Lipscomb': '#4F2D7F',
  'Bryant': '#C8102E',
  'High Point': '#4F2D7F',
  'Duke': '#001A57',
  'Alabama': '#9E1B32',
  'Wisconsin': '#C5050C',
  'Arizona': '#0C234B',
  'Ohio State': '#BB0000',
  'Illinois': '#E84A27',
  'Xavier': '#002F6C',
  'Indiana': '#990000',
  'Iowa': '#FFCD00',
  'Vanderbilt': '#866D4B',
  'McNeese State': '#005DAA',
  'Liberty': '#002868',
  'Morehead State': '#002F6C',
  'Winthrop': '#990000',
  'SIU Edwardsville': '#C8102E',
  'Houston': '#C8102E',
  'Tennessee': '#FF8200',
  'Kentucky': '#0033A0',
  'Purdue': '#CEB888',
  'Gonzaga': '#002967',
  'Baylor': '#003015',
  "St. John's": '#C8102E',
  'Georgia': '#BA0C2F',
  'Florida': '#003087',
  'Oregon': '#154733',
  'Texas': '#BF5700',
  'UCLA': '#2D68C4',
  'Akron': '#005EB8',
  'Long Beach State': '#231F20',
  'Texas Southern': '#002147',
  'Kansas': '#0051A5',
  'UConn': '#000E2F',
  'Arkansas': '#9D2235',
  'North Carolina': '#4B9CD3',
  'Villanova': '#003366',
  'Clemson': '#F66733',
  'Georgetown': '#041E42',
  'Syracuse': '#D44500',
  'Virginia': '#232D4B',
  'Pittsburgh': '#003594',
  'Penn State': '#001E44',
  'Grand Canyon': '#522498',
  'Vermont': '#007A53',
  'Samford': '#003087',
  'Montana State': '#003B71',
  'Longwood': '#003B71',
  'Louisiana State': '#461D7C',
  'LSU': '#461D7C',
  'Notre Dame': '#0C2340',
  'Miami': '#005030',
  'Florida State': '#782F40',
  'Missouri': '#F1B82D',
  'Oklahoma': '#841617',
  'Oklahoma State': '#FF6600',
  'TCU': '#4D1979',
  'West Virginia': '#002855',
  'NC State': '#CC0000',
  'Wake Forest': '#9E7E38',
  'Memphis': '#003087',
  'Cincinnati': '#E00122',
  'Temple': '#9D2235',
  'Connecticut': '#000E2F',
  'Dayton': '#C8102E',
  'Richmond': '#003366',
  'VCU': '#FDBD10',
  'St. Mary\'s': '#002366',
  'BYU': '#002E5D',
  'Utah State': '#00263A',
  'Nevada': '#003366',
  'Boise State': '#0033A0',
  'Colorado State': '#1E4D2B',
  'Colorado': '#CFB87C',
  'Arizona State': '#8C1D40',
  'Utah': '#CC0000',
  'Washington': '#4B2E83',
  'Stanford': '#8C1515',
  'California': '#003262',
  'USC': '#990000',
  'Saint Louis': '#003DA5',
  'Davidson': '#CC0000',
  'Wichita State': '#000000',
  'Middle Tennessee': '#0066CC',
  'Belmont': '#003087',
  'Murray State': '#002147',
  'Eastern Washington': '#A10022',
  'Oral Roberts': '#002868',
  'Abilene Christian': '#582C83',
  'Drake': '#004B8D',
  'Colgate': '#821019',
  'North Texas': '#00853E',
  'James Madison': '#450084',
  'UAB': '#1E6B52',
  'Chattanooga': '#002855',
  'Furman': '#582C83',
  'Howard': '#003A63',
  'Kennesaw State': '#FDBB30',
  'UNC Asheville': '#003366',
  'Montana': '#990000',
};

function normalizeName(name) {
  const map = {
    'UConn': 'UConn', 'Uconn': 'UConn', 'UCONN': 'UConn',
    'UNC': 'North Carolina', 'North Carolina (UNC)': 'North Carolina',
    'Vandy': 'Vanderbilt',
    'LSU': 'Louisiana State',
    'Ole Miss': 'Mississippi',
    'Ole Miss (Mississippi)': 'Mississippi',
    "St John's": "St. John's", 'St Johns': "St. John's"
  };
  return map[name] || name;
}

function getSchoolLogoHTML(college, size) {
  const sz = size || 28;
  const norm = normalizeName(college || '');
  const color = SCHOOL_COLORS[norm] || SCHOOL_COLORS[college] || '#1e2235';
  const initials = (college || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const fontSize = Math.max(7, Math.round(sz * 0.36));
  // Luminance check for text contrast
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const isLight = (r * 299 + g * 587 + b * 114) / 1000 > 145;
  const textColor = isLight ? 'rgba(0,0,0,0.82)' : 'rgba(255,255,255,0.93)';
  return '<span class="school-badge" style="width:' + sz + 'px;height:' + sz + 'px;background:' + color + ';font-size:' + fontSize + 'px;color:' + textColor + ';">' + initials + '</span>';
}

// ── BLOCKED TERMS ─────────────────────────────────────────
const BLOCKED_TERMS = ['admin', 'fuck', 'shit', 'bitch', 'asshole', 'nigger', 'cunt', 'faggot'];
function containsBlockedTerm(str) {
  const lower = str.toLowerCase();
  return BLOCKED_TERMS.some(t => lower.includes(t));
}

// ── STATE ─────────────────────────────────────────────────
const defaultState = {
  leagueId: null,
  leagueCode: null,
  commissioner: null,
  leagueName: 'My League',
  managers: [],
  rounds: 8,
  queues: {},               // manager -> ordered player ids
  bracketOverrides: {},   // "Region|rnd|match" -> team name, commissioner corrections
  currentPickIndex: 0,
  drafted: {},
  pickTimerSeconds: 90,
  pickTimerStartedAt: null,
  timerRunning: false,
  scoring: {
    active: ['points', 'rebounds', 'assists', 'steals', 'blocks'],
    weights: { points: 1, rebounds: 1.2, assists: 1.5, steals: 2, blocks: 2 }
  },
  players: [],
  activityFeed: [],
  trades: [],
  waivers: [],
  prevRankings: [],
  selectedTournament: null,
  maxManagers: 8,
  draftScheduledAt: null,

  // ── Season history ───────────────────────────────────────
  //  A MAP keyed by tournamentId, deliberately not an array.
  //  Firestore's merge:true replaces arrays wholesale, so a manager on
  //  a stale phone writing anything would blow away every tournament
  //  archived since their last read. Maps merge key by key, so two
  //  devices can each add a different tournament and both survive.
  //
  //  Shape of each entry: see archiveTournamentResult().
  seasonHistory: {}
};
// ── Fresh state, never a shared reference ─────────────────
//  freshState() is SHALLOW: every copy ends up
//  sharing defaultState's nested objects. Draft a player in one league
//  and defaultState.drafted itself is mutated, so the next league you
//  create starts with those picks already made — and the same goes for
//  queues, bracketOverrides, managers, activityFeed and the scoring
//  weights. Thirteen places copied it this way.
//
//  structuredClone gives each league genuinely its own objects.
function freshState() {
  if (typeof structuredClone === 'function') return structuredClone(defaultState);
  return JSON.parse(JSON.stringify(defaultState));   // older browsers
}


let state = freshState();
let timerInterval = null;
let poolSortCol = 'fpts';
let poolSortDir = 'desc';
let playerPoolSortCol = 'fpts';
let playerPoolSortDir = 'desc';
let pendingPickPlayerId = null;
let tutStep = 0;
let simPrevRankings = [];
let expandedTeams = new Set();

// ── PERSISTENCE ───────────────────────────────────────────
// ── The player pool is reference data, never saved state ──
//  saveState used to serialize the WHOLE state object, player pool
//  included, and loadState restored it verbatim — only falling back to
//  window.MM_PLAYERS when the stored array was missing or empty. So a
//  browser that had ever loaded the app kept its original pool frozen
//  in localStorage forever, and regenerating data/players.js changed
//  nothing for existing users. That is how retired players survived a
//  full rebuild of the file.
//
//  players.js is now the single source of truth. Only draft results
//  and league settings persist.
function _stateForStorage() {
  const copy = Object.assign({}, state);
  delete copy.players;
  copy.poolVersion = POOL_VERSION;
  return copy;
}

function saveState() {
  state.lastSaved = Date.now();
  try {
    const payload = JSON.stringify(_stateForStorage());
    localStorage.setItem('mmfantasy-state', payload);
    if (state.leagueId) {
      localStorage.setItem('mmfantasy-league-' + state.leagueId, payload);
      updateLeaguesIndex();
      _saveLeagueToFirestore();
    }
  } catch (e) { console.error('saveState', e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem('mmfantasy-state');
    if (raw) {
      const parsed = JSON.parse(raw);
      state = Object.assign(freshState(), parsed);
      state.scoring = Object.assign(freshState().scoring, parsed.scoring || {});
      state.scoring.weights = Object.assign({}, defaultState.scoring.weights, (parsed.scoring || {}).weights || {});
      rehydratePlayerPool(parsed.poolVersion);
      return true;
    }
  } catch (e) { console.error('loadState', e); }
  return false;
}

function updateLeaguesIndex() {
  try {
    const raw = localStorage.getItem('mmfantasy-leagues');
    const leagues = raw ? JSON.parse(raw) : [];
    const totalPicks = buildDraftOrder().length;
    const donePicks = state.currentPickIndex;
    const pct = totalPicks > 0 ? Math.round((donePicks / totalPicks) * 100) : 0;
    const entry = {
      leagueId: state.leagueId,
      leagueCode: state.leagueCode,
      leagueName: state.leagueName,
      commissioner: state.commissioner,
      managers: state.managers,
      draftPct: pct,
      lastActive: Date.now(),
      tournamentName: state.selectedTournament ? state.selectedTournament.name : null
    };
    const idx = leagues.findIndex(l => l.leagueId === state.leagueId);
    if (idx >= 0) leagues[idx] = entry;
    else leagues.push(entry);
    localStorage.setItem('mmfantasy-leagues', JSON.stringify(leagues));
  } catch (e) { console.error('updateLeaguesIndex', e); }
}

// ── SESSION ───────────────────────────────────────────────
function getSession() {
  try {
    const raw = localStorage.getItem('mmfantasy-session');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function setSession(name, email, uid) {
  try { localStorage.setItem('mmfantasy-session', JSON.stringify({ name, email, uid: uid || null })); } catch (e) { }
}
function clearSession() {
  localStorage.removeItem('mmfantasy-session');
  localStorage.removeItem('mmfantasy-state');
}

// ── FIREBASE HELPERS ──────────────────────────────────────
let _leagueUnsubscribe = null;

function _fbErrorMsg(code) {
  const msgs = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return msgs[code] || 'Something went wrong. Please try again.';
}

function _saveLeagueToFirestore() {
  if (!window._db || !state.leagueCode) return;
  const toSave = Object.assign({}, state);
  delete toSave.players; // static, large — loaded from players.js

  // ── Never overwrite the manager list ────────────────────
  //  Firestore's merge:true does NOT deep-merge arrays, it replaces
  //  the whole field. So a client holding a stale roster would wipe
  //  out anyone who joined since its last read — a manager silently
  //  disappearing mid-draft. arrayUnion makes the write additive and
  //  atomic, so two people joining at once cannot clobber each other.
  const mgrs = Array.isArray(state.managers) ? state.managers.filter(Boolean) : [];
  delete toSave.managers;

  toSave._updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  toSave._commissionerUid = (window._fbUser && window._fbUser.uid) || null;
  if (mgrs.length) {
    toSave.managers = firebase.firestore.FieldValue.arrayUnion.apply(null, mgrs);
  }

  window._db.collection('leagues').doc(state.leagueCode).set(toSave, { merge: true })
    .catch(e => console.warn('[Firestore] saveLeague failed:', e.message));
}

/**
 * Remove a manager. This is the ONLY path that may shrink the roster,
 * because _saveLeagueToFirestore is additive by design and cannot.
 */
function removeManagerRemote(name) {
  if (!window._db || !state.leagueCode || !name) return Promise.resolve();
  return window._db.collection('leagues').doc(state.leagueCode).update({
    managers: firebase.firestore.FieldValue.arrayRemove(name),
    lastSaved: Date.now(),
  }).catch(e => console.warn('[Firestore] removeManager failed:', e.message));
}

function _subscribeLeague(code) {
  if (_leagueUnsubscribe) { _leagueUnsubscribe(); _leagueUnsubscribe = null; }
  if (!window._db || !code) return;
  _leagueUnsubscribe = window._db.collection('leagues').doc(code)
    .onSnapshot(doc => {
      if (!doc.exists) return;
      const data = doc.data();

      // ── Managers are merged, never compared ──────────────
      //  lastSaved is Date.now() from whichever DEVICE wrote it, so the
      //  timestamp guard below is really comparing two different
      //  computers' clocks. A phone a second behind a laptop makes the
      //  laptop treat a real join as stale and discard it forever.
      //  Roster membership is too important to lose to clock skew, so
      //  it is unioned unconditionally and never removed by a remote
      //  snapshot.
      const remoteMgrs = Array.isArray(data.managers) ? data.managers : [];
      const localMgrs  = Array.isArray(state.managers) ? state.managers : [];
      const merged     = localMgrs.slice();
      let joined       = [];

      remoteMgrs.forEach(function (m) {
        if (m && merged.indexOf(m) === -1) { merged.push(m); joined.push(m); }
      });

      const remoteTs = data.lastSaved || 0;
      const localTs = state.lastSaved || 0;

      if (remoteTs > localTs + 1000) { // 1s buffer to avoid echo
        _applyLeagueState(data);
        state.managers = merged;       // keep anyone the remote doc lacked
        try { localStorage.setItem('mmfantasy-league-' + state.leagueId, JSON.stringify(state)); } catch (e) { }
        render();
        toast('League updated.', 'info');
        return;
      }

      // Remote looked "older" but carried a manager we do not have.
      // That is the clock-skew case. Apply just the roster change.
      if (joined.length) {
        state.managers = merged;
        try { localStorage.setItem('mmfantasy-league-' + state.leagueId, JSON.stringify(state)); } catch (e) { }
        render();
        joined.forEach(function (m) { addActivity(esc(m) + ' joined the league'); });
        toast(joined.join(', ') + (joined.length === 1 ? ' joined' : ' joined') + ' the league', 'success');
        track('league_joined', { managers: merged.length, observed_by: 'commissioner' });
      }
    }, e => console.warn('[Firestore] snapshot error:', e));
}

// ── DRAFT ORDER ───────────────────────────────────────────
function buildDraftOrder() {
  const mgrs = state.managers;
  if (!mgrs || mgrs.length === 0) return [];
  const order = [];
  for (let r = 1; r <= state.rounds; r++) {
    const fwd = r % 2 === 1;
    const list = fwd ? mgrs.slice() : mgrs.slice().reverse();
    list.forEach((m, i) => {
      order.push({ manager: m, round: r, pick: i + 1, pickNumber: order.length + 1, label: 'Round ' + r + ', Pick ' + (i + 1) });
    });
  }
  return order;
}

function currentPick() {
  const order = buildDraftOrder();
  return order[state.currentPickIndex] || null;
}

function isDraftComplete() {
  return state.managers.length > 0 && state.currentPickIndex >= buildDraftOrder().length;
}

function isCommissioner() {
  if (!state.commissioner) return false;
  const s = getSession();
  if (!s) return false;
  if (s.name === state.commissioner) return true;
  // Fallback: match by email (handles name changes / stale localStorage)
  if (state.commissionerEmail && s.email && s.email.toLowerCase() === state.commissionerEmail.toLowerCase()) return true;
  return false;
}

// ── FPTS ─────────────────────────────────────────────────
function calcFPTS(player) {
  const w = state.scoring.weights;
  const active = state.scoring.active || [];
  const s = player.stats || {};
  let total = 0;
  if (active.includes('points')) total += (s.points || 0) * (w.points || 1);
  if (active.includes('rebounds')) total += (s.rebounds || 0) * (w.rebounds || 1);
  if (active.includes('assists')) total += (s.assists || 0) * (w.assists || 1);
  if (active.includes('steals')) total += (s.steals || 0) * (w.steals || 1);
  if (active.includes('blocks')) total += (s.blocks || 0) * (w.blocks || 1);
  return Math.round(total * 10) / 10;
}
// ── A manager's total fantasy points ─────────────────────
//  This function was called in eleven places — the home hero leader,
//  the right panel, the standings table, the season archive — and
//  defined in none of them. Every call threw a ReferenceError, and
//  because renderStandings and renderRightPanel are both wrapped in
//  try/catch by navigateTo, the whole Standings page rendered blank
//  with nothing but a console warning to show for it.
//
//  It sums calcFPTS across the manager's roster, which is what all
//  eleven call sites were already assuming it did.
function managerFPTS(managerName) {
  let total = 0;
  Object.keys(state.drafted || {}).forEach(function (pid) {
    if (state.drafted[pid].manager !== managerName) return;
    const p = (state.players || []).find(function (x) { return x.id === pid; });
    if (p) total += calcFPTS(p);
  });
  return Math.round(total * 10) / 10;
}

function managerRoster(managerName) {
  return Object.entries(state.drafted)
    .filter(([, d]) => d.manager === managerName)
    .map(([pid, d]) => {
      const p = (state.players || []).find(x => x.id === pid);
      return p ? Object.assign({}, p, { _pick: d }) : null;
    }).filter(Boolean);
}

// ── ACTIVITY FEED ─────────────────────────────────────────
function addActivity(msg) {
  if (!Array.isArray(state.activityFeed)) state.activityFeed = [];
  state.activityFeed.unshift({ msg, ts: Date.now() });
  if (state.activityFeed.length > 60) state.activityFeed.pop();
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

// ── TOAST ─────────────────────────────────────────────────
function toast(msg, type) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'info');
  t.textContent = msg;
  container.appendChild(t);
  t.addEventListener('click', () => dismissToast(t));
  setTimeout(() => dismissToast(t), 3200);
}

function dismissToast(el) {
  if (!el.parentNode) return;
  el.classList.add('toast-out');
  setTimeout(() => el.remove(), 300);
}

// ── NAVIGATION ───────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => {
    p.style.display = 'none';
    p.classList.remove('active-page');
  });
  // Reset scroll so previous page's position never bleeds into the new one
  const mc = document.querySelector('.main-content');
  if (mc) mc.scrollTop = 0;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const pageEl = document.getElementById(page + 'Page');
  // Clear inline display; lets CSS decide (flex for chat-page, block for others)
  if (pageEl) { pageEl.style.display = ''; pageEl.classList.add('active-page'); }
  const navBtn = document.querySelector('.nav-btn[data-page="' + page + '"]');
  if (navBtn) navBtn.classList.add('active');
  // Mobile: the sheet trigger is the only visible nav, so it has to
  // carry the current page name or there is no orientation at all.
  try { markNavSheetActive(page); } catch (e) { }
  if (page === 'players') {
    try { renderDraftGrid(); } catch (e) { console.error('renderDraftGrid', e); }
    try { renderDraftFeed(); } catch (e) { console.error('renderDraftFeed', e); }
    try { renderDraftOrderStrip(); } catch (e) { console.error('renderDraftOrderStrip', e); }
    try { renderPlayerPool(); } catch (e) { console.error('renderPlayerPool', e); }
    try {
      const cg = document.getElementById('playerCardGrid');
      if (cg && cg.classList.contains('active')) renderPlayerCardGrid();
    } catch (e) { console.error('renderPlayerCardGrid', e); }
  }
  if (page === 'teams') { try { renderTeams(); } catch (e) { console.error('renderTeams', e); } }
  if (page === 'bracket') {
    document.querySelectorAll('.bracket-tab').forEach(t => t.classList.remove('active'));
    const firstTab = document.querySelector('.bracket-tab');
    if (firstTab) firstTab.classList.add('active');
    try { renderBracket(); } catch (e) { console.error('renderBracket', e); }
  }
  if (page === 'chat') {
    renderChat();
    markChatRead();
    // Focus input
    setTimeout(() => { const inp = document.getElementById('chatInput'); if (inp) inp.focus(); }, 100);
  }
  if (page === 'standings') { try { renderStandings(); } catch (e) { console.error('renderStandings', e); } }
  if (page === 'season') { try { renderSeason(); } catch (e) { console.error('renderSeason', e); } }
  if (page === 'profile') {
    try { renderProfile(); } catch (e) { console.error('renderProfile', e); }
    try { refreshProfilePage(); } catch (e) { console.error('refreshProfilePage', e); }
  }
  if (page === 'settings') {
    try { syncNotifUI(); } catch (e) { }
    try { refreshSettingsPage(); } catch (e) { console.error('refreshSettingsPage', e); }
  }
  if (page === 'news') { try { renderNews(); } catch (e) { console.error('renderNews', e); } }

  try { trackPageView(page); } catch (e) { }

  // Keep right panel fresh on every navigation
  try { renderRightPanel(); } catch (e) { }
}

// ── Page-level analytics ──────────────────────────────────
//  Mapped rather than emitted as a generic page_view, so the funnel
//  reads in plain language instead of needing a property filter.
const PAGE_EVENTS = {
  standings: 'leaderboard_viewed',
  season:    'season_viewed',
  bracket:   'bracket_viewed',
  news:      'news_viewed',
  teams:     'live_score_viewed',
};

function trackPageView(page) {
  const evt = PAGE_EVENTS[page];
  if (!evt) return;

  track(evt, {
    draft_complete: isDraftComplete(),
    tournament: state.selectedTournament ? state.selectedTournament.id : null,
  });

  // THE retention question for this format: once your roster is dead,
  // do you still open the app? If this number collapses on day 2, the
  // game has an endgame problem that no amount of signups fixes.
  try {
    if (isDraftComplete() && myRosterFullyEliminated()) {
      track('session_after_elimination', { page: page });
    }
  } catch (e) { }
}

// True when every player this user drafted belongs to an eliminated team.
function myRosterFullyEliminated() {
  const session = getSession();
  const me = session ? session.name : null;
  if (!me) return false;

  const alive = getAliveTeamsInfo();
  const mine = Object.keys(state.drafted || {})
    .filter(pid => state.drafted[pid].manager === me);
  if (!mine.length) return false;

  return mine.every(function (pid) {
    const p = (state.players || []).find(x => x.id === pid);
    if (!p) return true;
    return !(alive[p.college] || alive[normalizeName(p.college)]);
  });
}

// ── SCREEN MANAGEMENT ─────────────────────────────────────
function showLanding() {
  var landing = document.getElementById('landingScreen');
  landing.classList.remove('reveal');
  landing.style.display = 'flex';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('signupScreen').style.display = 'none';
  document.getElementById('splashScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'none';
  var mmIntro = document.getElementById('mmIntro');
  if (mmIntro) mmIntro.style.display = 'none';
  // Double-rAF so the opacity:0 base state is painted before animation fires
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      landing.classList.add('reveal');
    });
  });
}

function showLogin() {
  document.getElementById('landingScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('signupScreen').style.display = 'none';
  document.getElementById('splashScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'none';
  // Restart background logo animation every time login screen appears
  const bgLogo = document.querySelector('.auth-bg-logo');
  if (bgLogo) {
    bgLogo.classList.remove('animating');
    void bgLogo.offsetWidth; // force reflow to reset animation
    bgLogo.classList.add('animating');
  }
}

function showSignup() {
  document.getElementById('landingScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('signupScreen').style.display = 'flex';
  document.getElementById('splashScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'none';
}

function showSplash(fromInit) {
  document.getElementById('landingScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('signupScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'none';

  var splash = document.getElementById('splashScreen');
  var intro = document.getElementById('mmIntro');

  // Reset reveal & opacity so entrances always replay cleanly
  splash.classList.remove('reveal');
  splash.style.opacity = '0';
  splash.style.transition = '';
  splash.style.display = 'flex';

  renderSavedLeagues();
  checkInviteURL();

  if (fromInit && intro) {
    // ── Bracket intro → crossfade → element entrances ────────
    // Reset any leftover intro state from a previous run
    intro.classList.remove('playing');
    intro.style.opacity = '';
    intro.style.transition = '';
    void intro.offsetWidth; // flush pending styles

    // Show intro and kick off animations
    intro.style.display = 'flex';
    void intro.offsetWidth; // reflow so animations start clean
    intro.classList.add('playing');

    // 2.3s = court drawn, all three tagline words landed + brief hold
    setTimeout(function () {
      // Crisp crossfade
      intro.style.transition = 'opacity 0.8s ease';
      intro.style.opacity = '0';
      splash.style.transition = 'opacity 0.8s ease';
      splash.style.opacity = '1';

      setTimeout(function () {
        // Cleanup intro
        intro.style.display = 'none';
        intro.style.opacity = '';
        intro.style.transition = '';
        intro.classList.remove('playing');
        splash.style.transition = '';

        // Fire staggered element entrances now that splash is fully visible
        splash.classList.add('reveal');
      }, 850);
    }, 2300);

  } else {
    // ── No intro: fade splash in and immediately reveal elements ─
    if (intro) { intro.style.display = 'none'; }

    // Double-rAF ensures opacity:0 is painted before we start the transition
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        splash.style.transition = 'opacity 0.3s ease';
        splash.style.opacity = '1';
        splash.classList.add('reveal');
        setTimeout(function () { splash.style.transition = ''; }, 350);
      });
    });
  }
}

function enterLeague() {
  document.getElementById('landingScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('signupScreen').style.display = 'none';

  // Remember this league against the signed-in user so it shows up in
  // My Leagues later. Fire and forget: it must never block entry.
  try { recordLeagueMembership(state.leagueCode, state.leagueName); } catch (e) { }
  try { applyAccent(getAccent()); } catch (e) { }

  // If regenerating the player pool voided existing picks, say so.
  // Silently emptying somebody's roster is worse than the reset itself.
  try {
    if (state._poolReset) {
      const n = state._poolReset;
      state._poolReset = 0;
      setTimeout(function () {
        toast(n + ' pick' + (n === 1 ? '' : 's') + ' cleared: those players are no longer on a roster. Re-draft when ready.', 'error');
      }, 1200);
      addActivity('Player pool updated to current rosters. ' + n + ' outdated pick' + (n === 1 ? '' : 's') + ' cleared.');
      saveState();
    }
  } catch (e) { }

  // Returning-user signal. Guarded so re-renders inside one session
  // cannot inflate the count.
  try {
    if (!window._returnTracked) {
      window._returnTracked = true;
      const uid = _uid();
      if (uid && window.Analytics) window.Analytics.identify(uid, {});
      track('app_returned', {
        draft_complete: isDraftComplete(),
        has_tournament: !!state.selectedTournament,
      });
    }
  } catch (e) { }

  // Resume live stat listener if a tournament was already selected
  listenToLiveStats();
  listenToGameScores();

  // Fade the splash out smoothly before switching screens
  const splash = document.getElementById('splashScreen');
  splash.style.transition = 'opacity 0.3s ease';
  splash.style.opacity = '0';

  setTimeout(function () {
    splash.style.display = 'none';
    splash.style.opacity = '';
    splash.style.transition = '';

    const leoEl = document.getElementById('leoOverlay');
    const leoName = document.getElementById('leoName');
    if (leoEl) {
      if (leoName) leoName.textContent = state.leagueName || 'My League';
      leoEl.style.display = 'flex';
      setTimeout(() => {
        leoEl.style.display = 'none';
        showMainApp();
      }, 1150);
    } else {
      showMainApp();
    }
  }, 300);
}

// Single entry point into the app shell.
// Home is navigated to FIRST and each subsequent step is isolated, so a failure
// in bracket generation or render can never leave the user on the wrong page.
function showMainApp() {
  document.getElementById('mainApp').style.display = 'flex';

  // Landing page is always Home - do this before anything that can throw.
  try { navigateTo('home'); } catch (e) { console.error('navigateTo(home)', e); }

  try {
    if (state.selectedTournament) generateBracketData(state.selectedTournament);
  } catch (e) { console.error('generateBracketData', e); }

  try { render(); } catch (e) { console.error('render', e); }
  try { updateCommissionerVisibility(); } catch (e) { console.error('updateCommissionerVisibility', e); }
  try { resumeTimerIfRunning(); } catch (e) { console.error('resumeTimerIfRunning', e); }

  // render() re-renders page content but must not change which page is showing.
  // Re-assert Home in case any render path navigated away.
  try {
    const homeEl = document.getElementById('homePage');
    if (homeEl && !homeEl.classList.contains('active-page')) navigateTo('home');
  } catch (e) { console.error('home re-assert', e); }

  // Startup is finished - deep links / notification jumps may act from here on.
  window._appReady = true;
}

function resumeTimerIfRunning() {
  if (!state.timerRunning) return;
  // If the end time has already passed, treat as expired
  const rem = getRemainingSeconds();
  if (rem <= 0) {
    state.timerRunning = false;
    state.pickTimerStartedAt = null;
    saveState();
    updateTimerBtnState();
    updateTimerDisplay();
    return;
  }
  clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 500);
  updateTimerBtnState();
}

// ── AUTH ──────────────────────────────────────────────────
function _afterLoginNav() {
  const loginScreen = document.getElementById('loginScreen');
  loginScreen.style.transition = 'opacity 0.4s ease';
  loginScreen.style.opacity = '0';
  setTimeout(() => {
    loginScreen.style.opacity = ''; loginScreen.style.transition = ''; loginScreen.style.display = 'none';
    if (loadState() && state.leagueId) { enterLeague(); } else { showSplash(true); }
  }, 420);
}

function handleLogin() {
  const email = (document.getElementById('loginEmail').value || '').trim();
  const password = (document.getElementById('loginPassword').value || '');
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (!email.includes('@')) { errEl.textContent = 'Enter a valid email.'; errEl.style.display = 'block'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }

  if (window._auth) {
    const btn = document.getElementById('loginSubmitBtn');
    btn.textContent = 'Signing in…'; btn.disabled = true;
    window._auth.signInWithEmailAndPassword(email, password)
      .then(cred => {
        window._fbUser = cred.user;
        const namePromise = window._db
          ? window._db.collection('users').doc(cred.user.uid).get()
            .then(doc => (doc.exists && doc.data().displayName) || email.split('@')[0])
            .catch(() => email.split('@')[0])
          : Promise.resolve(email.split('@')[0]);
        return namePromise;
      })
      .then(name => {
        const prevSess = getSession();
        const uid = window._fbUser ? window._fbUser.uid : null;
        if (prevSess && prevSess.uid && prevSess.uid !== uid) {
          localStorage.removeItem('mmfantasy-state');
          localStorage.removeItem('mmfantasy-leagues');
          state = freshState();
          state.players = poolForCurrentTournament();
        }
        setSession(name, email, uid);
        btn.textContent = 'Sign In'; btn.disabled = false;
        _afterLoginNav();
      })
      .catch(e => {
        errEl.textContent = _fbErrorMsg(e.code);
        errEl.style.display = 'block';
        btn.textContent = 'Sign In'; btn.disabled = false;
      });
  } else {
    // Offline fallback
    const existingSession = getSession();
    const name = (existingSession && existingSession.email === email && existingSession.name)
      ? existingSession.name
      : (email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim() || 'Player');
    setSession(name, email, null);
    _afterLoginNav();
  }
}

function handleSignup() {
  const username = (document.getElementById('signupUsername').value || '').trim();
  const email = (document.getElementById('signupEmail').value || '').trim();
  const password = (document.getElementById('signupPassword').value || '');
  const confirm = (document.getElementById('signupConfirm').value || '');
  const errEl = document.getElementById('signupError');
  errEl.style.display = 'none';

  const tosChecked = document.getElementById('tosCheckbox') && document.getElementById('tosCheckbox').checked;
  if (!username) { errEl.textContent = 'Display name required.'; errEl.style.display = 'block'; return; }
  if (containsBlockedTerm(username)) { errEl.textContent = 'Please choose a different display name.'; errEl.style.display = 'block'; return; }
  if (!email.includes('@')) { errEl.textContent = 'Enter a valid email.'; errEl.style.display = 'block'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
  if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }

  // ── Age gate ────────────────────────────────────────────
  //  COPPA applies under 13, so that is a hard stop. 13-17 is allowed
  //  but flagged, because a minor flag is the thing you need in place
  //  BEFORE you start collecting analytics, not after.
  const dobRaw = (document.getElementById('signupDob') || {}).value || '';
  const age = ageFromDOB(dobRaw);
  if (age === null) {
    errEl.textContent = 'Enter your date of birth.';
    errEl.style.display = 'block'; return;
  }
  if (age < 0 || age > 120) {
    errEl.textContent = 'Enter a valid date of birth.';
    errEl.style.display = 'block'; return;
  }
  if (age < MIN_AGE) {
    errEl.textContent = 'You must be at least ' + MIN_AGE + ' years old to use Tipoff Fantasy.';
    errEl.style.display = 'block'; return;
  }

  if (!tosChecked) { errEl.textContent = 'You must accept the Terms of Service to create an account.'; errEl.style.display = 'block'; return; }

  function _afterSignupNav() {
    const signupScreen = document.getElementById('signupScreen');
    signupScreen.style.transition = 'opacity 0.4s ease';
    signupScreen.style.opacity = '0';
    setTimeout(() => {
      signupScreen.style.opacity = ''; signupScreen.style.transition = ''; signupScreen.style.display = 'none';
      showSplash(true);
    }, 420);
  }

  if (window._auth) {
    const btn = document.getElementById('signupSubmitBtn');
    btn.textContent = 'Creating account…'; btn.disabled = true;
    window._auth.createUserWithEmailAndPassword(email, password)
      .then(cred => {
        window._fbUser = cred.user;
        const writeProfile = window._db
          ? window._db.collection('users').doc(cred.user.uid).set({
            displayName: username,
            email: email,
            // Store the bracket, not the birth date. We needed the DOB
            // once to make a decision; keeping it is a liability with no
            // corresponding use.
            ageBracket: age < 18 ? 'minor' : 'adult',
            isMinor: age < 18,
            ageVerifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          })
          : Promise.resolve();
        return writeProfile;
      })
      .then(() => {
        setSession(username, email, window._fbUser ? window._fbUser.uid : null);

        // Identity is the UID. Not the email, not the display name.
        const uid = window._fbUser ? window._fbUser.uid : null;
        if (window.Analytics) {
          window.Analytics.identify(uid, { age_bracket: age < ADULT_AGE ? 'minor' : 'adult' });
        }
        track('account_created', Object.assign(
          { age_bracket: age < ADULT_AGE ? 'minor' : 'adult' },
          window.Analytics ? window.Analytics.acquisition() : {}
        ));

        btn.textContent = 'Create Account'; btn.disabled = false;
        _afterSignupNav();
      })
      .catch(e => {
        errEl.textContent = _fbErrorMsg(e.code);
        errEl.style.display = 'block';
        btn.textContent = 'Create Account'; btn.disabled = false;
      });
  } else {
    // Offline fallback
    setSession(username, email, null);
    _afterSignupNav();
  }
}

// ── SPLASH ────────────────────────────────────────────────
function _applyLeagueState(saved) {
  state = Object.assign(freshState(), saved);
  state.scoring = Object.assign(freshState().scoring, saved.scoring || {});
  state.scoring.weights = Object.assign({}, defaultState.scoring.weights, (saved.scoring || {}).weights || {});
  rehydratePlayerPool(saved && saved.poolVersion);
}

// ── Player pool rehydration ───────────────────────────────
//  ALWAYS rebuilds state.players from data/players.js, discarding
//  whatever a stored league happened to carry. Also prunes draft picks
//  that point at players who no longer exist, which happens whenever
//  the pool is regenerated and ids change.
const POOL_VERSION = '2026-09-21-espn';

// ── The ONE place the player pool is built ────────────────
//  Nine different code paths used to do
//    state.players = (window.MM_PLAYERS || []).slice()
//  which loads all 239 players across all three tournaments. Any of
//  them firing after a tournament was chosen silently repopulated the
//  draft board with players from the other events — so a Maui league
//  would see Xavier and Belmont players on the board. Restarting a
//  league and reloading the app both did exactly that.
//
//  Everything now goes through here, and here respects the selected
//  tournament. If a tournament is selected its pool is authoritative,
//  even when that pool is empty (an unannounced field). Only with no
//  tournament at all do we fall back to everybody.
// ── Always hand out CLONES, never the file's own objects ──
//  .slice() and .filter() copy the array but keep the same object
//  references, so state.players[i] IS window.MM_PLAYERS[j]. The live
//  stat listener writes player.stats.points directly, which means it
//  was permanently overwriting data/players.js in memory:
//
//    · leave a league mid-tournament and join another one, and your
//      new league's draft board shows the OLD league's running totals
//    · switch tournaments and the same thing happens
//    · the board never returns to season averages without a reload
//
//  Cloning on every pool build means each league starts from pristine
//  file data and live stats only ever touch the pool in play.
function clonePlayer(p) {
  return Object.assign({}, p, {
    stats: Object.assign({}, p.stats),
    seasonAvg: p.seasonAvg ? Object.assign({}, p.seasonAvg) : undefined,
  });
}

function poolForCurrentTournament() {
  const t = state && state.selectedTournament;
  const base = t ? playersForTournament(t) : (window.MM_PLAYERS || []);
  return base.map(clonePlayer);
}

function rehydratePlayerPool(savedVersion) {
  state.players = poolForCurrentTournament();

  // ── Snapshot the season per-game averages ───────────────
  //  data/players.js ships PER-GAME averages. The live feed overwrites
  //  player.stats with CUMULATIVE tournament totals, which means after
  //  two games "points" is a running total, not a rate. The projection
  //  engine multiplies a rate by games remaining, so once live data
  //  arrived it would have been multiplying a cumulative total and
  //  producing wildly inflated forecasts.
  //
  //  Keeping an untouched copy of the season rate on each player gives
  //  the projection something honest to multiply.
  state.players.forEach(function (p) {
    if (!p.seasonAvg) {
      p.seasonAvg = {
        points: p.stats.points, rebounds: p.stats.rebounds, assists: p.stats.assists,
        steals: p.stats.steals, blocks: p.stats.blocks,
      };
    }
  });

  const valid = {};
  state.players.forEach(function (p) { valid[p.id] = true; });

  const drafted = state.drafted || {};
  const orphans = Object.keys(drafted).filter(function (pid) { return !valid[pid]; });

  if (orphans.length) {
    // A pool regeneration voids old picks. Dropping them loudly beats
    // leaving phantom players on rosters that can never score.
    orphans.forEach(function (pid) { delete drafted[pid]; });
    state.drafted = drafted;
    console.warn('[Pool] Dropped ' + orphans.length +
      ' draft pick(s) for players no longer in the pool (was ' +
      (savedVersion || 'pre-versioning') + ', now ' + POOL_VERSION + ').');
    state._poolReset = orphans.length;
  }

  state.poolVersion = POOL_VERSION;
}

function _leagueCardHTML(l) {
  const displayCode = l.leagueCode || l.leagueId || '--';
  const lookupId = l.leagueId || l.leagueCode || '--';
  const tournLine = l.tournamentName
    ? '<span class="slc-tournament">' + esc(l.tournamentName) + '</span>'
    : '<span class="slc-tournament slc-tournament--none">No tournament set</span>';
  return '<div class="saved-league-card" data-code="' + esc(lookupId) + '">' +
    '<div class="slc-left"><h4>' + esc(l.leagueName || 'League') + '</h4>' +
    '<p>' + esc(l.commissioner || '') + ' · ' + (l.managers ? l.managers.length : 0) + ' managers · Code: ' + esc(displayCode) + '</p>' +
    tournLine + '</div>' +
    '<div class="slc-right"><div class="slc-pct">' + (l.draftPct || 0) + '%</div><div class="slc-pct-label">drafted</div>' +
    '<div><button class="enter-btn">Enter</button></div></div></div>';
}

function _attachLeagueCardListeners(container) {
  container.querySelectorAll('.saved-league-card').forEach(function (card) {
    card.addEventListener('click', function () {
      _loadAndEnterLeague(card.dataset.code);
    });
  });
}

function _loadAndEnterLeague(code) {
  if (!code) return;
  if (window._db) {
    // Try Firestore first (leagueCode is the doc ID)
    // Strip 'league_' prefix if present (old format stored as leagueId)
    const fsCode = code.startsWith('league_') ? null : code;
    if (fsCode) {
      window._db.collection('leagues').doc(fsCode).get()
        .then(doc => {
          if (doc.exists) {
            _applyLeagueState(doc.data());
            saveState();
            _subscribeLeague(fsCode);
            enterLeague();
          } else {
            _loadAndEnterLeagueLocal(code);
          }
        })
        .catch(() => _loadAndEnterLeagueLocal(code));
      return;
    }
  }
  _loadAndEnterLeagueLocal(code);
}

function _loadAndEnterLeagueLocal(code) {
  try {
    const raw = localStorage.getItem('mmfantasy-league-' + code) ||
      localStorage.getItem('mmfantasy-league-league_' + code);
    if (raw) {
      _applyLeagueState(JSON.parse(raw));
      saveState();
      _subscribeLeague(state.leagueCode);
      enterLeague();
    }
  } catch (e) { console.error('loadLocal', e); }
}

function renderSavedLeagues() {
  const container = document.getElementById('savedLeaguesList');
  if (!container) return;
  try {
    const raw = localStorage.getItem('mmfantasy-leagues');
    const leagues = raw ? JSON.parse(raw) : [];
    if (!leagues.length) {
      container.innerHTML = '<p class="no-leagues">No leagues yet. Create or join one above.</p>';
      return;
    }
    const sorted = leagues.slice().sort(function (a, b) { return (b.lastActive || 0) - (a.lastActive || 0); });
    container.innerHTML = sorted.map(_leagueCardHTML).join('');
    _attachLeagueCardListeners(container);
  } catch (e) { container.innerHTML = '<p class="no-leagues">Could not load leagues.</p>'; }
}

function createLeague() {
  state = freshState();
  state.players = poolForCurrentTournament();
  state.leagueId = 'league_' + Date.now();
  state.leagueCode = Math.random().toString(36).toUpperCase().slice(2, 8);
  const session = getSession();
  state.commissioner = session ? session.name : 'Commissioner';
  state.commissionerEmail = session ? session.email : '';
  state.managers = session ? [session.name] : ['Commissioner'];
  state.leagueName = 'My League';
  try { localStorage.setItem('mmfantasy-code-' + state.leagueCode, state.leagueId); } catch (e) { }
  addActivity((state.commissioner || 'Commissioner') + ' created the league');
  saveState();

  // Claim the commissioner's display name immediately. Without this
  // the first joiner who happens to share the commissioner's name
  // finds it unowned, is let through, and the two share a roster.
  const _uid = (window._fbUser && window._fbUser.uid) || (session && session.uid) || null;
  if (window._db && _uid && state.commissioner) {
    const map = {};
    map[state.commissioner] = _uid;
    window._db.collection('leagues').doc(state.leagueCode)
      .set({ managerUids: map }, { merge: true })
      .catch(function (e) { console.warn('[Create] uid claim failed:', e.message); });
  }
  track('league_created', Object.assign(
    { max_managers: state.maxManagers || 8, rounds: state.rounds || 8 },
    window.Analytics ? window.Analytics.acquisition() : {}
  ));
}

// ── INVITE LINK ───────────────────────────────────────────
function getInviteURL(code) {
  return window.location.origin + window.location.pathname + '?join=' + code;
}

function shareInviteLink() {
  if (!state.leagueCode) { toast('No league code yet. Create a league first.', 'error'); return; }
  track('invite_sent', {
    method: navigator.share ? 'native_share' : 'clipboard',
    managers_so_far: (state.managers || []).length,
  });
  const url = getInviteURL(state.leagueCode);
  const text = 'Join my Tipoff Fantasy league "' + (state.leagueName || 'My League') + '"! Code: ' + state.leagueCode;

  // Try native share sheet (works great on iPhone)
  if (navigator.share) {
    // Only include URL when it's a real http/https address (file:// URLs are rejected by the share API)
    const shareData = { title: 'Tipoff Fantasy Invite', text };
    if (url.startsWith('http')) shareData.url = url;
    navigator.share(shareData)
      .then(() => toast('Invite sent!', 'success'))
      .catch(err => {
        // User cancelled share, so skip the error
        if (err && err.name === 'AbortError') return;
        // Share failed for another reason, so fall back to clipboard
        tryClipboardShare(url);
      });
    return;
  }

  tryClipboardShare(url);
}

function tryClipboardShare(url) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => toast('Invite link copied to clipboard!', 'success'))
      .catch(() => showShareFallback());
  } else {
    showShareFallback();
  }
}

function showShareFallback() {
  // Last resort: show the code so the user can share it manually
  const code = state.leagueCode || '--';
  const msg = 'Share your league code: ' + code + '\n\nFriends can join from the app splash screen.';
  // Use a simple prompt so they can copy it on any browser
  window.prompt('Copy your league code:', code);
}

// Reads ?join=CODE from the URL (or sessionStorage) and opens the join modal if present
function checkInviteURL() {
  let code = '';
  // First check URL params
  const params = new URLSearchParams(window.location.search);
  const urlCode = (params.get('join') || '').trim().toUpperCase();
  if (urlCode) {
    code = urlCode;
    // Strip param and save it so it survives a login redirect
    const clean = window.location.pathname + (window.location.hash || '');
    history.replaceState(null, '', clean);
    try { sessionStorage.setItem('mmfantasy-pending-join', code); } catch (e) { }
  } else {
    // Check if we saved one before login
    try { code = (sessionStorage.getItem('mmfantasy-pending-join') || '').trim().toUpperCase(); } catch (e) { }
  }
  if (!code) return;
  // Clear the pending join
  try { sessionStorage.removeItem('mmfantasy-pending-join'); } catch (e) { }
  // Open join modal pre-filled
  const input = document.getElementById('joinCodeInput');
  if (input) input.value = code;
  const sub = document.getElementById('joinModalSub');
  if (sub) sub.textContent = 'You were invited! Confirm the code below to join.';
  document.getElementById('joinModal').style.display = 'flex';
}

// ── JOIN LEAGUE ───────────────────────────────────────────
function handleJoin() {
  const code = (document.getElementById('joinCodeInput').value || '').trim().toUpperCase();
  const errEl = document.getElementById('joinError');
  errEl.style.display = 'none';
  if (code.length !== 6) { errEl.textContent = 'Code must be 6 characters.'; errEl.style.display = 'block'; return; }

  const btn = document.getElementById('joinConfirmBtn');

  function _finalize(saved) {
    const session = getSession();
    const name = session ? session.name : 'Player';
    const myUid = (window._fbUser && window._fbUser.uid) || (session && session.uid) || null;

    // A league doc written before managers existed, or one that got
    // partially merged, has no array here. Reading .includes off
    // undefined threw, which left the button stuck on "Joining…"
    // with nothing but a console error to explain it.
    if (!Array.isArray(saved.managers)) saved.managers = [];

    const fail = function (msg) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
      if (btn) { btn.textContent = 'Join'; btn.disabled = false; }
    };

    if (code === state.leagueCode) { fail('You are already in this league.'); return; }

    const max = saved.maxManagers || 8;
    const already = saved.managers.indexOf(name) !== -1;

    // ── Display-name collision ───────────────────────────
    //  managers is a list of NAMES, and everything downstream keys
    //  off them: picks, standings, queues, rosters. Two people called
    //  "Jake" would silently share one team. managerUids records who
    //  owns each name so a genuine rejoin still works while a
    //  stranger with the same name is turned away.
    const uids = (saved.managerUids && typeof saved.managerUids === 'object') ? saved.managerUids : {};
    if (already) {
      const owner = uids[name];
      if (owner && myUid && owner !== myUid) {
        fail('Someone in this league already uses the name "' + name +
             '". Change your display name in Settings, then try again.');
        return;
      }
    }

    if (!already && saved.managers.length >= max) {
      fail('This league is full (' + max + '/' + max + ' managers).');
      return;
    }
    if (!already) saved.managers.push(name);

    // Claim the name. Written separately from saveState because
    // _saveLeagueToFirestore sends state, and managerUids is league
    // metadata that no single client should overwrite wholesale.
    if (window._db && myUid) {
      const claim = {};
      claim['managerUids.' + name] = myUid;
      window._db.collection('leagues').doc(code).update(claim)
        .catch(function (e) { console.warn('[Join] uid claim failed:', e.message); });
    }

    _applyLeagueState(saved);
    saveState();
    document.getElementById('joinModal').style.display = 'none';
    _subscribeLeague(state.leagueCode);

    const nowFull = saved.managers.length >= max;
    track('league_joined', Object.assign(
      { managers: saved.managers.length, max_managers: max, filled_league: nowFull },
      window.Analytics ? window.Analytics.acquisition() : {}
    ));
    if (nowFull) track('league_filled', { max_managers: max });

    enterLeague();
  }

  function _tryLocal() {
    const leagueId = localStorage.getItem('mmfantasy-code-' + code);
    const raw = leagueId ? localStorage.getItem('mmfantasy-league-' + leagueId) : null;
    if (!raw) { errEl.textContent = 'League not found. Check the code and try again.'; errEl.style.display = 'block'; if (btn) { btn.textContent = 'Join'; btn.disabled = false; } return; }
    let saved;
    try { saved = JSON.parse(raw); } catch (e) { errEl.textContent = 'League data is corrupted.'; errEl.style.display = 'block'; if (btn) { btn.textContent = 'Join'; btn.disabled = false; } return; }
    _finalize(saved);
  }

  if (window._db) {
    if (btn) { btn.textContent = 'Joining…'; btn.disabled = true; }
    window._db.collection('leagues').doc(code).get()
      .then(doc => {
        if (btn) { btn.textContent = 'Join'; btn.disabled = false; }
        if (doc.exists) {
          _finalize(doc.data());
        } else {
          _tryLocal();
        }
      })
      .catch(e => {
        console.warn('[Firestore] join lookup failed:', e.message);
        if (btn) { btn.textContent = 'Join'; btn.disabled = false; }
        _tryLocal();
      });
  } else {
    _tryLocal();
  }
}

// ── COMMISSIONER VISIBILITY ───────────────────────────────
function updateCommissionerVisibility() {
  const show = isCommissioner();
  document.querySelectorAll('.commissioner-only').forEach(el => {
    el.classList.toggle('comm-visible', show);
  });
}

// ── RENDER ────────────────────────────────────────────────
function render() {
  try { renderHome(); } catch (e) { console.error('renderHome', e); }
  try { renderDraft(); } catch (e) { console.error('renderDraft', e); }
  try { renderPlayerPool(); } catch (e) { console.error('renderPlayerPool', e); }
  try {
    const cg = document.getElementById('playerCardGrid');
    if (cg && cg.classList.contains('active')) renderPlayerCardGrid();
  } catch (e) { console.error('renderPlayerCardGrid', e); }
  try { renderTeams(); } catch (e) { console.error('renderTeams', e); }
  try { renderScoringSettings(); } catch (e) { console.error('renderScoringSettings', e); }
  try { renderActivityFeed(); } catch (e) { console.error('renderActivityFeed', e); }
  try { renderSidebarUser(); } catch (e) { console.error('renderSidebarUser', e); }
  try { renderRightPanel(); } catch (e) { console.error('renderRightPanel', e); }
  updateCommissionerVisibility();
  try { updateMobileClockBar(); } catch (e) { }
  try { updateTimerBtnState(); } catch (e) { }
}

// ── HOME ──────────────────────────────────────────────────
function renderHome() {
  const lnEl = document.getElementById('homeLeagueName');
  if (lnEl) lnEl.textContent = state.leagueName || 'My League';

  const pill = document.getElementById('homeStatusPill');
  if (pill) {
    let status = 'Setup', cls = 'status-setup';
    if (state.managers.length > 0 && state.currentPickIndex > 0 && !isDraftComplete()) { status = 'Draft'; cls = 'status-draft'; }
    else if (isDraftComplete()) { status = 'Active'; cls = 'status-active'; }
    pill.textContent = status;
    pill.className = 'status-pill ' + cls;
  }

  const pick = currentPick();
  const pmEl = document.getElementById('homePickManager');
  const plEl = document.getElementById('homePickLabel');
  if (pmEl) pmEl.textContent = pick ? pick.manager : (isDraftComplete() ? 'Draft Complete' : '-');
  if (plEl) plEl.textContent = pick ? pick.label : (isDraftComplete() ? 'Tournament in progress' : 'No draft started');

  const timerEl = document.getElementById('homeTimer');
  if (timerEl) {
    if (state.timerRunning || state.pickTimerStartedAt) {
      timerEl.textContent = formatTimer(getRemainingSeconds());
    } else {
      timerEl.textContent = formatTimer(state.pickTimerSeconds);
    }
  }

  // Stat tiles: My Rank, My FPTS, Picks Left, Leader
  const session = getSession();
  const me = session ? session.name : null;
  const ranked = state.managers.length
    ? state.managers.slice().sort((a, b) => managerFPTS(b) - managerFPTS(a))
    : [];
  const myRank = me ? ranked.indexOf(me) + 1 : 0;
  const myFpts = me ? managerFPTS(me) : 0;
  const totalPicks = buildDraftOrder().length;
  const picksLeft = Math.max(0, totalPicks - state.currentPickIndex);
  const leader = ranked[0] || null;
  const leaderFpts = leader ? managerFPTS(leader) : 0;

  const srankEl = document.getElementById('statMyRank');
  const sfptsEl = document.getElementById('statMyFpts');
  const spicksEl = document.getElementById('statPicksLeft');
  const sleaderEl = document.getElementById('statLeaderName');

  if (srankEl) srankEl.textContent = myRank ? '#' + myRank : '-';
  if (sfptsEl) sfptsEl.textContent = myFpts || '0';
  if (spicksEl) spicksEl.textContent = totalPicks > 0 ? picksLeft : '-';
  if (sleaderEl) {
    if (leader) {
      sleaderEl.textContent = leader === me ? 'You!' : leader.split(' ')[0];
      sleaderEl.title = leader + ' · ' + leaderFpts + ' pts';
    } else {
      sleaderEl.textContent = '-';
    }
  }

  const snEl = document.getElementById('setupLeagueName');
  if (snEl && !snEl.dataset.dirty) snEl.value = state.leagueName || '';
  // Sync draft setup panel
  const rounds = state.rounds || 8;
  const srndEl = document.getElementById('setupRounds');
  if (srndEl) srndEl.value = rounds;
  const dsRoundsVal = document.getElementById('dsRoundsVal');
  if (dsRoundsVal) dsRoundsVal.textContent = rounds;
  window._dsManagers = (state.managers || []).slice();
  renderDraftSetupList();

  // Update both home and settings copies (previously duplicate IDs, now distinct)
  document.querySelectorAll('#leagueCodeDisplay, #settingsLeagueCodeDisplay').forEach(el => { el.textContent = state.leagueCode || '--'; });
  const elnEl = document.getElementById('settingsEditLeagueName');
  if (elnEl && !elnEl.dataset.dirty) elnEl.value = state.leagueName || '';

  // Home top bar
  const homeUserNameEl = document.getElementById('homeUserName');
  if (homeUserNameEl) homeUserNameEl.textContent = session ? session.name : '-';
  const homeUserAvatarEl = document.getElementById('homeUserAvatar');
  if (homeUserAvatarEl) homeUserAvatarEl.innerHTML = makeAvatarHTML(session ? session.name : '-', 28);

  // Settings profile row
  const spName = document.getElementById('settingsProfileName');
  if (spName) spName.textContent = session ? session.name : '-';
  const spAvatar = document.getElementById('settingsProfileAvatar');
  if (spAvatar) spAvatar.innerHTML = makeAvatarHTML(session ? session.name : '-', 40);

  // Dynamic hero label: show round/pick info
  const heroRoundLabel = document.getElementById('heroRoundLabel');
  if (heroRoundLabel) heroRoundLabel.textContent = pick ? pick.label : (isDraftComplete() ? 'Draft Complete' : 'On the Clock');

  // Stat tile sub-labels
  const totalRounds = state.rounds || 8;
  const picksPerRound = state.managers.length || 1;
  const roundsLeft = Math.ceil(picksLeft / Math.max(picksPerRound, 1));
  const srankSubEl = document.getElementById('statMyRankSub');
  if (srankSubEl) {
    if (!myRank) srankSubEl.textContent = 'Join the league';
    else if (myRank === 1) srankSubEl.textContent = 'Top of the league';
    else srankSubEl.textContent = myRank + ' of ' + ranked.length + ' managers';
  }
  const spicksSubEl = document.getElementById('statPicksLeftSub');
  if (spicksSubEl) spicksSubEl.textContent = roundsLeft > 0 ? roundsLeft + ' Round' + (roundsLeft !== 1 ? 's' : '') + ' Remaining' : (isDraftComplete() ? 'Draft complete' : '-');
  const sleaderSubEl = document.getElementById('statLeaderSub');
  if (sleaderSubEl) {
    if (!leader) sleaderSubEl.textContent = '-';
    else if (leader === me) sleaderSubEl.textContent = 'Keep it up!';
    else sleaderSubEl.textContent = leaderFpts + ' pts';
  }

  // Ring progress initial render
  updateRingProgress();

  // Swaps itself in for the hero card once the draft is done.
  try { renderMyTeamCard(); } catch (e) { console.warn('renderMyTeamCard', e); }

  // Dynamic home card subtexts: live data on each re-render
  try {
    const chatUnread = (() => {
      try {
        const msgs = getChatMessages();
        const lastRead = getChatReadTime();
        return msgs.filter(m => m.sender !== (me || '') && m.timestamp > lastRead).length;
      } catch (e) { return 0; }
    })();
    document.querySelectorAll('#homePage .home-card[data-page]').forEach(card => {
      const sub = card.querySelector('.hc-sub');
      if (!sub) return;
      const pg = card.dataset.page;
      if (pg === 'players') {
        if (isDraftComplete()) sub.textContent = 'Draft complete ✓';
        else if (state.currentPickIndex > 0) sub.textContent = 'Pick #' + (state.currentPickIndex + 1) + ' active';
        else sub.textContent = 'Draft room & player pool';
      } else if (pg === 'standings') {
        if (me && myRank > 0) sub.textContent = myRank === 1 ? "You're leading!" : 'You\'re #' + myRank;
        else sub.textContent = 'Check the race';
      } else if (pg === 'teams') {
        sub.textContent = state.managers.length ? state.managers.length + ' teams' : 'View rosters';
      } else if (pg === 'chat') {
        if (chatUnread > 0) {
          sub.textContent = chatUnread + ' new message' + (chatUnread > 1 ? 's' : '');
          sub.classList.add('hc-sub--alert');
        } else {
          sub.textContent = 'League messages';
          sub.classList.remove('hc-sub--alert');
        }
        // Show/hide unread dot on chat card icon
        const icon = card.querySelector('.hc-icon');
        let dot = icon ? icon.querySelector('.hc-unread-dot') : null;
        if (chatUnread > 0 && icon && !dot) {
          dot = document.createElement('span');
          dot.className = 'hc-unread-dot';
          icon.style.position = 'relative';
          icon.appendChild(dot);
        } else if (chatUnread === 0 && dot) {
          dot.remove();
        }
      }
    });
  } catch (e) { /* ignore */ }

  renderTournamentBanner();
}

// ── AVATAR / PROFILE UTILS ────────────────────────────────
const AVATAR_COLORS = ['#4f8ff7', '#ff6b35', '#34d399', '#9b7fff', '#f6c54e', '#f04040', '#06b6d4'];
function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}
function getStoredAvatar() {
  const s = getSession();
  if (!s) return null;
  try { return localStorage.getItem('mmfantasy-avatar-' + s.email) || null; } catch (e) { return null; }
}
function saveStoredAvatar(dataURL) {
  const s = getSession();
  if (!s) return;
  try { localStorage.setItem('mmfantasy-avatar-' + s.email, dataURL); } catch (e) {
    toast('Image too large to save. Try a smaller photo.', 'error');
  }
}
function compressAndSaveAvatar(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const MAX = 200;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataURL = canvas.toDataURL('image/jpeg', 0.82);
      saveStoredAvatar(dataURL);
      renderSidebarUser();
      renderProfile();
      toast('Profile photo updated!', 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function makeAvatarHTML(name, size) {
  const color = getAvatarColor(name);
  const initials = getInitials(name);
  const fontSize = Math.round(size * 0.38);
  const pic = getStoredAvatar();
  if (pic) {
    return '<div class="avatar" style="width:' + size + 'px;height:' + size + 'px;background:' + color + ';overflow:hidden;">' +
      '<img src="' + pic + '" style="width:100%;height:100%;object-fit:cover;" alt="" />' +
      '</div>';
  }
  return '<div class="avatar" style="width:' + size + 'px;height:' + size + 'px;background:' + color + ';font-size:' + fontSize + 'px;">' + esc(initials) + '</div>';
}

function renderSidebarUser() {
  const el = document.getElementById('sidebarUser');
  if (!el) return;
  const s = getSession();
  const name = s ? s.name : '';
  el.innerHTML = makeAvatarHTML(name, 34) +
    '<div class="sidebar-user-text"><span class="sidebar-profile-name">' + esc(name) + '</span>' +
    '<span class="sidebar-profile-sub">View Profile</span></div>';

  // Also populate the mobile clock bar profile avatar
  const mcbBtn = document.getElementById('mcbProfileBtn');
  if (mcbBtn) mcbBtn.innerHTML = makeAvatarHTML(name, 34);
}

// ── PROFILE PAGE ──────────────────────────────────────────
function renderProfile() {
  const session = getSession();
  if (!session) return;
  const name = session.name;
  const color = getAvatarColor(name);
  const initials = getInitials(name);

  // Hero background tinted to avatar color
  const heroBg = document.getElementById('profileHeroBg');
  if (heroBg) heroBg.style.background = 'linear-gradient(135deg, ' + color + '22 0%, ' + color + '0d 60%, transparent 100%)';

  // Avatar ring color
  const ring = document.getElementById('profileAvatarRing');
  if (ring) ring.style.background = 'conic-gradient(from 180deg, ' + color + ', ' + color + '88, ' + color + ')';

  // Avatar: show photo if uploaded, otherwise colored initials
  const avatarEl = document.getElementById('profileAvatar');
  if (avatarEl) {
    avatarEl.style.background = color;
    const pic = getStoredAvatar();
    if (pic) {
      avatarEl.innerHTML = '<img src="' + pic + '" style="width:100%;height:100%;object-fit:cover;" alt="" />';
    } else {
      avatarEl.innerHTML = '';
      avatarEl.textContent = initials;
    }
  }

  // Name + email
  const nameDisplay = document.getElementById('profileNameDisplay');
  if (nameDisplay) nameDisplay.textContent = name;
  const emailEl = document.getElementById('profileEmail');
  if (emailEl) emailEl.textContent = session.email || '';

  // Commissioner badge: place below name row
  const heroInfo = document.querySelector('.profile-hero-info');
  const existingBadge = heroInfo ? heroInfo.querySelector('.profile-commissioner-badge') : null;
  if (existingBadge) existingBadge.remove();
  if (isCommissioner() && heroInfo) {
    const badge = document.createElement('div');
    badge.className = 'profile-commissioner-badge';
    badge.textContent = 'Commissioner';
    heroInfo.appendChild(badge);
  }

  // Stats
  const statsEl = document.getElementById('profileStats');
  if (statsEl) {
    const real = hasRealStats();
    const fpts = managerFPTS(name);
    const projFpts = real ? managerProjectedFPTS(name) : null;
    const drafted = Object.values(state.drafted).filter(d => d.manager === name).length;
    const ranked = state.managers.slice().sort((a, b) => managerFPTS(b) - managerFPTS(a));
    const rank = ranked.indexOf(name) + 1;

    // FPTS card: show actual + projected sub-line if real stats exist
    const fptsCard =
      '<div class="profile-stat">' +
      '<div class="profile-stat-val">' + (fpts || '0') + '</div>' +
      '<div class="profile-stat-label">' + (real ? 'Actual FPTS' : 'Proj. FPTS') + '</div>' +
      (real && projFpts !== null
        ? '<div class="profile-stat-proj">Proj: ' + projFpts + '</div>'
        : '') +
      '</div>';

    const rankCard =
      '<div class="profile-stat">' +
      '<div class="profile-stat-val">' + (rank ? '#' + rank : '-') + '</div>' +
      '<div class="profile-stat-label">League Rank</div>' +
      '</div>';

    const draftCard =
      '<div class="profile-stat">' +
      '<div class="profile-stat-val">' + drafted + '</div>' +
      '<div class="profile-stat-label">Drafted</div>' +
      '</div>';

    statsEl.innerHTML = rankCard + fptsCard + draftCard;
  }
}

// ── DRAFT ─────────────────────────────────────────────────
function updateDraftTabLock() {
  const locked = !state.selectedTournament;
  document.querySelectorAll('.dit-btn').forEach(function (btn) {
    btn.classList.toggle('locked', locked);
  });
}

function renderDraft() {
  updateDraftTabLock();
  const tab = document.getElementById('draftRoomTab');

  // Gate: no tournament selected -- show an overlay, never wipe the tab innerHTML
  if (!state.selectedTournament) {
    let overlay = document.getElementById('draftLockOverlay');
    if (tab && !overlay) {
      overlay = document.createElement('div');
      overlay.id = 'draftLockOverlay';
      overlay.className = 'draft-lock-overlay';
      tab.appendChild(overlay);
    }
    if (overlay) {
      overlay.innerHTML = getLockHtml('the draft');
      overlay.style.display = 'flex';
      const btn = overlay.querySelector('#plSelectTournBtn');
      if (btn) btn.addEventListener('click', openTournamentSelector);
    }
    return;
  }

  // Hide the overlay when a tournament is active
  const overlay = document.getElementById('draftLockOverlay');
  if (overlay) overlay.style.display = 'none';

  const pick = currentPick();
  const complete = isDraftComplete();

  const dHeroSub = document.getElementById('draftHeroSub');
  if (dHeroSub) dHeroSub.textContent = complete ? 'Draft complete!' : (pick ? 'Round ' + pick.round + ' of ' + state.rounds : 'Waiting for draft to begin…');

  const dPickMgr = document.getElementById('draftPickManager');
  const dPickLabel = document.getElementById('draftPickLabel');
  if (dPickMgr) dPickMgr.textContent = pick ? pick.manager : (complete ? 'Done' : '-');
  if (dPickLabel) dPickLabel.textContent = pick ? pick.label : '';

  const dcbTimer = document.getElementById('dcbTimer');
  if (dcbTimer) dcbTimer.textContent = pick ? formatTimer(getRemainingSeconds()) : '';

  renderDraftOrderStrip();
  renderDraftGrid();
  renderRecentPicks();
}

// ── DRAFT SETUP PANEL (Settings) ──────────────────────────
function renderDraftSetupList() {
  const list = document.getElementById('draftOrderList');
  if (!list) return;
  const mgrs = window._dsManagers || [];
  list.innerHTML = mgrs.map((m, i) => {
    const isComm = m === state.commissioner;
    return '<li class="ds-item" draggable="true" data-index="' + i + '">' +
      '<span class="ds-grip"><svg viewBox="0 0 10 18" width="10" height="18" fill="currentColor">' +
      '<circle cx="3" cy="2" r="1.5"/><circle cx="7" cy="2" r="1.5"/>' +
      '<circle cx="3" cy="9" r="1.5"/><circle cx="7" cy="9" r="1.5"/>' +
      '<circle cx="3" cy="16" r="1.5"/><circle cx="7" cy="16" r="1.5"/>' +
      '</svg></span>' +
      '<span class="ds-pick-num">' + (i + 1) + '</span>' +
      '<span class="ds-name">' + esc(m) + (isComm ? ' <span class="ds-comm-tag">You</span>' : '') + '</span>' +
      (!isComm ? '<button class="ds-remove-btn" data-name="' + esc(m) + '" aria-label="Remove ' + esc(m) + '">×</button>' : '') +
      '</li>';
  }).join('');

  list.querySelectorAll('.ds-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window._dsManagers = (window._dsManagers || []).filter(m => m !== btn.dataset.name);
      renderDraftSetupList();
    });
  });
  setupDraftListDrag();
}

function setupDraftListDrag() {
  const list = document.getElementById('draftOrderList');
  if (!list) return;
  let draggingEl = null;

  list.querySelectorAll('.ds-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      draggingEl = item;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => item.classList.add('ds-dragging'), 0);
    });
    item.addEventListener('dragend', () => {
      if (draggingEl) draggingEl.classList.remove('ds-dragging');
      list.querySelectorAll('.ds-item').forEach(i => i.classList.remove('ds-over'));
      draggingEl = null;
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      if (!draggingEl || draggingEl === item) return;
      list.querySelectorAll('.ds-item').forEach(i => i.classList.remove('ds-over'));
      item.classList.add('ds-over');
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (!draggingEl || draggingEl === item) return;
      const fromIdx = parseInt(draggingEl.dataset.index);
      const toIdx = parseInt(item.dataset.index);
      const arr = (window._dsManagers || []).slice();
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      window._dsManagers = arr;
      renderDraftSetupList();
    });
  });
}

function initDraftSetup() {
  // Rounds stepper
  function updateRoundsDisplay(delta) {
    const inp = document.getElementById('setupRounds');
    const disp = document.getElementById('dsRoundsVal');
    const current = parseInt(inp ? inp.value : 8) || 8;
    const next = Math.min(20, Math.max(1, current + delta));
    if (inp) inp.value = next;
    if (disp) disp.textContent = next;
  }
  document.getElementById('dsRoundsMinus')?.addEventListener('click', () => updateRoundsDisplay(-1));
  document.getElementById('dsRoundsPlus')?.addEventListener('click', () => updateRoundsDisplay(1));

  // Add manager
  const addInput = document.getElementById('dsAddManagerInput');
  const addBtn = document.getElementById('dsAddManagerBtn');
  function addManager() {
    const name = (addInput?.value || '').trim();
    if (!name) return;
    if (!window._dsManagers) window._dsManagers = (state.managers || []).slice();
    if (window._dsManagers.includes(name)) { toast('Already in the list', 'error'); return; }
    window._dsManagers.push(name);
    if (addInput) addInput.value = '';
    renderDraftSetupList();
  }
  addBtn?.addEventListener('click', addManager);
  addInput?.addEventListener('keydown', e => { if (e.key === 'Enter') addManager(); });
}

function renderDraftOrderStrip() {
  const strip = document.getElementById('draftOrderStrip');
  if (!strip) return;
  const order = buildDraftOrder();
  strip.innerHTML = order.map((o, i) => {
    let cls = 'doc-chip';
    if (i === state.currentPickIndex) cls += ' current';
    else if (i < state.currentPickIndex) cls += ' done';
    return '<div class="' + cls + '"><span class="doc-pick-num">#' + o.pickNumber + '</span><span class="doc-manager">' + esc(o.manager) + '</span></div>';
  }).join('');
  const cur = strip.querySelector('.doc-chip.current');
  if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

// Requirement chips: "G ✓ · F ✓ · C needed". Rendered for whoever is on
// the clock so the rule is visible before it bites, not after.
function renderRosterRequirements() {
  const host = document.getElementById('rosterReqBar');
  if (!host) return;

  const pick = currentPick();
  if (!pick) { host.innerHTML = ''; host.style.display = 'none'; return; }

  const unmet  = unmetRequirements(pick.manager);
  const forced = forcedPositionsFor(pick.manager);
  const left   = picksRemainingFor(pick.manager);

  host.style.display = '';
  host.innerHTML =
    '<span class="rr-label">' + esc(pick.manager) + '</span>' +
    ROSTER_POSITIONS.map(function (pos) {
      const met      = unmet.indexOf(pos) === -1;
      const required = forced.indexOf(pos) !== -1;
      const cls = 'rr-chip' + (met ? ' rr-chip--met' : '') + (required ? ' rr-chip--forced' : '');
      return '<span class="' + cls + '">' + POSITION_LABELS[pos] +
             (met ? ' ✓' : '') + '</span>';
    }).join('') +
    '<span class="rr-left">' + left + ' pick' + (left === 1 ? '' : 's') + ' left</span>' +
    (forced.length
      ? '<span class="rr-warn">Must take ' +
        forced.map(p => POSITION_LABELS[p]).join(' + ') + '</span>'
      : '');
}

function renderDraftGrid() {
  try { renderRosterRequirements(); } catch (e) { console.warn('renderRosterRequirements', e); }
  try { wireQueue(); wireQueueStars(); renderQueue(); } catch (e) { console.warn('renderQueue', e); }
  const grid = document.getElementById('draftPlayerGrid');
  if (!grid) return;
  const search = (document.getElementById('draftSearch') ? document.getElementById('draftSearch').value : '').toLowerCase();
  const posFilter = document.getElementById('draftPosFilter') ? document.getElementById('draftPosFilter').value : '';
  const players = getSortedPlayers(search, posFilter);
  if (players.length === 0) { grid.innerHTML = '<div style="padding:20px;color:var(--muted);text-align:center;">No players found.</div>'; return; }
  // Whose roster rule are we evaluating against? The manager on the
  // clock, since they are the only one who can pick right now.
  const _pick = currentPick();
  const _onClock = _pick ? _pick.manager : null;

  grid.innerHTML = players.map((p, i) => {
    const isDrafted = !!state.drafted[p.id];
    const isLocked  = !isDrafted && _onClock && !playerIsEligible(p, _onClock);
    const qPos = queuePosition(p.id);
    const fpts = calcFPTS(p);
    const seedCls = p.seed <= 4 ? ' seed-' + p.seed : '';
    return '<div class="pool-row' + (isDrafted ? ' drafted' : '') + (isLocked ? ' pool-row--locked' : '') + '" data-pid="' + p.id + '">' +
      '<span class="pool-rank">' + (i + 1) + '</span>' +
      '<div class="pool-player-cell">' + getSchoolLogoHTML(p.college, 26) +
      '<div class="pool-player-info"><div class="pool-player-name">' + esc(p.name) +
        (qPos ? '<span class="q-chip">Q' + qPos + '</span>' : '') +
      '</div><div class="pool-player-college">' + esc(p.college) + '</div></div>' +
      (isDrafted ? '' :
        '<button class="q-star' + (qPos ? ' q-star--on' : '') + '" data-queue="' + esc(p.id) + '"' +
        ' aria-label="' + (qPos ? 'Remove from queue' : 'Add to queue') + '" title="' +
        (qPos ? 'Remove from queue' : 'Add to queue') + '">&#9733;</button>') +
      '</div>' +
      '<span class="pool-seed-cell"><span class="seed-badge' + seedCls + '">' + p.seed + '</span></span>' +
      '<span class="pool-stat">' + p.stats.points + '</span>' +
      '<span class="pool-stat">' + p.stats.rebounds + '</span>' +
      '<span class="pool-stat">' + p.stats.assists + '</span>' +
      '<span class="pool-stat">' + p.stats.steals + '</span>' +
      '<span class="pool-stat">' + p.stats.blocks + '</span>' +
      '<span class="pool-fpts">' + fpts + '</span>' +
      '<span class="pool-action">' + (isDrafted
        ? '<span class="drafted-badge">Drafted</span>'
        : '<button class="pick-btn" data-pid="' + p.id + '">Pick ›</button>') + '</span>' +
      '</div>';
  }).join('');

  grid.querySelectorAll('.pool-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('pick-btn')) {
        openDraftConfirm(e.target.dataset.pid);
      } else {
        showPlayerDetail(row.dataset.pid, row, false);
      }
    });
  });
}

function renderRecentPicks() {
  const el = document.getElementById('draftRecentPicks');
  const strip = el ? el.closest('.draft-recent-strip') : null;
  if (!el) return;
  const order = buildDraftOrder();
  const recentIdx = Math.max(0, state.currentPickIndex - 20);
  const recent = order.slice(recentIdx, state.currentPickIndex).reverse();
  if (strip) strip.style.display = '';
  if (recent.length === 0) { el.innerHTML = '<span class="rp-empty">No picks yet</span>'; return; }
  el.innerHTML = recent.map(o => {
    const player = Object.entries(state.drafted).find(([, d]) => d.label === o.label && d.manager === o.manager);
    if (!player) return '';
    const p = (state.players || []).find(x => x.id === player[0]);
    if (!p) return '';
    return '<div class="rp-chip">' +
      '<span class="rp-chip-num">#' + o.pickNumber + '</span>' +
      '<div class="rp-chip-info">' +
      '<div class="rp-chip-player">' + esc(p.name) + '</div>' +
      '<div class="rp-chip-mgr">' + esc(o.manager) + '</div>' +
      '</div>' +
      '</div>';
  }).filter(Boolean).join('');
}

// ── DRAFT CONFIRM ─────────────────────────────────────────
function openDraftConfirm(playerId) {
  const p = (state.players || []).find(x => x.id === playerId);
  if (!p || state.drafted[playerId]) return;
  // Enforce: only the current manager on the clock can pick
  const pick = currentPick();
  const session = getSession();
  if (pick && session && session.name !== pick.manager && !isCommissioner()) {
    toast("It's " + pick.manager + "'s pick, not yours.", 'error');
    return;
  }

  // Block the pick before the confirm modal opens, so the reason is
  // explained at the moment of the tap rather than after confirming.
  if (pick) {
    const rule = checkRosterRule(p, pick.manager);
    if (!rule.ok) {
      toast(rule.reason, 'error');
      track('roster_rule_blocked', {
        round: pick.round, forced: rule.forced.join('+'), position: p.position,
      });
      return;
    }
  }

  pendingPickPlayerId = playerId;
  const modal = document.getElementById('draftConfirmModal');
  const logoEl = document.getElementById('confirmLogo');
  const nameEl = document.getElementById('confirmPlayerName');
  const detailEl = document.getElementById('confirmPlayerDetail');
  const statsEl = document.getElementById('confirmStats');
  if (logoEl) logoEl.innerHTML = getSchoolLogoHTML(p.college, 52);
  if (nameEl) nameEl.textContent = p.name;
  if (detailEl) detailEl.textContent = p.position + ' · ' + p.college + ' · Seed ' + p.seed + ' ' + p.region;
  if (statsEl) {
    const fpts = calcFPTS(p);
    statsEl.innerHTML = [
      { val: p.stats.points, label: 'PTS' },
      { val: p.stats.rebounds, label: 'REB' },
      { val: p.stats.assists, label: 'AST' },
      { val: p.stats.steals, label: 'STL' },
      { val: p.stats.blocks, label: 'BLK' },
      { val: fpts, label: 'FPTS' }
    ].map(s => '<div class="cs-item"><div class="cs-val">' + s.val + '</div><div class="cs-label">' + s.label + '</div></div>').join('');
  }
  if (modal) modal.style.display = 'flex';
}

// ══════════════════════════════════════════════════════════
// 🏀 ROSTER REQUIREMENTS
//   Every roster must end with at least one guard, one forward
//   and one center. The remaining picks are unrestricted.
//
//   The feed only gives us three buckets (G / F / C) plus
//   hyphenates like "F-C" and "G-F". A hyphenate counts for
//   EITHER of its buckets but only one at a time, which makes
//   this a small bipartite matching rather than a tally.
//
//   Enforcement is "don't paint yourself into a corner": a pick
//   is blocked only when taking it would make the requirements
//   impossible to finish. With 8 picks and 3 requirements you
//   have 5 completely free picks before anything locks.
// ══════════════════════════════════════════════════════════
const ROSTER_POSITIONS = ['G', 'F', 'C'];

const POSITION_LABELS = { G: 'Guard', F: 'Forward', C: 'Center' };

// Height in inches from ESPN's "6'9\"" format. 0 if unparseable.
function heightInches(h) {
  const m = /(\d+)\s*'\s*(\d+)/.exec(String(h || ''));
  return m ? (parseInt(m[1], 10) * 12 + parseInt(m[2], 10)) : 0;
}

const CENTER_ELIGIBLE_INCHES = 81;   // 6'9"

// 'F-C' -> Set{F,C} ;  'PG' -> Set{G} ;  'C' -> Set{C}
function positionBuckets(player) {
  const raw = String((player && player.position) || '').toUpperCase();
  const out = new Set();
  if (raw.indexOf('C') !== -1) out.add('C');
  if (raw.indexOf('G') !== -1) out.add('G');
  if (raw.indexOf('F') !== -1) out.add('F');

  // ── Why tall forwards count as centers ──────────────────
  //  ESPN labels almost every big as 'F', including 7-footers.
  //  Counting only literal 'C' left the real pools at 6 centers for
  //  8 Maui managers, 4 for 8 at Atlantis and 2 for 4 at the
  //  Showcase — the roster rule was mathematically unsatisfiable and
  //  a live draft would have deadlocked with players still on the
  //  board. Treating F at 6'9" or taller as center-eligible takes
  //  those pools to 24 / 29 / 9, which is comfortable.
  //
  //  This is eligibility, not relabelling: the player still displays
  //  as a Forward and can still fill the Forward requirement. He just
  //  also satisfies Center, the same way a genuine 'F-C' does.
  if (out.has('F') && !out.has('C') &&
      heightInches(player && player.height) >= CENTER_ELIGIBLE_INCHES) {
    out.add('C');
  }

  // Unknown or blank positions are treated as wildcards rather than
  // as unusable, so a data gap can never soft-lock someone's draft.
  if (out.size === 0) ROSTER_POSITIONS.forEach(p => out.add(p));
  return out;
}

// Maximum number of distinct requirements these players can cover.
// Augmenting-path matching; the search space is 3 wide so this is
// effectively free.
function maxPositionCover(bucketSets) {
  const matchOf = {};

  function tryAssign(i, seen) {
    const buckets = bucketSets[i];
    for (const pos of ROSTER_POSITIONS) {
      if (!buckets.has(pos) || seen.has(pos)) continue;
      seen.add(pos);
      if (matchOf[pos] === undefined || tryAssign(matchOf[pos], seen)) {
        matchOf[pos] = i;
        return true;
      }
    }
    return false;
  }

  let covered = 0;
  for (let i = 0; i < bucketSets.length; i++) {
    if (tryAssign(i, new Set())) covered++;
  }
  return covered;
}

function rosterPlayersFor(manager) {
  const out = [];
  Object.keys(state.drafted || {}).forEach(function (pid) {
    if (state.drafted[pid].manager !== manager) return;
    const p = (state.players || []).find(x => x.id === pid);
    if (p) out.push(p);
  });
  return out;
}

// How many picks this manager still has, including the one on the clock.
function picksRemainingFor(manager) {
  const rounds = state.rounds || 8;
  return Math.max(0, rounds - rosterPlayersFor(manager).length);
}

// Which of G/F/C this manager's current roster cannot yet cover.
// Used for the requirement chips on the draft board.
function unmetRequirements(manager) {
  const sets = rosterPlayersFor(manager).map(positionBuckets);
  const covered = maxPositionCover(sets);
  return ROSTER_POSITIONS.filter(function (pos) {
    return maxPositionCover(sets.concat([new Set([pos])])) > covered;
  });
}

/**
 * Can `manager` still finish a legal roster if they take `candidate` now?
 * Returns { ok, reason, forced }  where `forced` lists the positions they
 * are now obligated to take.
 */
function checkRosterRule(candidate, manager) {
  const rounds = state.rounds || 8;
  const roster = rosterPlayersFor(manager);

  // Not enough rounds to satisfy the rule at all: disable it rather than
  // making the draft unwinnable (e.g. a 2-round test league).
  if (rounds < ROSTER_POSITIONS.length) return { ok: true, forced: [] };

  const afterSets = roster.map(positionBuckets);
  if (candidate) afterSets.push(positionBuckets(candidate));

  const coveredAfter  = maxPositionCover(afterSets);
  const stillMissing  = ROSTER_POSITIONS.length - coveredAfter;
  const picksLeftAfter = rounds - afterSets.length;

  if (stillMissing > picksLeftAfter) {
    const missing = ROSTER_POSITIONS.filter(function (pos) {
      const withPos = maxPositionCover(afterSets.concat([new Set([pos])]));
      return withPos > coveredAfter;
    });
    return {
      ok: false,
      forced: missing,
      reason: 'You need ' + missing.map(p => POSITION_LABELS[p]).join(' and ') +
              ' to complete a legal roster, and only ' + picksLeftAfter +
              ' pick' + (picksLeftAfter === 1 ? '' : 's') + ' left.',
    };
  }

  return { ok: true, forced: [] };
}

// Positions a manager MUST take with their remaining picks. Empty when
// they still have slack. Drives the draft board chips and the lockout.
function forcedPositionsFor(manager) {
  const rounds = state.rounds || 8;
  if (rounds < ROSTER_POSITIONS.length) return [];

  const sets = rosterPlayersFor(manager).map(positionBuckets);
  const covered = maxPositionCover(sets);
  const missing = ROSTER_POSITIONS.length - covered;
  const picksLeft = rounds - sets.length;

  if (missing < picksLeft) return [];   // still has slack

  return ROSTER_POSITIONS.filter(function (pos) {
    return maxPositionCover(sets.concat([new Set([pos])])) > covered;
  });
}

// True when this player is legal for the manager on the clock right now.
function playerIsEligible(player, manager) {
  if (!manager) return true;
  return checkRosterRule(player, manager).ok;
}

function confirmDraftPick() {
  if (!pendingPickPlayerId) return;
  const pick = currentPick();
  if (!pick) { toast('Draft is complete or not started', 'error'); return; }
  const p = (state.players || []).find(x => x.id === pendingPickPlayerId);
  if (!p || state.drafted[pendingPickPlayerId]) { toast('Player already drafted', 'error'); return; }

  // Roster rule. Checked here as well as in the UI, because the UI can
  // be stale by a pick or two when several managers act at once.
  const rule = checkRosterRule(p, pick.manager);
  if (!rule.ok) {
    toast(rule.reason, 'error');
    document.getElementById('draftConfirmModal').style.display = 'none';
    pendingPickPlayerId = null;
    return;
  }

  const btn = document.getElementById('confirmPickBtn');
  if (btn) { btn.classList.add('draft-go--charging'); btn.textContent = 'Confirming…'; }

  setTimeout(() => {
    state.drafted[pendingPickPlayerId] = {
      manager: pick.manager,
      round: pick.round,
      pick: pick.pick,
      pickNumber: pick.pickNumber,
      label: pick.label,
      ts: Date.now()
    };
    state.currentPickIndex++;
    pruneQueues(pendingPickPlayerId);
    addActivity(esc(pick.manager) + ' drafted ' + esc(p.name) + ' (' + pick.label + ')');
    track('pick_made', {
      round: pick.round,
      pick_number: pick.pickNumber,
      seed: p.seed,
      position: p.position,
      seconds_used: state.pickTimerStartedAt
        ? Math.round((Date.now() - state.pickTimerStartedAt) / 1000) : null,
    });
    saveState();

    if (btn) { btn.classList.remove('draft-go--charging'); btn.textContent = 'Confirm Pick ›'; }
    document.getElementById('draftConfirmModal').style.display = 'none';
    pendingPickPlayerId = null;

    // Flash row
    const row = document.querySelector('.pool-row[data-pid="' + p.id + '"]');
    if (row) row.classList.add('pool-row--flash');

    // Show announcement
    showPickAnnounce(p, pick.manager);

    // Reset timer
    if (state.timerRunning) {
      state.pickTimerStartedAt = Date.now();
    }

    render();

    if (isDraftComplete()) {
      toast('Draft complete!', 'success');
      setTimeout(launchConfetti, 200);
      track('draft_completed', {
        managers: (state.managers || []).length,
        rounds: state.rounds || 8,
        total_picks: Object.keys(state.drafted || {}).length,
        tournament: state.selectedTournament ? state.selectedTournament.id : null,
      });
    }
  }, 450);
}

function showPickAnnounce(p, manager) {
  const overlay = document.getElementById('pickAnnounce');
  const logoEl = document.getElementById('paLogo');
  const playerEl = document.getElementById('paPlayer');
  const collegeEl = document.getElementById('paCollege');
  const posEl = document.getElementById('paPos');
  const byEl = document.getElementById('paBy');
  if (!overlay) return;
  if (logoEl) logoEl.innerHTML = getSchoolLogoHTML(p.college, 72);
  if (playerEl) playerEl.textContent = p.name;
  if (collegeEl) collegeEl.textContent = p.college;
  if (posEl) posEl.innerHTML = '<span class="pos-badge">' + p.position + '</span>';
  if (byEl) byEl.textContent = 'Drafted by ' + manager;
  overlay.style.display = 'flex';
  // reset animation
  const card = document.getElementById('paCard');
  if (card) { card.style.animation = 'none'; card.offsetHeight; card.style.animation = ''; }
  setTimeout(() => { overlay.style.display = 'none'; }, 1600);
}

// ── PLAYER POOL ───────────────────────────────────────────
function getSortedPlayers(search, pos) {
  let players = (state.players || window.MM_PLAYERS || []).slice();
  if (search) players = players.filter(p => p.name.toLowerCase().includes(search) || p.college.toLowerCase().includes(search));
  if (pos) players = players.filter(p => p.position === pos);
  players.sort((a, b) => {
    let va, vb;
    if (poolSortCol === 'fpts') { va = calcFPTS(a); vb = calcFPTS(b); }
    else { va = a.stats[poolSortCol] || 0; vb = b.stats[poolSortCol] || 0; }
    return poolSortDir === 'desc' ? vb - va : va - vb;
  });
  return players;
}

function renderPlayerPool() {
  const grid = document.getElementById('playerPoolGrid');
  if (!grid) return;
  const search = (document.getElementById('poolSearch') ? document.getElementById('poolSearch').value : '').toLowerCase();
  const seed = document.getElementById('poolSeedFilter') ? document.getElementById('poolSeedFilter').value : '';
  const sort = document.getElementById('poolSortSelect') ? document.getElementById('poolSortSelect').value : 'fpts';

  let players = (state.players || window.MM_PLAYERS || []).slice();
  if (search) players = players.filter(p => p.name.toLowerCase().includes(search) || p.college.toLowerCase().includes(search));
  if (seed) {
    if (seed.includes('-')) { const [lo, hi] = seed.split('-').map(Number); players = players.filter(p => p.seed >= lo && p.seed <= hi); }
    else players = players.filter(p => p.seed === parseInt(seed));
  }

  // Column header click sort takes priority over dropdown
  const effectiveCol = playerPoolSortCol || sort;
  const effectiveDir = playerPoolSortDir || 'desc';
  players.sort((a, b) => {
    let va, vb;
    if (effectiveCol === 'fpts') { va = calcFPTS(a); vb = calcFPTS(b); }
    else { va = a.stats[effectiveCol] || 0; vb = b.stats[effectiveCol] || 0; }
    return effectiveDir === 'desc' ? vb - va : va - vb;
  });

  const availCount = document.getElementById('poolAvailCount');
  const avail = players.filter(p => !state.drafted[p.id]);
  if (availCount) availCount.textContent = avail.length + ' available';

  grid.innerHTML = players.map((p, i) => {
    const isDrafted = !!state.drafted[p.id];
    const fpts = calcFPTS(p);
    const dInfo = state.drafted[p.id];
    const seedCls = p.seed <= 4 ? ' seed-' + p.seed : '';
    let actionHTML = isDrafted
      ? '<span class="status-taken">Taken</span>'
      : '<span class="status-available">Available</span>';
    return '<div class="pool-row' + (isDrafted ? ' drafted' : '') + '" data-pid="' + p.id + '">' +
      '<span class="pool-rank">' + (i + 1) + '</span>' +
      '<div class="pool-player-cell">' + getSchoolLogoHTML(p.college, 26) +
      '<div class="pool-player-info"><div class="pool-player-name">' + esc(p.name) + '</div><div class="pool-player-college">' + esc(p.college) + '</div></div></div>' +
      '<span class="pool-seed-cell"><span class="seed-badge' + seedCls + '">' + p.seed + '</span></span>' +
      '<span class="pool-stat">' + p.stats.points + '</span>' +
      '<span class="pool-stat">' + p.stats.rebounds + '</span>' +
      '<span class="pool-stat">' + p.stats.assists + '</span>' +
      '<span class="pool-stat">' + p.stats.steals + '</span>' +
      '<span class="pool-stat">' + p.stats.blocks + '</span>' +
      '<span class="pool-fpts">' + fpts + '</span>' +
      '<span class="pool-action">' + actionHTML + '</span>' +
      '</div>';
  }).join('');

  grid.querySelectorAll('.pool-row').forEach(row => {
    row.addEventListener('click', () => {
      showPlayerDetail(row.dataset.pid, row);
    });
  });
}

// ── PLAYER DETAIL CARD ────────────────────────────────────
function showPlayerDetail(playerId, rowEl) {
  const p = (state.players || []).find(x => x.id === playerId);
  if (!p) return;
  if (rowEl) { rowEl.classList.add('pool-row--flash'); setTimeout(() => rowEl.classList.remove('pool-row--flash'), 700); }

  const overlay = document.getElementById('pdcOverlay');
  const nameEl = document.getElementById('pdcName');
  const logoEl = document.getElementById('pdcLogo');
  const posEl = document.getElementById('pdcPos');
  const seedEl = document.getElementById('pdcSeed');
  const regEl = document.getElementById('pdcRegion');
  const colEl = document.getElementById('pdcCollege');
  const statsEl = document.getElementById('pdcStats');
  const statusEl = document.getElementById('pdcDraftStatus');
  if (!overlay) return;

  if (logoEl) logoEl.innerHTML = getSchoolLogoHTML(p.college, 60);
  if (nameEl) nameEl.textContent = p.name;
  if (posEl) posEl.innerHTML = '<span class="pos-badge">' + p.position + '</span>';
  if (seedEl) seedEl.innerHTML = '<span class="seed-badge">Seed ' + p.seed + '</span>';
  if (regEl) regEl.innerHTML = '<span class="region-badge">' + p.region + '</span>';
  if (colEl) colEl.textContent = p.college;
  if (statsEl) {
    const fpts = calcFPTS(p);
    statsEl.innerHTML = [
      { val: p.stats.points, label: 'PTS' },
      { val: p.stats.rebounds, label: 'REB' },
      { val: p.stats.assists, label: 'AST' },
      { val: p.stats.steals, label: 'STL' },
      { val: p.stats.blocks, label: 'BLK' },
      { val: fpts, label: 'FPTS' }
    ].map(s => '<div class="pdc-stat"><div class="pdc-stat-val">' + s.val + '</div><div class="pdc-stat-label">' + s.label + '</div></div>').join('');
  }
  const dInfo = state.drafted[p.id];
  if (statusEl) {
    if (dInfo) {
      statusEl.className = 'pdc-draft-status taken';
      statusEl.textContent = 'Drafted by ' + dInfo.manager + ': ' + dInfo.label;
    } else {
      statusEl.className = 'pdc-draft-status available';
      statusEl.textContent = '✓ Available';
    }
  }
  // reset animation
  const card = document.getElementById('pdcCard');
  if (card) { card.style.animation = 'none'; card.offsetHeight; card.style.animation = ''; }
  overlay.style.display = 'flex';
}

function closePDC() {
  const overlay = document.getElementById('pdcOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ── TEAMS ─────────────────────────────────────────────────
function renderTeams() {
  const grid = document.getElementById('teamsGrid');
  if (!grid) return;
  if (state.managers.length === 0) { grid.innerHTML = '<p style="color:var(--muted);">No managers yet.</p>'; return; }
  const session = getSession();
  const currentUser = session ? session.name : null;
  const pick = currentPick();
  // Expand button delegation
  const prevGrid = document.getElementById('teamsGrid');
  if (prevGrid && !prevGrid.dataset.expandBound) {
    prevGrid.addEventListener('click', e => {
      const btn = e.target.closest('.tc-expand-btn');
      if (!btn) return;
      const mgr = btn.dataset.manager;
      if (expandedTeams.has(mgr)) expandedTeams.delete(mgr);
      else expandedTeams.add(mgr);
      renderTeams();
    });
    prevGrid.dataset.expandBound = '1';
  }

  const rankedManagers = state.managers.slice().sort((a, b) => managerFPTS(b) - managerFPTS(a));
  grid.innerHTML = rankedManagers.map(m => {
    const roster = managerRoster(m);
    const fpts = managerFPTS(m);
    const isMe = m === currentUser;
    const isOTC = pick && pick.manager === m;
    const rank = rankedManagers.indexOf(m) + 1;
    const rankMedal = rank === 1 ? ' rank-gold' : rank === 2 ? ' rank-silver' : rank === 3 ? ' rank-bronze' : '';
    const rankCardCls = rank === 1 ? ' rank-1-card' : rank === 2 ? ' rank-2-card' : rank === 3 ? ' rank-3-card' : '';
    return '<div class="team-card' + (isMe ? ' current-user' : '') + rankCardCls + '">' +
      '<div class="team-card-header">' +
      makeAvatarHTML(m, 38) +
      '<div class="tc-header-info"><span class="tc-name">' + esc(m) + '</span>' +
      '<span class="tc-badges">' +
      (m === state.commissioner ? '<span class="tc-commissioner">Commissioner</span>' : '') +
      (isOTC ? '<span class="tc-onclock">On Clock</span>' : '') +
      (isMe ? '<span class="tc-you">You</span>' : '') +
      '</span></div>' +
      '<span class="tc-rank-badge' + rankMedal + '">' + rank + '</span>' +
      '</div>' +
      '<div class="tc-fpts">' + fpts + '</div>' +
      '<div class="tc-fpts-label">Fantasy Points</div>' +
      '<div class="tc-players">' +
      (roster.length === 0 ? '<span style="color:var(--muted);font-size:13px;">No players drafted yet</span>' : '') +
      (expandedTeams.has(m) ? roster : roster.slice(0, 12)).map(p => {
        const pfpts = calcFPTS(p);
        return '<div class="tc-player-row">' +
          getSchoolLogoHTML(p.college, 22) +
          '<span class="tc-player-name">' + esc(p.name) + '</span>' +
          '<span class="pos-badge" style="font-size:10px;">' + p.position + '</span>' +
          (p._sc ? '<span class="sc-pick-badge">SC</span>' : '') +
          '<span class="tc-player-fpts">' + pfpts + '</span>' +
          '</div>';
      }).join('') +
      (roster.length > 12
        ? '<button class="tc-expand-btn" data-manager="' + esc(m) + '">' +
        (expandedTeams.has(m) ? '▲ Show less' : '▼ +' + (roster.length - 12) + ' more') +
        '</button>'
        : '') +
      '</div></div>';
  }).join('');
}

// ── STANDINGS ─────────────────────────────────────────────
function renderStandings() {
  const list = document.getElementById('standingsList');
  if (!list) return;

  // Gate: no tournament selected
  if (!state.selectedTournament) {
    list.innerHTML = getLockHtml('standings');
    const btn = list.querySelector('#plSelectTournBtn');
    if (btn) btn.addEventListener('click', openTournamentSelector);
    return;
  }

  const session = getSession();
  const currentUser = session ? session.name : null;
  if (state.managers.length === 0) { list.innerHTML = '<p style="color:var(--muted);padding:16px;">No managers yet.</p>'; return; }
  const ranked = state.managers.map(m => ({
    name: m,
    fpts: managerFPTS(m),
    cats: {
      pts: calcManagerCat(m, 'points'),
      reb: calcManagerCat(m, 'rebounds'),
      ast: calcManagerCat(m, 'assists'),
      stl: calcManagerCat(m, 'steals'),
      blk: calcManagerCat(m, 'blocks')
    }
  })).sort((a, b) => b.fpts - a.fpts);

  // Update column headers based on whether real stats are in
  const fptsHeader = document.querySelector('.sh-pts');
  if (fptsHeader) fptsHeader.textContent = hasRealStats() ? 'Actual' : 'Proj.';
  const projHeader = document.querySelector('.sh-proj');
  if (projHeader) projHeader.textContent = hasRealStats() ? 'Proj.' : 'Upside';

  const rankMedalClass = ['rank-gold', 'rank-silver', 'rank-bronze'];
  list.innerHTML = ranked.map((m, i) => {
    const rank = i + 1;
    const prevRankList = (state.prevRankings && state.prevRankings.length) ? state.prevRankings : simPrevRankings;
    const prevRank = prevRankList.indexOf(m.name) + 1;
    let delta = '', deltaCls = 'delta-same';
    if (prevRank > 0 && prevRank !== rank) {
      if (prevRank > rank) { delta = '▲' + (prevRank - rank); deltaCls = 'delta-up'; }
      else { delta = '▼' + (rank - prevRank); deltaCls = 'delta-down'; }
    } else if (prevRank > 0) { delta = '-'; }

    const rankBadge = i < 3
      ? '<span class="rank-medal ' + rankMedalClass[i] + '">' + rank + '</span>'
      : '<span class="rank-num">' + rank + '</span>';

    // When real stats exist: show projected baseline in the proj column
    // When no real stats: show calcProjectedFPTS upside
    let projBadge;
    if (hasRealStats()) {
      const projFpts = managerProjectedFPTS(m.name);
      projBadge = '<span class="sr-proj" title="Pre-game projection">' + projFpts + '</span>';
    } else {
      const { projected } = calcProjectedFPTS(m.name);
      projBadge = projected > 0
        ? '<span class="sr-proj">+' + projected + '</span>'
        : '<span class="sr-proj sr-proj-none">-</span>';
    }

    return '<div class="standings-row' + (m.name === currentUser ? ' current-user' : '') + '">' +
      '<span class="sr-rank">' + rankBadge + '</span>' +
      '<span class="sr-name">' + esc(m.name) + '</span>' +
      '<span class="sr-fpts">' + m.fpts + '</span>' +
      projBadge +
      '<span class="sr-cat">' + m.cats.pts + '</span>' +
      '<span class="sr-cat">' + m.cats.reb + '</span>' +
      '<span class="sr-cat">' + m.cats.ast + '</span>' +
      '<span class="sr-cat">' + m.cats.stl + '</span>' +
      '<span class="sr-cat">' + m.cats.blk + '</span>' +
      '<span class="sr-delta ' + deltaCls + '">' + delta + '</span>' +
      '</div>';
  }).join('');

  // Hide the Simulate tool once the live feed is producing real stats

  // Render projection breakdown panel below
  try { renderProjectionPanel(); } catch (e) { console.warn('renderProjectionPanel', e); }
}

function calcManagerCat(manager, cat) {
  let total = 0;
  Object.entries(state.drafted).forEach(([pid, d]) => {
    if (d.manager === manager) {
      const p = (state.players || []).find(x => x.id === pid);
      if (p) total += p.stats[cat] || 0;
    }
  });
  return Math.round(total * 10) / 10;
}
function undoLastPick() {
  if (!isCommissioner()) return;
  if (state.currentPickIndex <= 0) { toast('No picks to undo.', 'info'); return; }
  const order = buildDraftOrder();
  const lastOrder = order[state.currentPickIndex - 1];
  if (!lastOrder) return;
  // Find the player drafted at this slot
  const entry = Object.entries(state.drafted).find(([, d]) => d.label === lastOrder.label && d.manager === lastOrder.manager);
  if (!entry) { toast('Could not find last pick entry.', 'error'); return; }
  const pid = entry[0];
  const p = (state.players || []).find(x => x.id === pid);
  delete state.drafted[pid];
  state.currentPickIndex--;
  // Reset timer so the reinstated manager gets a full clock
  if (state.timerRunning) state.pickTimerStartedAt = Date.now();
  addActivity('↩ Undo: removed pick by ' + esc(lastOrder.manager) + (p ? ' (' + esc(p.name) + ')' : ''));
  saveState();
  render();
  toast('Last pick undone.', 'success');
}
// ── CHAT ──────────────────────────────────────────────────
function getChatMessages() {
  if (!state.leagueId) return [];
  try { return JSON.parse(localStorage.getItem('mmfantasy-chat-' + state.leagueId) || '[]'); }
  catch (e) { return []; }
}
function saveChatMessages(msgs) {
  if (!state.leagueId) return;
  localStorage.setItem('mmfantasy-chat-' + state.leagueId, JSON.stringify(msgs));
}
function getChatReadTime() {
  return parseInt(localStorage.getItem('mmfantasy-chat-read-' + (state.leagueId || '')) || '0');
}
function markChatRead() {
  localStorage.setItem('mmfantasy-chat-read-' + (state.leagueId || ''), Date.now().toString());
  updateChatBadge();
}
function updateChatBadge() {
  const badge = document.querySelector('.chat-badge');
  if (!badge) return;
  const session = getSession();
  const me = session ? session.name : '';
  const lastRead = getChatReadTime();
  const unread = getChatMessages().filter(m => m.sender !== me && m.timestamp > lastRead).length;
  badge.textContent = unread > 9 ? '9+' : unread || '';
  badge.style.display = unread > 0 ? 'flex' : 'none';
}
function renderChat() {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const messages = getChatMessages();
  const session = getSession();
  const me = session ? session.name : '';

  if (!messages.length) {
    container.innerHTML = '<div class="chat-empty">No messages yet. Say something to the league.</div>';
    return;
  }

  container.innerHTML = messages.map(msg => {
    const isMe = msg.sender === me;
    const d = new Date(msg.timestamp);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return '<div class="chat-msg ' + (isMe ? 'chat-msg-mine' : 'chat-msg-theirs') + '">' +
      (!isMe ? '<div class="chat-sender">' + esc(msg.sender) + '</div>' : '') +
      '<div class="chat-bubble ' + (isMe ? 'mine' : 'theirs') + '">' + esc(msg.text) + '</div>' +
      '<div class="chat-time">' + date + ' · ' + time + '</div>' +
      '</div>';
  }).join('');

  // Always scroll to latest
  container.scrollTop = container.scrollHeight;
}
function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = (input ? input.value : '').trim();
  if (!text || !state.leagueId) return;
  const session = getSession();
  const msgs = getChatMessages();
  msgs.push({ id: Date.now().toString(), sender: session ? session.name : 'Anonymous', text, timestamp: Date.now() });
  saveChatMessages(msgs);
  if (input) input.value = '';
  renderChat();
  try { renderRpChat(); } catch (e) { }
  updateChatBadge();
}

// ── BRACKET ───────────────────────────────────────────────
function getBracketState() {
  if (!state.leagueId) return null;
  try {
    const raw = localStorage.getItem('mmfantasy-bracket-' + state.leagueId);
    if (raw) return JSON.parse(raw);
    const numRounds = (window.MM_BRACKET_DATA || {}).numRounds || 4;
    const init = { regions: {}, finalFour: [null, null], championship: null };
    (window.MM_BRACKET_DATA || { regions: [] }).regions.forEach(reg => {
      init.regions[reg.name] = Array(numRounds).fill(null).map(() => []);
    });
    return init;
  } catch (e) { return null; }
}

function saveBracketState(data) {
  if (!state.leagueId) return;
  localStorage.setItem('mmfantasy-bracket-' + state.leagueId, JSON.stringify(data));
}

// ── PLAYER POOL SELECTION ──────────────────────────────────
// players.js holds a SEPARATE entry per player per event, tagged by `region`
// ('East'/'South'/'Midwest'/'West' for the NCAA field, 'Maui', 'Atlantis'...).
//
// Filtering on college alone is not enough: Clemson is in both Maui and the
// NCAA field, so a college-only filter returns PJ Hall twice and two managers
// can draft the same player. Always constrain by region as well.
const NCAA_REGIONS = ['East', 'South', 'Midwest', 'West'];

// ── Real vs projected ─────────────────────────────────────
//  Used to be "has the Simulate button been pressed". Now it means
//  what it says: has the live feed actually recorded a game yet. Until
//  the first box score lands, every number on the standings page is a
//  projection and the UI should say so.
function hasRealStats() {
  return (state.players || []).some(function (p) {
    return (p._gamesPlayed > 0) || p._liveUpdated;
  });
}

/**
 * What this manager's roster is worth per game, from SEASON averages.
 * Deliberately not derived from p.stats: once the feed is running those
 * are cumulative tournament totals, and summing them here would just
 * restate the actual score under a "projected" heading.
 */
function managerProjectedFPTS(managerName) {
  const w = state.scoring.weights;
  const active = state.scoring.active || [];
  let total = 0;

  Object.keys(state.drafted || {}).forEach(function (pid) {
    if (state.drafted[pid].manager !== managerName) return;
    const p = (state.players || []).find(function (x) { return x.id === pid; });
    if (!p) return;
    const rate = p.seasonAvg || p.stats || {};
    active.forEach(function (cat) {
      total += (rate[cat] || 0) * (w[cat] || 1);
    });
  });

  return Math.round(total * 10) / 10;
}

// Every tournament in every section, flattened. Used to deactivate
// stale entries and to validate pools.
function ALL_TOURNAMENTS() {
  const out = [];
  Object.keys(TOURNAMENTS || {}).forEach(function (section) {
    (TOURNAMENTS[section] || []).forEach(function (t) { if (t && t.id) out.push(t); });
  });
  return out;
}

function playersForTournament(tournament) {
  const all = (window.MM_PLAYERS || []);
  if (!tournament) return dedupePlayers(all.slice());

  // ── The pool is ALWAYS driven by the team list ───────────
  //  This used to special-case ncaa64 and filter on region names
  //  'East' / 'South' / 'Midwest' / 'West'. Those regions no longer
  //  exist in data/players.js — it is now tagged Maui / Atlantis /
  //  Showcase — so the NCAA tournament silently returned an EMPTY
  //  pool. A team list is the honest source either way: if the field
  //  has not been announced there are no teams, and an empty pool is
  //  the correct answer rather than an accident.
  const teamNames = (tournament.seededTeams && tournament.seededTeams.length)
    ? tournament.seededTeams.map(function (t) { return t.name; })
    : (tournament.teams || []);
  if (!teamNames.length) return [];

  const region = tournament.playerRegion || null;

  let pool = all.filter(function (p) {
    if (teamNames.indexOf(p.college) === -1) return false;
    if (region && p.region !== region) return false;
    return true;
  });

  // If an event has no region-tagged entries yet, fall back to college-only
  // rather than handing back an empty draft pool.
  if (pool.length === 0 && region) {
    pool = all.filter(function (p) { return teamNames.indexOf(p.college) !== -1; });
  }

  return dedupePlayers(pool);
}

// Safety net: one entry per name+college, whatever the data says.
function dedupePlayers(list) {
  const seen = {};
  const out = [];
  for (const p of list) {
    const key = (p.name || '').toLowerCase().trim() + '|' + (p.college || '').toLowerCase().trim();
    if (seen[key]) continue;
    seen[key] = true;
    out.push(p);
  }
  return out;
}

// ── TOURNAMENT DATA ────────────────────────────────────────
// bracketFormat: 'single8' | 'single16' | 'ncaa64'
// seededTeams: [{seed, name}] - source of truth for bracket generation
// canSelect: false = teams not yet announced (show Teams TBD)
// roundNames: display labels for each round in single-bracket formats
const TOURNAMENTS = {
  inSeason: [
    {
      id: 'maui-2026',
      name: 'Maui Invitational',
      subtitle: 'Southwest Maui Invitational',
      location: 'Lahaina Civic Center, Maui, HI',
      dates: 'Nov 23–25, 2026',
      startMs: new Date('2026-11-23').getTime(),
      bracketFormat: 'single8',
      roundNames: ['Quarterfinals', 'Semifinals', 'Championship'],
      canSelect: true,
      // Must match the `region` field on this event's entries in players.js.
      // Without it, teams that also appear in the NCAA field (e.g. Clemson)
      // would pull BOTH roster entries into the pool - the same player twice.
      playerRegion: 'Maui',
      teams: ['Arizona', 'BYU', 'Clemson', 'Colorado State', 'Ole Miss', 'Providence', 'VCU', 'Washington'],
      seededTeams: [
        { seed: 1, name: 'Arizona' },
        { seed: 2, name: 'BYU' },
        { seed: 3, name: 'Clemson' },
        { seed: 4, name: 'Colorado State' },
        { seed: 5, name: 'Ole Miss' },
        { seed: 6, name: 'Providence' },
        { seed: 7, name: 'VCU' },
        { seed: 8, name: 'Washington' }
      ]
    },
    {
      id: 'b4a-2026',
      name: 'Battle 4 Atlantis',
      subtitle: '15th Anniversary Edition',
      location: 'Imperial Arena, Bahamas',
      dates: 'Nov 25–27, 2026',
      startMs: new Date('2026-11-25').getTime(),
      bracketFormat: 'single8',
      roundNames: ['Quarterfinals', 'Semifinals', 'Championship'],
      canSelect: true,
      playerRegion: 'Atlantis',
      teams: ['Penn State', 'Marquette', 'Memphis', 'Mississippi State', 'Texas A&M', 'Virginia', 'Wake Forest', 'Xavier'],
      seededTeams: [
        { seed: 1, name: 'Marquette' },
        { seed: 2, name: 'Penn State' },
        { seed: 3, name: 'Texas A&M' },
        { seed: 4, name: 'Memphis' },
        { seed: 5, name: 'Mississippi State' },
        { seed: 6, name: 'Virginia' },
        { seed: 7, name: 'Wake Forest' },
        { seed: 8, name: 'Xavier' }
      ]
    },
    {
      id: 'etsc-2026',
      name: 'ESPN Thanksgiving Showcase',
      subtitle: 'ESPN Wide World of Sports',
      location: 'Kissimmee, FL',
      dates: 'Nov 23–25, 2026',
      startMs: new Date('2026-11-23').getTime(),
      bracketFormat: 'single8',
      roundNames: ['Quarterfinals', 'Semifinals', 'Championship'],
      canSelect: true,
      playerRegion: 'Showcase',
      teams: ['Akron', 'Wright State', 'App State', 'Belmont'],
      seededTeams: []
    },
    {
      id: 'jimmyv-2026',
      name: 'Jimmy V Classic',
      subtitle: 'Presented by Modelo · 32nd Year',
      location: 'Madison Square Garden, New York',
      dates: 'Dec 8, 2026',
      startMs: new Date('2026-12-08').getTime(),
      bracketFormat: 'single8',
      roundNames: ['Quarterfinals', 'Semifinals', 'Championship'],
      canSelect: false, comingSoon: true,
      teams: [], seededTeams: []
    },
    {
      id: 'emerald-2026',
      name: 'Emerald Coast Classic',
      subtitle: '',
      location: 'Niceville, FL',
      dates: 'Nov 27–28, 2026',
      startMs: new Date('2026-11-27').getTime(),
      bracketFormat: 'single8',
      roundNames: ['Quarterfinals', 'Semifinals', 'Championship'],
      canSelect: false, comingSoon: true,
      teams: [], seededTeams: []
    },
    {
      id: 'lvclassic-2026',
      name: 'Las Vegas Classic',
      subtitle: 'Resorts World Las Vegas',
      location: 'Las Vegas, NV',
      dates: 'Nov 27–28, 2026',
      startMs: new Date('2026-11-27').getTime(),
      bracketFormat: 'single8',
      roundNames: ['Quarterfinals', 'Semifinals', 'Championship'],
      canSelect: false, comingSoon: true,
      teams: [], seededTeams: []
    }
  ],
  conference: [
    { id: 'big12-2027', name: 'Big 12 Tournament', subtitle: '16-team field', location: 'T-Mobile Center, Kansas City, MO', dates: 'Mar 9–14, 2027', startMs: new Date('2027-03-09').getTime(), bracketFormat: 'single16', roundNames: ['Round of 16', 'Quarterfinals', 'Semifinals', 'Championship'], canSelect: false, comingSoon: true, teams: [], seededTeams: [] },
    { id: 'acc-2027', name: 'ACC Tournament', subtitle: '16-team field', location: 'Gainbridge Fieldhouse, Indianapolis, IN', dates: 'Mar 10–14, 2027', startMs: new Date('2027-03-10').getTime(), bracketFormat: 'single16', roundNames: ['Round of 16', 'Quarterfinals', 'Semifinals', 'Championship'], canSelect: false, comingSoon: true, teams: [], seededTeams: [] },
    { id: 'big10-2027', name: 'Big Ten Tournament', subtitle: '18-team field', location: 'Gainbridge Fieldhouse, Indianapolis, IN', dates: 'Mar 10–14, 2027', startMs: new Date('2027-03-10').getTime(), bracketFormat: 'single16', roundNames: ['Round of 16', 'Quarterfinals', 'Semifinals', 'Championship'], canSelect: false, comingSoon: true, teams: [], seededTeams: [] },
    { id: 'sec-2027', name: 'SEC Tournament', subtitle: '16-team field', location: 'Bridgestone Arena, Nashville, TN', dates: 'Mar 10–14, 2027', startMs: new Date('2027-03-10').getTime(), bracketFormat: 'single16', roundNames: ['Round of 16', 'Quarterfinals', 'Semifinals', 'Championship'], canSelect: false, comingSoon: true, teams: [], seededTeams: [] },
    { id: 'bigeast-2027', name: 'Big East Tournament', subtitle: '11-team field', location: 'Madison Square Garden, New York', dates: 'Mar 10–13, 2027', startMs: new Date('2027-03-10').getTime(), bracketFormat: 'single16', roundNames: ['Round of 16', 'Quarterfinals', 'Semifinals', 'Championship'], canSelect: false, comingSoon: true, teams: [], seededTeams: [] },
    { id: 'american-2027', name: 'American Tournament', subtitle: '', location: 'Dickies Arena, Fort Worth, TX', dates: 'Mar 2027', startMs: new Date('2027-03-06').getTime(), bracketFormat: 'single16', roundNames: ['Round of 16', 'Quarterfinals', 'Semifinals', 'Championship'], canSelect: false, comingSoon: true, teams: [], seededTeams: [] },
    { id: 'a10-2027', name: 'Atlantic 10 Tournament', subtitle: '', location: 'Barclays Center, Brooklyn, NY', dates: 'Mar 2027', startMs: new Date('2027-03-06').getTime(), bracketFormat: 'single16', roundNames: ['Round of 16', 'Quarterfinals', 'Semifinals', 'Championship'], canSelect: false, comingSoon: true, teams: [], seededTeams: [] },
    { id: 'mwc-2027', name: 'Mountain West Tournament', subtitle: '', location: 'Thomas & Mack Center, Las Vegas', dates: 'Mar 2027', startMs: new Date('2027-03-06').getTime(), bracketFormat: 'single16', roundNames: ['Round of 16', 'Quarterfinals', 'Semifinals', 'Championship'], canSelect: false, comingSoon: true, teams: [], seededTeams: [] }
  ],
  postseason: [
    {
      id: 'ncaa-2027',
      // canSelect stays false until the field is announced on Selection
      // Sunday (Mar 2027). It was true with teams:[] — selecting it gave
      // a commissioner an empty draft board and no explanation.
      name: 'NCAA Tournament',
      subtitle: '64-team field · 4 regions',
      location: 'Championship: Ford Field, Detroit, MI',
      dates: 'Mar 16 – Apr 5, 2027',
      startMs: new Date('2027-03-16').getTime(),
      bracketFormat: 'ncaa64',
      roundNames: ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8'],
      canSelect: false,
      comingSoon: true,
      highlight: true,
      note: 'Selection Sunday: Mar 14',
      teams: [], seededTeams: []
    },
    {
      id: 'nit-2027',
      name: 'NIT',
      subtitle: '32-team field',
      location: 'Various sites (Final: MSG, New York)',
      dates: 'Mar 2027',
      startMs: new Date('2027-03-16').getTime(),
      bracketFormat: 'single16',
      roundNames: ['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Championship'],
      canSelect: false, comingSoon: true,
      teams: [], seededTeams: []
    },
    {
      id: 'crown-2027',
      name: 'College Basketball Crown',
      subtitle: 'Third-tier postseason',
      location: 'Various sites',
      dates: 'Mar 2027',
      startMs: new Date('2027-03-16').getTime(),
      bracketFormat: 'single16',
      roundNames: ['Round of 16', 'Quarterfinals', 'Semifinals', 'Championship'],
      canSelect: false, comingSoon: true,
      teams: [], seededTeams: []
    }
  ]
};

// ── TOURNAMENT SELECTION ENGINE ────────────────────────────

function findTournamentById(id) {
  const all = [
    ...TOURNAMENTS.inSeason,
    ...TOURNAMENTS.conference,
    ...TOURNAMENTS.postseason
  ];
  return all.find(t => t.id === id) || null;
}

// Builds window.MM_BRACKET_DATA from a tournament object.
// For ncaa64 the static bracket.js file is used as-is.
// For single8/single16 we generate dynamically from seededTeams.
function generateBracketData(tournament) {
  if (!tournament) return;

  if (tournament.bracketFormat === 'ncaa64') {
    // bracket.js already loaded as window.MM_BRACKET_DATA - keep it,
    // but tag it with format metadata for the renderer.
    if (window.MM_BRACKET_DATA) {
      window.MM_BRACKET_DATA.format = 'ncaa64';
      window.MM_BRACKET_DATA.numRounds = 4;
    }
    return;
  }

  const sorted = (tournament.seededTeams || []).slice().sort((a, b) => a.seed - b.seed);
  const n = sorted.length;
  const numRounds = (tournament.roundNames || []).length;

  let matchups = [];
  if (n === 8) {
    // Standard 8-seed bracket: 1v8, 4v5, 2v7, 3v6
    matchups = [
      { top: sorted[0], bot: sorted[7] },
      { top: sorted[3], bot: sorted[4] },
      { top: sorted[1], bot: sorted[6] },
      { top: sorted[2], bot: sorted[5] }
    ];
  } else if (n >= 16) {
    // Standard 16-seed bracket
    matchups = [
      { top: sorted[0], bot: sorted[15] },
      { top: sorted[7], bot: sorted[8] },
      { top: sorted[4], bot: sorted[11] },
      { top: sorted[3], bot: sorted[12] },
      { top: sorted[5], bot: sorted[10] },
      { top: sorted[2], bot: sorted[13] },
      { top: sorted[6], bot: sorted[9] },
      { top: sorted[1], bot: sorted[14] }
    ];
  }

  window.MM_BRACKET_DATA = {
    format: tournament.bracketFormat,
    numRounds: numRounds,
    roundNames: tournament.roundNames || [],
    regions: [{ name: tournament.name, matchups: matchups }],
    finalFour: null,
    championship: null
  };
}

// Commissioner calls this to pick a tournament.
// Clears existing bracket state, rebuilds MM_BRACKET_DATA, saves + re-renders.
// ══════════════════════════════════════════════════════════
// 🏀 LIVE GAME SCORES + AUTOMATIC BRACKET ADVANCEMENT
//
//  The Cloud Function writes one doc per game to
//    tournamentStats/{tournId}/games/{eventId}
//  carrying score, period, clock, state (pre|in|post) and
//  winnerSchool. winnerSchool stays null until ESPN itself marks the
//  game final, so a 20-point lead at halftime cannot eliminate
//  somebody's roster early.
//
//  Advancement is automatic but NOT irreversible: a commissioner can
//  still click a different winner, and a manual pick is remembered so
//  the next poll does not silently overwrite it. The feed is treated
//  as a very reliable default, not as the final word.
// ══════════════════════════════════════════════════════════
let _gamesUnsub = null;
let _liveGames = {};          // eventId -> game doc

// Delegated click handler for commissioner bracket overrides. Bound
// once on the page rather than per team row, so it survives every
// re-render of the bracket.
function wireBracketOverrideClicks() {
  const page = document.getElementById('bracketPage');
  if (!page || page.dataset.ovWired === '1') return;
  page.dataset.ovWired = '1';

  page.addEventListener('click', function (e) {
    const row = e.target.closest ? e.target.closest('.br-team[data-team]') : null;
    if (!row) return;
    const region = row.getAttribute('data-region');
    const rnd = parseInt(row.getAttribute('data-rnd'), 10);
    const match = parseInt(row.getAttribute('data-match'), 10);
    const team = row.getAttribute('data-team');
    if (!region || isNaN(rnd) || isNaN(match) || !team) return;
    setBracketOverride(region, rnd, match, team);
  });
}

function listenToGameScores() {
  if (_gamesUnsub) { _gamesUnsub(); _gamesUnsub = null; }
  _liveGames = {};
  if (!window._db || !state.selectedTournament) return;

  const tournId = state.selectedTournament.id;

  _gamesUnsub = window._db
    .collection('tournamentStats').doc(tournId)
    .collection('games')
    .onSnapshot(function (snap) {
      snap.docChanges().forEach(function (chg) {
        if (chg.type === 'removed') { delete _liveGames[chg.doc.id]; return; }
        _liveGames[chg.doc.id] = chg.doc.data();
      });
      try { renderLiveScores(); } catch (e) { console.warn('renderLiveScores', e); }
      try { applyAutoAdvance(); } catch (e) { console.warn('applyAutoAdvance', e); }
      // The My Team card carries live scores and alive/out state, both
      // of which this snapshot just changed. applyAutoAdvance runs
      // first so elimination is current before the card reads it.
      try { renderMyTeamCard(); } catch (e) { console.warn('renderMyTeamCard', e); }
    }, function (e) { console.warn('[Games] snapshot error:', e.message); });
}

function liveGamesList() {
  return Object.keys(_liveGames).map(function (k) { return _liveGames[k]; })
    .sort(function (a, b) {
      // In progress first, then upcoming, then finals.
      const rank = function (g) { return g.state === 'in' ? 0 : (g.state === 'pre' ? 1 : 2); };
      return rank(a) - rank(b) || String(a.startsAt || '').localeCompare(String(b.startsAt || ''));
    });
}

// Banner above the bracket: tells the commissioner they can edit, and
// tells everyone when results have been set by hand rather than by the
// feed. Silence there would let a manual result pass as a real one.
function renderBracketOverrideBar() {
  const host = document.getElementById('bracketOverrideBar');
  if (!host) return;

  let commish = false;
  try { commish = isCommissioner(); } catch (e) { }
  const n = Object.keys(state.bracketOverrides || {}).length;

  if (!commish && !n) { host.innerHTML = ''; host.style.display = 'none'; return; }

  host.style.display = '';

  if (n) {
    host.className = 'bracket-override-bar';
    host.innerHTML =
      '<span><b>' + n + ' result' + (n === 1 ? '' : 's') + ' set manually.</b> ' +
      'The live feed will not overwrite ' + (n === 1 ? 'it' : 'them') + '.</span>' +
      (commish ? '<button class="bov-clear" id="bovClearBtn">Revert to live data</button>' : '');
  } else {
    host.className = 'bracket-edit-hint';
    host.innerHTML = 'Winners update automatically from live scores. As commissioner you can tap a team to correct a result, and tap the winner again to undo.';
  }

  const btn = document.getElementById('bovClearBtn');
  if (btn) btn.addEventListener('click', clearAllBracketOverrides);
}

function renderLiveScores() {
  try { renderBracketOverrideBar(); } catch (e) { }
  const host = document.getElementById('liveScoreStrip');
  if (!host) return;

  const games = liveGamesList();
  if (!games.length) { host.innerHTML = ''; host.style.display = 'none'; return; }

  host.style.display = '';
  host.innerHTML = games.map(function (g) {
    const live = g.state === 'in';
    const done = g.completed;
    const status = live
      ? (g.clock ? esc(g.clock) + ' · ' + ordinalHalf(g.period) : 'LIVE')
      : (done ? 'Final' : esc(g.statusDetail || 'Upcoming'));

    const row = function (side) {
      const t = g[side] || {};
      const won = done && g.winnerSchool && g.winnerSchool === t.school;
      const lost = done && g.winnerSchool && g.winnerSchool !== t.school;
      return '<div class="ls-team' + (won ? ' ls-team--won' : '') + (lost ? ' ls-team--lost' : '') + '">' +
        '<span class="ls-name">' + esc(t.school || 'TBD') + '</span>' +
        '<span class="ls-score">' + (g.state === 'pre' ? '' : (t.score != null ? t.score : 0)) + '</span>' +
        '</div>';
    };

    return '<div class="ls-card' + (live ? ' ls-card--live' : '') + '">' +
      '<div class="ls-status">' + (live ? '<span class="ls-dot"></span>' : '') + status + '</div>' +
      row('away') + row('home') +
      '</div>';
  }).join('');
}

function ordinalHalf(period) {
  if (!period) return '';
  if (period === 1) return '1st';
  if (period === 2) return '2nd';
  return 'OT' + (period - 2 > 1 ? (period - 2) : '');
}

// ── Bracket recompute: live feed + commissioner overrides ──
//  The bracket is rebuilt from scratch on every change rather than
//  mutated in place. Two inputs, in priority order:
//
//    1. state.bracketOverrides  — commissioner's manual corrections
//    2. the ESPN game feed      — whatever ESPN called final
//
//  Overrides live in `state`, NOT in the local bracket cache, because
//  bracket state is localStorage-only and per-device. An override
//  stored locally would exist on the commissioner's phone and nowhere
//  else, which is worse than having no override at all. Putting it in
//  state means it rides the normal league sync to everyone.
//
//  Rebuilding beats patching: an override in round 1 changes who is
//  even playing in round 2, so the whole downstream has to be redrawn.
function bracketSlotKey(region, rnd, match) {
  return region + '|' + rnd + '|' + match;
}

function applyAutoAdvance() {
  if (!state.selectedTournament || !state.leagueId) return;
  const data = window.MM_BRACKET_DATA;
  if (!data || !data.regions || !data.regions.length) return;

  const bs = getBracketState();
  if (!bs) return;

  const overrides = state.bracketOverrides || {};
  const finals = liveGamesList().filter(function (g) { return g.completed && g.winnerSchool; });

  const newlyFinal = [];

  data.regions.forEach(function (reg) {
    const before = (bs.regions[reg.name] || []).map(function (r) { return (r || []).slice(); });
    const rounds = [];

    let pairs = (reg.matchups || []).map(function (mu) {
      return [mu.top && mu.top.name, mu.bot && mu.bot.name];
    });

    for (let rnd = 0; rnd < (data.numRounds || 0); rnd++) {
      const winners = [];

      pairs.forEach(function (pair, m) {
        const a = pair[0], b = pair[1];
        const key = bracketSlotKey(reg.name, rnd, m);

        // 1. Commissioner override wins, but only if it names a team
        //    actually in this matchup. A stale override left over from
        //    a re-seed must not put a phantom team in the bracket.
        const ov = overrides[key];
        if (ov && (ov === a || ov === b)) { winners[m] = ov; return; }

        if (!a || !b) { winners[m] = null; return; }

        // 2. Otherwise the feed, and only once ESPN calls it final.
        const game = finals.find(function (g) {
          const s = [g.home && g.home.school, g.away && g.away.school];
          return s.indexOf(a) !== -1 && s.indexOf(b) !== -1;
        });
        if (game) {
          winners[m] = game.winnerSchool;
          const prev = (before[rnd] || [])[m];
          if (prev !== game.winnerSchool) newlyFinal.push({ game: game, winner: game.winnerSchool });
          return;
        }

        winners[m] = null;
      });

      rounds[rnd] = winners;

      const next = [];
      for (let i = 0; i < winners.length; i += 2) next.push([winners[i], winners[i + 1]]);
      pairs = next;
    }

    bs.regions[reg.name] = rounds;
  });

  saveBracketState(bs);

  if (newlyFinal.length) {
    newlyFinal.forEach(function (n) {
      addActivity(esc(n.winner) + ' advances (' +
        esc(n.game.away.school) + ' ' + n.game.away.score + ', ' +
        esc(n.game.home.school) + ' ' + n.game.home.score + ')');
    });
    toast(newlyFinal.length + ' game' + (newlyFinal.length === 1 ? '' : 's') + ' final. Bracket updated.', 'success');
  }

  try { renderBracket(); } catch (e) { }
  try { renderStandings(); } catch (e) { }
}

// ── Commissioner override ─────────────────────────────────
//  Clicking a team sets it as the winner of that matchup. Clicking the
//  team that is ALREADY winning by override clears it and hands the
//  slot back to the live feed.
function setBracketOverride(region, rnd, match, teamName) {
  if (!isCommissioner()) { toast('Only the commissioner can change the bracket.', 'error'); return; }
  if (!teamName) return;

  state.bracketOverrides = state.bracketOverrides || {};
  const key = bracketSlotKey(region, rnd, match);

  if (state.bracketOverrides[key] === teamName) {
    delete state.bracketOverrides[key];
    addActivity('Commissioner reverted ' + esc(teamName) + ' to the live result.');
    toast('Reverted to live data.', 'info');
  } else {
    state.bracketOverrides[key] = teamName;
    addActivity('Commissioner set ' + esc(teamName) + ' as the winner (manual override).');
    toast(esc(teamName) + ' advances. Live data will not overwrite this.', 'success');
  }

  saveState();               // syncs the override to every device
  applyAutoAdvance();        // rebuild downstream rounds
}

function isOverriddenSlot(region, rnd, match) {
  return !!(state.bracketOverrides || {})[bracketSlotKey(region, rnd, match)];
}

function clearAllBracketOverrides() {
  if (!isCommissioner()) return;
  const n = Object.keys(state.bracketOverrides || {}).length;
  if (!n) { toast('No manual overrides to clear.', 'info'); return; }
  if (!confirm('Clear all ' + n + ' manual bracket override' + (n === 1 ? '' : 's') + ' and return the bracket to live data?')) return;
  state.bracketOverrides = {};
  addActivity('Commissioner cleared all bracket overrides.');
  saveState();
  applyAutoAdvance();
  toast('Bracket returned to live data.', 'success');
}

// ── LIVE STATS LISTENER (ESPN → Firestore → app) ──────────────
let _liveStatsUnsub = null;

function listenToLiveStats() {
  // Tear down any existing listener
  if (_liveStatsUnsub) { _liveStatsUnsub(); _liveStatsUnsub = null; }
  if (!window._db || !state.selectedTournament) return;

  // Must match TOURNAMENT_ID in functions/index.js
  const tournId = state.selectedTournament.id || 'ncaa-2026';

  console.log('[LiveStats] Listening to tournamentStats/' + tournId);

  _liveStatsUnsub = window._db
    .collection('tournamentStats')
    .doc(tournId)
    .collection('players')
    .onSnapshot(snapshot => {
      // Any player doc means the live feed is producing real stats for this
      // tournament. Once that's true the Simulate tool must disappear so it
      // can't overwrite real numbers.

      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') return;
        const data = change.doc.data();

        // ── Match by ESPN id, not by name ────────────────────
        //  Name matching was a silent failure waiting to happen:
        //  "Augusto Cassiá", "Corey Floyd Jr.", "Ja'Borri McGhee" and
        //  every hyphenated or accented name is one formatting change
        //  away from never matching, and the symptom is simply a
        //  player who scores zero all tournament. Both sides now carry
        //  the ESPN athlete id, so this is an exact join. Name is kept
        //  only as a fallback for any doc written before this change.
        let player = null;
        if (data.espnId) {
          player = state.players.find(p => p.espnId === String(data.espnId));
        }
        if (!player && data.name) {
          const n = data.name.toLowerCase().trim();
          player = state.players.find(p => p.name.toLowerCase().trim() === n);
        }
        if (!player) return;

        // Finished games are stored per game id so a re-run of the sync
        // cannot double count. Sum them, then add the in-progress game.
        const games = data.games || {};
        const live = data.live || {};
        const sum = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
        Object.keys(games).forEach(function (gid) {
          const g = games[gid] || {};
          sum.pts += g.pts || 0; sum.reb += g.reb || 0; sum.ast += g.ast || 0;
          sum.stl += g.stl || 0; sum.blk += g.blk || 0;
        });

        player.stats.points   = sum.pts + (live.pts || 0);
        player.stats.rebounds = sum.reb + (live.reb || 0);
        player.stats.assists  = sum.ast + (live.ast || 0);
        player.stats.steals   = sum.stl + (live.stl || 0);
        player.stats.blocks   = sum.blk + (live.blk || 0);
        player._gamesPlayed   = Object.keys(games).length;
        player._liveUpdated   = !!(live.gameId); // flag for UI indicators
      });

      // Refresh standings and projections with new data
      render();
    }, err => {
      console.warn('[LiveStats] Firestore listener error:', err.message);
    });
}

function setSelectedTournament(tournament) {
  const previous = state.selectedTournament;
  const changing = previous && previous.id !== tournament.id;
  const picksMade = Object.keys(state.drafted || {}).length;

  // ── Switching tournaments voids the draft ────────────────
  //  Changing events swaps the entire player pool. Picks made in the
  //  old one point at players who are not in the new pool: they vanish
  //  from the draft board but stay on rosters, invisible and unable to
  //  ever score. Better to reset the draft loudly than to leave a
  //  league quietly broken.
  if (changing && picksMade > 0) {
    const ok = confirm(
      'Switching from ' + previous.name + ' to ' + tournament.name + ' replaces the entire player pool.\n\n' +
      'All ' + picksMade + ' pick' + (picksMade === 1 ? '' : 's') + ' will be cleared and the draft reset.\n\n' +
      'Final standings and rosters are saved to Season History first, so ' +
      previous.name + ' still counts toward the season.\n\n' +
      'Switch anyway?'
    );
    if (!ok) return;
  }

  // ── Archive BEFORE anything is cleared ───────────────────
  //  The reset below is what makes switching safe: picks pointing at
  //  players outside the new pool would be invisible and unscoreable.
  //  But it also means the outgoing tournament leaves no trace, which
  //  is exactly what a season-long record cannot afford. Freeze the
  //  result first, then wipe. Order matters: archiveTournamentResult
  //  reads state.drafted and state.players.
  if (changing && picksMade > 0) {
    try { archiveTournamentResult(previous); }
    catch (e) { console.warn('[season] archive failed:', e && e.message); }
  }

  state.selectedTournament = tournament;

  if (changing && picksMade > 0) {
    state.drafted = {};
    state.currentPickIndex = 0;
    state.timerRunning = false;
    state.pickTimerStartedAt = null;
    try { clearInterval(timerInterval); } catch (e) { }
    addActivity('Tournament changed to ' + tournament.name + '. Draft reset (' + picksMade + ' pick' + (picksMade === 1 ? '' : 's') + ' cleared).');
  }

  if (changing) {
    // Overrides are keyed "Region|round|match". Region names come from
    // the tournament, so a correction made in Maui would land on an
    // unrelated Atlantis matchup after a switch. Queues self-heal
    // (getQueue filters against the live pool) but these do not.
    state.bracketOverrides = {};
    state.queues = {};
  }

  // Wipe old bracket picks: new tournament = fresh bracket
  if (state.leagueId) {
    localStorage.removeItem('mmfantasy-bracket-' + state.leagueId);
  }

  generateBracketData(tournament);

  // Filter player pool to this tournament's teams AND region (see
  // playersForTournament - college alone double-counts shared teams)
  //  Cloned, not referenced. playersForTournament hands back the very
  //  objects in window.MM_PLAYERS, so live stat writes would mutate
  //  data/players.js in memory and leak into every later league in
  //  this browser session. poolForCurrentTournament already guarded
  //  this; direct callers must too.
  state.players = poolForCurrentTournament();

  if (!state.players.length) {
    toast('No player pool for ' + tournament.name + ' yet. The field has not been announced.', 'error');
  }

  saveState();
  addActivity('Tournament selected: ' + tournament.name);

  // ── Tell the Cloud Function what to poll ─────────────────
  //  This used to only ever set active:true with merge, so every
  //  tournament a league had ever selected stayed active forever and
  //  the function kept polling all of them. Deactivate the others.
  if (window._db) {
    const payload = {};
    ALL_TOURNAMENTS().forEach(function (t) {
      if (t.id !== tournament.id) payload[t.id] = { active: false };
    });
    if (tournament.teams && tournament.teams.length > 0) {
      payload[tournament.id] = {
        name: tournament.name,
        teams: tournament.teams,
        active: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
    }
    window._db.collection('meta').doc('activeTournaments')
      .set(payload, { merge: true })
      .catch(function (e) {
        console.warn('[Meta] Could not write active tournament:', e.message);
      });
  }

  updateDraftTabLock();

  // Close selector if open
  const modal = document.getElementById('tournamentSelectModal');
  if (modal) modal.style.display = 'none';

  // Refresh UI
  updateBracketTabs();
  renderTournamentBanner();
  try { renderHome(); } catch (e) { }
  try { renderBracket(); } catch (e) { }
  try { renderDraft(); } catch (e) { }
  try { renderStandings(); } catch (e) { }

  // Start live stat sync for this tournament
  listenToLiveStats();
  listenToGameScores();
}

// Rebuild bracket region tabs to match the selected tournament format.
function updateBracketTabs() {
  const container = document.querySelector('.bracket-tabs');
  if (!container) return;

  const fmt = state.selectedTournament ? state.selectedTournament.bracketFormat : 'ncaa64';

  if (fmt === 'ncaa64') {
    container.innerHTML =
      '<button class="bracket-tab active" data-region="East">East</button>' +
      '<button class="bracket-tab" data-region="South">South</button>' +
      '<button class="bracket-tab" data-region="Midwest">Midwest</button>' +
      '<button class="bracket-tab" data-region="West">West</button>' +
      '<button class="bracket-tab bracket-tab-ff" data-region="FinalFour">Final Four</button>';
    container.style.display = '';
  } else {
    // Single bracket: no region tabs needed
    container.innerHTML = '';
    container.style.display = 'none';
  }

  // Re-wire tab click events
  container.querySelectorAll('.bracket-tab').forEach(tab => {
    tab.addEventListener('click', function () {
      container.querySelectorAll('.bracket-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderBracket();
    });
  });
}

// Lock screen shown on Draft / Bracket / Standings when no tournament is selected.
function getLockHtml(page) {
  const isCom = isCommissioner();
  const lockSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  const trophySvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>';
  if (isCom) {
    return '<div class="page-lock">' +
      '<div class="pl-icon">' + trophySvg + '</div>' +
      '<div class="pl-title">No Tournament Selected</div>' +
      '<div class="pl-sub">Choose a tournament before accessing ' + page + '.<br>Once set, your bracket and draft will be configured automatically.</div>' +
      '<button class="btn-primary pl-btn" id="plSelectTournBtn">Choose Tournament</button>' +
      '</div>';
  }
  return '<div class="page-lock">' +
    '<div class="pl-icon">' + lockSvg + '</div>' +
    '<div class="pl-title">Waiting on Commissioner</div>' +
    '<div class="pl-sub">Your commissioner hasn\'t selected a tournament yet.<br>' + page + ' will unlock once they do.</div>' +
    '</div>';
}

function openTournamentSelector() {
  const modal = document.getElementById('tournamentSelectModal');
  if (!modal) return;
  const body = document.getElementById('tsmBody');
  if (!body) return;

  function sectionHtml(label, items) {
    let html = '<div class="tsm-section"><div class="tsm-section-label">' + label + '</div>';
    items.forEach(function (t) {
      const selected = state.selectedTournament && state.selectedTournament.id === t.id;
      const selectable = t.canSelect !== false;
      html += '<div class="tsm-item' +
        (selected ? ' tsm-item--selected' : '') +
        (!selectable ? ' tsm-item--disabled' : '') + '">';
      html += '<div class="tsm-item-main">';
      html += '<div class="tsm-item-name">' + esc(t.name) + '</div>';
      html += '<div class="tsm-item-meta">' + esc(t.dates) + (t.subtitle ? ' · ' + esc(t.subtitle) : '') + '</div>';
      html += '</div>';
      if (selected) {
        html += '<span class="tsm-check">&#10003; Selected</span>';
      } else if (t.comingSoon) {
        html += '<span class="tsm-coming-soon">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
          ' Soon</span>';
      } else if (selectable) {
        html += '<button class="tsm-select-btn btn-sm btn-primary" data-tid="' + esc(t.id) + '">Select</button>';
      } else {
        html += '<span class="tsm-tbd">Teams TBD</span>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  body.innerHTML =
    sectionHtml('In-Season Tournaments', TOURNAMENTS.inSeason) +
    sectionHtml('Conference Tournaments', TOURNAMENTS.conference) +
    sectionHtml('Postseason', TOURNAMENTS.postseason);

  body.querySelectorAll('.tsm-select-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const t = findTournamentById(btn.dataset.tid);
      if (t) setSelectedTournament(t);
    });
  });

  modal.style.display = 'flex';
}

function renderTournamentBanner() {
  const banner = document.getElementById('tournamentBanner');
  if (!banner) return;
  const t = state.selectedTournament;
  const isCom = isCommissioner();
  const away = t ? _tournDaysAway(t.startMs) : null;

  if (!t) {
    banner.className = 'tourn-banner tourn-banner--empty';
    if (isCom) {
      banner.innerHTML =
        '<div class="tb-empty-text"><strong>No tournament selected.</strong> Your league can\'t draft until you choose one.</div>' +
        '<button class="tb-action-btn" id="tbSelectBtn">Choose Tournament</button>';
    } else {
      banner.innerHTML =
        '<div class="tb-empty-text">Waiting for the commissioner to select a tournament...</div>';
    }
  } else {
    banner.className = 'tourn-banner tourn-banner--active';
    banner.innerHTML =
      '<div class="tb-left">' +
      '<div class="tb-name">' + esc(t.name) + '</div>' +
      '<div class="tb-meta">' + esc(t.dates) + (t.location ? ' · ' + esc(t.location) : '') + '</div>' +
      '</div>' +
      '<div class="tb-right">' +
      (away ? '<span class="tb-countdown">' + away + '</span>' : '<span class="tb-countdown tb-live">Underway</span>') +
      (isCom ? '<button class="tb-action-btn tb-change" id="tbSelectBtn">Change</button>' : '') +
      '</div>';
  }

  const btn = banner.querySelector('#tbSelectBtn');
  if (btn) btn.addEventListener('click', openTournamentSelector);
}

function _tournDaysAway(ms) {
  const now = Date.now();
  const diff = ms - now;
  if (diff <= 0) return null;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 30) return days + 'd away';
  const months = Math.round(days / 30.4);
  return months + 'mo away';
}

function renderTournaments() {
  const el = document.getElementById('tournamentsContent');
  if (!el) return;

  const lockSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  function sectionHtml(label, items, showTeams, accentClass) {
    let html = '<div class="tourn-section">';
    html += '<h3 class="tourn-section-label">' + label + '</h3>';
    items.forEach(function (t) {
      const away = _tournDaysAway(t.startMs);
      var classes = 'tourn-card ' + accentClass;
      if (t.highlight) classes += ' tourn-card--featured';
      if (t.comingSoon) classes += ' tourn-card--locked';
      html += '<div class="' + classes + '"' + (t.comingSoon ? ' data-coming-soon="1"' : '') + '>';
      html += '<div class="tourn-card-top">';
      html += '<div class="tourn-card-info">';
      html += '<div class="tourn-card-name">' + esc(t.name) + '</div>';
      if (t.subtitle) html += '<div class="tourn-card-sub">' + esc(t.subtitle) + '</div>';
      html += '</div>';
      html += '<div class="tourn-card-right">';
      if (away) html += '<span class="tourn-badge tourn-badge--soon">' + away + '</span>';
      html += '<div class="tourn-card-dates">' + esc(t.dates) + '</div>';
      html += '</div>';
      html += '</div>';
      html += '<div class="tourn-card-meta">';
      html += '<svg class="tourn-meta-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 8.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.5 4.5 8.5 4.5 8.5S12.5 9.5 12.5 6c0-2.485-2.015-4.5-4.5-4.5z"/></svg>';
      html += '<span>' + esc(t.location || '') + '</span>';
      html += '</div>';
      if (t.note) html += '<div class="tourn-card-note">' + esc(t.note) + '</div>';
      if (showTeams && t.teams && t.teams.length) {
        html += '<div class="tourn-card-actions">' +
          '<button class="tourn-bracket-btn" data-bracket-tid="' + esc(t.id) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">' +
          '<path d="M3 5h5v5"/><path d="M3 19h5v-5"/><path d="M8 7.5h4v9h4"/><path d="M16 12h5"/>' +
          '</svg>' +
          ' View Bracket' +
          '</button>' +
          '<span class="tourn-team-count">' + t.teams.length + ' teams</span>' +
          '</div>';
      }
      // Lock overlay for coming-soon cards
      if (t.comingSoon) {
        html += '<div class="tourn-card-lock-overlay">' +
          lockSvg +
          '<span>Coming Soon</span>' +
          '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  el.innerHTML =
    sectionHtml('In-Season Tournaments', TOURNAMENTS.inSeason, true, 'tourn-card--blue') +
    sectionHtml('Conference Tournaments', TOURNAMENTS.conference, false, 'tourn-card--purple') +
    sectionHtml('Postseason', TOURNAMENTS.postseason, false, 'tourn-card--gold');

  // Wire click on locked cards
  el.querySelectorAll('.tourn-card--locked').forEach(function (card) {
    card.addEventListener('click', function () {
      toast('This tournament is coming soon. Check back as the season approaches!', 'info');
    });
  });

  // Wire "View Bracket" buttons
  el.querySelectorAll('.tourn-bracket-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      openBracketPreview(btn.dataset.bracketTid);
    });
  });
}

// ── Bracket preview modal ─────────────────────────────────
function openBracketPreview(tid) {
  const t = findTournamentById(tid);
  if (!t) return;

  const modal = document.getElementById('bracketPreviewModal');
  const titleEl = document.getElementById('bpmTitle');
  const subEl = document.getElementById('bpmSub');
  const bodyEl = document.getElementById('bpmBody');
  if (!modal || !bodyEl) return;

  if (titleEl) titleEl.textContent = t.name;
  if (subEl) subEl.textContent = t.dates + (t.location ? ' · ' + t.location : '');

  // Seeded teams if available, else plain team list
  const seeded = (t.seededTeams && t.seededTeams.length)
    ? t.seededTeams
    : (t.teams || []).map(function (name, i) { return { name: name, seed: i + 1 }; });

  const n = seeded.length;
  if (!n) {
    bodyEl.innerHTML = '<div class="bpm-empty">Bracket not available yet.</div>';
    modal.style.display = 'flex';
    return;
  }

  const rounds = Math.ceil(Math.log2(n));
  const roundNames = t.roundNames || (function () {
    const names = [];
    for (let r = 0; r < rounds; r++) {
      const left = Math.pow(2, rounds - r);
      if (left === 2) names.push('Championship');
      else if (left === 4) names.push('Semifinals');
      else if (left === 8) names.push('Quarterfinals');
      else names.push('Round of ' + left);
    }
    return names;
  })();

  let html = '<div class="bpm-bracket">';
  for (let r = 0; r < rounds; r++) {
    const matches = Math.pow(2, rounds - 1 - r);
    html += '<div class="bpm-round">';
    html += '<div class="bpm-round-label">' + esc(roundNames[r] || ('Round ' + (r + 1))) + '</div>';
    for (let m = 0; m < matches; m++) {
      html += '<div class="bpm-match">';
      for (let side = 0; side < 2; side++) {
        if (r === 0) {
          const idx = m * 2 + side;
          const tm = seeded[idx];
          if (tm) {
            html += '<div class="bpm-team">' +
              '<span class="bpm-seed">' + (tm.seed || '') + '</span>' +
              getSchoolLogoHTML(tm.name, 18) +
              '<span class="bpm-name">' + esc(tm.name) + '</span>' +
              '</div>';
          } else {
            html += '<div class="bpm-team bpm-tbd"><span class="bpm-seed">-</span><span class="bpm-name">TBD</span></div>';
          }
        } else {
          html += '<div class="bpm-team bpm-tbd"><span class="bpm-seed">-</span><span class="bpm-name">TBD</span></div>';
        }
      }
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  bodyEl.innerHTML = html;
  modal.style.display = 'flex';
}

function closeBracketPreview() {
  const modal = document.getElementById('bracketPreviewModal');
  if (modal) modal.style.display = 'none';
}

function renderBracket() {
  try { renderBracketOverrideBar(); } catch (e) { }
  const content = document.getElementById('bracketContent');
  if (!content) return;

  // Gate: no tournament selected
  if (!state.selectedTournament) {
    content.innerHTML = getLockHtml('the bracket');
    const btn = content.querySelector('#plSelectTournBtn');
    if (btn) btn.addEventListener('click', openTournamentSelector);
    return;
  }

  updateBracketTabs();
  const fmt = state.selectedTournament.bracketFormat;
  const bracketData = getBracketState() || { regions: {}, finalFour: [null, null], championship: null };

  if (fmt === 'ncaa64') {
    const activeTab = document.querySelector('.bracket-tab.active');
    const region = activeTab ? activeTab.dataset.region : 'East';
    if (region === 'FinalFour') { renderFinalFour(content, bracketData); return; }
    const regData = (window.MM_BRACKET_DATA || { regions: [] }).regions.find(r => r.name === region);
    if (!regData) { content.innerHTML = '<p style="color:var(--muted);padding:20px">No bracket data.</p>'; return; }
    renderRegionSimple(content, regData, bracketData, region, null);
  } else {
    // Single bracket format
    const regData = (window.MM_BRACKET_DATA || { regions: [] }).regions[0];
    if (!regData) { content.innerHTML = '<p style="color:var(--muted);padding:20px">No bracket data.</p>'; return; }
    const customRoundNames = state.selectedTournament.roundNames || null;
    renderRegionSimple(content, regData, bracketData, regData.name, customRoundNames);
  }
}

function renderRegionSimple(content, regData, bracketData, region, customRoundNames) {
  try { wireBracketOverrideClicks(); } catch (e) { }
  const defaultRoundNames = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8'];
  const roundNames = customRoundNames || defaultRoundNames;
  const numRounds = roundNames.length;
  const roundWinners = bracketData.regions[region] || Array(numRounds).fill(null).map(() => []);
  // Winners come from the live feed. The commissioner can override any
  // slot when the feed is wrong or slow — a tournament that cannot be
  // corrected from inside the app is a tournament that stays broken.
  const canEdit = (function () { try { return isCommissioner(); } catch (e) { return false; } })();

  const seedMap = {};
  (regData.matchups || []).forEach(mu => {
    if (mu.top && mu.top.name) seedMap[mu.top.name] = mu.top.seed;
    if (mu.bot && mu.bot.name) seedMap[mu.bot.name] = mu.bot.seed;
  });

  const makeTeamRow = (team, won, lost, rnd, m) => {
    if (!team) return '<div class="br-team br-tbd"><span class="br-seed">-</span><span class="br-name">TBD</span></div>';
    const matchWinner = (roundWinners[rnd] || [])[m] || null;
    // Clickable even when a winner is already set — overriding a WRONG
    // result is the whole point. Clicking the current winner reverts.
    const clickable = canEdit;
    const overridden = (function () { try { return isOverriddenSlot(region, rnd, m); } catch (e) { return false; } })();
    const editAttr = clickable
      ? ' data-team="' + esc(team.name) + '" data-region="' + esc(region) + '" data-rnd="' + rnd + '" data-match="' + m + '"'
      : '';
    let cls = 'br-team';
    if (won) cls += ' br-winner';
    if (lost) cls += ' br-loser';
    if (clickable) cls += ' br-clickable';
    if (overridden && won) cls += ' br-override';
    const owner = getOwnerInitials(team.name);
    return '<div class="' + cls + '"' + editAttr + '>' +
      '<span class="br-seed">' + (team.seed || '') + '</span>' +
      getSchoolLogoHTML(team.name, 18) +
      '<span class="br-name">' + esc(team.name) + '</span>' +
      (owner ? '<span class="br-owner">' + owner + '</span>' : '') +
      (won ? '<span class="br-check">&#10003;</span>' : '') +
      '</div>';
  };

  let html = '<div class="br-region">';
  for (let rnd = 0; rnd < numRounds; rnd++) {
    const matchCount = Math.pow(2, numRounds - 1 - rnd);
    const prev = rnd === 0 ? null : (roundWinners[rnd - 1] || []);
    const unlocked = rnd === 0 || (prev && prev.filter(Boolean).length >= matchCount * 2);

    html += '<div class="br-round' + (!unlocked ? ' br-locked' : '') + '">';
    html += '<div class="br-round-label">' + roundNames[rnd] + '</div>';

    if (!unlocked) {
      html += '<div class="br-round-pending">Waiting on ' + roundNames[rnd - 1] + ' results</div>';
    } else {
      for (let m = 0; m < matchCount; m++) {
        let topTeam, botTeam;
        if (rnd === 0) {
          topTeam = regData.matchups[m] ? regData.matchups[m].top : null;
          botTeam = regData.matchups[m] ? regData.matchups[m].bot : null;
        } else {
          const tName = prev[m * 2], bName = prev[m * 2 + 1];
          topTeam = tName ? { name: tName, seed: seedMap[tName] || '' } : null;
          botTeam = bName ? { name: bName, seed: seedMap[bName] || '' } : null;
        }
        const winner = (roundWinners[rnd] || [])[m] || null;
        const topWon = !!(winner && topTeam && winner === topTeam.name);
        const botWon = !!(winner && botTeam && winner === botTeam.name);
        const topN = topTeam ? topTeam.name : '';
        const botN = botTeam ? botTeam.name : '';
        const statsBtn = '<button class="br-stats-btn" data-top="' + esc(topN) + '" data-bot="' + esc(botN) + '" data-round="' + esc(roundNames[rnd]) + '" title="View game stats">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="2" y="14" width="4" height="8" rx="1"/><rect x="9" y="9" width="4" height="13" rx="1"/><rect x="16" y="4" width="4" height="18" rx="1"/></svg>' +
          '</button>';
        html += '<div class="br-matchup">' +
          makeTeamRow(topTeam, topWon, !topWon && !!winner, rnd, m) +
          '<div class="br-vs-row"><span class="br-vs">vs</span>' + statsBtn + '</div>' +
          makeTeamRow(botTeam, botWon, !botWon && !!winner, rnd, m) +
          '</div>';
      }
    }
    html += '</div>';
  }
  html += '</div>';
  content.innerHTML = html;

  content.querySelectorAll('.br-stats-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      openGameModal(btn.dataset.top, btn.dataset.bot, btn.dataset.round);
    });
  });
}


function getOwnerInitials(teamName) {
  // Find if any drafted player from this school
  for (const [pid, d] of Object.entries(state.drafted)) {
    const p = (state.players || []).find(x => x.id === pid);
    if (p && normalizeName(p.college) === normalizeName(teamName)) {
      return d.manager.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    }
  }
  return null;
}

function renderFinalFour(content, bracketData, readOnly) {
  const ff = window.MM_BRACKET_DATA ? window.MM_BRACKET_DATA.finalFour : [];
  const canEdit = false; // Bracket is read-only; winners are set by live data feed
  content.innerHTML = '<div class="final-four-view"><div class="ff-section-label">Semifinals</div></div>';
  const view = content.querySelector('.final-four-view');

  ff.forEach((semifinal, i) => {
    const topRegionWinners = bracketData.regions[semifinal.topRegion] || [[], [], [], []];
    const botRegionWinners = bracketData.regions[semifinal.botRegion] || [[], [], [], []];
    const topName = topRegionWinners[3] ? topRegionWinners[3][0] : null;
    const botName = botRegionWinners[3] ? botRegionWinners[3][0] : null;
    const ffWinner = bracketData.finalFour[i] || null;

    const mu = document.createElement('div');
    mu.className = 'bracket-matchup';
    const ffStatsBtn = '<button class="br-stats-btn" data-top="' + esc(topName || '') + '" data-bot="' + esc(botName || '') + '" data-round="Semifinal" title="View game stats">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="2" y="14" width="4" height="8" rx="1"/><rect x="9" y="9" width="4" height="13" rx="1"/><rect x="16" y="4" width="4" height="18" rx="1"/></svg>' +
      '</button>';
    mu.innerHTML =
      makeFinalFourTeam(topName, semifinal.topRegion, ffWinner === topName, ffWinner && ffWinner !== topName, 'ff', i, 'top', canEdit) +
      '<div class="br-vs-row"><span class="bracket-vs">vs</span>' + ffStatsBtn + '</div>' +
      makeFinalFourTeam(botName, semifinal.botRegion, ffWinner === botName, ffWinner && ffWinner !== botName, 'ff', i, 'bot', canEdit);
    mu.querySelectorAll('.br-stats-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); openGameModal(btn.dataset.top, btn.dataset.bot, btn.dataset.round); });
    });
    view.appendChild(mu);
  });

  // Championship
  const champLabel = document.createElement('div');
  champLabel.className = 'ff-section-label';
  champLabel.style.marginTop = '24px';
  champLabel.textContent = 'Championship';
  view.appendChild(champLabel);
  const champMu = document.createElement('div');
  champMu.className = 'bracket-matchup';
  const c1 = bracketData.finalFour[0] || null;
  const c2 = bracketData.finalFour[1] || null;
  const champ = bracketData.championship || null;
  const champStatsBtn = '<button class="br-stats-btn" data-top="' + esc(c1 || '') + '" data-bot="' + esc(c2 || '') + '" data-round="Championship" title="View game stats">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="2" y="14" width="4" height="8" rx="1"/><rect x="9" y="9" width="4" height="13" rx="1"/><rect x="16" y="4" width="4" height="18" rx="1"/></svg>' +
    '</button>';
  champMu.innerHTML =
    makeFinalFourTeam(c1, 'East/West', champ === c1, champ && champ !== c1, 'champ', 0, 'top', canEdit) +
    '<div class="br-vs-row"><span class="bracket-vs">vs</span>' + champStatsBtn + '</div>' +
    makeFinalFourTeam(c2, 'South/Midwest', champ === c2, champ && champ !== c2, 'champ', 1, 'bot', canEdit);
  champMu.querySelectorAll('.br-stats-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); openGameModal(btn.dataset.top, btn.dataset.bot, btn.dataset.round); });
  });
  view.appendChild(champMu);

}

function makeFinalFourTeam(name, region, isWinner, isElim, fftype, idx, side, canEdit) {
  if (!name) return '<div class="bracket-team"><span class="bt-seed">-</span><span class="bt-name">TBD (' + region + ')</span></div>';
  const oi = getOwnerInitials(name);
  let cls = 'bracket-team';
  if (isWinner) cls += ' winner';
  if (isElim) cls += ' eliminated';
  const editAttr = canEdit ? ' data-team="' + esc(name) + '" data-fftype="' + fftype + '" data-idx="' + idx + '"' : '';
  return '<div class="' + cls + '"' + editAttr + '>' +
    getSchoolLogoHTML(name, 18) +
    '<span class="bt-name">' + esc(name) + '</span>' +
    (oi ? '<span class="bt-owner">' + oi + '</span>' : '') +
    '</div>';
}

// ── GAME STATS MODAL ──────────────────────────────────────
function openGameModal(topName, botName, roundLabel) {
  const modal = document.getElementById('gameModal');
  if (!modal) return;

  // Scoreboard header
  const topLogo = document.getElementById('gmTopLogo');
  const botLogo = document.getElementById('gmBotLogo');
  const topNameEl = document.getElementById('gmTopName');
  const botNameEl = document.getElementById('gmBotName');
  const roundEl = document.getElementById('gmRoundLabel');

  if (topLogo) topLogo.innerHTML = topName ? getSchoolLogoHTML(topName, 36) : '';
  if (botLogo) botLogo.innerHTML = botName ? getSchoolLogoHTML(botName, 36) : '';
  if (topNameEl) topNameEl.textContent = topName || 'TBD';
  if (botNameEl) botNameEl.textContent = botName || 'TBD';
  if (roundEl) roundEl.textContent = roundLabel || '';

  // Score + status: empty until live data arrives
  const topScore = document.getElementById('gmTopScore');
  const botScore = document.getElementById('gmBotScore');
  const period = document.getElementById('gmPeriod');
  if (topScore) topScore.textContent = '-';
  if (botScore) botScore.textContent = '-';
  if (period) period.textContent = '';

  // Stats labels
  const topLabel = document.getElementById('gmTopStatsLabel');
  const botLabel = document.getElementById('gmBotStatsLabel');
  if (topLabel) topLabel.textContent = topName || 'TBD';
  if (botLabel) botLabel.textContent = botName || 'TBD';

  // Build player rows (empty live stats — ready for data feed)
  function buildRows(college, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const players = (state.players || window.MM_PLAYERS || []).filter(function (p) {
      return p.college && p.college.toLowerCase() === (college || '').toLowerCase();
    });
    if (!players.length) {
      container.innerHTML = '<div class="gm-no-players">No player data yet</div>';
      return;
    }
    container.innerHTML = players.map(function (p) {
      return '<div class="gm-stats-row">' +
        '<span class="gst-player">' + esc(p.name) + ' <span class="gst-pos">' + esc(p.position) + '</span></span>' +
        '<span class="gst-stat gst-live">-</span>' +
        '<span class="gst-stat gst-live">-</span>' +
        '<span class="gst-stat gst-live">-</span>' +
        '<span class="gst-stat gst-live">-</span>' +
        '<span class="gst-stat gst-live">-</span>' +
        '<span class="gst-stat gst-fpts gst-live">-</span>' +
        '</div>';
    }).join('');
  }

  buildRows(topName, 'gmTopRows');
  buildRows(botName, 'gmBotRows');

  // Always reopen on the top team rather than whichever was last
  // viewed — a modal that remembers a selection from a different game
  // shows the wrong roster the moment you open a second matchup.
  setGameModalTeam('top');

  modal.style.display = 'flex';
}

// ── Which team's box score is showing ────────────────────
function setGameModalTeam(which) {
  const want = which === 'bot' ? 'bot' : 'top';

  document.querySelectorAll('.gm-scoreboard [data-gm-tab]').forEach(function (tab) {
    const on = tab.dataset.gmTab === want;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  const top = document.getElementById('gmTopStats');
  const bot = document.getElementById('gmBotStats');
  if (top) top.classList.toggle('is-active', want === 'top');
  if (bot) bot.classList.toggle('is-active', want === 'bot');
}

function closeGameModal() {
  const modal = document.getElementById('gameModal');
  if (modal) modal.style.display = 'none';
}

// ── SCORING SETTINGS ──────────────────────────────────────
function renderScoringSettings() {
  const cats = ['points', 'rebounds', 'assists', 'steals', 'blocks'];
  cats.forEach(cat => {
    const tog = document.getElementById(cat + 'Toggle');
    const wt = document.getElementById(cat + 'Weight');
    if (tog) tog.checked = (state.scoring.active || []).includes(cat);
    if (wt) wt.value = state.scoring.weights[cat] || 1;
  });
  const tmMin = document.getElementById('timerMinutes');
  const tmSec = document.getElementById('timerSeconds');
  if (tmMin || tmSec) {
    const total = state.pickTimerSeconds || 90;
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (tmMin) tmMin.value = m;
    if (tmSec) tmSec.value = s;
  }
}

// ── TIMER ─────────────────────────────────────────────────
function getRemainingSeconds() {
  if (!state.pickTimerStartedAt) return state.pickTimerSeconds;
  const elapsed = Math.floor((Date.now() - state.pickTimerStartedAt) / 1000);
  return Math.max(0, state.pickTimerSeconds - elapsed);
}

function formatTimer(secs) {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m + ':' + String(sec).padStart(2, '0');
}

function updateTimerBtnState() {
  const running = state.timerRunning;
  document.querySelectorAll('#startTimerBtnHome, #startTimerBtnDraft').forEach(btn => {
    btn.classList.toggle('running', running);
    btn.disabled = running;
    btn.textContent = running ? 'Running' : 'Start';
  });
}

function startTimer() {
  if (state.timerRunning) return;

  // Don't let a draft begin with half the league missing.
  // ESPN pushes the start back in 5-minute blocks until the league is
  // full; we can't hold the room open like that, so we warn hard and
  // make the commissioner say yes on purpose. The failure this prevents
  // is a Nov 23 draft starting with three of eight managers present,
  // which cannot be undone once picks are in.
  const joined = (state.managers || []).length;
  const max    = state.maxManagers || 8;
  const firstPick = state.currentPickIndex === 0;

  if (firstPick && joined < max) {
    const missing = max - joined;
    const ok = confirm(
      'Only ' + joined + ' of ' + max + ' managers have joined.\n\n' +
      missing + ' spot' + (missing === 1 ? '' : 's') + ' still open. ' +
      'Starting now drafts without them, and picks cannot be undone once the draft is running.\n\n' +
      'Start anyway?'
    );
    if (!ok) return;
    addActivity('Draft started with ' + joined + ' of ' + max + ' managers.');
  }

  state.pickTimerStartedAt = Date.now();
  state.timerRunning = true;
  saveState();
  updateTimerBtnState();
  timerInterval = setInterval(tickTimer, 500);

  if (firstPick) {
    track('draft_started', {
      managers: joined,
      max_managers: max,
      league_full: joined >= max,
      rounds: state.rounds || 8,
      timer_seconds: state.pickTimerSeconds,
      tournament: state.selectedTournament ? state.selectedTournament.id : null,
    });
  }
}

function pauseTimer() {
  if (!state.timerRunning) return;
  const rem = getRemainingSeconds();
  clearInterval(timerInterval);
  state.timerRunning = false;
  state.pickTimerSeconds = rem;
  state.pickTimerStartedAt = null;
  saveState();
  updateTimerBtnState();
}

function resetTimer() {
  clearInterval(timerInterval);
  state.timerRunning = false;
  state.pickTimerStartedAt = null;
  const tmMin = document.getElementById('timerMinutes');
  const tmSec = document.getElementById('timerSeconds');
  const m = tmMin ? parseInt(tmMin.value) : 1;
  const s = tmSec ? parseInt(tmSec.value) : 30;
  state.pickTimerSeconds = m * 60 + s;
  saveState();
  updateTimerBtnState();
  updateTimerDisplay();
}

function tickTimer() {
  const rem = getRemainingSeconds();
  updateTimerDisplay();
  if (rem <= 0) {
    clearInterval(timerInterval);
    state.timerRunning = false;
    updateTimerBtnState();
    toast("Time's up! " + (currentPick() ? currentPick().manager + ' auto-picks.' : ''), 'info');
    if (isCommissioner()) autoPickForCurrent();
  }
}

function updateTimerDisplay() {
  const rem = getRemainingSeconds();
  const fmt = formatTimer(rem);
  const homeTimer = document.getElementById('homeTimer');
  const dcbTimer = document.getElementById('dcbTimer');
  const mcbTimer = document.getElementById('mcbTimer');
  if (homeTimer) {
    homeTimer.textContent = fmt;
    homeTimer.classList.toggle('urgency', rem > 0 && rem <= 10);
  }
  if (dcbTimer) dcbTimer.textContent = fmt;
  if (mcbTimer) {
    mcbTimer.textContent = state.timerRunning ? fmt : '';
    mcbTimer.style.display = state.timerRunning ? '' : 'none';
  }
  try { updateMobileClockBar(); } catch (e) { }
  // Circular ring
  try { updateRingProgress(); } catch (e) { }
  // Right panel live timer
  const rpTimer = document.querySelector('#rpUpNext .rp-un-timer');
  if (rpTimer) rpTimer.textContent = fmt;
}

function updateRingProgress() {
  const ring = document.getElementById('heroRingProgress');
  if (!ring) return;
  const total = state.pickTimerSeconds || 90;
  const rem = getRemainingSeconds();
  const active = state.timerRunning || !!state.pickTimerStartedAt;
  const pct = active ? Math.max(0, Math.min(1, rem / total)) : 1;
  const circumference = 2 * Math.PI * 70; // r = 70
  ring.style.strokeDasharray = circumference;
  ring.style.strokeDashoffset = circumference * (1 - pct);
  ring.classList.toggle('urgency', state.timerRunning && rem > 0 && rem <= 10);
}

// ══════════════════════════════════════════════════════════
// ⭐ PLAYER QUEUE
//
//  A per-manager ranked shortlist. When the timer expires, autopick
//  takes the highest player in YOUR queue instead of whoever the
//  algorithm rates best. This is the single thing that makes a short
//  pick timer survivable on a phone, and it is what every mature
//  fantasy platform does.
//
//  Queues live in league state, not localStorage. That is deliberate:
//  when your timer runs out it may well be another manager's device
//  that executes the autopick, so your queue has to be readable by
//  their client. The tradeoff is that a queue is not a secret — it is
//  in the league document like everything else. For a friends league
//  that is acceptable; if it ever matters, it moves to a subcollection
//  with per-user rules.
// ══════════════════════════════════════════════════════════
function getQueue(manager) {
  if (!manager) return [];
  const all = state.queues || {};
  return (all[manager] || []).filter(function (pid) {
    // Drop anyone already drafted or no longer in the pool, so a stale
    // queue entry can never be auto-picked.
    return !state.drafted[pid] && (state.players || []).some(function (p) { return p.id === pid; });
  });
}

function myQueue() {
  const s = getSession();
  return getQueue(s ? s.name : null);
}

function setQueue(manager, ids) {
  if (!manager) return;
  state.queues = state.queues || {};
  state.queues[manager] = ids;
  saveState();
}

function toggleQueue(playerId) {
  const s = getSession();
  if (!s) return;
  const q = getQueue(s.name);
  const i = q.indexOf(playerId);
  const p = (state.players || []).find(function (x) { return x.id === playerId; });

  if (i === -1) {
    q.push(playerId);
    toast((p ? p.name : 'Player') + ' queued (#' + q.length + ')', 'success');
  } else {
    q.splice(i, 1);
    toast((p ? p.name : 'Player') + ' removed from queue', 'info');
  }
  setQueue(s.name, q);
  try { renderQueue(); } catch (e) { }
  try { renderDraftGrid(); } catch (e) { }
}

function moveInQueue(playerId, dir) {
  const s = getSession();
  if (!s) return;
  const q = getQueue(s.name);
  const i = q.indexOf(playerId);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= q.length) return;
  const tmp = q[i]; q[i] = q[j]; q[j] = tmp;
  setQueue(s.name, q);
  renderQueue();
}

function clearQueue() {
  const s = getSession();
  if (!s) return;
  if (!getQueue(s.name).length) return;
  if (!confirm('Clear your whole queue?')) return;
  setQueue(s.name, []);
  renderQueue();
  try { renderDraftGrid(); } catch (e) { }
}

function isQueued(playerId) {
  const s = getSession();
  return s ? getQueue(s.name).indexOf(playerId) !== -1 : false;
}

function queuePosition(playerId) {
  const s = getSession();
  if (!s) return 0;
  return getQueue(s.name).indexOf(playerId) + 1;   // 0 when absent
}

// Remove a drafted player from EVERY queue, not just the drafter's.
// Otherwise seven other managers keep a dead name in their shortlist.
function pruneQueues(playerId) {
  if (!state.queues) return;
  let touched = false;
  Object.keys(state.queues).forEach(function (m) {
    const before = state.queues[m].length;
    state.queues[m] = state.queues[m].filter(function (pid) { return pid !== playerId; });
    if (state.queues[m].length !== before) touched = true;
  });
  return touched;
}

function renderQueue() {
  const host = document.getElementById('queueList');
  const countEl = document.getElementById('queueCount');
  if (!host) return;

  const s = getSession();
  const q = s ? getQueue(s.name) : [];
  if (countEl) countEl.textContent = q.length ? q.length : '';

  if (!q.length) {
    host.innerHTML = '<p class="queue-empty">Star players to build a shortlist. If your timer runs out, the top of your queue is picked instead of whoever the app thinks is best.</p>';
    return;
  }

  host.innerHTML = q.map(function (pid, i) {
    const p = (state.players || []).find(function (x) { return x.id === pid; });
    if (!p) return '';
    const eligible = playerIsEligible(p, s.name);
    return '<div class="q-row' + (eligible ? '' : ' q-row--locked') + '" data-pid="' + esc(p.id) + '">' +
      '<span class="q-rank">' + (i + 1) + '</span>' +
      '<div class="q-info">' +
        '<span class="q-name">' + esc(p.name) + '</span>' +
        '<span class="q-meta">' + esc(p.position) + ' · ' + esc(p.college) + '</span>' +
      '</div>' +
      '<div class="q-actions">' +
        '<button class="q-btn" data-qmove="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>&#9650;</button>' +
        '<button class="q-btn" data-qmove="1" aria-label="Move down"' + (i === q.length - 1 ? ' disabled' : '') + '>&#9660;</button>' +
        '<button class="q-btn q-btn--x" data-qremove="1" aria-label="Remove from queue">&times;</button>' +
      '</div>' +
      '</div>';
  }).join('');
}

function wireQueueStars() {
  const grid = document.getElementById('draftPlayerGrid');
  if (!grid || grid.dataset.qWired === '1') return;
  grid.dataset.qWired = '1';
  grid.addEventListener('click', function (e) {
    const btn = e.target.closest ? e.target.closest('[data-queue]') : null;
    if (!btn) return;
    e.stopPropagation();          // do not open the draft-confirm modal
    toggleQueue(btn.getAttribute('data-queue'));
  });
}

function wireQueue() {
  const panel = document.getElementById('queuePanel');
  if (!panel || panel.dataset.wired === '1') return;
  panel.dataset.wired = '1';

  panel.addEventListener('click', function (e) {
    const row = e.target.closest ? e.target.closest('.q-row') : null;
    if (!row) {
      if (e.target.id === 'queueClearBtn') clearQueue();
      return;
    }
    const pid = row.getAttribute('data-pid');
    if (e.target.hasAttribute('data-qmove')) {
      moveInQueue(pid, parseInt(e.target.getAttribute('data-qmove'), 10));
    } else if (e.target.hasAttribute('data-qremove')) {
      toggleQueue(pid);
    }
  });
}

function autoPickForCurrent() {
  const pick = currentPick();
  if (!pick) return;
  let players = getSortedPlayers('', '').filter(p => !state.drafted[p.id]);
  if (players.length === 0) return;

  // Never auto-pick a player that would make the manager's roster
  // illegal. If the rule has locked them in, this narrows the list to
  // the positions they are obligated to take.
  const legal = players.filter(p => playerIsEligible(p, pick.manager));
  if (legal.length) players = legal;

  // ── Queue first ────────────────────────────────────────
  //  Walk this manager's shortlist in their order and take the first
  //  entry that is still available AND keeps their roster legal. Only
  //  fall through to best-available if the queue is empty or exhausted.
  let best = null;
  let fromQueue = false;
  const queued = getQueue(pick.manager);
  for (let i = 0; i < queued.length; i++) {
    const cand = players.find(function (p) { return p.id === queued[i]; });
    if (cand) { best = cand; fromQueue = true; break; }
  }
  if (!best) best = players[0];
  state.drafted[best.id] = { manager: pick.manager, round: pick.round, pick: pick.pick, pickNumber: pick.pickNumber, label: pick.label, ts: Date.now() };
  state.currentPickIndex++;
  pruneQueues(best.id);
  addActivity('Auto-pick: ' + esc(pick.manager) + ' was assigned ' + esc(best.name) +
    (fromQueue ? ' (from queue)' : ''));
  // from_queue is the number that matters: if autopicks are mostly NOT
  // from a queue, people are not using it and the timer is still the
  // problem the queue was meant to solve.
  track('pick_autodrafted', {
    round: pick.round, pick_number: pick.pickNumber,
    seed: best.seed, position: best.position,
    from_queue: fromQueue,
  });
  if (isDraftComplete()) {
    clearInterval(timerInterval);
    state.timerRunning = false;
    state.pickTimerStartedAt = null;
  } else if (state.timerRunning) {
    state.pickTimerStartedAt = Date.now();
  }
  saveState();
  render();
  toast(pick.manager + ' auto-picked ' + best.name + (fromQueue ? ' from their queue' : ''), 'info');
}

// ── ACTIVITY FEED RENDER ──────────────────────────────────
function renderActivityFeed() {
  const el = document.getElementById('activityFeed');
  if (!el) return;
  const feed = state.activityFeed || [];
  if (feed.length === 0) {
    el.innerHTML = '<p class="feed-empty">No activity yet. The feed updates live as your draft unfolds.</p>';
    return;
  }
  function feedMeta(msg) {
    if (msg.includes('drafted') || msg.includes('Auto-pick')) return { icon: '🏀', cls: 'feed-draft' };
    if (msg.includes('advances') || msg.includes('champion')) return { icon: '🏆', cls: 'feed-bracket' };
    if (msg.includes('simulated')) return { icon: '📊', cls: 'feed-sim' };
    if (msg.includes('↩') || msg.includes('Undo')) return { icon: '↩', cls: 'feed-undo' };
    if (msg.includes('skipped')) return { icon: '⏭', cls: 'feed-skip' };
    if (msg.includes('reset') || msg.includes('Reset') || msg.includes('restarted')) return { icon: '↺', cls: 'feed-reset' };
    if (msg.includes('created') || msg.includes('renamed')) return { icon: '⚙️', cls: 'feed-sys' };
    return { icon: '•', cls: '' };
  }
  el.innerHTML = feed.slice(0, 20).map(item => {
    const meta = feedMeta(item.msg);
    return '<div class="feed-item ' + meta.cls + '">' +
      '<span class="feed-icon-badge">' + meta.icon + '</span>' +
      '<div class="feed-body"><span class="feed-msg">' + esc(item.msg) + '</span>' +
      '<span class="feed-time">' + timeAgo(item.ts) + '</span></div>' +
      '</div>';
  }).join('');
}

// ── RIGHT PANEL ───────────────────────────────────────────
function renderRightPanel() {
  renderRpUpNext();
  renderRpStandings();
  renderRpChat();
}

function renderRpUpNext() {
  const el = document.getElementById('rpUpNext');
  if (!el) return;
  const order = buildDraftOrder();
  const nextPick = order[state.currentPickIndex];
  if (!nextPick) {
    el.innerHTML = '<div class="rp-empty">' + (isDraftComplete() ? 'Draft complete! 🎉' : 'Draft not started') + '</div>';
    return;
  }
  const rem = state.timerRunning ? getRemainingSeconds() : state.pickTimerSeconds;
  el.innerHTML =
    '<div class="rp-up-next-card">' +
    makeAvatarHTML(nextPick.manager, 38) +
    '<div class="rp-un-info">' +
    '<div class="rp-un-pre">' + esc(nextPick.label) + '</div>' +
    '<div class="rp-un-name">' + esc(nextPick.manager) + '</div>' +
    '</div>' +
    '<div class="rp-un-timer">' + formatTimer(rem) + '</div>' +
    '</div>';
}

function renderRpStandings() {
  const el = document.getElementById('rpStandings');
  if (!el) return;
  if (!state.managers.length) {
    el.innerHTML = '<div class="rp-empty">No managers yet</div>';
    return;
  }
  const session = getSession();
  const me = session ? session.name : null;
  const ranked = state.managers.slice().sort((a, b) => managerFPTS(b) - managerFPTS(a));
  el.innerHTML = ranked.slice(0, 4).map((mgr, i) => {
    const fpts = managerFPTS(mgr);
    const isMe = mgr === me;
    return '<div class="rp-standing-row">' +
      '<span class="rp-sr-rank">' + (i + 1) + '</span>' +
      makeAvatarHTML(mgr, 26) +
      '<span class="rp-sr-name">' + esc(mgr.split(' ')[0]) + (isMe ? '<span class="rp-you-badge">You</span>' : '') + '</span>' +
      '<span class="rp-sr-score">' + fpts + '</span>' +
      '</div>';
  }).join('');
}

function renderRpChat() {
  const el = document.getElementById('rpChatMessages');
  if (!el) return;
  const msgs = getChatMessages();
  if (!msgs.length) {
    el.innerHTML = '<div class="rp-empty">No messages yet. Say something!</div>';
    return;
  }
  el.innerHTML = msgs.slice(-4).map(m => {
    return '<div class="rp-chat-msg">' +
      makeAvatarHTML(m.sender, 28) +
      '<div class="rp-chat-body">' +
      '<div class="rp-chat-header"><span class="rp-chat-name">' + esc(m.sender) + '</span><span class="rp-chat-time">' + timeAgo(m.timestamp) + '</span></div>' +
      '<div class="rp-chat-text">' + esc(m.text) + '</div>' +
      '</div>' +
      '</div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function sendRpChatMessage() {
  const input = document.getElementById('rpChatInput');
  const text = (input ? input.value : '').trim();
  if (!text || !state.leagueId) return;
  const session = getSession();
  const msgs = getChatMessages();
  msgs.push({ id: Date.now().toString(), sender: session ? session.name : 'Anonymous', text, timestamp: Date.now() });
  saveChatMessages(msgs);
  if (input) input.value = '';
  renderRpChat();
  renderChat();
  updateChatBadge();
}

// ── TUTORIAL ──────────────────────────────────────────────
const TUT_STEPS = [
  { type: 'welcome', title: 'Welcome, Commissioner', body: "You're setting up a Tipoff Fantasy league. This takes about 60 seconds." },
  { type: 'name', title: 'League Name', body: 'What do you want to call your league?', input: [{ id: 'tut-league-name', label: 'League Name', placeholder: 'e.g. March Madness 2026', default: 'My League', key: 'leagueName' }] },
  { type: 'tournament', title: 'Choose Tournament', body: "Which tournament is this league drafting for? This sets your player pool and bracket format." },
  { type: 'size', title: 'League Size', body: 'How many managers will join? Once the league is full, no one else can join with the code.', size: true },
  { type: 'rounds', title: 'Draft Rounds', body: 'How many rounds in the snake draft? Each round, every manager picks one player.', input: [{ id: 'tut-rounds', label: 'Number of Rounds', placeholder: '8', default: 8, type: 'number', key: 'rounds' }] },
  { type: 'timer', title: 'Pick Timer', body: 'How long does each manager have to make their selection before auto-pick kicks in?', input: [{ id: 'tut-timer-min', label: 'Minutes', placeholder: '1', default: 1, type: 'number', key: 'timerMin' }, { id: 'tut-timer-sec', label: 'Seconds', placeholder: '30', default: 30, type: 'number', key: 'timerSec' }] },
  { type: 'code', title: 'Your League Code', body: 'Share this code with your managers. They join from the home screen. No account needed..', code: true },
  { type: 'scoring', title: 'How Scoring Works', body: 'Points are earned from real tournament stats. Default weights: PTS 1× · REB 1.2× · AST 1.5× · STL 2× · BLK 2×. Adjust anytime in Settings.' },
  { type: 'ready', title: "You're All Set", body: 'Your league is live. Share the code, wait for your managers to join, then choose a tournament and start the draft.' }
];

let tutData = {};

function showTutorial() {
  tutStep = 0;
  tutData = {};
  document.getElementById('tutorialOverlay').style.display = 'flex';
  renderTutStep();
}

function hideTutorial() {
  document.getElementById('tutorialOverlay').style.display = 'none';
}

function tutNext() {
  // Collect data from current step
  const step = TUT_STEPS[tutStep];
  if (step.input) {
    step.input.forEach(inp => {
      const el = document.getElementById(inp.id);
      if (el) tutData[inp.key] = el.value;
    });
  }
  if (tutStep < TUT_STEPS.length - 1) {
    tutStep++;
    renderTutStep();
  } else {
    // Apply tutorial data
    applyTutData();
    hideTutorial();
    saveState();
    render();
    navigateTo('home');
    toast('League created! Time to draft.', 'success');
  }
}

function tutBack() {
  if (tutStep > 0) { tutStep--; renderTutStep(); }
}

function applyTutData() {
  if (tutData.leagueName) state.leagueName = tutData.leagueName.trim() || 'My League';
  if (tutData.maxManagers) state.maxManagers = parseInt(tutData.maxManagers) || 8;
  if (tutData.rounds) state.rounds = parseInt(tutData.rounds) || 8;
  if (tutData.timerMin !== undefined || tutData.timerSec !== undefined) {
    const m = isNaN(parseInt(tutData.timerMin)) ? 1 : parseInt(tutData.timerMin);
    const s = isNaN(parseInt(tutData.timerSec)) ? 30 : parseInt(tutData.timerSec);
    state.pickTimerSeconds = Math.max(10, m * 60 + s);
  }
  if (tutData.tournamentId) {
    const allT = [];
    Object.values(TOURNAMENTS).forEach(function (g) { g.forEach(function (t) { allT.push(t); }); });
    const chosen = allT.find(function (t) { return t.id === tutData.tournamentId; });
    if (chosen) {
      state.selectedTournament = chosen;
      generateBracketData(chosen);
      state.players = playersForTournament(chosen);
      addActivity('Tournament selected: ' + chosen.name);
    }
  }
}

function renderTutStep() {
  const step = TUT_STEPS[tutStep];
  const bodyEl = document.getElementById('tutBody');
  const fillEl = document.getElementById('tutBarFill');
  const backBtn = document.getElementById('tutBackBtn');
  const nextBtn = document.getElementById('tutNextBtn');
  const stepNumEl = document.getElementById('tutStepNum');
  const stepTotalEl = document.getElementById('tutStepTotal');
  if (!bodyEl) return;

  const total = TUT_STEPS.length;
  const pct = Math.round(((tutStep + 1) / total) * 100);
  if (fillEl) fillEl.style.width = pct + '%';
  if (stepNumEl) stepNumEl.textContent = tutStep + 1;
  if (stepTotalEl) stepTotalEl.textContent = total;

  let html = '<h2 class="tut-title">' + step.title + '</h2>';
  html += '<p class="tut-body-text">' + step.body + '</p>';

  if (step.input) {
    const isTimer = step.type === 'timer';
    html += '<div class="tut-inputs' + (isTimer ? ' tut-inputs--row' : '') + '">';
    step.input.forEach(function (inp) {
      const val = tutData[inp.key] !== undefined ? tutData[inp.key] : inp.default;
      html += '<div class="tut-input-group">' +
        '<label class="tut-label">' + inp.label + '</label>' +
        '<input class="tut-input" type="' + (inp.type || 'text') + '" id="' + inp.id + '" value="' + esc(String(val)) + '" placeholder="' + esc(inp.placeholder || '') + '" /></div>';
    });
    html += '</div>';
  }

  if (step.size) {
    const cur = parseInt(tutData.maxManagers) || state.maxManagers || 8;
    html += '<div class="tut-size-grid">';
    [4, 6, 8, 10, 12].forEach(function (n) {
      html += '<button class="tut-size-pill' + (cur === n ? ' tut-size-pill--active' : '') + '" data-size="' + n + '">' +
        '<span class="tut-size-num">' + n + '</span>' +
        '<span class="tut-size-label">players</span>' +
        '</button>';
    });
    html += '</div>';
  }

  if (step.type === 'tournament') {
    const available = [];
    Object.values(TOURNAMENTS).forEach(function (group) {
      group.forEach(function (t) { if (!t.comingSoon && t.canSelect !== false) available.push(t); });
    });
    const selId = tutData.tournamentId;
    html += '<div class="tut-tourn-list">';
    available.forEach(function (t) {
      const active = selId === t.id ? ' tut-tourn-card--active' : '';
      html += '<button class="tut-tourn-card' + active + '" data-tid="' + esc(t.id) + '">' +
        '<div class="ttc-name">' + esc(t.name) + '</div>' +
        '<div class="ttc-meta">' + esc(t.dates) + ' · ' + (t.seededTeams ? t.seededTeams.length : t.teams ? t.teams.length : 8) + ' teams</div>' +
        '</button>';
    });
    html += '</div>';
  }

  if (step.code) {
    html += '<div class="tut-code-block">';
    html += '<div class="tut-code-display">' + (state.leagueCode || '--') + '</div>';
    html += '<button class="tut-copy-btn" id="tutCopyBtn">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
      ' Copy Code</button>';
    html += '</div>';
    html += '<p class="tut-code-hint">Managers join from the home screen using this code.</p>';
  }

  bodyEl.innerHTML = html;

  // Wire tournament cards
  bodyEl.querySelectorAll('.tut-tourn-card').forEach(function (card) {
    card.addEventListener('click', function () {
      tutData.tournamentId = card.dataset.tid;
      bodyEl.querySelectorAll('.tut-tourn-card').forEach(function (c) { c.classList.remove('tut-tourn-card--active'); });
      card.classList.add('tut-tourn-card--active');
    });
  });

  // Wire size pills
  bodyEl.querySelectorAll('.tut-size-pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      tutData.maxManagers = pill.dataset.size;
      bodyEl.querySelectorAll('.tut-size-pill').forEach(function (p) { p.classList.remove('tut-size-pill--active'); });
      pill.classList.add('tut-size-pill--active');
    });
  });

  // Wire copy button
  const copyBtn = document.getElementById('tutCopyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      const code = state.leagueCode || '';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(function () { copyBtn.textContent = 'Copied!'; setTimeout(function () { copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Code'; }, 2000); });
      }
    });
  }

  if (backBtn) backBtn.style.visibility = tutStep === 0 ? 'hidden' : 'visible';
  if (nextBtn) nextBtn.textContent = tutStep === TUT_STEPS.length - 1 ? "Let's Go!" : 'Continue';
}

// ── HELPERS ───────────────────────────────────────────────
/* ══════════════════════════════════════════════════════════
   MY TEAM CARD
   Once the draft is complete the On the Clock hero has nothing left
   to say: it showed "Draft Complete" beside a stopped clock reading
   "-", plus commissioner buttons that no longer do anything, for the
   entire length of the tournament. This takes that slot instead.
══════════════════════════════════════════════════════════ */

// How many roster rows the card shows before collapsing to a count.
// Eight fits a desktop column; on a phone it would double the card's
// height and push the stat tiles off screen.
const MT_ROWS_DESKTOP = 8;
const MT_ROWS_MOBILE = 5;

// A player's live game, if one of their school's games is in progress.
function liveGameForSchool(school) {
  if (!school) return null;
  const norm = normalizeName(school);
  return liveGamesList().find(function (g) {
    if (g.state !== 'in') return false;
    const names = [g.home && g.home.school, g.away && g.away.school];
    return names.some(function (n) {
      return n && (n === school || normalizeName(n) === norm);
    });
  }) || null;
}

function renderMyTeamCard() {
  const card = document.getElementById('myTeamCard');
  const hero = document.querySelector('.home-hero-card');
  if (!card) return;

  const session = getSession();
  const me = session ? session.name : null;
  const show = isDraftComplete() && me && managerRoster(me).length > 0;

  // Only one of the two occupies the slot, never both and never neither.
  card.style.display = show ? '' : 'none';
  if (hero) hero.style.display = show ? 'none' : '';
  if (!show) return;

  const alive = getAliveTeamsInfo() || {};
  const isAlive = function (college) {
    return !!(alive[college] || alive[normalizeName(college)]);
  };

  const roster = managerRoster(me).map(function (p) {
    const game = liveGameForSchool(p.college);
    return {
      name: p.name,
      college: p.college,
      position: p.position,
      fpts: calcFPTS(p),
      alive: isAlive(p.college),
      game: game
    };
  });

  // Live first, then alive, then eliminated; points break ties inside
  // each band. Someone checking mid-game wants the guys on the floor.
  const band = function (r) { return r.game ? 0 : (r.alive ? 1 : 2); };
  roster.sort(function (a, b) { return band(a) - band(b) || b.fpts - a.fpts; });

  // Identity
  const nameEl = document.getElementById('mtName');
  if (nameEl) nameEl.textContent = me;

  const ranked = state.managers.slice().sort(function (a, b) { return managerFPTS(b) - managerFPTS(a); });
  const myRank = ranked.indexOf(me) + 1;
  const rankEl = document.getElementById('mtRank');
  if (rankEl) {
    rankEl.innerHTML = myRank > 0
      ? myRank + '<span class="mt-fig-ord">' + ordinalSuffix(myRank) + '</span>'
      : '-';
  }
  const fptsEl = document.getElementById('mtFpts');
  if (fptsEl) fptsEl.textContent = managerFPTS(me);

  // Live strip: only when something of yours is actually on the floor.
  const liveEl = document.getElementById('mtLive');
  const playing = roster.filter(function (r) { return r.game; });
  if (liveEl) {
    if (!playing.length) {
      liveEl.style.display = 'none';
      liveEl.innerHTML = '';
    } else {
      const g = playing[0].game;
      const clock = g.clock ? esc(g.clock) + ' · ' + ordinalHalf(g.period) : 'LIVE';
      const score = esc((g.away && g.away.school) || 'TBD') + ' ' + ((g.away && g.away.score) != null ? g.away.score : 0) +
        ' – ' + esc((g.home && g.home.school) || 'TBD') + ' ' + ((g.home && g.home.score) != null ? g.home.score : 0);
      liveEl.style.display = '';
      liveEl.innerHTML =
        '<span class="mt-live-dot" aria-hidden="true"></span>' +
        '<span class="mt-live-text">' + playing.length + ' playing now</span>' +
        '<span class="mt-live-game">' + score + ' · ' + clock + '</span>';
    }
  }

  // Roster rows
  const limit = window.innerWidth <= 768 ? MT_ROWS_MOBILE : MT_ROWS_DESKTOP;
  const shown = roster.slice(0, limit);
  const rosterEl = document.getElementById('mtRoster');
  if (rosterEl) {
    rosterEl.innerHTML = shown.map(function (r) {
      const status = r.game
        ? '<span class="mt-status mt-status--live">LIVE</span>'
        : (r.alive
          ? '<span class="mt-status mt-status--alive">ALIVE</span>'
          : '<span class="mt-status mt-status--out">OUT</span>');
      return '<div class="mt-row' + (r.alive ? '' : ' mt-row--out') + '">' +
        '<div class="mt-player">' +
        '<div class="mt-player-name">' + esc(r.name) + '</div>' +
        '<div class="mt-player-meta">' + esc(r.college || '') +
        (r.position ? ' · ' + esc(r.position) : '') + '</div>' +
        '</div>' +
        status +
        '<div class="mt-pts">' + r.fpts + '</div>' +
        '</div>';
    }).join('');
  }

  // Footer
  const aliveCount = roster.filter(function (r) { return r.alive; }).length;
  const hidden = roster.length - shown.length;
  const countEl = document.getElementById('mtFootCount');
  if (countEl) {
    countEl.textContent = (hidden > 0 ? hidden + ' more · ' : '') +
      aliveCount + ' of ' + roster.length + ' alive';
  }
}

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/* ══════════════════════════════════════════════════════════
   MOBILE NAV SHEET
   Nine destinations will not fit across the bottom of a phone at a
   readable size — the bar had ended up at 9px type with clipped
   labels. One trigger button opens the whole menu as a vertical
   sheet instead.

   The tradeoff, stated plainly: every navigation on mobile is now
   two taps instead of one, and the destinations are no longer
   visible at a glance. The trigger carries the current page name so
   people still know where they are.
══════════════════════════════════════════════════════════ */

const NAV_LABELS = {
  home: 'Home', players: 'Draft', teams: 'Teams', standings: 'Standings',
  bracket: 'Bracket', season: 'Season', chat: 'Chat', news: 'News',
  settings: 'Settings', profile: 'Profile'
};

let _navSheetOpen = false;

// ── Build the sheet from the sidebar ─────────────────────
//  Cloning rather than duplicating the markup means adding a page to
//  the sidebar adds it here too. The Season tab was a live reminder
//  of how easily two hand-written nav lists drift apart.
function buildNavSheet() {
  const host = document.getElementById('navSheetItems');
  if (!host) return;

  const src = document.querySelectorAll('.sidebar-nav .nav-btn[data-page]');
  host.innerHTML = '';

  src.forEach(function (btn) {
    const page = btn.dataset.page;
    const svg = btn.querySelector('svg');
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ns-item';
    item.dataset.page = page;
    item.innerHTML =
      '<span class="ns-icon">' + (svg ? svg.outerHTML : '') + '</span>' +
      '<span class="ns-label">' + esc(NAV_LABELS[page] || page) + '</span>' +
      '<svg class="ns-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="9 18 15 12 9 6" /></svg>';
    item.addEventListener('click', function () {
      closeNavSheet();
      navigateTo(page);
    });
    host.appendChild(item);
  });

  // Profile and Sign Out live in the sidebar footer, not the nav list,
  // but on mobile the sheet is the only way to reach them.
  const footer = document.createElement('div');
  footer.className = 'ns-footer';

  const prof = document.createElement('button');
  prof.type = 'button';
  prof.className = 'ns-item ns-item-sub';
  prof.innerHTML = '<span class="ns-label">View Profile</span>';
  prof.addEventListener('click', function () { closeNavSheet(); navigateTo('profile'); });

  const out = document.createElement('button');
  out.type = 'button';
  out.className = 'ns-item ns-item-sub ns-item-danger';
  out.innerHTML = '<span class="ns-label">Sign Out</span>';
  out.addEventListener('click', function () {
    closeNavSheet();
    const real = document.getElementById('navSignOutBtn');
    if (real) real.click();
  });

  footer.appendChild(prof);
  footer.appendChild(out);
  host.appendChild(footer);
}

function markNavSheetActive(page) {
  document.querySelectorAll('#navSheetItems .ns-item[data-page]').forEach(function (el) {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const label = document.getElementById('mobileNavLabel');
  if (label) label.textContent = NAV_LABELS[page] || page;
}

function openNavSheet() {
  const sheet = document.getElementById('navSheet');
  const back = document.getElementById('navSheetBackdrop');
  const btn = document.getElementById('mobileNavBtn');
  if (!sheet || !back || !btn) return;

  sheet.hidden = false;
  back.hidden = false;
  // Next frame so the transition has a start state to animate from.
  requestAnimationFrame(function () {
    sheet.classList.add('open');
    back.classList.add('open');
  });
  btn.setAttribute('aria-expanded', 'true');
  btn.classList.add('open');
  document.body.classList.add('nav-sheet-open');
  _navSheetOpen = true;
}

function closeNavSheet() {
  const sheet = document.getElementById('navSheet');
  const back = document.getElementById('navSheetBackdrop');
  const btn = document.getElementById('mobileNavBtn');
  if (!sheet || !back || !btn) return;

  sheet.classList.remove('open');
  back.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
  btn.classList.remove('open');
  document.body.classList.remove('nav-sheet-open');
  _navSheetOpen = false;

  // Wait out the slide before hiding, or it snaps shut.
  setTimeout(function () {
    if (!_navSheetOpen) { sheet.hidden = true; back.hidden = true; }
  }, 300);
}

function wireNavSheet() {
  buildNavSheet();

  const btn = document.getElementById('mobileNavBtn');
  const back = document.getElementById('navSheetBackdrop');
  if (btn) btn.addEventListener('click', function () {
    if (_navSheetOpen) closeNavSheet(); else openNavSheet();
  });
  if (back) back.addEventListener('click', closeNavSheet);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && _navSheetOpen) { closeNavSheet(); if (btn) btn.focus(); }
  });

  // Rotating to landscape can cross the breakpoint and leave a sheet
  // open over a sidebar that is visible again.
  window.addEventListener('resize', function () {
    if (window.innerWidth > 768 && _navSheetOpen) closeNavSheet();
  });

  const active = document.querySelector('.sidebar-nav .nav-btn.active');
  markNavSheetActive(active ? active.dataset.page : 'home');
}

/* ══════════════════════════════════════════════════════════
   SEASON HISTORY
   A league keeps one code and one roster of managers all season,
   re-drafting for each tournament. Everything below turns that
   sequence of one-off drafts into a season-long record.

   Season champion = most tournament titles, cumulative fantasy
   points as the tiebreak.
══════════════════════════════════════════════════════════ */

// ── Which school actually won the tournament ─────────────
//  Best effort only. Returns a school name when the bracket has a
//  single region whose final round produced exactly one winner; null
//  for multi-region formats (NCAA) or an unfinished bracket. Never
//  throws, because it runs inside the archive path.
function tournamentWinningSchool() {
  try {
    const bs = getBracketState();
    if (!bs || !bs.regions) return null;
    const names = Object.keys(bs.regions);
    if (names.length !== 1) return null;          // multi-region: no single final here
    const rounds = bs.regions[names[0]] || [];
    const last = rounds[rounds.length - 1];
    if (!last || last.length !== 1) return null;
    return last[0] || null;
  } catch (e) { return null; }
}

// ── Freeze the current tournament into the season record ──
//  Called when a tournament is closed out, or when the commissioner
//  switches away from one that had picks. Keyed by tournament id, so
//  re-archiving the same event replaces its entry rather than
//  creating a duplicate — that makes it safe to call more than once.
//
//  Rosters are stored by value, not by player id. Player ids are
//  stable but data/players.js gets regenerated between events, and a
//  season record that silently loses a player when the file changes
//  is worse than no record at all.
function archiveTournamentResult(tournament) {
  const t = tournament || state.selectedTournament;
  if (!t || !t.id) return null;

  const managers = (state.managers || []).filter(Boolean);
  if (!managers.length) return null;

  const picks = Object.keys(state.drafted || {}).length;
  if (!picks) return null;                        // nothing happened; nothing to record

  const results = managers.map(function (m) {
    return {
      manager: m,
      fpts: managerFPTS(m),
      cats: {
        pts: calcManagerCat(m, 'points'),
        reb: calcManagerCat(m, 'rebounds'),
        ast: calcManagerCat(m, 'assists'),
        stl: calcManagerCat(m, 'steals'),
        blk: calcManagerCat(m, 'blocks')
      },
      roster: managerRoster(m).map(function (p) {
        return {
          id: p.id, name: p.name, college: p.college,
          position: p.position, fpts: calcFPTS(p)
        };
      })
    };
  }).sort(function (a, b) { return b.fpts - a.fpts; });

  results.forEach(function (r, i) { r.rank = i + 1; });

  const record = {
    tournamentId: t.id,
    tournamentName: t.name || t.id,
    dates: t.dates || '',
    location: t.location || '',
    completedAt: Date.now(),
    champion: results[0] ? results[0].manager : null,
    championFpts: results[0] ? results[0].fpts : 0,
    winningSchool: tournamentWinningSchool(),
    picksMade: picks,
    results: results
  };

  if (!state.seasonHistory || typeof state.seasonHistory !== 'object' ||
      Array.isArray(state.seasonHistory)) {
    state.seasonHistory = {};                     // repair old/corrupt shapes
  }
  state.seasonHistory[t.id] = record;

  addActivity(record.champion
    ? esc(record.champion) + ' wins ' + esc(record.tournamentName) + ' (' + record.championFpts + ' FPTS)'
    : esc(record.tournamentName) + ' closed out');

  try {
    track('tournament_completed', {
      tournament: t.id,
      managers: managers.length,
      picks: picks
    });
  } catch (e) { }

  return record;
}

// ── Completed tournaments, newest first ──────────────────
function seasonRecords() {
  const h = state.seasonHistory;
  if (!h || typeof h !== 'object' || Array.isArray(h)) return [];
  return Object.keys(h)
    .map(function (k) { return h[k]; })
    .filter(function (r) { return r && r.tournamentId; })
    .sort(function (a, b) { return (b.completedAt || 0) - (a.completedAt || 0); });
}

// ── Season standings ─────────────────────────────────────
//  Titles first, cumulative points as the tiebreak.
//
//  Built from everyone who appears in ANY archived tournament, unioned
//  with the current roster. A manager who played the November events
//  and then left the league still keeps their titles; someone who
//  joined in December shows up with zero rather than being absent.
function seasonStandings() {
  const recs = seasonRecords();
  const agg = {};

  function slot(name) {
    if (!agg[name]) {
      agg[name] = {
        manager: name, titles: 0, podiums: 0, events: 0,
        fpts: 0, best: null, finishes: []
      };
    }
    return agg[name];
  }

  (state.managers || []).filter(Boolean).forEach(slot);

  recs.forEach(function (r) {
    (r.results || []).forEach(function (row) {
      const a = slot(row.manager);
      a.events += 1;
      a.fpts += row.fpts || 0;
      a.finishes.push(row.rank);
      if (row.rank === 1) a.titles += 1;
      if (row.rank <= 3) a.podiums += 1;
      if (a.best === null || row.rank < a.best) a.best = row.rank;
    });
  });

  return Object.keys(agg).map(function (k) {
    const a = agg[k];
    a.fpts = Math.round(a.fpts * 10) / 10;
    a.avgFinish = a.finishes.length
      ? Math.round((a.finishes.reduce(function (s, n) { return s + n; }, 0) / a.finishes.length) * 10) / 10
      : null;
    return a;
  }).sort(function (a, b) {
    if (b.titles !== a.titles) return b.titles - a.titles;
    return b.fpts - a.fpts;
  });
}

// ── Commissioner: close out the current tournament ───────
//  The explicit path. Switching tournaments archives automatically,
//  but a league that plays one event and stops would otherwise never
//  record it.
function closeOutTournament() {
  if (!isCommissioner()) { toast('Only the commissioner can close out a tournament.', 'error'); return; }
  const t = state.selectedTournament;
  if (!t) { toast('No tournament selected.', 'error'); return; }
  if (!Object.keys(state.drafted || {}).length) { toast('No picks have been made yet.', 'error'); return; }

  const already = state.seasonHistory && state.seasonHistory[t.id];
  const ok = confirm(
    (already ? 'Re-record ' : 'Close out ') + t.name + '?\n\n' +
    'Final standings and every roster are saved to Season History' +
    (already ? ', replacing the result already on file.' : '.') + '\n\n' +
    'The draft stays exactly as it is. Nothing is deleted.'
  );
  if (!ok) return;

  const rec = archiveTournamentResult(t);
  if (!rec) { toast('Nothing to record yet.', 'error'); return; }

  saveState();
  render();
  toast(rec.champion
    ? rec.champion + ' wins ' + rec.tournamentName + '.'
    : rec.tournamentName + ' recorded.', 'success');
  navigateTo('season');
}

// ── Season page ──────────────────────────────────────────
function renderSeason() {
  const wrap = document.getElementById('seasonPage');
  if (!wrap) return;

  const standingsEl = wrap.querySelector('#seasonStandingsList');
  const caseEl = wrap.querySelector('#seasonTrophyCase');
  const metaEl = wrap.querySelector('#seasonMeta');
  const recs = seasonRecords();
  const session = getSession();
  const me = session ? session.name : null;

  if (metaEl) {
    metaEl.textContent = recs.length
      ? recs.length + ' tournament' + (recs.length === 1 ? '' : 's') + ' completed'
      : 'No tournaments completed yet';
  }

  // ── Hide furniture that has nothing to describe ─────────
  //  Column headers above an empty table, and a "Trophy Case"
  //  heading over blank space, both read as something failing to
  //  load. An empty page should look deliberate.
  const empty = !recs.length;
  const hdr = wrap.querySelector('.season-standings-header');
  if (hdr) hdr.style.display = empty ? 'none' : '';
  const caseTitle = wrap.querySelector('.season-section-title');
  if (caseTitle) caseTitle.style.display = empty ? 'none' : '';
  const table = wrap.querySelector('.season-table');
  if (table) table.classList.toggle('is-empty', empty);

  // ── Season standings ───────────────────────────────────
  if (standingsEl) {
    if (!recs.length) {
      standingsEl.innerHTML =
        '<div class="season-empty">' +
        '<div class="season-empty-icon">&#127942;</div>' +
        '<h4>Your season starts with the first tournament</h4>' +
        '<p>Finish a draft, then have the commissioner close out the tournament. ' +
        'The champion and every roster get saved here for the rest of the season.</p>' +
        '</div>';
    } else {
      const rows = seasonStandings();
      const medal = ['rank-gold', 'rank-silver', 'rank-bronze'];
      standingsEl.innerHTML = rows.map(function (r, i) {
        const badge = i < 3
          ? '<span class="rank-medal ' + medal[i] + '">' + (i + 1) + '</span>'
          : '<span class="rank-num">' + (i + 1) + '</span>';
        const trophies = r.titles > 0
          ? '<span class="season-trophies" title="' + r.titles + ' title' + (r.titles === 1 ? '' : 's') + '">' +
            new Array(Math.min(r.titles, 5) + 1).join('&#127942;') +
            (r.titles > 5 ? ' x' + r.titles : '') + '</span>'
          : '<span class="season-trophies season-trophies-none">-</span>';
        return '<div class="season-row' + (r.manager === me ? ' current-user' : '') + '">' +
          '<span class="sr-rank">' + badge + '</span>' +
          '<span class="sr-name">' + esc(r.manager) + '</span>' +
          '<span class="ss-trophies ss-hide-sm">' + trophies + '</span>' +
          '<span class="ss-num">' + r.titles + '</span>' +
          '<span class="ss-num ss-hide-sm">' + r.podiums + '</span>' +
          '<span class="ss-num">' + r.events + '</span>' +
          '<span class="ss-num ss-pts">' + r.fpts + '</span>' +
          '<span class="ss-num ss-hide-sm">' + (r.avgFinish === null ? '-' : r.avgFinish) + '</span>' +
          '</div>';
      }).join('');
    }
  }

  // ── Trophy case ────────────────────────────────────────
  if (caseEl) {
    caseEl.innerHTML = recs.map(function (r) {
      const podium = (r.results || []).slice(0, 3).map(function (row, i) {
        return '<div class="tc-podium-row tc-p' + (i + 1) + '">' +
          '<span class="tc-pos">' + (i + 1) + '</span>' +
          '<span class="tc-mgr">' + esc(row.manager) + '</span>' +
          '<span class="tc-fpts">' + row.fpts + '</span>' +
          '</div>';
      }).join('');

      const full = (r.results || []).map(function (row) {
        const roster = (row.roster || []).map(function (p) {
          return '<li><span class="tc-pl-name">' + esc(p.name) + '</span>' +
            '<span class="tc-pl-team">' + esc(p.college || '') + '</span>' +
            '<span class="tc-pl-fpts">' + p.fpts + '</span></li>';
        }).join('');
        return '<div class="tc-full-row">' +
          '<div class="tc-full-head"><span class="tc-full-rank">' + row.rank + '</span>' +
          '<span class="tc-full-mgr">' + esc(row.manager) + '</span>' +
          '<span class="tc-full-fpts">' + row.fpts + ' FPTS</span></div>' +
          (roster ? '<ul class="tc-roster">' + roster + '</ul>' : '') +
          '</div>';
      }).join('');

      return '<article class="trophy-card" data-tid="' + esc(r.tournamentId) + '">' +
        '<header class="tc-head">' +
        '<div class="tc-title"><h4>' + esc(r.tournamentName) + '</h4>' +
        '<span class="tc-dates">' + esc(r.dates || '') + '</span></div>' +
        (r.winningSchool ? '<span class="tc-school" title="Tournament winner">' + esc(r.winningSchool) + '</span>' : '') +
        '</header>' +
        '<div class="tc-champ">' +
        '<span class="tc-champ-icon">&#127942;</span>' +
        '<div><span class="tc-champ-label">Champion</span>' +
        '<span class="tc-champ-name">' + esc(r.champion || '--') + '</span></div>' +
        '<span class="tc-champ-fpts">' + r.championFpts + '<small>FPTS</small></span>' +
        '</div>' +
        '<div class="tc-podium">' + podium + '</div>' +
        '<button class="tc-toggle" type="button">Full results &amp; rosters</button>' +
        '<div class="tc-full" hidden>' + full + '</div>' +
        '</article>';
    }).join('');

    caseEl.querySelectorAll('.tc-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const panel = btn.parentElement.querySelector('.tc-full');
        if (!panel) return;
        const open = !panel.hidden;
        panel.hidden = open;
        btn.textContent = open ? 'Full results & rosters' : 'Hide results';
        btn.classList.toggle('open', !open);
      });
    });
  }

  // ── Close-out button, commissioner only ────────────────
  const closeBtn = wrap.querySelector('#closeOutBtn');
  if (closeBtn) {
    const t = state.selectedTournament;
    const picks = Object.keys(state.drafted || {}).length;
    const show = isCommissioner() && t && picks > 0;
    closeBtn.style.display = show ? '' : 'none';
    if (show) {
      const done = state.seasonHistory && state.seasonHistory[t.id];
      closeBtn.textContent = done ? 'Re-record ' + t.name : 'Close out ' + t.name;
    }
  }
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── SCHEDULED DRAFT ───────────────────────────────────────
function formatScheduledTime(ms) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function countdownText(ms) {
  let diff = ms - Date.now();
  if (diff <= 0) return 'Starting now';
  const d = Math.floor(diff / 86400000); diff -= d * 86400000;
  const h = Math.floor(diff / 3600000); diff -= h * 3600000;
  const m = Math.floor(diff / 60000); diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
  if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

function renderDraftSchedule() {
  const cur = document.getElementById('sdCurrent');
  const timeEl = document.getElementById('sdCurrentTime');
  const cdEl = document.getElementById('sdCountdown');
  const saveBtn = document.getElementById('sdSaveBtn');
  if (!cur) return;

  const at = state.draftScheduledAt;
  if (at) {
    cur.style.display = 'flex';
    if (timeEl) timeEl.textContent = formatScheduledTime(at);
    if (cdEl) cdEl.textContent = countdownText(at);
    if (saveBtn) saveBtn.textContent = 'Update Schedule';

    // Prefill the inputs with the current schedule (only when untouched)
    const dIn = document.getElementById('sdDateInput');
    const tIn = document.getElementById('sdTimeInput');
    const d = new Date(at);
    const pad = function (n) { return String(n).padStart(2, '0'); };
    if (dIn && !dIn.value) dIn.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    if (tIn && !tIn.value) tIn.value = pad(d.getHours()) + ':' + pad(d.getMinutes());
  } else {
    cur.style.display = 'none';
    if (saveBtn) saveBtn.textContent = 'Schedule Draft';
  }

  // Home banner countdown
  const banner = document.getElementById('draftCountdownBanner');
  if (banner) {
    if (at && !state.timerRunning && !isDraftComplete()) {
      banner.style.display = 'flex';
      const bt = document.getElementById('dcbTime');
      const bc = document.getElementById('dcbCountdown');
      if (bt) bt.textContent = formatScheduledTime(at);
      if (bc) bc.textContent = countdownText(at);
      banner.classList.toggle('dcb-live', Date.now() >= at);
    } else {
      banner.style.display = 'none';
    }
  }
}

function saveDraftSchedule() {
  track('draft_scheduled', { managers: (state.managers || []).length });
  const dateEl = document.getElementById('sdDateInput');
  const timeEl = document.getElementById('sdTimeInput');
  if (!dateEl || !timeEl) return;
  if (!dateEl.value || !timeEl.value) {
    toast('Pick both a date and a time.', 'error');
    return;
  }
  const ms = new Date(dateEl.value + 'T' + timeEl.value).getTime();
  if (isNaN(ms)) { toast('That date/time looks invalid.', 'error'); return; }
  if (ms <= Date.now()) { toast('Pick a time in the future.', 'error'); return; }

  state.draftScheduledAt = ms;
  saveState();
  renderDraftSchedule();
  addActivity('Draft scheduled for ' + formatScheduledTime(ms));
  toast('Draft scheduled for ' + formatScheduledTime(ms), 'success');
}

function clearDraftSchedule() {
  state.draftScheduledAt = null;
  saveState();
  renderDraftSchedule();
  toast('Draft schedule cleared.', 'info');
}

// Tick the countdowns once per second
let _scheduleTick = null;
function startScheduleTicker() {
  if (_scheduleTick) return;
  _scheduleTick = setInterval(function () {
    if (state.draftScheduledAt) renderDraftSchedule();
  }, 1000);
}

// ── NEWS ──────────────────────────────────────────────────
const NEWS_API = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/news?limit=50';

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  return d + 'd ago';
}

function getActiveTeamNames() {
  const t = state.selectedTournament;
  if (!t || !t.teams || t.teams.length === 0) return null;
  return t.teams.map(function (name) { return name.toLowerCase(); });
}

function articleMatchesTournament(article, teamNames) {
  if (!teamNames) return true;
  // Build a haystack from headline, description, and category descriptions
  const cats = (article.categories || []).map(function (c) { return c.description || ''; }).join(' ');
  const haystack = [
    article.headline || '',
    article.description || '',
    cats
  ].join(' ').toLowerCase();
  return teamNames.some(function (t) { return haystack.includes(t); });
}

function articleTeamTag(article) {
  // Pick the first "team" category if available, else first category, else "CBB"
  var cats = article.categories || [];
  var teamCat = cats.find(function (c) { return c.type === 'team'; });
  if (teamCat && teamCat.shortName) return teamCat.shortName;
  if (teamCat && teamCat.description) return teamCat.description.split(' ').slice(-1)[0]; // last word = school name
  var leagueCat = cats.find(function (c) { return c.type === 'league'; });
  if (leagueCat && leagueCat.shortName) return leagueCat.shortName;
  return 'CBB';
}

function renderFeaturedCard(article) {
  const title = esc(article.headline || 'Untitled');
  const desc = article.description || '';
  const body = esc(desc.slice(0, 220)) + (desc.length > 220 ? '…' : '');
  const tag = esc(articleTeamTag(article));
  const time = relativeTime(article.lastModified || article.published);
  const url = (article.links && article.links.web && article.links.web.href) || '#';
  const img = article.images && article.images[0] && article.images[0].url;

  return '<a class="news-featured" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
    (img ? '<div class="news-featured-img-wrap"><img class="news-featured-img" src="' + esc(img) + '" alt="" loading="lazy"><span class="news-featured-badge">Top Story</span></div>' : '') +
    '<div class="news-featured-content">' +
    '<div class="news-card-meta">' +
    '<span class="news-card-tag">' + tag + '</span>' +
    '<span class="news-card-time">' + time + '</span>' +
    '</div>' +
    '<div class="news-featured-title">' + title + '</div>' +
    '<div class="news-featured-body">' + body + '</div>' +
    '</div>' +
    '</a>';
}

function renderNewsCard(article) {
  const title = esc(article.headline || 'Untitled');
  const tag = esc(articleTeamTag(article));
  const time = relativeTime(article.lastModified || article.published);
  const url = (article.links && article.links.web && article.links.web.href) || '#';
  const img = article.images && article.images[0] && article.images[0].url;

  return '<a class="news-card" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
    (img ? '<img class="news-card-img" src="' + esc(img) + '" alt="" loading="lazy">' : '<div class="news-card-img news-card-img--placeholder"></div>') +
    '<div class="news-card-content">' +
    '<div class="news-card-meta">' +
    '<span class="news-card-tag">' + tag + '</span>' +
    '<span class="news-card-time">' + time + '</span>' +
    '</div>' +
    '<div class="news-card-title">' + title + '</div>' +
    '</div>' +
    '</a>';
}

var _newsCache = null;
var _newsFetching = false;

function renderNews(forceRefresh) {
  var feed = document.getElementById('newsFeed');
  var refreshBtn = document.getElementById('newsRefreshBtn');

  if (!feed) return;

  // Wire refresh button (idempotent)
  if (refreshBtn && !refreshBtn._newsWired) {
    refreshBtn._newsWired = true;
    refreshBtn.addEventListener('click', function () { renderNews(true); });
  }

  // No subtitle. The feed is league-wide college basketball, so
  // labelling it with the league's selected tournament promised a
  // filter that was never applied — a Maui league saw Maui in the
  // header and DePaul coaching news underneath.

  // Use cache unless forced
  if (_newsCache && !forceRefresh) {
    displayNewsArticles(_newsCache, feed);
    return;
  }

  if (_newsFetching) return;
  _newsFetching = true;

  // Show loading
  feed.innerHTML = '<div class="news-loading"><div class="news-spinner"></div><span>Loading news…</span></div>';

  fetch(NEWS_API)
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      _newsFetching = false;
      var articles = data.articles || [];
      _newsCache = articles;
      displayNewsArticles(articles, feed);
    })
    .catch(function (err) {
      _newsFetching = false;
      feed.innerHTML = '<div class="news-empty"><p>Could not load news.</p><p style="font-size:0.8em;opacity:0.6;">' + esc(err.message) + '</p></div>';
    });
}

function displayNewsArticles(articles, feed) {
  var teamNames = getActiveTeamNames();
  var filtered = articles.filter(function (a) {
    return articleMatchesTournament(a, teamNames);
  });

  // Sort newest first
  filtered.sort(function (a, b) {
    return new Date(b.lastModified || b.published || 0) - new Date(a.lastModified || a.published || 0);
  });

  if (filtered.length === 0) {
    var msg = teamNames
      ? 'No news found for your tournament teams. Try refreshing or selecting a different tournament.'
      : 'No news available right now.';
    feed.innerHTML = '<div class="news-empty"><p>' + msg + '</p></div>';
    return;
  }

  // First article is featured, the rest are compact rows
  var html = renderFeaturedCard(filtered[0]);
  if (filtered.length > 1) {
    html += '<div class="news-list">' + filtered.slice(1).map(renderNewsCard).join('') + '</div>';
  }
  feed.innerHTML = html;
}

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Init state players
  if (!state.players || state.players.length === 0) {
    state.players = poolForCurrentTournament();
  }

  // Auth
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  if (loginSubmitBtn) loginSubmitBtn.addEventListener('click', handleLogin);
  document.getElementById('loginPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  document.getElementById('loginEmail')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  document.getElementById('showSignupLink')?.addEventListener('click', e => { e.preventDefault(); showSignup(); });
  document.getElementById('showLoginLink')?.addEventListener('click', e => { e.preventDefault(); showLogin(); });
  document.getElementById('signupSubmitBtn')?.addEventListener('click', handleSignup);

  // ── PASSWORD SHOW/HIDE TOGGLES ────────────────────────────
  document.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.querySelector('.eye-open').style.display = showing ? 'block' : 'none';
      btn.querySelector('.eye-closed').style.display = showing ? 'none' : 'block';
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });

  // ── TERMS OF SERVICE ──────────────────────────────────────
  const tosCheckbox = document.getElementById('tosCheckbox');
  const tosSubmitBtn = document.getElementById('signupSubmitBtn');
  const tosModal = document.getElementById('tosModal');
  if (tosCheckbox && tosSubmitBtn) {
    tosCheckbox.addEventListener('change', function () {
      tosSubmitBtn.disabled = !this.checked;
    });
  }
  document.getElementById('openTosBtn')?.addEventListener('click', function (e) {
    e.preventDefault();
    if (tosModal) tosModal.style.display = 'flex';
  });
  document.getElementById('closeTosBtn')?.addEventListener('click', function () {
    if (tosModal) tosModal.style.display = 'none';
  });
  document.getElementById('tosDeclineBtn')?.addEventListener('click', function () {
    if (tosCheckbox) tosCheckbox.checked = false;
    if (tosSubmitBtn) tosSubmitBtn.disabled = true;
    if (tosModal) tosModal.style.display = 'none';
  });
  document.getElementById('tosAcceptBtn')?.addEventListener('click', function () {
    if (tosCheckbox) { tosCheckbox.checked = true; tosSubmitBtn.disabled = false; }
    if (tosModal) tosModal.style.display = 'none';
  });
  // Close on backdrop click
  tosModal?.addEventListener('click', function (e) {
    if (e.target === tosModal) tosModal.style.display = 'none';
  });
  function doSignOut() {
    if (_leagueUnsubscribe) { _leagueUnsubscribe(); _leagueUnsubscribe = null; }
    if (window._auth && window._auth.currentUser) {
      window._auth.signOut().catch(e => console.warn('[Auth] signOut error:', e));
    }
    clearSession();
    state = freshState();
    state.players = poolForCurrentTournament();
    showLanding();
  }
  document.getElementById('signOutBtn')?.addEventListener('click', doSignOut);
  document.getElementById('navSignOutBtn')?.addEventListener('click', doSignOut);
  document.getElementById('splashBackBtn')?.addEventListener('click', showLanding);

  // Splash
  document.getElementById('createLeagueSplashBtn')?.addEventListener('click', () => {
    createLeague();
    enterLeague();
    // Show tutorial after LEO
    setTimeout(() => { try { showTutorial(); } catch (e) { console.error(e); } }, 1250);
  });
  document.getElementById('joinLeagueSplashBtn')?.addEventListener('click', () => {
    document.getElementById('joinModal').style.display = 'flex';
  });
  document.getElementById('joinCancelBtn')?.addEventListener('click', () => {
    document.getElementById('joinModal').style.display = 'none';
  });
  document.getElementById('joinConfirmBtn')?.addEventListener('click', handleJoin);

  // Nav
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Season: commissioner close-out. Bound once here rather than in
  // renderSeason, which reruns on every navigation and would stack
  // duplicate listeners (and fire the confirm dialog N times).
  const _closeOut = document.getElementById('closeOutBtn');
  if (_closeOut) _closeOut.addEventListener('click', closeOutTournament);

  try { wireNavSheet(); } catch (e) { console.warn('wireNavSheet', e); }

  const _mtLink = document.getElementById('mtFootLink');
  if (_mtLink) _mtLink.addEventListener('click', function () { navigateTo('teams'); });

  // The card shows 8 rows on a desktop and 5 on a phone, so crossing
  // the breakpoint has to re-render or the count stays wrong.
  let _mtWide = window.innerWidth > 768;
  window.addEventListener('resize', function () {
    const wide = window.innerWidth > 768;
    if (wide === _mtWide) return;
    _mtWide = wide;
    try { renderMyTeamCard(); } catch (e) { }
  });

  // Home grid cards
  document.querySelectorAll('.home-card[data-page]').forEach(card => {
    card.addEventListener('click', () => navigateTo(card.dataset.page));
  });

  // Timer buttons
  document.getElementById('startTimerBtnHome')?.addEventListener('click', startTimer);
  document.getElementById('pauseBtnHome')?.addEventListener('click', pauseTimer);
  document.getElementById('resetTimerBtn')?.addEventListener('click', resetTimer);
  document.getElementById('startTimerBtnDraft')?.addEventListener('click', startTimer);
  document.getElementById('pauseBtnDraft')?.addEventListener('click', pauseTimer);
  document.getElementById('resetTimerBtnDraft')?.addEventListener('click', resetTimer);

  // Init draft setup panel interactions
  initDraftSetup();

  // Draft setup (Settings panel)
  document.getElementById('setupSaveBtn')?.addEventListener('click', () => {
    const picksExist = Object.keys(state.drafted).length > 0;
    if (picksExist && !confirm('Saving a new draft order will clear all current picks. Continue?')) return;
    const name = document.getElementById('setupLeagueName')?.value.trim();
    const mgrs = (window._dsManagers || []).filter(Boolean);
    const rounds = parseInt(document.getElementById('setupRounds')?.value) || 8;
    if (name) state.leagueName = name;
    if (mgrs.length) {
      if (!mgrs.includes(state.commissioner)) mgrs.unshift(state.commissioner);
      state.managers = mgrs;
    }
    state.rounds = rounds;
    state.currentPickIndex = 0;
    state.drafted = {};
    addActivity('Draft setup saved: ' + state.managers.length + ' managers, ' + rounds + ' rounds');
    saveState();
    render();
    toast('Draft setup saved!', 'success');
  });

  // Setup inputs - mark dirty on change so render won't overwrite
  ['setupLeagueName'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', e => { e.target.dataset.dirty = '1'; });
  });
  ['settingsEditLeagueName'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', e => { e.target.dataset.dirty = '1'; });
  });

  // Draft toolbar
  document.getElementById('draftSearch')?.addEventListener('input', renderDraftGrid);
  document.getElementById('draftPosFilter')?.addEventListener('change', renderDraftGrid);

  // Draft room pool header sorting
  document.getElementById('draftRoomPoolHeader')?.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (poolSortCol === col) poolSortDir = poolSortDir === 'desc' ? 'asc' : 'desc';
      else { poolSortCol = col; poolSortDir = 'desc'; }
      document.querySelectorAll('#draftRoomPoolHeader .ph-stat').forEach(el => el.classList.remove('sort-active'));
      th.classList.add('sort-active');
      renderDraftGrid();
    });
  });

  // Player pool tab sorting (independent sort state)
  document.getElementById('playerPoolHeader')?.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (playerPoolSortCol === col) playerPoolSortDir = playerPoolSortDir === 'desc' ? 'asc' : 'desc';
      else { playerPoolSortCol = col; playerPoolSortDir = 'desc'; }
      document.querySelectorAll('#playerPoolHeader .ph-stat').forEach(el => el.classList.remove('sort-active'));
      th.classList.add('sort-active');
      renderPlayerPool();
    });
  });

  // Draft confirm modal
  document.getElementById('confirmPickBtn')?.addEventListener('click', confirmDraftPick);
  document.getElementById('confirmCancelBtn')?.addEventListener('click', () => {
    document.getElementById('draftConfirmModal').style.display = 'none';
    pendingPickPlayerId = null;
  });

  // Commissioner draft controls
  document.getElementById('autopickBtn')?.addEventListener('click', () => {
    autoPickForCurrent();
    toast('Autopick triggered', 'info');
  });
  document.getElementById('skipPickBtn')?.addEventListener('click', () => {
    const pick = currentPick();
    if (!pick) return;
    addActivity(esc(pick.manager) + ' skipped ' + esc(pick.label));
    state.currentPickIndex++;
    if (isDraftComplete()) {
      clearInterval(timerInterval);
      state.timerRunning = false;
      state.pickTimerStartedAt = null;
    } else if (state.timerRunning) {
      state.pickTimerStartedAt = Date.now();
    }
    saveState();
    render();
    toast(pick.manager + "'s pick skipped", 'info');
  });
  document.getElementById('resetDraftBtn')?.addEventListener('click', () => {
    if (!confirm('Reset the draft? All picks will be cleared.')) return;
    state.drafted = {};
    state.currentPickIndex = 0;
    state.timerRunning = false;
    state.pickTimerStartedAt = null;
    clearInterval(timerInterval);
    addActivity('↺ Commissioner reset the draft');
    saveState();
    render();
    toast('Draft reset', 'info');
  });

  // Player pool: re-render whichever view is active
  function refreshPlayerPool() {
    const cardGrid = document.getElementById('playerCardGrid');
    if (cardGrid && cardGrid.classList.contains('active')) {
      renderPlayerCardGrid();
    } else {
      renderPlayerPool();
    }
  }
  document.getElementById('poolSearch')?.addEventListener('input', refreshPlayerPool);
  document.getElementById('poolSeedFilter')?.addEventListener('change', refreshPlayerPool);
  document.getElementById('poolSortSelect')?.addEventListener('change', refreshPlayerPool);

  // PDC close
  document.getElementById('pdcClose')?.addEventListener('click', closePDC);
  document.getElementById('gmClose')?.addEventListener('click', closeGameModal);
  document.getElementById('gameModal')?.addEventListener('click', function (e) { if (e.target.id === 'gameModal') closeGameModal(); });

  // Team selector. Delegated off the scoreboard so it survives the
  // modal being rebuilt, and keyboard-navigable like a real tablist.
  document.querySelector('.gm-scoreboard')?.addEventListener('click', function (e) {
    const tab = e.target.closest('[data-gm-tab]');
    if (tab) setGameModalTeam(tab.dataset.gmTab);
  });
  document.querySelector('.gm-scoreboard')?.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = e.key === 'ArrowRight' ? 'bot' : 'top';
    setGameModalTeam(next);
    document.getElementById(next === 'bot' ? 'gmBotTab' : 'gmTopTab')?.focus();
  });
  document.getElementById('pdcOverlay')?.addEventListener('click', e => { if (e.target.id === 'pdcOverlay') closePDC(); });
  // Standings simulate + reset
  // Show/hide simulate + reset based on whether live stats are flowing

  // Draft undo
  document.getElementById('undoPickBtn')?.addEventListener('click', undoLastPick);

  // Bracket view toggle
  const bvtYour = document.getElementById('bvtYourBracket');
  const bvtTourn = document.getElementById('bvtTournaments');
  const yourBracketView = document.getElementById('yourBracketView');
  const tournamentsView = document.getElementById('tournamentsView');
  if (bvtYour && bvtTourn) {
    bvtYour.addEventListener('click', function () {
      bvtYour.classList.add('active');
      bvtTourn.classList.remove('active');
      yourBracketView.style.display = '';
      tournamentsView.style.display = 'none';
    });
    bvtTourn.addEventListener('click', function () {
      bvtTourn.classList.add('active');
      bvtYour.classList.remove('active');
      tournamentsView.style.display = '';
      yourBracketView.style.display = 'none';
      renderTournaments();
    });
  }

  // Bracket tabs (static fallback, updateBracketTabs() rewires dynamically)
  document.querySelectorAll('.bracket-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.bracket-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderBracket();
    });
  });

  // Tournament selector modal
  document.getElementById('tsmClose')?.addEventListener('click', function () {
    const modal = document.getElementById('tournamentSelectModal');
    if (modal) modal.style.display = 'none';
  });
  document.getElementById('tournamentSelectModal')?.addEventListener('click', function (e) {
    if (e.target === this) this.style.display = 'none';
  });

  // Bracket preview modal
  document.getElementById('bpmClose')?.addEventListener('click', closeBracketPreview);
  document.getElementById('bracketPreviewModal')?.addEventListener('click', function (e) {
    if (e.target === this) closeBracketPreview();
  });

  // Settings
  document.getElementById('saveScoringBtn')?.addEventListener('click', () => {
    // League rules belong to the commissioner. Previously any manager
    // could reweight scoring mid-draft, which silently rewrote every
    // score in the league.
    if (!isCommissioner()) { toast('Only the commissioner can change scoring.', 'error'); return; }
    const draftStarted = state.currentPickIndex > 0;
    if (draftStarted && !confirm('Changing scoring mid-draft will recalculate all FPTS values retroactively. Continue?')) return;
    const cats = ['points', 'rebounds', 'assists', 'steals', 'blocks'];
    state.scoring.active = cats.filter(c => document.getElementById(c + 'Toggle')?.checked);
    cats.forEach(c => {
      const wt = parseFloat(document.getElementById(c + 'Weight')?.value);
      if (!isNaN(wt)) state.scoring.weights[c] = wt;
    });
    // Settings changes go in the activity feed. Without a record, a
    // commissioner can quietly double the weight on blocks after
    // drafting two centers and nobody ever sees it.
    addActivity('Commissioner updated scoring: ' +
      state.scoring.active.map(c => c.toUpperCase().slice(0, 3) + ' ×' + state.scoring.weights[c]).join(', '));
    saveState();
    render();
    toast('Scoring saved!', 'success');
  });
  document.getElementById('saveTimerBtn')?.addEventListener('click', () => {
    if (!isCommissioner()) { toast('Only the commissioner can change the pick timer.', 'error'); return; }
    const m = parseInt(document.getElementById('timerMinutes')?.value) || 0;
    const s = parseInt(document.getElementById('timerSeconds')?.value) || 0;
    state.pickTimerSeconds = m * 60 + s;
    state.timerRunning = false;
    state.pickTimerStartedAt = null;
    clearInterval(timerInterval);
    saveState();
    toast('Timer set to ' + formatTimer(state.pickTimerSeconds), 'success');
  });
  document.getElementById('copyCodeBtn')?.addEventListener('click', () => {
    if (navigator.clipboard && state.leagueCode) {
      navigator.clipboard.writeText(state.leagueCode).then(() => toast('Code copied!', 'success'));
    }
  });
  document.getElementById('shareInviteBtn')?.addEventListener('click', shareInviteLink);
  document.getElementById('saveLeagueNameBtn')?.addEventListener('click', () => {
    const newName = document.getElementById('settingsEditLeagueName')?.value.trim();
    if (newName) {
      state.leagueName = newName;
      document.getElementById('settingsEditLeagueName').dataset.dirty = '';
      addActivity('League renamed to ' + newName);
      saveState();
      render();
      toast('League name updated!', 'success');
    }
  });
  // Restart league
  document.getElementById('restartLeagueBtn')?.addEventListener('click', () => {
    document.getElementById('restartModal').style.display = 'flex';
  });
  document.getElementById('restartCancelBtn')?.addEventListener('click', () => {
    document.getElementById('restartModal').style.display = 'none';
  });
  document.getElementById('restartConfirmBtn')?.addEventListener('click', () => {
    document.getElementById('restartModal').style.display = 'none';
    // Reset only draft state; keep managers, settings, league identity
    state.drafted = {};
    state.currentPickIndex = 0;
    state.timerRunning = false;
    state.pickTimerStartedAt = null;
    state.prevRankings = [];
    state.activityFeed = [];
    // Reset player stats back to data file defaults
    state.players = poolForCurrentTournament();
    clearInterval(timerInterval);
    addActivity('League restarted: draft reset by commissioner');
    saveState();
    render();
    navigateTo('home');
    toast('League restarted! Ready to draft again.', 'success');
  });

  document.getElementById('dissolveLeagueBtn')?.addEventListener('click', () => {
    document.getElementById('dissolveModal').style.display = 'flex';
  });
  document.getElementById('dissolveCancelBtn')?.addEventListener('click', () => {
    document.getElementById('dissolveModal').style.display = 'none';
  });
  // ── Delete league ────────────────────────────────────────
  //  This used to clear localStorage and nothing else, which made the
  //  button's promise ("permanently delete the league and all draft
  //  data") false in three separate ways:
  //    1. The users/{uid}.leagues entry survived, so the deleted
  //       league kept appearing in My Leagues forever.
  //    2. The leagues/{code} document survived, so every other
  //       manager still had the league intact and anyone with the
  //       code could rejoin and resurrect it.
  //    3. The Firestore snapshot listener kept running against a
  //       league this client had supposedly left.
  document.getElementById('dissolveConfirmBtn')?.addEventListener('click', async () => {
    const code = state.leagueCode;
    const leagueId = state.leagueId;

    if (!isCommissioner()) {
      toast('Only the commissioner can delete the league.', 'error');
      document.getElementById('dissolveModal').style.display = 'none';
      return;
    }

    // Stop listening before the document disappears.
    if (_leagueUnsubscribe) { _leagueUnsubscribe(); _leagueUnsubscribe = null; }

    // Remote first: if this fails the user should know the league is
    // still out there rather than silently losing only their own copy.
    if (code) {
      try { await forgetLeagueMembership(code); }
      catch (e) { console.warn('[Delete] membership removal failed:', e.message); }

      if (window._db) {
        try {
          await window._db.collection('leagues').doc(code).delete();
        } catch (e) {
          console.warn('[Delete] league doc delete failed:', e.message);
          toast('Removed locally, but the league could not be deleted from the server.', 'error');
        }
      }
    }

    if (leagueId) {
      localStorage.removeItem('mmfantasy-state');
      localStorage.removeItem('mmfantasy-league-' + leagueId);
      localStorage.removeItem('mmfantasy-bracket-' + leagueId);
    }
    if (code) localStorage.removeItem('mmfantasy-code-' + code);
    try {
      const raw = localStorage.getItem('mmfantasy-leagues');
      if (raw) {
        const leagues = JSON.parse(raw).filter(l => l.leagueId !== leagueId && l.leagueCode !== code);
        localStorage.setItem('mmfantasy-leagues', JSON.stringify(leagues));
      }
    } catch (e) { }

    clearInterval(timerInterval);
    state = freshState();
    state.players = poolForCurrentTournament();
    document.getElementById('dissolveModal').style.display = 'none';
    showSplash();
    toast('League deleted', 'info');
  });

  // Tutorial buttons
  document.getElementById('tutNextBtn')?.addEventListener('click', tutNext);
  document.getElementById('tutBackBtn')?.addEventListener('click', tutBack);

  // Capture any ?join= param before we redirect away (survives login via sessionStorage)
  (function captureInvite() {
    const params = new URLSearchParams(window.location.search);
    const urlCode = (params.get('join') || '').trim().toUpperCase();
    if (urlCode) {
      try { sessionStorage.setItem('mmfantasy-pending-join', urlCode); } catch (e) { }
      history.replaceState(null, '', window.location.pathname + (window.location.hash || ''));
    }
  })();

  // ── BOOT ──────────────────────────────────────────────────
  let _authBootFired = false;
  if (window._auth) {
    window._auth.onAuthStateChanged(function (user) {
      if (_authBootFired) { window._fbUser = user; return; } // ignore post-login/logout re-fires here
      _authBootFired = true;
      window._fbUser = user;
      if (user) {
        const sess = getSession();
        const differentUser = sess && sess.uid && sess.uid !== user.uid;
        if (differentUser) {
          // A different user logged in on this device — wipe the previous user's local data
          localStorage.removeItem('mmfantasy-state');
          localStorage.removeItem('mmfantasy-leagues');
          state = freshState();
          state.players = poolForCurrentTournament();
        }
        if (!sess || differentUser) {
          const name = (user.displayName) || user.email.split('@')[0];
          setSession(name, user.email, user.uid);
        }
        if (!differentUser && loadState() && state.leagueId) { _subscribeLeague(state.leagueCode); enterLeague(); }
        else { showSplash(true); }
      } else {
        // Firebase says no user — check localStorage session (offline/testing fallback)
        const session = getSession();
        if (session) {
          if (loadState() && state.leagueId) { enterLeague(); }
          else { showSplash(true); }
        } else { showLanding(); }
      }
    });
  } else {
    const session = getSession();
    if (session) {
      if (loadState() && state.leagueId) { enterLeague(); }
      else { showSplash(true); }
    } else { showLanding(); }
  }

  // Landing screen buttons
  document.getElementById('landingCreateBtn')?.addEventListener('click', showSignup);
  document.getElementById('landingSignInBtn')?.addEventListener('click', showLogin);

  // Chat
  document.getElementById('chatSendBtn')?.addEventListener('click', sendChatMessage);
  document.getElementById('chatInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });
  // Right panel chat
  document.getElementById('rpChatSendBtn')?.addEventListener('click', sendRpChatMessage);
  document.getElementById('rpChatInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendRpChatMessage(); });
  // Home top bar user chip -> profile
  document.getElementById('homeUserChip')?.addEventListener('click', () => navigateTo('profile'));
  document.getElementById('homeNotifBtn')?.addEventListener('click', () => navigateTo('settings'));

  // Dark theme only: clear any previously saved light-mode preference
  try {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('mm_theme');
  } catch (e) { }

  // Init unread badge on load
  updateChatBadge();

  // Profile edit / save / cancel
  document.getElementById('profileEditBtn')?.addEventListener('click', () => {
    const session = getSession();
    const input = document.getElementById('profileNameInput');
    if (input && session) input.value = session.name;
    document.getElementById('profileEditRow').style.display = 'flex';
    document.getElementById('profileEditBtn').style.display = 'none';
    document.getElementById('profileNameDisplay').style.display = 'none';
    input?.focus();
  });
  document.getElementById('profileSaveBtn')?.addEventListener('click', () => {
    const input = document.getElementById('profileNameInput');
    const newName = input?.value.trim();
    if (!newName) return;
    if (containsBlockedTerm(newName)) { toast('That name is not allowed.', 'error'); return; }
    const session = getSession();
    if (session) {
      const oldName = session.name;
      setSession(newName, session.email);
      // Update this manager's name in league state
      const idx = state.managers.indexOf(oldName);
      if (idx !== -1) state.managers[idx] = newName;
      if (state.commissioner === oldName) state.commissioner = newName;
      // Update all drafted records that reference the old name
      Object.values(state.drafted).forEach(d => {
        if (d.manager === oldName) d.manager = newName;
      });
      // Update prevRankings so standings delta stays accurate
      if (state.prevRankings) {
        state.prevRankings = state.prevRankings.map(n => n === oldName ? newName : n);
      }
      saveState();
    }
    document.getElementById('profileEditRow').style.display = 'none';
    document.getElementById('profileEditBtn').style.display = '';
    document.getElementById('profileNameDisplay').style.display = '';
    renderProfile();
    renderSidebarUser();
    toast('Name updated!', 'success');
  });
  document.getElementById('profileCancelBtn')?.addEventListener('click', () => {
    document.getElementById('profileEditRow').style.display = 'none';
    document.getElementById('profileEditBtn').style.display = '';
    document.getElementById('profileNameDisplay').style.display = '';
  });

  // Sidebar profile button → profile page
  document.getElementById('sidebarUser')?.addEventListener('click', () => navigateTo('profile'));

  // Mobile clock bar profile avatar → profile page
  document.getElementById('mcbProfileBtn')?.addEventListener('click', () => navigateTo('profile'));
  document.getElementById('settingsProfileBtn')?.addEventListener('click', () => navigateTo('profile'));

  // Schedule draft
  document.getElementById('sdSaveBtn')?.addEventListener('click', saveDraftSchedule);
  document.getElementById('sdClearBtn')?.addEventListener('click', clearDraftSchedule);
  renderDraftSchedule();
  startScheduleTicker();

  // On the clock banner → jump to draft
  document.getElementById('otcDraftBtn')?.addEventListener('click', () => navigateTo('players'));

  // Profile share / invite
  document.getElementById('profileShareBtn')?.addEventListener('click', shareInviteLink);

  // Profile quick actions
  document.getElementById('profileGoSettings')?.addEventListener('click', () => navigateTo('settings'));
  document.getElementById('profileGoDraft')?.addEventListener('click', () => navigateTo('players'));
  document.getElementById('profileGoStandings')?.addEventListener('click', () => navigateTo('standings'));

  // Notifications settings
  document.getElementById('notifToggle')?.addEventListener('change', async e => {
    if (e.target.checked) {
      const granted = await requestNotifPermission();
      if (!granted) { e.target.checked = false; }
    } else {
      setNotifPref(false);
    }
    syncNotifUI();
  });
  document.getElementById('notifEnableBtn')?.addEventListener('click', async () => {
    await requestNotifPermission();
    syncNotifUI();
  });
  syncNotifUI();

  // ── NEW FEATURE HOOKS ─────────────────────────────────────
  initDraftInnerTabs();
  initCardViewToggle();
  initSwipeDismiss();
  initFABDraft();

  // Profile photo upload
  const avatarUploadBtn = document.getElementById('avatarUploadBtn');
  const avatarFileInput = document.getElementById('avatarFileInput');
  if (avatarUploadBtn && avatarFileInput) {
    avatarUploadBtn.addEventListener('click', () => avatarFileInput.click());
    avatarFileInput.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (file) compressAndSaveAvatar(file);
      avatarFileInput.value = '';
    });
  }
});

// ══════════════════════════════════════════════════════════
// 🎊 CONFETTI: basketball confetti on draft complete
// ══════════════════════════════════════════════════════════
function launchConfetti() {
  const container = document.getElementById('confettiContainer');
  if (!container) return;
  container.innerHTML = '';

  const COLORS = ['#4f8ff7', '#9b7fff', '#ff6b35', '#f6c54e', '#34d399', '#ffffff'];
  const SHAPES = ['circle', 'rect', 'ribbon'];
  const COUNT = 90;

  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const size = 8 + Math.random() * 10;
    const left = Math.random() * 100;
    const delay = Math.random() * 1.2;
    const dur = 2.4 + Math.random() * 1.6;

    el.style.cssText = [
      'left:' + left + 'vw',
      'width:' + (shape === 'ribbon' ? (size * 0.35) + 'px' : size + 'px'),
      'height:' + (shape === 'ribbon' ? (size * 3) + 'px' : size + 'px'),
      'background:' + color,
      'border-radius:' + (shape === 'circle' ? '50%' : shape === 'ribbon' ? '2px' : '2px'),
      'animation-duration:' + dur + 's',
      'animation-delay:' + delay + 's',
      'opacity:1'
    ].join(';');

    container.appendChild(el);
  }

  // Add basketball emoji pieces
  for (let i = 0; i < 12; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.textContent = '●';
    el.style.cssText = [
      'left:' + (Math.random() * 90 + 5) + 'vw',
      'font-size:' + (18 + Math.random() * 14) + 'px',
      'background:none',
      'animation-duration:' + (2.8 + Math.random() * 1.4) + 's',
      'animation-delay:' + (Math.random() * 0.8) + 's'
    ].join(';');
    container.appendChild(el);
  }

  // Clear after animation
  setTimeout(() => { if (container) container.innerHTML = ''; }, 5500);
}

// ══════════════════════════════════════════════════════════
// 📱 MOBILE CLOCK BAR: sticky on-clock info strip
// ══════════════════════════════════════════════════════════
function updateMobileClockBar() {
  const bar = document.getElementById('mobileClockBar');
  if (!bar) return;
  const pick = currentPick();
  const mgr = document.getElementById('mcbManager');

  // Only show while a draft is actually live and someone is on the clock
  const draftLive = state.timerRunning || !!state.pickTimerStartedAt;
  if (pick && draftLive && !isDraftComplete()) {
    if (mgr) mgr.textContent = pick.manager;
    bar.classList.remove('mcb-idle');
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'none';
  }

  updateOTCBanner(pick);
}

// ══════════════════════════════════════════════════════════
// 🔔 PUSH NOTIFICATIONS: OTC alerts via Service Worker
// ══════════════════════════════════════════════════════════
function notifSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}
function getNotifPref() {
  try { return localStorage.getItem('mmfantasy-notif') === '1'; } catch (e) { return false; }
}
function setNotifPref(v) {
  try { localStorage.setItem('mmfantasy-notif', v ? '1' : '0'); } catch (e) { }
}

async function requestNotifPermission() {
  if (!notifSupported()) return false;
  if (Notification.permission === 'granted') { setNotifPref(true); return true; }
  if (Notification.permission === 'denied') { setNotifPref(false); return false; }
  const result = await Notification.requestPermission();
  const granted = result === 'granted';
  setNotifPref(granted);
  // Gates most of the retention mechanism, so it is a leading
  // indicator worth watching on its own.
  track(granted ? 'notification_permission_granted' : 'notification_permission_denied', {});
  return granted;
}

async function showOTCNotification(pick) {
  if (!notifSupported()) return;
  if (Notification.permission !== 'granted' || !getNotifPref()) return;
  const body = 'Pick #' + pick.pickNumber + ' · ' + (state.leagueName || 'Tipoff Fantasy') + '. Tap to draft now.';
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification("⏰ You're on the clock!", {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'otc-pick',       // replaces any prior OTC notification instead of stacking
      renotify: true,        // vibrate + sound even if tag already exists
      data: { url: window.location.href }
    });
  } catch (e) {
    // Fallback for browsers without SW notification support
    try { new Notification("⏰ You're on the clock!", { body, icon: './icons/icon-192.png' }); } catch (_) { }
  }
}

// Listen for SW telling us to jump to draft (notification tap when tab was open).
// Ignored during startup so a queued message can never override the Home landing page.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'OTC_FOCUS_DRAFT') {
      if (!window._appReady) return;
      navigateTo('players');
    }
  });
}

function syncNotifUI() {
  if (!notifSupported()) {
    document.getElementById('notifToggle') && (document.getElementById('notifToggle').closest('.panel').style.display = 'none');
    return;
  }
  const perm = Notification.permission;
  const pref = getNotifPref();
  const toggle = document.getElementById('notifToggle');
  const pill = document.getElementById('notifStatusPill');
  const desc = document.getElementById('notifStatusDesc');
  const btn = document.getElementById('notifEnableBtn');

  const enabled = perm === 'granted' && pref;
  if (toggle) toggle.checked = enabled;
  if (pill) {
    pill.textContent = enabled ? 'On' : 'Off';
    pill.className = 'status-pill ' + (enabled ? 'status-active' : 'status-off');
  }
  if (desc) {
    if (perm === 'denied') desc.textContent = 'Notifications are blocked in your browser. Check your browser settings to enable them.';
    else desc.textContent = 'Get a browser notification when it\'s your pick, even if the app is in the background.';
  }
  if (btn) btn.style.display = (perm === 'default') ? '' : 'none';

  syncNotifPrefsUI(enabled);
}

// ══════════════════════════════════════════════════════════
// 🔔 GRANULAR NOTIFICATION PREFERENCES
//   The master toggle above controls whether we may notify at
//   all. These decide which events are worth interrupting for.
// ══════════════════════════════════════════════════════════
const NOTIF_PREF_DEFAULTS = {
  draftSoon: true, pickMade: false, playerScored: true,
  eliminated: true, rankChange: false, managerJoined: true,
};

function getNotifPrefs() {
  try {
    const raw = localStorage.getItem('mmfantasy-notif-prefs');
    return Object.assign({}, NOTIF_PREF_DEFAULTS, raw ? JSON.parse(raw) : {});
  } catch (e) { return Object.assign({}, NOTIF_PREF_DEFAULTS); }
}

function setNotifPrefs(prefs) {
  try { localStorage.setItem('mmfantasy-notif-prefs', JSON.stringify(prefs)); } catch (e) { }
}

// Single place to ask "should I fire this notification?"
function shouldNotify(kind) {
  if (!notifSupported()) return false;
  if (Notification.permission !== 'granted' || !getNotifPref()) return false;
  return !!getNotifPrefs()[kind];
}

function syncNotifPrefsUI(masterOn) {
  const group = document.getElementById('notifPrefsGroup');
  if (!group) return;
  // Greyed out and inert when the master switch is off, rather than
  // hidden, so it is obvious the controls exist.
  group.dataset.locked = masterOn ? '0' : '1';

  const prefs = getNotifPrefs();
  group.querySelectorAll('.np-switch').forEach(function (cb) {
    const key = cb.dataset.notif;
    if (key in prefs) cb.checked = !!prefs[key];
  });
}

function wireNotifPrefs() {
  const group = document.getElementById('notifPrefsGroup');
  if (!group || group.dataset.wired === '1') return;
  group.dataset.wired = '1';

  group.querySelectorAll('.np-switch').forEach(function (cb) {
    cb.addEventListener('change', function () {
      const prefs = getNotifPrefs();
      prefs[cb.dataset.notif] = cb.checked;
      setNotifPrefs(prefs);
    });
  });
}

// ══════════════════════════════════════════════════════════
// 👤 USER RECORD  (users/{uid})
//   Previously nothing tracked a person across leagues: the
//   single leagueCode in localStorage WAS the membership. This
//   doc is the groundwork for belonging to more than one.
//     { displayName, accent, leagues: [{code, name, joinedAt}] }
// ══════════════════════════════════════════════════════════
function _uid() {
  return (window._auth && window._auth.currentUser) ? window._auth.currentUser.uid : null;
}

// ── Analytics helper ──────────────────────────────────────
//  Thin passthrough so call sites never need a guard. analytics.js
//  scrubs PII at the boundary; never pass email, display name or chat
//  text, and note that it would be dropped anyway if you did.
function track(event, props) {
  try {
    if (window.Analytics) window.Analytics.track(event, props || {});
  } catch (e) {}
}

// ── Age ───────────────────────────────────────────────────
const MIN_AGE = 13;          // COPPA floor
const ADULT_AGE = 18;

// Whole years as of today. Returns null for an unparseable/empty date.
function ageFromDOB(value) {
  if (!value) return null;
  const parts = String(value).split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (!y || !m || !d) return null;

  const now = new Date();
  let age = now.getFullYear() - y;
  // Subtract a year if the birthday has not happened yet this year.
  const monthDiff = (now.getMonth() + 1) - m;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d)) age--;
  return age;
}

function userDocRef() {
  const uid = _uid();
  if (!uid || !window._db) return null;
  return window._db.collection('users').doc(uid);
}

async function recordLeagueMembership(code, name) {
  const ref = userDocRef();
  if (!ref || !code) return;
  try {
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const leagues = Array.isArray(data.leagues) ? data.leagues.slice() : [];

    const i = leagues.findIndex(l => l && l.code === code);
    if (i >= 0) {
      leagues[i] = Object.assign({}, leagues[i], { name: name || leagues[i].name, lastOpened: Date.now() });
    } else {
      leagues.push({ code: code, name: name || 'League', joinedAt: Date.now(), lastOpened: Date.now() });
    }
    await ref.set({ leagues: leagues }, { merge: true });
  } catch (e) {
    console.warn('[Leagues] membership write failed:', e.message);
  }
}

async function forgetLeagueMembership(code) {
  const ref = userDocRef();
  if (!ref || !code) return;
  try {
    const snap = await ref.get();
    const leagues = (snap.exists && Array.isArray(snap.data().leagues)) ? snap.data().leagues : [];
    await ref.set({ leagues: leagues.filter(l => l && l.code !== code) }, { merge: true });
  } catch (e) {
    console.warn('[Leagues] membership remove failed:', e.message);
  }
}

// ── My Leagues list ───────────────────────────────────────
async function renderMyLeagues() {
  const host = document.getElementById('myLeaguesList');
  if (!host) return;

  const ref = userDocRef();
  if (!ref) { host.innerHTML = ''; return; }

  let leagues = [];
  try {
    const snap = await ref.get();
    if (snap.exists && Array.isArray(snap.data().leagues)) leagues = snap.data().leagues;
  } catch (e) {
    console.warn('[Leagues] read failed:', e.message);
  }

  // Always show the league we are actually in, even if the user doc
  // has not caught up yet.
  if (state.leagueCode && !leagues.some(l => l && l.code === state.leagueCode)) {
    leagues.unshift({ code: state.leagueCode, name: state.leagueName || 'My League', lastOpened: Date.now() });
  }

  if (!leagues.length) {
    host.innerHTML = '<div class="set-row"><div class="set-row-main">' +
      '<span class="set-row-sub">You are not in any leagues yet. Enter a code below to join one.</span>' +
      '</div></div>';
    return;
  }

  leagues.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));

  host.innerHTML = leagues.map(function (l) {
    const active = l.code === state.leagueCode;
    const initials = (l.name || 'L').trim().slice(0, 2).toUpperCase();
    return '<div class="ml-row' + (active ? ' ml-row--active' : '') + '" data-code="' + esc(l.code) + '">' +
      '<div class="ml-badge">' + esc(initials) + '</div>' +
      '<div class="ml-info">' +
      '<span class="ml-name">' + esc(l.name || 'League') + '</span>' +
      '<span class="ml-meta">Code ' + esc(l.code) + '</span>' +
      '</div>' +
      (active ? '<span class="ml-current-pill">Current</span>' : '') +
      '</div>';
  }).join('');

  host.querySelectorAll('.ml-row').forEach(function (row) {
    if (row.classList.contains('ml-row--active')) return;
    row.addEventListener('click', function () { switchToLeague(row.dataset.code); });
  });
}

function switchToLeague(code) {
  if (!code || code === state.leagueCode) return;
  if (String(code).length !== 6) { toast('League codes are 6 characters.', 'error'); return; }

  // handleJoin() is the single tested path for entering a league: it
  // does the Firestore lookup, the full-league check, _applyLeagueState,
  // _subscribeLeague and enterLeague. Reuse it rather than duplicating
  // that sequence and drifting out of sync with it.
  const input = document.getElementById('joinCodeInput');
  if (!input || typeof handleJoin !== 'function') {
    toast('Could not switch leagues.', 'error');
    return;
  }

  // Drop the current subscription first, or two league listeners race.
  if (_leagueUnsubscribe) { _leagueUnsubscribe(); _leagueUnsubscribe = null; }

  input.value = code;
  handleJoin();
}

// ══════════════════════════════════════════════════════════
// 🎨 ACCENT COLOR
// ══════════════════════════════════════════════════════════
const DEFAULT_ACCENT = '#f26b21';

function getAccent() {
  try { return localStorage.getItem('mmfantasy-accent') || DEFAULT_ACCENT; }
  catch (e) { return DEFAULT_ACCENT; }
}

function setAccent(color) {
  try { localStorage.setItem('mmfantasy-accent', color); } catch (e) { }
  applyAccent(color);
  const ref = userDocRef();
  if (ref) ref.set({ accent: color }, { merge: true }).catch(function () { });
}

function applyAccent(color) {
  document.documentElement.style.setProperty('--user-accent', color || DEFAULT_ACCENT);
  const ring = document.getElementById('profileAvatarRing');
  if (ring) ring.style.setProperty('--ring-accent', color || DEFAULT_ACCENT);
}

function syncAccentUI() {
  const cur = getAccent();
  applyAccent(cur);
  document.querySelectorAll('.look-swatch').forEach(function (sw) {
    sw.classList.toggle('look-swatch--active', sw.dataset.color === cur);
  });
}

function wireAccentSwatches() {
  const host = document.getElementById('lookSwatches');
  if (!host || host.dataset.wired === '1') return;
  host.dataset.wired = '1';
  host.querySelectorAll('.look-swatch').forEach(function (sw) {
    sw.addEventListener('click', function () {
      setAccent(sw.dataset.color);
      syncAccentUI();
      toast('Color updated', 'success');
    });
  });
}

// ══════════════════════════════════════════════════════════
// 🔐 ACCOUNT ACTIONS  (email / password / delete)
//   Every one of these is a Firebase "recent login required"
//   operation, so they all reauthenticate first. That is why
//   there is one shared modal rather than three flows.
// ══════════════════════════════════════════════════════════
let _acctMode = null;

function openAcctModal(mode) {
  const user = window._auth && window._auth.currentUser;
  if (!user) { toast('You are not signed in.', 'error'); return; }

  // Google/Apple accounts have no password to reauthenticate with.
  const isPassword = (user.providerData || []).some(p => p && p.providerId === 'password');
  if (!isPassword) {
    toast('This account signs in with a provider. Manage it there.', 'error');
    return;
  }

  _acctMode = mode;
  const modal = document.getElementById('acctModal');
  const title = document.getElementById('acctModalTitle');
  const sub = document.getElementById('acctModalSub');
  const newWrap = document.getElementById('acctFieldNewWrap');
  const newLbl = document.getElementById('acctFieldNewLabel');
  const newIn = document.getElementById('acctFieldNew');
  const pwIn = document.getElementById('acctFieldPw');
  const err = document.getElementById('acctModalErr');
  const confirm = document.getElementById('acctModalConfirm');
  if (!modal) return;

  err.style.display = 'none';
  pwIn.value = '';
  newIn.value = '';
  confirm.classList.remove('btn-red');

  if (mode === 'email') {
    title.textContent = 'Change Email';
    sub.textContent = 'We will send a verification link to the new address.';
    newWrap.style.display = '';
    newLbl.textContent = 'New email';
    newIn.type = 'email';
    newIn.placeholder = 'you@example.com';
    confirm.textContent = 'Update Email';
  } else if (mode === 'password') {
    title.textContent = 'Change Password';
    sub.textContent = 'Pick something at least 6 characters long.';
    newWrap.style.display = '';
    newLbl.textContent = 'New password';
    newIn.type = 'password';
    newIn.placeholder = 'New password';
    confirm.textContent = 'Update Password';
  } else if (mode === 'delete') {
    title.textContent = 'Delete Account';
    sub.textContent = 'This permanently erases your account and removes you from every league. It cannot be undone.';
    newWrap.style.display = 'none';
    confirm.textContent = 'Delete Forever';
    confirm.classList.add('btn-red');
  }

  modal.style.display = 'flex';
  setTimeout(function () { (mode === 'delete' ? pwIn : newIn).focus(); }, 60);
}

function closeAcctModal() {
  const modal = document.getElementById('acctModal');
  if (modal) modal.style.display = 'none';
  _acctMode = null;
}

function acctError(msg) {
  const err = document.getElementById('acctModalErr');
  if (!err) return;
  err.textContent = msg;
  err.style.display = '';
}

async function runAcctAction() {
  const user = window._auth && window._auth.currentUser;
  if (!user) return closeAcctModal();

  const newVal = (document.getElementById('acctFieldNew') || {}).value || '';
  const pw = (document.getElementById('acctFieldPw') || {}).value || '';
  const btn = document.getElementById('acctModalConfirm');

  if (!pw) return acctError('Enter your current password to confirm.');
  if (_acctMode === 'email' && !/^\S+@\S+\.\S+$/.test(newVal.trim())) {
    return acctError('That does not look like a valid email address.');
  }
  if (_acctMode === 'password' && newVal.length < 6) {
    return acctError('New password must be at least 6 characters.');
  }

  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Working...';

  try {
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, pw);
    await user.reauthenticateWithCredential(cred);

    if (_acctMode === 'email') {
      // Newer Firebase projects block updateEmail outright and require
      // the verify-first flow, so try that and fall back.
      if (typeof user.verifyBeforeUpdateEmail === 'function') {
        await user.verifyBeforeUpdateEmail(newVal.trim());
        toast('Check your new inbox to confirm the change.', 'success');
      } else {
        await user.updateEmail(newVal.trim());
        toast('Email updated.', 'success');
      }

    } else if (_acctMode === 'password') {
      await user.updatePassword(newVal);
      toast('Password updated.', 'success');

    } else if (_acctMode === 'delete') {
      const ref = userDocRef();
      if (ref) { try { await ref.delete(); } catch (e) { } }
      await user.delete();
      closeAcctModal();
      clearSession();
      showLanding();
      return;
    }

    closeAcctModal();
    syncAccountUI();

  } catch (e) {
    const code = e && e.code ? e.code : '';
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      acctError('That password is not correct.');
    } else if (code === 'auth/email-already-in-use') {
      acctError('That email is already attached to another account.');
    } else if (code === 'auth/too-many-requests') {
      acctError('Too many attempts. Wait a few minutes and try again.');
    } else if (code === 'auth/operation-not-allowed') {
      acctError('Email changes are disabled for this project. Contact support.');
    } else {
      acctError(e && e.message ? e.message : 'Something went wrong.');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

function syncAccountUI() {
  const user = window._auth && window._auth.currentUser;
  const emailEl = document.getElementById('acctEmail');
  if (emailEl) emailEl.textContent = (user && user.email) ? user.email : 'Not signed in';
}

async function leaveCurrentLeague() {
  if (!state.leagueCode) { toast('You are not in a league.', 'error'); return; }
  const name = state.leagueName || 'this league';
  if (!confirm('Leave "' + name + '"? You can rejoin later with the code ' + state.leagueCode + '.')) return;

  const code = state.leagueCode;
  await forgetLeagueMembership(code);
  try { localStorage.removeItem('mmfantasy-code-' + code); } catch (e) { }

  if (_leagueUnsubscribe) { _leagueUnsubscribe(); _leagueUnsubscribe = null; }
  state = freshState();
  state.players = poolForCurrentTournament();
  clearSession();
  showLanding();
  toast('You left ' + name + '.', 'success');
}

// ── Wiring ────────────────────────────────────────────────
function wireSettingsExtras() {
  const once = function (id, fn) {
    const el = document.getElementById(id);
    if (!el || el.dataset.wired === '1') return;
    el.dataset.wired = '1';
    el.addEventListener('click', fn);
  };

  once('acctChangeEmailBtn', function () { openAcctModal('email'); });
  once('acctChangePwBtn', function () { openAcctModal('password'); });
  once('deleteAccountBtn', function () { openAcctModal('delete'); });
  once('acctModalCancel', closeAcctModal);
  once('acctModalConfirm', runAcctAction);
  once('leaveLeagueBtn', leaveCurrentLeague);

  once('acctSignOutBtn', function () {
    document.getElementById('navSignOutBtn')?.click();
  });

  once('mlJoinBtn', function () {
    const input = document.getElementById('mlJoinInput');
    const code = (input && input.value || '').trim().toUpperCase();
    if (!code) { toast('Enter a league code.', 'error'); return; }
    if (code === state.leagueCode) { toast('You are already in that league.', 'error'); return; }
    if (input) input.value = '';
    switchToLeague(code);
  });

  const modal = document.getElementById('acctModal');
  if (modal && modal.dataset.wiredBackdrop !== '1') {
    modal.dataset.wiredBackdrop = '1';
    modal.addEventListener('click', function (e) { if (e.target === modal) closeAcctModal(); });
  }

  const joinInput = document.getElementById('mlJoinInput');
  if (joinInput && joinInput.dataset.wired !== '1') {
    joinInput.dataset.wired = '1';
    joinInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('mlJoinBtn')?.click();
    });
  }

  wireNotifPrefs();
  wireAccentSwatches();
}

// Everything above is idempotent, so it is safe to call on every
// visit to Settings rather than only once at boot.
function refreshSettingsPage() {
  try { wireSettingsExtras(); } catch (e) { console.warn('wireSettingsExtras', e); }
  try { syncAccountUI(); } catch (e) { console.warn('syncAccountUI', e); }
  try { renderMyLeagues(); } catch (e) { console.warn('renderMyLeagues', e); }
  try { syncAccentUI(); } catch (e) { console.warn('syncAccentUI', e); }
}

function refreshProfilePage() {
  try { wireAccentSwatches(); } catch (e) { }
  try { syncAccentUI(); } catch (e) { }
}

// ══════════════════════════════════════════════════════════
// ⏰ ON THE CLOCK BANNER: "Your Pick!" alert for the user
// ══════════════════════════════════════════════════════════
let _otcWasYours = false; // track transitions to trigger vibrate only on change

function updateOTCBanner(pick) {
  const banner = document.getElementById('otcBanner');
  if (!banner) return;
  const session = getSession();
  const currentUser = session ? session.name : null;
  const isYours = !!(pick && currentUser && pick.manager === currentUser);

  // Only show when it's truly your pick AND the timer is actively running.
  // Requiring timerRunning prevents the banner from appearing during league
  // setup, before the commissioner presses Start, or from stale localStorage state.
  const shouldShow = isYours && state.timerRunning;

  if (shouldShow) {
    // Only trigger effects when the turn first becomes yours
    if (!_otcWasYours) {
      banner.style.display = 'block';
      const inner = banner.querySelector('.otc-inner');
      if (inner) { inner.style.animation = 'none'; void inner.offsetWidth; inner.style.animation = ''; }
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      showOTCNotification(pick);
    }
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
  _otcWasYours = shouldShow;
}

// ══════════════════════════════════════════════════════════
// 🏀 DRAFT INNER TABS: Draft Room / Player Pool
// ══════════════════════════════════════════════════════════
function initDraftInnerTabs() {
  document.querySelectorAll('.dit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.dit-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('draftRoomTab').style.display = tab === 'room' ? '' : 'none';
      document.getElementById('playerPoolTab').style.display = tab === 'pool' ? '' : 'none';
      if (tab === 'pool') {
        try { renderPlayerPool(); } catch (e) { }
      } else {
        try { renderDraftGrid(); } catch (e) { }
        try { renderDraftFeed(); } catch (e) { }
        try { renderDraftOrderStrip(); } catch (e) { }
      }
    });
  });
}

// ══════════════════════════════════════════════════════════
// 🗃️ CARD VIEW TOGGLE: list vs card grid for player pool
// ══════════════════════════════════════════════════════════
function initCardViewToggle() {
  const listBtn = document.getElementById('poolListViewBtn');
  const cardBtn = document.getElementById('poolCardViewBtn');
  const tableWrap = document.querySelector('#playerPoolTab .pool-table-wrap');
  const cardGrid = document.getElementById('playerCardGrid');
  if (!listBtn || !cardBtn || !tableWrap || !cardGrid) return;

  listBtn.addEventListener('click', () => {
    listBtn.classList.add('active');
    cardBtn.classList.remove('active');
    tableWrap.classList.remove('card-hidden');
    cardGrid.classList.remove('active');
    renderPlayerPool();
  });

  cardBtn.addEventListener('click', () => {
    cardBtn.classList.add('active');
    listBtn.classList.remove('active');
    tableWrap.classList.add('card-hidden');
    cardGrid.classList.add('active');
    renderPlayerCardGrid();
  });

  // Cards are the default view, so render immediately
  cardBtn.classList.add('active');
  listBtn.classList.remove('active');
  tableWrap.classList.add('card-hidden');
  cardGrid.classList.add('active');
  renderPlayerCardGrid();
}

function renderPlayerCardGrid() {
  const cardGrid = document.getElementById('playerCardGrid');
  if (!cardGrid) return;

  const search = (document.getElementById('poolSearch')?.value || '').toLowerCase();
  const seed = document.getElementById('poolSeedFilter')?.value || '';
  const sort = document.getElementById('poolSortSelect')?.value || 'fpts';

  let players = getSortedPlayers(search, '');
  // apply seed filter manually (getSortedPlayers uses pos, not seed)
  if (seed) {
    if (seed.includes('-')) { const [lo, hi] = seed.split('-').map(Number); players = players.filter(p => p.seed >= lo && p.seed <= hi); }
    else players = players.filter(p => p.seed === parseInt(seed));
  }
  // apply sort
  const sortMap = { points: 'points', rebounds: 'rebounds', assists: 'assists' };
  const col = sortMap[sort];
  if (col) players.sort((a, b) => (b.stats[col] || 0) - (a.stats[col] || 0));
  else players.sort((a, b) => calcFPTS(b) - calcFPTS(a));

  cardGrid.innerHTML = players.map(p => {
    const drafted = !!state.drafted[p.id];
    const draftInfo = drafted ? state.drafted[p.id] : null;
    const fpts = calcFPTS(p).toFixed(1);
    const logoHtml = getSchoolLogoHTML(p.college, 36);
    const schoolColor = SCHOOL_COLORS[normalizeName(p.college)] || SCHOOL_COLORS[p.college] || '#1e2235';

    return '<div class="player-card' + (drafted ? ' drafted' : '') + '" data-pid="' + p.id + '" style="--card-accent:' + schoolColor + '">' +
      '<div class="pc-top-row">' + logoHtml +
      (p.seed ? '<span class="pc-seed-badge">' + p.seed + '</span>' : '') +
      '</div>' +
      (p.position ? '<span class="pc-pos-badge">' + esc(p.position) + '</span>' : '') +
      '<div class="pc-name">' + esc(p.name) + '</div>' +
      '<div class="pc-college">' + esc(p.college) + '</div>' +
      '<div class="pc-fpts">' + fpts + '</div>' +
      '<div class="pc-fpts-label">FPTS</div>' +
      '<div class="pc-action">' +
      (drafted
        ? '<span class="drafted-badge">' + esc(draftInfo.manager) + '</span>'
        : '<button class="pick-btn view-btn-card" data-pid="' + p.id + '">View</button>'
      ) +
      '</div>' +
      '</div>';
  }).join('');

  cardGrid.querySelectorAll('.player-card').forEach(card => {
    card.addEventListener('click', () => showPlayerDetail(card.dataset.pid, card, false));
  });
}

// ══════════════════════════════════════════════════════════
// 👆 SWIPE-DISMISS: swipe down to close PDC overlay
// ══════════════════════════════════════════════════════════
function initSwipeDismiss() {
  const overlay = document.getElementById('pdcOverlay');
  if (!overlay) return;

  let startY = 0;
  let isDragging = false;
  const card = overlay.querySelector('.pdc-card');

  overlay.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    isDragging = true;
  }, { passive: true });

  overlay.addEventListener('touchmove', e => {
    if (!isDragging || !card) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      card.style.transform = 'translateY(' + dy + 'px)';
      card.style.transition = 'none';
      card.style.opacity = String(Math.max(0, 1 - dy / 320));
    }
  }, { passive: true });

  overlay.addEventListener('touchend', e => {
    isDragging = false;
    if (!card) return;
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 90) {
      card.style.transition = 'transform 0.28s ease, opacity 0.28s ease';
      card.style.transform = 'translateY(100%)';
      card.style.opacity = '0';
      setTimeout(() => {
        overlay.style.display = 'none';
        card.style.transform = '';
        card.style.opacity = '';
        card.style.transition = '';
      }, 300);
    } else {
      card.style.transition = 'transform 0.3s cubic-bezier(0.34,1.4,0.64,1), opacity 0.2s ease';
      card.style.transform = '';
      card.style.opacity = '';
      setTimeout(() => { card.style.transition = ''; }, 350);
    }
  }, { passive: true });
}

// ══════════════════════════════════════════════════════════
// POINTS PROJECTION ENGINE
// Determines alive teams from bracket state and projects
// max remaining FPTS each manager can earn.
// ══════════════════════════════════════════════════════════

/**
 * Returns a map of { teamName → { gamesWon, gamesRemaining } }
 * for every team not yet eliminated in the bracket.
 * Total tournament games = 6 (R64→R32→S16→E8→FF→Champ).
 */
function getAliveTeamsInfo() {
  const bracketData = getBracketState();
  const regionsData = (window.MM_BRACKET_DATA || { regions: [] }).regions;
  const eliminated = new Set();
  const gamesWon = {};

  regionsData.forEach(reg => {
    const rw = ((bracketData || {}).regions || {})[reg.name] || [[], [], [], []];

    // Round 0: Round of 64 (8 matchups)
    reg.matchups.forEach((mu, i) => {
      const winner = rw[0] && rw[0][i];
      if (winner) {
        gamesWon[winner] = (gamesWon[winner] || 0) + 1;
        const loser = winner === mu.top.name ? mu.bot.name : mu.top.name;
        eliminated.add(loser);
      }
    });

    // Round 1: Round of 32 (4 matchups)
    for (let i = 0; i < 4; i++) {
      const winner = rw[1] && rw[1][i];
      if (winner) {
        gamesWon[winner] = (gamesWon[winner] || 0) + 1;
        const t0 = rw[0] && rw[0][i * 2];
        const t1 = rw[0] && rw[0][i * 2 + 1];
        const loser = winner === t0 ? t1 : t0;
        if (loser) eliminated.add(loser);
      }
    }

    // Round 2: Sweet 16 (2 matchups)
    for (let i = 0; i < 2; i++) {
      const winner = rw[2] && rw[2][i];
      if (winner) {
        gamesWon[winner] = (gamesWon[winner] || 0) + 1;
        const t0 = rw[1] && rw[1][i * 2];
        const t1 = rw[1] && rw[1][i * 2 + 1];
        const loser = winner === t0 ? t1 : t0;
        if (loser) eliminated.add(loser);
      }
    }

    // Round 3: Elite 8 (1 matchup)
    const winner3 = rw[3] && rw[3][0];
    if (winner3) {
      gamesWon[winner3] = (gamesWon[winner3] || 0) + 1;
      const t0 = rw[2] && rw[2][0];
      const t1 = rw[2] && rw[2][1];
      const loser = winner3 === t0 ? t1 : t0;
      if (loser) eliminated.add(loser);
    }
  });

  // Final Four (2 games)
  const ff = (bracketData || {}).finalFour || [null, null];
  // Determine which teams played each FF matchup from Elite 8 winners
  const ffMatchups = (window.MM_BRACKET_DATA || { finalFour: [] }).finalFour || [];
  ffMatchups.forEach((slot, i) => {
    const winner = ff[i];
    if (!winner) return;
    gamesWon[winner] = (gamesWon[winner] || 0) + 1;
    // Find the two Elite 8 winners from the relevant regions
    const getE8Winner = (regionName) => {
      const rw = ((bracketData || {}).regions || {})[regionName] || [[], [], [], []];
      return rw[3] && rw[3][0];
    };
    const t0 = getE8Winner(slot.topRegion);
    const t1 = getE8Winner(slot.botRegion);
    const loser = winner === t0 ? t1 : t0;
    if (loser) eliminated.add(loser);
  });

  // Championship (1 game)
  const champ = (bracketData || {}).championship;
  if (champ) {
    gamesWon[champ] = (gamesWon[champ] || 0) + 1;
    const loser = ff[0] && ff[0] !== champ ? ff[0] : (ff[1] !== champ ? ff[1] : null);
    if (loser) eliminated.add(loser);
  }

  // Build result: all bracket teams minus eliminated ones.
  // Store under both the raw name AND the normalized name so player college
  // lookups work regardless of which variant is used (e.g. "Ole Miss" vs "Mississippi").
  const result = {};
  regionsData.forEach(reg => {
    reg.matchups.forEach(mu => {
      [mu.top, mu.bot].forEach(team => {
        if (!eliminated.has(team.name)) {
          const won = gamesWon[team.name] || 0;
          const entry = { gamesWon: won, gamesRemaining: 6 - won };
          result[team.name] = entry;
          const norm = normalizeName(team.name);
          if (norm !== team.name) result[norm] = entry;
        }
      });
    });
  });

  return result;
}

/**
 * For a manager, returns projected additional FPTS from alive players.
 * Uses per-game season stats × remaining games.
 */
function calcProjectedFPTS(managerName) {
  const aliveInfo = getAliveTeamsInfo();
  let totalProj = 0;
  const alivePlayers = [];

  Object.entries(state.drafted).forEach(([pid, d]) => {
    if (d.manager !== managerName) return;
    const p = (state.players || []).find(x => x.id === pid);
    if (!p) return;
    // Try exact match first, then normalized (handles Ole Miss → Mississippi etc.)
    const info = aliveInfo[p.college] || aliveInfo[normalizeName(p.college)];
    if (info && info.gamesRemaining > 0) {
      // Multiply the SEASON per-game rate, never p.stats — once the live
      // feed is running p.stats holds cumulative tournament totals, and
      // projecting off a running total inflates it by games played.
      const rate = p.seasonAvg || p.stats;
      const perGame = calcFPTS(Object.assign({}, p, { stats: rate }));
      const proj = Math.round(perGame * info.gamesRemaining * 10) / 10;
      totalProj += proj;
      alivePlayers.push({ player: p, gamesRemaining: info.gamesRemaining, proj });
    }
  });

  // Sort by proj desc
  alivePlayers.sort((a, b) => b.proj - a.proj);
  return { projected: Math.round(totalProj), alivePlayers };
}

function renderProjectionPanel() {
  const panel = document.getElementById('projPanel');
  const list = document.getElementById('projList');
  if (!panel || !list) return;

  if (state.managers.length === 0 || Object.keys(state.drafted).length === 0) {
    panel.style.display = 'none';
    return;
  }

  const aliveInfo = getAliveTeamsInfo();
  const hasAnyAlive = state.managers.some(m => {
    return Object.entries(state.drafted).some(([pid, d]) => {
      if (d.manager !== m) return false;
      const p = (state.players || []).find(x => x.id === pid);
      return p && aliveInfo[p.college] && aliveInfo[p.college].gamesRemaining > 0;
    });
  });

  if (!hasAnyAlive) {
    panel.style.display = 'block';
    list.innerHTML = '<p class="proj-empty-state">No alive teams in your rosters yet. Projections will appear once bracket games begin.</p>';
    return;
  }

  panel.style.display = 'block';

  const ranked = state.managers.map(m => {
    const { projected, alivePlayers } = calcProjectedFPTS(m);
    const current = managerFPTS(m);
    return { name: m, current, projected, alivePlayers, total: current + projected };
  }).sort((a, b) => b.total - a.total);

  list.innerHTML = ranked.map(m => {
    const playerTags = m.alivePlayers.slice(0, 4).map(ap =>
      '<span class="proj-player-chip">' +
      esc(ap.player.name.split(' ').pop()) +
      ' <span class="proj-chip-games">×' + ap.gamesRemaining + '</span>' +
      '</span>'
    ).join('');
    const extra = m.alivePlayers.length > 4
      ? '<span class="proj-player-more">+' + (m.alivePlayers.length - 4) + ' more</span>'
      : '';

    return '<div class="proj-row">' +
      '<div class="proj-row-main">' +
      '<span class="proj-manager">' + esc(m.name) + '</span>' +
      '<div class="proj-numbers">' +
      '<span class="proj-current">' + m.current + ' pts</span>' +
      '<span class="proj-arrow">+</span>' +
      '<span class="proj-projected">+' + m.projected + '</span>' +
      '<span class="proj-total-label">= ' + m.total + '</span>' +
      '</div>' +
      '</div>' +
      '<div class="proj-bar-wrap">' +
      '<div class="proj-bar-current" style="width:' + Math.min(100, (m.current / Math.max(...ranked.map(r => r.total)) * 100)) + '%"></div>' +
      '<div class="proj-bar-proj" style="width:' + Math.min(100, (m.projected / Math.max(...ranked.map(r => r.total)) * 100)) + '%"></div>' +
      '</div>' +
      (m.alivePlayers.length > 0 ? '<div class="proj-players">' + playerTags + extra + '</div>' : '') +
      '</div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════
// DRAFT AUTOPICK: header button beside the Draft Room / Player Pool tabs
// ══════════════════════════════════════════════════════════
function initFABDraft() {
  const btn = document.getElementById('draftAutopickBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const src = document.getElementById('autopickBtn');
    if (src) src.click();
    else { autoPickForCurrent(); toast('Autopick triggered', 'info'); }
  });
}
