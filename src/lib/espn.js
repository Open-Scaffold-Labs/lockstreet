// Thin wrapper over ESPN's unofficial scoreboard API.
// Works directly from the browser — no key, no proxy required.
// Docs (reverse-engineered): https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football';

const ENDPOINTS = {
  nfl: `${BASE}/nfl/scoreboard`,
  cfb: `${BASE}/college-football/scoreboard`,
};

/** @returns {Promise<NormalizedGame[]>} */
export async function fetchScoreboard(league) {
  const url = ENDPOINTS[league];
  if (!url) throw new Error(`Unknown league: ${league}`);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN ${league} ${res.status}`);
  const json = await res.json();
  return (json.events || []).map((e) => normalizeEvent(e, league));
}

export async function fetchAll() {
  const [nfl, cfb] = await Promise.all([
    fetchScoreboard('nfl').catch(() => []),
    fetchScoreboard('cfb').catch(() => []),
  ]);
  return [...nfl, ...cfb];
}

// ---- Normalization -------------------------------------------------------
function normalizeEvent(e, league) {
  const comp = e.competitions?.[0] || {};
  const status = e.status?.type?.state; // 'pre' | 'in' | 'post'
  const statusMap = { pre: 'upcoming', in: 'live', post: 'final' };
  const competitors = comp.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];

  const spread = comp.odds?.[0]?.details || null;
  const ou = comp.odds?.[0]?.overUnder != null ? String(comp.odds[0].overUnder) : null;

  return {
    id: e.id,
    league,
    week: e.week?.number ? `Week ${e.week.number}` : '',
    status: statusMap[status] || 'upcoming',
    period: e.status?.type?.shortDetail || '',
    kickoff: e.date, // ISO
    home: makeTeam(home),
    away: makeTeam(away),
    score: { home: num(home?.score), away: num(away?.score) },
    spread,
    ou,
    move: null, // Not exposed by ESPN public endpoint; wire via a paid odds feed later.
  };
}

function makeTeam(c) {
  if (!c) return null;
  const t = c.team || {};
  const rec = c.records?.find((r) => r.type === 'total')?.summary || c.records?.[0]?.summary || '';
  const atsRec = c.records?.find((r) => r.name === 'ATS')?.summary || null; // often missing on free feed
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

function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }

/* Type sketch (JSDoc):
 * @typedef {Object} NormalizedGame
 * @property {string} id
 * @property {'nfl'|'cfb'} league
 * @property {string} week
 * @property {'live'|'upcoming'|'final'} status
 * @property {string} period
 * @property {string} kickoff
 * @property {Team} home
 * @property {Team} away
 * @property {{home:number,away:number}} score
 * @property {string|null} spread
 * @property {string|null} ou
 * @property {string|null} move
 */
