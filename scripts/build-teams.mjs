/**
 * Generate public/teams-catalog.json from ESPN's per-league teams
 * endpoint. The file is fetched at runtime by lib/teamsCatalog.js and
 * powers the TeamPicker. Re-run when rosters change (e.g. an FBS team
 * is added/dropped, an NFL team relocates).
 *
 *   node scripts/build-teams.mjs
 *
 * Run from the repo root. Writes to public/teams-catalog.json.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '..', 'public', 'teams-catalog.json');

const ESPN = {
  nfl: 'football/nfl',
  cfb: 'football/college-football',
  cbb: 'basketball/mens-college-basketball',
  nba: 'basketball/nba',
  mlb: 'baseball/mlb',
  nhl: 'hockey/nhl',
};

async function fetchLeague(league, espnPath) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/teams?limit=500`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${league} ${r.status}`);
  const j = await r.json();
  const out = [];
  for (const sport of j?.sports || []) {
    for (const lg of sport?.leagues || []) {
      for (const wrap of lg?.teams || []) {
        const t = wrap?.team;
        if (!t) continue;
        const logo = t.logos?.[0]?.href || t.logo || null;
        out.push({
          id: String(t.id || ''),
          abbr: (t.abbreviation || '').toUpperCase(),
          name: t.displayName || t.name || '',
          shortName: t.shortDisplayName || t.nickname || t.name || '',
          league,
          logo,
          color:    t.color    ? '#' + t.color    : null,
          altColor: t.alternateColor ? '#' + t.alternateColor : null,
        });
      }
    }
  }
  return out;
}

const all = [];
for (const [lg, espnPath] of Object.entries(ESPN)) {
  try {
    const teams = await fetchLeague(lg, espnPath);
    process.stderr.write(`${lg}: ${teams.length}\n`);
    all.push(...teams);
  } catch (e) {
    process.stderr.write(`${lg}: FAIL ${e.message}\n`);
  }
}
all.sort((a, b) => a.name.localeCompare(b.name));

const payload = {
  generatedAt: new Date().toISOString(),
  count: all.length,
  teams: all,
};
await fs.writeFile(OUT_PATH, JSON.stringify(payload), 'utf8');
process.stderr.write(`Wrote ${OUT_PATH} (${all.length} teams)\n`);
