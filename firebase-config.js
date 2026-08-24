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
