/**
 * NBA via ESPN — bulk fetcher for all 30 teams' season + postseason
 * schedules. From completed games we derive PPG/OppPPG, league ranks,
 * and a date-sorted Last 10. stats.nba.com blocks Vercel/AWS at network
 * level so we go through ESPN. Cached 6 hours at module scope.
 *
 * Extracted from api/team-intel.js to keep that file small enough for
 * Vercel's Hobby per-function build threshold.
 */

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};
const CACHE_MS = 6 * 60 * 60 * 1000;
let NBA_DATA_CACHE = { at: 0, data: null };

function nbaYear() {
  const d = new Date();
  return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();
}

async function fetchNbaTeamCompletedGames(teamId, year) {
  const types = [2, 3];
  const responses = await Promise.all(types.map(async (st) => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule?season=${year}&seasontype=${st}`;
    try {
      const r = await fetch(url, { headers: BROWSER_HEADERS });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }));
  const events = [];
  for (const j of responses) {
    if (!j) continue;
    for (const e of j.events || []) {
      const c = e?.competitions?.[0];
      if (!c?.status?.type?.completed) continue;
      const me = (c.competitors || []).find((x) => String(x.team?.id) === String(teamId));
      const opp = (c.competitors || []).find((x) => String(x.team?.id) !== String(teamId));
      if (!me || !opp) continue;
      const ourN = Number(me.score?.value ?? me.score?.displayValue ?? me.score);
      const oppN = Number(opp.score?.value ?? opp.score?.displayValue ?? opp.score);
      if (!Number.isFinite(ourN) || !Number.isFinite(oppN)) continue;
      events.push({
        date: e.date,
        ourScore: ourN, oppScore: oppN,
        win: me.winner === true, loss: me.winner === false,
      });
    }
  }
  events.sort((a, b) => new Date(b.date) - new Date(a.date));
  return events;
}

async function getNbaSeasonData() {
  if (NBA_DATA_CACHE.data && Date.now() - NBA_DATA_CACHE.at < CACHE_MS) {
    return NBA_DATA_CACHE.data;
  }
  const teamsRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams', { headers: BROWSER_HEADERS });
  if (!teamsRes.ok) return null;
  const teamsJson = await teamsRes.json();
  const teamIds = (teamsJson?.sports?.[0]?.leagues?.[0]?.teams || [])
    .map((t) => t.team?.id).filter(Boolean);
  const year = nbaYear();
  const perTeam = await Promise.all(teamIds.map(async (id) => {
    const games = await fetchNbaTeamCompletedGames(id, year);
    if (!games.length) return null;
    const us  = games.map((g) => g.ourScore).filter(Number.isFinite);
    const opp = games.map((g) => g.oppScore).filter(Number.isFinite);
    if (!us.length || !opp.length) return null;
    return {
      id,
      ppg:    us.reduce((a, b) => a + b, 0) / us.length,
      oppPpg: opp.reduce((a, b) => a + b, 0) / opp.length,
      games,
    };
  }));
  const valid = perTeam.filter(Boolean);
  if (!valid.length) return null;
  const offRanked = valid.slice().sort((a, b) => b.ppg - a.ppg);
  const defRanked = valid.slice().sort((a, b) => a.oppPpg - b.oppPpg);
  const data = {};
  for (const t of valid) {
    data[t.id] = {
      ppg: t.ppg, oppPpg: t.oppPpg,
      offRank: offRanked.findIndex((x) => x.id === t.id) + 1,
      defRank: defRanked.findIndex((x) => x.id === t.id) + 1,
      games: t.games,
    };
  }
  NBA_DATA_CACHE = { at: Date.now(), data };
  return data;
}

export async function fetchNbaViaEspn(teamId, fetchEspnFallback) {
  const empty = () => ({ offRank: null, defRank: null, offValue: null, defValue: null,
    offLabel: '', defLabel: '', last10: null, source: 'none' });
  if (!teamId) return empty();
  let data;
  try { data = await getNbaSeasonData(); } catch { data = null; }
  const t = data?.[teamId];
  if (!t) {
    const base = await fetchEspnFallback('nba', teamId);
    base.source = 'ESPN (NBA fallback)';
    return base;
  }
  const last10 = t.games.slice(0, 10);
  let w = 0, l = 0;
  for (const g of last10) {
    if (g.win) w++; else if (g.loss) l++;
  }
  return {
    offRank: t.offRank, offValue: t.ppg.toFixed(1), offLabel: 'PPG',
    defRank: t.defRank, defValue: t.oppPpg.toFixed(1), defLabel: 'OPP PPG',
    last10: { wins: w, losses: l, pushes: 0 },
    source: 'ESPN (NBA)',
  };
}
