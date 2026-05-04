/**
 * Team intel proxy — slim dispatcher. All real logic lives in
 * api/_intel-*.js helpers (underscore prefix → Vercel doesn't treat
 * them as separate functions, just bundles them as imports).
 *
 * This file is kept deliberately tiny because Vercel silently drops
 * functions whose source exceeds an undocumented threshold; we hit
 * that on May 3 with the previous 807-line monolith.
 *
 * Ops dispatched on ?op=:
 *   intel (default)  → per-team off/def rank, last 10
 *   public-betting   → recent rows from public_betting (powers /lines)
 *   heat-check       → teams covering >= 70% (powers /props)
 *   news             → ESPN RSS + NewsData fallback
 *   schedule         → ESPN team schedule
 */

import { adminClient } from './_utils.js';
import { fetchNbaViaEspn } from './_intel-nba-espn.js';
import { handleSchedule } from './_intel-schedule.js';
import { handleNews } from './_intel-news.js';
import { fetchMlb } from './_intel-mlb.js';
import { fetchNhl, fetchEspn } from './_intel-nhl-espn.js';
import { handleHeatCheck, handlePublicBetting } from './_intel-heat-check.js';

const CACHE = new Map();
const CACHE_MS = 6 * 60 * 60 * 1000;

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

  // Enrich with Last 10 ATS/SU from public_betting if teamAbbr provided.
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
