import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';

export function useBets() {
  const { isSignedIn, userId } = useAuth();
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!supabase || !isSignedIn) { setBets([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('bets')
      .select('*')
      .order('placed_at', { ascending: false });
    if (error) setError(error); else { setBets(data || []); setError(null); }
    setLoading(false);
  }, [isSignedIn]);

  useEffect(() => { reload(); }, [reload, userId]);

  const addBet = useCallback(async (bet) => {
    if (!supabase) throw new Error('Supabase not configured');
    const row = {
      league:        bet.league || 'nfl',
      description:   bet.description,
      bet_type:      bet.betType || 'spread',
      bet_side:      bet.betSide || null,
      spread_taken:  bet.spreadTaken ?? null,
      total_taken:   bet.totalTaken  ?? null,
      units:         Number(bet.units) || 1,
      odds:          bet.odds || null,
      result:        bet.result || 'pending',
      unit_size:     Number(bet.unitSize) || 25,
      notes:         bet.notes || null,
      game_id:       bet.gameId || null,
      season:        bet.season ?? null,
      week:          bet.week ?? null,
      home_abbr:     bet.homeAbbr || null,
      away_abbr:     bet.awayAbbr || null,
      kickoff_at:    bet.kickoffAt || null,
    };
    const { data, error } = await supabase.from('bets').insert(row).select().single();
    if (error) throw error;
    setBets((b) => [data, ...b]);
    return data;
  }, []);

  const updateResult = useCallback(async (id, result, finalScore) => {
    const bet = bets.find((b) => b.id === id);
    if (!bet) return;
    const payout = computePayout(bet, result);
    const patch = {
      result, payout,
      graded_at: result === 'pending' ? null : new Date().toISOString(),
    };
    if (finalScore) {
      patch.final_home = finalScore.home;
      patch.final_away = finalScore.away;
    }
    const { data, error } = await supabase
      .from('bets').update(patch).eq('id', id).select().single();
    if (error) throw error;
    setBets((arr) => arr.map((b) => (b.id === id ? data : b)));
  }, [bets]);

  const deleteBet = useCallback(async (id) => {
    const { error } = await supabase.from('bets').delete().eq('id', id);
    if (error) throw error;
    setBets((arr) => arr.filter((b) => b.id !== id));
  }, []);

  return { bets, loading, error, reload, addBet, updateResult, deleteBet };
}

// =============================================================================
// Auto-grading
// =============================================================================
// For pending bets that have a game_id and a final score on ESPN, compute the
// W/L outcome and patch the bet row. Runs once on bankroll page load.

import { fetchGameById } from '../lib/espn.js';

export async function autoGradePending(bets, supa) {
  if (!supa || !bets?.length) return [];
  const pending = bets.filter((b) => b.result === 'pending' && b.game_id);
  const updates = [];
  for (const bet of pending) {
    try {
      const game = await fetchGameById(bet.league, bet.game_id);
      if (!game || game.status !== 'final' || !game.score) continue;
      const result = decideResult(bet, game.score);
      if (!result) continue;
      const payout = computePayout(bet, result);
      const { data, error } = await supa.from('bets').update({
        result, payout,
        final_home: game.score.home, final_away: game.score.away,
        graded_at: new Date().toISOString(),
      }).eq('id', bet.id).select().single();
      if (!error && data) updates.push(data);
    } catch { /* keep pending */ }
  }
  return updates;
}

function decideResult(bet, score) {
  const h = Number(score.home), a = Number(score.away);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  if (bet.bet_type === 'moneyline') {
    if (h === a) return 'push';
    const homeWon = h > a;
    return (bet.bet_side === 'home') === homeWon ? 'win' : 'loss';
  }
  if (bet.bet_type === 'spread' && bet.spread_taken != null) {
    // spread_taken stored as the home team's number on the bet (positive = home dog).
    const homeMargin = h - a;
    const homeAts = homeMargin + Number(bet.spread_taken);  // result against the spread for HOME side
    if (homeAts === 0) return 'push';
    const homeCovers = homeAts > 0;
    return (bet.bet_side === 'home') === homeCovers ? 'win' : 'loss';
  }
  if (bet.bet_type === 'total' && bet.total_taken != null) {
    const total = h + a;
    if (total === Number(bet.total_taken)) return 'push';
    const wentOver = total > Number(bet.total_taken);
    return (bet.bet_side === 'over') === wentOver ? 'win' : 'loss';
  }
  return null;
}

// =============================================================================
// Payout math
// =============================================================================
function computePayout(bet, result) {
  const units = Number(bet.units) || 0;
  const size = Number(bet.unit_size) || 25;
  if (result === 'push' || result === 'pending') return 0;
  if (result === 'loss') return -(units * size);
  const odds = parseOdds(bet.odds);
  return units * size * odds;
}

function parseOdds(s) {
  if (!s) return 100 / 110;
  const n = Number(String(s).replace(/[^-+\d.]/g, ''));
  if (!Number.isFinite(n) || n === 0) return 100 / 110;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}
