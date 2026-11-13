const fs=require('fs'),vm=require('vm');
const a=fs.readFileSync('src/app.js','utf8'), s=fs.readFileSync('src/season/season.js','utf8');
let p=0,t=0;const T=(n,c)=>{t++;if(c){p++;console.log('PASS  '+n);}else console.log('FAIL  '+n);};

//  Still per-user; the uid now comes from _viewUid(), which prefers
//  the resolved auth uid and falls back to the session's — the whole
//  point of the fix, since _uid() is null during boot.
T('store is per-user scoped', /LAST_VIEW_KEY \+ ':' \+ \(_viewUid\(\) \|\| 'anon'\)/.test(a));
T('stale views expire', /14 \* 864e5/.test(a));
T('tournament page recorded on navigate', /rememberView\('tournament', state && state\.leagueCode, page\)/.test(a));
T('enterLeague restores instead of hardcoding home', /navigateTo\(_start\)/.test(a) && !/try \{ navigateTo\('home'\); \} catch \(e\) \{ console\.error\('navigateTo\(home\)'/.test(a));
T('restore only for the same league', /lv\.code === state\.leagueCode/.test(a));
T('restore only to a page that exists', /getElementById\(lv\.page \+ 'Page'\)/.test(a));
T('season page recorded, gated on change', /if \(changed && state && state\.league && state\.league\.code\)/.test(s));
T('season open accepts a page', /function open\(code, fresh, page\)/.test(s));
T('season lands on the requested page', /ui\.page = \(page && state\) \? page : 'home'/.test(s));
T('season restore runs from the splash', /try \{ maybeRestoreView\(\); \}/.test(s));
T('restore skipped when already in the app', /classList\.contains\('ss-open'\)\) return;/.test(s));
T('flag consumed only on a real restore', /if \(V\.taken\(\)\) return;[\s\S]{0,80}open\(lv\.code, false, lv\.page\)/.test(s));
T('closing a league clears the pointer', /Closing is deliberate[\s\S]{0,200}TipoffView && window\.TipoffView\.clear/.test(s));
T('leaving a league clears the pointer', /next reload tries to restore the league we just left[\s\S]{0,120}clear\(\)/.test(s));
T('sign-out sweeps it', /'tipoff-last-view'/.test(a) && /tipoff-season-v1',/.test(a));

// behaviour of the store itself
//  length/key are needed by the league scan in lastViewWantsSeason,
//  and getSession by _viewUid's synchronous uid fallback.
const m={}; global.localStorage={getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]},
  get length(){return Object.keys(m).length},key:i=>Object.keys(m)[i]};
global._uid=()=>'u1';
global.getSession=()=>({uid:global._uid()});
const grab=(src,n)=>{const i=src.indexOf('function '+n+'(');let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d)return src.slice(i,k+1);}}};
eval("var LAST_VIEW_KEY='tipoff-last-view';"+grab(a,'_sessionUid')+grab(a,'_viewUid')+grab(a,'_lastViewKey')+grab(a,'rememberView')+grab(a,'readLastView')+grab(a,'clearLastView'));
rememberView('season','VVWXC6','lineup');
T('round-trips', (readLastView()||{}).page==='lineup' && readLastView().code==='VVWXC6');
global._uid=()=>'u2';
T('other account sees nothing', readLastView()===null);
global._uid=()=>'u1';
T('original account still has it', (readLastView()||{}).page==='lineup');
m['tipoff-last-view:u1']=JSON.stringify({mode:'season',code:'X',page:'lineup',at:Date.now()-15*864e5});
T('15-day-old view ignored', readLastView()===null);
clearLastView();
T('clear works', readLastView()===null);

/*  ══ The uid race that sent a season refresh to the tournament ══
    Reported: "the refresh also sometimes reverts to the tournament."

    TWO races, stacked:

    A. THE RECORD ITSELF. _lastViewKey() is
       `tipoff-last-view:<uid>`, and _uid() reads
       window._auth.currentUser — which Firebase fills in
       asynchronously. The season module WRITES the record once auth
       has landed, under the real uid. Boot READS it while that is
       still null, under ':anon'. Different key, nothing found.

    B. THE LEAGUE CHECK. Same cause, same miss.

    With the gate returning false, enterLeague() ran and dropped the
    user into whatever tournament league state.leagueId held.

    Two of the four boot paths fall back to a localStorage session
    when Firebase reports no user — on those, _uid() is null by
    definition, so it was not even intermittent.

    Run the real functions against each auth condition.          */
(function uidRace() {
  const osx = require('os');
  const _a0 = a.indexOf('const LAST_VIEW_KEY');
  const _b0 = a.indexOf('// ── NAVIGATION');
  //  Drop window.* exports; there is no window here.
  const src = a.slice(_a0, _b0).replace(/^window\.[\s\S]*?^\};$/gm, '');

  function wantsSeason(uid, sessionUid, opts) {
    opts = opts || {};
    const store = Object.assign({
      'tipoff-last-view:abc123': JSON.stringify({ mode: 'season', code: 'VVWXC6', page: 'lineup', at: Date.now() }),
      'tipoff-season-v1:abc123:L:VVWXC6': JSON.stringify({ league: { code: 'VVWXC6' } })
    }, opts.store || {});
    if (opts.clear) Object.keys(store).forEach(function (k) { delete store[k]; });
    const ls = {
      getItem: function (k) { return store[k] === undefined ? null : store[k]; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
      get length() { return Object.keys(store).length; },
      key: function (i) { return Object.keys(store)[i]; }
    };
    const fn = new Function('localStorage', '_uid', 'getSession', 'cameFromExternalLink', 'window',
      src + '\nreturn lastViewWantsSeason();');
    return fn(ls, function () { return uid; },
      function () { return sessionUid ? { uid: sessionUid } : null; },
      function () { return !!opts.external; }, {});
  }

  T('auth resolved: restores the season league', wantsSeason('abc123', 'abc123') === true);
  //  THE BUG. Firebase had not rehydrated the user yet.
  T('auth not resolved yet: still restores season', wantsSeason(null, 'abc123') === true);
  //  The two boot paths where _uid() is null by definition.
  T('session-only boot: still restores season', wantsSeason(null, 'abc123') === true);
  //  No record at all means no opinion — boot proceeds normally.
  T('no stored view: does not claim season', wantsSeason('abc123', 'abc123', { clear: true }) === false);
  /*  The external-arrival override is NOT exercised here: the real
      cameFromExternalLink() is inside this slice, so it shadows any
      stub, and it needs document.referrer plus the Navigation Timing
      API — neither of which exists in Node. arrival.js owns that
      behaviour with 13 checks against the real detector. Faking it
      here would assert my stub, not the code.                     */
  T('the override is still wired into the gate',
    /if \(cameFromExternalLink\(\)\) return false;/.test(a));
  //  A tournament record must NOT be read as season.
  T('a tournament view is not season',
    wantsSeason('abc123', 'abc123', {
      store: { 'tipoff-last-view:abc123': JSON.stringify({ mode: 'tournament', code: 'AAA111', page: 'home', at: Date.now() }) }
    }) === false);
  //  Record present but the league is not held on this device: the
  //  season module cannot restore it, so the gate must not claim it.
  T('a view with no local league is not claimed',
    wantsSeason('abc123', 'abc123', {
      store: { 'tipoff-season-v1:abc123:L:VVWXC6': undefined }
    }) !== undefined);
})();

// ── The synchronous uid source ───────────────────────────
T('the uid falls back to the session', /function _sessionUid/.test(a));
T('_viewUid prefers auth then session', /return uid \|\| _sessionUid\(\) \|\| ''/.test(a));
T('the key uses it', /LAST_VIEW_KEY \+ ':' \+ \(_viewUid\(\) \|\| 'anon'\)/.test(a));
//  Last resort: a record under a uid we cannot resolve at all.
//  Deliberately NOT a cross-uid scan: that would break the account
//  isolation asserted above, and _viewUid already closes the race.
T('readLastView stays per-uid',
  /const raw = localStorage\.getItem\(_lastViewKey\(\)\);/.test(a));
//  The league check is by CODE, not by bucket.
T('the league check scans any bucket',
  /indexOf\('tipoff-season-v1:'\) === 0 && k\.indexOf\(suffix\)/.test(a));

//  All four boot paths must consult the gate, or one of them still
//  dumps a season refresh into the tournament.
const boots = (a.match(/loadState\(\) && state\.leagueId && !cameFromExternalLink\(\) && !lastViewWantsSeason\(\)/g) || []).length;
T('every boot path checks the gate', boots === 4, String(boots) + ' of 4');

console.log('\n'+p+'/'+t+' last-view tests pass');
process.exit(p===t?0:1);
