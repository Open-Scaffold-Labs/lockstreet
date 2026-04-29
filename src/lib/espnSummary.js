// Fetch + normalize ESPN's per-game summary endpoint into something the
// game-detail page can render. Per-sport stat parsing is rough by design —
// ESPN's boxscore.players shape varies a lot by league. We pluck the keys
// we need for our fantasy formulas and shrug at anything else.

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const SPORT_PATH = {
  nfl: 'football/nfl',
  cfb: 'football/college-football',
  mlb: 'baseball/mlb',
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
};

export async function fetchGameSummary(league, gameId) {
  const prefix = SPORT_PATH[league];
  if (!prefix) throw new Error(`Unknown league: ${league}`);
  const url = `${BASE}/${prefix}/summary?event=${gameId}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN ${league} summary ${res.status}`);
  const json = await res.json();
  return normalizeSummary(json, league);
}

/**
 * Fetch a team's season stats with league ranks. Used on the game-detail
 * page to show off/def rank side-by-side. Free ESPN public endpoint, no key.
 * Returns { offRank, offValue, offLabel, defRank, defValue, defLabel } or
 * null on any failure (so the UI can fall back to '—').
 */
export async function fetchTeamStats(league, teamId) {
  const prefix = SPORT_PATH[league];
  if (!prefix || !teamId) return null;
  const url = `${BASE}/${prefix}/teams/${teamId}/statistics`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return parseTeamStats(json, league);
  } catch { return null; }
}

/**
 * ESPN groups team season-stats into "categories" (general / passing /
 * defense / etc.). Flatten everything, then look up the league-meaningful
 * offensive + defensive headline stats by name. Each stat carries a `rank`
 * field which is the league-wide rank we display.
 */
function parseTeamStats(json, league) {
  const categories = json?.results?.stats?.categories || json?.categories || [];
  const flat = [];
  for (const cat of categories) {
    for (const s of cat.stats || []) flat.push({ ...s, _cat: cat.name || '' });
  }
  const findStat = (names) => {
    for (const n of names) {
      const lc = n.toLowerCase();
      const found = flat.find((s) => (s.name || '').toLowerCase() === lc
        || (s.abbreviation || '').toLowerCase() === lc);
      if (found) return found;
    }
    return null;
  };

  let offStat = null, defStat = null;
  if (league === 'nfl' || league === 'cfb') {
    offStat = findStat(['avgPointsFor', 'pointsPerGame', 'totalPointsPerGame', 'avgGain']);
    defStat = findStat(['avgPointsAgainst', 'pointsAllowed', 'pointsAgainst']);
  } else if (league === 'nba') {
    offStat = findStat(['avgPoints', 'pointsPerGame', 'points']);
    defStat = findStat(['avgPointsAgainst', 'pointsAllowed', 'opponentPointsPerGame']);
  } else if (league === 'mlb') {
    offStat = findStat(['avgRuns', 'runsPerGame', 'runsScoredPerGame']);
    defStat = findStat(['earnedRunAvg', 'ERA', 'earnedRunAverage', 'avgRunsAllowed']);
  } else if (league === 'nhl') {
    offStat = findStat(['avgGoals', 'goalsPerGame', 'goalsFor']);
    defStat = findStat(['avgGoalsAgainst', 'goalsAgainst', 'goalsAllowedPerGame']);
  }

  // ESPN's rank field is sometimes a string ('5th') or number; normalize.
  const normRank = (s) => {
    if (s == null) return null;
    if (s.rank != null) {
      const n = Number(String(s.rank).replace(/[^\d]/g, ''));
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
  };
  return {
    offRank:  normRank(offStat),
    offValue: offStat?.displayValue ?? offStat?.value ?? null,
    offLabel: offStat?.displayName || offStat?.shortDisplayName || offStat?.abbreviation || '',
    defRank:  normRank(defStat),
    defValue: defStat?.displayValue ?? defStat?.value ?? null,
    defLabel: defStat?.displayName || defStat?.shortDisplayName || defStat?.abbreviation || '',
  };
}

function normalizeSummary(json, league) {
  const header = json.header || {};
  const comp = header.competitions?.[0] || {};
  const competitors = comp.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[0] || {};
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[1] || {};
  // Status path varies — sometimes it's only on competitions[0].status, not on
  // header.status. Try both. MLB summaries in particular often blank header.status.
  const statusType =
    header.status?.type?.state ||
    comp.status?.type?.state ||
    header.competitions?.[0]?.status?.type?.state;
  const statusCompleted =
    header.status?.type?.completed ||
    comp.status?.type?.completed;
  const statusMap = { pre: 'upcoming', in: 'live', post: 'final' };
  // If state is missing but completed=true, treat as final.
  const status = statusType || (statusCompleted ? 'post' : null);

  const players = (json.boxscore?.players || []).map((tp) => ({
    teamId:   tp.team?.id,
    teamAbbr: tp.team?.abbreviation,
    teamName: tp.team?.displayName,
    statistics: tp.statistics || [],
  }));

  // Pre-game intel: lastFiveGames, injuries, team-level stats. Each is keyed
  // by team id, then we attach to home/away below. ESPN's shapes vary by
  // league but the surface area here is consistent enough to render.
  const lastFiveByTeam = byTeamId(json.lastFiveGames, (entry) => extractLastN(entry));
  const injuriesByTeam = byTeamId(json.injuries, (entry) => extractInjuries(entry));
  const teamStatsByTeam = byTeamId(json.boxscore?.teams, (entry) => extractTeamStats(entry));

  function buildTeam(c) {
    return {
      id:    c.id,
      abbr:  c.team?.abbreviation,
      name:  c.team?.displayName,
      logo:  c.team?.logos?.[0]?.href || c.team?.logo,
      score: num(c.score),
      record: c.record?.[0]?.summary || '',
      color: c.team?.color ? `#${c.team.color}` : null,
      lastFive: lastFiveByTeam[c.id] || null,
      injuries: injuriesByTeam[c.id] || [],
      teamStats: teamStatsByTeam[c.id] || null,
    };
  }

  // Playoff series chip — present on postseason NBA/NHL/MLB events. Uses
  // ESPN's friendly summary string when present ("BOS leads 2-1"); falls
  // back to building it from per-team wins.
  // ESPN's summary endpoint returns competitions[0].series as an ARRAY
  // (with the relevant series at index 0); the scoreboard endpoint
  // returns it as a plain object. Unwrap if array.
  const series = (() => {
    const raw = comp?.series;
    const s = Array.isArray(raw) ? raw[0] : raw;
    if (!s) return null;
    const sc = s.competitors || [];
    const homeRow = sc.find((x) => String(x.id) === String(home?.id || home?.team?.id));
    const awayRow = sc.find((x) => String(x.id) === String(away?.id || away?.team?.id));
    const hw = Number.isFinite(Number(homeRow?.wins)) ? Number(homeRow.wins) : null;
    const aw = Number.isFinite(Number(awayRow?.wins)) ? Number(awayRow.wins) : null;
    let summary = s.summary || null;
    if (!summary && hw != null && aw != null) {
      const ha = home?.team?.abbreviation || '';
      const aa = away?.team?.abbreviation || '';
      if (hw === aw) summary = `Series tied ${hw}-${aw}`;
      else if (hw > aw) summary = `${ha} leads ${hw}-${aw}`;
      else summary = `${aa} leads ${aw}-${hw}`;
    }
    if (!summary) return null;
    return { summary, title: s.title || null, awayWins: aw, homeWins: hw };
  })();

  // Odds source order (ESPN's summary endpoint scatters them):
  //   1) json.pickcenter[0]  — the canonical place on the summary
  //      response. Has `details` ("DET -11.5"), `overUnder`, per-team
  //      moneylines on awayTeamOdds / homeTeamOdds.moneyLine.
  //   2) header.competitions[0].odds[0] — the same shape, present on
  //      the scoreboard endpoint and sometimes echoed here.
  // Returns null when the event has no odds at all (rare for upcoming
  // games, common for preseason / international).
  const odds = (() => {
    const o = json?.pickcenter?.[0] || comp?.odds?.[0] || null;
    if (!o) return null;
    const details   = typeof o.details === 'string' ? o.details : null;
    const total     = Number.isFinite(Number(o.overUnder)) ? Number(o.overUnder) : null;
    const mlHome    = Number.isFinite(Number(o.homeTeamOdds?.moneyLine)) ? Number(o.homeTeamOdds.moneyLine) : null;
    const mlAway    = Number.isFinite(Number(o.awayTeamOdds?.moneyLine)) ? Number(o.awayTeamOdds.moneyLine) : null;
    if (!details && total == null && mlHome == null && mlAway == null) return null;
    return { details, total, mlHome, mlAway };
  })();

  return {
    id:         header.id,
    league,
    status:     statusMap[status] || 'upcoming',
    // Fall back to competitions[0].status when header.status is empty (MLB
    // summaries often blank that out — pulls correctly from comp.status).
    statusText: header.status?.type?.detail || header.status?.type?.shortDetail
             || comp.status?.type?.detail || comp.status?.type?.shortDetail || '',
    period:     header.status?.period ?? comp.status?.period ?? null,
    clock:      header.status?.displayClock || comp.status?.displayClock || '',
    date:       header.competitions?.[0]?.date,
    home: buildTeam(home),
    away: buildTeam(away),
    series,                                   // playoff series chip data (or null)
    odds,                                     // { details, total, mlHome, mlAway } | null
    players,                                  // raw shape, parsed in extractPlayers()
    parsed: extractPlayers(players, league),  // [{teamId, teamAbbr, players: [{name, position, stats, fp}]}]
    recentPlays: extractRecentPlays(json),    // last 15 plays for live game tracker
  };
}

/**
 * Pull recent plays from the ESPN summary response. Path varies by sport:
 *   - NBA / NHL / soccer: `json.plays` is a flat array
 *   - NFL / CFB:          `json.drives.{current,previous}[*].plays`
 *   - MLB:                no flat plays; would need atBats traversal — punt.
 * Returns the last 15 plays, newest first.
 */
function extractRecentPlays(json) {
  let raw = [];
  if (Array.isArray(json.plays) && json.plays.length) {
    raw = json.plays;
  } else if (json.drives) {
    const prev = Array.isArray(json.drives.previous) ? json.drives.previous : [];
    const cur  = json.drives.current ? [json.drives.current] : [];
    for (const d of [...prev, ...cur]) {
      if (Array.isArray(d.plays)) raw = raw.concat(d.plays);
    }
  }
  return raw.slice(-15).reverse().map((p, i) => ({
    id:          p.id || `${p.sequenceNumber || i}`,
    text:        p.text || p.shortText || '',
    clock:       p.clock?.displayValue || '',
    period:      p.period?.number || p.period?.displayValue || '',
    scoringPlay: !!p.scoringPlay,
    awayScore:   p.awayScore,
    homeScore:   p.homeScore,
  }));
}

/**
 * Index a list of {team:{id}, ...} ESPN entries by team id, mapping each
 * through `mapper`. Many ESPN summary fields use this exact shape (one
 * object per team, top-level array).
 */
function byTeamId(arr, mapper) {
  if (!Array.isArray(arr)) return {};
  const out = {};
  for (const entry of arr) {
    const id = entry?.team?.id ?? entry?.id;
    if (!id) continue;
    out[id] = mapper(entry);
  }
  return out;
}

/** Last-N recent results: returns { wins, losses, pushes, games: [{result, opp, score}] }. */
function extractLastN(entry) {
  const events = entry?.events || [];
  let wins = 0, losses = 0, pushes = 0;
  const games = events.map((e) => {
    const r = (e?.gameResult || '').toUpperCase();   // 'W' | 'L' | 'T'
    if (r === 'W') wins++;
    else if (r === 'L') losses++;
    else pushes++;
    return {
      result: r || '?',
      opp:    e?.opponent?.abbreviation || e?.opponent?.displayName || '',
      atVs:   e?.atVs || '',     // '@' or 'vs'
      score:  e?.score || e?.gameDetail?.score || '',
      date:   e?.gameDate,
    };
  });
  return { wins, losses, pushes, games };
}

/** Injury list: [{name, position, status, detail}]. */
function extractInjuries(entry) {
  const list = entry?.injuries || [];
  return list.map((row) => {
    const a = row?.athlete || {};
    return {
      name:     a.displayName || a.shortName || '',
      position: a.position?.abbreviation || '',
      status:   row?.status || row?.type || '',
      detail:   row?.details?.detail || row?.details?.type || '',
    };
  });
}

/**
 * Best-effort team-level stat extraction from boxscore.teams[].statistics.
 * For pre-game we usually get null; for live/final we get team game-stats.
 * League-level offensive/defensive rank doesn't reliably ship in summary —
 * surface what's there and let the UI hide what's missing.
 */
function extractTeamStats(entry) {
  const stats = entry?.statistics;
  if (!stats || stats.length === 0) return null;
  const out = {};
  for (const s of stats) {
    const key = s.name || s.label;
    if (!key) continue;
    out[key] = s.displayValue ?? s.value ?? null;
  }
  return out;
}

// ============================================================
// Per-sport player extractors. ESPN groups player stats into
// "categories" (passing/rushing/receiving for football, etc.).
// We flatten them and pick out the keys we need for fantasy.
// ============================================================
function extractPlayers(teamPlayers, league) {
  if (league === 'nfl' || league === 'cfb') return extractFootball(teamPlayers);
  if (league === 'mlb')                     return extractBaseball(teamPlayers);
  if (league === 'nba')                     return extractBasketball(teamPlayers);
  if (league === 'nhl')                     return extractHockey(teamPlayers);
  return [];
}

function extractFootball(teamPlayers) {
  return teamPlayers.map((tp) => {
    // Map: athleteId → unified stat record
    const byAthlete = new Map();
    function ensure(athlete) {
      const id = athlete?.id;
      if (!id) return null;
      if (!byAthlete.has(id)) byAthlete.set(id, {
        id, name: athlete.displayName || athlete.shortName, position: athlete.position?.abbreviation || '',
        stats: {},
      });
      return byAthlete.get(id);
    }
    for (const cat of tp.statistics || []) {
      const name  = (cat.name || '').toLowerCase();
      const labels = (cat.labels || []).map((s) => s.toLowerCase());
      for (const ath of cat.athletes || []) {
        const rec = ensure(ath.athlete);
        if (!rec) continue;
        const vals = ath.stats || [];
        // ESPN labels vary; pick by position in the label array
        const get = (label) => {
          const i = labels.indexOf(label);
          return i >= 0 ? vals[i] : null;
        };
        if (name === 'passing') {
          rec.stats.passYds = parseStat(get('yds') || vals[1], 'first');
          rec.stats.passTd  = parseStat(get('td'),  'plain');
          rec.stats.passInt = parseStat(get('int'), 'plain');
        } else if (name === 'rushing') {
          rec.stats.rushYds = parseStat(get('yds'), 'plain');
          rec.stats.rushTd  = parseStat(get('td'),  'plain');
        } else if (name === 'receiving') {
          rec.stats.recYds = parseStat(get('yds'), 'plain');
          rec.stats.recTd  = parseStat(get('td'),  'plain');
          rec.stats.rec    = parseStat(get('rec'), 'plain');
        } else if (name === 'fumbles') {
          rec.stats.fumLost = parseStat(get('lost'), 'plain');
        }
      }
    }
    return { teamId: tp.teamId, teamAbbr: tp.teamAbbr, players: Array.from(byAthlete.values()) };
  });
}

function extractBaseball(teamPlayers) {
  return teamPlayers.map((tp) => {
    const byAthlete = new Map();
    for (const cat of tp.statistics || []) {
      const isPitching = (cat.name || '').toLowerCase() === 'pitching';
      const labels = (cat.labels || []).map((s) => s.toLowerCase());
      for (const ath of cat.athletes || []) {
        const id = ath.athlete?.id;
        if (!id) continue;
        if (!byAthlete.has(id)) byAthlete.set(id, {
          id, name: ath.athlete.displayName || ath.athlete.shortName,
          position: ath.athlete.position?.abbreviation || '',
          stats: {}, isPitcher: false,
        });
        const rec = byAthlete.get(id);
        const vals = ath.stats || [];
        const get = (label) => { const i = labels.indexOf(label); return i >= 0 ? vals[i] : null; };
        if (isPitching) {
          rec.isPitcher = true;
          rec.stats.ip = parseStat(get('ip'), 'plain');
          rec.stats.k  = parseStat(get('k'),  'plain');
          rec.stats.er = parseStat(get('er'), 'plain');
          rec.stats.h  = parseStat(get('h'),  'plain');
          rec.stats.bb = parseStat(get('bb'), 'plain');
        } else {
          // Hitting category — derive singles from H - 2B - 3B - HR
          const H   = parseStat(get('h'),   'plain');
          const dbl = parseStat(get('2b'),  'plain');
          const trp = parseStat(get('3b'),  'plain');
          const hr  = parseStat(get('hr'),  'plain');
          rec.stats.singles = Math.max(H - dbl - trp - hr, 0);
          rec.stats.doubles = dbl;
          rec.stats.triples = trp;
          rec.stats.hr      = hr;
          rec.stats.rbi     = parseStat(get('rbi'), 'plain');
          rec.stats.r       = parseStat(get('r'),   'plain');
          rec.stats.bb      = parseStat(get('bb'),  'plain');
          rec.stats.sb      = parseStat(get('sb'),  'plain');
        }
      }
    }
    return { teamId: tp.teamId, teamAbbr: tp.teamAbbr, players: Array.from(byAthlete.values()) };
  });
}

function extractBasketball(teamPlayers) {
  return teamPlayers.map((tp) => {
    const players = [];
    for (const cat of tp.statistics || []) {
      const labels = (cat.labels || []).map((s) => s.toLowerCase());
      for (const ath of cat.athletes || []) {
        const a = ath.athlete;
        if (!a?.id) continue;
        const vals = ath.stats || [];
        const get = (label) => { const i = labels.indexOf(label); return i >= 0 ? vals[i] : null; };
        const stats = {
          pts:    parseStat(get('pts'), 'plain'),
          reb:    parseStat(get('reb'), 'plain'),
          ast:    parseStat(get('ast'), 'plain'),
          stl:    parseStat(get('stl'), 'plain'),
          blk:    parseStat(get('blk'), 'plain'),
          to:     parseStat(get('to'),  'plain'),
          threes: parseStat(get('3pt'), 'first') || parseStat(get('3p'), 'first'),
        };
        players.push({ id: a.id, name: a.displayName || a.shortName, position: a.position?.abbreviation || '', stats });
      }
    }
    return { teamId: tp.teamId, teamAbbr: tp.teamAbbr, players };
  });
}

function extractHockey(teamPlayers) {
  return teamPlayers.map((tp) => {
    const players = [];
    for (const cat of tp.statistics || []) {
      const labels = (cat.labels || []).map((s) => s.toLowerCase());
      const isGoalie = (cat.name || '').toLowerCase().includes('goalie');
      for (const ath of cat.athletes || []) {
        const a = ath.athlete;
        if (!a?.id) continue;
        const vals = ath.stats || [];
        const get = (label) => { const i = labels.indexOf(label); return i >= 0 ? vals[i] : null; };
        if (isGoalie) {
          players.push({
            id: a.id, name: a.displayName || a.shortName, position: 'G', isGoalie: true,
            stats: {
              sv:  parseStat(get('sv'),  'plain'),
              ga:  parseStat(get('ga'),  'plain'),
              win: a.statistics?.[0]?.value || 0,
            },
          });
        } else {
          players.push({
            id: a.id, name: a.displayName || a.shortName, position: a.position?.abbreviation || '',
            stats: {
              g:   parseStat(get('g'),   'plain'),
              a:   parseStat(get('a'),   'plain'),
              sog: parseStat(get('sog') || get('s'), 'plain'),
              blk: parseStat(get('blk'), 'plain'),
            },
          });
        }
      }
    }
    return { teamId: tp.teamId, teamAbbr: tp.teamAbbr, players };
  });
}

// "first": value like "245/30" → 245 ; "plain": numeric coerce
function parseStat(v, mode) {
  if (v == null || v === '') return 0;
  const s = String(v);
  if (mode === 'first') {
    const m = s.match(/^[\d.]+/);
    return m ? Number(m[0]) : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
