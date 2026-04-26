// Proxies to The Odds API for player props.
// Each event needs its own request, so this can chew through the rate limit
// fast - only call sparingly.
// Markets: player_pass_yds, player_rush_yds, player_reception_yds, player_anytime_td, etc.

const ODDS_BASE = 'https://api.the-odds-api.com/v4';
const SPORT_KEYS = { nfl: 'americanfootball_nfl', ncaaf: 'americanfootball_ncaaf' };

const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ODDS_API_KEY not set' });

  const url = new URL(req.url, 'http://x');
  const sport  = req.query?.sport  || url.searchParams.get('sport')  || 'nfl';
  const events = (req.query?.eventIds || url.searchParams.get('eventIds') || '').split(',').filter(Boolean);
  const markets = req.query?.markets || url.searchParams.get('markets')
    || 'player_pass_yds,player_rush_yds,player_reception_yds,player_anytime_td';
  const sportKey = SPORT_KEYS[sport];
  if (!sportKey) return res.status(400).json({ error: `Unknown sport: ${sport}` });
  if (!events.length) return res.status(400).json({ error: 'eventIds required (comma-separated)' });

  const out = [];
  for (const eventId of events) {
    const cacheKey = `props:${sport}:${eventId}:${markets}`;
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) { out.push(hit.data); continue; }
    try {
      const params = new URLSearchParams({
        apiKey, regions: 'us', oddsFormat: 'american', dateFormat: 'iso', markets,
      });
      const r = await fetch(`${ODDS_BASE}/sports/${sportKey}/events/${eventId}/odds?${params}`);
      if (!r.ok) continue;
      const json = await r.json();
      const data = { eventId, ...json };
      cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL_MS });
      out.push(data);
    } catch { /* skip */ }
  }
  res.status(200).json({ events: out });
}
