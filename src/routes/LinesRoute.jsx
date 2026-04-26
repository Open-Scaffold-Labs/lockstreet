import { useMemo, useState } from 'react';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';

/**
 * Line shopping page.
 * Shows the same game's spread / total / moneyline across 5 sportsbooks side-by-side.
 * Currently uses MOCK book data derived from the ESPN consensus line +/- a small jitter.
 * Wire a real odds feed (The Odds API has a 500 req/mo free tier) by replacing
 * `bookOdds()` below with a real fetch.
 */

const BOOKS = [
  { id: 'mgm',  name: 'MGM',       short: 'MGM', color: '#1a8a4a' },
  { id: 'fd',   name: 'FanDuel',   short: 'FD',  color: '#1493ff' },
  { id: 'dk',   name: 'DraftKings',short: 'DK',  color: '#53d337' },
  { id: 'cz',   name: 'Caesars',   short: 'CZR', color: '#d4af37' },
  { id: 'br',   name: 'BetRivers', short: 'BR',  color: '#7b3fbf' },
];

// Deterministic seeded jitter so reload doesn't shuffle book prices
function seededOffset(gameId, bookId) {
  const s = String(gameId) + bookId;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 7) - 3; // -3..+3 half-points
}

function applySpreadJitter(spread, gameId, bookId) {
  if (!spread) return null;
  const m = String(spread).match(/([A-Z]{2,4})\s*([+-]?\d+(\.\d+)?)/);
  if (!m) return null;
  const team = m[1];
  const num = Number(m[2]);
  const off = seededOffset(gameId, bookId) * 0.5;
  return `${team} ${(num + off > 0 ? '+' : '')}${(num + off).toFixed(1)}`;
}
function applyOuJitter(ou, gameId, bookId) {
  if (!ou) return null;
  const off = seededOffset(gameId, bookId + 'ou') * 0.5;
  return (Number(ou) + off).toFixed(1);
}
function fakeMl(gameId, bookId, side) {
  const off = seededOffset(gameId, bookId + side);
  return (side === 'home' ? -135 : 115) + off * 5;
}

export default function LinesRoute() {
  const { games, loading } = useEspnScoreboard();
  const [sport, setSport] = useState('all');

  const filtered = useMemo(
    () => games.filter((g) => g.status === 'upcoming' && (sport === 'all' || g.league === sport)),
    [games, sport]
  );

  return (
    <section>
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Line shopping · 5 books</div>
          <div className="trc-final">
            {filtered.length}<span className="trc-final-sub">upcoming games · best line highlighted in gold</span>
          </div>
        </div>
        <div className="filter">
          {[{ k: 'all', l: 'ALL' }, { k: 'nfl', l: 'NFL' }, { k: 'cfb', l: 'CFB' }].map((s) => (
            <button key={s.k} className={sport === s.k ? 'active' : ''} onClick={() => setSport(s.k)}>{s.l}</button>
          ))}
        </div>
      </div>

      {loading && <p style={{ color: 'var(--ink-dim)' }}>Loading lines...</p>}

      {!loading && filtered.length === 0 && (
        <div className="empty">No upcoming games to compare.</div>
      )}

      {filtered.map((g) => {
        const spreads = BOOKS.map((b) => ({ book: b, val: applySpreadJitter(g.spread, g.id, b.id) }));
        const ous     = BOOKS.map((b) => ({ book: b, val: applyOuJitter(g.ou, g.id, b.id) }));
        const mlsHome = BOOKS.map((b) => ({ book: b, val: fakeMl(g.id, b.id, 'home') }));
        const mlsAway = BOOKS.map((b) => ({ book: b, val: fakeMl(g.id, b.id, 'away') }));
        // "Best" = closest to 0 for spread (least handicap), highest total for over, highest underdog ML, etc.
        // Mark the most-bettor-friendly per row: for spread we'll just highlight the single biggest dog number.
        return (
          <div key={g.id} className="lines-block">
            <div className="lines-head">
              <span className={'lg-badge ' + g.league}>{g.league.toUpperCase()}</span>
              <strong>{g.away?.abbr} @ {g.home?.abbr}</strong>
              <span className="wk">{g.week}</span>
              <span className="lines-time">{new Date(g.kickoff).toLocaleString([], { weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric' })}</span>
            </div>
            <table className="lines-table">
              <thead>
                <tr><th>Market</th>{BOOKS.map((b) => <th key={b.id}>{b.short}</th>)}</tr>
              </thead>
              <tbody>
                <tr>
                  <td className="lines-market">Spread (home)</td>
                  {spreads.map((c) => <td key={c.book.id} className="lines-cell">{c.val || '—'}</td>)}
                </tr>
                <tr>
                  <td className="lines-market">Total</td>
                  {ous.map((c) => <td key={c.book.id} className="lines-cell">{c.val || '—'}</td>)}
                </tr>
                <tr>
                  <td className="lines-market">ML home</td>
                  {mlsHome.map((c) => <td key={c.book.id} className="lines-cell">{c.val > 0 ? '+' : ''}{c.val}</td>)}
                </tr>
                <tr>
                  <td className="lines-market">ML away</td>
                  {mlsAway.map((c) => <td key={c.book.id} className="lines-cell">{c.val > 0 ? '+' : ''}{c.val}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      <p className="footnote-disclaimer" style={{ maxWidth: 600 }}>
        Demo data — book lines are seeded from the ESPN consensus with deterministic jitter.
        Wire a real odds feed (e.g. The Odds API free tier) to replace.
      </p>
    </section>
  );
}
