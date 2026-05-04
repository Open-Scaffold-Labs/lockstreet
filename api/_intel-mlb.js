/**
 * MLB intel — statsapi.mlb.com (official, free, no auth).
 * Folded out of api/team-intel.js to keep that file under Vercel's
 * silent per-function size threshold.
 */

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const MLB_TEAM_IDS = {
  ARI:109, ATL:144, BAL:110, BOS:111, CHC:112, CWS:145, CIN:113, CLE:114,
  COL:115, DET:116, HOU:117, KC:118, LAA:108, LAD:119, MIA:146, MIL:158,
  MIN:142, NYM:121, NYY:147, OAK:133, PHI:143, PIT:134, SD:135, SF:137,
  SEA:136, STL:138, TB:139, TEX:140, TOR:141, WSH:120, WAS:120, ATH:133,
};

const empty = () => ({ offRank: null, defRank: null, offValue: null, defValue: null,
  offLabel: '', defLabel: '', last10: null, source: 'none' });

export async function fetchMlb(abbr) {
  const tid = MLB_TEAM_IDS[(abbr || '').toUpperCase()];
  if (!tid) return empty();
  const yr = new Date().getFullYear();

  const stRes = await fetch(`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${yr}&standingsType=regularSeason`, { headers: BROWSER_HEADERS });
  if (!stRes.ok) throw new Error(`mlb standings ${stRes.status}`);
  const stJson = await stRes.json();
  let myEntry = null;
  for (const rec of stJson?.records || []) {
    for (const tr of rec.teamRecords || []) if (tr.team?.id === tid) myEntry = tr;
  }
  let last10 = null;
  if (myEntry) {
    const splits = myEntry.records?.splitRecords || [];
    const l10 = splits.find((s) => s.type === 'lastTen');
    if (l10) last10 = { wins: l10.wins, losses: l10.losses, pushes: 0 };
  }

  let offRank = null, defRank = null, offValue = null, defValue = null;
  const sRes = await fetch(`https://statsapi.mlb.com/api/v1/teams/${tid}/stats?stats=season&group=hitting,pitching&season=${yr}`, { headers: BROWSER_HEADERS });
  if (sRes.ok) {
    const sJson = await sRes.json();
    const hit = (sJson.stats || []).find((s) => s.group?.displayName === 'hitting');
    const pit = (sJson.stats || []).find((s) => s.group?.displayName === 'pitching');
    const hitStat = hit?.splits?.[0]?.stat;
    const pitStat = pit?.splits?.[0]?.stat;
    if (hitStat) {
      const games = Number(hitStat.gamesPlayed) || 1;
      const runs = Number(hitStat.runs) || 0;
      offValue = (runs / games).toFixed(2);
    }
    if (pitStat) defValue = String(pitStat.era ?? '').replace(/^\./, '0.');
  }
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
        id: s.team?.id, era: Number(s.stat?.era) || 99,
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
