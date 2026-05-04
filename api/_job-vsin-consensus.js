/**
 * VSiN consensus job — folded out of api/refresh-public-betting.js.
 * Daily 8am ET cron writes to public.consensus_picks via service role.
 * Multiplexed in main router behind ?job=consensus.
 */

const VSIN_URL = 'https://data.vsin.com/betting-splits/';
const SPORT_FROM_CODE = {
  NFL: 'nfl', NCAAF: 'cfb', CFB: 'cfb', MLB: 'mlb', NBA: 'nba',
  CBB: 'cbb', NHL: 'nhl', WNBA: 'wnba', UFL: 'ufl',
};
const TR_RE = /<tr[^>]*class="[^"]*sp-row[^"]*sp-game-final[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;

function parseNumberOrNullV(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/[^\d.\-+]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function parseAmericanOddsV(s) {
  if (s == null) return null;
  const n = parseNumberOrNullV(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function decodeEntitiesV(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function parseVsin(html) {
  const rows = [];
  let match;
  while ((match = TR_RE.exec(html)) !== null) {
    const inner = match[1];
    const gc = inner.match(/data-gamecode="([^"]+)"/);
    const team = inner.match(/class="sp-team-link"[^>]*>([^<]+)<\/a>/);
    if (!gc || !team) continue;
    const game_code = gc[1];
    const teamName = decodeEntitiesV(team[1].trim());
    const sportToken = (game_code.match(/^\d{8}([A-Z]+)/) || [])[1];
    const sport = SPORT_FROM_CODE[sportToken] || sportToken?.toLowerCase() || 'unknown';
    const lines = Array.from(inner.matchAll(/class="sp-badge sp-badge-line"[^>]*>([^<]+)<\/span>/g))
      .map((m) => m[1].trim());
    const pcts = Array.from(inner.matchAll(/class="sp-badge[^"]*"[^>]*>(\d+)%<\/span>/g))
      .map((m) => Number(m[1]));
    rows.push({
      sport, book: 'consensus', game_code, team: teamName,
      opponent: null, is_home: null,
      spread:           parseNumberOrNullV(lines[0]),
      spread_handle_pct: pcts[0] ?? null,
      spread_bet_pct:    pcts[1] ?? null,
      total_line:       parseNumberOrNullV(lines[1]),
      total_handle_pct: pcts[2] ?? null,
      total_bet_pct:    pcts[3] ?? null,
      ml:               parseAmericanOddsV(lines[2]),
      ml_handle_pct:    pcts[4] ?? null,
      ml_bet_pct:       pcts[5] ?? null,
    });
  }
  return rows;
}

export async function runConsensusJob(req, res) {
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    return res.status(503).json({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set' });
  }
  let html;
  try {
    const r = await fetch(VSIN_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; node-fetch)' } });
    if (!r.ok) return res.status(502).json({ error: `Source returned ${r.status}` });
    html = await r.text();
  } catch (e) {
    return res.status(502).json({ error: 'Source fetch failed', detail: String(e.message || e) });
  }

  let rows;
  try { rows = parseVsin(html); }
  catch (e) { return res.status(500).json({ error: 'Parse failed', detail: String(e.message || e) }); }

  if (!rows.length) {
    return res.status(200).json({ rowsParsed: 0, written: 0, note: 'No rows parsed.' });
  }

  const byGame = new Map();
  for (const r of rows) {
    if (!r.game_code) continue;
    const arr = byGame.get(r.game_code) || [];
    arr.push(r);
    byGame.set(r.game_code, arr);
  }
  const enriched = [];
  for (const [, pair] of byGame) {
    if (pair.length === 2) {
      pair[0].is_home = false; pair[1].is_home = true;
      pair[0].opponent = pair[1].team; pair[1].opponent = pair[0].team;
    }
    enriched.push(...pair);
  }

  let written = 0;
  try {
    const ins = await fetch(`${supaUrl}/rest/v1/consensus_picks?on_conflict=sport,book,game_code,team`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        supaKey,
        'Authorization': `Bearer ${supaKey}`,
        'Prefer':        'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(enriched),
    });
    if (!ins.ok) {
      const txt = await ins.text();
      return res.status(502).json({ error: 'Upsert failed', status: ins.status, detail: txt.slice(0, 500) });
    }
    const insJson = await ins.json();
    written = Array.isArray(insJson) ? insJson.length : 0;
  } catch (e) {
    return res.status(502).json({ error: 'Upsert exception', detail: String(e.message || e) });
  }

  res.status(200).json({
    rowsParsed: rows.length, gamesPaired: byGame.size, written,
    fetchedAt: new Date().toISOString(),
  });
}
