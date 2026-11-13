const fs=require('fs');
const a=fs.readFileSync('src/app.js','utf8'), s=fs.readFileSync('src/season/season.js','utf8');
let p=0,t=0;const T=(n,c)=>{t++;if(c){p++;console.log('PASS  '+n);}else console.log('FAIL  '+n);};

// --- bug 1: no double-open ---
T('onScreen read BEFORE renderSplashCard',
  /var onScreen = el && document\.body\.classList\.contains\('ss-open'\);[\s\S]{0,400}renderSplashCard\(\);/.test(s));
T('restore cannot trigger a second open',
  !/renderSplashCard\(\); \} catch \(e\) \{ \}\s*\n\s*\/\/ If the season app is on screen[\s\S]{0,200}contains\('ss-open'\)/.test(s));

// --- bug 2: season wins the boot when it was the last view ---
T('all four boot branches consult the last view',
  (a.match(/&& !lastViewWantsSeason\(\)/g)||[]).length===4);
T('helper exists', /function lastViewWantsSeason\(\)/.test(a));
//  The league check is by CODE across any bucket now: keying it on
//  the uid raced with Firebase's async auth and a season refresh
//  landed in the tournament. See lastview.js for the full account.
T('helper requires the league to be held locally',
  /const suffix = ':L:' \+ code;/.test(a) && /indexOf\('tipoff-season-v1:'\) === 0/.test(a));
T('helper ignores external arrivals', /if \(cameFromExternalLink\(\)\) return false;/.test(a));

// --- behaviour of the helper ---
//  length/key are required by the by-code league scan, and
//  getSession by _viewUid's synchronous uid fallback.
const m={}; global.localStorage={getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]},
  get length(){return Object.keys(m).length},key:i=>Object.keys(m)[i]};
global._uid=()=>'u1';
global.getSession=()=>({uid:global._uid()});
global.performance={getEntriesByType:()=>[{type:'reload'}]};
global.document={referrer:''}; global.location={hostname:'app.tipofffantasy.com'}; global.URL=URL;
const grab=(src,n)=>{const i=src.indexOf('function '+n+'(');let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d)return src.slice(i,k+1);}}};
eval("var LAST_VIEW_KEY='tipoff-last-view';"+grab(a,'_sessionUid')+grab(a,'_viewUid')+grab(a,'_lastViewKey')
     +grab(a,'rememberView')+grab(a,'readLastView')
     +grab(a,'cameFromExternalLink')+grab(a,'lastViewWantsSeason'));

T('no last view -> tournament boot wins', lastViewWantsSeason()===false);
rememberView('season','VVWXC6','home');
T('season remembered but league NOT held -> tournament still wins', lastViewWantsSeason()===false);
m['tipoff-season-v1:u1:L:VVWXC6']='{"league":{"code":"VVWXC6"}}';
T('season remembered AND held -> season wins', lastViewWantsSeason()===true);
rememberView('tournament','ABC123','bracket');
T('tournament last view -> tournament wins', lastViewWantsSeason()===false);
rememberView('season','vvwxc6','home');
T('lowercase code still resolves', lastViewWantsSeason()===true);
global.performance={getEntriesByType:()=>[{type:'navigate'}]};
global.document={referrer:'https://tipofffantasy.com/'};
T('external arrival overrides -> splash, not season', lastViewWantsSeason()===false);

console.log('\n'+p+'/'+t+' mode-boot tests pass');
process.exit(p===t?0:1);
