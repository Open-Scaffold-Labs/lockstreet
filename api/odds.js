// Proxies to The Odds API (https://the-odds-api.com).
// Free tier: 500 req/month. The API key stays server-side - the browser only
// ever talks to /api/odds, never to the-odds-api.com directly.
//
// In-memory cache to avoid burning through the rate limit on every page load.
// Cache TTL: 24 hours (off-season + free 500/mo tier - prefer stale lines over
// blowing quota; bump back down to 5-15min once the season starts and we have
// real subscriber traffic). Cache key: sport+markets.
//
// Note: Vercel's serverless instances are stateless across cold starts, so
// "24h" is a ceiling - in practice the cache resets when the function spins
// down. Net effect: ~1 call per warm-instance lifecycle per sport.

const ODDS_BASE = 'https://api.the-odds-api.com/v4';
const SPORT_KEYS = {
  nfl: 'americanfootball_nfl',
  cfb: 'americanfootball_ncaaf',
  nba: 'basketball_nba',
  mlb: 'baseball_mlb',
  nhl: 'icehockey_nhl',
};

const cache = new Map(); // key -> { data, expires }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h - free tier conservation

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'ODDS_API_KEY not set',
      hint: 'Sign up at https://the-odds-api.com (500/mo free) and add the key to .env.local.',
    });
  }
  const sport = req.query?.sport
    || new URL(req.url, 'http://x').searchParams.get('sport')
    || 'nfl';
  const sportKey = SPORT_KEYS[sport];
  if (!sportKey) return res.status(400).json({ error: `Unknown sport: ${sport}` });

  const cacheKey = `odds:${sport}`;
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > now) {
    return res.status(200).json({ ...hit.data, cached: true });
  }

  try {
    const params = new URLSearchParams({
      apiKey,
      regions: 'us',
      markets: 'h2h,spreads,totals',
      oddsFormat: 'american',
      dateFormat: 'iso',
    });
    const url = `${ODDS_BASE}/sports/${sportKey}/odds?${params}`;
    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text();
      return res.status(r.status).json({ error: 'Odds API error', detail: txt });
    }
    const events = await r.json();
    const remaining = r.headers.get('x-requests-remaining');
    const data = { sport, events: normalize(events), remaining };
    cache.set(cacheKey, { data, expires: now + CACHE_TTL_MS });
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function normalize(events) {
  return events.map((e) => ({
    id: e.id,
    commenceTime: e.commence_time,
    home: e.home_team,
    away: e.away_team,
    books: (e.bookmakers || []).map((b) => ({
      key: b.key,
      title: b.title,
      lastUpdate: b.last_update,
      markets: Object.fromEntries((b.markets || []).map((m) => [m.key, m.outcomes])),
    })),
  }));
}
