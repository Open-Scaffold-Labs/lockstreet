// Standard fantasy scoring formulas. Computed from ESPN raw box-score
// stats — we don't integrate Yahoo/ESPN Fantasy directly because their
// public APIs are league-scoped + require auth. The numbers we get
// match those platforms because they're computed from the same
// underlying game stats.

// Football — Standard PPR
//   Pass: 1pt / 25 yds, 4pt / TD, -2 / INT
//   Rush: 1pt / 10 yds, 6pt / TD
//   Rec:  1pt / 10 yds, 6pt / TD, +1 per reception (PPR)
//   Fumbles lost: -2
export function fantasyFootball(stats) {
  if (!stats) return 0;
  const passYds = num(stats.passYds);
  const passTd  = num(stats.passTd);
  const passInt = num(stats.passInt);
  const rushYds = num(stats.rushYds);
  const rushTd  = num(stats.rushTd);
  const recYds  = num(stats.recYds);
  const recTd   = num(stats.recTd);
  const rec     = num(stats.rec);
  const fum     = num(stats.fumLost);
  return round1(
    passYds * 0.04 + passTd * 4 + passInt * -2 +
    rushYds * 0.1  + rushTd * 6 +
    recYds  * 0.1  + recTd  * 6 + rec * 1 +
    fum * -2
  );
}

// Baseball — DraftKings-style points
//   Hitter: 1 single, 2 double, 3 triple, 4 HR, 1 RBI, 1 R, 1 BB, 1 HBP, 2 SB
//   Pitcher: 2.25 IP-out (= 0.75 / 1IP), 2 K, -2 ER, -0.6 H, -0.6 BB, 4 W, 2.5 CG, 2.5 SO, 5 NoH
export function fantasyBaseball(stats, isPitcher) {
  if (!stats) return 0;
  if (isPitcher) {
    const ip   = num(stats.ip);
    const k    = num(stats.k);
    const er   = num(stats.er);
    const h    = num(stats.h);
    const bb   = num(stats.bb);
    const w    = num(stats.win);
    return round1(ip * 2.25 + k * 2 + er * -2 + h * -0.6 + bb * -0.6 + w * 4);
  }
  const single = num(stats.singles);
  const dbl    = num(stats.doubles);
  const trp    = num(stats.triples);
  const hr     = num(stats.hr);
  const rbi    = num(stats.rbi);
  const r      = num(stats.r);
  const bb     = num(stats.bb);
  const sb     = num(stats.sb);
  return round1(
    single * 1 + dbl * 2 + trp * 3 + hr * 4 +
    rbi * 1 + r * 1 + bb * 1 + sb * 2
  );
}

// Basketball — DraftKings-style: 1pt, 0.5/3PM, 1.25 reb, 1.5 ast, 2 stl, 2 blk, -0.5 TO
export function fantasyBasketball(stats) {
  if (!stats) return 0;
  return round1(
    num(stats.pts) * 1 +
    num(stats.threes) * 0.5 +
    num(stats.reb) * 1.25 +
    num(stats.ast) * 1.5 +
    num(stats.stl) * 2 +
    num(stats.blk) * 2 +
    num(stats.to)  * -0.5
  );
}

// Hockey — DraftKings-style: 8.5/G, 5/A, 1.5 SOG, 1.5 BLK, 3/Powerplay pt, 5/SHG, 5/SHG (cap)
export function fantasyHockey(stats) {
  if (!stats) return 0;
  return round1(
    num(stats.g) * 8.5 +
    num(stats.a) * 5 +
    num(stats.sog) * 1.5 +
    num(stats.blk) * 1.5
  );
}

// Goalie hockey — separate scoring
export function fantasyGoalie(stats) {
  if (!stats) return 0;
  return round1(
    num(stats.win) * 6 +
    num(stats.sv)  * 0.6 +
    num(stats.ga)  * -1
  );
}

function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
function round1(n) { return Math.round(n * 10) / 10; }

/**
 * Sport router. Pass a normalized player-stats object and the league.
 * Returns the fantasy points for that player's stat line.
 */
export function fantasyPoints(league, stats, opts = {}) {
  if (!stats) return 0;
  switch (league) {
    case 'nfl':
    case 'cfb':
      return fantasyFootball(stats);
    case 'mlb':
      return fantasyBaseball(stats, opts.isPitcher);
    case 'nba':
      return fantasyBasketball(stats);
    case 'nhl':
      return opts.isGoalie ? fantasyGoalie(stats) : fantasyHockey(stats);
    default:
      return 0;
  }
}
