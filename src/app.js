/* ══════════════════════════════════════════════════════════
   TIPOFF FANTASY: app.js
   Vanilla JS, no frameworks, localStorage persistence
══════════════════════════════════════════════════════════ */

'use strict';

// ── SCHOOL COLORS (primary color per school, no logos for copyright) ────
const SCHOOL_COLORS = {
  'Auburn':           '#E87722',
  'Michigan State':   '#18453B',
  'Iowa State':       '#C8102E',
  'Texas A&M':        '#500000',
  'Michigan':         '#00274C',
  'Mississippi':      '#CE1126',
  'Marquette':        '#003082',
  'Louisville':       '#AD0000',
  'Creighton':        '#005CA9',
  'New Mexico':       '#BA0C2F',
  'San Diego State':  '#CC0033',
  'UC San Diego':     '#182B49',
  'Yale':             '#00356B',
  'Lipscomb':         '#4F2D7F',
  'Bryant':           '#C8102E',
  'High Point':       '#4F2D7F',
  'Duke':             '#001A57',
  'Alabama':          '#9E1B32',
  'Wisconsin':        '#C5050C',
  'Arizona':          '#0C234B',
  'Ohio State':       '#BB0000',
  'Illinois':         '#E84A27',
  'Xavier':           '#002F6C',
  'Indiana':          '#990000',
  'Iowa':             '#FFCD00',
  'Vanderbilt':       '#866D4B',
  'McNeese State':    '#005DAA',
  'Liberty':          '#002868',
  'Morehead State':   '#002F6C',
  'Winthrop':         '#990000',
  'SIU Edwardsville': '#C8102E',
  'Houston':          '#C8102E',
  'Tennessee':        '#FF8200',
  'Kentucky':         '#0033A0',
  'Purdue':           '#CEB888',
  'Gonzaga':          '#002967',
  'Baylor':           '#003015',
  "St. John's":       '#C8102E',
  'Georgia':          '#BA0C2F',
  'Florida':          '#003087',
  'Oregon':           '#154733',
  'Texas':            '#BF5700',
  'UCLA':             '#2D68C4',
  'Akron':            '#005EB8',
  'Long Beach State': '#231F20',
  'Texas Southern':   '#002147',
  'Kansas':           '#0051A5',
  'UConn':            '#000E2F',
  'Arkansas':         '#9D2235',
  'North Carolina':   '#4B9CD3',
  'Villanova':        '#003366',
  'Clemson':          '#F66733',
  'Georgetown':       '#041E42',
  'Syracuse':         '#D44500',
  'Virginia':         '#232D4B',
  'Pittsburgh':       '#003594',
  'Penn State':       '#001E44',
  'Grand Canyon':     '#522498',
  'Vermont':          '#007A53',
  'Samford':          '#003087',
  'Montana State':    '#003B71',
  'Longwood':         '#003B71',
  'Louisiana State':  '#461D7C',
  'LSU':              '#461D7C',
  'Notre Dame':       '#0C2340',
  'Miami':            '#005030',
  'Florida State':    '#782F40',
  'Missouri':         '#F1B82D',
  'Oklahoma':         '#841617',
  'Oklahoma State':   '#FF6600',
  'TCU':              '#4D1979',
  'West Virginia':    '#002855',
  'NC State':         '#CC0000',
  'Wake Forest':      '#9E7E38',
  'Memphis':          '#003087',
  'Cincinnati':       '#E00122',
  'Temple':           '#9D2235',
  'Connecticut':      '#000E2F',
  'Dayton':           '#C8102E',
  'Richmond':         '#003366',
  'VCU':              '#FDBD10',
  'St. Mary\'s':      '#002366',
  'BYU':              '#002E5D',
  'Utah State':       '#00263A',
  'Nevada':           '#003366',
  'Boise State':      '#0033A0',
  'Colorado State':   '#1E4D2B',
  'Colorado':         '#CFB87C',
  'Arizona State':    '#8C1D40',
  'Utah':             '#CC0000',
  'Washington':       '#4B2E83',
  'Stanford':         '#8C1515',
  'California':       '#003262',
  'USC':              '#990000',
  'Saint Louis':      '#003DA5',
  'Davidson':         '#CC0000',
  'Wichita State':    '#000000',
  'Middle Tennessee': '#0066CC',
  'Belmont':          '#003087',
  'Murray State':     '#002147',
  'Eastern Washington':'#A10022',
  'Oral Roberts':     '#002868',
  'Abilene Christian':'#582C83',
  'Drake':            '#004B8D',
  'Colgate':          '#821019',
  'North Texas':      '#00853E',
  'James Madison':    '#450084',
  'UAB':              '#1E6B52',
  'Chattanooga':      '#002855',
  'Furman':           '#582C83',
  'Howard':           '#003A63',
  'Kennesaw State':   '#FDBB30',
  'UNC Asheville':    '#003366',
  'Montana':          '#990000',
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
  baselineStats: {},
  selectedTournament: null,
  maxManagers: 8,
  draftScheduledAt: null
};

let state = Object.assign({}, defaultState);
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
function saveState() {
  state.lastSaved = Date.now();
  try {
    localStorage.setItem('mmfantasy-state', JSON.stringify(state));
    if (state.leagueId) {
      localStorage.setItem('mmfantasy-league-' + state.leagueId, JSON.stringify(state));
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
      state = Object.assign({}, defaultState, parsed);
      state.scoring = Object.assign({}, defaultState.scoring, parsed.scoring || {});
      state.scoring.weights = Object.assign({}, defaultState.scoring.weights, (parsed.scoring || {}).weights || {});
      if (!Array.isArray(state.players) || state.players.length === 0) {
        state.players = (window.MM_PLAYERS || []).slice();
      }
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
  try { localStorage.setItem('mmfantasy-session', JSON.stringify({ name, email, uid: uid || null })); } catch (e) {}
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
    'auth/invalid-email':        'Invalid email address.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/user-not-found':       'No account found with this email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/too-many-requests':    'Too many attempts. Try again later.',
    'auth/invalid-credential':   'Invalid email or password.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return msgs[code] || 'Something went wrong. Please try again.';
}

function _saveLeagueToFirestore() {
  if (!window._db || !state.leagueCode) return;
  const toSave = Object.assign({}, state);
  delete toSave.players; // static, large — loaded from players.js
  toSave._updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  toSave._commissionerUid = (window._fbUser && window._fbUser.uid) || null;
  window._db.collection('leagues').doc(state.leagueCode).set(toSave, { merge: true })
    .catch(e => console.warn('[Firestore] saveLeague failed:', e.message));
}

function _subscribeLeague(code) {
  if (_leagueUnsubscribe) { _leagueUnsubscribe(); _leagueUnsubscribe = null; }
  if (!window._db || !code) return;
  _leagueUnsubscribe = window._db.collection('leagues').doc(code)
    .onSnapshot(doc => {
      if (!doc.exists) return;
      const data = doc.data();
      // Only apply remote data if it's newer than what we have locally
      const remoteTs = data.lastSaved || 0;
      const localTs  = state.lastSaved || 0;
      if (remoteTs > localTs + 1000) { // 1s buffer to avoid echo
        _applyLeagueState(data);
        try { localStorage.setItem('mmfantasy-league-' + state.leagueId, JSON.stringify(state)); } catch (e) {}
        render();
        toast('League updated.', 'info');
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

function managerFPTS(managerName) {
  let total = 0;
  Object.entries(state.drafted).forEach(([pid, d]) => {
    if (d.manager === managerName) {
      const p = (state.players || []).find(x => x.id === pid);
      if (p) total += calcFPTS(p);
    }
  });
  return Math.round(total * 10) / 10;
}

// Returns true if real/simulated game stats have been applied
function hasRealStats() {
  return !!(state.baselineStats && Object.keys(state.baselineStats).length > 0);
}

// FPTS calculated from baseline (pre-game projections)
function managerProjectedFPTS(managerName) {
  if (!hasRealStats()) return managerFPTS(managerName);
  const w = state.scoring.weights;
  const active = state.scoring.active || [];
  let total = 0;
  Object.entries(state.drafted).forEach(([pid, d]) => {
    if (d.manager === managerName) {
      const base = state.baselineStats[pid];
      if (!base) return;
      let pts = 0;
      if (active.includes('points'))   pts += (base.points   || 0) * (w.points   || 1);
      if (active.includes('rebounds')) pts += (base.rebounds || 0) * (w.rebounds || 1);
      if (active.includes('assists'))  pts += (base.assists  || 0) * (w.assists  || 1);
      if (active.includes('steals'))   pts += (base.steals   || 0) * (w.steals   || 1);
      if (active.includes('blocks'))   pts += (base.blocks   || 0) * (w.blocks   || 1);
      total += pts;
    }
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
  if (page === 'profile') { try { renderProfile(); } catch (e) { console.error('renderProfile', e); } }
  if (page === 'settings') { try { syncNotifUI(); } catch (e) {} }
  if (page === 'news') { try { renderNews(); } catch (e) { console.error('renderNews', e); } }
  // Keep right panel fresh on every navigation
  try { renderRightPanel(); } catch (e) { }
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
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
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
  var intro  = document.getElementById('mmIntro');

  // Reset reveal & opacity so entrances always replay cleanly
  splash.classList.remove('reveal');
  splash.style.opacity   = '0';
  splash.style.transition = '';
  splash.style.display   = 'flex';

  renderSavedLeagues();
  checkInviteURL();

  if (fromInit && intro) {
    // ── Bracket intro → crossfade → element entrances ────────
    // Reset any leftover intro state from a previous run
    intro.classList.remove('playing');
    intro.style.opacity    = '';
    intro.style.transition = '';
    void intro.offsetWidth; // flush pending styles

    // Show intro and kick off animations
    intro.style.display = 'flex';
    void intro.offsetWidth; // reflow so animations start clean
    intro.classList.add('playing');

    // 2.3s = court drawn, all three tagline words landed + brief hold
    setTimeout(function() {
      // Crisp crossfade
      intro.style.transition  = 'opacity 0.8s ease';
      intro.style.opacity     = '0';
      splash.style.transition = 'opacity 0.8s ease';
      splash.style.opacity    = '1';

      setTimeout(function() {
        // Cleanup intro
        intro.style.display    = 'none';
        intro.style.opacity    = '';
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
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        splash.style.transition = 'opacity 0.3s ease';
        splash.style.opacity    = '1';
        splash.classList.add('reveal');
        setTimeout(function() { splash.style.transition = ''; }, 350);
      });
    });
  }
}

function enterLeague() {
  document.getElementById('landingScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('signupScreen').style.display = 'none';

  // Resume live stat listener if a tournament was already selected
  listenToLiveStats();

  // Fade the splash out smoothly before switching screens
  const splash = document.getElementById('splashScreen');
  splash.style.transition = 'opacity 0.3s ease';
  splash.style.opacity = '0';

  setTimeout(function() {
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
        document.getElementById('mainApp').style.display = 'flex';
        if (state.selectedTournament) generateBracketData(state.selectedTournament);
        render();
        navigateTo('home');
        updateCommissionerVisibility();
        resumeTimerIfRunning();
      }, 1150);
    } else {
      document.getElementById('mainApp').style.display = 'flex';
      if (state.selectedTournament) generateBracketData(state.selectedTournament);
      render();
      navigateTo('home');
      updateCommissionerVisibility();
      resumeTimerIfRunning();
    }
  }, 300);
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
  const email    = (document.getElementById('loginEmail').value || '').trim();
  const password = (document.getElementById('loginPassword').value || '');
  const errEl    = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (!email.includes('@')) { errEl.textContent = 'Enter a valid email.'; errEl.style.display = 'block'; return; }
  if (password.length < 6)  { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }

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
          state = Object.assign({}, defaultState);
          state.players = (window.MM_PLAYERS || []).slice();
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
  const email    = (document.getElementById('signupEmail').value || '').trim();
  const password = (document.getElementById('signupPassword').value || '');
  const confirm  = (document.getElementById('signupConfirm').value || '');
  const errEl    = document.getElementById('signupError');
  errEl.style.display = 'none';

  const tosChecked = document.getElementById('tosCheckbox') && document.getElementById('tosCheckbox').checked;
  if (!username)                     { errEl.textContent = 'Display name required.'; errEl.style.display = 'block'; return; }
  if (containsBlockedTerm(username)) { errEl.textContent = 'Please choose a different display name.'; errEl.style.display = 'block'; return; }
  if (!email.includes('@'))          { errEl.textContent = 'Enter a valid email.'; errEl.style.display = 'block'; return; }
  if (password.length < 6)          { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
  if (password !== confirm)          { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
  if (!tosChecked)                   { errEl.textContent = 'You must accept the Terms of Service to create an account.'; errEl.style.display = 'block'; return; }

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
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            })
          : Promise.resolve();
        return writeProfile;
      })
      .then(() => {
        setSession(username, email, window._fbUser ? window._fbUser.uid : null);
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
  state = Object.assign({}, defaultState, saved);
  state.scoring = Object.assign({}, defaultState.scoring, saved.scoring || {});
  state.scoring.weights = Object.assign({}, defaultState.scoring.weights, (saved.scoring || {}).weights || {});
  if (!Array.isArray(state.players) || state.players.length === 0) state.players = (window.MM_PLAYERS || []).slice();
}

function _leagueCardHTML(l) {
  const displayCode = l.leagueCode || l.leagueId || '--';
  const lookupId    = l.leagueId   || l.leagueCode || '--';
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
  container.querySelectorAll('.saved-league-card').forEach(function(card) {
    card.addEventListener('click', function() {
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
    const sorted = leagues.slice().sort(function(a, b) { return (b.lastActive || 0) - (a.lastActive || 0); });
    container.innerHTML = sorted.map(_leagueCardHTML).join('');
    _attachLeagueCardListeners(container);
  } catch (e) { container.innerHTML = '<p class="no-leagues">Could not load leagues.</p>'; }
}

function createLeague() {
  state = Object.assign({}, defaultState);
  state.players = (window.MM_PLAYERS || []).slice();
  state.leagueId = 'league_' + Date.now();
  state.leagueCode = Math.random().toString(36).toUpperCase().slice(2, 8);
  const session = getSession();
  state.commissioner      = session ? session.name  : 'Commissioner';
  state.commissionerEmail = session ? session.email : '';
  state.managers          = session ? [session.name] : ['Commissioner'];
  state.leagueName = 'My League';
  try { localStorage.setItem('mmfantasy-code-' + state.leagueCode, state.leagueId); } catch (e) { }
  addActivity((state.commissioner || 'Commissioner') + ' created the league');
  saveState();
}

// ── INVITE LINK ───────────────────────────────────────────
function getInviteURL(code) {
  return window.location.origin + window.location.pathname + '?join=' + code;
}

function shareInviteLink() {
  if (!state.leagueCode) { toast('No league code yet. Create a league first.', 'error'); return; }
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
    try { sessionStorage.setItem('mmfantasy-pending-join', code); } catch (e) {}
  } else {
    // Check if we saved one before login
    try { code = (sessionStorage.getItem('mmfantasy-pending-join') || '').trim().toUpperCase(); } catch (e) {}
  }
  if (!code) return;
  // Clear the pending join
  try { sessionStorage.removeItem('mmfantasy-pending-join'); } catch (e) {}
  // Open join modal pre-filled
  const input = document.getElementById('joinCodeInput');
  if (input) input.value = code;
  const sub = document.getElementById('joinModalSub');
  if (sub) sub.textContent = 'You were invited! Confirm the code below to join.';
  document.getElementById('joinModal').style.display = 'flex';
}

// ── JOIN LEAGUE ───────────────────────────────────────────
function handleJoin() {
  const code  = (document.getElementById('joinCodeInput').value || '').trim().toUpperCase();
  const errEl = document.getElementById('joinError');
  errEl.style.display = 'none';
  if (code.length !== 6) { errEl.textContent = 'Code must be 6 characters.'; errEl.style.display = 'block'; return; }

  const btn = document.getElementById('joinConfirmBtn');

  function _finalize(saved) {
    const session = getSession();
    const name = session ? session.name : 'Player';
    const max = saved.maxManagers || 8;
    if (!saved.managers.includes(name) && saved.managers.length >= max) {
      errEl.textContent = 'This league is full (' + max + '/' + max + ' managers).';
      errEl.style.display = 'block';
      if (btn) { btn.textContent = 'Join'; btn.disabled = false; }
      return;
    }
    if (!saved.managers.includes(name)) saved.managers.push(name);
    _applyLeagueState(saved);
    saveState();
    document.getElementById('joinModal').style.display = 'none';
    _subscribeLeague(state.leagueCode);
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
const AVATAR_COLORS = ['#4f8ff7','#ff6b35','#34d399','#9b7fff','#f6c54e','#f04040','#06b6d4'];
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
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX = 200;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      canvas.width  = Math.round(img.width  * scale);
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
  document.querySelectorAll('.dit-btn').forEach(function(btn) {
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

  const dcbMgr = document.getElementById('dcbManagerName');
  const dcbTimer = document.getElementById('dcbTimer');
  if (dcbMgr) dcbMgr.textContent = pick ? pick.manager + ' is on the clock' : (complete ? 'Draft complete' : 'Waiting…');
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

function renderDraftGrid() {
  const grid = document.getElementById('draftPlayerGrid');
  if (!grid) return;
  const search = (document.getElementById('draftSearch') ? document.getElementById('draftSearch').value : '').toLowerCase();
  const posFilter = document.getElementById('draftPosFilter') ? document.getElementById('draftPosFilter').value : '';
  const players = getSortedPlayers(search, posFilter);
  if (players.length === 0) { grid.innerHTML = '<div style="padding:20px;color:var(--muted);text-align:center;">No players found.</div>'; return; }
  grid.innerHTML = players.map((p, i) => {
    const isDrafted = !!state.drafted[p.id];
    const fpts = calcFPTS(p);
    const seedCls = p.seed <= 4 ? ' seed-' + p.seed : '';
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

function confirmDraftPick() {
  if (!pendingPickPlayerId) return;
  const pick = currentPick();
  if (!pick) { toast('Draft is complete or not started', 'error'); return; }
  const p = (state.players || []).find(x => x.id === pendingPickPlayerId);
  if (!p || state.drafted[pendingPickPlayerId]) { toast('Player already drafted', 'error'); return; }

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
    addActivity(esc(pick.manager) + ' drafted ' + esc(p.name) + ' (' + pick.label + ')');
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

function simulateScores() {
  // Save current rankings for delta display (persisted)
  const currentRanked = state.managers.slice().sort((a, b) => managerFPTS(b) - managerFPTS(a));
  state.prevRankings = currentRanked.slice();
  simPrevRankings = currentRanked.slice();

  // Save baseline stats on first simulate so we can reset later
  if (!state.baselineStats || Object.keys(state.baselineStats).length === 0) {
    state.baselineStats = {};
    (state.players || []).forEach(p => {
      state.baselineStats[p.id] = { points: p.stats.points, rebounds: p.stats.rebounds, assists: p.stats.assists, steals: p.stats.steals, blocks: p.stats.blocks };
    });
    const resetBtn = document.getElementById('resetStatsBtn');
    if (resetBtn) resetBtn.style.display = '';
  }

  // Randomly increment stats for drafted players only
  Object.keys(state.drafted).forEach(pid => {
    const p = (state.players || []).find(x => x.id === pid);
    if (!p) return;
    p.stats.points    = Math.round((p.stats.points    + Math.random() * 8)   * 10) / 10;
    p.stats.rebounds  = Math.round((p.stats.rebounds  + Math.random() * 4)   * 10) / 10;
    p.stats.assists   = Math.round((p.stats.assists   + Math.random() * 2)   * 10) / 10;
    p.stats.steals    = Math.round((p.stats.steals    + Math.random() * 1)   * 10) / 10;
    p.stats.blocks    = Math.round((p.stats.blocks    + Math.random() * 0.8) * 10) / 10;
  });
  addActivity('Commissioner simulated tournament stats');
  saveState();
  renderStandings();
  renderTeams();
  toast('Stats simulated! Standings updated.', 'success');
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

function resetStats() {
  if (!state.baselineStats || Object.keys(state.baselineStats).length === 0) {
    toast('No baseline to reset to. Simulate first.', 'info');
    return;
  }
  (state.players || []).forEach(p => {
    const base = state.baselineStats[p.id];
    if (base) {
      p.stats.points   = base.points;
      p.stats.rebounds = base.rebounds;
      p.stats.assists  = base.assists;
      p.stats.steals   = base.steals;
      p.stats.blocks   = base.blocks;
    }
  });
  state.baselineStats = {};
  state.prevRankings = [];
  simPrevRankings = [];
  const resetBtn = document.getElementById('resetStatsBtn');
  if (resetBtn) resetBtn.style.display = 'none';
  addActivity('Commissioner reset stats to baseline');
  saveState();
  renderStandings();
  renderTeams();
  toast('Stats reset to baseline.', 'success');
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
    container.innerHTML = '<div class="chat-empty">No messages yet. Say something to the league! 💬</div>';
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
      canSelect: false,
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
      name: 'NCAA Tournament',
      subtitle: '64-team field · 4 regions',
      location: 'Championship: Ford Field, Detroit, MI',
      dates: 'Mar 16 – Apr 5, 2027',
      startMs: new Date('2027-03-16').getTime(),
      bracketFormat: 'ncaa64',
      roundNames: ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8'],
      canSelect: true,
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
      window.MM_BRACKET_DATA.format    = 'ncaa64';
      window.MM_BRACKET_DATA.numRounds = 4;
    }
    return;
  }

  const sorted = (tournament.seededTeams || []).slice().sort((a, b) => a.seed - b.seed);
  const n      = sorted.length;
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
      { top: sorted[0],  bot: sorted[15] },
      { top: sorted[7],  bot: sorted[8]  },
      { top: sorted[4],  bot: sorted[11] },
      { top: sorted[3],  bot: sorted[12] },
      { top: sorted[5],  bot: sorted[10] },
      { top: sorted[2],  bot: sorted[13] },
      { top: sorted[6],  bot: sorted[9]  },
      { top: sorted[1],  bot: sorted[14] }
    ];
  }

  window.MM_BRACKET_DATA = {
    format:     tournament.bracketFormat,
    numRounds:  numRounds,
    roundNames: tournament.roundNames || [],
    regions: [{ name: tournament.name, matchups: matchups }],
    finalFour:    null,
    championship: null
  };
}

// Commissioner calls this to pick a tournament.
// Clears existing bracket state, rebuilds MM_BRACKET_DATA, saves + re-renders.
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
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') return;
        const data = change.doc.data();

        // Match ESPN player name → our players array (normalize case/whitespace)
        const normName = (data.name || '').toLowerCase().trim();
        const player = state.players.find(p =>
          p.name.toLowerCase().trim() === normName
        );
        if (!player) return;

        const totals = data.totals || {};
        const live   = data.live   || {};

        // Fantasy score = committed tournament totals + current live game
        player.stats.points   = (totals.pts || 0) + (live.pts || 0);
        player.stats.rebounds = (totals.reb || 0) + (live.reb || 0);
        player.stats.assists  = (totals.ast || 0) + (live.ast || 0);
        player.stats.steals   = (totals.stl || 0) + (live.stl || 0);
        player.stats.blocks   = (totals.blk || 0) + (live.blk || 0);
        player._liveUpdated   = !!(live.gameId); // flag for UI indicators
      });

      // Refresh standings and projections with new data
      render();
    }, err => {
      console.warn('[LiveStats] Firestore listener error:', err.message);
    });
}

function setSelectedTournament(tournament) {
  state.selectedTournament = tournament;

  // Wipe old bracket picks: new tournament = fresh bracket
  if (state.leagueId) {
    localStorage.removeItem('mmfantasy-bracket-' + state.leagueId);
  }

  generateBracketData(tournament);

  // Filter player pool to only the tournament's teams (use full pool for ncaa64)
  if (tournament.bracketFormat !== 'ncaa64' && tournament.seededTeams && tournament.seededTeams.length) {
    const teamNames = tournament.seededTeams.map(function(t) { return t.name; });
    state.players = (window.MM_PLAYERS || []).filter(function(p) { return teamNames.includes(p.college); });
  } else {
    state.players = (window.MM_PLAYERS || []).slice();
  }

  saveState();
  addActivity('Tournament selected: ' + tournament.name);

  // Tell Cloud Function which tournament is active so it knows what to poll.
  // Only write if there are actual teams (not a "coming soon" tournament).
  if (window._db && tournament.teams && tournament.teams.length > 0) {
    window._db.collection('meta').doc('activeTournaments').set({
      [tournament.id]: {
        name:   tournament.name,
        teams:  tournament.teams,
        active: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }
    }, { merge: true }).catch(function(e) {
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
  try { renderHome(); } catch (e) {}
  try { renderBracket(); } catch (e) {}
  try { renderDraft(); } catch (e) {}
  try { renderStandings(); } catch (e) {}

  // Start live stat sync for this tournament
  listenToLiveStats();
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
    tab.addEventListener('click', function() {
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
  const body  = document.getElementById('tsmBody');
  if (!body)  return;

  function sectionHtml(label, items) {
    let html = '<div class="tsm-section"><div class="tsm-section-label">' + label + '</div>';
    items.forEach(function(t) {
      const selected   = state.selectedTournament && state.selectedTournament.id === t.id;
      const selectable = t.canSelect !== false;
      html += '<div class="tsm-item' +
        (selected   ? ' tsm-item--selected'  : '') +
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

  body.querySelectorAll('.tsm-select-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const t = findTournamentById(btn.dataset.tid);
      if (t) setSelectedTournament(t);
    });
  });

  modal.style.display = 'flex';
}

function renderTournamentBanner() {
  const banner = document.getElementById('tournamentBanner');
  if (!banner) return;
  const t     = state.selectedTournament;
  const isCom = isCommissioner();
  const away  = t ? _tournDaysAway(t.startMs) : null;

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
    items.forEach(function(t) {
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
  el.querySelectorAll('.tourn-card--locked').forEach(function(card) {
    card.addEventListener('click', function() {
      toast('This tournament is coming soon. Check back as the season approaches!', 'info');
    });
  });

  // Wire "View Bracket" buttons
  el.querySelectorAll('.tourn-bracket-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
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
    : (t.teams || []).map(function(name, i) { return { name: name, seed: i + 1 }; });

  const n = seeded.length;
  if (!n) {
    bodyEl.innerHTML = '<div class="bpm-empty">Bracket not available yet.</div>';
    modal.style.display = 'flex';
    return;
  }

  const rounds = Math.ceil(Math.log2(n));
  const roundNames = t.roundNames || (function() {
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
  const defaultRoundNames = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8'];
  const roundNames  = customRoundNames || defaultRoundNames;
  const numRounds   = roundNames.length;
  const roundWinners = bracketData.regions[region] || Array(numRounds).fill(null).map(() => []);
  const canEdit = false; // Bracket is read-only; winners are set by live data feed

  const seedMap = {};
  (regData.matchups || []).forEach(mu => {
    if (mu.top && mu.top.name) seedMap[mu.top.name] = mu.top.seed;
    if (mu.bot && mu.bot.name) seedMap[mu.bot.name] = mu.bot.seed;
  });

  const makeTeamRow = (team, won, lost, rnd, m) => {
    if (!team) return '<div class="br-team br-tbd"><span class="br-seed">-</span><span class="br-name">TBD</span></div>';
    const matchWinner = (roundWinners[rnd] || [])[m] || null;
    const clickable = canEdit && !matchWinner;
    const editAttr = clickable ? ' data-team="' + esc(team.name) + '" data-rnd="' + rnd + '" data-match="' + m + '"' : '';
    let cls = 'br-team';
    if (won)       cls += ' br-winner';
    if (lost)      cls += ' br-loser';
    if (clickable) cls += ' br-clickable';
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
    const prev       = rnd === 0 ? null : (roundWinners[rnd - 1] || []);
    const unlocked   = rnd === 0 || (prev && prev.filter(Boolean).length >= matchCount * 2);

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

  content.querySelectorAll('.br-stats-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
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
    mu.querySelectorAll('.br-stats-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); openGameModal(btn.dataset.top, btn.dataset.bot, btn.dataset.round); });
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
  champMu.querySelectorAll('.br-stats-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation(); openGameModal(btn.dataset.top, btn.dataset.bot, btn.dataset.round); });
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
  const topLogo   = document.getElementById('gmTopLogo');
  const botLogo   = document.getElementById('gmBotLogo');
  const topNameEl = document.getElementById('gmTopName');
  const botNameEl = document.getElementById('gmBotName');
  const roundEl   = document.getElementById('gmRoundLabel');

  if (topLogo)   topLogo.innerHTML  = topName ? getSchoolLogoHTML(topName, 36) : '';
  if (botLogo)   botLogo.innerHTML  = botName ? getSchoolLogoHTML(botName, 36) : '';
  if (topNameEl) topNameEl.textContent = topName || 'TBD';
  if (botNameEl) botNameEl.textContent = botName || 'TBD';
  if (roundEl)   roundEl.textContent  = roundLabel || '';

  // Score + status: empty until live data arrives
  const topScore = document.getElementById('gmTopScore');
  const botScore = document.getElementById('gmBotScore');
  const period   = document.getElementById('gmPeriod');
  if (topScore) topScore.textContent = '-';
  if (botScore) botScore.textContent = '-';
  if (period)   period.textContent   = '';

  // Stats labels
  const topLabel = document.getElementById('gmTopStatsLabel');
  const botLabel = document.getElementById('gmBotStatsLabel');
  if (topLabel) topLabel.textContent = topName || 'TBD';
  if (botLabel) botLabel.textContent = botName || 'TBD';

  // Build player rows (empty live stats — ready for data feed)
  function buildRows(college, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const players = (state.players || window.MM_PLAYERS || []).filter(function(p) {
      return p.college && p.college.toLowerCase() === (college || '').toLowerCase();
    });
    if (!players.length) {
      container.innerHTML = '<div class="gm-no-players">No player data yet</div>';
      return;
    }
    container.innerHTML = players.map(function(p) {
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

  modal.style.display = 'flex';
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
  state.pickTimerStartedAt = Date.now();
  state.timerRunning = true;
  saveState();
  updateTimerBtnState();
  timerInterval = setInterval(tickTimer, 500);
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

function autoPickForCurrent() {
  const pick = currentPick();
  if (!pick) return;
  const players = getSortedPlayers('', '').filter(p => !state.drafted[p.id]);
  if (players.length === 0) return;
  const best = players[0];
  state.drafted[best.id] = { manager: pick.manager, round: pick.round, pick: pick.pick, pickNumber: pick.pickNumber, label: pick.label, ts: Date.now() };
  state.currentPickIndex++;
  addActivity('Auto-pick: ' + esc(pick.manager) + ' was assigned ' + esc(best.name));
  if (isDraftComplete()) {
    clearInterval(timerInterval);
    state.timerRunning = false;
    state.pickTimerStartedAt = null;
  } else if (state.timerRunning) {
    state.pickTimerStartedAt = Date.now();
  }
  saveState();
  render();
  toast(pick.manager + ' auto-picked ' + best.name, 'info');
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
    el.innerHTML = '<div class="rp-empty">No messages yet. Say something! 💬</div>';
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
  { type: 'welcome',    title: 'Welcome, Commissioner', body: "You're setting up a Tipoff Fantasy league. This takes about 60 seconds." },
  { type: 'name',       title: 'League Name', body: 'What do you want to call your league?', input: [{ id: 'tut-league-name', label: 'League Name', placeholder: 'e.g. March Madness 2026', default: 'My League', key: 'leagueName' }] },
  { type: 'tournament', title: 'Choose Tournament', body: "Which tournament is this league drafting for? This sets your player pool and bracket format." },
  { type: 'size',       title: 'League Size', body: 'How many managers will join? Once the league is full, no one else can join with the code.', size: true },
  { type: 'rounds',     title: 'Draft Rounds', body: 'How many rounds in the snake draft? Each round, every manager picks one player.', input: [{ id: 'tut-rounds', label: 'Number of Rounds', placeholder: '8', default: 8, type: 'number', key: 'rounds' }] },
  { type: 'timer',    title: 'Pick Timer', body: 'How long does each manager have to make their selection before auto-pick kicks in?', input: [{ id: 'tut-timer-min', label: 'Minutes', placeholder: '1', default: 1, type: 'number', key: 'timerMin' }, { id: 'tut-timer-sec', label: 'Seconds', placeholder: '30', default: 30, type: 'number', key: 'timerSec' }] },
  { type: 'code',     title: 'Your League Code', body: 'Share this code with your managers. They join from the home screen. No account needed..', code: true },
  { type: 'scoring',  title: 'How Scoring Works', body: 'Points are earned from real tournament stats. Default weights: PTS 1× · REB 1.2× · AST 1.5× · STL 2× · BLK 2×. Adjust anytime in Settings.' },
  { type: 'ready',    title: "You're All Set", body: 'Your league is live. Share the code, wait for your managers to join, then choose a tournament and start the draft.' }
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
    navigateTo('players');
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
    Object.values(TOURNAMENTS).forEach(function(g) { g.forEach(function(t) { allT.push(t); }); });
    const chosen = allT.find(function(t) { return t.id === tutData.tournamentId; });
    if (chosen) {
      state.selectedTournament = chosen;
      generateBracketData(chosen);
      if (chosen.bracketFormat !== 'ncaa64' && chosen.seededTeams && chosen.seededTeams.length) {
        const teamNames = chosen.seededTeams.map(function(t) { return t.name; });
        state.players = (window.MM_PLAYERS || []).filter(function(p) { return teamNames.includes(p.college); });
      } else {
        state.players = (window.MM_PLAYERS || []).slice();
      }
      addActivity('Tournament selected: ' + chosen.name);
    }
  }
}

function renderTutStep() {
  const step = TUT_STEPS[tutStep];
  const bodyEl  = document.getElementById('tutBody');
  const fillEl  = document.getElementById('tutBarFill');
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
    step.input.forEach(function(inp) {
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
    [4, 6, 8, 10, 12].forEach(function(n) {
      html += '<button class="tut-size-pill' + (cur === n ? ' tut-size-pill--active' : '') + '" data-size="' + n + '">' +
        '<span class="tut-size-num">' + n + '</span>' +
        '<span class="tut-size-label">players</span>' +
        '</button>';
    });
    html += '</div>';
  }

  if (step.type === 'tournament') {
    const available = [];
    Object.values(TOURNAMENTS).forEach(function(group) {
      group.forEach(function(t) { if (!t.comingSoon && t.canSelect !== false) available.push(t); });
    });
    const selId = tutData.tournamentId;
    html += '<div class="tut-tourn-list">';
    available.forEach(function(t) {
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
  bodyEl.querySelectorAll('.tut-tourn-card').forEach(function(card) {
    card.addEventListener('click', function() {
      tutData.tournamentId = card.dataset.tid;
      bodyEl.querySelectorAll('.tut-tourn-card').forEach(function(c) { c.classList.remove('tut-tourn-card--active'); });
      card.classList.add('tut-tourn-card--active');
    });
  });

  // Wire size pills
  bodyEl.querySelectorAll('.tut-size-pill').forEach(function(pill) {
    pill.addEventListener('click', function() {
      tutData.maxManagers = pill.dataset.size;
      bodyEl.querySelectorAll('.tut-size-pill').forEach(function(p) { p.classList.remove('tut-size-pill--active'); });
      pill.classList.add('tut-size-pill--active');
    });
  });

  // Wire copy button
  const copyBtn = document.getElementById('tutCopyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      const code = state.leagueCode || '';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(function() { copyBtn.textContent = 'Copied!'; setTimeout(function() { copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Code'; }, 2000); });
      }
    });
  }

  if (backBtn) backBtn.style.visibility = tutStep === 0 ? 'hidden' : 'visible';
  if (nextBtn) nextBtn.textContent = tutStep === TUT_STEPS.length - 1 ? "Let's Go!" : 'Continue';
}

// ── HELPERS ───────────────────────────────────────────────
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
  const h = Math.floor(diff / 3600000);  diff -= h * 3600000;
  const m = Math.floor(diff / 60000);    diff -= m * 60000;
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
    const pad = function(n) { return String(n).padStart(2, '0'); };
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
  _scheduleTick = setInterval(function() {
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
  return t.teams.map(function(name) { return name.toLowerCase(); });
}

function articleMatchesTournament(article, teamNames) {
  if (!teamNames) return true;
  // Build a haystack from headline, description, and category descriptions
  const cats = (article.categories || []).map(function(c) { return c.description || ''; }).join(' ');
  const haystack = [
    article.headline || '',
    article.description || '',
    cats
  ].join(' ').toLowerCase();
  return teamNames.some(function(t) { return haystack.includes(t); });
}

function articleTeamTag(article) {
  // Pick the first "team" category if available, else first category, else "CBB"
  var cats = article.categories || [];
  var teamCat = cats.find(function(c) { return c.type === 'team'; });
  if (teamCat && teamCat.shortName) return teamCat.shortName;
  if (teamCat && teamCat.description) return teamCat.description.split(' ').slice(-1)[0]; // last word = school name
  var leagueCat = cats.find(function(c) { return c.type === 'league'; });
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
  var subtitle = document.getElementById('newsSubtitle');
  var refreshBtn = document.getElementById('newsRefreshBtn');

  if (!feed) return;

  // Wire refresh button (idempotent)
  if (refreshBtn && !refreshBtn._newsWired) {
    refreshBtn._newsWired = true;
    refreshBtn.addEventListener('click', function() { renderNews(true); });
  }

  // Update subtitle
  var t = state.selectedTournament;
  if (subtitle) {
    subtitle.textContent = (t && t.name) ? t.name : 'College Basketball';
  }

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
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      _newsFetching = false;
      var articles = data.articles || [];
      _newsCache = articles;
      displayNewsArticles(articles, feed);
    })
    .catch(function(err) {
      _newsFetching = false;
      feed.innerHTML = '<div class="news-empty"><p>Could not load news.</p><p style="font-size:0.8em;opacity:0.6;">' + esc(err.message) + '</p></div>';
    });
}

function displayNewsArticles(articles, feed) {
  var teamNames = getActiveTeamNames();
  var filtered = articles.filter(function(a) {
    return articleMatchesTournament(a, teamNames);
  });

  // Sort newest first
  filtered.sort(function(a, b) {
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
    state.players = (window.MM_PLAYERS || []).slice();
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
      btn.querySelector('.eye-open').style.display  = showing ? 'block' : 'none';
      btn.querySelector('.eye-closed').style.display = showing ? 'none'  : 'block';
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });

  // ── TERMS OF SERVICE ──────────────────────────────────────
  const tosCheckbox   = document.getElementById('tosCheckbox');
  const tosSubmitBtn  = document.getElementById('signupSubmitBtn');
  const tosModal      = document.getElementById('tosModal');
  if (tosCheckbox && tosSubmitBtn) {
    tosCheckbox.addEventListener('change', function() {
      tosSubmitBtn.disabled = !this.checked;
    });
  }
  document.getElementById('openTosBtn')?.addEventListener('click', function(e) {
    e.preventDefault();
    if (tosModal) tosModal.style.display = 'flex';
  });
  document.getElementById('closeTosBtn')?.addEventListener('click', function() {
    if (tosModal) tosModal.style.display = 'none';
  });
  document.getElementById('tosDeclineBtn')?.addEventListener('click', function() {
    if (tosCheckbox) tosCheckbox.checked = false;
    if (tosSubmitBtn) tosSubmitBtn.disabled = true;
    if (tosModal) tosModal.style.display = 'none';
  });
  document.getElementById('tosAcceptBtn')?.addEventListener('click', function() {
    if (tosCheckbox) { tosCheckbox.checked = true; tosSubmitBtn.disabled = false; }
    if (tosModal) tosModal.style.display = 'none';
  });
  // Close on backdrop click
  tosModal?.addEventListener('click', function(e) {
    if (e.target === tosModal) tosModal.style.display = 'none';
  });
  function doSignOut() {
    if (_leagueUnsubscribe) { _leagueUnsubscribe(); _leagueUnsubscribe = null; }
    if (window._auth && window._auth.currentUser) {
      window._auth.signOut().catch(e => console.warn('[Auth] signOut error:', e));
    }
    clearSession();
    state = Object.assign({}, defaultState);
    state.players = (window.MM_PLAYERS || []).slice();
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
  document.getElementById('gameModal')?.addEventListener('click', function(e) { if (e.target.id === 'gameModal') closeGameModal(); });
  document.getElementById('pdcOverlay')?.addEventListener('click', e => { if (e.target.id === 'pdcOverlay') closePDC(); });
  // Standings simulate + reset
  document.getElementById('simulateBtn')?.addEventListener('click', simulateScores);
  document.getElementById('resetStatsBtn')?.addEventListener('click', resetStats);
  // Show reset button if baseline exists on load
  if (state.baselineStats && Object.keys(state.baselineStats).length > 0) {
    const resetBtn = document.getElementById('resetStatsBtn');
    if (resetBtn) resetBtn.style.display = '';
  }

  // Draft undo
  document.getElementById('undoPickBtn')?.addEventListener('click', undoLastPick);

  // Bracket view toggle
  const bvtYour = document.getElementById('bvtYourBracket');
  const bvtTourn = document.getElementById('bvtTournaments');
  const yourBracketView = document.getElementById('yourBracketView');
  const tournamentsView = document.getElementById('tournamentsView');
  if (bvtYour && bvtTourn) {
    bvtYour.addEventListener('click', function() {
      bvtYour.classList.add('active');
      bvtTourn.classList.remove('active');
      yourBracketView.style.display = '';
      tournamentsView.style.display = 'none';
    });
    bvtTourn.addEventListener('click', function() {
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
  document.getElementById('tsmClose')?.addEventListener('click', function() {
    const modal = document.getElementById('tournamentSelectModal');
    if (modal) modal.style.display = 'none';
  });
  document.getElementById('tournamentSelectModal')?.addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
  });

  // Bracket preview modal
  document.getElementById('bpmClose')?.addEventListener('click', closeBracketPreview);
  document.getElementById('bracketPreviewModal')?.addEventListener('click', function(e) {
    if (e.target === this) closeBracketPreview();
  });

  // Settings
  document.getElementById('saveScoringBtn')?.addEventListener('click', () => {
    const draftStarted = state.currentPickIndex > 0;
    if (draftStarted && !confirm('Changing scoring mid-draft will recalculate all FPTS values retroactively. Continue?')) return;
    const cats = ['points', 'rebounds', 'assists', 'steals', 'blocks'];
    state.scoring.active = cats.filter(c => document.getElementById(c + 'Toggle')?.checked);
    cats.forEach(c => {
      const wt = parseFloat(document.getElementById(c + 'Weight')?.value);
      if (!isNaN(wt)) state.scoring.weights[c] = wt;
    });
    saveState();
    render();
    toast('Scoring saved!', 'success');
  });
  document.getElementById('saveTimerBtn')?.addEventListener('click', () => {
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
    state.baselineStats = {};
    state.prevRankings = [];
    state.activityFeed = [];
    // Reset player stats back to data file defaults
    state.players = (window.MM_PLAYERS || []).slice();
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
  document.getElementById('dissolveConfirmBtn')?.addEventListener('click', () => {
    if (state.leagueId) {
      localStorage.removeItem('mmfantasy-state');
      localStorage.removeItem('mmfantasy-league-' + state.leagueId);
      localStorage.removeItem('mmfantasy-bracket-' + state.leagueId);
      localStorage.removeItem('mmfantasy-code-' + state.leagueCode);
      // Remove from index
      try {
        const raw = localStorage.getItem('mmfantasy-leagues');
        if (raw) {
          const leagues = JSON.parse(raw).filter(l => l.leagueId !== state.leagueId);
          localStorage.setItem('mmfantasy-leagues', JSON.stringify(leagues));
        }
      } catch (e) { }
    }
    clearInterval(timerInterval);
    state = Object.assign({}, defaultState);
    state.players = (window.MM_PLAYERS || []).slice();
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
      try { sessionStorage.setItem('mmfantasy-pending-join', urlCode); } catch (e) {}
      history.replaceState(null, '', window.location.pathname + (window.location.hash || ''));
    }
  })();

  // ── BOOT ──────────────────────────────────────────────────
  let _authBootFired = false;
  if (window._auth) {
    window._auth.onAuthStateChanged(function(user) {
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
          state = Object.assign({}, defaultState);
          state.players = (window.MM_PLAYERS || []).slice();
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
  } catch(e) {}

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
  try { localStorage.setItem('mmfantasy-notif', v ? '1' : '0'); } catch (e) {}
}

async function requestNotifPermission() {
  if (!notifSupported()) return false;
  if (Notification.permission === 'granted') { setNotifPref(true); return true; }
  if (Notification.permission === 'denied') { setNotifPref(false); return false; }
  const result = await Notification.requestPermission();
  const granted = result === 'granted';
  setNotifPref(granted);
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
    try { new Notification("⏰ You're on the clock!", { body, icon: './icons/icon-192.png' }); } catch (_) {}
  }
}

// Listen for SW telling us to jump to draft (notification tap when tab was open)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'OTC_FOCUS_DRAFT') navigateTo('players');
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
        try { renderPlayerPool(); } catch (e) {}
      } else {
        try { renderDraftGrid(); } catch (e) {}
        try { renderDraftFeed(); } catch (e) {}
        try { renderDraftOrderStrip(); } catch (e) {}
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
      // Use baseline stats for projection if simulation has inflated current stats
      const base = state.baselineStats && state.baselineStats[pid];
      const statSource = base ? Object.assign({}, p, { stats: base }) : p;
      const perGame = calcFPTS(statSource);
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
  const list  = document.getElementById('projList');
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
// FAB DRAFT: floating action button visibility
// ══════════════════════════════════════════════════════════
function initFABDraft() {
  const fab = document.getElementById('draftFab');
  if (!fab) return;

  function syncFab() {
    const onDraft = document.getElementById('playersPage')?.classList.contains('active-page');
    if (onDraft && isCommissioner()) {
      fab.style.display = 'flex';
    } else {
      fab.style.display = 'none';
    }
  }

  // Autopick on tap: most useful single-tap action on mobile
  fab.addEventListener('click', () => {
    const btn = document.getElementById('autopickBtn');
    if (btn) btn.click();
  });

  // Sync when navigating between pages
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => setTimeout(syncFab, 50));
  });

  syncFab();
}
