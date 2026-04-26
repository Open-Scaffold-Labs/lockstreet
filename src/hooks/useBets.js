import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';

/**
 * Fetch + mutate the signed-in user's bets.
 * Read/write goes through Supabase directly (RLS scopes to auth.uid()).
 */
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
      league:      bet.league || 'nfl',
      description: bet.description,
      bet_type:    bet.betType || 'spread',
      units:       Number(bet.units) || 1,
      odds:        bet.odds || null,
      result:      bet.result || 'pending',
      unit_size:   Number(bet.unitSize) || 25,
      notes:       bet.notes || null,
      game_id:     bet.gameId || null,
    };
    const { data, error } = await supabase.from('bets').insert(row).select().single();
    if (error) throw error;
    setBets((b) => [data, ...b]);
    return data;
  }, []);

  const updateResult = useCallback(async (id, result) => {
    const bet = bets.find((b) => b.id === id);
    if (!bet) return;
    const payout = computePayout(bet, result);
    const { data, error } = await supabase
      .from('bets')
      .update({ result, payout, graded_at: result === 'pending' ? null : new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
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

/**
 * Compute profit/loss in dollars for a bet given its result.
 * Assumes American odds (-110, +150). Push = 0. Loss = -(units * unit_size).
 */
function computePayout(bet, result) {
  const units = Number(bet.units) || 0;
  const size = Number(bet.unit_size) || 25;
  if (result === 'push' || result === 'pending') return 0;
  if (result === 'loss') return -(units * size);
  // win
  const odds = parseOdds(bet.odds);
  return units * size * odds;
}

function parseOdds(s) {
  if (!s) return 100 / 110; // default -110
  const n = Number(String(s).replace(/[^-+\d.]/g, ''));
  if (!Number.isFinite(n) || n === 0) return 100 / 110;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}
