import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fetchGameById } from '../lib/espn.js';

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
        .select('id, game_id, league, season, week, side, units, reasoning, visibility, result, posted_at, locks_at, graded_at, home_abbr, away_abbr, home_logo, away_logo, spread_home, total_taken, ml_home, ml_away, bet_type, picked_side')
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
          gradedAt: p.graded_at,
          homeAbbr:   p.home_abbr,
          awayAbbr:   p.away_abbr,
          homeLogo:   p.home_logo,
          awayLogo:   p.away_logo,
          spreadHome: p.spread_home != null ? Number(p.spread_home) : null,
          totalTaken: p.total_taken != null ? Number(p.total_taken) : null,
          mlHome:     p.ml_home != null ? Number(p.ml_home) : null,
          mlAway:     p.ml_away != null ? Number(p.ml_away) : null,
          betType:    p.bet_type,
          pickedSide: p.picked_side,
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

/**
 * Auto-grade pending picks: pull each one's final ESPN score, compute
 * win/loss/push, write back to picks table. Runs once per /picks page load.
 * Skips any pick missing the fields needed to grade (legacy rows without
 * picked_side / bet_type — those need a manual grade or repost).
 */
export async function autoGradePendingPicks(picks, supa) {
  if (!supa || !picks?.length) return [];
  const pending = picks.filter((p) => p.result === 'pending' && p.gameId);
  const updates = [];
  for (const pick of pending) {
    try {
      const game = await fetchGameById(pick.league, pick.gameId);
      if (!game || game.status !== 'final' || !game.score) continue;
      const result = decidePickResult(pick, game.score);
      if (!result) continue;
      const { data, error } = await supa.from('picks').update({
        result,
        graded_at: new Date().toISOString(),
      }).eq('id', pick.id).select().single();
      if (!error && data) updates.push(data);
    } catch { /* keep pending */ }
  }
  return updates;
}

function decidePickResult(pick, score) {
  const h = Number(score.home), a = Number(score.away);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  const betType = pick.betType || 'spread';

  if (betType === 'moneyline') {
    if (h === a) return 'push';
    const homeWon = h > a;
    return (pick.pickedSide === 'home') === homeWon ? 'win' : 'loss';
  }
  if (betType === 'spread' && pick.spreadHome != null && pick.pickedSide) {
    // spreadHome is the home team's number (positive = home dog).
    // homeAts > 0 means HOME covered.
    const homeAts = (h - a) + Number(pick.spreadHome);
    if (homeAts === 0) return 'push';
    const homeCovers = homeAts > 0;
    return (pick.pickedSide === 'home') === homeCovers ? 'win' : 'loss';
  }
  if (betType === 'total' && pick.totalTaken != null && pick.pickedSide) {
    const total = h + a;
    if (total === Number(pick.totalTaken)) return 'push';
    const wentOver = total > Number(pick.totalTaken);
    return (pick.pickedSide === 'over') === wentOver ? 'win' : 'loss';
  }
  return null;
}
