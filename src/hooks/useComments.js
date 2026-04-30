import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Comments on a post or a user_pick.
 *
 * Pass exactly one of `{ postId }` or `{ pickId }` per the schema's
 * one-target check constraint. Returns:
 *   { comments, loading, error, reload, postComment, softDelete }
 *
 * - comments: oldest-first array (display order). Each row carries an
 *   embedded author profile (handle + display_name + favTeamLogo).
 * - postComment(body): inserts on behalf of the signed-in user. Caller
 *   must verify email_confirmed_at upstream — the hook trusts the caller.
 * - softDelete(commentId): flips deleted_at to now() on the row.
 *   Server-side trigger blocks any other field mutation.
 *
 * Subscribes to realtime INSERT and UPDATE on public.comments filtered
 * by the target id, so threads update live as other users post / delete.
 */
export function useComments({ postId, pickId } = {}) {
  const target = postId ? { col: 'post_id', val: postId } : pickId ? { col: 'pick_id', val: pickId } : null;
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    if (!supabase || !target) { setLoading(false); return; }
    setLoading(true);
    try {
      // Two-step (no PostgREST embed across auth schema, same pattern as useFollows).
      const { data: rows, error: e1 } = await supabase
        .from('comments')
        .select('id, user_id, post_id, pick_id, body, deleted_at, created_at')
        .eq(target.col, target.val)
        .order('created_at', { ascending: true })
        .limit(500);
      if (e1) throw e1;

      const userIds = Array.from(new Set((rows || []).map((r) => r.user_id)));
      let profileById = {};
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, handle, display_name, fav_team_logo, fav_team_name, is_creator')
          .in('user_id', userIds);
        for (const p of profs || []) profileById[p.user_id] = p;
      }

      setComments((rows || []).map((r) => mapComment(r, profileById[r.user_id])));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [target?.col, target?.val]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription scoped to this target. Channel name unique per
  // target so multiple comment threads in the same view don't collide.
  useEffect(() => {
    if (!supabase || !target) return;
    const channelName = `comments-${target.col}-${target.val}`;
    const ch = supabase
      .channel(channelName)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `${target.col}=eq.${target.val}` },
        () => { load(); })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'comments', filter: `${target.col}=eq.${target.val}` },
        () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [target?.col, target?.val, load]);

  const postComment = useCallback(async (body) => {
    if (!supabase || !target) throw new Error('Comment target missing');
    const trimmed = (body || '').trim();
    if (!trimmed) throw new Error('Comment cannot be empty');
    if (trimmed.length > 500) throw new Error('Comment too long (500 max)');

    const { data: sess } = await supabase.auth.getUser();
    const uid = sess?.user?.id;
    if (!uid) throw new Error('Sign in to comment');

    // The schema enforces exactly one target via CHECK constraint.
    const row = {
      user_id: uid,
      body: trimmed,
      [target.col]: target.val,
      [target.col === 'post_id' ? 'pick_id' : 'post_id']: null,
    };
    const { data: inserted, error } = await supabase
      .from('comments')
      .insert(row)
      .select('id')
      .single();
    if (error) throw error;

    // Realtime will pick this up for the local feed; no optimistic-insert.
    // Fire-and-forget notify the target's author. Server verifies target +
    // self-skip + caller-owns-comment, so this is safe to fail silently.
    try {
      const sessForTok = await supabase.auth.getSession();
      const tok = sessForTok?.data?.session?.access_token;
      if (tok && inserted?.id) {
        fetch('/api/send-notifications?op=notify-comment', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ commentId: inserted.id }),
        }).catch(() => {});
      }
    } catch { /* notify is best-effort */ }
  }, [target?.col, target?.val]);

  const softDelete = useCallback(async (commentId) => {
    if (!supabase) throw new Error('Not configured');
    const { error } = await supabase
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', commentId);
    if (error) throw error;
  }, []);

  // Visible-only count (excluding soft-deleted) for "X comments" affordance.
  const visibleCount = useMemo(
    () => comments.filter((c) => !c.deletedAt).length,
    [comments],
  );

  return {
    comments,
    visibleCount,
    loading,
    error,
    reload: load,
    postComment,
    softDelete,
  };
}

function mapComment(row, profile) {
  return {
    id:        row.id,
    userId:    row.user_id,
    postId:    row.post_id,
    pickId:    row.pick_id,
    body:      row.body,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    author: profile ? {
      userId:        profile.user_id,
      handle:        profile.handle,
      displayName:   profile.display_name,
      favTeamLogo:   profile.fav_team_logo,
      favTeamName:   profile.fav_team_name,
      isCreator:     !!profile.is_creator,
    } : null,
  };
}
