import { useEffect, useMemo, useState } from 'react';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';

/**
 * Line shopping page.
 *
 * For NFL + CFB (the brand): merges ESPN scoreboard games with live odds from
 * /api/odds, matched by away|home|kickoff-day. Falls back to seeded mock jitter
 * when ODDS_API_KEY is unset OR /api isn't running locally OR the selected
 * sport has no upcoming games (off-season).
 *
 * For MLB / NBA / NHL: skips the ESPN merge entirely and renders straight from
 * /api/odds events. This is what keeps /lines useful in football off-season —
 * subscribers can still see live multi-book line shopping for whatever sport
 * is in season right now.
 */

const FALLBACK_BOOKS = [
  { id: 'mgm', key: 'betmgm',     name: 'MGM',        short: 'MGM' },
  { id: 'fd',  key: 'fanduel',    name: 'FanDuel',    short: 'FD'  },
  { id: 'dk',  key: 'draftkings', name: 'DraftKings', short: 'DK'  },
  { id: 'cz',  key: 'caesars',    name: 'Caesars',    short: 'CZR' },
  { id: 'br',  key: 'betrivers',  name: 'BetRivers',  short: 'BR'  },
];

const SPORTS = [
  { k: 'all', l: 'ALL',  espn: true  },
  { k: 'nfl', l: 'NFL',  espn: true  },
  { k: 'cfb', l: 'CFB',  espn: true  },
  { k: 'mlb', l: 'MLB',  espn: false },
  { k: 'nba', l: 'NBA',  espn: false },
  { k: 'nhl', l: 'NHL',  espn: false },
];

// ---------- mock-fallback helpers (only used for football off-season) ----------
function seededOffset(gameId, bookId) {
  const s = String(gameId) + bookId;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 7) - 3;
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

// ---------- live data fetcher ----------
function useLiveOdds(sport) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (sport === 'all') {
      setData(null); setStatus('idle'); setError(null);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    fetch(`/api/odds?sport=${sport}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((j) => { if (!cancelled) { setData(j); setStatus('ready'); } })
      .catch((e) => { if (!cancelled) { setError(String(e.message || e)); setStatus('error'); } });
    return () => { cancelled = true; };
  }, [sport]);

  return { data, status, error };
}

// ---------- public splits fetcher (Action Network proxy) ----------
function usePublicSplits(sport) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (sport === 'all') { setData(null); setStatus('idle'); return; }
    let cancelled = false;
    setStatus('loading');
    fetch(`/api/public-splits?sport=${sport}`)
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (!cancelled) { setData(j); setStatus(j ? 'ready' : 'error'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [sport]);

  return { data, status };
}

// Build a lookup keyed by both full team-name pair AND short-name pair so we
// can match Action Network games against Odds API events even when the team
// labels differ slightly between feeds.
function indexPublicSplits(games) {
  const idx = new Map();
  for (const g of games || []) {
    const fullKey  = `${g.away?.full}|${g.home?.full}`;
    const shortKey = `${g.away?.display}|${g.home?.display}`;
    const abbrKey  = `${g.away?.abbr}|${g.home?.abbr}`;
    if (g.away?.full && g.home?.full)       idx.set(fullKey, g);
    if (g.away?.display && g.home?.display) idx.set(shortKey, g);
    if (g.away?.abbr && g.home?.abbr)       idx.set(abbrKey, g);
  }
  return idx;
}

function findPublicSplitForGame(idx, away, home) {
  if (!idx) return null;
  return idx.get(`${away}|${home}`) || null;
}

function indexLiveEvents(events) {
  const idx = new Map();
  for (const ev of events || []) {
    const day = ev.commenceTime ? new Date(ev.commenceTime).toISOString().slice(0, 10) : '';
    idx.set(`${ev.away}|${ev.home}|${day}`, ev);
    idx.set(`${ev.away}|${ev.home}`, ev);
  }
  return idx;
}

function findLiveEventForGame(idx, g) {
  if (!idx || !g) return null;
  const day = g.kickoff ? new Date(g.kickoff).toISOString().slice(0, 10) : '';
  const fullKey = `${g.away?.name}|${g.home?.name}|${day}`;
  const teamKey = `${g.away?.name}|${g.home?.name}`;
  return idx.get(fullKey) || idx.get(teamKey) || null;
}

function pickOutcome(outcomes, predicate) {
  return (outcomes || []).find(predicate) || null;
}
function fmtPrice(price) {
  if (price == null) return '—';
  return price > 0 ? `+${price}` : String(price);
}
function fmtSpread(homeAbbr, point) {
  if (point == null) return '—';
  return `${homeAbbr} ${point > 0 ? '+' : ''}${point}`;
}

// Short team name from a full Odds API name like "Philadelphia Phillies" → "Phillies"
function shortName(name) {
  if (!name) return '';
  const parts = String(name).trim().split(/\s+/);
  return parts[parts.length - 1];
}
function abbr(name) {
  if (!name) return '';
  const last = shortName(name);
  return last.slice(0, 4).toUpperCase();
}

export default function LinesRoute() {
  const { games, loading } = useEspnScoreboard();
  const [sport, setSport] = useState('mlb'); // default to in-season sport
  const live = useLiveOdds(sport);
  const splits = usePublicSplits(sport);
  const splitsIdx = useMemo(
    () => (splits.status === 'ready' ? indexPublicSplits(splits.data?.games) : null),
    [splits.status, splits.data]
  );

  const sportConfig = SPORTS.find((s) => s.k === sport);
  const useEspnMerge = !!sportConfig?.espn && sport !== 'all' || sport === 'all';

  const filteredEspnGames = useMemo(
    () => games.filter((g) => g.status === 'upcoming' && (sport === 'all' || g.league === sport)),
    [games, sport]
  );

  const liveIdx = useMemo(
    () => (live.status === 'ready' ? indexLiveEvents(live.data?.events) : null),
    [live.status, live.data]
  );

  const usingLive = live.status === 'ready' && live.data?.events?.length > 0;
  const isFootball = sport === 'nfl' || sport === 'cfb' || sport === 'all';
  const liveOnlyMode = !isFootball && usingLive; // MLB/NBA/NHL render directly from API
  const offSeason = isFootball && sport !== 'all' && live.status === 'ready' && (live.data?.events?.length || 0) === 0;

  // For non-football sports, build a synthetic "games" list straight from live data
  const liveOnlyGames = useMemo(() => {
    if (!liveOnlyMode) return [];
    return (live.data.events || []).slice(0, 20).map((ev) => ({
      id: ev.id,
      league: sport,
      week: '',
      home: { name: ev.home, abbr: abbr(ev.home) },
      away: { name: ev.away, abbr: abbr(ev.away) },
      kickoff: ev.commenceTime,
      _live: ev,
    }));
  }, [liveOnlyMode, live.data, sport]);

  const gamesToRender = liveOnlyMode ? liveOnlyGames : filteredEspnGames;

  return (
    <section>
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Line shopping · 5 books</div>
          <div className="trc-final">
            {gamesToRender.length}<span className="trc-final-sub">
              upcoming games · {usingLive ? 'live odds' : 'sample lines'}
              {usingLive && live.data?.remaining != null ? ` · ${live.data.remaining} API calls left` : ''}
            </span>
          </div>
        </div>
        <div className="filter">
          {SPORTS.map((s) => (
            <button key={s.k} className={sport === s.k ? 'active' : ''} onClick={() => setSport(s.k)}>{s.l}</button>
          ))}
        </div>
      </div>

      {offSeason && (
        <div className="empty" style={{ padding: 18, marginBottom: 14 }}>
          <strong>{sport.toUpperCase()} is off-season.</strong>{' '}
          The Lock Street picks system focuses on football — but you can shop live MLB/NBA/NHL lines below to see the line shopping flow in action.
          {' '}
          <button onClick={() => setSport('mlb')} className="trc-btn-sm" style={{ marginLeft: 8 }}>
            Show MLB lines →
          </button>
        </div>
      )}

      {live.status === 'error' && (
        <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: -6, marginBottom: 12 }}>
          Live odds unavailable ({live.error}). Showing sample lines.
        </p>
      )}

      {(loading || live.status === 'loading') && <p style={{ color: 'var(--ink-dim)' }}>Loading lines...</p>}

      {!loading && gamesToRender.length === 0 && !offSeason && (
        <div className="empty">No upcoming games to compare.</div>
      )}

      {gamesToRender.map((g) => {
        const liveEv = liveOnlyMode ? g._live : (usingLive ? findLiveEventForGame(liveIdx, g) : null);
        // Public splits — match by full team name first, then fall back to short.
        const publicSplit = splitsIdx
          ? (
              findPublicSplitForGame(splitsIdx, liveEv?.away, liveEv?.home)
              || findPublicSplitForGame(splitsIdx, g.away?.name, g.home?.name)
              || findPublicSplitForGame(splitsIdx, g.away?.abbr, g.home?.abbr)
            )
          : null;
        const books = liveEv
          ? FALLBACK_BOOKS.map((b) => {
              const lb = liveEv.books?.find((x) => x.key === b.key);
              return lb ? { ...b, live: lb } : b;
            })
          : FALLBACK_BOOKS;

        const spreads = books.map((b) => {
          if (b.live?.markets?.spreads) {
            const o = pickOutcome(b.live.markets.spreads, (x) => x.name === liveEv.home);
            return { book: b, val: fmtSpread(g.home?.abbr, o?.point) };
          }
          return { book: b, val: applySpreadJitter(g.spread, g.id, b.id) };
        });
        const ous = books.map((b) => {
          if (b.live?.markets?.totals) {
            const o = pickOutcome(b.live.markets.totals, (x) => x.name === 'Over');
            return { book: b, val: o?.point != null ? String(o.point) : '—' };
          }
          return { book: b, val: applyOuJitter(g.ou, g.id, b.id) };
        });
        const mlsHome = books.map((b) => {
          if (b.live?.markets?.h2h) {
            const o = pickOutcome(b.live.markets.h2h, (x) => x.name === liveEv.home);
            return { book: b, val: o?.price ?? null };
          }
          return { book: b, val: fakeMl(g.id, b.id, 'home') };
        });
        const mlsAway = books.map((b) => {
          if (b.live?.markets?.h2h) {
            const o = pickOutcome(b.live.markets.h2h, (x) => x.name === liveEv.away);
            return { book: b, val: o?.price ?? null };
          }
          return { book: b, val: fakeMl(g.id, b.id, 'away') };
        });

        return (
          <div key={g.id} className="lines-block">
            <div className="lines-head">
              <span className={'lg-badge ' + g.league}>{g.league.toUpperCase()}</span>
              <strong>{g.away?.abbr} @ {g.home?.abbr}</strong>
              {g.week && <span className="wk">{g.week}</span>}
              <span className="lines-time">{new Date(g.kickoff).toLocaleString([], { weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric' })}</span>
              {liveEv && <span className="wk" style={{ color: 'var(--gold)' }}>LIVE</span>}
            </div>
            <table className="lines-table">
              <thead>
                <tr><th>Market</th>{books.map((b) => <th key={b.id}>{b.short}</th>)}</tr>
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
                  {mlsHome.map((c) => <td key={c.book.id} className="lines-cell">{fmtPrice(c.val)}</td>)}
                </tr>
                <tr>
                  <td className="lines-market">ML away</td>
                  {mlsAway.map((c) => <td key={c.book.id} className="lines-cell">{fmtPrice(c.val)}</td>)}
                </tr>
                {publicSplit && (
                  <tr>
                    <td className="lines-market" style={{ color: 'var(--gold)' }}>Public bets</td>
                    <td className="lines-cell" colSpan={books.length} style={{ textAlign: 'left', paddingLeft: 14, color: 'var(--ink)' }}>
                      {publicSplit.splits.spread.away_bets != null && (
                        <span style={{ marginRight: 18 }}>
                          Spread: <strong>{publicSplit.splits.spread.away_bets}%</strong> {g.away?.abbr} ·{' '}
                          <strong>{publicSplit.splits.spread.home_bets}%</strong> {g.home?.abbr}
                        </span>
                      )}
                      {publicSplit.splits.total.over_bets != null && (
                        <span style={{ marginRight: 18 }}>
                          Total: <strong>{publicSplit.splits.total.over_bets}%</strong> O ·{' '}
                          <strong>{publicSplit.splits.total.under_bets}%</strong> U
                        </span>
                      )}
                      {publicSplit.numBets != null && (
                        <span style={{ color: 'var(--ink-dim)', fontSize: 12 }}>
                          {publicSplit.numBets.toLocaleString()} bets tracked
                        </span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}

      <p className="footnote-disclaimer" style={{ maxWidth: 600 }}>
        {usingLive
          ? 'Live odds via The Odds API. Public splits via Action Network. Both server-cached 24h.'
          : 'Sample lines (ESPN consensus + deterministic jitter). Football off-season → no live data; switch to MLB/NBA/NHL to see live multi-book lines.'}
      </p>
    </section>
  );
}
