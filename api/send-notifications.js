import webpush from 'web-push';
import { isAdmin, readJson, forbidden, serverError, adminClient } from './_utils.js';

const VAPID_PUBLIC  = process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@lockstreet.app';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await isAdmin(req))) return forbidden(res);
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys missing - run `npx web-push generate-vapid-keys`' });
  }
  const supa = adminClient();
  if (!supa) return serverError(res, new Error('SUPABASE_SERVICE_ROLE_KEY not set'));

  try {
    const { gameId, title, body: text, audience } = await readJson(req);

    // audience: 'subs' (default) -> only subscribers, or 'all' -> everyone
    let q = supa.from('push_subscriptions').select('id, endpoint, p256dh, auth_secret, user_id');
    if (audience !== 'all') {
      // Inner join via filter would be cleaner; for now, filter in JS after a second query.
      const { data: subs } = await supa
        .from('subscriptions')
        .select('user_id')
        .eq('status', 'active');
      const subscriberIds = (subs || []).map((s) => s.user_id);
      if (subscriberIds.length === 0) return res.status(200).json({ sent: 0, total: 0 });
      q = q.in('user_id', subscriberIds);
    }
    const { data: pushSubs, error } = await q;
    if (error) return serverError(res, error);

    const payload = JSON.stringify({
      title: title || 'New pick dropped',
      body:  text  || 'Open Lock Street.',
      url:   gameId ? `/picks#${gameId}` : '/picks',
      tag:   `pick-${gameId || 'generic'}`,
    });

    const results = await Promise.allSettled((pushSubs || []).map(async (row) => {
      const sub = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth_secret },
      };
      try {
        await webpush.sendNotification(sub, payload);
        return { id: row.id, ok: true };
      } catch (err) {
        // If the endpoint is gone (404/410), prune the row.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supa.from('push_subscriptions').delete().eq('id', row.id);
        }
        return { id: row.id, error: err.statusCode || err.message };
      }
    }));

    const sent = results.filter((r) => r.value?.ok).length;
    res.status(200).json({ sent, total: pushSubs?.length || 0 });
  } catch (e) { serverError(res, e); }
}
