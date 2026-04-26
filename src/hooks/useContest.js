import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { fetchScoreboardWeek, fetchGameById } from '../lib/espn.js';

/**
 * Loads the current open contest + its slate of NFL/CFB games.
 *
 * Strategy: pull the most-recent contest with status='open' from supabase.
 * If none exists for this week, return null (admin needs to create it via
 * /admin → Create contest week).
 *
 * Slates come from ESPN scoreboard for the contest's season/week.
 */
export function useCurrentContest() {
  const [contest, setContest] = useState(null);
  const [nflGames, setNflGames] = useState([]);
  const [cfbGames, setCfbGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: e } = await supabase
        .from('contests')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e) throw e;
      setContest(data || null);

      if (data) {
        const [nfl, cfb] = await Promise.all([
          fetchScoreboardWeek({ league: 'nfl',  week: data.week, year: data.season }),
          fetchScoreboardWeek({ league: 'cfb',  week: data.week, year: data.season }),
        ]);
        setNflGames(nfl || []);
        setCfbGames(cfb || []);
      } else {
        setNflGames([]); setCfbGames([]);
      }
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { contest, nflGames, cfbGames, loading, error, refresh };
}

/**
 * Loads the current user's entry + picks for the given contest.
 * Returns null if user hasn't entered yet.
 */
export function useMyContestEntry(contestId, userId) {
  const [entry, setEntry] = useState(null);
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!contestId || !userId) { setEntry(null); setPicks([]); return; }
    setLoading(true);
    const [entryRes, picksRes] = await Promise.all([
      supabase.from('contest_entries').select('*').eq('contest_id', contestId).eq('user_id', userId).maybeSingle(),
      supabase.from('contest_picks').select('*').eq('contest_id', contestId).eq('user_id', userId),
    ]);
    setEntry(entryRes.data || null);
    setPicks(picksRes.data || []);
    setLoading(false);
  }, [contestId, userId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { entry, picks, loading, refresh };
}

/**
 * Submits or updates a user's contest entry. Idempotent — call with the
 * same contest_id+user_id and it'll upsert.
 *
 * @param {object} input - { contestId, userId, mnfTotalPrediction, mnfQbYdsPrediction, picks: [{ game_id, league, home_abbr, away_abbr, kickoff_at, side, spread_taken }] }
 */
export async function submitContestEntry(input) {
  const { contestId, userId, mnfTotalPrediction, mnfQbYdsPrediction, picks } = input;

  // Frontend enforces the 20-pick rule, so by the time we get here we trust
  // the entry is qualified if both tiebreakers are present and there's at
  // least one pick.
  const qualified = picks.length > 0 && mnfTotalPrediction != null && mnfQbYdsPrediction != null;

  // Upsert the entry first so we have an entry_id
  const { data: entry, error: entryErr } = await supabase
    .from('contest_entries')
    .upsert(
      {
        contest_id: contestId,
        user_id: userId,
        mnf_total_prediction: mnfTotalPrediction,
        mnf_qb_yds_prediction: mnfQbYdsPrediction,
        picks_count: picks.length,
        qualified,
      },
      { onConflict: 'contest_id,user_id' }
    )
    .select()
    .single();
  if (entryErr) throw entryErr;

  // Wipe existing picks for this entry, then re-insert (simplest reconciliation)
  const { error: delErr } = await supabase
    .from('contest_picks')
    .delete()
    .eq('entry_id', entry.id);
  if (delErr) throw delErr;

  if (picks.length > 0) {
    const rows = picks.map((p) => ({
      entry_id:     entry.id,
      contest_id:   contestId,
      user_id:      userId,
      game_id:      p.game_id,
      league:       p.league,
      home_abbr:    p.home_abbr,
      away_abbr:    p.away_abbr,
      kickoff_at:   p.kickoff_at,
      side:         p.side,
      spread_taken: p.spread_taken,
    }));
    const { error: insErr } = await supabase.from('contest_picks').insert(rows);
    if (insErr) throw insErr;
  }

  return entry;
}

/**
 * Aggregated weekly leaderboard for a contest. Returns rows sorted by:
 *   wins desc, losses asc, mnf_total_diff asc, mnf_qb_yds_diff asc.
 */
export function useContestLeaderboard(contest) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!contest?.id) { setRows([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('contest_entries')
      .select('id, user_id, wins, losses, pushes, picks_count, qualified, mnf_total_prediction, mnf_qb_yds_prediction')
      .eq('contest_id', contest.id);
    if (error) { setRows([]); setLoading(false); return; }

    const mnfTotalActual = contest.mnf_total_actual;
    const mnfQbYdsActual = contest.mnf_qb_yds_actual;

    const enriched = (data || []).map((r) => ({
      ...r,
      mnf_total_diff: mnfTotalActual != null && r.mnf_total_prediction != null ? Math.abs(mnfTotalActual - r.mnf_total_prediction) : null,
      mnf_qb_yds_diff: mnfQbYdsActual != null && r.mnf_qb_yds_prediction != null ? Math.abs(mnfQbYdsActual - r.mnf_qb_yds_prediction) : null,
    }));

    enriched.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (a.mnf_total_diff != null && b.mnf_total_diff != null) {
        if (a.mnf_total_diff !== b.mnf_total_diff) return a.mnf_total_diff - b.mnf_total_diff;
      }
      if (a.mnf_qb_yds_diff != null && b.mnf_qb_yds_diff != null) {
        if (a.mnf_qb_yds_diff !== b.mnf_qb_yds_diff) return a.mnf_qb_yds_diff - b.mnf_qb_yds_diff;
      }
      return 0;
    });

    setRows(enriched);
    setLoading(false);
  }, [contest]);

  useEffect(() => { refresh(); }, [refresh]);

  return { rows, loading, refresh };
}

// ====================================================================
// PHASE 2: Auto-grading + auto-winner determination
// ====================================================================

/**
 * Grades all pending contest picks for a contest. For each pick where
 * the ESPN game has finished, fetches the final score and computes the
 * ATS result. Updates the row in supabase. Skips games still in
 * progress / not yet started.
 *
 * Returns { graded } — count of newly-graded picks.
 */
export async function gradeContestPicks(contestId) {
  if (!contestId) return { graded: 0 };
  const { data: pending, error } = await supabase
    .from('contest_picks')
    .select('*')
    .eq('contest_id', contestId)
    .eq('result', 'pending');
  if (error || !pending?.length) return { graded: 0 };

  let graded = 0;
  for (const p of pending) {
    try {
      const game = await fetchGameById(p.league, p.game_id);
      if (!game || !game.completed) continue;

      const finalHome = game.home?.score;
      const finalAway = game.away?.score;
      if (finalHome == null || finalAway == null) continue;

      // ATS math: spread_taken is from the picker's perspective on the
      // side they took. They cover when (their score + spread) > opp score.
      const tookHome = p.side === p.home_abbr;
      const myScore  = tookHome ? Number(finalHome) : Number(finalAway);
      const oppScore = tookHome ? Number(finalAway) : Number(finalHome);
      const cover = (myScore + Number(p.spread_taken)) - oppScore;
      const result = cover > 0 ? 'win' : cover < 0 ? 'loss' : 'push';

      await supabase
        .from('contest_picks')
        .update({
          result,
          graded_at: new Date().toISOString(),
          final_home: Math.round(Number(finalHome)),
          final_away: Math.round(Number(finalAway)),
        })
        .eq('id', p.id);
      graded++;
    } catch (_) {
      // skip failed grades; we'll retry next page load
    }
  }
  return { graded };
}

/**
 * After grading, recompute wins/losses/pushes per entry from the picks
 * table and write them back onto contest_entries so the leaderboard
 * has fresh totals without re-aggregating on every render.
 */
export async function rollupEntryStats(contestId) {
  if (!contestId) return;
  const { data: picks } = await supabase
    .from('contest_picks')
    .select('entry_id, result')
    .eq('contest_id', contestId);
  if (!picks) return;

  const stats = new Map();
  for (const p of picks) {
    const s = stats.get(p.entry_id) || { wins: 0, losses: 0, pushes: 0 };
    if (p.result === 'win')   s.wins++;
    else if (p.result === 'loss')  s.losses++;
    else if (p.result === 'push')  s.pushes++;
    stats.set(p.entry_id, s);
  }
  for (const [entryId, s] of stats) {
    await supabase.from('contest_entries').update(s).eq('id', entryId);
  }
}

/**
 * Determines the winning entry IF (a) MNF actuals are saved AND
 * (b) all picks are graded. Sets contest.winner_user_id and
 * status='graded'. The actual prize grant ('paid' status + sub
 * extension) stays a manual click in /admin so a system bug never
 * auto-extends someone's subscription.
 */
export async function determineWinner(contestId) {
  if (!contestId) return null;

  const { data: contest } = await supabase
    .from('contests').select('*').eq('id', contestId).maybeSingle();
  if (!contest) return null;
  if (contest.status === 'graded' || contest.status === 'paid') return null;
  if (contest.mnf_total_actual == null || contest.mnf_qb_yds_actual == null) return null;

  // Bail out if any picks still pending
  const { count: pendingCount } = await supabase
    .from('contest_picks')
    .select('id', { count: 'exact', head: true })
    .eq('contest_id', contestId)
    .eq('result', 'pending');
  if (pendingCount && pendingCount > 0) return null;

  const { data: entries } = await supabase
    .from('contest_entries')
    .select('*')
    .eq('contest_id', contestId)
    .eq('qualified', true);
  if (!entries?.length) return null;

  const enriched = entries.map((e) => ({
    ...e,
    mnf_total_diff: Math.abs(contest.mnf_total_actual - (e.mnf_total_prediction ?? 1e9)),
    mnf_qb_yds_diff: Math.abs(contest.mnf_qb_yds_actual - (e.mnf_qb_yds_prediction ?? 1e9)),
  }));
  enriched.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (a.mnf_total_diff !== b.mnf_total_diff) return a.mnf_total_diff - b.mnf_total_diff;
    return a.mnf_qb_yds_diff - b.mnf_qb_yds_diff;
  });

  const winner = enriched[0];
  await supabase
    .from('contests')
    .update({ winner_user_id: winner.user_id, status: 'graded' })
    .eq('id', contestId);

  return winner;
}

/**
 * Lazy auto-grader: runs once when a route mounts that cares about
 * grading freshness (/leaderboard, /admin, /contest after lock).
 * Cheap-no-op when there's nothing to grade.
 */
export function useContestGrader(contestId) {
  useEffect(() => {
    if (!contestId) return;
    let cancelled = false;
    (async () => {
      const { graded } = await gradeContestPicks(contestId);
      if (cancelled) return;
      if (graded > 0) await rollupEntryStats(contestId);
      if (!cancelled) await determineWinner(contestId);
    })();
    return () => { cancelled = true; };
  }, [contestId]);
}

// ====================================================================

/**
 * Fetches all past graded contests for the "wall of winners" / leaderboard
 * archive section.
 */
export function useContestArchive() {
  const [contests, setContests] = useState([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('contests')
        .select('id, season, week, winner_user_id, status, end_at')
        .in('status', ['graded', 'paid'])
        .order('season', { ascending: false })
        .order('week', { ascending: false })
        .limit(20);
      setContests(data || []);
    })();
  }, []);
  return contests;
}
