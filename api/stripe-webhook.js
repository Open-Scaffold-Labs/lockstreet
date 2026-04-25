import Stripe from 'stripe';
import { kv } from '@vercel/kv';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Vercel needs the raw body for Stripe signature verification.
export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!stripe || !WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Stripe env not configured' });
  }

  let event;
  try {
    const raw = await readRaw(req);
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).json({ error: `Webhook signature failed: ${e.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        const userId = s.client_reference_id || s.metadata?.userId;
        const tier = s.metadata?.tier;
        if (userId) {
          await kv.set(`sub:${userId}`, {
            active: true,
            tier,
            stripeCustomerId: s.customer,
            subscriptionId: s.subscription,
            startedAt: Date.now(),
          });
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (userId) {
          const active = sub.status === 'active' || sub.status === 'trialing';
          await kv.set(`sub:${userId}`, {
            active,
            tier: sub.metadata?.tier || null,
            stripeCustomerId: sub.customer,
            subscriptionId: sub.id,
            renewsAt: sub.current_period_end ? sub.current_period_end * 1000 : null,
            status: sub.status,
          });
        }
        break;
      }
      default:
        // ignore
        break;
    }
    res.json({ received: true });
  } catch (e) {
    console.error('[stripe-webhook]', e);
    res.status(500).json({ error: e.message });
  }
}
