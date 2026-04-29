import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Fetch one user's picks. Returns { picks, loading, error, reload }.
 *
 * Picks are returned in camelCase, newest first. Same shape used by
 * StatsStrip / UserPickCard / aggregate math in lib/userPicks.js.
 */
export function useUserPicks(userId, { limit = 200 } = {}) {
  const [picks, setPicks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    if (!userId) { setPicks([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_picks')
        .select(
          'id, user_id, game_id, league, season, week, bet_type, side, units, ' +
          'line_at_pick, juice_at_pick, market_line, market_juice, point_buys, ' +
          'is_free_pick, home_abbr, away_abbr, home_logo, away_logo, ' +
          'locked_at, kickoff_at, result, graded_at, created_at'
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      setPicks((data || []).map(mapPick));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => { load(); }, [load]);

  return { picks, loading, error, reload: load };
}

/**
 * Submit a new pick. Throws on failure. The DB trigger handles the
 * lock-window check; if kickoff has passed the insert raises and we
 * surface the error.
 *
 * Required: { gameId, league, season, betType, side, units, kickoffAt }
 * Optional: { week, lineAtPick, juiceAtPick, marketLine, marketJuice,
 *             homeAbbr, awayAbbr, homeLogo, awayLogo }
 */
export async function submitUserPick(input) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess?.user?.id;
  if (!uid) throw new Error('Not signed in');

  const payload = {
    user_id: uid,
    game_id: input.gameId,
    league: String(input.league || '').toLowerCase(),
    season: Number(input.season),
    week: input.week ?? null,
    bet_type: input.betType,
    side: input.side,
    units: Number(input.units),
    line_at_pick: input.lineAtPick ?? null,
    juice_at_pick: input.juiceAtPick ?? -110,
    market_line: input.marketLine ?? input.lineAtPick ?? null,
    market_juice: input.marketJuice ?? -110,
    point_buys: Math.max(0, Math.floor(Number(input.pointBuys) || 0)),
    is_free_pick: !!input.isFreePick,
    home_abbr: input.homeAbbr ?? null,
    away_abbr: input.awayAbbr ?? null,
    home_logo: input.homeLogo ?? null,
    away_logo: input.awayLogo ?? null,
    kickoff_at: input.kickoffAt,
  };

  const { data, error } = await supabase
    .from('user_picks')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return mapPick(data);
}

function mapPick(p) {
  if (!p) return null;
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
    juiceAtPick: p.juice_at_pick != null ? Number(p.juice_at_pick) : -110,
    marketLine:  p.market_line  != null ? Number(p.market_line)  : null,
    marketJuice: p.market_juice != null ? Number(p.market_juice) : -110,
    pointBuys:   p.point_buys != null ? Number(p.point_buys) : 0,
    isFreePick:  !!p.is_free_pick,
    homeAbbr: p.home_abbr,
    awayAbbr: p.away_abbr,
    homeLogo: p.home_logo,
    awayLogo: p.away_logo,
    lockedAt:  p.locked_at,
    kickoffAt: p.kickoff_at,
    result: p.result,
    gradedAt: p.graded_at,
    createdAt: p.created_at,
    // duplicates with snake_case so the lib/userPicks helpers work
    // whether the caller passes snake or camel:
    juice_at_pick: p.juice_at_pick,
    market_juice:  p.market_juice,
    graded_at:     p.graded_at,
    result_:       p.result,
  };
}
