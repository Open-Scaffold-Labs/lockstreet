/**
 * NHL + ESPN-fallback intel — folded out of api/team-intel.js to keep
 * that file small enough for Vercel's silent per-function threshold.
 *
 * NHL: api-web.nhle.com (official, free, no auth).
 * ESPN: covers NFL, CFB, and NBA fallback when the bulk fetcher fails.
 */

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};
const ESPN_SPORT_PATH = {
  nfl: 'football/nfl', cfb: 'football/college-football',
  nba: 'basketball/nba', mlb: 'baseball/mlb', nhl: 'hockey/nhl',
};
const empty = () => ({ offRank: null, defRank: null, offValue: null, defValue: null,
  offLabel: '', defLabel: '', last10: null, source: 'none' });

export async function fetchNhl(abbr) {
  const code = (abbr || '').toUpperCase();
  if (!code) return empty();
  const stRes = await fetch('https://api-web.nhle.com/v1/standings/now', { headers: BROWSER_HEADERS });
  if (!stRes.ok) throw new Error(`nhl standings ${stRes.status}`);
  const stJson = await stRes.json();
  const teams = stJson?.standings || [];
  const me = teams.find((t) => (t.teamAbbrev?.default || '').toUpperCase() === code);
  let last10 = null, offValue = null, defValue = null;
  if (me) {
    last10 = { wins: me.l10Wins || 0, losses: me.l10Losses || 0, pushes: me.l10OtLosses || 0 };
    offValue = (me.goalFor / Math.max(me.gamesPlayed, 1)).toFixed(2);
    defValue = (me.goalAgainst / Math.max(me.gamesPlayed, 1)).toFixed(2);
  }
  const offRanked = teams.slice().sort((a, b) => (b.goalFor / Math.max(b.gamesPlayed, 1)) - (a.goalFor / Math.max(a.gamesPlayed, 1)));
  const defRanked = teams.slice().sort((a, b) => (a.goalAgainst / Math.max(a.gamesPlayed, 1)) - (b.goalAgainst / Math.max(b.gamesPlayed, 1)));
  const offRank = me ? offRanked.findIndex((t) => t === me) + 1 : null;
  const defRank = me ? defRanked.findIndex((t) => t === me) + 1 : null;
  return {
    offRank: offRank || null, offValue, offLabel: 'GF/G',
    defRank: defRank || null, defValue, defLabel: 'GA/G',
    last10, source: 'NHL API',
  };
}

export async function fetchEspn(league, teamId) {
  if (!teamId) return empty();
  const sportPath = ESPN_SPORT_PATH[league] || 'football/nfl';
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${teamId}/statistics`, { headers: BROWSER_HEADERS });
  if (!r.ok) throw new Error(`espn team-stats ${r.status}`);
  const j = await r.json();
  const cats = j?.results?.stats?.categories || [];
  const flat = [];
  for (const cat of cats) {
    for (const s of cat.stats || []) flat.push({ ...s, _cat: cat.name || '' });
  }
  const find = (names) => {
    for (const n of names) {
      const s = flat.find((s) => (s.name || '').toLowerCase() === n.toLowerCase()
                              || (s.abbreviation || '').toLowerCase() === n.toLowerCase());
      if (s) return s;
    }
    return null;
  };
  const off = find(['avgPoints', 'avgPointsFor', 'pointsPerGame', 'totalPointsPerGame', 'pointsScored', 'avgRuns', 'runsPerGame', 'avgGoals', 'goalsPerGame']);
  const def = find(['avgPointsAgainst', 'pointsAllowed', 'pointsAgainst', 'avgRunsAgainst', 'avgGoalsAgainst', 'goalsAllowedPerGame', 'opponentPointsPerGame']);
  const normRank = (s) => {
    if (!s) return null;
    const n = Number(String(s.rank || '').replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  let last10 = null;
  try {
    const sr = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${teamId}/schedule`, { headers: BROWSER_HEADERS });
    if (sr.ok) {
      const sj = await sr.json();
      const events = (sj.events || []).filter((e) => e?.competitions?.[0]?.status?.type?.completed);
      const recent = events.slice(-10);
      let w = 0, l = 0, p = 0;
      for (const ev of recent) {
        const c = ev.competitions?.[0];
        const me = (c.competitors || []).find((x) => String(x.team?.id) === String(teamId));
        if (!me) continue;
        if (me.winner === true) w++; else if (me.winner === false) l++; else p++;
      }
      last10 = { wins: w, losses: l, pushes: p };
    }
  } catch {}

  return {
    offRank: normRank(off), offValue: off?.displayValue ?? off?.value ?? null,
    offLabel: off?.shortDisplayName || off?.abbreviation || '',
    defRank: normRank(def), defValue: def?.displayValue ?? def?.value ?? null,
    defLabel: def?.shortDisplayName || def?.abbreviation || '',
    last10, source: 'ESPN',
  };
}
