/**
 * Math + helpers for user picks.
 *
 * Convention: 1 unit = 1 unit of risk.
 *   At -110 a winning 1u pick pays 100/110 = 0.909u, a loss is -1.0u.
 *   At -120 a winning 1u pick pays 100/120 = 0.833u, a loss is -1.0u.
 *
 * The two headline numbers we expose everywhere:
 *   netUnits      - the user's actual P&L at the line/juice they took
 *   pointBuyCost  - the difference between net at posted line and net at
 *                   market line. Positive means buying half-points cost
 *                   them; negative means it paid off.
 */

/** payoff for a winning 1u pick at the given American juice (e.g. -110, -120). */
export function winPayoff(juice) {
  const j = Number(juice) || -110;
  return 100 / Math.abs(j);
}

/** Net units P&L for a single graded pick at its locked-in line/juice. */
export function pickNetUnits(p) {
  const u = Number(p.units) || 0;
  if (p.result === 'win')  return u * winPayoff(p.juice_at_pick ?? p.juiceAtPick);
  if (p.result === 'loss') return -u;
  return 0; // push, void, pending
}

/** Net units the same pick would have paid at the consensus market line/juice. */
export function pickNetUnitsAtMarket(p) {
  const u = Number(p.units) || 0;
  const mj = p.market_juice ?? p.marketJuice ?? p.juice_at_pick ?? p.juiceAtPick;
  if (p.result === 'win')  return u * winPayoff(mj);
  if (p.result === 'loss') return -u;
  return 0;
}

/**
 * Aggregate stats over an array of (graded or pending) picks.
 * Pending and void rows are excluded from W/L counts.
 */
export function aggregatePickStats(picks) {
  const out = {
    picksCount: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    pending: 0,
    netUnits: 0,
    netUnitsAtMarket: 0,
    juicePaid: 0,
  };
  for (const p of picks || []) {
    if (p.result === 'pending' || p.result === 'void') {
      if (p.result === 'pending') out.pending += 1;
      continue;
    }
    out.picksCount += 1;
    if (p.result === 'win')  out.wins   += 1;
    if (p.result === 'loss') out.losses += 1;
    if (p.result === 'push') out.pushes += 1;

    out.netUnits         += pickNetUnits(p);
    out.netUnitsAtMarket += pickNetUnitsAtMarket(p);

    // Juice paid: extra units of risk that came from juice > -100
    // (basically the implicit cost of even-money equivalence).
    if (p.result === 'loss') {
      const j = Number(p.juice_at_pick ?? p.juiceAtPick) || -110;
      const u = Number(p.units) || 0;
      out.juicePaid += u * (1 - 100 / Math.abs(j));
    }
  }
  out.pointBuyCost = out.netUnitsAtMarket - out.netUnits; // >0 means buying half-points cost net units
  out.winPct = out.picksCount > 0 ? out.wins / (out.wins + out.losses) : 0;
  return out;
}

/** Filter picks to a window (week/month/season) using graded_at. */
export function filterPicksToWindow(picks, window) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let cutoff;
  if (window === 'week')   cutoff = now - 7  * dayMs;
  if (window === 'month')  cutoff = now - 30 * dayMs;
  if (window === 'season') {
    const y = new Date().getUTCFullYear();
    cutoff = Date.UTC(y, 0, 1);
  }
  if (!cutoff) return picks;
  return (picks || []).filter((p) => {
    const t = p.graded_at ?? p.gradedAt;
    if (!t) return false;
    return new Date(t).getTime() >= cutoff;
  });
}

/** Filter picks to a sport. Pass 'all' or null for no filter. */
export function filterPicksToSport(picks, sport) {
  if (!sport || sport === 'all') return picks || [];
  return (picks || []).filter((p) => (p.league || '').toLowerCase() === sport.toLowerCase());
}

/** Min sample sizes per window for leaderboard qualification. */
export const MIN_SAMPLE = {
  week: 3,
  month: 6,
  season: 20,
};

/** True if the user has enough graded picks in this window to rank. */
export function isQualified(picks, window) {
  const filtered = filterPicksToWindow(picks, window).filter(
    (p) => p.result === 'win' || p.result === 'loss' || p.result === 'push',
  );
  return filtered.length >= MIN_SAMPLE[window];
}

/** Format net units with a leading sign. */
export function fmtNet(n) {
  const v = Number(n) || 0;
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}u`;
}

/** Format a win % (0-1) as e.g. "59.6%". */
export function fmtPct(p) {
  return `${(Number(p) * 100).toFixed(1)}%`;
}

/** Sport list used across the app — keep this aligned with CLAUDE.md. */
export const SPORTS = ['nfl', 'cfb', 'cbb', 'nba', 'mlb', 'nhl'];
export const SPORT_LABELS = {
  all: 'All',
  nfl: 'NFL',
  cfb: 'CFB',
  cbb: 'CBB',
  nba: 'NBA',
  mlb: 'MLB',
  nhl: 'NHL',
};

/**
 * Sport-year season number for a given league + date.
 * Convention (locked per spec §22):
 *   NFL/CFB → year the season *starts*. Aug 2025 - Feb 2026 = 2025.
 *   NBA/NHL/CBB → year the season *ends*. Oct 2025 - Jun 2026 = 2026.
 *   MLB → calendar year. Mar - Oct, all 2026.
 *
 * Returns the integer season tag stored on user_picks.season.
 */
export function seasonForLeague(league, date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0 = Jan
  const lg = String(league || '').toLowerCase();

  if (lg === 'mlb') return y;

  if (lg === 'nfl' || lg === 'cfb') {
    // Season number = year it started. If we're in Jan-Feb of a "playoff
    // tail" we belong to the prior year's season. Aug onward = current year.
    return m <= 1 ? y - 1 : y; // Jan/Feb → prior; Mar-Dec → current
  }

  if (lg === 'nba' || lg === 'nhl' || lg === 'cbb') {
    // Season number = year it ends. Oct onward = next year's tag.
    return m >= 9 ? y + 1 : y; // Oct-Dec → next; Jan-Sep → current
  }

  return y;
}

/**
 * Convert a half-point-buy count into the resulting juice in American
 * odds. Each half-point bought adds ~10 to the juice (book-standard
 * convention — actual books vary slightly but -10/half-point is the
 * common shorthand). 0 buys = -110 baseline.
 */
export function juiceForBuys(numHalfPoints) {
  const n = Math.max(0, Math.floor(Number(numHalfPoints) || 0));
  return -110 - 10 * n;
}
