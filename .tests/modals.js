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

T('confirm buttons meet the 44px touch floor', /\.modal-actions > button \{[^}]*min-height:\s*44px/.test(css));
T('buttons stack on narrow screens', /max-width: 430px\)[\s\S]{0,400}column-reverse/.test(css));
T('card has a real elevation shadow', /\.modal-card \{[\s\S]{0,400}box-shadow: 0 24px 70px/.test(css));

// ── Action buttons share the row instead of overflowing ──
//  Photographed with Cancel wider than the card and "Yes, Delete"
//  wrapped to two lines. Cause: .modal-actions .btn-ghost carried
//  flex-shrink: 0 so Cancel would not give up a pixel, while the
//  confirm button had no flex rule and absorbed the whole squeeze.
//  Scan CSS with comments stripped. These rules are documented by
//  quoting the exact declaration that was removed, so a raw search
//  finds the comment and reports the bug as still present.
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
function R(sel) {
  const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
}
const AB = R('.modal-actions > button');
T('action buttons share the row equally', /flex:\s*1 1 0/.test(AB));
T('action buttons can shrink', /min-width:\s*0/.test(AB));
T('action labels never wrap', /white-space:\s*nowrap/.test(AB));
T('Cancel no longer refuses to shrink',
  !/\.modal-actions \.btn-ghost\s*\{[^}]*flex-shrink:\s*0/.test(cssCode));
T('confirm button has no competing flex rule',
  !/\.modal-actions \.btn-primary\s*\{[^}]*flex:\s*1/.test(css));
T('both buttons share one corner radius',
  /\.modal-actions > button \{\s*border-radius:\s*10px/.test(css));
T('stacked buttons stop stretching',
  /max-width: 430px\)[\s\S]{0,400}\.modal-actions > button \{[^}]*flex:\s*0 0 auto/.test(css));

// ── Danger colour belongs to this palette ────────────────
const GRAD = (css.match(/--grad-red:\s*([^;]+);/) || [])[1] || '';
T('danger gradient drops the stock red', !/#f05252/i.test(GRAD));
T('danger gradient runs top-to-bottom', /linear-gradient\(180deg/.test(GRAD));
const RED = R('.btn-red');
T('danger button has a hairline border', /border:\s*1px solid/.test(RED));
T('danger button is lit from above', /inset 0 1px 0/.test(RED));
T('danger shadow is tinted, not black', /rgba\(166, 47, 43/.test(RED));
T('danger button brightens rather than fades',
  /\.btn-red:hover \{[^}]*filter:\s*brightness/.test(css) &&
  !/\.btn-red:hover \{[^}]*opacity/.test(css));
T('settings danger row uses the new hue',
  !/\.set-row-btn--danger \{[^}]*#f05252/.test(css));
T('armed settings row fills with the dialog colour',
  /\.set-row-btn--danger\.confirm \{[^}]*background:\s*var\(--grad-red\)/.test(css));

console.log('\n'+p+'/'+t+' modal checks pass');
process.exit(p===t?0:1);
