/*  Feedback, and the path from a stuck user to an email.

    Every problem this week arrived as a sentence — "the draft button
    does not register", "it lags out for 20 seconds" — and then cost a
    round of questions to pin down. What actually resolved them was
    context: which build, which league, which page, which device. So
    the form collects that, and shows it before sending.

    The security shape matters as much as the feature: the client
    writes ONLY to `feedback`, and a Cloud Function copies it into
    the Trigger Email extension's `mail` collection with the Admin
    SDK. A client that could write to `mail` could send arbitrary
    email from this domain.                                        */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
const season = fs.readFileSync(path.join(ROOT, 'src/season/season.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const fns = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const A = strip(app), F = strip(fns);

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// ══ 1. Reachable from both modes ═════════════════════════
ok('the dialog exists', /id="feedbackModal"/.test(html));
ok('tournament settings has an entry point', /id="openFeedbackBtn"/.test(html));
ok('season settings has one too', /data-act="feedback"/.test(season));
ok('season opens the SAME dialog', /window\.TipoffFeedback && window\.TipoffFeedback\.open\(\)/.test(season),
  'two forms would mean two collections and two places to read reports');
ok('the dialog is exported for it', /window\.TipoffFeedback = \{ open: openFeedback \}/.test(A));
ok('it is wired at boot, not on demand', /wireFeedback\(\);/.test(A),
  'it must be ready the moment somebody hits a wall');
ok('season degrades if the dialog is missing',
  /notify\('Could not open the report form\. Email admin@tipofffantasy\.com/.test(season));

// ══ 2. The context is what makes a report fixable ════════
const ctxFn = A.slice(A.indexOf('function _feedbackContext'), A.indexOf('function _feedbackContextText'));
for (const [what, re] of [
  ['the build version', /ctx\.build/],
  ['which mode', /ctx\.mode = inSeason \? 'season' : 'tournament'/],
  ['which page', /ctx\.page/],
  ['which league', /ctx\.league/],
  ['commissioner status', /ctx\.commissioner = isCommissioner\(\)/],
  ['the draft position', /ctx\.draftPick = state\.currentPickIndex/],
  ['whether the clock runs', /ctx\.draftRunning/],
  ['screen size', /ctx\.screen/],
  ['Home Screen install', /ctx\.standalone/],
  ['the user agent', /ctx\.ua = navigator\.userAgent/],
  ['online state', /ctx\.online = navigator\.onLine/],
]) ok('context captures ' + what, re.test(ctxFn));
ok('context gathering never throws', (ctxFn.match(/catch \(e\) \{ \}/g) || []).length >= 2,
  'a broken context must not block a bug report');

/*  Shown before sending. Quietly harvesting device details is worse
    than asking. */
ok('the context is shown to the user', /id="fbDiag"/.test(html));
ok('it is labelled as what gets sent', /What gets sent with this/.test(html));
ok('it is rendered as readable text', /function _feedbackContextText/.test(A));

// ══ 3. Validation and failure ════════════════════════════
ok('an empty report is refused', /if \(body\.length < 10\)/.test(A));
ok('the refusal is helpful, not scolding', /even one sentence about what you were doing helps/.test(A));
ok('the body is length-capped', /body\.slice\(0, FEEDBACK_MAX\)/.test(A));
ok('offline is caught before sending', /You appear to be offline/.test(A));
/*  Somebody reporting that the app is broken, and getting silence,
    is the worst possible outcome. */
ok('a failed send is never silent', /That did not send \(/.test(A));
ok('and it hands over the address directly',
  /Please email admin@tipofffantasy\.com/.test(A));
ok('the button re-enables after a failure', /btn\.textContent = 'Send report'; \}/.test(A));
ok('a backdrop click does not discard typing mid-card',
  /if \(e\.target === modal\) closeFeedback\(\);/.test(A),
  'only the backdrop itself closes it');

// ══ 4. The client cannot send mail directly ══════════════
ok('reports are create-only', /match \/feedback\/\{reportId\}/.test(rules));
(function () {
  const i = rules.indexOf('match /feedback/{reportId}');
  const blk = rules.slice(i, rules.indexOf('}', rules.indexOf('allow read, update, delete', i)));
  ok('only signed-in users may file', /request\.auth != null/.test(blk));
  ok('the body is validated server-side', /body\.size\(\) <= 1500/.test(blk));
  ok('the kind is constrained', /kind in \['bug', 'stuck', 'idea'\]/.test(blk));
  ok('nobody can read or amend reports', /allow read, update, delete: if false;/.test(blk));
})();
/*  THE important one. The extension sends whatever it finds in
    `mail`; a client with write access there is an open relay. */
ok('the mail collection is closed to clients',
  /match \/mail\/\{mailId\} \{\s*allow read, write: if false;/.test(rules),
  'otherwise anyone could send email from this domain');
ok('the client only ever writes to feedback',
  /collection\('feedback'\)\.add/.test(A) && !/collection\('mail'\)/.test(A));

// ══ 5. The function that does the sending ════════════════
ok('a create trigger exists', /onDocumentCreated\(/.test(F));
ok('it listens on feedback', /document: 'feedback\/\{reportId\}'/.test(F));
ok('onDocumentCreated is imported', /onDocumentWritten, onDocumentCreated/.test(fns));
ok('it writes to the extension collection', /db\.collection\('mail'\)\.add/.test(F));
ok('it is addressed to the admin', /admin@tipofffantasy\.com/.test(F));
ok('replies go to the reporter, not the app',
  /replyTo: d\.email \|\| undefined/.test(F),
  'hitting Reply should answer the person');
/*  The subject carries the triage facts so an inbox is sortable
    without opening anything. */
ok('the subject names kind, place and build',
  /'\[Tipoff ' \+ kind \+ '\] '/.test(F) && /ctx\.build/.test(F));
ok('the email body carries the full context', /facts\.map/.test(F));
ok('html is escaped', /function esc\(v\)/.test(F) && /esc\(d\.body\)/.test(F),
  'a report body is user input going into an email');
ok('the handoff is recorded', /mailedAt: Date\.now\(\)/.test(F),
  'a report with no mailedAt means the email failed but the report survived');
ok('a failed handoff does not lose the report',
  /catch \(e\) \{\s*console\.error\('\[Feedback\] could not queue mail/.test(F));
ok('the trigger is instance-capped', /maxInstances: 5/.test(F));

// ══ 6. Usable on a phone ═════════════════════════════════
ok('the textarea cannot zoom iOS on focus',
  /\.fb-text \{[^}]*font: 400 16px/.test(css),
  'anything under 16px makes Safari zoom the page');
ok('the kind buttons are a real touch target',
  /\.fb-kind \{[^}]*min-height: 40px/.test(css));
ok('the user agent string cannot overflow',
  /\.fb-diag-body \{[^}]*overflow-wrap: anywhere/.test(css),
  'a UA string is one very long unbreakable token');
ok('the error message wraps too', /\.fb-err \{[^}]*overflow-wrap: anywhere/.test(css));
ok('the diagnostics panel is scroll-capped', /\.fb-diag-body \{[^}]*max-height/.test(css));
ok('it has phone rules', /@media \(max-width: 480px\)[\s\S]{0,200}\.fb-kind/.test(css));

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const build = (sw.match(/BUILD = '(\d+)'/) || [])[1];
ok('CACHE_NAME matches BUILD', sw.includes('tipoff-v' + build), build);
ok('index.html asks for the current build',
  [...new Set(html.match(/\?v=(\d+)/g) || [])].join() === '?v=' + build, build);

console.log('\n' + pass + '/' + (pass + fail) + ' feedback checks pass');
process.exit(fail ? 1 : 0);
