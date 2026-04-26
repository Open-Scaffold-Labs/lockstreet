// Server-side proxy for Action Network's public-betting JSON.
// This is a STOPGAP for the pre-launch / demo phase. Once subscribers exist
// and there's revenue, swap to OddsJam (or similar) which has splits as part
// of a normal commercial license.
//
// The endpoint we hit (`api.actionnetwork.com/web/v1/scoreboard/publicbetting/{league}`)
// is what powers actionnetwork.com's own public-betting page. It returns
// per-game splits across spread / moneyline / total. We pick the FIRST odds
// row per game (Action Network's consensus row) and surface its public + money
// percentages.
//
// Cache: 24h in-memory. Action Network gets one request per cold start per
// sport from us — invisibly low volume, but technically a TOS gray area
// (automated access of a public endpoint). Replace with a paid feed before
// public launch.

const AN_BASE = 'https://api.actionnetwork.com/web/v1/scoreboard/publicbetting';

const SPORT_MAP = {
  mlb:   'mlb',
  nba:   'nba',
  nhl:   'nhl',
  nfl:   'nfl',
  cfb:   'ncaaf',
  ncaaf: 'ncaaf',
};

const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const sport = req.query?.sport || url.searchParams.get('sport') || 'mlb';
  const anLeague = SPORT_MAP[sport];
  if (!anLeague) return res.status(400).json({ error: `Unknown sport: ${sport}` });

  const cacheKey = `splits:${anLeague}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) {
    return res.status(200).json({ ...hit.data, cached: true });
  }

  try {
    const r = await fetch(`${AN_BASE}/${anLeague}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; node-fetch)' },
    });
    if (!r.ok) {
      return res.status(r.status).json({ error: `Action Network returned ${r.status}` });
    }
    const json = await r.json();
    const data = { sport, fetchedAt: new Date().toISOString(), games: normalize(json.games || []) };
    cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL_MS });
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Public splits fetch failed', detail: String(e.message || e) });
  }
}

function normalize(games) {
  return games.map((g) => {
    const home = (g.teams || []).find((t) => t.id === g.home_team_id) || g.teams?.[1];
    const away = (g.teams || []).find((t) => t.id === g.away_team_id) || g.teams?.[0];
    const o = (g.odds || [])[0] || {};
    return {
      id: g.id,
      startTime: g.start_time,
      home: { id: home?.id, full: home?.full_name, display: home?.display_name, abbr: home?.abbr },
      away: { id: away?.id, full: away?.full_name, display: away?.display_name, abbr: away?.abbr },
      numBets: g.num_bets,
      splits: {
        spread: {
          home_bets:  o.spread_home_public ?? null,
          away_bets:  o.spread_away_public ?? null,
          home_money: o.spread_home_money  ?? null,
          away_money: o.spread_away_money  ?? null,
        },
        ml: {
          home_bets:  o.ml_home_public ?? null,
          away_bets:  o.ml_away_public ?? null,
          home_money: o.ml_home_money  ?? null,
          away_money: o.ml_away_money  ?? null,
        },
        total: {
          over_bets:   o.total_over_public  ?? null,
          under_bets:  o.total_under_public ?? null,
          over_money:  o.total_over_money   ?? null,
          under_money: o.total_under_money  ?? null,
        },
      },
    };
  });
}
