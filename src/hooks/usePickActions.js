import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Tail / fade signal on a user_pick.
 *
 *   Tail = "I'd take the same side"  (copy this play)
 *   Fade = "I'd take the other side" (bet against this play)
 *
 * Replaces the like/dislike pattern from social apps with a betting-native
 * signal. Locks at kickoff (DB trigger), so users can't pile on after the
 * result is known.
 *
 * Returns:
 *   { tailCount, fadeCount, myAction, loading, error, setAction, clearAction }
 *
 *   - myAction: 'tail' | 'fade' | null  (null = haven't acted, or signed-out)
 *   - setAction(action): UPSERT my row with the given action. If I already
 *     had the opposite, this flips it.
 *   - clearAction(): DELETE my row.
 *
 * Subscribes to realtime so counts increment live across viewers.
 */
export function usePickActions(pickId, viewerUserId) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!supabase || !pickId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from('pick_actions')
        .select('user_id, action')
        .eq('pick_id', pickId);
      if (e) throw e;
      setRows(data || []);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [pickId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!supabase || !pickId) return;
    const ch = supabase
      .channel(`pick-actions-${pickId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pick_actions', filter: `pick_id=eq.${pickId}` },
        () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [pickId, load]);

  const tailCount = useMemo(() => rows.filter((r) => r.action === 'tail').length, [rows]);
  const fadeCount = useMemo(() => rows.filter((r) => r.action === 'fade').length, [rows]);
  const myAction  = useMemo(
    () => (viewerUserId ? rows.find((r) => r.user_id === viewerUserId)?.action || null : null),
    [rows, viewerUserId],
  );

  const setAction = useCallback(async (action) => {
    if (!supabase) throw new Error('Not configured');
    if (!pickId) throw new Error('Pick id missing');
    if (!viewerUserId) throw new Error('Sign in to tail or fade');
    if (action !== 'tail' && action !== 'fade') throw new Error('Invalid action');

    // upsert by (user_id, pick_id) unique constraint. If the user already
    // has the opposite action, this flips it.
    const { error: e } = await supabase
      .from('pick_actions')
      .upsert(
        { user_id: viewerUserId, pick_id: pickId, action },
        { onConflict: 'user_id,pick_id' },
      );
    if (e) throw e;

    // Fire-and-forget notify the pick author (server side enforces
    // self-skip + that the action row really exists, so this is safe to
    // fail silently on push errors).
    try {
      const sess = await supabase.auth.getSession();
      const tok = sess?.data?.session?.access_token;
      if (tok) {
        fetch('/api/send-notifications?op=notify-pick-action', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ pickId, action }),
        }).catch(() => {});
      }
    } catch { /* notify is best-effort */ }
  }, [pickId, viewerUserId]);

  const clearAction = useCallback(async () => {
    if (!supabase || !pickId || !viewerUserId) return;
    const { error: e } = await supabase
      .from('pick_actions')
      .delete()
      .eq('pick_id', pickId)
      .eq('user_id', viewerUserId);
    if (e) throw e;
  }, [pickId, viewerUserId]);

  return {
    tailCount,
    fadeCount,
    myAction,
    loading,
    error,
    setAction,
    clearAction,
  };
}
