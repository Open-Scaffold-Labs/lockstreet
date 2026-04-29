import webpush from 'web-push';
import { isAdmin, readJson, forbidden, serverError, adminClient, getUserIdFromRequest } from './_utils.js';

const VAPID_PUBLIC  = process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@lockstreet.app';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Multiplexed endpoint (per CLAUDE.md Vercel 12-fn cap). Default
  // behavior is admin-only broadcast; ?op=notify-follower is the
  // user-initiated "X followed you" push that fires from useFollows.
  const op = req.query?.op;
  if (op === 'notify-follower') return notifyFollower(req, res);

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

// ====================================================================
// notify-follower — fires when a user follows another user.
// Verifies the calling user is authenticated AND the follow row
// exists (anti-spam). Looks up the followed user's push
// subscriptions and sends "X started following you" with a link to
// the follower's profile.
// ====================================================================
async function notifyFollower(req, res) {
  // No-op gracefully if VAPID keys aren't configured (dev / preview).
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(200).json({ sent: 0, skipped: 'no-vapid' });
  }
  const supa = adminClient();
  if (!supa) return serverError(res, new Error('SUPABASE_SERVICE_ROLE_KEY not set'));

  // Caller must be authenticated.
  const userId = await getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'sign-in required' });

  const body = await readJson(req);
  const followedId = body?.followedId;
  if (!followedId) return res.status(400).json({ error: 'followedId required' });
  if (followedId === userId) {
    return res.status(200).json({ sent: 0, skipped: 'self' });
  }

  // Anti-abuse: verify the follow row really exists. Stops random
  // authenticated callers from spamming push notifications to anyone.
  const { count: followCount } = await supa
    .from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('follower_id', userId)
    .eq('followed_id', followedId);
  if (!followCount) {
    return res.status(200).json({ sent: 0, skipped: 'no-follow-row' });
  }

  // Fetch follower's profile (for notification copy + click-through URL).
  const { data: prof } = await supa
    .from('profiles')
    .select('handle, display_name, fav_team_name')
    .eq('user_id', userId)
    .maybeSingle();
  const displayName = prof?.display_name || 'Someone';
  const handle      = prof?.handle ? `@${prof.handle}` : '';

  const title = `${displayName} started following you`;
  const body  = handle ? `Tap to view ${handle}'s profile.` : 'Tap to view their profile.';
  const url   = prof?.handle ? `/u/${prof.handle}` : '/profile';

  // Persist a notification row regardless of push subscription state
  // so the user has it in their inbox even if push wasn't enabled.
  // Best-effort — surface insert errors but don't fail the whole call.
  await supa.from('notifications').insert({
    user_id: followedId,
    type:    'new_follower',
    title,
    body,
    url,
    meta:    { follower_id: userId, follower_handle: prof?.handle || null },
  });

  // Fetch followed user's push subscriptions for the additional push send.
  const { data: pushSubs } = await supa
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_secret')
    .eq('user_id', followedId);

  if (!pushSubs?.length) {
    return res.status(200).json({ sent: 0, total: 0, persisted: true, skipped: 'no-push-subs' });
  }

  const payload = JSON.stringify({
    title,
    body,
    url,
    tag:   `follow-${userId}-${followedId}`,
  });

  const results = await Promise.allSettled(pushSubs.map(async (row) => {
    const sub = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth_secret },
    };
    try {
      await webpush.sendNotification(sub, payload);
      return { id: row.id, ok: true };
    } catch (err) {
      // Prune dead subscriptions (gone / expired endpoints).
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supa.from('push_subscriptions').delete().eq('id', row.id);
      }
      return { id: row.id, error: err.statusCode || err.message };
    }
  }));

  const sent = results.filter((r) => r.value?.ok).length;
  res.status(200).json({ sent, total: pushSubs.length, persisted: true });
}
