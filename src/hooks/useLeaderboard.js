import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { MIN_SAMPLE } from '../lib/userPicks.js';

/**
 * Read the leaderboard_window materialized view and join profiles.
 *
 * Args:
 *   window: 'week' | 'month' | 'season'
 *   sport:  'all' | 'nfl' | 'cfb' | 'cbb' | 'nba' | 'mlb' | 'nhl'
 *   side:   'hot'  -> top of net units (only qualified, only positive)
 *           'not'  -> bottom of net units (only qualified, only negative)
 *   limit:  default 25
 *
 * Returns { rows, loading, error, reload }.
 *
 * Each row: { userId, handle, displayName, favTeam, favTeamLeague, avatarUrl,
 *             isSystem, league, picksCount, wins, losses, pushes,
 *             unitsWonNet, unitsWonAtMarket, juicePaid, pointBuyCost,
 *             winPctAtLine }
 */
export function useLeaderboard({ window = 'month', sport = 'all', side = 'hot', limit = 25 } = {}) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const min = MIN_SAMPLE[window] ?? 0;

      // We can't join inside the materialized view, but Supabase
      // PostgREST resolves the foreign-key embedding via the user_id
      // column on leaderboard_window because it references auth.users.
      // Simpler: select the view rows, then in a second hop fetch
      // the matching profiles. This keeps the SQL trivial.
      let q = supabase
        .from('leaderboard_window')
        .select('user_id, league, win_period, picks_count, wins, losses, pushes, units_won_net, units_won_at_market, juice_paid')
        .eq('win_period', window)
        .gte('picks_count', min);

      if (sport && sport !== 'all') {
        q = q.eq('league', sport.toLowerCase());
      }

      // Sort + bound by side
      if (side === 'hot') {
        q = q.order('units_won_net', { ascending: false }).gt('units_won_net', 0);
      } else {
        q = q.order('units_won_net', { ascending: true }).lt('units_won_net', 0);
      }
      q = q.limit(limit);

      const { data, error } = await q;
      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((r) => r.user_id)));
      let profileById = {};
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, handle, display_name, fav_team, fav_team_league, avatar_url, is_system, banned, is_private')
          .in('user_id', userIds);
        for (const p of profs || []) profileById[p.user_id] = p;
      }

      const merged = (data || [])
        .map((r) => mergeRow(r, profileById[r.user_id]))
        .filter((r) => r && !r.banned && !r.isPrivate);

      setRows(merged);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [window, sport, side, limit]);

  useEffect(() => { load(); }, [load]);

  return { rows, loading, error, reload: load };
}

/**
 * Read the SAME row for one user across all leagues, for the chosen
 * window. Used by the StatsStrip on a profile page.
 *
 * Returns { byLeague: { all|nfl|... : row }, loading, error }.
 *
 * 'all' is computed client-side by summing across leagues so the view
 * doesn't need an extra row per user.
 */
export function useLeaderboardForUser(userId, { window = 'season' } = {}) {
  const [byLeague, setByLeague] = useState({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    if (!userId) { setByLeague({}); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leaderboard_window')
        .select('league, win_period, picks_count, wins, losses, pushes, units_won_net, units_won_at_market, juice_paid')
        .eq('user_id', userId)
        .eq('win_period', window);
      if (error) throw error;

      const out = { all: emptyRow() };
      for (const r of data || []) {
        out[r.league] = {
          league: r.league,
          picksCount: Number(r.picks_count) || 0,
          wins: Number(r.wins) || 0,
          losses: Number(r.losses) || 0,
          pushes: Number(r.pushes) || 0,
          unitsWonNet: Number(r.units_won_net) || 0,
          unitsWonAtMarket: Number(r.units_won_at_market) || 0,
          juicePaid: Number(r.juice_paid) || 0,
          pointBuyCost: (Number(r.units_won_at_market) || 0) - (Number(r.units_won_net) || 0),
          winPctAtLine: 0, // filled below
        };
        const denom = out[r.league].wins + out[r.league].losses;
        out[r.league].winPctAtLine = denom > 0 ? out[r.league].wins / denom : 0;
        // sum into 'all'
        out.all.picksCount       += out[r.league].picksCount;
        out.all.wins             += out[r.league].wins;
        out.all.losses           += out[r.league].losses;
        out.all.pushes           += out[r.league].pushes;
        out.all.unitsWonNet      += out[r.league].unitsWonNet;
        out.all.unitsWonAtMarket += out[r.league].unitsWonAtMarket;
        out.all.juicePaid        += out[r.league].juicePaid;
      }
      const allDenom = out.all.wins + out.all.losses;
      out.all.winPctAtLine = allDenom > 0 ? out.all.wins / allDenom : 0;
      out.all.pointBuyCost = out.all.unitsWonAtMarket - out.all.unitsWonNet;
      setByLeague(out);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [userId, window]);

  useEffect(() => { load(); }, [load]);

  return { byLeague, loading, error, reload: load };
}

function mergeRow(r, p) {
  if (!p) return null;
  const wins = Number(r.wins) || 0;
  const losses = Number(r.losses) || 0;
  const denom = wins + losses;
  const net = Number(r.units_won_net) || 0;
  const atMkt = Number(r.units_won_at_market) || 0;
  return {
    userId: r.user_id,
    handle: p.handle,
    displayName: p.display_name,
    favTeam: p.fav_team,
    favTeamLeague: p.fav_team_league,
    avatarUrl: p.avatar_url,
    isSystem: !!p.is_system,
    banned: !!p.banned,
    isPrivate: !!p.is_private,
    league: r.league,
    window: r.win_period,
    picksCount: Number(r.picks_count) || 0,
    wins, losses,
    pushes: Number(r.pushes) || 0,
    unitsWonNet: net,
    unitsWonAtMarket: atMkt,
    juicePaid: Number(r.juice_paid) || 0,
    pointBuyCost: atMkt - net,
    winPctAtLine: denom > 0 ? wins / denom : 0,
  };
}

function emptyRow() {
  return {
    league: 'all',
    picksCount: 0, wins: 0, losses: 0, pushes: 0,
    unitsWonNet: 0, unitsWonAtMarket: 0, juicePaid: 0,
    pointBuyCost: 0, winPctAtLine: 0,
  };
}
