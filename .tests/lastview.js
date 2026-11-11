const fs=require('fs'),vm=require('vm');
const a=fs.readFileSync('src/app.js','utf8'), s=fs.readFileSync('src/season/season.js','utf8');
let p=0,t=0;const T=(n,c)=>{t++;if(c){p++;console.log('PASS  '+n);}else console.log('FAIL  '+n);};

T('store is per-user scoped', /LAST_VIEW_KEY \+ ':' \+ \(uid \|\| 'anon'\)/.test(a));
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
const m={}; global.localStorage={getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]}};
global._uid=()=>'u1';
const grab=(src,n)=>{const i=src.indexOf('function '+n+'(');let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d)return src.slice(i,k+1);}}};
eval("var LAST_VIEW_KEY='tipoff-last-view';"+grab(a,'_lastViewKey')+grab(a,'rememberView')+grab(a,'readLastView')+grab(a,'clearLastView'));
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

console.log('\n'+p+'/'+t+' last-view tests pass');
process.exit(p===t?0:1);
