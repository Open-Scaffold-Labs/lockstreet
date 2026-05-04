/**
 * Fetch public betting % (bets % + money %) from Action Network and write to
 * Supabase public_betting table. Triggered by GitHub Actions cron (every 10
 * min). Heavily skipped — getScrapeLevel() decides whether to actually run
 * based on day-of-week + time-of-day in ET. Most invocations exit immediately.
 *
 * Data source: actionnetwork.com/{league}/odds — parses __NEXT_DATA__ JSON
 * (server-rendered, no JS execution needed). One page fetch per league instead
 * of N fetches for N games. Replaced SAO scraper 2026-05-03 after SAO moved
 * betting splits to client-side JS (BAM component system).
 *
 * Auth: x-cron-secret header must match CRON_SECRET env var.
 *
 * Manual trigger (admin testing):  curl -X POST -H "x-cron-secret: <SECRET>" \
 *   https://lockstreet.vercel.app/api/refresh-public-betting?force=1
 */

import { adminClient, serverError } from './_utils.js';

const AN_BASE = 'https://www.actionnetwork.com';
const AN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
// Lockstreet league code → Action Network URL path segment
const AN_LEAGUE_PATH = {
  nba: 'nba', nhl: 'nhl', mlb: 'mlb', nfl: 'nfl', cfb: 'college-football',
};
const LEAGUES = ['nba', 'nhl', 'mlb', 'nfl', 'cfb'];

export default async function handler(req, res) {
  // Multiplexed cron handler. ?job=public-betting (default) | consensus
  // — keeps us under Vercel Hobby's 12-fn cap. Auth accepts either
  // x-cron-secret header (for /api/refresh-public-betting style calls) or
  // an Authorization: Bearer token (legacy refresh-consensus call shape).
  const sentSecret = req.headers['x-cron-secret']
    || (req.headers.authorization || '').replace(/^Bearer\s+/, '')
    || req.query?.secret;
  if (!sentSecret || sentSecret !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const job = req.query?.job || 'public-betting';
  if (job === 'consensus')         return runConsensusJob(req, res);
  if (job === 'grade-user-picks')  return runGradeUserPicksJob(req, res);

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
      const rows = await fetchLeagueRows(league);
      summary.runs.push({ league, games: rows.length });
      for (const row of rows) {
        if (!row.away_label || !row.home_label) {
          summary.errors.push({ league, id: row.external_id, error: 'missing team labels' });
          continue;
        }
        const { error } = await supa.from('public_betting').upsert(row, { onConflict: 'source,external_id' });
        if (error) summary.errors.push({ league, id: row.external_id, error: error.message });
        else summary.totalUpserts++;
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
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const minute = Number(parts.minute);

  // ----- Football peaks (every 10 min within window) -----
  const footballPeak =
    (dow === 0 && [12, 15, 19, 20].includes(hour)) ||
    (dow === 6 && [11, 15, 19].includes(hour)) ||
    ((dow === 4 || dow === 1) && [19, 20].includes(hour));
  if (footballPeak) return 'peak';

  // ----- NBA/NHL/MLB peak window: 6pm–10pm ET, every 10 min.
  //       Most weeknight games tip off in this band; we want fresh data
  //       in the hour leading up to + first ~30 min of each game. -----
  if (hour >= 18 && hour <= 22) return 'peak';

  // ----- Game-day off-peak: every 2 hr while games could be in progress. -----
  if (hour >= 9 && hour <= 23 && (hour % 2 === 0) && minute < 5) return 'normal';

  // ----- Anywhere else: scrape twice a day at noon and 6pm to keep the
  //       team Last 10 ATS reasonably fresh even on off days. -----
  if ((hour === 12 || hour === 18) && minute < 5) return 'normal';

  return 'skip';
}

/**
 * Fetch one league's games + public betting splits from Action Network.
 * Parses __NEXT_DATA__ (server-rendered JSON) — no JS execution needed.
 * Returns one DB row per game, ready to upsert into public_betting.
 *
 * Book priority: book 15 first (DraftKings consensus on AN), then any
 * book that has non-zero spread bet_info. Falls back gracefully to null
 * fields if a market has no data (e.g., early lines, no handle yet).
 */
async function fetchLeagueRows(league) {
  const path = AN_LEAGUE_PATH[league];
  if (!path) return [];

  const url = `${AN_BASE}/${path}/odds`;
  const r = await fetch(url, { headers: AN_HEADERS });
  if (!r.ok) throw new Error(`AN ${league} ${r.status}`);
  const html = await r.text();

  const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.+?)<\/script>/s);
  if (!ndMatch) throw new Error(`No __NEXT_DATA__ on ${url}`);
  const nd = JSON.parse(ndMatch[1]);
  const games = nd?.props?.pageProps?.scoreboardResponse?.games || [];

  const now = new Date().toISOString();
  return games.map((game) => {
    // Build team lookup by id
    const teamById = {};
    for (const t of (game.teams || [])) teamById[t.id] = t;
    const away = teamById[game.away_team_id] || {};
    const home = teamById[game.home_team_id] || {};

    // Find market data — prefer book 15, fall back to first book with data.
    const markets = game.markets || {};
    const bookIds = ['15', ...Object.keys(markets).filter(b => b !== '15')];

    let spreadRow = null, mlRow = null, totalRow = null;
    for (const bookId of bookIds) {
      const bm = markets[bookId]?.event;
      if (!bm) continue;

      if (!spreadRow) {
        const homeEntry = (bm.spread || []).find(e => e.side === 'home');
        const awayEntry = (bm.spread || []).find(e => e.side === 'away');
        if (homeEntry?.bet_info?.tickets?.percent != null) {
          spreadRow = {
            spread_home_line:      homeEntry.value ?? null,
            spread_home_pct_bets:  homeEntry.bet_info.tickets.percent,
            spread_home_pct_money: homeEntry.bet_info.money?.percent ?? null,
          };
        }
      }

      if (!mlRow) {
        const homeEntry = (bm.moneyline || []).find(e => e.side === 'home');
        if (homeEntry?.bet_info?.tickets?.percent != null) {
          mlRow = {
            ml_home_pct_bets:  homeEntry.bet_info.tickets.percent,
            ml_home_pct_money: homeEntry.bet_info.money?.percent ?? null,
          };
        }
      }

      if (!totalRow) {
        const overEntry = (bm.total || []).find(e => e.side === 'over');
        if (overEntry?.bet_info?.tickets?.percent != null) {
          totalRow = {
            total_line:           overEntry.value ?? null,
            total_over_pct_bets:  overEntry.bet_info.tickets.percent,
            total_over_pct_money: overEntry.bet_info.money?.percent ?? null,
          };
        }
      }

      if (spreadRow && mlRow && totalRow) break;
    }

    return {
      source:      'actionnetwork',
      league,
      external_id: String(game.id),
      slug:        `${away.url_slug || 'away'}-vs-${home.url_slug || 'home'}`,
      away_label:  away.abbr || away.display_name || null,
      home_label:  home.abbr || home.display_name || null,
      spread_home_line:      spreadRow?.spread_home_line      ?? null,
      spread_home_pct_bets:  spreadRow?.spread_home_pct_bets  ?? null,
      spread_home_pct_money: spreadRow?.spread_home_pct_money ?? null,
      ml_home_pct_bets:      mlRow?.ml_home_pct_bets          ?? null,
      ml_home_pct_money:     mlRow?.ml_home_pct_money         ?? null,
      total_line:            totalRow?.total_line              ?? null,
      total_over_pct_bets:   totalRow?.total_over_pct_bets    ?? null,
      total_over_pct_money:  totalRow?.total_over_pct_money   ?? null,
      // Last-10 ATS/SU no longer available without SAO; null until a new
      // source is wired. The team-intel endpoint still serves per-team
      // Last 10 SU via ESPN schedule for the game-detail page.
      away_last_10_ats_pct: null,
      away_last_10_su_pct:  null,
      home_last_10_ats_pct: null,
      home_last_10_su_pct:  null,
      fetched_at: now,
    };
  });
}

// ====================================================================
// CONSENSUS scraper (VSiN) — folded in from the deprecated /api/refresh-
// consensus endpoint. Same daily 8am ET cron, same auth shape (Bearer
// token); writes to public.consensus_picks via service role. Multiplexed
// behind ?job=consensus.
// ====================================================================

const VSIN_URL = 'https://data.vsin.com/betting-splits/';
const SPORT_FROM_CODE = {
  NFL: 'nfl', NCAAF: 'cfb', CFB: 'cfb', MLB: 'mlb', NBA: 'nba',
  CBB: 'cbb', NHL: 'nhl', WNBA: 'wnba', UFL: 'ufl',
};

async function runConsensusJob(req, res) {
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

  // Pair rows by game_code
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

const TR_RE = /<tr[^>]*class="[^"]*sp-row[^"]*sp-game-final[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;

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

// ====================================================================
// USER-PICK grader — multiplexed behind ?job=grade-user-picks.
// Pulls every pending row whose kickoff is more than 4 hours ago, looks
// up the ESPN final score, computes win/loss/push, writes back via the
// service-role client. Then refreshes the leaderboard materialized
// view so the /leaderboard page stays current.
// ====================================================================

const ESPN_SPORT_PATH = {
  nfl: 'football/nfl',
  cfb: 'football/college-football',
  cbb: 'basketball/mens-college-basketball',
  nba: 'basketball/nba',
  mlb: 'baseball/mlb',
  nhl: 'hockey/nhl',
};

async function runGradeUserPicksJob(req, res) {
  const supa = adminClient();
  if (!supa) return serverError(res, new Error('SUPABASE_SERVICE_ROLE_KEY missing'));

  // Pull due-for-grading picks. 4 hour kickoff buffer covers final-score
  // restatements and slow MLB/NHL endings without grading mid-game.
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: pending, error: pErr } = await supa
    .from('user_picks')
    .select('id, league, game_id, bet_type, side, line_at_pick, units')
    .eq('result', 'pending')
    .lt('kickoff_at', fourHoursAgo)
    .limit(500);
  if (pErr) return serverError(res, pErr);

  // Group by (league, game_id) so we hit ESPN once per unique game.
  const byGame = new Map();
  for (const p of pending || []) {
    const k = `${p.league}::${p.game_id}`;
    if (!byGame.has(k)) byGame.set(k, []);
    byGame.get(k).push(p);
  }

  const summary = {
    pending: pending?.length || 0,
    games: byGame.size,
    graded: 0,
    skipped: 0,
    errors: [],
  };

  const cache = new Map();
  for (const [key, picks] of byGame) {
    const [league, gameId] = key.split('::');
    let game;
    try {
      game = cache.has(key) ? cache.get(key) : await fetchEspnFinal(league, gameId);
      cache.set(key, game);
    } catch (e) {
      summary.errors.push({ league, gameId, error: String(e.message || e) });
      summary.skipped += picks.length;
      continue;
    }
    if (!game || !game.final) {
      summary.skipped += picks.length;
      continue;
    }
    for (const p of picks) {
      const result = decideResult(p, game);
      if (!result) { summary.skipped += 1; continue; }
      const { error } = await supa
        .from('user_picks')
        .update({ result, graded_at: new Date().toISOString() })
        .eq('id', p.id);
      if (error) summary.errors.push({ pickId: p.id, error: error.message });
      else summary.graded += 1;
    }
  }

  // Refresh the leaderboard. Use CONCURRENTLY so it doesn't block reads.
  // Falls back to plain refresh if the unique index isn't there yet
  // (first run after migration in some environments).
  try {
    await supa.rpc('refresh_leaderboard_window').catch(async () => {
      // No RPC defined — try raw SQL via .from.select trick won't work for refresh,
      // but service-role can call any function. The migration didn't define
      // a wrapper RPC; instead we use the PostgREST 'rpc' API after issuing
      // a direct sql via the supabase-js .schema('public').rpc() — not all
      // versions support arbitrary SQL. Best-effort fallback: leave it stale
      // and let the next cron pass refresh it. Log to summary.
      summary.errors.push({ stage: 'refresh_view', note: 'no RPC; relying on next pass' });
    });
  } catch (e) {
    summary.errors.push({ stage: 'refresh_view', error: String(e.message || e) });
  }

  return res.status(200).json(summary);
}

async function fetchEspnFinal(league, gameId) {
  const path = ESPN_SPORT_PATH[league];
  if (!path) return null;
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${encodeURIComponent(gameId)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`ESPN ${league}/${gameId} ${r.status}`);
  const j = await r.json();

  const comps = j?.header?.competitions?.[0]?.competitors || [];
  const home = comps.find((c) => c.homeAway === 'home');
  const away = comps.find((c) => c.homeAway === 'away');
  const status = j?.header?.competitions?.[0]?.status?.type || j?.header?.status?.type;
  const final = !!status?.completed;

  return {
    final,
    homeScore: scoreNum(home?.score),
    awayScore: scoreNum(away?.score),
  };
}

function scoreNum(s) {
  if (s == null) return null;
  // ESPN sometimes returns {value, displayValue} objects on schedule events.
  if (typeof s === 'object') return Number(s.value ?? s.displayValue);
  return Number(s);
}

function decideResult(pick, game) {
  const h = Number(game.homeScore);
  const a = Number(game.awayScore);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;

  if (pick.bet_type === 'ml') {
    if (h === a) return 'push';
    const homeWon = h > a;
    if (pick.side === 'home') return homeWon ? 'win'  : 'loss';
    if (pick.side === 'away') return homeWon ? 'loss' : 'win';
    return null;
  }

  if (pick.bet_type === 'spread' && pick.line_at_pick != null) {
    // line_at_pick is from the user's perspective on their side.
    // For 'home -3.5', side='home', line_at_pick=-3.5: home covers if h+(-3.5) > a → h-a > 3.5
    // For 'away +3.5', side='away', line_at_pick=+3.5: away covers if a+3.5 > h → a-h > -3.5
    const line = Number(pick.line_at_pick);
    let margin;
    if (pick.side === 'home') margin = (h + line) - a;
    else if (pick.side === 'away') margin = (a + line) - h;
    else return null;
    if (margin === 0) return 'push';
    return margin > 0 ? 'win' : 'loss';
  }

  if (pick.bet_type === 'total' && pick.line_at_pick != null) {
    const total = h + a;
    const line = Number(pick.line_at_pick);
    if (total === line) return 'push';
    const went = total > line ? 'over' : 'under';
    return pick.side === went ? 'win' : 'loss';
  }
  return null;
}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          