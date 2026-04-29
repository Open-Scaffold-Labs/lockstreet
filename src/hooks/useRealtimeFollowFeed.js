import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';

/**
 * Realtime feed of new picks from people the current user follows.
 * Subscribes to inserts on user_picks and filters client-side against
 * the follow list (Supabase realtime row-level filters don't accept
 * subqueries).
 *
 * Returns { feed, loading } — feed is an array of newly-arrived picks
 * since mount, newest first, capped at 25.
 *
 * Does NOT include the user's own picks.
 */
export function useRealtimeFollowFeed() {
  const { userId: meId } = useAuth?.() || {};
  const [followIds, setFollowIds] = useState([]);
  const [feed, setFeed]           = useState([]);
  const [loading, setLoading]     = useState(true);

  // Fetch the follow list once; resubscribe if it changes.
  useEffect(() => {
    let cancelled = false;
    async function loadFollows() {
      if (!supabase || !meId) { setLoading(false); return; }
      const { data } = await supabase
        .from('follows')
        .select('followed_id')
        .eq('follower_id', meId);
      if (cancelled) return;
      setFollowIds((data || []).map((r) => r.followed_id));
      setLoading(false);
    }
    loadFollows();
    return () => { cancelled = true; };
  }, [meId]);

  useEffect(() => {
    if (!supabase || !meId || !followIds.length) return undefined;
    const followSet = new Set(followIds);

    const channel = supabase
      .channel(`follow-feed-${meId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_picks' },
        (payload) => {
          const row = payload?.new;
          if (!row || !followSet.has(row.user_id)) return;
          setFeed((prev) => [mapRow(row), ...prev].slice(0, 25));
        },
      )
      .subscribe();

    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [meId, followIds.join(',')]);

  return { feed, loading };
}

function mapRow(p) {
  return {
    id: p.id,
    userId: p.user_id,
    gameId: p.game_id,
    league: p.league,
    season: p.season,
    week: p.week,
    betType: p.bet_type,
    side: p.side,
    units: Number(p.units),
    lineAtPick:  p.line_at_pick != null ? Number(p.line_at_pick) : null,
    juiceAtPick: Number(p.juice_at_pick) || -110,
    homeAbbr: p.home_abbr,
    awayAbbr: p.away_abbr,
    homeLogo: p.home_logo,
    awayLogo: p.away_logo,
    lockedAt: p.locked_at,
    kickoffAt: p.kickoff_at,
    result: p.result,
    createdAt: p.created_at,
  };
}
