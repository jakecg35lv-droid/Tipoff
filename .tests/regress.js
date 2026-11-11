const fs=require('fs'),vm=require('vm');
const s=fs.readFileSync('src/season/season.js','utf8');
const a=fs.readFileSync('src/app.js','utf8');
function grab(src,n){const i=src.indexOf('function '+n+'(');if(i<0)throw new Error('missing '+n);
let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d)return src.slice(i,k+1);}}}
let p=0,t=0;const T=(n,c)=>{t++;if(c){p++;}else console.log('FAIL  '+n);};

// ---- storage / multi-league (v218-v221) ----
function LS(){const m={};return{getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]}};}
const names=['bucketKey','storeKey','normCode','idxKey','leagueKey','readIndex','writeIndex','absorbLegacySlot','leagueCodes','activeCode','setActiveCode','forgetLeagueLocal','loadLeague','pruneProvisionalDuplicates','localCopyIsImpossible'];
const sb={console,localStorage:LS(),myUid:()=>'u1',STORE_KEY_BASE:'tipoff-season-v1',LEGACY_STORE_KEY:'tipoff-season-v1'};
const ctx=vm.createContext(sb); vm.runInContext(names.map(n=>grab(s,n)).join('\n'),ctx);
const call=e=>vm.runInContext(e,ctx);
const legacy={phase:'season',week:1,league:{code:'VVWXC6',name:'Season League',seed:1,numTeams:8,weeks:12},
  teams:[{uid:'u1',name:"Jake's Team"}],lineups:{1:{T1:[{locked:{fpts:21.5}}]}},draft:{pick:96,order:new Array(96),completedAt:1}};
sb.localStorage.setItem('tipoff-season-v1:u1',JSON.stringify(legacy));
T('legacy migrates byte-identical', JSON.stringify(call('(function(){absorbLegacySlot();return loadLeague("VVWXC6");})()'))===JSON.stringify(legacy));
T('index points at it', call('activeCode()')==='VVWXC6');
T('locked score survives', call('loadLeague("VVWXC6")').lineups[1].T1[0].locked.fpts===21.5);
// duplicates
sb.localStorage.setItem('tipoff-season-v1:u1:L:GHOST1',JSON.stringify({league:{code:'GHOST1',name:'Dup',seed:42},draft:{}}));
sb.localStorage.setItem('tipoff-season-v1:u1:L:REAL01',JSON.stringify({league:{code:'REAL01',name:'Dup',seed:42},draft:{}}));
call('setActiveCode("GHOST1")'); call('setActiveCode("REAL01")');
call('pruneProvisionalDuplicates(["VVWXC6","REAL01"])');
T('ghost duplicate pruned', call('leagueCodes()').indexOf('GHOST1')===-1);
T('account-listed twin kept', call('leagueCodes()').indexOf('REAL01')>=0);
T('unrelated league kept', call('leagueCodes()').indexOf('VVWXC6')>=0);

// ---- stale-copy detection (v223) ----
const imp=x=>{ctx.__s=x;return vm.runInContext('localCopyIsImpossible(__s)',ctx);};
T('full board + draft phase -> impossible', imp({phase:'draft',draft:{pick:96,order:new Array(96),completedAt:0}})===true);
T('mid-draft not flagged', imp({phase:'draft',draft:{pick:40,order:new Array(96),completedAt:0}})===false);
T('pre-draft not flagged', imp({phase:'draft',draft:{pick:0,order:new Array(80),completedAt:0}})===false);
T('season phase not flagged', imp({phase:'season',draft:{pick:96,order:new Array(96)}})===false);

// ---- source invariants ----
T('push waits for a server snapshot', /if \(!SYNC\.synced\) \{ SYNC\.pendingPush = true; return; \}/.test(s));
T('synced only set off a non-cache snapshot', /if \(!fromCache && !SYNC\.synced\)/.test(s));
T('unsubscribe resets the guard', /SYNC\.synced = false;\s*\n\s*SYNC\.pendingPush = false;/.test(s));
T('finalizeDraft clears draft.status', /state\.phase = 'season';[\s\S]{0,700}state\.draft\.status = 'done';/.test(s));
T('snapshot apply has a catch', /\} catch \(err\) \{[\s\S]{0,900}could not apply the league update/.test(s));
T('snapshot errors surface to the user', /Not receiving live league updates/.test(s));
T('forced re-read bypasses cache', /get\(\{ source: 'server' \}\)/.test(s));
T('impossible copy triggers re-read on open', /localCopyIsImpossible\(state\)\) \{\n\s*forceResync/.test(s));
T('open takes code + fresh', /function open\(code, fresh\)/.test(s));
T('create forces the wizard', /mode === 'season'[\s\S]{0,400}open\(null, true\)/.test(s));
T('provisional code dropped on swap', /forgetLeagueLocal\(provisional\)/.test(s));
T('season list from account union local', /\(ACCOUNT_SEASON \|\| \[\]\)\.forEach/.test(s));
T('account listener drives both lists', /onSnapshot[\s\S]{0,600}TipoffSeason\.setAccountLeagues/.test(a));
T('tournament list built from account', /accountLeagues\(\)\.forEach\(l => \{/.test(a));
T('no device-local sort remains', !/\(b\.lastActive \|\| 0\) - \(a\.lastActive \|\| 0\)/.test(a));
T('diag hook exists', /_diag: function/.test(s));

console.log((p===t?'ALL ':'')+p+'/'+t+' regression checks pass');
process.exit(p===t?0:1);
