/**
 * Action Network public-betting scraper. FALLBACK ONLY — primary is SAO
 * (see _scrape-sao.js). We use AN as a backup because it's a higher-
 * profile target with more sophisticated bot detection, so we want to
 * minimize requests to it. The main scraper only calls this if SAO fails.
 *
 * Parses __NEXT_DATA__ JSON (server-rendered) on actionnetwork.com/{league}/odds.
 */

const AN_BASE = 'https://www.actionnetwork.com';
const AN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const AN_LEAGUE_PATH = {
  nba: 'nba', nhl: 'nhl', mlb: 'mlb', nfl: 'nfl', cfb: 'college-football',
};

export async function fetchLeagueRowsActionNetwork(league) {
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
