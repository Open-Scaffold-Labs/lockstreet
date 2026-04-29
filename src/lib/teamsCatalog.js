/**
 * Pre-baked team catalog served as a static JSON file from /public.
 * Built via scripts/build-teams.mjs (one-shot; re-run if leagues change).
 *
 * Why a static file vs runtime ESPN fetch?
 *   - ESPN's site.api blocks browser CORS.
 *   - The /api/team-intel proxy works in production (Vercel) but not
 *     under plain Vite locally.
 *   - A static JSON works in both, loads instantly, no CORS issues.
 *
 * Returns objects of shape:
 *   { abbr, name, shortName, league, logo, id }
 */

const CATALOG_URL = '/teams-catalog.json';
let cached = null; // Promise<Array>

function loadCatalog() {
  if (cached) return cached;
  cached = (async () => {
    try {
      // 'no-cache' forces a conditional GET (If-Modified-Since) so the
      // browser revalidates rather than serving a stale copy after we
      // regenerate via scripts/build-teams.mjs. Once Vite/Vercel send a
      // 304 the in-memory `cached` Promise prevents re-hitting the
      // network for the rest of the session.
      const r = await fetch(CATALOG_URL, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`teams-catalog ${r.status}`);
      const j = await r.json();
      return Array.isArray(j?.teams) ? j.teams : [];
    } catch {
      return [];
    }
  })();
  return cached;
}

/** All teams across all six sports. */
export async function fetchAllTeams() {
  return loadCatalog();
}

/** Teams for one league. */
export async function fetchTeams(league) {
  const lg = String(league || '').toLowerCase();
  const all = await loadCatalog();
  return all.filter((t) => t.league === lg);
}

/** Look up one team by (abbr, league). Returns null if catalog hasn't
 *  loaded yet OR no match. Async-loaded callers should use this within
 *  an effect; sync callers can use lookupTeamSync (returns null until
 *  catalog is in memory). */
export async function lookupTeam(abbr, league) {
  const lg = String(league || '').toLowerCase();
  const a = String(abbr || '').toUpperCase();
  if (!lg || !a) return null;
  const all = await loadCatalog();
  return all.find((t) => t.abbr === a && t.league === lg) || null;
}

/**
 * Filter a team list against a search query. Matches on abbr (exact /
 * starts-with), name (substring), shortName (substring). Returns
 * results ranked by match strength.
 */
export function searchTeams(teams, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const t of teams) {
    const a = (t.abbr || '').toLowerCase();
    const n = (t.name || '').toLowerCase();
    const s = (t.shortName || '').toLowerCase();
    let score = 0;
    if (a === q) score = 1000;
    else if (a.startsWith(q)) score = 800;
    else if (n.startsWith(q)) score = 600;
    else if (s.startsWith(q)) score = 500;
    else if (n.includes(' ' + q)) score = 400;
    else if (n.includes(q)) score = 300;
    else if (s.includes(q)) score = 200;
    else if (a.includes(q)) score = 100;
    if (score > 0) scored.push({ t, score });
  }
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, 25).map((r) => r.t);
}
