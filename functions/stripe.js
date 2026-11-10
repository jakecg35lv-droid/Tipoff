// ═══════════════════════════════════════════════════════════════
//  TIPOFF TRIVIA — Stripe webhook → Unlimited entitlement
//
//  Flow:
//    1. Player signs in on trivia.tipofffantasy.com (same Firebase
//       accounts as Tipoff Fantasy) and clicks "Unlock Unlimited".
//    2. They're sent to a Stripe Payment Link with
//       ?client_reference_id=<their Firebase uid>.
//    3. Stripe calls this function. We verify the signature, then
//       write entitlements/{uid}.triviaUnlimited = true.
//    4. The trivia site listens to that doc and unlocks instantly.
//
//  entitlements/{uid} is read-only to its owner and write-denied to
//  every client (see firestore rules) — only this function can grant.
//
//  SECRETS (set once, never commit them):
//    firebase functions:secrets:set STRIPE_SECRET_KEY
//    firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
//
//  Stripe events to send to this endpoint:
//    checkout.session.completed
//    checkout.session.async_payment_succeeded
//    customer.subscription.updated
//    customer.subscription.deleted
// ═══════════════════════════════════════════════════════════════
const { onRequest }    = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin            = require('firebase-admin');

const STRIPE_SECRET_KEY     = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// Firebase uids are alphanumeric; reject anything else so a crafted
// client_reference_id can never address another document path.
const UID_RE = /^[A-Za-z0-9]{10,128}$/;

exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');

    const stripe = require('stripe')(STRIPE_SECRET_KEY.value());
    let event;
    try {
      // req.rawBody is the exact bytes Stripe signed — required for verification.
      event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      console.warn('[stripe] signature check failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const db = admin.firestore();
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const s = event.data.object;
          // Delayed methods (e.g. bank debits) complete later via async_payment_succeeded.
          if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') await grant(db, s);
          break;
        }
        case 'checkout.session.async_payment_succeeded':
          await grant(db, event.data.object);
          break;

        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const link = await db.collection('stripeCustomers').doc(String(sub.customer)).get();
          if (!link.exists) { console.warn('[stripe] unknown customer', sub.customer); break; }
          const ent = await db.collection('entitlements').doc(link.data().uid).get();
          // Lifetime (one-time) unlocks are never revoked by subscription changes.
          if (ent.exists && ent.data().lifetime === true) { console.log(`[stripe] ${link.data().uid} is lifetime; ignoring ${event.type}`); break; }
          const active = event.type !== 'customer.subscription.deleted' && ['active', 'trialing', 'past_due'].includes(sub.status);
          await db.collection('entitlements').doc(link.data().uid).set({
            triviaUnlimited: active,
            subscriptionStatus: sub.status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          console.log(`[stripe] ${link.data().uid} subscription ${sub.status} → unlimited=${active}`);
          break;
        }
        default:
          break; // ignore everything else
      }
      return res.json({ received: true });
    } catch (err) {
      console.error('[stripe] handler error', err);
      return res.status(500).send('handler error'); // Stripe retries on 5xx
    }
  }
);

async function grant(db, s) {
  const uid = s.client_reference_id;
  if (!uid || !UID_RE.test(uid)) { console.warn('[stripe] session without valid client_reference_id', s.id); return; }
  const batch = db.batch();
  batch.set(db.collection('entitlements').doc(uid), {
    triviaUnlimited: true,
    mode: s.mode,                                   // 'payment' (one-time) or 'subscription'
    ...(s.mode === 'payment' ? { lifetime: true } : {}),
    stripeCustomer: s.customer || null,
    stripeSession: s.id,
    email: (s.customer_details && s.customer_details.email) || null,
    grantedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  if (s.customer) batch.set(db.collection('stripeCustomers').doc(String(s.customer)), { uid }, { merge: true });
  await batch.commit();
  console.log(`[stripe] granted Tipoff Trivia Unlimited to ${uid} (${s.mode})`);
}
