import Stripe from 'stripe';
import { getUserIdFromRequest, readJson, badRequest, serverError, unauthorized } from './_utils.js';

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

    const baseUrl = process.env.APP_URL || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: MODES[tier],
      line_items: [{ price, quantity: 1 }],
      customer_email: body.email || undefined,
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
