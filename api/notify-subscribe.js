import { kv } from '@vercel/kv';
import { getUserIdFromRequest, readJson, badRequest, serverError } from './_utils.js';

/** Stores a Web Push subscription keyed by Clerk user ID. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const userId = await getUserIdFromRequest(req);
    const body = await readJson(req);
    const subscription = body.subscription;
    if (!subscription?.endpoint) return badRequest(res, 'subscription.endpoint required');
    const key = userId ? `push:${userId}` : `push:anon:${Buffer.from(subscription.endpoint).toString('base64').slice(0, 24)}`;
    await kv.set(key, subscription);
    // Also maintain a global index so we can broadcast
    const index = (await kv.get('push:index')) || [];
    if (!index.includes(key)) { index.push(key); await kv.set('push:index', index); }
    res.status(200).json({ ok: true });
  } catch (e) { serverError(res, e); }
}
