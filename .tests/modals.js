const fs=require('fs');
const css=fs.readFileSync('src/styles.css','utf8');
const html=fs.readFileSync('index.html','utf8');
let p=0,t=0;const T=(n,c)=>{t++;if(c){p++;console.log('PASS  '+n);}else console.log('FAIL  '+n);};

const i=css.indexOf('.modal-backdrop {');
const blk=css.slice(i, css.indexOf('}', i));
const has=s=>blk.indexOf(s)>=0;

T('backdrop is fixed to the viewport', has('position: fixed') && has('inset: 0'));
T('backdrop centres both axes', has('display: grid') && has('place-items: center'));
T('backdrop scrolls when the card is taller than the screen', has('overflow-y: auto'));
T('safe-area padding on all four sides', (blk.match(/env\(safe-area-inset/g)||[]).length===4);

// no style="" attribute anywhere may override the centring
T('no inline align-items override on any modal',
  !(html.match(/class="modal-backdrop[^"]*"[^>]*style="([^"]*)"/g)||[])
    .some(m => /align-items/.test(m)));
T('every modal-backdrop only toggles display inline',
  (html.match(/class="modal-backdrop[^"]*"[^>]*style="([^"]*)"/g)||[])
    .every(m => /style="display:\s*none;?\s*"/.test(m)));

T('confirm buttons meet the 44px touch floor', /\.modal-actions > button \{ min-height: 44px/.test(css));
T('buttons stack on narrow screens', /max-width: 420px\)[\s\S]{0,300}column-reverse/.test(css));
T('card has a real elevation shadow', /\.modal-card \{[\s\S]{0,400}box-shadow: 0 24px 70px/.test(css));

console.log('\n'+p+'/'+t+' modal checks pass');
process.exit(p===t?0:1);
