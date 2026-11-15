// ═══════════════════════════════════════════════════════════════
//  TIPOFF FANTASY: Firebase Configuration
//
//  STEP-BY-STEP SETUP (takes ~5 minutes):
//
//  1. Go to https://console.firebase.google.com
//  2. Click "Add project" → name it "Tipoff Fantasy" → Continue → Create project
//  3. On the project overview page, click the Web icon (</>)
//     → App nickname: "Tipoff Fantasy Web" → Register app
//  4. Copy the firebaseConfig object that appears and paste it below
//     (replacing the PASTE_HERE placeholders)
//
//  5. ENABLE EMAIL/PASSWORD AUTH:
//     → Left sidebar: Build → Authentication → Get started
//     → Sign-in method tab → Email/Password → Enable → Save
//
//  6. CREATE FIRESTORE DATABASE:
//     → Left sidebar: Build → Firestore Database → Create database
//     → Start in production mode → Next → pick any region → Enable
//
//  7. SET FIRESTORE SECURITY RULES:
//     → Firestore Database → Rules tab → replace everything with:
//
//  rules_version = '2';
//  service cloud.firestore {
//    match /databases/{database}/documents {
//      match /users/{uid} {
//        allow read, write: if request.auth != null && request.auth.uid == uid;
//        // Web push subscriptions. Only the owner may list or change
//        // them; Cloud Functions read them through the admin SDK,
//        // which bypasses rules entirely. A broader read here would
//        // expose every endpoint in the database, and an endpoint is
//        // all anyone needs to send that device a notification.
//        match /pushSubs/{subId} {
//          allow read, write: if request.auth != null && request.auth.uid == uid;
//        }
//      }
//      // Push dedupe markers, written only by Cloud Functions.
//      match /pushSent/{key} {
//        allow read, write: if false;
//      }
//      match /leagues/{leagueCode} {
//        allow read:   if request.auth != null;
//        allow create: if request.auth != null;
//        allow update: if request.auth != null && (
//                        resource.data.commissionerUid == request.auth.uid ||
//                        (resource.data.members is list &&
//                         resource.data.members.hasAny([request.auth.uid]))
//                      );
//        allow delete: if request.auth != null &&
//                        resource.data.commissionerUid == request.auth.uid;
//      }
//      // Live player stats written by Cloud Functions, read-only for users
//      match /tournamentStats/{tournId} {
//        allow read: if request.auth != null;
//        allow write: if false;
//        match /players/{playerId} {
//          allow read: if request.auth != null;
//          allow write: if false;
//        }
//        match /gameLog/{gameId} {
//          allow read: if request.auth != null;
//          allow write: if false;
//        }
//      }
//      // Active tournament config — commissioners write, Cloud Function reads via admin SDK
//      match /meta/{docId} {
//        allow read:  if request.auth != null;
//        allow write: if request.auth != null;
//      }
//    }
//  }
//
//     → Click Publish
//
// ═══════════════════════════════════════════════════════════════

/* ── WEB PUSH (VAPID) ──────────────────────────────────────────
   The PUBLIC half of the VAPID key pair. This belongs in the client
   and is safe to commit: it only identifies us to the browser's push
   service. The PRIVATE half must never appear in this repo — it lives
   in a Cloud Functions secret.

   GENERATE THE PAIR (once, ever — rotating it invalidates every
   existing subscription and silently stops notifications for
   everyone until each device re-subscribes):

     cd functions
     npm install
     npx web-push generate-vapid-keys

   Then:
     1. Paste the PUBLIC key below.
     2. Store the PRIVATE key as a secret, from the repo root:
          firebase functions:secrets:set VAPID_PRIVATE_KEY
        (paste the private key when prompted, then press Enter)
     3. firebase deploy --only functions

   Leaving this empty is safe: enablePush() returns 'no-key', the
   toggle explains that push is not configured, and local in-app
   notifications carry on working exactly as before.            */
window.TIPOFF_VAPID_PUBLIC_KEY = 'BN6ueT1oTMAH5ln1iLPs7JgN-A0HE9rVld5j1HNRrxHAdM3YVDQvwaofnmM4RmC7nCl0fvEFkGk6mTyXNjP7KbM';

// ↓ PASTE YOUR CONFIG HERE (from Firebase Console → Project Settings → Your apps)
const firebaseConfig = {
  apiKey:            "AIzaSyDWLF8thu07J33Yzmda9Pu7AcEXLsYcq8s",
  authDomain:        "mmapp-6b7ab.firebaseapp.com",
  projectId:         "mmapp-6b7ab",
  storageBucket:     "mmapp-6b7ab.firebasestorage.app",
  messagingSenderId: "281245381393",
  appId:             "1:281245381393:web:fa845963c58614222612b0"
};

// ── Initialize Firebase (do not edit below this line) ────────
try {
  firebase.initializeApp(firebaseConfig);
  window._auth = firebase.auth();
  window._db   = firebase.firestore();
  window._fbUser = null; // set by onAuthStateChanged in app.js
  console.log('[Firebase] Initialized successfully');
} catch (e) {
  console.warn('[Firebase] Init failed. App will run in offline/localStorage mode.', e.message);
  window._auth = null;
  window._db   = null;
  window._fbUser = null;
}
