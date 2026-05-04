/**
 * Refresh public betting splits from Action Network. Triggered every
 * 10 min by GitHub Actions cron; getScrapeLevel() decides whether to
 * actually run based on day-of-week + time-of-day in ET.
 *
 * Multiplexed handler — keeps us under Vercel Hobby's 12-fn cap:
 *   ?job=public-betting (default) → Action Network scrape
 *   ?job=consensus               → VSiN consensus job
 *   ?job=grade-user-picks        → grade pending user picks
 *
 * Bulky job logic lives in api/_job-*.js helpers (underscore prefix
 * so Vercel doesn't deploy them as separate functions).
 *
 * Auth: x-cron-secret header must match CRON_SECRET env var.
 *
 * Manual:  curl -X POST -H "x-cron-secret: <SECRET>" \
 *   https://lockstreet.vercel.app/api/refresh-public-betting?force=1
 */

import { adminClient, serverError } from './_utils.js';
import { runConsensusJob } from './_job-vsin-consensus.js';
import { runGradeUserPicksJob } from './_job-grade-picks.js';

const AN_BASE = 'https://www.actionnetwork.com';
const AN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const AN_LEAGUE_PATH = {
  nba: 'nba', nhl: 'nhl', mlb: 'mlb', nfl: 'nfl', cfb: 'college-football',
};
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
    try {
      const rows = await fetchLeagueRows(league);
      summary.runs.push({ league, games: rows.length });
      for (const row of rows) {
        if (!row.away_label || !row.home_label) {
          summary.errors.push({ league, id: row.external_id, error: 'missing team labels' });
          continue;
        }
        const { error } = await supa.from('public_betting').upsert(row, { onConflict: 'source,external_id' });
        if (error) summary.errors.push({ league, id: row.external_id, error: error.message });
        else summary.totalUpserts++;
      }
    } catch (e) {
      summary.errors.push({ league, error: String(e?.message || e) });
    }
  }

  res.status(200).json(summary);
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

async function fetchLeagueRows(league) {
  const path = AN_LEAGUE_PATH[league];
  if (!path) return [];

  const url = `${AN_BASE}/${path}/odds`;
  const r = await fetch(url, { headers: AN_HEADERS });
  if (!r.ok) throw new Error(`AN ${league} ${r.status}`);
  const html = await r.text();

  const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.+?)<\/script>/s);
  if (!ndMatch) throw new Error(`No __NEXT_DATA__ on ${url}`);
  const nd = JSON.parse(ndMatch[1]);
  const games = nd?.props?.pageProps?.scoreboardResponse?.games || [];

  const now = new Date().toISOString();
  return games.map((game) => {
    const teamById = {};
    for (const t of (game.teams || [])) teamById[t.id] = t;
    const away = teamById[game.away_team_id] || {};
    const home = teamById[game.home_team_id] || {};

    const markets = game.markets || {};
    const bookIds = ['15', ...Object.keys(markets).filter(b => b !== '15')];

    let spreadRow = null, mlRow = null, totalRow = null;
    for (const bookId of bookIds) {
      const bm = markets[bookId]?.event;
      if (!bm) continue;
      if (!spreadRow) {
        const homeEntry = (bm.spread || []).find(e => e.side === 'home');
        if (homeEntry?.bet_info?.tickets?.percent != null) {
          spreadRow = {
            spread_home_line:      homeEntry.value ?? null,
            spread_home_pct_bets:  homeEntry.bet_info.tickets.percent,
            spread_home_pct_money: homeEntry.bet_info.money?.percent ?? null,
          };
        }
      }
      if (!mlRow) {
        const homeEntry = (bm.moneyline || []).find(e => e.side === 'home');
        if (homeEntry?.bet_info?.tickets?.percent != null) {
          mlRow = {
            ml_home_pct_bets:  homeEntry.bet_info.tickets.percent,
            ml_home_pct_money: homeEntry.bet_info.money?.percent ?? null,
          };
        }
      }
      if (!totalRow) {
        const overEntry = (bm.total || []).find(e => e.side === 'over');
        if (overEntry?.bet_info?.tickets?.percent != null) {
          totalRow = {
            total_line:           overEntry.value ?? null,
            total_over_pct_bets:  overEntry.bet_info.tickets.percent,
            total_over_pct_money: overEntry.bet_info.money?.percent ?? null,
          };
        }
      }
      if (spreadRow && mlRow && totalRow) break;
    }

    return {
      source:      'actionnetwork',
      league,
      external_id: String(game.id),
      slug:        `${away.url_slug || 'away'}-vs-${home.url_slug || 'home'}`,
      away_label:  away.abbr || away.display_name || null,
      home_label:  home.abbr || home.display_name || null,
      spread_home_line:      spreadRow?.spread_home_line      ?? null,
      spread_home_pct_bets:  spreadRow?.spread_home_pct_bets  ?? null,
      spread_home_pct_money: spreadRow?.spread_home_pct_money ?? null,
      ml_home_pct_bets:      mlRow?.ml_home_pct_bets          ?? null,
      ml_home_pct_money:     mlRow?.ml_home_pct_money         ?? null,
      total_line:            totalRow?.total_line              ?? null,
      total_over_pct_bets:   totalRow?.total_over_pct_bets    ?? null,
      total_over_pct_money:  totalRow?.total_over_pct_money   ?? null,
      away_last_10_ats_pct: null,
      away_last_10_su_pct:  null,
      home_last_10_ats_pct: null,
      home_last_10_su_pct:  null,
      fetched_at: now,
    };
  });
}
