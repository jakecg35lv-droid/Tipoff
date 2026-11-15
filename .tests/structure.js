/*  Structural integrity: references that point at nothing.

    This suite exists because an audit found that the "Your Color"
    picker had been deleted from the profile markup while
    wireAccentSwatches() and the entire .look-* stylesheet survived.
    Nothing errored — getElementById returned null and the function
    returned early — so the feature simply vanished and no test
    noticed. Optional chaining and null guards are good practice and
    they are also very effective at hiding deletions.             */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const season = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// ── No duplicate element ids ─────────────────────────────
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const seen = {}, dups = [];
ids.forEach(function (i) { if (seen[i]) dups.push(i); seen[i] = 1; });
ok('no duplicate element ids', dups.length === 0, [...new Set(dups)].join(', '));

// ── Every getElementById target exists ───────────────────
//  Either in the markup, or created at runtime. Both source files
//  build elements and assign .id, so collect those too.
const created = new Set(
  [...app.matchAll(/\.id = '([^']+)'/g)].map(m => m[1])
    .concat([...season.matchAll(/\.id = '([^']+)'/g)].map(m => m[1]))
    .concat([...app.matchAll(/id="([^"]+)"/g)].map(m => m[1]))
    .concat([...season.matchAll(/id="([^"]+)"/g)].map(m => m[1]))
);
const idset = new Set(ids);
const refs = new Set(
  [...app.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1])
    .concat([...season.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]))
);
const dangling = [...refs].filter(function (r) { return !idset.has(r) && !created.has(r); });
ok('every getElementById target exists', dangling.length === 0, dangling.join(', '));

// ── The regression that prompted this suite ──────────────
ok('the colour picker is still in the markup', /id="lookSwatches"/.test(html));
ok('it still has its swatches', (html.match(/class="look-swatch"/g) || []).length >= 8,
  String((html.match(/class="look-swatch"/g) || []).length));
ok('its wiring is still present', /function wireAccentSwatches/.test(app));
ok('its styles are still present', /\.look-swatch \{/.test(css));

// ── Service worker precache points at real files ─────────
const assets = [...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]).filter(function (a) { return a && !a.includes('?'); });
const gone = assets.filter(function (a) { return !fs.existsSync(path.join(ROOT, a)); });
ok('every precached asset exists', gone.length === 0, gone.join(', '));
ok('the precache list is not empty', assets.length >= 8, String(assets.length));

// ── Load path ────────────────────────────────────────────
//  defer lets the parser finish the 100KB of markup while the
//  scripts download in parallel, and preserves execution order so
//  the Firebase SDK still runs before firebase-config and app.js.
const scripts = [...html.matchAll(/<script([^>]*)src="([^"]+)"/g)];
const notDeferred = scripts.filter(function (m) { return !/\bdefer\b|\basync\b|type="module"/.test(m[1]); });
ok('external scripts do not block parsing', notDeferred.length === 0,
  notDeferred.map(function (m) { return m[2]; }).join(', '));
//  Order still matters even with defer.
const order = scripts.map(function (m) { return m[2]; });
const iSdk = order.findIndex(function (u) { return /firebase-auth-compat/.test(u); });
const iCfg = order.findIndex(function (u) { return /firebase-config/.test(u); });
const iApp = order.findIndex(function (u) { return /src\/app\.js/.test(u); });
ok('firebase SDK loads before its config', iSdk >= 0 && iCfg > iSdk, iSdk + ' then ' + iCfg);
ok('config loads before app.js', iCfg >= 0 && iApp > iCfg, iCfg + ' then ' + iApp);

// ── Cache busting is consistent ──────────────────────────
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
const vs = [...new Set((html.match(/\?v=(\d+)/g) || []))];
ok('one version across every asset url', vs.length === 1, vs.join(', '));
ok('that version is the current build', vs[0] === '?v=' + build, vs[0] + ' vs ?v=' + build);

console.log('\n' + pass + '/' + (pass + fail) + ' structure checks pass');
process.exit(fail ? 1 : 0);
