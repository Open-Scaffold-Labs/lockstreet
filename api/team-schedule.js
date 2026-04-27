/**
 * Team season schedule proxy. Pulls ESPN's team schedule endpoint for the
 * given league + teamId, returning the full season's completed + upcoming
 * games with date, opponent, score, W/L. Two seasontypes (regular + post)
 * combined when available.
 *
 *   GET /api/team-schedule?league=nba&teamId=2&season=2026
 *
 * Cached 30 min in-memory per (league, teamId, season).
 */

const CACHE = new Map();
const CACHE_MS = 30 * 60 * 1000;

const SPORT_PATH = {
  nfl: 'football/nfl',
  cfb: 'football/college-football',
  mlb: 'baseball/mlb',
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
};

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept':     'application/json,*/*;q=0.5',
};

function nbaCurrentSeason() {
  const d = new Date();
  return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();
}

export default async function handler(req, res) {
  const { league, teamId, season: seasonQ } = req.query || {};
  const sportPath = SPORT_PATH[league];
  if (!sportPath || !teamId) return res.status(400).json({ error: 'league + teamId required' });
  const season = seasonQ || nbaCurrentSeason();

  const key = `${league}:${teamId}:${season}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return res.status(200).json(hit.payload);
  }

  // Fetch regular + postseason in parallel and merge
  const types = [2, 3];
  const fetched = await Promise.all(types.map(async (st) => {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${teamId}/schedule?season=${season}&seasontype=${st}`;
      const r = await fetch(url, { headers: BROWSER_HEADERS });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }));

  const events = [];
  for (const j of fetched) {
    if (!j?.events) continue;
    for (const e of j.events) {
      const c = e?.competitions?.[0];
      if (!c) continue;
      const me  = (c.competitors || []).find((x) => String(x.team?.id) === String(teamId));
      const opp = (c.competitors || []).find((x) => String(x.team?.id) !== String(teamId));
      if (!me || !opp) continue;
      const completed = !!c.status?.type?.completed;
      const ourScore = numOrNull(me.score);
      const oppScore = numOrNull(opp.score);
      events.push({
        id:        e.id,
        date:      e.date,
        season:    e.season?.year,
        seasonType: e.season?.type,
        weekLabel: e.week?.text || null,
        completed,
        homeAway:  me.homeAway,
        opp: {
          id:    opp.team?.id,
          abbr:  opp.team?.abbreviation,
          name:  opp.team?.displayName,
          logo:  opp.team?.logos?.[0]?.href || opp.team?.logo,
        },
        score:     completed && ourScore != null ? { us: ourScore, them: oppScore } : null,
        result:    completed ? (me.winner === true ? 'W' : me.winner === false ? 'L' : null) : null,
      });
    }
  }
  // Sort newest-first for completed, oldest-first for upcoming
  events.sort((a, b) => new Date(b.date) - new Date(a.date));

  const payload = { league, teamId, season, events };
  CACHE.set(key, { at: Date.now(), payload });
  res.status(200).json(payload);
}

function numOrNull(x) {
  if (x == null) return null;
  if (typeof x === 'object') {
    const v = x.value ?? x.displayValue ?? null;
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
