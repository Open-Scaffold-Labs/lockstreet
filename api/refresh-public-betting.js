/**
 * Refresh public betting splits with primary/fallback source design.
 *
 *   Primary:  ScoresAndOdds (low detection risk, ran for months unblocked)
 *             → api/_scrape-sao.js : fetchLeagueRowsSao()
 *   Fallback: Action Network (used only when primary fails — higher
 *             detection risk so we minimize requests to it)
 *             → api/_scrape-action-network.js : fetchLeagueRowsActionNetwork()
 *
 * Per league: try SAO first. If it throws OR returns 0 rows, try Action
 * Network. Either way, log which source was used so we can monitor source
 * health over time. If both fail, the league is skipped (errors recorded
 * in summary).
 *
 * This was designed after the May 3 2026 incident where SAO migrated
 * betting splits to client-rendered JS, breaking the original scraper.
 * Without a fallback, /lines went dark for ~24 hours. With fallback in
 * place, the system would have auto-switched to AN within one cron tick.
 *
 * Multiplexed handler (?job=) — keeps us under Vercel Hobby's 12-fn cap:
 *   public-betting (default) → scrape splits (this file)
 *   consensus               → VSiN consensus job (_job-vsin-consensus.js)
 *   grade-user-picks        → grade pending picks (_job-grade-picks.js)
 *
 * Auth: x-cron-secret header must match CRON_SECRET env var.
 *
 * Manual:  curl -X POST -H "x-cron-secret: <SECRET>" \
 *   https://lockstreet.vercel.app/api/refresh-public-betting?force=1
 */

import { adminClient, serverError } from './_utils.js';
import { runConsensusJob } from './_job-vsin-consensus.js';
import { runGradeUserPicksJob } from './_job-grade-picks.js';
import { fetchLeagueRowsSao } from './_scrape-sao.js';
import { fetchLeagueRowsActionNetwork } from './_scrape-action-network.js';

const LEAGUES = ['nba', 'nhl', 'mlb', 'nfl', 'cfb'];

export default async function handler(req, res) {
  const sentSecret = req.headers['x-cron-secret']
    || (req.headers.authorization || '').replace(/^Bearer\s+/, '')
    || req.query?.secret;
  if (!sentSecret || sentSecret !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const job = req.query?.job || 'public-betting';
  if (job === 'consensus')         return runConsensusJob(req, res);
  if (job === 'grade-user-picks')  return runGradeUserPicksJob(req, res);

  const force = req.query?.force === '1';
  const level = force ? 'forced' : getScrapeLevel(new Date());
  if (level === 'skip') {
    return res.status(200).json({ skipped: true, reason: 'off-window' });
  }

  const supa = adminClient();
  if (!supa) return serverError(res, new Error('SUPABASE_SERVICE_ROLE_KEY missing'));

  const summary = { level, runs: [], totalUpserts: 0, errors: [] };
  for (const league of LEAGUES) {
    const result = await scrapeLeagueWithFallback(league);
    summary.runs.push({ league, source: result.source, games: result.rows.length, fellBack: result.fellBack });
    if (result.errors.length) summary.errors.push(...result.errors);

    for (const row of result.rows) {
      if (!row.away_label || !row.home_label) {
        summary.errors.push({ league, id: row.external_id, error: 'missing team labels' });
        continue;
      }
      const { error } = await supa.from('public_betting').upsert(row, { onConflict: 'source,external_id' });
      if (error) summary.errors.push({ league, id: row.external_id, error: error.message });
      else summary.totalUpserts++;
    }
  }

  res.status(200).json(summary);
}

/**
 * Try primary (SAO) first. Fall back to Action Network if primary throws
 * OR returns 0 rows (SAO returns 0 when their structure changes silently).
 * Returns the rows + which source produced them + any errors encountered.
 */
async function scrapeLeagueWithFallback(league) {
  const errors = [];
  // Primary: SAO
  try {
    const rows = await fetchLeagueRowsSao(league);
    if (rows.length > 0) {
      return { source: 'sao', rows, errors, fellBack: false };
    }
    errors.push({ league, source: 'sao', error: 'returned 0 rows' });
  } catch (e) {
    errors.push({ league, source: 'sao', error: String(e?.message || e) });
  }
  // Fallback: Action Network
  try {
    const rows = await fetchLeagueRowsActionNetwork(league);
    return { source: 'actionnetwork', rows, errors, fellBack: true };
  } catch (e) {
    errors.push({ league, source: 'actionnetwork', error: String(e?.message || e) });
    return { source: 'none', rows: [], errors, fellBack: true };
  }
}

function getScrapeLevel(now) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const minute = Number(parts.minute);

  const footballPeak =
    (dow === 0 && [12, 15, 19, 20].includes(hour)) ||
    (dow === 6 && [11, 15, 19].includes(hour)) ||
    ((dow === 4 || dow === 1) && [19, 20].includes(hour));
  if (footballPeak) return 'peak';
  if (hour >= 18 && hour <= 22) return 'peak';
  if (hour >= 9 && hour <= 23 && (hour % 2 === 0) && minute < 5) return 'normal';
  if ((hour === 12 || hour === 18) && minute < 5) return 'normal';
  return 'skip';
}
