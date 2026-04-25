import webpush from 'web-push';
import { kv } from '@vercel/kv';
import { isAdmin, readJson, forbidden, serverError } from './_utils.js';

const VAPID_PUBLIC  = process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await isAdmin(req))) return forbidden(res);
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys missing — run `npx web-push generate-vapid-keys`' });
  }

  try {
    const { gameId, title, body: text } = await readJson(req);
    const index = (await kv.get('push:index')) || [];
    const payload = JSON.stringify({
      title: title || 'New pick dropped',
      body: text || 'Open Lock Street.',
      url: gameId ? `/picks#${gameId}` : '/picks',
      tag: `pick-${gameId || 'generic'}`,
    });

    const results = await Promise.allSettled(index.map(async (key) => {
      const sub = await kv.get(key);
      if (!sub) return { key, skipped: true };
      try {
        await webpush.sendNotification(sub, payload);
        return { key, ok: true };
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription is gone — prune it.
          await kv.del(key);
        }
        return { key, error: err.statusCode || err.message };
      }
    }));

    res.status(200).json({ sent: results.filter((r) => r.value?.ok).length, total: index.length });
  } catch (e) { serverError(res, e); }
}
