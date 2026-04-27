import { useEffect, useMemo, useState } from 'react';

/**
 * /lines — pure ScoresAndOdds data.
 *
 * Source: public_betting table, scraped every ~10 min during peak windows
 * by /api/refresh-public-betting and read via /api/team-intel?op=public-betting.
 *
 * For each game we surface from a single payload:
 *   - Spread line (home perspective) + bets% + money%
 *   - Total line + over% (bets) + over% (money)
 *   - Moneyline bets% + money% (home)
 *
 * Phase 2 will layer in the 7-book per-game line grid (bet365, BetMGM,
 * DraftKings, Caesars, FanDuel, Fanatics, BetRivers) sourced from a future
 * `public_book_lines` table populated by the same scraper.
 */

const SPORTS = [
  { k: 'mlb', l: 'MLB' },
  { k: 'nba', l: 'NBA' },
  { k: 'nhl', l: 'NHL' },
  { k: 'nfl', l: 'NFL' },
  { k: 'cfb', l: 'CFB' },
];

// ---------- data hook ----------------------------------------------------
function usePublicBetting(sport) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const r = await fetch(`/api/team-intel?op=public-betting&league=${sport}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!cancel) setRows(j?.rows || []);
      } catch (e) {
        if (!cancel) setError(String(e.message || e));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [sport]);

  return { rows, loading, error };
}

// ---------- helpers ------------------------------------------------------
// Format a numeric spread for the home team. SAO returns home-perspective
// lines: e.g. -1.5 means home is laying 1.5. We display "+/-N.N" with the
// proper sign.
function fmtSpread(line) {
  if (line == null || line === '') return '—';
  const n = Number(line);
  if (!Number.isFinite(n)) return String(line);
  return n > 0 ? `+${n}` : String(n);
}
function fmtTotal(line) {
  if (line == null || line === '') return '—';
  return String(line);
}
function pct(n) {
  if (n == null || n === '') return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

// ====================================================================
export default function LinesRoute() {
  const [sport, setSport] = useState('mlb');
  const { rows, loading, error } = usePublicBetting(sport);

  // Stable, predictable sort: alphabetically by away team. Ordering by
  // fetched_at (which row got scraped last) is meaningless to a viewer.
  const sorted = useMemo(
    () => rows.slice().sort((a, b) => String(a.awayLabel || '').localeCompare(String(b.awayLabel || ''))),
    [rows]
  );

  return (
    <section className="lines-section">
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Lines &amp; public splits</div>
          <div className="trc-final">
            {sorted.length}<span className="trc-final-sub">
              {' '}game{sorted.length === 1 ? '' : 's'} · live ScoresAndOdds data
            </span>
          </div>
        </div>
        <div className="filter">
          {SPORTS.map((s) => (
            <button key={s.k} className={sport === s.k ? 'active' : ''} onClick={() => setSport(s.k)}>{s.l}</button>
          ))}
        </div>
      </div>

      {loading && <p style={{ color: 'var(--ink-dim)' }}>Loading lines...</p>}
      {error && <p style={{ color: 'var(--ink-dim)' }}>Couldn't load lines ({error}).</p>}
      {!loading && sorted.length === 0 && (
        <div className="empty">
          No games scraped for {sport.toUpperCase()} in the last 24 hours. The scraper runs every ~10 min during peak windows.
        </div>
      )}

      <div className="lines-grid">
        {sorted.map((g) => <LineCard key={`${g.league}-${g.slug}`} g={g} />)}
      </div>

      <p className="footnote-disclaimer" style={{ maxWidth: 600 }}>
        Lines, spreads, and public betting splits scraped from public sportsbook trend pages. Refreshed every ~10 min during peak hours; cached at the edge for 5 min.
        <br />21+. Bet responsibly. 1-800-GAMBLER.
      </p>
    </section>
  );
}

// ---------- single-game card --------------------------------------------
function LineCard({ g }) {
  const spreadHome = Number(g.spreadHomeLine);
  const spreadAway = Number.isFinite(spreadHome) ? -spreadHome : null;
  const totalLine  = g.totalLine;

  // Public-money rows: the visual core of the page. We show home/away as
  // mirrored bars so the eye reads which side the money is on.
  const spreadBets  = pct(g.spreadHomePctBets);
  const spreadMoney = pct(g.spreadHomePctMoney);
  const mlBets      = pct(g.mlHomePctBets);
  const mlMoney     = pct(g.mlHomePctMoney);
  const overBets    = pct(g.totalOverPctBets);
  const overMoney   = pct(g.totalOverPctMoney);

  return (
    <article className="line-card">
      <header className="lc-head">
        <span className={'lg-badge ' + g.league}>{g.league.toUpperCase()}</span>
        <span className="lc-matchup">
          <strong className="tabbr">{g.awayLabel}</strong>
          <span className="lc-at">@</span>
          <strong className="tabbr">{g.homeLabel}</strong>
        </span>
      </header>

      <div className="lc-lines">
        <div className="lc-line">
          <div className="lc-line-label">Spread</div>
          <div className="lc-line-pair">
            <span className="lc-side"><span className="tabbr">{g.awayLabel}</span>&nbsp;{Number.isFinite(spreadAway) ? fmtSpread(spreadAway) : '—'}</span>
            <span className="lc-side home"><span className="tabbr">{g.homeLabel}</span>&nbsp;{fmtSpread(spreadHome)}</span>
          </div>
        </div>
        <div className="lc-line">
          <div className="lc-line-label">Total</div>
          <div className="lc-line-pair lc-line-total">
            <span className="lc-side total">O/U&nbsp;{fmtTotal(totalLine)}</span>
          </div>
        </div>
      </div>

      <div className="lc-splits">
        <SplitBar
          label="Spread"
          awayLabel={g.awayLabel} homeLabel={g.homeLabel}
          awaySub={Number.isFinite(spreadAway) ? fmtSpread(spreadAway) : ''}
          homeSub={fmtSpread(spreadHome)}
          homeBets={spreadBets} homeMoney={spreadMoney}
        />
        <SplitBar
          label="Moneyline"
          awayLabel={g.awayLabel} homeLabel={g.homeLabel}
          homeBets={mlBets} homeMoney={mlMoney}
        />
        <SplitBar
          label="Total"
          awayLabel="Under" homeLabel="Over"
          awaySub={`u ${fmtTotal(totalLine)}`}
          homeSub={`o ${fmtTotal(totalLine)}`}
          homeBets={overBets} homeMoney={overMoney}
        />
      </div>
    </article>
  );
}

// One market's split panel. Reads as a header row (team abbrs at each end
// with spread/total qualifiers) plus mirrored Bets / Money bars. The bar
// is purely visual — percentages live in fixed-width columns on each side
// so they stay readable regardless of segment width. Team labels sit at
// the ENDS of the bar so the eye reads left=away→right=home consistently
// across the whole card.
//
// SHARP: when |bets% - money%| >= 10 the row is flagged. That's the
// fade-the-public signal (heavy public bet count, real money split
// differently — pros are on the other side).
function SplitBar({ label, awayLabel, homeLabel, awaySub, homeSub, homeBets, homeMoney }) {
  if (homeBets == null && homeMoney == null) return null;

  const safeBets  = homeBets  != null ? Math.max(0, Math.min(100, Math.round(homeBets)))  : null;
  const safeMoney = homeMoney != null ? Math.max(0, Math.min(100, Math.round(homeMoney))) : null;
  const awayBets  = safeBets  != null ? 100 - safeBets  : null;
  const awayMoney = safeMoney != null ? 100 - safeMoney : null;

  const divergence = (safeBets != null && safeMoney != null) ? Math.abs(safeBets - safeMoney) : 0;
  const sharp = divergence >= 10;

  return (
    <div className={'lc-split' + (sharp ? ' lc-split-sharp' : '')}>
      <div className="lc-split-header">
        <span className="lc-split-title">{label}</span>
        {sharp && <span className="lc-split-flag" title={`${divergence}-point divergence between % Bets and % Money`}>SHARP</span>}
      </div>

      <div className="lc-split-teams">
        <div className="lc-split-team-line">
          <span className="lc-split-team away">
            <span className="tabbr-inline">{awayLabel}</span>
            {awaySub && <span className="lc-split-sub">{awaySub}</span>}
          </span>
          <span className="lc-split-team home">
            {homeSub && <span className="lc-split-sub">{homeSub}</span>}
            <span className="tabbr-inline">{homeLabel}</span>
          </span>
        </div>
      </div>

      {safeBets != null && (
        <div className="lc-split-row">
          <span className="lc-split-tag">Bets</span>
          <span className="lc-split-num away">{awayBets}%</span>
          <div className="lc-split-bar" aria-label={`Bets: ${awayBets}% ${awayLabel} / ${safeBets}% ${homeLabel}`}>
            <div className="lc-bar-side away bets" style={{ width: `${awayBets}%` }} />
            <div className="lc-bar-side home bets" style={{ width: `${safeBets}%` }} />
          </div>
          <span className="lc-split-num home">{safeBets}%</span>
        </div>
      )}

      {safeMoney != null && (
        <div className="lc-split-row">
          <span className="lc-split-tag">Money</span>
          <span className="lc-split-num away">{awayMoney}%</span>
          <div className="lc-split-bar" aria-label={`Money: ${awayMoney}% ${awayLabel} / ${safeMoney}% ${homeLabel}`}>
            <div className="lc-bar-side away money" style={{ width: `${awayMoney}%` }} />
            <div className="lc-bar-side home money" style={{ width: `${safeMoney}%` }} />
          </div>
          <span className="lc-split-num home">{safeMoney}%</span>
        </div>
      )}
    </div>
  );
}
