# Tipoff Fantasy — Launch Plan

**Today:** Tue Sep 9, 2026
**First D-I game:** Sun Nov 1, 2026 (Notre Dame–Villanova, Rome)
**Target ship date:** Sun Oct 18, 2026 — two weeks prior
**Working time:** 39 days

**Your tournaments:** Maui Invitational Nov 23–25 · Battle 4 Atlantis Nov 25–27
You have ~5 extra weeks of slack after Oct 18 before a real league drafts.
Use that as buffer, not as an excuse to slip.

---

## The one thing that decides everything

**The live stat pipeline has never run.** Not once. Until a real number flows
from SportsDataIO into Firestore and appears in the standings, every other
task is decoration. If this fails on Nov 23, the app doesn't work — there is
no manual fallback.

Everything below is ordered around de-risking that first.

---

## P0 — Ship-blocking

### 1. Get the data pipeline live  *(Week 1 — do this first)*

| # | Task | Owner | Notes |
|---|------|-------|-------|
| 1.1 | Firebase → Blaze plan | You | Card required. Set a $5 budget alert. Usage sits in free tier. |
| 1.2 | `npm install` in `functions/` | You | |
| 1.3 | `firebase login` + `firebase deploy --only functions` | You | Node 20 already set |
| 1.4 | Hit `syncNow?dry=1&date=2026-MAR-20` | You | Returns JSON, writes nothing |
| 1.5 | Verify team matching from that JSON | Me | Confirms the `resolveTeam` rewrite works against the full 360-team directory |
| 1.6 | Publish Firestore rules incl. `meta/{docId}` | You | Confirm you actually hit Publish |
| 1.7 | Live write test — confirm a stat lands in `tournamentStats` | Both | First real proof |

**Exit criteria:** a real box score from a past date resolves to a real team
and writes to Firestore.

---

### 2. Fix the player data  *(Week 2)*

Current `players.js` is hand-authored, 2024-25 vintage, and has real defects.

| # | Task | Notes |
|---|------|-------|
| 2.1 | **Verify roster endpoint availability** | `PlayersByTeam` returned empty — may not be on free trial. Test server-side from the deployed function (no fetch truncation). Decides 2.2 vs 2.3. |
| 2.2 | *If available:* generate `players.js` from the API | Permanent fix — no more hand-maintenance, no more staleness |
| 2.3 | *If not:* derive rosters from `PlayerGameStatsByDate` over a date range, or upgrade the SportsDataIO tier | Fallback |
| 2.4 | Remove 15 duplicate player entries | Two managers can currently draft the same person |
| 2.5 | Fix Oumar Ballo (listed on both Arizona and Indiana) | Transfer never cleaned up |
| 2.6 | Refresh all rosters to 2026-27 | Most current entries have graduated |
| 2.7 | ESPN Thanksgiving Showcase: populate or mark `comingSoon` | 4 teams listed, only 1 has a roster — pool is 2 players deep |
| 2.8 | Add a duplicate-detection unit check | Prevents regression |

**Exit criteria:** every tournament that is selectable has a full, current,
duplicate-free roster.

---

### 3. Correctness + resilience  *(Week 3)*

| # | Task | Notes |
|---|------|-------|
| 3.1 | Remove `simulateScores` / `resetStats` entirely | Once 1.7 passes, `syncNow?date=` is strictly better for testing |
| 3.2 | Handle API failure during a live draft | What does the UI show if SportsDataIO 500s mid-tournament? Currently: silence |
| 3.3 | Handle player-name mismatches | Feed matches on lowercase name. What if SportsDataIO says "Jr." and you don't? |
| 3.4 | Full mobile QA pass — every page, real phone | Draft grid fix is in; verify the rest |
| 3.5 | Multi-user test: 2+ real devices, real draft | Never been done. Timer sync, pick collisions, Firestore races |
| 3.6 | Verify trades are removed or built | FAQ no longer claims it — modal is still dead UI in the DOM |

**Exit criteria:** you can run a full draft on two phones without touching code.

---

## P1 — Launch quality  *(Week 4)*

| # | Task |
|---|------|
| 4.1 | Landing page: verify all nav, favicon in Google, social links resolve |
| 4.2 | Confirm stale service worker is fully cleared on real devices |
| 4.3 | Onboarding: can a friend create a league without you explaining anything? |
| 4.4 | Commissioner error states — full league, bad code, expired invite |
| 4.5 | Write a one-page "how to run your draft" for commissioners |

---

## P2 — Distribution

### Google Play — cheap, low risk
| # | Task | Notes |
|---|------|-------|
| 5.1 | $25 one-time developer account | |
| 5.2 | Bubblewrap TWA from existing manifest | Officially supported PWA path |
| 5.3 | Store listing + screenshots | Reuse landing page assets |

Realistic. ~2 days total. Do it Week 5 if P0 is clean.

### Apple App Store — expensive, high risk, **likely slips**

| # | Task | Notes |
|---|------|-------|
| 6.1 | Mac with Xcode | **Hard prerequisite.** No Mac = no iOS. |
| 6.2 | $99/yr Apple Developer Program | |
| 6.3 | Capacitor wrap | ~1 day. This alone gets rejected. |
| 6.4 | **Live Activities for the draft clock** | The feature most likely to clear Guideline 4.2. Requires Swift + ActivityKit + a separate APNs push channel. |
| 6.5 | Native APNs push ("you're on the clock") | Replaces web push |
| 6.6 | Face ID login, native share sheet, haptics | Supporting native surface |
| 6.7 | Submit + expect ≥1 rejection cycle | Fantasy sports draws extra scrutiny |

**Honest read:** if you have not written Swift before, 6.4 alone is not a
week. App Store by Oct 18 is unlikely. Treat it as a stretch goal that must
not jeopardize P0. The web app works on every iPhone today via Add to Home
Screen — that is your actual launch vehicle.

---

## Week-by-week

| Week | Dates | Focus | Must be true at the end |
|------|-------|-------|-------------------------|
| 1 | Sep 9–15 | Data pipeline live | Real stat in Firestore |
| 2 | Sep 16–22 | Roster rebuild | Current, clean, complete |
| 3 | Sep 23–29 | Correctness + multi-device test | Full draft runs on 2 phones |
| 4 | Sep 30–Oct 6 | Polish, onboarding, edge cases | A stranger can run a league |
| 5 | Oct 7–13 | Google Play + iOS if P0 is done | Buffer for overruns |
| 6 | Oct 14–18 | Dress rehearsal, freeze, ship | Real league drafted end to end |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **SportsDataIO trial expires** | Fatal — no data | Check expiry date NOW. Know the paid tier price before you need it. |
| Roster endpoint not on free tier | Manual roster entry = days of work | Verify in Week 2 (task 2.1) |
| Team matching still fails on some schools | Silent wrong stats | The `dry=1` report lists unresolved abbreviations — read it |
| App Store rejection | Slips past deadline | Not on the critical path. Web app ships regardless. |
| Never tested with >1 user | Draft breaks live | Task 3.5 is non-negotiable |
| Blaze billing surprise | Unexpected cost | Budget alert at $5 |

---

## The single most important line in this document

**Do task 1.1 through 1.7 this week.** Everything else is downstream of
knowing whether the data pipeline works. It has never run. Find out now,
while there are 39 days to fix whatever breaks — not on Nov 23.
