import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';

/**
 * Follow graph for one user (default: current signed-in user).
 *
 * Returns:
 *   following     - array of profiles the user follows
 *   followers     - array of profiles following the user
 *   followingIds  - Set of user_ids being followed (for quick lookup)
 *   loading, error, reload
 *   follow(uid) / unfollow(uid)  - mutate from the current user (auth.uid())
 *   isFollowing(uid)             - sync check against followingIds
 */
export function useFollows(targetUserId) {
  const { userId: meId } = useAuth?.() || {};
  const ownerId = targetUserId || meId || null;

  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    if (!ownerId) { setFollowing([]); setFollowers([]); setLoading(false); return; }
    setLoading(true);
    try {
      // Following: rows where this user is the follower; join profiles for the followed.
      const { data: outRows, error: outErr } = await supabase
        .from('follows')
        .select('followed_id, created_at, profile:profiles!follows_followed_id_fkey(user_id, handle, display_name, fav_team, fav_team_league, avatar_url, is_system)')
        .eq('follower_id', ownerId);
      if (outErr) throw outErr;

      // Followers: rows where this user is the followed; join profiles for the follower.
      const { data: inRows, error: inErr } = await supabase
        .from('follows')
        .select('follower_id, created_at, profile:profiles!follows_follower_id_fkey(user_id, handle, display_name, fav_team, fav_team_league, avatar_url, is_system)')
        .eq('followed_id', ownerId);
      if (inErr) throw inErr;

      setFollowing((outRows || []).map((r) => mapFollowProfile(r.profile)).filter(Boolean));
      setFollowers((inRows  || []).map((r) => mapFollowProfile(r.profile)).filter(Boolean));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  const follow = useCallback(async (otherUserId) => {
    if (!supabase || !meId) throw new Error('Not signed in');
    if (otherUserId === meId) throw new Error('Cannot follow yourself');
    const { error } = await supabase.from('follows').insert({
      follower_id: meId,
      followed_id: otherUserId,
    });
    if (error && error.code !== '23505') throw error; // ignore "already following"
    if (ownerId === meId) await load();
  }, [meId, ownerId, load]);

  const unfollow = useCallback(async (otherUserId) => {
    if (!supabase || !meId) throw new Error('Not signed in');
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', meId)
      .eq('followed_id', otherUserId);
    if (error) throw error;
    if (ownerId === meId) await load();
  }, [meId, ownerId, load]);

  const followingIds = new Set(following.map((p) => p.userId));
  const isFollowing  = (uid) => followingIds.has(uid);

  return {
    following, followers, followingIds,
    loading, error, reload: load,
    follow, unfollow, isFollowing,
  };
}

/**
 * Lightweight version: just returns whether *I* follow a given user.
 * Cheaper than useFollows when all you need is the button state.
 */
export function useIsFollowing(otherUserId) {
  const { userId: meId } = useAuth?.() || {};
  const [is, setIs] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !meId || !otherUserId || meId === otherUserId) {
      setIs(false); setLoading(false); return;
    }
    setLoading(true);
    try {
      const { count } = await supabase
        .from('follows')
        .select('follower_id', { count: 'exact', head: true })
        .eq('follower_id', meId)
        .eq('followed_id', otherUserId);
      setIs((count || 0) > 0);
    } finally {
      setLoading(false);
    }
  }, [meId, otherUserId]);

  useEffect(() => { load(); }, [load]);

  return { isFollowing: is, loading, reload: load };
}

function mapFollowProfile(p) {
  if (!p) return null;
  return {
    userId: p.user_id,
    handle: p.handle,
    displayName: p.display_name,
    favTeam: p.fav_team,
    favTeamLeague: p.fav_team_league,
    avatarUrl: p.avatar_url,
    isSystem: !!p.is_system,
  };
}
