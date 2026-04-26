/**
 * Team intel proxy — pulls offensive/defensive rank, value, label + last
 * 10 SU record from the best-available FREE sport-specific API:
 *
 *   nba  → stats.nba.com               (User-Agent dance required)
 *   mlb  → statsapi.mlb.com            (official, free, no auth)
 *   nhl  → api-web.nhle.com            (official, free, no auth)
 *   nfl  → ESPN site.api               (no better free option)
 *   cfb  → ESPN site.api               (CFBd needs free key registration)
 *
 * Browser calls hit: /api/team-intel?league=nba&teamId=2&teamAbbr=BOS
 * Returns unified shape:
 *   {
 *     offRank, offValue, offLabel,
 *     defRank, defValue, defLabel,
 *     last10: { wins, losses, pushes },
 *     source
 *   }
 *
 * Vercel cache: 6 hours (in-memory). Stats don't move much intraday and
 * we serve the same payload to every viewer of /game/:league/:gameId.
 */

const CACHE = new Map(); // key -> { at, payload }
const CACHE_MS = 6 * 60 * 60 * 1000;

function fromCache(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) { CACHE.delete(key); return null; }
  return hit.payload;
}
function toCache(key, payload) { CACHE.set(key, { at: Date.now(), payload }); }

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

export default async function handler(req, res) {
  const { league, teamId, teamAbbr } = req.query || {};
  if (!league) return res.status(400).json({ error: 'league required' });

  const cacheKey = `${league}:${teamId || ''}:${teamAbbr || ''}`;
  const cached = fromCache(cacheKey);
  if (cached) return res.status(200).json(cached);

  let payload = null;
  try {
    if (league === 'mlb') payload = await fetchMlb(teamAbbr, teamId);
    else if (league === 'nhl') payload = await fetchNhl(teamAbbr, teamId);
    else if (league === 'nba') payload = await fetchNbaViaEspn(teamId);
    else payload = await fetchEspn(league, teamId); // nfl/cfb
  } catch (e) {
    payload = { error: String(e?.message || e), offRank: null, defRank: null, last10: null, source: 'error' };
  }

  if (payload && !payload.error) toCache(cacheKey, payload);
  res.status(200).json(payload || empty());
}

function empty() {
  return { offRank: null, defRank: null, offValue: null, defValue: null,
           offLabel: '', defLabel: '', last10: null, source: 'none' };
}

// ====================================================================
// NBA — stats.nba.com (free, no key, but needs browser-like headers)
// ====================================================================

// stats.nba.com team IDs (10-digit). ESPN uses different short ids, so map
// by abbreviation. Snapshot of current teams; rare to change.
const NBA_TEAM_IDS = {
  ATL:'1610612737', BOS:'1610612738', BKN:'1610612751', CHA:'1610612766',
  CHI:'1610612741', CLE:'1610612739', DAL:'1610612742', DEN:'1610612743',
  DET:'1610612765', GS:'1610612744',  GSW:'1610612744',
  HOU:'1610612745', IND:'1610612754', LAC:'1610612746', LAL:'1610612747',
  MEM:'1610612763', MIA:'1610612748', MIL:'1610612749', MIN:'1610612750',
  NO:'1610612740',  NOP:'1610612740', NY:'1610612752', NYK:'1610612752',
  OKC:'1610612760', ORL:'1610612753', PHI:'1610612755', PHX:'1610612756',
  POR:'1610612757', SAC:'1610612758', SA:'1610612759',  SAS:'1610612759',
  TOR:'1610612761', UTA:'1610612762', WAS:'1610612764', WSH:'1610612764',
};

function nbaSeasonString() {
  const d = new Date();
  // NBA season runs Oct→Apr. If we're before October, current season started prior year.
  const startYr = d.getMonth() >= 9 ? d.getFullYear() : d.getFullYear() - 1;
  const yy = String((startYr + 1) % 100).padStart(2, '0');
  return `${startYr}-${yy}`;
}

async function fetchNba(abbr) {
  const tid = NBA_TEAM_IDS[(abbr || '').toUpperCase()];
  if (!tid) return empty();
  const season = nbaSeasonString();

  // 1) Team rankings (offensive + defensive ratings + points)
  const rankUrl = `https://stats.nba.com/stats/leaguedashteamstats?` + new URLSearchParams({
    Conference: '', DateFrom: '', DateTo: '', Division: '', GameScope: '',
    GameSegment: '', LastNGames: '0', LeagueID: '00', Location: '', MeasureType: 'Advanced',
    Month: '0', OpponentTeamID: '0', Outcome: '', PORound: '0', PaceAdjust: 'N',
    PerMode: 'PerGame', Period: '0', PlayerExperience: '', PlayerPosition: '',
    PlusMinus: 'N', Rank: 'N', Season: season, SeasonSegment: '', SeasonType: 'Regular Season',
    ShotClockRange: '', StarterBench: '', TeamID: '0', TwoWay: '0', VsConference: '', VsDivision: '',
  });
  const rankRes = await fetch(rankUrl, { headers: { ...BROWSER_HEADERS, Origin: 'https://www.nba.com', Referer: 'https://www.nba.com/' } });
  if (!rankRes.ok) throw new Error(`nba rank ${rankRes.status}`);
  const rankJson = await rankRes.json();
  const rs = rankJson?.resultSets?.[0];
  const headers = rs?.headers || [];
  const idx = (name) => headers.indexOf(name);
  const ours = (rs?.rowSet || []).find((row) => String(row[idx('TEAM_ID')]) === tid);
  let offRank = null, defRank = null, offValue = null, defValue = null;
  if (ours) {
    const offRtg = ours[idx('OFF_RATING')];
    const defRtg = ours[idx('DEF_RATING')];
    // Compute ranks across the league (ascending best for off, ascending worst for def)
    const offRtgs = (rs.rowSet || []).map((r) => r[idx('OFF_RATING')]).filter((v) => Number.isFinite(v));
    const defRtgs = (rs.rowSet || []).map((r) => r[idx('DEF_RATING')]).filter((v) => Number.isFinite(v));
    offRtgs.sort((a, b) => b - a); // highest = #1
    defRtgs.sort((a, b) => a - b); // lowest  = #1
    offRank  = offRtgs.indexOf(offRtg) + 1 || null;
    defRank  = defRtgs.indexOf(defRtg) + 1 || null;
    offValue = offRtg != null ? offRtg.toFixed(1) : null;
    defValue = defRtg != null ? defRtg.toFixed(1) : null;
  }

  // 2) Last 10 games (W/L only)
  const last10 = await nbaLast10(tid, season);

  return {
    offRank, offValue, offLabel: 'OFFRTG',
    defRank, defValue, defLabel: 'DEFRTG',
    last10, source: 'NBA Stats',
  };
}

async function nbaLast10(tid, season) {
  const url = `https://stats.nba.com/stats/teamgamelogs?` + new URLSearchParams({
    DateFrom: '', DateTo: '', GameSegment: '', LastNGames: '10',
    LeagueID: '00', Location: '', MeasureType: 'Base', Month: '0',
    OpponentTeamID: '0', Outcome: '', PORound: '0', PaceAdjust: 'N',
    PerMode: 'Totals', Period: '0', PlusMinus: 'N', Rank: 'N',
    Season: season, SeasonSegment: '', SeasonType: 'Regular Season',
    ShotClockRange: '', TeamID: tid, VsConference: '', VsDivision: '',
  });
  const r = await fetch(url, { headers: { ...BROWSER_HEADERS, Origin: 'https://www.nba.com', Referer: 'https://www.nba.com/' } });
  if (!r.ok) return null;
  const j = await r.json();
  const rs = j?.resultSets?.[0];
  const headers = rs?.headers || [];
  const wlIdx = headers.indexOf('WL');
  if (wlIdx < 0) return null;
  let wins = 0, losses = 0;
  for (const row of (rs.rowSet || []).slice(0, 10)) {
    if (row[wlIdx] === 'W') wins++; else if (row[wlIdx] === 'L') losses++;
  }
  return { wins, losses, pushes: 0 };
}

// ====================================================================
// MLB — statsapi.mlb.com (official, free, no auth)
// ====================================================================

const MLB_TEAM_IDS = {
  ARI:109, ATL:144, BAL:110, BOS:111, CHC:112, CWS:145, CIN:113, CLE:114,
  COL:115, DET:116, HOU:117, KC:118, LAA:108, LAD:119, MIA:146, MIL:158,
  MIN:142, NYM:121, NYY:147, OAK:133, PHI:143, PIT:134, SD:135, SF:137,
  SEA:136, STL:138, TB:139, TEX:140, TOR:141, WSH:120, WAS:120, ATH:133,
};

async function fetchMlb(abbr) {
  const tid = MLB_TEAM_IDS[(abbr || '').toUpperCase()];
  if (!tid) return empty();
  const yr = new Date().getFullYear();

  // Standings give league rank + last 10. ALeague=103 / NL=104.
  const stUrl = `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${yr}&standingsType=regularSeason`;
  const stRes = await fetch(stUrl, { headers: BROWSER_HEADERS });
  if (!stRes.ok) throw new Error(`mlb standings ${stRes.status}`);
  const stJson = await stRes.json();
  let myEntry = null, allTeams = [];
  for (const rec of stJson?.records || []) {
    for (const tr of rec.teamRecords || []) {
      allTeams.push(tr);
      if (tr.team?.id === tid) myEntry = tr;
    }
  }
  let last10 = null;
  if (myEntry) {
    const splits = myEntry.records?.splitRecords || [];
    const l10 = splits.find((s) => s.type === 'lastTen');
    if (l10) last10 = { wins: l10.wins, losses: l10.losses, pushes: 0 };
  }

  // Team stats: runs/game (offense), ERA (defense). Free, no auth.
  const sUrl = `https://statsapi.mlb.com/api/v1/teams/${tid}/stats?stats=season&group=hitting,pitching&season=${yr}`;
  const sRes = await fetch(sUrl, { headers: BROWSER_HEADERS });
  let offRank = null, defRank = null, offValue = null, defValue = null;
  if (sRes.ok) {
    const sJson = await sRes.json();
    const hit = (sJson.stats || []).find((s) => s.group?.displayName === 'hitting');
    const pit = (sJson.stats || []).find((s) => s.group?.displayName === 'pitching');
    const hitStat = hit?.splits?.[0]?.stat;
    const pitStat = pit?.splits?.[0]?.stat;
    // Runs per game (computed)
    if (hitStat) {
      const games = Number(hitStat.gamesPlayed) || 1;
      const runs = Number(hitStat.runs) || 0;
      offValue = (runs / games).toFixed(2);
    }
    // ERA (lower = better)
    if (pitStat) {
      defValue = String(pitStat.era ?? '').replace(/^\./, '0.');
    }
  }
  // League ranks: fetch all 30 teams' season totals (sportIds=1 = MLB).
  // The response shape is stats[0].splits[]: one split per team.
  try {
    const allHit = await fetch(`https://statsapi.mlb.com/api/v1/teams/stats?stats=season&group=hitting&season=${yr}&sportIds=1`, { headers: BROWSER_HEADERS });
    if (allHit.ok) {
      const j = await allHit.json();
      const splits = j?.stats?.[0]?.splits || [];
      const ranked = splits.map((s) => ({
        id: s.team?.id,
        rpg: (Number(s.stat?.runs) || 0) / Math.max(Number(s.stat?.gamesPlayed) || 1, 1),
      })).sort((a, b) => b.rpg - a.rpg);
      const i = ranked.findIndex((r) => r.id === tid);
      if (i >= 0) offRank = i + 1;
    }
    const allPit = await fetch(`https://statsapi.mlb.com/api/v1/teams/stats?stats=season&group=pitching&season=${yr}&sportIds=1`, { headers: BROWSER_HEADERS });
    if (allPit.ok) {
      const j = await allPit.json();
      const splits = j?.stats?.[0]?.splits || [];
      const ranked = splits.map((s) => ({
        id: s.team?.id,
        era: Number(s.stat?.era) || 99,
      })).sort((a, b) => a.era - b.era);
      const i = ranked.findIndex((r) => r.id === tid);
      if (i >= 0) defRank = i + 1;
    }
  } catch {}

  return {
    offRank, offValue, offLabel: 'R/G',
    defRank, defValue, defLabel: 'ERA',
    last10, source: 'MLB Stats',
  };
}

// ====================================================================
// NHL — api-web.nhle.com (official, free, no auth)
// ====================================================================
async function fetchNhl(abbr) {
  const code = (abbr || '').toUpperCase();
  if (!code) return empty();
  // Standings has team ranks + L10 record per club.
  const stUrl = 'https://api-web.nhle.com/v1/standings/now';
  const stRes = await fetch(stUrl, { headers: BROWSER_HEADERS });
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
  // League ranks (goalFor desc, goalAgainst asc)
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

// ====================================================================
// NBA via ESPN — fetch all 30 teams' full season+playoff schedules in
// parallel. From the resulting completed games we derive per-team avg
// points scored (offense), avg points allowed (defense), league ranks for
// both, and an accurate Last 10 by sorting completed games by date. ESPN
// ships none of this directly for NBA, but the raw schedule events have
// final scores we can roll up ourselves. Cached 6 hours at module scope.
// ====================================================================
let NBA_DATA_CACHE = { at: 0, data: null }; // { teamId: { ppg, oppPpg, offRank, defRank, games: [...] } }

function nbaYear() {
  // ESPN labels NBA seasons by end year. Oct → following calendar year.
  const d = new Date();
  return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();
}

async function fetchNbaTeamCompletedGames(teamId, year) {
  const types = [2, 3]; // regular season + postseason
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
      events.push({
        date: e.date,
        ourScore: Number(me.score),
        oppScore: Number(opp.score),
        win: me.winner === true,
        loss: me.winner === false,
      });
    }
  }
  // Newest first
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

  // 30 teams × 2 schedule fetches = 60 in parallel. ESPN handles the load.
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
  const defRanked = valid.slice().sort((a, b) => a.oppPpg - b.oppPpg); // lower = better

  const data = {};
  for (const t of valid) {
    data[t.id] = {
      ppg: t.ppg,
      oppPpg: t.oppPpg,
      offRank: offRanked.findIndex((x) => x.id === t.id) + 1,
      defRank: defRanked.findIndex((x) => x.id === t.id) + 1,
      games: t.games,
    };
  }
  NBA_DATA_CACHE = { at: Date.now(), data };
  return data;
}

async function fetchNbaViaEspn(teamId) {
  if (!teamId) return empty();
  let data;
  try { data = await getNbaSeasonData(); } catch { data = null; }
  const t = data?.[teamId];
  if (!t) {
    // Fallback to raw ESPN if the bulk fetch failed
    const base = await fetchEspn('nba', teamId);
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

// ====================================================================
// ESPN fallback — used for NFL, CFB, and NBA (stats.nba.com blocks Vercel)
// ====================================================================
const ESPN_SPORT_PATH = {
  nfl: 'football/nfl',
  cfb: 'football/college-football',
  nba: 'basketball/nba',
  mlb: 'baseball/mlb',
  nhl: 'hockey/nhl',
};
async function fetchEspn(league, teamId) {
  if (!teamId) return empty();
  const sportPath = ESPN_SPORT_PATH[league] || 'football/nfl';
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${teamId}/statistics`;
  const r = await fetch(url, { headers: BROWSER_HEADERS });
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
  // Sport-specific headline stat names. NBA uses 'avgPoints' / 'avgPointsAgainst';
  // football uses 'avgPointsFor' / 'avgPointsAgainst'. Try the broadest list.
  const off = find([
    'avgPoints', 'avgPointsFor', 'pointsPerGame', 'totalPointsPerGame',
    'pointsScored', 'avgRuns', 'runsPerGame', 'avgGoals', 'goalsPerGame',
  ]);
  const def = find([
    'avgPointsAgainst', 'pointsAllowed', 'pointsAgainst',
    'avgRunsAgainst', 'avgGoalsAgainst', 'goalsAllowedPerGame',
    'opponentPointsPerGame',
  ]);
  const normRank = (s) => {
    if (!s) return null;
    const n = Number(String(s.rank || '').replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  // Last 10 SU via team schedule
  const schedUrl = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${teamId}/schedule`;
  let last10 = null;
  try {
    const sr = await fetch(schedUrl, { headers: BROWSER_HEADERS });
    if (sr.ok) {
      const sj = await sr.json();
      const events = (sj.events || []).filter((e) => e?.competitions?.[0]?.status?.type?.completed);
      const recent = events.slice(-10);
      let w = 0, l = 0, p = 0;
      for (const ev of recent) {
        const c = ev.competitions?.[0];
        const me = (c.competitors || []).find((x) => String(x.team?.id) === String(teamId));
        if (!me) continue;
        const winner = me.winner;
        if (winner === true) w++; else if (winner === false) l++; else p++;
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
