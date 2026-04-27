/**
 * Scrape ScoresAndOdds for public betting % (bets % + money %) and write to
 * Supabase public_betting table. Triggered by GitHub Actions cron (every 10
 * min). Heavily skipped — getScrapeLevel() decides whether to actually run
 * based on day-of-week + time-of-day in ET. Most invocations exit immediately.
 *
 * Auth: x-cron-secret header must match CRON_SECRET env var.
 *
 * Manual trigger (admin testing):  curl -X POST -H "x-cron-secret: <SECRET>" \
 *   https://lockstreet.vercel.app/api/refresh-public-betting?force=1
 */

import { adminClient, serverError } from './_utils.js';

const SAO_BASE = 'https://www.scoresandodds.com';
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const LEAGUES = ['nba', 'nhl', 'mlb', 'nfl', 'cfb'];

export default async function handler(req, res) {
  // Auth: cron secret OR query param matching env (for ad-hoc admin run)
  const sentSecret = req.headers['x-cron-secret'] || req.query?.secret;
  if (!sentSecret || sentSecret !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const force = req.query?.force === '1';
  const level = force ? 'forced' : getScrapeLevel(new Date());
  if (level === 'skip') {
    return res.status(200).json({ skipped: true, reason: 'off-window' });
  }

  const supa = adminClient();
  if (!supa) return serverError(res, new Error('SUPABASE_SERVICE_ROLE_KEY missing'));

  const summary = { level, runs: [], totalUpserts: 0, errors: [] };
  for (const league of LEAGUES) {
    try {
      const slugs = await discoverSlugs(league);
      summary.runs.push({ league, slugs: slugs.length });
      for (const slug of slugs) {
        try {
          const data = await scrapeGame(league, slug);
          if (!data) continue;
          await jitterDelay();
          const { error } = await supa.from('public_betting').upsert({
            source:       'scoresandodds',
            league,
            external_id:  data.externalId,
            slug,
            away_label:   data.awayLabel,
            home_label:   data.homeLabel,
            spread_home_line:      data.spreadHomeLine,
            spread_home_pct_bets:  data.spreadHomePctBets,
            spread_home_pct_money: data.spreadHomePctMoney,
            ml_home_pct_bets:      data.mlHomePctBets,
            ml_home_pct_money:     data.mlHomePctMoney,
            total_line:            data.totalLine,
            total_over_pct_bets:   data.totalOverPctBets,
            total_over_pct_money:  data.totalOverPctMoney,
            away_last_10_ats_pct:  data.awayLast10AtsPct,
            away_last_10_su_pct:   data.awayLast10SuPct,
            home_last_10_ats_pct:  data.homeLast10AtsPct,
            home_last_10_su_pct:   data.homeLast10SuPct,
            fetched_at: new Date().toISOString(),
          }, { onConflict: 'source,external_id' });
          if (error) summary.errors.push({ league, slug, error: error.message });
          else summary.totalUpserts++;
        } catch (e) {
          summary.errors.push({ league, slug, error: String(e?.message || e) });
        }
      }
    } catch (e) {
      summary.errors.push({ league, error: String(e?.message || e) });
    }
  }

  res.status(200).json(summary);
}

/**
 * Decide whether to scrape this invocation based on US/Eastern wall-clock.
 *
 * Football peak windows (every 10 min within these ET hour blocks):
 *   - Sunday 12:00–13:59 (early NFL window)
 *   - Sunday 15:00–16:59 (late NFL window)
 *   - Sunday 19:00–20:59 (SNF)
 *   - Saturday 11:00–11:59, 15:00–15:59, 19:00–19:59 (CFB sessions)
 *   - Thursday/Monday 19:00–20:59 (TNF/MNF)
 *
 * NBA/NHL/MLB peak: 18:00–18:59 ET daily during their seasons.
 *
 * Off-peak game days run every 2 hr (we approximate by gating on minute < 5).
 * Off days (Tue/Wed/Fri off-football) run twice daily at 12:00 and 18:00 ET.
 *
 * Returns 'peak' | 'normal' | 'skip'.
 */
function getScrapeLevel(now) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour); // some locales
  const minute = Number(parts.minute);

  // ----- Football peaks (every 10 min within window) -----
  const footballPeak =
    (dow === 0 && [12, 15, 19, 20].includes(hour)) ||                     // Sun NFL
    (dow === 6 && [11, 15, 19].includes(hour)) ||                          // Sat CFB
    ((dow === 4 || dow === 1) && [19, 20].includes(hour));                 // Thu/Mon
  if (footballPeak) return 'peak';

  // ----- NBA/NHL/MLB peak (early evening daily) -----
  if (hour === 18) return 'peak';

  // ----- Game-day off-peak (every 2 hr): align to even hours, only run on minute 0–4 -----
  const gameDay = dow === 0 || dow === 6 || dow === 4 || dow === 1; // Sun/Sat/Thu/Mon
  if (gameDay && hour >= 9 && hour <= 23 && (hour % 2 === 0) && minute < 5) return 'normal';

  // ----- Off days (Tue/Wed/Fri): twice daily -----
  if ([2, 3, 5].includes(dow) && (hour === 12 || hour === 18) && minute < 5) return 'normal';

  return 'skip';
}

async function discoverSlugs(league) {
  const url = `${SAO_BASE}/${league}`;
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`SAO ${league} listing ${res.status}`);
  const html = await res.text();
  // Match /{league}/{away}-vs-{home} short slugs only — exclude
  // SEO/prediction long-form URLs and meta pages (consensus-picks, etc).
  const re = new RegExp(`/${league}/([a-z0-9]+(?:-[a-z0-9]+)*-vs-[a-z0-9]+(?:-[a-z0-9]+)*)(?=["'])`, 'g');
  const seen = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    // Skip long-form prediction articles
    if (slug.includes('-prediction') || slug.includes('-pick-odds') || slug.includes('-game-')) continue;
    if (slug.length > 60) continue;
    seen.add(slug);
  }
  return Array.from(seen);
}

async function scrapeGame(league, slug) {
  const url = `${SAO_BASE}/${league}/${slug}`;
  await jitterDelay();
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) return null;
  const html = await res.text();
  return parseGameHtml(html);
}

/**
 * Parse a SAO game page into a normalized record. ScoresAndOdds renders
 * each market (moneyline / spread / total) inside an <li> with a class
 * `odds-table-{market}--{external_id}`. Inside each <li> there are two
 * `trend-graph-percentage` blocks — first is "% of Bets", second is
 * "% of Money" — each with `percentage-a` (left team / over) and
 * `percentage-b` (right team / under) spans.
 *
 * Page URL convention is /{league}/{away}-vs-{home}, so the LEFT team
 * across all markets is the AWAY team. We flip into a home-perspective
 * record before returning.
 */
function parseGameHtml(html) {
  // Pull the external (event) id from any odds-table-{market}--XXXXX class.
  const idMatch = html.match(/odds-table-(?:moneyline|spread|total)--(\d+)/);
  if (!idMatch) return null;
  const externalId = idMatch[1];

  // Helper: pull the percentages inside a market block.
  // Market block is an <li> ... </li> chunk identified by its class.
  function blockFor(market) {
    const re = new RegExp(`<li[^>]*class="odds-table-${market}--${externalId}[^>]*>([\\s\\S]*?)</li>`);
    const m = html.match(re);
    return m ? m[1] : null;
  }
  function pcts(block) {
    if (!block) return null;
    // Two trend-graph-percentage spans, in order: bets, money.
    const re = /<span class="trend-graph-percentage"[^>]*>([\s\S]*?)<\/span>\s*<\/span>?/g;
    const found = [];
    let m;
    while ((m = re.exec(block)) !== null) found.push(m[1]);
    function inner(html) {
      const a = html.match(/percentage-a"[^>]*>(\d+)%/);
      const b = html.match(/percentage-b"[^>]*>(\d+)%/);
      return {
        a: a ? Number(a[1]) : null,
        b: b ? Number(b[1]) : null,
      };
    }
    return {
      bets:  found[0] ? inner(found[0]) : null,
      money: found[1] ? inner(found[1]) : null,
    };
  }

  // Pull labels (away on left, home on right) from any market's
  // trend-graph-sides. Spread block has the lines parenthesized.
  function labels(block) {
    if (!block) return null;
    // Capture two <strong> blocks in trend-graph-sides
    const m = block.match(/trend-graph-sides[^>]*>\s*<strong>([\s\S]*?)<\/strong>[\s\S]*?<strong>([\s\S]*?)<\/strong>/);
    if (!m) return null;
    return { left: cleanLabel(m[1]), right: cleanLabel(m[2]) };
  }
  function cleanLabel(s) {
    return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
  function spreadFromLabel(label) {
    // 'OKC (-10.5)' -> -10.5
    const m = String(label).match(/[(]?([+-]?\d+(?:\.\d)?)[)]?\s*$/);
    return m ? Number(m[1]) : null;
  }
  function totalFromOverLabel(label) {
    // 'Over (o214.5)' -> 214.5
    const m = String(label).match(/o(\d+(?:\.\d)?)/i);
    return m ? Number(m[1]) : null;
  }

  const mlBlock     = blockFor('moneyline');
  const spreadBlock = blockFor('spread');
  const totalBlock  = blockFor('total');

  // Per-team trend tables — these contain rows like
  //   <tr data-wins="0.4" data-spread="0.3" ...> <td>Last 10 Games</td> </tr>
  // for each team. We pull the "Last 10 Games" row's wins (SU%) and
  // spread (ATS%) for both home and away.
  function pullLast10(label) {
    // label = 'home-current-trends' | 'away-current-trends'
    const sectionRe = new RegExp(`class="main\\s+${label}"[\\s\\S]*?</table>`);
    const sec = html.match(sectionRe);
    if (!sec) return null;
    const rowRe = /<tr\b([^>]*)>[\s\S]*?<td[^>]*>\s*Last 10 Games\s*<\/td>/;
    const m = sec[0].match(rowRe);
    if (!m) return null;
    const attrs = m[1];
    const wins   = (attrs.match(/data-wins="([\d.]+)"/) || [])[1];
    const spread = (attrs.match(/data-spread="([\d.]+)"/) || [])[1];
    return {
      suPct:  wins   != null ? Number(wins)   : null,
      atsPct: spread != null ? Number(spread) : null,
    };
  }
  const homeTrend = pullLast10('home-current-trends');
  const awayTrend = pullLast10('away-current-trends');

  const mlPcts     = pcts(mlBlock);
  const spreadPcts = pcts(spreadBlock);
  const totalPcts  = pcts(totalBlock);

  const mlLabels     = labels(mlBlock);     // {left: away, right: home}
  const spreadLabels = labels(spreadBlock);
  const totalLabels  = labels(totalBlock);

  const awayLabel = mlLabels?.left  || spreadLabels?.left  || null;
  const homeLabel = mlLabels?.right || spreadLabels?.right || null;
  const spreadHomeLine = spreadLabels?.right ? spreadFromLabel(spreadLabels.right) : null;
  const totalLine      = totalLabels?.left   ? totalFromOverLabel(totalLabels.left) : null;

  // SAO renders away on the LEFT (percentage-a), home on the RIGHT (percentage-b).
  // Flip into home-perspective for storage.
  return {
    externalId,
    awayLabel,
    homeLabel,
    spreadHomeLine,
    spreadHomePctBets:  spreadPcts?.bets?.b  ?? null,
    spreadHomePctMoney: spreadPcts?.money?.b ?? null,
    mlHomePctBets:      mlPcts?.bets?.b      ?? null,
    mlHomePctMoney:     mlPcts?.money?.b     ?? null,
    totalLine,
    totalOverPctBets:   totalPcts?.bets?.a   ?? null,
    totalOverPctMoney:  totalPcts?.money?.a  ?? null,
    awayLast10AtsPct:   awayTrend?.atsPct    ?? null,
    awayLast10SuPct:    awayTrend?.suPct     ?? null,
    homeLast10AtsPct:   homeTrend?.atsPct    ?? null,
    homeLast10SuPct:    homeTrend?.suPct     ?? null,
  };
}

/** Tiny random delay (50–250ms) so requests aren't perfectly clock-aligned. */
function jitterDelay() {
  const ms = 50 + Math.floor(Math.random() * 200);
  return new Promise((r) => setTimeout(r, ms));
}
