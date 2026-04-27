// Thin wrapper over ESPN's unofficial scoreboard API.
// Works directly from the browser — no key, no proxy required.
// Docs (reverse-engineered): https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// Each league maps to its sport-prefix in the ESPN URL.
const SPORT_PATH = {
  nfl: 'football/nfl',
  cfb: 'football/college-football',
  mlb: 'baseball/mlb',
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
};

export const ALL_LEAGUES = ['nfl', 'cfb', 'mlb', 'nba', 'nhl'];

function endpointFor(league, kind = 'scoreboard', extra = '') {
  const prefix = SPORT_PATH[league];
  if (!prefix) throw new Error(`Unknown league: ${league}`);
  return `${BASE}/${prefix}/${kind}${extra}`;
}

/**
 * Fetch a league's scoreboard. Pass `dateOverride` (YYYYMMDD string) to
 * request a specific day's slate; without it ESPN returns "today" — which
 * for football during off-season can be the previous Super Bowl.
 * @returns {Promise<NormalizedGame[]>}
 */
export async function fetchScoreboard(league, dateOverride = null) {
  const prefix = SPORT_PATH[league];
  if (!prefix) throw new Error(`Unknown league: ${league}`);
  const params = dateOverride ? `?dates=${dateOverride}` : '';
  const url = `${BASE}/${prefix}/scoreboard${params}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN ${league} ${res.status}`);
  const json = await res.json();
  return (json.events || []).map((e) => normalizeEvent(e, league));
}

/**
 * Fetch every league's scoreboard in parallel and merge.
 * Defaults to football-only for backward compat with existing /lines logic
 * that expects ESPN games to be NFL/CFB. Pass `leagues` explicitly to widen.
 * Pass `dateOverride` to scope every fetch to a specific day.
 */
export async function fetchAll(leagues = ['nfl', 'cfb'], dateOverride = null) {
  const results = await Promise.all(
    leagues.map((l) => fetchScoreboard(l, dateOverride).catch(() => []))
  );
  return results.flat();
}

/**
 * Fetch the games for a specific NFL/CFB week. For MLB/NBA/NHL, "week"
 * isn't a thing — those sports use a `dates` query param (YYYYMMDD or
 * YYYYMMDD-YYYYMMDD range). For consistency the function accepts an
 * optional `dates` string and falls back to the league's default
 * scoreboard for the current day.
 *
 * NFL: seasontype 2 = regular (weeks 1-18), 3 = postseason (WC=1, DIV=2,
 * CONF=3, SB=5).
 * CFB: seasontype 2 = regular (weeks 1-15), 3 = bowls.
 */
export async function fetchScoreboardWeek({ league, seasontype = 2, week, year, dates }) {
  const prefix = SPORT_PATH[league];
  if (!prefix) throw new Error(`Unknown league: ${league}`);
  const isFootball = league === 'nfl' || league === 'cfb';
  const params = new URLSearchParams();
  if (isFootball) {
    if (week != null)       params.set('week', String(week));
    if (year != null)       params.set('year', String(year));
    if (seasontype != null) params.set('seasontype', String(seasontype));
  } else {
    if (dates) params.set('dates', dates);
    // ESPN MLB/NBA/NHL scoreboard returns "today's slate" if dates is omitted.
  }
  const url = `${BASE}/${prefix}/scoreboard${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN ${league} ${res.status}`);
  const json = await res.json();
  return (json.events || []).map((e) => normalizeEvent(e, league));
}

/** Fetch a single game by its ESPN id (used by the auto-grader). */
export async function fetchGameById(league, gameId) {
  const prefix = SPORT_PATH[league];
  if (!prefix) return null;
  const url = `${BASE}/${prefix}/summary?event=${gameId}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const e = json.header || {};
    if (!e.competitions) return null;
    return normalizeEvent({ ...e, id: gameId, week: e.week, status: e.competitions?.[0]?.status }, league);
  } catch { return null; }
}

// ---- Normalization -------------------------------------------------------
function normalizeEvent(e, league) {
  const comp = e.competitions?.[0] || {};
  const status = e.status?.type?.state; // 'pre' | 'in' | 'post'
  const statusMap = { pre: 'upcoming', in: 'live', post: 'final' };
  const competitors = comp.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];

  const odds0 = comp.odds?.[0] || {};
  const spread = odds0.details || null;
  const ou = odds0.overUnder != null ? String(odds0.overUnder) : null;
  const mlHome = numOrNull(odds0.homeTeamOdds?.moneyLine);
  const mlAway = numOrNull(odds0.awayTeamOdds?.moneyLine);

  return {
    id: e.id,
    league,
    week: weekLabel(e, league),
    seasonType: e.season?.type ?? null,
    status: statusMap[status] || 'upcoming',
    period: e.status?.type?.shortDetail || '',
    kickoff: e.date, // ISO
    home: makeTeam(home),
    away: makeTeam(away),
    score: { home: num(home?.score), away: num(away?.score) },
    spread,
    ou,
    mlHome,
    mlAway,
    move: null,
  };
}

/**
 * Friendlier week label. ESPN's postseason indexes weeks 1-5 for NFL
 * (Wild Card / Divisional / Conf / [bye] / Super Bowl), so "Week 5"
 * during off-season was actually the Super Bowl. Map those out.
 *
 * MLB/NBA/NHL don't have weeks during the regular season -- ESPN does
 * return a week.number, but it's misleading (e.g., NBA "Week 27"). We
 * suppress those and only show a label for postseason rounds.
 */
function weekLabel(e, league) {
  const wk = e.week?.number;
  const seasonType = e.season?.type;
  // Postseason mapping (sport-specific)
  if (seasonType === 3 && wk) {
    if (league === 'nfl') {
      const map = { 1: 'Wild Card', 2: 'Divisional', 3: 'Conf Champ', 5: 'Super Bowl' };
      return map[wk] || `Postseason wk ${wk}`;
    }
    if (league === 'cfb') return 'Bowl';
    if (league === 'nba') {
      const map = { 1: 'Round 1', 2: 'Conf Semis', 3: 'Conf Finals', 4: 'NBA Finals' };
      return map[wk] || `Playoffs wk ${wk}`;
    }
    if (league === 'nhl') {
      const map = { 1: 'Round 1', 2: 'Round 2', 3: 'Conf Finals', 4: 'Stanley Cup' };
      return map[wk] || `Playoffs wk ${wk}`;
    }
    if (league === 'mlb') {
      const map = { 1: 'Wild Card', 2: 'Division Series', 3: 'LCS', 4: 'World Series' };
      return map[wk] || `Postseason wk ${wk}`;
    }
  }
  // Regular season: only football has meaningful weekly slates.
  if (league === 'nfl' || league === 'cfb') {
    return wk ? `Week ${wk}` : '';
  }
  // MLB/NBA/NHL regular season -- no week label.
  return '';
}

function numOrNull(x) {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function makeTeam(c) {
  if (!c) return null;
  const t = c.team || {};
  const rec = c.records?.find((r) => r.type === 'total')?.summary || c.records?.[0]?.summary || '';
  const atsRec = c.records?.find((r) => r.name === 'ATS')?.summary || null;
  return {
    abbr: t.abbreviation || t.shortDisplayName || '',
    city: t.location || '',
    name: t.name || '',
    displayName: t.displayName || '',
    logo: t.logo || (t.logos && t.logos[0]?.href) || null,
    color: t.color ? `#${t.color}` : null,
    altColor: t.alternateColor ? `#${t.alternateColor}` : null,
    su: rec,
    ats: atsRec || '—',
  };
}

function num(x) {
  if (x == null) return 0;
  // ESPN sometimes returns score as an object { value, displayValue }
  // instead of a plain number — unwrap it.
  if (typeof x === 'object') {
    const v = x.value ?? x.displayValue ?? 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
