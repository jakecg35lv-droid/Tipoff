/*  Splash empty-state checks.

    The bug: clicking "All Leagues" sometimes returned to a totally
    blank splash — no cards and no message.

    Cause: two renderers paint this screen and each decided the
    "No leagues yet" message by reading the other one's innerHTML
    mid-flight. renderSavedLeagues() runs synchronously inside
    showSplash(); the season card was repainted from a
    MutationObserver that fires afterwards. So:

      1. renderSavedLeagues finds no tournament leagues
      2. peeks at the season slot, sees the PREVIOUS paint, and
         writes nothing on the assumption it is covered
      3. renderSplashCard then runs, its own list is empty (account
         listener had not returned), and it clears the slot
      4. both halves blank, nothing re-checks

    This file runs that exact interleaving against a tiny DOM stub
    and asserts the screen is never silently empty.               */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const season = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// ── A DOM small enough to reason about ───────────────────
function makeDom() {
  function el(id, cls) {
    return {
      id: id, className: cls || '', innerHTML: '', children: [],
      querySelector: function (sel) {
        //  Only the two selectors the code actually uses.
        if (sel === '.saved-league-card') return /saved-league-card/.test(this.innerHTML) ? {} : null;
        return null;
      },
      appendChild: function (c) { this.children.push(c); c._parent = this; },
      remove: function () {
        if (!this._parent) return;
        const i = this._parent.children.indexOf(this);
        if (i >= 0) this._parent.children.splice(i, 1);
      }
    };
  }
  const wrap = el(null, 'splash-leagues');
  const list = el('savedLeaguesList', 'saved-leagues-list');
  const slot = el('seasonLeagueSlot');
  wrap.appendChild(list); wrap.appendChild(slot);
  return {
    wrap: wrap, list: list, slot: slot,
    getElementById: function (id) {
      if (id === 'savedLeaguesList') return list;
      if (id === 'seasonLeagueSlot') return slot;
      if (id === 'noLeaguesMsg') return wrap.children.filter(function (c) { return c.id === 'noLeaguesMsg'; })[0] || null;
      return null;
    },
    querySelector: function (sel) { return sel === '.splash-leagues' ? wrap : null; },
    createElement: function () { return el(null, ''); }
  };
}

//  Lift the two real functions out of app.js so the test runs the
//  shipped code, not a paraphrase of it.
function loadSync() {
  const a = app.indexOf('function _hasSeasonCard()');
  const b = app.indexOf('window.TipoffLeagues =');
  //  Drop any `window.*` export inside the slice. Bridges get added
  //  between these two functions over time, and there is no `window`
  //  in Node — one such line killed the whole suite before its first
  //  assertion. The functions under test do not need them.
  const src = app.slice(a, b).replace(/^window\.[\s\S]*?^\};$/gm, '');
  const dom = makeDom();
  const fn = new Function('document', src + '\nreturn { sync: _syncLeagueEmptyState, has: _hasSeasonCard };');
  const api = fn(dom);
  api.dom = dom;
  return api;
}

function msgShown(dom) {
  return dom.wrap.children.some(function (c) { return c.id === 'noLeaguesMsg'; });
}

// ── The exact failing interleaving ───────────────────────
{
  const api = loadSync();
  const d = api.dom;
  //  1. a previous paint is still on screen
  d.slot.innerHTML = '<button class="ss-splash-card">Old league</button>';
  //  2. renderSavedLeagues finds nothing and clears its container
  d.list.innerHTML = '';
  api.sync();
  ok('no message while the season slot still shows a card', !msgShown(d));
  //  3. the season renderer then finds its own list empty
  d.slot.innerHTML = '';
  api.sync();                      // the call the fix adds
  ok('message appears once the season slot clears too', msgShown(d));
  ok('screen is never silently empty', msgShown(d) || d.list.innerHTML || d.slot.innerHTML);
}

// ── The message must never cover real cards ──────────────
{
  const api = loadSync(); const d = api.dom;
  d.list.innerHTML = '<div class="saved-league-card"></div>';
  d.slot.innerHTML = '';
  api.sync();
  ok('no message when only tournament leagues exist', !msgShown(d));

  d.list.innerHTML = '';
  d.slot.innerHTML = '<button class="ss-splash-card"></button>';
  api.sync();
  ok('no message when only season leagues exist', !msgShown(d));

  d.list.innerHTML = '<div class="saved-league-card"></div>';
  api.sync();
  ok('no message when both exist', !msgShown(d));
}

// ── Idempotent: both renderers call it, order unknown ────
{
  const api = loadSync(); const d = api.dom;
  api.sync(); api.sync(); api.sync();
  const n = d.wrap.children.filter(function (c) { return c.id === 'noLeaguesMsg'; }).length;
  ok('never stacks duplicate messages', n === 1, String(n));
  d.slot.innerHTML = '<button class="ss-splash-card"></button>';
  api.sync(); api.sync();
  ok('message is removed again when a card arrives', !msgShown(d));
}

// ── Wiring: both sides must actually call it ─────────────
ok('app.js exposes the hook', /window\.TipoffLeagues = \{ syncEmpty: _syncLeagueEmptyState \}/.test(app));
ok('renderSavedLeagues delegates the empty state',
  /container\.innerHTML = '';[\s\S]{0,400}?_syncLeagueEmptyState\(\)/.test(app));
ok('renderSavedLeagues no longer guesses at the season slot',
  !/_hasSeasonCard\(\)\s*\n?\s*\?/.test(app));
ok('season calls back after clearing its slot',
  /slot\.innerHTML = '';[\s\S]{0,400}?TipoffLeagues && window\.TipoffLeagues\.syncEmpty\(\)/.test(season));
ok('season calls back after painting cards',
  /data-season-new="1"[\s\S]{0,400}?TipoffLeagues && window\.TipoffLeagues\.syncEmpty\(\)/.test(season));

//  showSplash must paint the season half itself rather than relying
//  on a MutationObserver side effect that fires after it returns.
const showSplash = app.slice(app.indexOf('function showSplash('), app.indexOf('function enterLeague('));
ok('showSplash repaints the season half explicitly',
  /TipoffSeason\.refreshSplash\(\)/.test(showSplash));
ok('showSplash re-checks after the account read can land',
  /setTimeout\(function \(\) \{[\s\S]{0,300}?renderSavedLeagues\(\)/.test(showSplash));
ok('showSplash still syncs the empty state', /_syncLeagueEmptyState\(\)/.test(showSplash));

// ── Exactly one owner of the message ─────────────────────
ok('index.html no longer hardcodes a second message',
  !/<p class="no-leagues"/.test(html));
const owners = (app.match(/no-leagues/g) || []).length;
ok('app.js references the message class once', owners === 1, String(owners));

// ── Shipped ──────────────────────────────────────────────
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build));
ok('app.js requested at the current build', html.includes('src/app.js?v=' + build));
ok('no stale ?v= in index.html',
  (html.match(/\?v=(\d+)/g) || []).every(function (v) { return v === '?v=' + build; }));

console.log('\n' + pass + '/' + (pass + fail) + ' splash checks pass');
process.exit(fail ? 1 : 0);
