/**
 * Team intel proxy — multiplexed handler dispatching on ?op=
 *   intel (default)  → per-team off/def rank, last-10, source
 *   public-betting   → recent rows from public_betting (powers /lines)
 *   heat-check       → teams covering >=70% over last 10 (powers /props)
 *   news             → ESPN RSS + optional NewsData fallback (game detail)
 *   schedule         → ESPN team schedule across regular + postseason
 *
 * Vercel Hobby caps functions at 12. Bulky handlers (NBA-via-ESPN bulk
 * fetch, news, schedule) live in api/_intel-*.js helpers — underscore
 * prefix means Vercel doesn't deploy them as separate functions.
 *
 * Cache: 6 hours in-memory for intel payloads. Stats don't move much
 * intraday and we serve identical payloads to every viewer.
 */

import { adminClient, serverError } from './_utils.js';
import { fetchNbaViaEspn } from './_intel-nba-espn.js';
import { handleSchedule } from './_intel-schedule.js';
import { handleNews } from './_intel-news.js';

const CACHE = new Map();
const CACHE_MS = 6 * 60 * 60 * 1000;
const HEAT_CACHE = { at: 0, payload: null };
const HEAT_CACHE_MS = 24 * 60 * 60 * 1000;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function fromCache(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) { CACHE.delete(key); return null; }
  return hit.payload;
}
function toCache(key, payload) { CACHE.set(key, { at: Date.now(), payload }); }
function empty() {
  return { offRank: null, defRank: null, offValue: null, defValue: null,
           offLabel: '', defLabel: '', last10: null, source: 'none' };
}

export default async function handler(req, res) {
  const op = req.query?.op || 'intel';
  if (op === 'news')           return handleNews(req, res);
  if (op === 'schedule')       return handleSchedule(req, res);
  if (op === 'public-betting') return handlePublicBetting(req, res);
  if (op === 'heat-check')     return handleHeatCheck(req, res);

  const { league, teamId, teamAbbr } = req.query || {};
  if (!league) return res.status(400).json({ error: 'league required' });

  const cacheKey = `${league}:${teamId || ''}:${teamAbbr || ''}`;
  const cached = fromCache(cacheKey);
  if (cached) return res.status(200).json(cached);

  let payload = null;
  try {
    if (league === 'mlb')      payload = await fetchMlb(teamAbbr);
    else if (league === 'nhl') payload = await fetchNhl(teamAbbr);
    else if (league === 'nba') payload = await fetchNbaViaEspn(teamId, fetchEspn);
    else                       payload = await fetchEspn(league, teamId);
  } catch (e) {
    payload = { error: String(e?.message || e), offRank: null, defRank: null, last10: null, source: 'error' };
  }

  // Enrich with Last 10 ATS/SU from public_betting if we have a teamAbbr.
  if (payload && !payload.error && teamAbbr) {
    try {
      const supa = adminClient();
      if (supa) {
        const abbrUC = String(teamAbbr).toUpperCase();
        const { data } = await supa.from('public_betting')
          .select('away_label, home_label, away_last_10_ats_pct, home_last_10_ats_pct, away_last_10_su_pct, home_last_10_su_pct, fetched_at')
          .eq('league', league)
          .or(`away_label.eq.${abbrUC},home_label.eq.${abbrUC}`)
          .order('fetched_at', { ascending: false })
          .limit(1);
        const row = (data && data[0]) || null;
        if (row) {
          const isHome = String(row.home_label).toUpperCase() === abbrUC;
          const atsPct = isHome ? row.home_last_10_ats_pct : row.away_last_10_ats_pct;
          const suPct  = isHome ? row.home_last_10_su_pct  : row.away_last_10_su_pct;
          if (atsPct != null) payload.last10AtsPct = Number(atsPct);
          if (suPct  != null) payload.last10SuPct  = Number(suPct);
        }
      }
    } catch { /* soft fail */ }
  }

  if (payload && !payload.error) toCache(cacheKey, payload);
  res.status(200).json(payload || empty());
}

// ====================================================================
// MLB — statsapi.mlb.com (official, free)
// ====================================================================
const MLB_TEAM_IDS = {
  ARI:109, ATL:144, BAL:110, BOS:111, CHC:112, CWS:145, CIN:113, CLE:114,
  COL:115, DET:116, HOU:117, KC:118, LAA:108, LAD:119, MIA:146, MIL:158,
  MIN:142, NYM:121, NYY:147, OAK:133, PHI:143, PIT:134, SD:135, SF:137,
  SEA:136, STL:138, TB:139, TEX:140, TOR:141, WSH:120, WAS:120, ATH:133,
};

async function fetchMlb(abbr) {
  const tid = MLB_TEAM_IDS[(abbr || '').toUpperCase()];
  if (!tid) return empty();
  const yr = new Date().getFullYear();

  const stRes = await fetch(`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${yr}&standingsType=regularSeason`, { headers: BROWSER_HEADERS });
  if (!stRes.ok) throw new Error(`mlb standings ${stRes.status}`);
  const stJson = await stRes.json();
  let myEntry = null;
  for (const rec of stJson?.records || []) {
    for (const tr of rec.teamRecords || []) if (tr.team?.id === tid) myEntry = tr;
  }
  let last10 = null;
  if (myEntry) {
    const splits = myEntry.records?.splitRecords || [];
    const l10 = splits.find((s) => s.type === 'lastTen');
    if (l10) last10 = { wins: l10.wins, losses: l10.losses, pushes: 0 };
  }

  let offRank = null, defRank = null, offValue = null, defValue = null;
  const sRes = await fetch(`https://statsapi.mlb.com/api/v1/teams/${tid}/stats?stats=season&group=hitting,pitching&season=${yr}`, { headers: BROWSER_HEADERS });
  if (sRes.ok) {
    const sJson = await sRes.json();
    const hit = (sJson.stats || []).find((s) => s.group?.displayName === 'hitting');
    const pit = (sJson.stats || []).find((s) => s.group?.displayName === 'pitching');
    const hitStat = hit?.splits?.[0]?.stat;
    const pitStat = pit?.splits?.[0]?.stat;
    if (hitStat) {
      const games = Number(hitStat.gamesPlayed) || 1;
      const runs = Number(hitStat.runs) || 0;
      offValue = (runs / games).toFixed(2);
    }
    if (pitStat) defValue = String(pitStat.era ?? '').replace(/^\./, '0.');
  }
  try {
    const allHit = await fetch(`https://statsapi.mlb.com/api/v1/teams/stats?stats=season&group=hitting&season=${yr}&sportIds=1`, { headers: BROWSER_HEADERS });
    if (allHit.ok) {
      const j = await allHit.json();
      const splits = j?.stats?.[0]?.splits || [];
      const ranked = splits.map((s) => ({
        id: s.team?.id,
        rpg: (Number(s.stat?.runs) || 0) / Math.max(Number(s.stat?.gamesPlayed) || 1, 1),
      })).sort((a, b) => b.rpg - a.rpg);
      const i = ranked.findIndex((r) => r.id === tid);
      if (i >= 0) offRank = i + 1;
    }
    const allPit = await fetch(`https://statsapi.mlb.com/api/v1/teams/stats?stats=season&group=pitching&season=${yr}&sportIds=1`, { headers: BROWSER_HEADERS });
    if (allPit.ok) {
      const j = await allPit.json();
      const splits = j?.stats?.[0]?.splits || [];
      const ranked = splits.map((s) => ({
        id: s.team?.id, era: Number(s.stat?.era) || 99,
      })).sort((a, b) => a.era - b.era);
      const i = ranked.findIndex((r) => r.id === tid);
      if (i >= 0) defRank = i + 1;
    }
  } catch {}

  return {
    offRank, offValue, offLabel: 'R/G',
    defRank, defValue, defLabel: 'ERA',
    last10, source: 'MLB Stats',
  };
}

// ====================================================================
// NHL — api-web.nhle.com (official, free)
// ====================================================================
async function fetchNhl(abbr) {
  const code = (abbr || '').toUpperCase();
  if (!code) return empty();
  const stRes = await fetch('https://api-web.nhle.com/v1/standings/now', { headers: BROWSER_HEADERS });
  if (!stRes.ok) throw new Error(`nhl standings ${stRes.status}`);
  const stJson = await stRes.json();
  const teams = stJson?.standings || [];
  const me = teams.find((t) => (t.teamAbbrev?.default || '').toUpperCase() === code);
  let last10 = null, offValue = null, defValue = null;
  if (me) {
    last10 = { wins: me.l10Wins || 0, losses: me.l10Losses || 0, pushes: me.l10OtLosses || 0 };
    offValue = (me.goalFor / Math.max(me.gamesPlayed, 1)).toFixed(2);
    defValue = (me.goalAgainst / Math.max(me.gamesPlayed, 1)).toFixed(2);
  }
  const offRanked = teams.slice().sort((a, b) => (b.goalFor / Math.max(b.gamesPlayed, 1)) - (a.goalFor / Math.max(a.gamesPlayed, 1)));
  const defRanked = teams.slice().sort((a, b) => (a.goalAgainst / Math.max(a.gamesPlayed, 1)) - (b.goalAgainst / Math.max(b.gamesPlayed, 1)));
  const offRank = me ? offRanked.findIndex((t) => t === me) + 1 : null;
  const defRank = me ? defRanked.findIndex((t) => t === me) + 1 : null;
  return {
    offRank: offRank || null, offValue, offLabel: 'GF/G',
    defRank: defRank || null, defValue, defLabel: 'GA/G',
    last10, source: 'NHL API',
  };
}

// ====================================================================
// ESPN fallback — NFL, CFB (and NBA when bulk fetch fails)
// ====================================================================
const ESPN_SPORT_PATH = {
  nfl: 'football/nfl', cfb: 'football/college-football',
  nba: 'basketball/nba', mlb: 'baseball/mlb', nhl: 'hockey/nhl',
};

async function fetchEspn(league, teamId) {
  if (!teamId) return empty();
  const sportPath = ESPN_SPORT_PATH[league] || 'football/nfl';
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${teamId}/statistics`, { headers: BROWSER_HEADERS });
  if (!r.ok) throw new Error(`espn team-stats ${r.status}`);
  const j = await r.json();
  const cats = j?.results?.stats?.categories || [];
  const flat = [];
  for (const cat of cats) {
    for (const s of cat.stats || []) flat.push({ ...s, _cat: cat.name || '' });
  }
  const find = (names) => {
    for (const n of names) {
      const s = flat.find((s) => (s.name || '').toLowerCase() === n.toLowerCase()
                              || (s.abbreviation || '').toLowerCase() === n.toLowerCase());
      if (s) return s;
    }
    return null;
  };
  const off = find(['avgPoints', 'avgPointsFor', 'pointsPerGame', 'totalPointsPerGame', 'pointsScored', 'avgRuns', 'runsPerGame', 'avgGoals', 'goalsPerGame']);
  const def = find(['avgPointsAgainst', 'pointsAllowed', 'pointsAgainst', 'avgRunsAgainst', 'avgGoalsAgainst', 'goalsAllowedPerGame', 'opponentPointsPerGame']);
  const normRank = (s) => {
    if (!s) return null;
    const n = Number(String(s.rank || '').replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  let last10 = null;
  try {
    const sr = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${teamId}/schedule`, { headers: BROWSER_HEADERS });
    if (sr.ok) {
      const sj = await sr.json();
      const events = (sj.events || []).filter((e) => e?.competitions?.[0]?.status?.type?.completed);
      const recent = events.slice(-10);
      let w = 0, l = 0, p = 0;
      for (const ev of recent) {
        const c = ev.competitions?.[0];
        const me = (c.competitors || []).find((x) => String(x.team?.id) === String(teamId));
        if (!me) continue;
        if (me.winner === true) w++; else if (me.winner === false) l++; else p++;
      }
      last10 = { wins: w, losses: l, pushes: p };
    }
  } catch {}

  return {
    offRank: normRank(off), offValue: off?.displayValue ?? off?.value ?? null,
    offLabel: off?.shortDisplayName || off?.abbreviation || '',
    defRank: normRank(def), defValue: def?.displayValue ?? def?.value ?? null,
    defLabel: def?.shortDisplayName || def?.abbreviation || '',
    last10, source: 'ESPN',
  };
}

// ====================================================================
// Public-betting read
// ====================================================================
async function handlePublicBetting(req, res) {
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

// ====================================================================
// Heat check — teams covering >= 70% over last 10
// ====================================================================
async function handleHeatCheck(req, res) {
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
