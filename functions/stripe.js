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
//    5. Full refund or an opened dispute → access revoked.
//       Dispute won → access restored.
//
//  entitlements/{uid} is read-only to its owner and write-denied to
//  every client (see firestore rules) — only this function can grant.
//
//  SECRETS (set once, never commit them):
//    firebase functions:secrets:set STRIPE_SECRET_KEY
//    firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
//      ↳ may hold ONE signing secret, or several separated by commas
//        (e.g. the test endpoint's whsec and the live endpoint's whsec)
//        so test and live webhooks can both hit this function.
//
//  Stripe events to send to this endpoint:
//    checkout.session.completed
//    checkout.session.async_payment_succeeded
//    charge.refunded
//    charge.dispute.created
//    charge.dispute.closed
//
//  Test-mode purchases are stored with test:true. The site only honors
//  them when opened with ?paytest=1, so a Stripe test card can never
//  unlock the real game for normal visitors.
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
    const secrets = STRIPE_WEBHOOK_SECRET.value().split(',').map(s => s.trim()).filter(Boolean);
    let event = null, lastErr = null;
    for (const whsec of secrets) {
      try {
        // req.rawBody is the exact bytes Stripe signed — required for verification.
        event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], whsec);
        break;
      } catch (err) { lastErr = err; }
    }
    if (!event) {
      console.warn('[stripe] signature check failed:', lastErr && lastErr.message);
      return res.status(400).send(`Webhook Error: ${lastErr ? lastErr.message : 'no signing secret configured'}`);
    }

    const db = admin.firestore();
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const s = event.data.object;
          // Delayed methods (e.g. bank debits) complete later via async_payment_succeeded.
          if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') await grant(db, s, event.livemode);
          break;
        }
        case 'checkout.session.async_payment_succeeded':
          await grant(db, event.data.object, event.livemode);
          break;

        case 'charge.refunded': {
          const ch = event.data.object;
          // Only a FULL refund removes access; partial refunds (goodwill credits) don't.
          if (ch.refunded === true) await setAccess(db, ch.payment_intent, false, 'refunded');
          break;
        }
        case 'charge.dispute.created':
          await setAccess(db, event.data.object.payment_intent, false, 'disputed');
          break;
        case 'charge.dispute.closed': {
          const d = event.data.object;
          if (d.status === 'won') await setAccess(db, d.payment_intent, true, 'dispute_won');
          else if (d.status === 'lost') await setAccess(db, d.payment_intent, false, 'dispute_lost');
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

async function grant(db, s, livemode) {
  const uid = s.client_reference_id;
  if (!uid || !UID_RE.test(uid)) { console.warn('[stripe] session without valid client_reference_id', s.id); return; }
  const ref = db.collection('entitlements').doc(uid);
  if (!livemode) {
    // Never let a test purchase overwrite or masquerade as a real one.
    const cur = await ref.get();
    if (cur.exists && cur.data().triviaUnlimited === true && cur.data().test !== true) {
      console.log(`[stripe] ${uid} already has a live unlock; ignoring test purchase ${s.id}`); return;
    }
  }
  const batch = db.batch();
  batch.set(ref, {
    triviaUnlimited: true,
    test: !livemode,
    mode: s.mode,                                   // 'payment' (one-time) or 'subscription'
    ...(s.mode === 'payment' ? { lifetime: true } : {}),
    stripeCustomer: s.customer || null,
    stripeSession: s.id,
    stripePaymentIntent: s.payment_intent || null,
    amount: s.amount_total ?? null,
    email: (s.customer_details && s.customer_details.email) || null,
    revokedReason: admin.firestore.FieldValue.delete(),
    grantedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  if (s.payment_intent) batch.set(db.collection('stripePayments').doc(String(s.payment_intent)), { uid, livemode: !!livemode, session: s.id }, { merge: true });
  if (s.customer) batch.set(db.collection('stripeCustomers').doc(String(s.customer)), { uid }, { merge: true });
  await batch.commit();
  console.log(`[stripe] granted Tipoff Trivia Unlimited to ${uid} (${s.mode}, ${livemode ? 'live' : 'TEST'})`);
}

async function setAccess(db, paymentIntent, on, reason) {
  if (!paymentIntent) { console.warn(`[stripe] ${reason}: no payment_intent on event`); return; }
  const link = await db.collection('stripePayments').doc(String(paymentIntent)).get();
  if (!link.exists) { console.warn(`[stripe] ${reason}: unknown payment ${paymentIntent}`); return; }
  const uid = link.data().uid;
  await db.collection('entitlements').doc(uid).set({
    triviaUnlimited: on,
    ...(on ? { revokedReason: admin.firestore.FieldValue.delete() } : { revokedReason: reason }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`[stripe] ${uid} → unlimited=${on} (${reason})`);
}
