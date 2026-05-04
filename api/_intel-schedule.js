/**
 * Schedule handler — folded out of api/team-intel.js to keep that file
 * small enough for Vercel's Hobby per-function build threshold. ESPN
 * team schedule across regular + postseason; returns events with
 * date/opp/score/result. Powers /team and game-detail preview cards.
 */

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};
const SCHED_CACHE = new Map();
const SCHED_CACHE_MS = 30 * 60 * 1000;
const SCHED_SPORT_PATH = {
  nfl: 'football/nfl', cfb: 'football/college-football',
  mlb: 'baseball/mlb', nba: 'basketball/nba', nhl: 'hockey/nhl',
};

function currentSeasonGuess() {
  const d = new Date();
  return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();
}

function numOrNullScore(x) {
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

export async function handleSchedule(req, res) {
  const { league, teamId, season: seasonQ } = req.query || {};
  const sportPath = SCHED_SPORT_PATH[league];
  if (!sportPath || !teamId) return res.status(400).json({ error: 'league + teamId required' });
  const season = seasonQ || currentSeasonGuess();
  const key = `sched:${league}:${teamId}:${season}`;
  const hit = SCHED_CACHE.get(key);
  if (hit && Date.now() - hit.at < SCHED_CACHE_MS) return res.status(200).json(hit.payload);

  const fetched = await Promise.all([2, 3].map(async (st) => {
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
      const ourScore = numOrNullScore(me.score);
      const oppScore = numOrNullScore(opp.score);
      events.push({
        id: e.id, date: e.date, season: e.season?.year, seasonType: e.season?.type,
        weekLabel: e.week?.text || null, completed, homeAway: me.homeAway,
        opp: {
          id: opp.team?.id, abbr: opp.team?.abbreviation,
          name: opp.team?.displayName,
          logo: opp.team?.logos?.[0]?.href || opp.team?.logo,
        },
        score: completed && ourScore != null ? { us: ourScore, them: oppScore } : null,
        result: completed ? (me.winner === true ? 'W' : me.winner === false ? 'L' : null) : null,
      });
    }
  }
  events.sort((a, b) => new Date(b.date) - new Date(a.date));
  const payload = { league, teamId, season, events };
  SCHED_CACHE.set(key, { at: Date.now(), payload });
  res.status(200).json(payload);
}
