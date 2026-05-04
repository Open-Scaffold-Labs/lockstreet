/**
 * SAO consensus-picks scraper. Fetches one HTML page per league:
 *   https://www.scoresandodds.com/{league}/consensus-picks
 *
 * Each page renders 3 trend-cards per game (moneyline / spread / total)
 * arranged consecutively in the DOM. Cards have classes like:
 *   trend-card consensus consensus-table-{market}--0
 * and inside each: trend-graph-sides (away/home labels) + 4 percentage
 * spans (bets-a, bets-b, money-a, money-b).
 *
 * Why this URL: SAO migrated per-game pages to client-rendered (BAM) on
 * May 3, 2026, breaking the original per-game scraper. The consensus-picks
 * page stayed server-rendered and contains all data in one fetch — fewer
 * requests than the original (1 per league instead of N per league),
 * AND fewer than the Action Network fallback we briefly used.
 */

const SAO_BASE = 'https://www.scoresandodds.com';
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Fetch one league's games + public betting splits from SAO consensus
 * picks page. Returns one DB row per game in the same shape the old
 * scraper produced, ready for upsert.
 */
export async function fetchLeagueRowsSao(league) {
  const url = `${SAO_BASE}/${league}/consensus-picks`;
  const r = await fetch(url, { headers: BROWSER_HEADERS });
  if (!r.ok) throw new Error(`SAO ${league} ${r.status}`);
  const html = await r.text();

  // Find each card's start position by its class anchor. Cards are siblings
  // inside .container-body.grid in source order: ML / spread / total per
  // game. We slice each card from its anchor to the start of the next
  // anchor (or end of HTML).
  const anchorRe = /<div\s+class="trend-card[^"]*consensus-table-(moneyline|spread|total)--\d+/g;
  const anchors = [];
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    anchors.push({ market: m[1], start: m.index });
  }
  const cards = anchors.map((a, i) => ({
    market: a.market,
    html: html.slice(a.start, i + 1 < anchors.length ? anchors[i + 1].start : html.length),
  }));

  // Group in triples per game. We expect strict ML/spread/total order,
  // but defensive code: skip any group whose markets don't match expected.
  const games = [];
  for (let i = 0; i < cards.length; i += 3) {
    const ml = cards[i];
    const sp = cards[i + 1];
    const tot = cards[i + 2];
    if (!ml || !sp || !tot) break;
    if (ml.market !== 'moneyline' || sp.market !== 'spread' || tot.market !== 'total') continue;
    games.push({ ml: ml.html, spread: sp.html, total: tot.html });
  }

  // Pull per-game URL slugs from the consensus-picks page in source order.
  // Pattern: href="/{league}/{away}-vs-{home}". One slug per game card —
  // we'll match positionally to the games array above.
  const slugRe = new RegExp(`href="/${league}/([a-z0-9]+(?:-[a-z0-9]+)*-vs-[a-z0-9]+(?:-[a-z0-9]+)*)"`, 'g');
  const slugSet = new Set();
  const slugs = [];
  while ((m = slugRe.exec(html)) !== null) {
    if (slugSet.has(m[1])) continue;
    slugSet.add(m[1]);
    slugs.push(m[1]);
  }

  const now = new Date().toISOString();
  const rows = games.map((g, idx) => buildRow(league, g, idx, now)).filter(Boolean);

  // Per-game page fetch fans out in parallel. Each per-game page is ~1.5MB
  // and contains Last 10 SU/ATS for both teams in `home-current-trends` /
  // `away-current-trends` data-* attributes (server-rendered, unlike the
  // betting-splits widgets which migrated to BAM). One fetch per matchup
  // adds N parallel network calls per league but stays well under the 50+
  // requests of the original scraper. ATS data is the only reason for this
  // layer — without it /game/:gameId team-preview Last 10 cards go blank.
  const trends = await Promise.all(rows.map(async (row, i) => {
    const slug = slugs[i];
    if (!slug) return null;
    try {
      return await fetchGameLast10(league, slug);
    } catch { return null; }
  }));
  for (let i = 0; i < rows.length; i++) {
    const tr = trends[i];
    if (!tr) continue;
    rows[i].away_last_10_ats_pct = tr.away?.atsPct ?? null;
    rows[i].away_last_10_su_pct  = tr.away?.suPct  ?? null;
    rows[i].home_last_10_ats_pct = tr.home?.atsPct ?? null;
    rows[i].home_last_10_su_pct  = tr.home?.suPct  ?? null;
  }
  return rows;
}

/**
 * Fetch one per-game page and extract Last 10 SU/ATS for both teams from
 * the trend tables. Returns { away: {suPct, atsPct}, home: {...} } where
 * percentages are 0-1 fractions (matching SAO's data-wins/data-spread shape).
 */
async function fetchGameLast10(league, slug) {
  const url = `${SAO_BASE}/${league}/${slug}`;
  const r = await fetch(url, { headers: BROWSER_HEADERS });
  if (!r.ok) return null;
  const html = await r.text();
  return {
    away: pullLast10(html, 'away-current-trends'),
    home: pullLast10(html, 'home-current-trends'),
  };
}

function pullLast10(html, anchor) {
  const idx = html.indexOf(anchor);
  if (idx < 0) return null;
  const tail = html.slice(idx);
  // Find the <tr> that has the "Last 10 Games" cell. The <tr> attributes
  // carry data-wins (SU pct, 0-1) and data-spread (ATS pct, 0-1).
  const rowRe = /<tr\s+([^>]*)>\s*<td[^>]*>\s*Last 10 Games\s*<\/td>/;
  const m = tail.match(rowRe);
  if (!m) return null;
  const attrs = m[1];
  const wM = attrs.match(/data-wins="([\d.]+)"/);
  const sM = attrs.match(/data-spread="([\d.]+)"/);
  return {
    suPct:  wM ? Number(wM[1]) : null,
    atsPct: sM ? Number(sM[1]) : null,
  };
}

function buildRow(league, g, idx, now) {
  const mlSides   = parseSides(g.ml);
  const spSides   = parseSides(g.spread);
  const totSides  = parseSides(g.total);
  if (!mlSides || !mlSides.away || !mlSides.home) return null;

  const awayLabel = stripParens(mlSides.away);
  const homeLabel = stripParens(mlSides.home);
  const spreadLine = parseSpreadLine(spSides?.home);
  const totalLine  = parseTotalLine(totSides?.away);

  const mlPcts  = parsePcts(g.ml);
  const spPcts  = parsePcts(g.spread);
  const totPcts = parsePcts(g.total);

  // External ID: stable per (league, away, home) since SAO doesn't
  // expose a numeric game id on the consensus page. The DB's unique
  // constraint is (source, external_id), so collisions across days are
  // fine (same matchup → upsert refreshes the row).
  const external_id = `${league}-${awayLabel}-${homeLabel}`;

  return {
    source:      'scoresandodds',
    league,
    external_id,
    slug:        `${awayLabel.toLowerCase()}-vs-${homeLabel.toLowerCase()}`,
    away_label:  awayLabel,
    home_label:  homeLabel,
    spread_home_line:      spreadLine,
    spread_home_pct_bets:  spPcts?.bets?.b  ?? null,
    spread_home_pct_money: spPcts?.money?.b ?? null,
    ml_home_pct_bets:      mlPcts?.bets?.b  ?? null,
    ml_home_pct_money:     mlPcts?.money?.b ?? null,
    total_line:            totalLine,
    total_over_pct_bets:   totPcts?.bets?.a   ?? null,
    total_over_pct_money:  totPcts?.money?.a  ?? null,
    away_last_10_ats_pct: null,
    away_last_10_su_pct:  null,
    home_last_10_ats_pct: null,
    home_last_10_su_pct:  null,
    fetched_at: now,
  };
}

/**
 * Pull two `<strong>` blocks inside `.trend-graph-sides`. First is the
 * left/away side, second is the right/home side. Both for moneyline
 * (just abbr), spread (e.g. "NYM (-1.5)"), and total (e.g. "Over (o10.5)").
 */
function parseSides(cardHtml) {
  const m = cardHtml.match(/trend-graph-sides[^>]*>\s*<strong>([\s\S]*?)<\/strong>[\s\S]*?<strong>([\s\S]*?)<\/strong>/);
  if (!m) return null;
  return { away: clean(m[1]), home: clean(m[2]) };
}

/**
 * Pull 4 percentages per card. SAO renders two `.trend-graph-percentage`
 * blocks per card: first is "% of Bets", second is "% of Money". Each
 * has `.percentage-a` (left/away or over) and `.percentage-b` (right/home
 * or under) span.
 */
function parsePcts(cardHtml) {
  const re = /<span class="trend-graph-percentage"[^>]*>([\s\S]*?)<\/span>\s*<\/span>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(cardHtml)) !== null) blocks.push(m[1]);
  function inner(html) {
    if (!html) return null;
    const a = html.match(/percentage-a"[^>]*>(\d+)%/);
    const b = html.match(/percentage-b"[^>]*>(\d+)%/);
    return {
      a: a ? Number(a[1]) : null,
      b: b ? Number(b[1]) : null,
    };
  }
  return {
    bets:  inner(blocks[0]),
    money: inner(blocks[1]),
  };
}

function clean(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
function stripParens(s) {
  return String(s).replace(/\s*\([^)]*\)\s*/g, '').trim();
}
function parseSpreadLine(homeLabel) {
  // "COL (+1.5)" -> 1.5
  if (!homeLabel) return null;
  const m = String(homeLabel).match(/\(([+-]?\d+(?:\.\d)?)\)/);
  return m ? Number(m[1]) : null;
}
function parseTotalLine(overLabel) {
  // "Over (o10.5)" -> 10.5
  if (!overLabel) return null;
  const m = String(overLabel).match(/o(\d+(?:\.\d)?)/i);
  return m ? Number(m[1]) : null;
}
