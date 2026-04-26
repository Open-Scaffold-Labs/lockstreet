import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Reads picks from Supabase (RLS-gated):
 *   - public picks: visible to everyone
 *   - paid picks: visible to active subscribers (per RLS policy)
 *   - all picks: visible to admins (per RLS policy)
 *
 * Returns picks keyed by game_id for easy lookup from <GameCard>.
 */
export function usePicks() {
  const [picks, setPicks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('picks')
        .select('id, game_id, league, season, week, side, units, reasoning, visibility, result, posted_at, locks_at')
        .order('posted_at', { ascending: false });
      if (error) throw error;
      const byId = {};
      (data || []).forEach((p) => {
        byId[p.game_id] = {
          id: p.id,
          gameId: p.game_id,
          league: p.league,
          season: p.season,
          week: p.week,
          side: p.side,
          units: Number(p.units),
          reasoning: p.reasoning,
          visibility: p.visibility,
          result: p.result,
          postedAt: p.posted_at,
          locksAt: p.locks_at,
        };
      });
      setPicks(byId);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { picks, loading, error, reload: load };
}
