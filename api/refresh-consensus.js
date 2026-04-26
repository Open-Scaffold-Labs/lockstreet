// Daily scraper for public-betting consensus splits.
// Source: VSiN (data.vsin.com/betting-splits) — free-to-view stopgap.
// Triggered at 8am ET by .github/workflows/refresh-consensus.yml via
// GitHub Actions cron. Writes to public.consensus_picks via Supabase
// service role.
//
// Env vars required:
//   CRON_SECRET                 — shared secret with the cron caller
//   SUPABASE_URL                — same as our other server endpoints
//   SUPABASE_SERVICE_ROLE_KEY   — bypasses RLS for inserts
//
// Once subscriber revenue exists, swap this for a paid feed (OddsJam etc.).

const VSIN_URL = 'https://data.vsin.com/betting-splits/';

// VSiN gamecode pattern: 20260425NBA00082 → embeds the sport prefix.
const SPORT_FROM_CODE = {
  NFL:   'nfl',
  NCAAF: 'cfb',
  CFB:   'cfb',
  MLB:   'mlb',
  NBA:   'nba',
  CBB:   'cbb',
  NHL:   'nhl',
  WNBA:  'wnba',
  UFL:   'ufl',
};

export default async function handler(req, res) {
  // Auth — require Bearer token matching CRON_SECRET
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return res.status(503).json({ error: 'CRON_SECRET not set on server' });
  }
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Supabase service-role client (bypasses RLS)
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    return res.status(503).json({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set' });
  }

  let html;
  try {
    const r = await fetch(VSIN_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; node-fetch)' },
    });
    if (!r.ok) return res.status(502).json({ error: `Source returned ${r.status}` });
    html = await r.text();
  } catch (e) {
    return res.status(502).json({ error: 'Source fetch failed', detail: String(e.message || e) });
  }

  let rows;
  try {
    rows = parseVsin(html);
  } catch (e) {
    return res.status(500).json({ error: 'Parse failed', detail: String(e.message || e) });
  }

  if (rows.length === 0) {
    return res.status(200).json({ rowsParsed: 0, written: 0, note: 'No rows parsed — page structure may have changed.' });
  }

  // Pair rows by game_code: away/home flag + opponent fill-in
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
      // First row is conventionally the away team in VSiN's table layout
      pair[0].is_home  = false;
      pair[1].is_home  = true;
      pair[0].opponent = pair[1].team;
      pair[1].opponent = pair[0].team;
    }
    enriched.push(...pair);
  }

  // Upsert via REST (avoid pulling in @supabase/supabase-js)
  const insertUrl = `${supaUrl}/rest/v1/consensus_picks?on_conflict=sport,book,game_code,team`;
  let written = 0;
  try {
    const ins = await fetch(insertUrl, {
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
    rowsParsed: rows.length,
    gamesPaired: byGame.size,
    written,
    fetchedAt: new Date().toISOString(),
  });
}

// =============================================================
// Parser — extracts <tr class="sp-row sp-game-final"> blocks
// =============================================================

const TR_RE = /<tr[^>]*class="[^"]*sp-row[^"]*sp-game-final[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;

// Inside each row:
//   data-gamecode="20260425NBA00082"  (on a button or img)
//   class="sp-team-link">{team name}</a>
//   class="sp-badge sp-badge-line">{spread or total or ML number}</span>
//   class="sp-badge">{percent like "56%"}</span>  ← multiple, in order
function parseVsin(html) {
  const rows = [];
  let match;
  while ((match = TR_RE.exec(html)) !== null) {
    const inner = match[1];
    const gc = inner.match(/data-gamecode="([^"]+)"/);
    const team = inner.match(/class="sp-team-link"[^>]*>([^<]+)<\/a>/);
    if (!gc || !team) continue;

    const game_code = gc[1];
    const teamName = decodeEntities(team[1].trim());

    // Sport prefix from gamecode (chars after the 8-char date)
    const sportToken = (game_code.match(/^\d{8}([A-Z]+)/) || [])[1];
    const sport = SPORT_FROM_CODE[sportToken] || sportToken?.toLowerCase() || 'unknown';

    // Lines (spread / total / ML — three of them, in order)
    const lines = Array.from(inner.matchAll(/class="sp-badge sp-badge-line"[^>]*>([^<]+)<\/span>/g))
      .map((m) => m[1].trim());

    // Percentages (six of them — handle/bet for each of spread/total/ml).
    // VSiN highlights the leading side with extra classes like
    // `sp-badge sp-badge-green` — so we match any class that STARTS with
    // sp-badge (not just exactly sp-badge). Excludes line spans because
    // their content is the line value (e.g. "-1.5"), not "<digits>%".
    const pcts = Array.from(inner.matchAll(/class="sp-badge[^"]*"[^>]*>(\d+)%<\/span>/g))
      .map((m) => Number(m[1]));

    rows.push({
      sport,
      book: 'consensus',
      game_code,
      team: teamName,
      opponent: null,
      is_home: null,
      spread:           parseNumberOrNull(lines[0]),
      spread_handle_pct: pcts[0] ?? null,
      spread_bet_pct:    pcts[1] ?? null,
      total_line:       parseNumberOrNull(lines[1]),
      total_handle_pct: pcts[2] ?? null,
      total_bet_pct:    pcts[3] ?? null,
      ml:               parseAmericanOdds(lines[2]),
      ml_handle_pct:    pcts[4] ?? null,
      ml_bet_pct:       pcts[5] ?? null,
    });
  }
  return rows;
}

function parseNumberOrNull(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/[^\d.\-+]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function parseAmericanOdds(s) {
  if (s == null) return null;
  const n = parseNumberOrNull(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
