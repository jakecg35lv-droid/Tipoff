const fs=require('fs');
const a=fs.readFileSync('src/app.js','utf8'), s=fs.readFileSync('src/season/season.js','utf8');
let p=0,t=0;const T=(n,c)=>{t++;if(c){p++;console.log('PASS  '+n);}else console.log('FAIL  '+n);};

// --- behaviour of the detector itself ---
function mk(type, referrer, host){
  global.performance = { getEntriesByType: () => [{ type: type }] };
  global.document = { referrer: referrer };
  global.location = { hostname: host };
  global.URL = URL;
  const i=a.indexOf('function cameFromExternalLink()');
  let d=0,j=a.indexOf('{',i),end=i;
  for(let k=j;k<a.length;k++){const c=a[k];if(c==='{')d++;else if(c==='}'){d--;if(!d){end=k+1;break;}}}
  return eval('('+a.slice(i,end)+')')();
}
const APP='app.tipofffantasy.com';
T('link from marketing site -> external', mk('navigate','https://tipofffantasy.com/',APP)===true);
T('link from trivia site -> external',    mk('navigate','https://trivia.tipofffantasy.com/x',APP)===true);
T('link from anywhere else -> external',  mk('navigate','https://twitter.com/',APP)===true);
T('REFRESH is not external',              mk('reload','https://tipofffantasy.com/',APP)===false);
T('back/forward is not external',         mk('back_forward','https://tipofffantasy.com/',APP)===false);
T('internal link is not external',        mk('navigate','https://app.tipofffantasy.com/x',APP)===false);
T('typed/bookmark (no referrer) resumes', mk('navigate','',APP)===false);
T('PWA launch (no referrer) resumes',     mk('navigate',undefined,APP)===false);
T('garbage referrer does not throw',      mk('navigate','not a url',APP)===false);

// --- wiring ---
T('all four boot branches gated', (a.match(/&& !cameFromExternalLink\(\)/g)||[]).length>=4);
T('tournament page restore gated', /lv\.mode === 'tournament' && !_viewRestored && !cameFromExternalLink\(\)/.test(a));
T('season restore gated', /if \(V\.external && V\.external\(\)\) return;/.test(s));
T('detector exposed to season.js', /external: cameFromExternalLink/.test(a));

console.log('\n'+p+'/'+t+' arrival tests pass');
process.exit(p===t?0:1);
