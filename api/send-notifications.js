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
  if (op === 'notify-follower')    return notifyFollower(req, res);
  if (op === 'notify-comment')     return notifyComment(req, res);
  if (op === 'notify-pick-action') return notifyPickAction(req, res);

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

  const reqBody = await readJson(req);
  const followedId = reqBody?.followedId;
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

// ====================================================================
// notify-comment — fires when a user comments on a post or user_pick.
// Body: { commentId } (the rest is fetched server-side so the client
// can't lie about target/author/snippet).
// Inserts a notifications row for the target's author (if not the
// commenter themselves) and pushes if subscribed.
// ====================================================================
async function notifyComment(req, res) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(200).json({ sent: 0, skipped: 'no-vapid' });
  }
  const supa = adminClient();
  if (!supa) return serverError(res, new Error('SUPABASE_SERVICE_ROLE_KEY not set'));

  const userId = await getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'sign-in required' });

  const body = await readJson(req);
  const commentId = body?.commentId;
  if (!commentId) return res.status(400).json({ error: 'commentId required' });

  // Fetch the comment row server-side.
  const { data: comment } = await supa
    .from('comments')
    .select('id, user_id, post_id, pick_id, body, deleted_at')
    .eq('id', commentId)
    .maybeSingle();
  if (!comment) return res.status(200).json({ sent: 0, skipped: 'comment-not-found' });
  if (comment.user_id !== userId) {
    return res.status(403).json({ error: 'not your comment' });
  }
  if (comment.deleted_at) {
    return res.status(200).json({ sent: 0, skipped: 'comment-deleted' });
  }

  // Resolve the target's author. Posts → posts.user_id; picks → user_picks.user_id.
  let targetAuthorId = null;
  let targetUrl = null;
  let targetLabel = '';
  if (comment.post_id) {
    const { data: p } = await supa
      .from('posts')
      .select('user_id')
      .eq('id', comment.post_id)
      .maybeSingle();
    if (!p) return res.status(200).json({ sent: 0, skipped: 'post-not-found' });
    targetAuthorId = p.user_id;
    targetLabel = 'your post';
    targetUrl = '/feed';
  } else if (comment.pick_id) {
    const { data: pk } = await supa
      .from('user_picks')
      .select('user_id, home_abbr, away_abbr, side, line_at_pick, bet_type')
      .eq('id', comment.pick_id)
      .maybeSingle();
    if (!pk) return res.status(200).json({ sent: 0, skipped: 'pick-not-found' });
    targetAuthorId = pk.user_id;
    const sideTxt = pickSideLabel(pk);
    targetLabel = sideTxt ? `your ${sideTxt} pick` : 'your pick';
    targetUrl = '/profile';
  } else {
    return res.status(400).json({ error: 'comment has no target' });
  }

  // Self-comment skipped.
  if (targetAuthorId === userId) {
    return res.status(200).json({ sent: 0, skipped: 'self' });
  }

  // Fetch commenter's profile for copy.
  const { data: prof } = await supa
    .from('profiles')
    .select('handle, display_name')
    .eq('user_id', userId)
    .maybeSingle();
  const displayName = prof?.display_name || 'Someone';
  const commenterUrl = prof?.handle ? `/u/${prof.handle}` : '/feed';

  const title = `${displayName} commented on ${targetLabel}`;
  const snippet = (comment.body || '').slice(0, 140);
  const notifBody = snippet;

  // Persist inbox row.
  await supa.from('notifications').insert({
    user_id: targetAuthorId,
    type:    'new_comment',
    title,
    body:    notifBody,
    url:     targetUrl,
    meta: {
      commenter_id:    userId,
      commenter_handle: prof?.handle || null,
      target_type:     comment.post_id ? 'post' : 'pick',
      target_id:       comment.post_id || comment.pick_id,
      comment_id:      comment.id,
    },
  });

  // Fan out push.
  return pushTo(supa, targetAuthorId, {
    title,
    body: notifBody,
    url: targetUrl,
    tag: `comment-${comment.id}`,
  }, res);
}

// ====================================================================
// notify-pick-action — fires when a user tails or fades a pick.
// Body: { pickId, action } where action in {'tail','fade'}.
// Inserts a notifications row for the pick's author (if not self) and
// pushes if subscribed. Each interaction = one notification per user
// instruction; UI groups them when 5+ accumulate on the same target.
// ====================================================================
async function notifyPickAction(req, res) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(200).json({ sent: 0, skipped: 'no-vapid' });
  }
  const supa = adminClient();
  if (!supa) return serverError(res, new Error('SUPABASE_SERVICE_ROLE_KEY not set'));

  const userId = await getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'sign-in required' });

  const body = await readJson(req);
  const pickId = body?.pickId;
  const action = body?.action;
  if (!pickId || (action !== 'tail' && action !== 'fade')) {
    return res.status(400).json({ error: 'pickId + action ∈ {tail,fade} required' });
  }

  // Verify the action row really exists for this user (anti-spoof — same
  // pattern as notifyFollower verifies the follow row).
  const { data: actionRow } = await supa
    .from('pick_actions')
    .select('user_id, action')
    .eq('user_id', userId)
    .eq('pick_id', pickId)
    .maybeSingle();
  if (!actionRow || actionRow.action !== action) {
    return res.status(200).json({ sent: 0, skipped: 'action-not-current' });
  }

  // Fetch the pick + author.
  const { data: pk } = await supa
    .from('user_picks')
    .select('id, user_id, home_abbr, away_abbr, side, line_at_pick, bet_type')
    .eq('id', pickId)
    .maybeSingle();
  if (!pk) return res.status(200).json({ sent: 0, skipped: 'pick-not-found' });
  if (pk.user_id === userId) {
    return res.status(200).json({ sent: 0, skipped: 'self' });
  }

  const { data: prof } = await supa
    .from('profiles')
    .select('handle, display_name')
    .eq('user_id', userId)
    .maybeSingle();
  const displayName = prof?.display_name || 'Someone';

  const sideTxt = pickSideLabel(pk);
  const verb    = action === 'tail' ? 'tailed' : 'faded';
  const title   = sideTxt
    ? `${displayName} ${verb} your ${sideTxt} pick`
    : `${displayName} ${verb} your pick`;

  await supa.from('notifications').insert({
    user_id: pk.user_id,
    type:    action === 'tail' ? 'new_tail' : 'new_fade',
    title,
    body:    null,
    url:     '/profile',
    meta: {
      actor_id:     userId,
      actor_handle: prof?.handle || null,
      pick_id:      pk.id,
      action,
    },
  });

  return pushTo(supa, pk.user_id, {
    title,
    body: null,
    url: '/profile',
    tag: `pick-action-${pk.id}-${userId}`,
  }, res);
}

// ====================================================================
// Shared push helper — looks up subscriptions for `recipientId` and
// fires web-push to each, pruning dead endpoints. Returns a JSON
// summary via `res`.
// ====================================================================
async function pushTo(supa, recipientId, { title, body, url, tag }, res) {
  const { data: pushSubs } = await supa
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_secret')
    .eq('user_id', recipientId);

  if (!pushSubs?.length) {
    return res.status(200).json({ sent: 0, total: 0, persisted: true, skipped: 'no-push-subs' });
  }

  const payload = JSON.stringify({
    title,
    body: body || '',
    url,
    tag,
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
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supa.from('push_subscriptions').delete().eq('id', row.id);
      }
      return { id: row.id, error: err.statusCode || err.message };
    }
  }));

  const sent = results.filter((r) => r.value?.ok).length;
  return res.status(200).json({ sent, total: pushSubs.length, persisted: true });
}

function pickSideLabel(p) {
  if (!p) return '';
  // Build a short label like "DET -10.5" or "OVER 47" so push titles
  // are unambiguous on a busy slate.
  if (p.bet_type === 'total') {
    const ou = p.side === 'over' ? 'OVER' : 'UNDER';
    return p.line_at_pick != null ? `${ou} ${p.line_at_pick}` : ou;
  }
  if (p.bet_type === 'ml') {
    const team = p.side === 'home' ? p.home_abbr : p.side === 'away' ? p.away_abbr : '';
    return team ? `${team} ML` : '';
  }
  // spread
  const team = p.side === 'home' ? p.home_abbr : p.side === 'away' ? p.away_abbr : '';
  if (!team) return '';
  if (p.line_at_pick == null) return team;
  const ln = p.line_at_pick > 0 ? `+${p.line_at_pick}` : `${p.line_at_pick}`;
  return `${team} ${ln}`;
}
