import Stripe from 'stripe';
import { adminClient } from './_utils.js';
import { sendEmail, emailLayout } from './_email.js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Vercel needs the raw body for signature verification.
export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function upsertSubscription(supa, payload) {
  const { error } = await supa.from('subscriptions').upsert(payload, { onConflict: 'user_id' });
  if (error) console.error('[stripe-webhook] upsert error', error);
}

/**
 * Annual subscribers get the private Discord. We don't have a programmatic Discord
 * invite-by-email API, so the simplest play is to hand them the static server invite
 * link via email + show it in-app (a notifications row). For now we just log it;
 * email/notification delivery is a follow-up once we wire SMTP/transactional email.
 */
async function maybeSendDiscordInvite({ supa, userId, tier }) {
  const inviteUrl = process.env.DISCORD_INVITE_URL;
  if (!inviteUrl) return;
  if (tier !== 'season') return; // Annual only

  // Get the user's email
  const { data, error } = await supa.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) {
    console.warn('[stripe-webhook] Discord invite skipped: no email for user', userId);
    return;
  }

  const html = emailLayout({
    heading: 'Welcome to the Lock Street Discord',
    body: `
      <p>You're now an Annual subscriber — thanks for locking in.</p>
      <p>Use the link below to join the private Discord server. This is where pick reasoning gets discussed in real time, line moves get flagged, and Sunday game-day threads run live.</p>
      <p><strong>This link is for you. Don't share it.</strong> Re-uses are fine, but if you pass it around we'll regenerate.</p>
    `.trim(),
    ctaUrl: inviteUrl,
    ctaLabel: 'Join Discord',
    footnote: 'You are receiving this because you just subscribed to Lock Street Annual. Reply to this email if anything looks off.',
  });

  const result = await sendEmail({
    to: data.user.email,
    subject: 'Your private Discord access · Lock Street',
    html,
  });
  if (!result.ok) {
    console.error('[stripe-webhook] Discord invite email failed', result);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!stripe || !WEBHOOK_SECRET) return res.status(500).json({ error: 'Stripe env not configured' });

  const supa = adminClient();
  if (!supa) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' });

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
        const tier   = s.metadata?.tier;
        if (!userId) break;
        await upsertSubscription(supa, {
          user_id:                userId,
          stripe_customer_id:     s.customer,
          stripe_subscription_id: s.subscription,
          tier,
          status:                 'active',
        });
        await maybeSendDiscordInvite({ supa, userId, tier });
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        await upsertSubscription(supa, {
          user_id:                userId,
          stripe_customer_id:     sub.customer,
          stripe_subscription_id: sub.id,
          tier:                   sub.metadata?.tier || null,
          status:                 sub.status,
          current_period_end:     sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          cancel_at_period_end:   !!sub.cancel_at_period_end,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        await upsertSubscription(supa, {
          user_id:                userId,
          stripe_customer_id:     sub.customer,
          stripe_subscription_id: sub.id,
          tier:                   sub.metadata?.tier || null,
          status:                 'canceled',
        });
        break;
      }
      default:
        // ignore other events
        break;
    }
    res.json({ received: true });
  } catch (e) {
    console.error('[stripe-webhook]', e);
    res.status(500).json({ error: e.message });
  }
}
