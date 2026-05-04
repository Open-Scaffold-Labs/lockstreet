/**
 * User-pick grader — folded out of api/refresh-public-betting.js.
 * Pulls every pending pick whose kickoff is more than 4 hours ago,
 * looks up ESPN final score, computes win/loss/push, writes back via
 * service-role. Refreshes the leaderboard view at the end.
 * Multiplexed in main router behind ?job=grade-user-picks.
 */

import { adminClient, serverError } from './_utils.js';

const ESPN_SPORT_PATH = {
  nfl: 'football/nfl',
  cfb: 'football/college-football',
  cbb: 'basketball/mens-college-basketball',
  nba: 'basketball/nba',
  mlb: 'baseball/mlb',
  nhl: 'hockey/nhl',
};

function scoreNum(s) {
  if (s == null) return null;
  if (typeof s === 'object') return Number(s.value ?? s.displayValue);
  return Number(s);
}

async function fetchEspnFinal(league, gameId) {
  const path = ESPN_SPORT_PATH[league];
  if (!path) return null;
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${encodeURIComponent(gameId)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`ESPN ${league}/${gameId} ${r.status}`);
  const j = await r.json();
  const comps = j?.header?.competitions?.[0]?.competitors || [];
  const home = comps.find((c) => c.homeAway === 'home');
  const away = comps.find((c) => c.homeAway === 'away');
  const status = j?.header?.competitions?.[0]?.status?.type || j?.header?.status?.type;
  const final = !!status?.completed;
  return { final, homeScore: scoreNum(home?.score), awayScore: scoreNum(away?.score) };
}

function decideResult(pick, game) {
  const h = Number(game.homeScore);
  const a = Number(game.awayScore);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;

  if (pick.bet_type === 'ml') {
    if (h === a) return 'push';
    const homeWon = h > a;
    if (pick.side === 'home') return homeWon ? 'win'  : 'loss';
    if (pick.side === 'away') return homeWon ? 'loss' : 'win';
    return null;
  }
  if (pick.bet_type === 'spread' && pick.line_at_pick != null) {
    const line = Number(pick.line_at_pick);
    let margin;
    if (pick.side === 'home') margin = (h + line) - a;
    else if (pick.side === 'away') margin = (a + line) - h;
    else return null;
    if (margin === 0) return 'push';
    return margin > 0 ? 'win' : 'loss';
  }
  if (pick.bet_type === 'total' && pick.line_at_pick != null) {
    const total = h + a;
    const line = Number(pick.line_at_pick);
    if (total === line) return 'push';
    const went = total > line ? 'over' : 'under';
    return pick.side === went ? 'win' : 'loss';
  }
  return null;
}

export async function runGradeUserPicksJob(req, res) {
  const supa = adminClient();
  if (!supa) return serverError(res, new Error('SUPABASE_SERVICE_ROLE_KEY missing'));

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: pending, error: pErr } = await supa
    .from('user_picks')
    .select('id, league, game_id, bet_type, side, line_at_pick, units')
    .eq('result', 'pending')
    .lt('kickoff_at', fourHoursAgo)
    .limit(500);
  if (pErr) return serverError(res, pErr);

  const byGame = new Map();
  for (const p of pending || []) {
    const k = `${p.league}::${p.game_id}`;
    if (!byGame.has(k)) byGame.set(k, []);
    byGame.get(k).push(p);
  }

  const summary = {
    pending: pending?.length || 0, games: byGame.size,
    graded: 0, skipped: 0, errors: [],
  };

  const cache = new Map();
  for (const [key, picks] of byGame) {
    const [league, gameId] = key.split('::');
    let game;
    try {
      game = cache.has(key) ? cache.get(key) : await fetchEspnFinal(league, gameId);
      cache.set(key, game);
    } catch (e) {
      summary.errors.push({ league, gameId, error: String(e.message || e) });
      summary.skipped += picks.length;
      continue;
    }
    if (!game || !game.final) { summary.skipped += picks.length; continue; }
    for (const p of picks) {
      const result = decideResult(p, game);
      if (!result) { summary.skipped += 1; continue; }
      const { error } = await supa
        .from('user_picks')
        .update({ result, graded_at: new Date().toISOString() })
        .eq('id', p.id);
      if (error) summary.errors.push({ pickId: p.id, error: error.message });
      else summary.graded += 1;
    }
  }

  try {
    await supa.rpc('refresh_leaderboard_window').catch(() => {
      summary.errors.push({ stage: 'refresh_view', note: 'no RPC; relying on next pass' });
    });
  } catch (e) {
    summary.errors.push({ stage: 'refresh_view', error: String(e.message || e) });
  }

  return res.status(200).json(summary);
}
