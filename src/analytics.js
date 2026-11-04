/* ══════════════════════════════════════════════════════════
   TIPOFF FANTASY — Analytics
   PostHog wrapper with PII scrubbing enforced at the boundary.

   The design rule: it is not enough to *intend* not to send email
   addresses. Someone will eventually pass a whole player object or a
   session blob into track() at 1am during a draft bug. So the scrub
   runs on every event, unconditionally, and drops anything that looks
   like PII whether or not the caller meant to include it.

   Identity is the Firebase UID only. No email, no display name.

   SETUP:
     1. Create a PostHog project, copy the project API key
     2. Put it in POSTHOG_KEY below
     3. Until then every call here is a silent no-op, so the app runs
        fine with analytics disabled and nothing needs to be guarded
        at the call site.
══════════════════════════════════════════════════════════ */
(function (window) {
  'use strict';

  // Project API key (NOT a secret — it ships in client-side JS by design
  // and is visible to anyone who views source. The personal API key is
  // the one that must never appear here.)
  var POSTHOG_KEY  = 'phc_uhwDxyvSkFTiKU4M6USyGoadFtuqXMWSo6fP93nyQhzU';
  var POSTHOG_HOST = 'https://us.i.posthog.com';

  // ── Event allowlist ─────────────────────────────────────
  //  An allowlist rather than free-form strings, so typos surface in
  //  the console instead of quietly creating a second event name that
  //  splits a funnel in half.
  var EVENTS = {
    // Acquisition + activation
    account_created:        1,
    league_created:         1,
    invite_sent:            1,
    league_joined:          1,
    league_filled:          1,

    // Draft
    draft_scheduled:        1,
    draft_started:          1,
    draft_completed:        1,
    pick_made:              1,
    pick_autodrafted:       1,
    roster_rule_blocked:    1,

    // In-tournament engagement
    live_score_viewed:      1,
    leaderboard_viewed:     1,
    bracket_viewed:         1,
    news_viewed:            1,
    session_after_elimination: 1,
    tournament_completed:   1,
    season_viewed:          1,

    // Retention plumbing
    app_returned:           1,
    notification_permission_granted: 1,
    notification_permission_denied:  1,

    //  ── Regular Season mode ─────────────────────────────────
    //  Deliberately NOT reusing league_created / draft_completed from
    //  the tournament list. The two modes have different funnels and
    //  different failure points, and merging them means a healthy
    //  tournament number can hide a broken season one — which is
    //  exactly the blind spot being fixed here: season.js had zero
    //  analytics calls in 5,200 lines, so every season league created
    //  so far is invisible.
    season_league_created:  1,
    season_league_joined:   1,
    season_draft_scheduled: 1,
    season_draft_started:   1,
    season_draft_completed: 1,
    season_pick_made:       1,
    season_lineup_set:      1,
    season_week_advanced:   1,
  };

  // ── PII scrubbing ───────────────────────────────────────
  var BLOCKED_KEYS = [
    'email', 'e_mail', 'mail', 'password', 'pass', 'pw', 'token',
    'displayname', 'display_name', 'name', 'username', 'user_name',
    'firstname', 'lastname', 'first_name', 'last_name', 'fullname',
    'phone', 'address', 'dob', 'birthdate', 'birthday', 'message',
    'chat', 'text', 'body', 'apikey', 'api_key', 'manager',
  ];

  var EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;

  function keyIsBlocked(key) {
    var k = String(key).toLowerCase().replace(/[^a-z_]/g, '');
    for (var i = 0; i < BLOCKED_KEYS.length; i++) {
      if (k === BLOCKED_KEYS[i] || k.indexOf(BLOCKED_KEYS[i]) !== -1) return true;
    }
    return false;
  }

  function scrubValue(v, depth) {
    if (v === null || v === undefined) return v;
    if (depth > 3) return '[deep]';

    var t = typeof v;
    if (t === 'number' || t === 'boolean') return v;

    if (t === 'string') {
      // Catches an address that arrived under an innocent key name.
      if (EMAIL_RE.test(v)) return '[redacted-email]';
      // Long free text is almost always something we should not ship.
      return v.length > 120 ? v.slice(0, 120) + '…' : v;
    }

    if (Array.isArray(v)) {
      return v.slice(0, 20).map(function (item) { return scrubValue(item, depth + 1); });
    }

    if (t === 'object') return scrubProps(v, depth + 1);

    return undefined;   // functions, symbols, etc.
  }

  function scrubProps(props, depth) {
    if (!props || typeof props !== 'object') return {};
    var out = {};
    Object.keys(props).forEach(function (key) {
      if (keyIsBlocked(key)) return;               // dropped entirely
      var val = scrubValue(props[key], depth || 0);
      if (val !== undefined) out[key] = val;
    });
    return out;
  }

  // ── Loader ──────────────────────────────────────────────
  var ready = false;

  function init() {
    if (!POSTHOG_KEY) {
      console.info('[Analytics] No PostHog key set. Events are no-ops.');
      return;
    }
    if (window.posthog) { ready = true; return; }

    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){
    function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);
    t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}
    (p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",
    (r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);
    var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],
    u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},
    u.people.toString=function(){return u.toString(1)+".people (stub)"},
    o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId".split(" "),
    n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document, window.posthog||[]);

    window.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      //  ── autocapture OFF, pageviews ON ───────────────────
      //  These two are not the same trade-off and were wrongly set
      //  together.
      //
      //  autocapture is the invasive one: it records every click and
      //  input interaction and ships the element's text with it, which
      //  for this app would mean chat messages and team names. It stays
      //  off, permanently.
      //
      //  capture_pageview just records "a page was viewed, here is the
      //  URL". Turning it off cost far more than it bought: with zero
      //  $pageview events, PostHog's Web Analytics tab, the starter
      //  dashboard, sessions, bounce rate and entry/exit pages are all
      //  permanently blank — verified, the $pageview count over 120
      //  days was exactly zero. The tool looked broken on every screen
      //  PostHog shows first, which is a good way to stop trusting your
      //  own analytics.
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      //  This app is a single-page app that never navigates, so the
      //  automatic pageview fires once on load and never again. Route
      //  changes are reported explicitly via Analytics.page() below.
      //
      //  $web_vitals was the single highest-volume event in the project
      //  (560, more than every product event combined) and nothing
      //  reads it. Off until something does.
      capture_performance: { web_vitals: false },
      // Masks all text in session replay by default. Chat messages and
      // email fields must never end up in a recording.
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '[data-private], .rp-chat-msgs, .chat-messages, input, textarea',
      },
      persistence: 'localStorage',
      // Respect the browser signal rather than making people hunt for
      // a toggle we would then have to build.
      respect_dnt: true,
    });

    ready = true;
  }

  // ── Public API ──────────────────────────────────────────
  function track(event, props) {
    if (!EVENTS[event]) {
      console.warn('[Analytics] Unknown event "' + event + '". Add it to the allowlist in analytics.js.');
      return;
    }
    if (!ready || !window.posthog) return;

    try {
      window.posthog.capture(event, scrubProps(props || {}, 0));
    } catch (e) {
      // Analytics must never break the app.
      console.warn('[Analytics] capture failed:', e && e.message);
    }
  }

  /**
   * Identify by Firebase UID only.
   * `traits` goes through the same scrub as events, so passing an email
   * here does nothing rather than leaking it.
   */
  function identify(uid, traits) {
    if (!ready || !window.posthog || !uid) return;
    try {
      window.posthog.identify(String(uid), scrubProps(traits || {}, 0));
    } catch (e) {
      console.warn('[Analytics] identify failed:', e && e.message);
    }
  }

  function reset() {
    if (!ready || !window.posthog) return;
    try { window.posthog.reset(); } catch (e) {}
  }

  /**
   * Report a route change in this single-page app.
   *
   * The automatic pageview fires once, on load, and the URL never
   * changes after that — so without this every session looks like one
   * visit to "/" no matter how much of the app someone used. Sends a
   * real $pageview with a synthetic path, which is what makes PostHog's
   * pageview and funnel tooling usable.
   *
   * `name` must be a short route slug ('draft', 'lineup'), never
   * free text — it becomes a URL.
   */
  var lastPage = null;
  function page(name, props) {
    if (!ready || !window.posthog || !name) return;
    var slug = String(name).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    if (!slug) return;
    //  Re-rendering the same screen is not a new pageview. The season
    //  module repaints on every Firestore snapshot, which would
    //  otherwise turn one draft into hundreds of pageviews.
    if (slug === lastPage) return;
    lastPage = slug;
    try {
      window.posthog.capture('$pageview', scrubProps(
        Object.assign({ $current_url: location.origin + '/#' + slug, route: slug }, props || {}), 0));
    } catch (e) {
      console.warn('[Analytics] page failed:', e && e.message);
    }
  }

  /**
   * Acquisition source. Reads UTM params and ?ref= on first load and
   * stores them, so a signup three screens later still knows where the
   * person came from.
   */
  function captureAcquisition() {
    try {
      var params = new URLSearchParams(window.location.search);
      var found = {};
      ['utm_source', 'utm_medium', 'utm_campaign', 'ref'].forEach(function (k) {
        var v = params.get(k);
        if (v) found[k] = String(v).slice(0, 64);
      });

      var stored = localStorage.getItem('tipoff-acq');
      if (!stored && Object.keys(found).length) {
        found.landed_at = Date.now();
        localStorage.setItem('tipoff-acq', JSON.stringify(found));
      }
    } catch (e) {}
  }

  function acquisition() {
    try {
      var raw = localStorage.getItem('tipoff-acq');
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  window.Analytics = {
    init: init,
    track: track,
    page: page,
    identify: identify,
    reset: reset,
    captureAcquisition: captureAcquisition,
    acquisition: acquisition,
    // Exported for tests: verify the scrub actually drops what it should.
    _scrub: scrubProps,
    get enabled() { return ready; },
  };

  init();
  captureAcquisition();

})(window);
