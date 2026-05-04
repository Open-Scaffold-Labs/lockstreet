/**
 * Heat check + public-betting-read handlers — folded out of api/team-intel.js.
 * Both read from public_betting; both are small but bundled together to
 * keep main team-intel.js below Vercel's silent per-function threshold.
 */

import { adminClient, serverError } from './_utils.js';

const HEAT_CACHE = { at: 0, payload: null };
const HEAT_CACHE_MS = 24 * 60 * 60 * 1000;

export async function handleHeatCheck(req, res) {
  if (HEAT_CACHE.payload && Date.now() - HEAT_CACHE.at < HEAT_CACHE_MS) {
    return res.status(200).json(HEAT_CACHE.payload);
  }
  const supa = adminClient();
  if (!supa) return res.status(503).json({ teams: [], reason: 'service-role missing' });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supa.from('public_betting')
    .select('league, away_label, home_label, away_last_10_ats_pct, home_last_10_ats_pct, fetched_at')
    .gte('fetched_at', since)
    .order('fetched_at', { ascending: false });
  if (error) return serverError(res, error);

  const toPct = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n <= 1 ? n * 100 : n;
  };
  const teamMap = new Map();
  for (const r of (data || [])) {
    if (r.away_label && r.away_last_10_ats_pct != null) {
      const key = `${r.league}:${String(r.away_label).toUpperCase()}`;
      const pct = toPct(r.away_last_10_ats_pct);
      if (!teamMap.has(key) && pct != null) {
        teamMap.set(key, { league: r.league, abbr: String(r.away_label).toUpperCase(),
          atsPct: pct, fetchedAt: r.fetched_at });
      }
    }
    if (r.home_label && r.home_last_10_ats_pct != null) {
      const key = `${r.league}:${String(r.home_label).toUpperCase()}`;
      const pct = toPct(r.home_last_10_ats_pct);
      if (!teamMap.has(key) && pct != null) {
        teamMap.set(key, { league: r.league, abbr: String(r.home_label).toUpperCase(),
          atsPct: pct, fetchedAt: r.fetched_at });
      }
    }
  }

  const teams = Array.from(teamMap.values())
    .filter((t) => Number.isFinite(t.atsPct) && t.atsPct >= 70)
    .map((t) => ({
      ...t,
      record: `${Math.round(t.atsPct / 10)}-${10 - Math.round(t.atsPct / 10)}`,
    }))
    .sort((a, b) => b.atsPct - a.atsPct);

  const payload = { teams, generatedAt: new Date().toISOString() };
  HEAT_CACHE.at = Date.now();
  HEAT_CACHE.payload = payload;
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=43200');
  res.status(200).json(payload);
}

export async function handlePublicBetting(req, res) {
  const supa = adminClient();
  if (!supa) return serverError(res, new Error('SUPABASE_SERVICE_ROLE_KEY missing'));

  const league = (req.query?.league || '').toLowerCase();
  const hours  = Math.max(1, Math.min(72, Number(req.query?.hours || 24)));
  const since  = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  let q = supa.from('public_betting')
    .select('league, slug, away_label, home_label, spread_home_line, spread_home_pct_bets, spread_home_pct_money, ml_home_pct_bets, ml_home_pct_money, total_line, total_over_pct_bets, total_over_pct_money, away_last_10_ats_pct, home_last_10_ats_pct, away_last_10_su_pct, home_last_10_su_pct, fetched_at')
    .gte('fetched_at', since)
    .order('fetched_at', { ascending: false });
  if (league) q = q.eq('league', league);

  const { data, error } = await q;
  if (error) return serverError(res, error);

  const rows = (data || []).map((r) => ({
    league: r.league, slug: r.slug,
    awayLabel: r.away_label, homeLabel: r.home_label,
    spreadHomeLine: r.spread_home_line,
    spreadHomePctBets: r.spread_home_pct_bets,
    spreadHomePctMoney: r.spread_home_pct_money,
    mlHomePctBets: r.ml_home_pct_bets,
    mlHomePctMoney: r.ml_home_pct_money,
    totalLine: r.total_line,
    totalOverPctBets: r.total_over_pct_bets,
    totalOverPctMoney: r.total_over_pct_money,
    awayLast10AtsPct: r.away_last_10_ats_pct,
    homeLast10AtsPct: r.home_last_10_ats_pct,
    awayLast10SuPct: r.away_last_10_su_pct,
    homeLast10SuPct: r.home_last_10_su_pct,
    fetchedAt: r.fetched_at,
  }));

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ rows });
}
