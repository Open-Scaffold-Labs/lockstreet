import {
  getUserIdFromRequest, readJson, badRequest, serverError,
  bearer, userClient,
} from './_utils.js';

/** Stores a Web Push subscription (RLS lets users manage only their own rows). */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) return badRequest(res, 'Sign-in required to register push notifications');

    const body = await readJson(req);
    const subscription = body.subscription;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return badRequest(res, 'Push subscription must include endpoint and keys');
    }

    const supa = userClient(bearer(req));
    if (!supa) return serverError(res, new Error('Supabase env missing'));

    const { error } = await supa
      .from('push_subscriptions')
      .upsert(
        {
          user_id:     userId,
          endpoint:    subscription.endpoint,
          p256dh:      subscription.keys.p256dh,
          auth_secret: subscription.keys.auth,
          user_agent:  req.headers['user-agent'] || null,
        },
        { onConflict: 'endpoint' }
      );
    if (error) return serverError(res, error);
    res.status(200).json({ ok: true });
  } catch (e) { serverError(res, e); }
}
