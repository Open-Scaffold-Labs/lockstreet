import Stripe from 'stripe';
import { getUserIdFromRequest, readJson, badRequest, serverError, unauthorized, adminClient } from './_utils.js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const PRICES = {
  weekly:  process.env.STRIPE_PRICE_WEEKLY,
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  season:  process.env.STRIPE_PRICE_SEASON,
};
const MODES = { weekly: 'subscription', monthly: 'subscription', season: 'subscription' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!stripe) return serverError(res, new Error('STRIPE_SECRET_KEY not set'));

  try {
    const body = await readJson(req);
    const tier = body.tier;
    const price = PRICES[tier];
    if (!price) return badRequest(res, 'Unknown tier');

    const userId = await getUserIdFromRequest(req);
    if (!userId) return unauthorized(res, 'Sign in required');

    // Look up the email server-side from auth.users — never trust the
    // client-supplied email, otherwise an attacker could redirect Stripe
    // receipts to a victim's address. Fall back to omitting customer_email
    // so Stripe Checkout collects it from the buyer directly.
    let customerEmail;
    try {
      const supa = adminClient();
      if (supa) {
        const { data } = await supa.auth.admin.getUserById(userId);
        const e = data?.user?.email;
        if (e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) customerEmail = e;
      }
    } catch { /* leave customer_email undefined */ }

    const baseUrl = process.env.APP_URL || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: MODES[tier],
      line_items: [{ price, quantity: 1 }],
      customer_email: customerEmail,
      client_reference_id: userId,
      metadata: { userId, tier },
      subscription_data: { metadata: { userId, tier } },
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/subscribe`,
      allow_promotion_codes: true,
    });

    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (e) {
    serverError(res, e);
  }
}
