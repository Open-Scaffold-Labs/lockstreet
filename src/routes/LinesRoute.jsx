import { useEffect, useMemo, useState } from 'react';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';
import { supabase } from '../lib/supabase.js';

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

// ---------- name → standard abbr (for matching SAO public-betting rows)
// the-odds-api gives full names like "Toronto Blue Jays" / "Boston Red Sox".
// `abbr()` below takes last-word.slice(0,4) which yields "JAYS"/"SOX" — that
// doesn't match SAO's standard 2-3 letter labels (TOR/BOS). So we keep a
// small map of common-name → SAO abbr for the leagues currently in season.
// Only need entries for teams we'll actually be looking up; missing teams
// just won't show a public-money row.
const NAME_TO_ABBR = {
  // ----- MLB -----
  'arizona diamondbacks': 'ARI', 'atlanta braves': 'ATL', 'baltimore orioles': 'BAL',
  'boston red sox': 'BOS', 'chicago cubs': 'CHC', 'chicago white sox': 'CWS',
  'cincinnati reds': 'CIN', 'cleveland guardians': 'CLE', 'colorado rockies': 'COL',
  'detroit tigers': 'DET', 'houston astros': 'HOU', 'kansas city royals': 'KC',
  'los angeles angels': 'LAA', 'los angeles dodgers': 'LAD', 'miami marlins': 'MIA',
  'milwaukee brewers': 'MIL', 'minnesota twins': 'MIN', 'new york mets': 'NYM',
  'new york yankees': 'NYY', 'oakland athletics': 'OAK', 'philadelphia phillies': 'PHI',
  'pittsburgh pirates': 'PIT', 'san diego padres': 'SD', 'san francisco giants': 'SF',
  'seattle mariners': 'SEA', 'st. louis cardinals': 'STL', 'st louis cardinals': 'STL',
  'tampa bay rays': 'TB', 'texas rangers': 'TEX', 'toronto blue jays': 'TOR',
  'washington nationals': 'WSH', 'athletics': 'OAK',
  // ----- NBA -----
  'atlanta hawks': 'ATL', 'boston celtics': 'BOS', 'brooklyn nets': 'BKN',
  'charlotte hornets': 'CHA', 'chicago bulls': 'CHI', 'cleveland cavaliers': 'CLE',
  'dallas mavericks': 'DAL', 'denver nuggets': 'DEN', 'detroit pistons': 'DET',
  'golden state warriors': 'GS', 'houston rockets': 'HOU', 'indiana pacers': 'IND',
  'la clippers': 'LAC', 'los angeles clippers': 'LAC', 'los angeles lakers': 'LAL',
  'memphis grizzlies': 'MEM', 'miami heat': 'MIA', 'milwaukee bucks': 'MIL',
  'minnesota timberwolves': 'MIN', 'new orleans pelicans': 'NO', 'new york knicks': 'NYK',
  'oklahoma city thunder': 'OKC', 'orlando magic': 'ORL', 'philadelphia 76ers': 'PHI',
  'phoenix suns': 'PHX', 'portland trail blazers': 'POR', 'sacramento kings': 'SAC',
  'san antonio spurs': 'SA', 'toronto raptors': 'TOR', 'utah jazz': 'UTAH',
  'washington wizards': 'WAS',
  // ----- NHL -----
  'anaheim ducks': 'ANA', 'boston bruins': 'BOS', 'buffalo sabres': 'BUF',
  'calgary flames': 'CGY', 'carolina hurricanes': 'CAR', 'chicago blackhawks': 'CHI',
  'colorado avalanche': 'COL', 'columbus blue jackets': 'CBJ', 'dallas stars': 'DAL',
  'detroit red wings': 'DET', 'edmonton oilers': 'EDM', 'florida panthers': 'FLA',
  'los angeles kings': 'LA', 'minnesota wild': 'MIN', 'montréal canadiens': 'MTL',
  'montreal canadiens': 'MTL', 'nashville predators': 'NSH', 'new jersey devils': 'NJ',
  'new york islanders': 'NYI', 'new york rangers': 'NYR', 'ottawa senators': 'OTT',
  'philadelphia flyers': 'PHI', 'pittsburgh penguins': 'PIT', 'san jose sharks': 'SJ',
  'seattle kraken': 'SEA', 'st. louis blues': 'STL', 'st louis blues': 'STL',
  'tampa bay lightning': 'TB', 'toronto maple leafs': 'TOR', 'utah hockey club': 'UTA',
  'utah mammoth': 'UTA', 'vancouver canucks': 'VAN', 'vegas golden knights': 'VGK',
  'winnipeg jets': 'WPG', 'washington capitals': 'WSH',
};
function teamNameToAbbr(name) {
  if (!name) return '';
  const k = String(name).trim().toLowerCase();
  return NAME_TO_ABBR[k] || '';
}

// ---------- public betting % (from /api/team-intel?op=public-betting) -----
// Backed by the public_betting table populated by the SAO scraper.
function usePublicBetting(sport) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (sport === 'all') { setRows([]); return; }
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(`/api/team-intel?op=public-betting&league=${sport}`);
        if (!r.ok) return;
        const j = await r.json();
        if (!cancel) setRows(j?.rows || []);
      } catch { /* ignore */ }
    })();
    return () => { cancel = true; };
  }, [sport]);
  return rows;
}
// Index by `${away}|${home}` AND `${home}|${away}` since SAO sometimes
// inverts vs ESPN's away/home assumption — matching by either order keeps
// the lookup robust.
function indexPublicBetting(rows) {
  const idx = new Map();
  for (const r of rows) {
    if (!r.awayLabel || !r.homeLabel) continue;
    const a = String(r.awayLabel).toUpperCase();
    const h = String(r.homeLabel).toUpperCase();
    idx.set(`${a}|${h}`, r);
    idx.set(`${h}|${a}`, r);
  }
  return idx;
}

// ---------- consensus picks (from supabase consensus_picks table) ----------
function useConsensusPicks(sport) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (sport === 'all') { setRows([]); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from('consensus_picks')
        .select('*')
        .eq('sport', sport)
        .order('fetched_at', { ascending: false });
      if (!cancel) setRows(data || []);
    })();
    return () => { cancel = true; };
  }, [sport]);
  return rows;
}

// Index consensus picks by team-name pair so we can look up by Odds-API
// team names like "Detroit Pistons" / "Atlanta Braves" etc.
function indexConsensusByGame(rows) {
  const idx = new Map();
  // Group by game_code → 2 rows
  const byGame = new Map();
  for (const r of rows) {
    if (!r.game_code) continue;
    const arr = byGame.get(r.game_code) || [];
    arr.push(r);
    byGame.set(r.game_code, arr);
  }
  for (const [, pair] of byGame) {
    const home = pair.find((p) => p.is_home === true) || pair[1] || pair[0];
    const away = pair.find((p) => p.is_home === false) || pair[0];
    if (!home || !away) continue;
    const key = `${away.team}|${home.team}`;
    idx.set(key, { home, away });
    idx.set(key.toLowerCase(), { home, away });
    // Also index by last-word pairs (e.g., "Phillies|Braves") since
    // ESPN uses full names but VSiN sometimes uses short names.
    const a2 = lastWord(away.team);
    const h2 = lastWord(home.team);
    if (a2 && h2) {
      idx.set(`${a2}|${h2}`, { home, away });
      idx.set(`${a2}|${h2}`.toLowerCase(), { home, away });
    }
  }
  return idx;
}
function lastWord(s) {
  if (!s) return '';
  const parts = String(s).trim().split(/\s+/);
  return parts[parts.length - 1];
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
  const consensusRows = useConsensusPicks(sport);
  const consensusIdx = useMemo(() => indexConsensusByGame(consensusRows), [consensusRows]);
  const publicRows   = usePublicBetting(sport);
  const publicIdx    = useMemo(() => indexPublicBetting(publicRows), [publicRows]);

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
        const awayName = liveEv?.away || g.away?.name;
        const homeName = liveEv?.home || g.home?.name;
        const consensus = consensusIdx.get(`${awayName}|${homeName}`)
          || consensusIdx.get(`${awayName}|${homeName}`.toLowerCase())
          || consensusIdx.get(`${lastWord(awayName)}|${lastWord(homeName)}`)
          || null;
        // SAO public betting %s — keyed by team abbreviations (BOS/TOR style).
        // The /lines page synthesizes 4-letter abbrs ("JAYS", "SOX") from
        // the-odds-api full names, which don't match SAO's standard
        // 2–3 letter labels. Resolve via NAME_TO_ABBR with fallback to
        // whatever abbr() produced. Index covers both away|home AND
        // home|away orderings, so order mismatches don't drop the row.
        const aAbbr = (teamNameToAbbr(awayName) || g.away?.abbr || '').toUpperCase();
        const hAbbr = (teamNameToAbbr(homeName) || g.home?.abbr || '').toUpperCase();
        const pub = (aAbbr && hAbbr) ? (publicIdx.get(`${aAbbr}|${hAbbr}`) || null) : null;
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
                {pub && (
                  <tr>
                    <td className="lines-market" style={{ color: 'var(--orange)' }}>Public money</td>
                    <td className="lines-cell" colSpan={books.length} style={{ textAlign: 'left', paddingLeft: 14, color: 'var(--ink)', fontSize: 13 }}>
                      {pub.spreadHomePctBets != null && (
                        <span style={{ marginRight: 18 }}>
                          Spread: <strong>{pub.spreadHomePctBets}%</strong> bets ·{' '}
                          <strong>{pub.spreadHomePctMoney ?? '—'}{pub.spreadHomePctMoney != null ? '%' : ''}</strong> $ on home
                        </span>
                      )}
                      {pub.totalOverPctBets != null && (
                        <span style={{ marginRight: 18 }}>
                          Total: <strong>{pub.totalOverPctBets}%</strong> bets ·{' '}
                          <strong>{pub.totalOverPctMoney ?? '—'}{pub.totalOverPctMoney != null ? '%' : ''}</strong> $ on Over
                        </span>
                      )}
                      {pub.mlHomePctBets != null && (
                        <span>
                          ML: <strong>{pub.mlHomePctBets}%</strong> bets ·{' '}
                          <strong>{pub.mlHomePctMoney ?? '—'}{pub.mlHomePctMoney != null ? '%' : ''}</strong> $ on home
                        </span>
                      )}
                    </td>
                  </tr>
                )}
                {consensus && (
                  <tr>
                    <td className="lines-market" style={{ color: 'var(--gold)' }}>Consensus picks</td>
                    <td className="lines-cell" colSpan={books.length} style={{ textAlign: 'left', paddingLeft: 14, color: 'var(--ink)', fontSize: 13 }}>
                      {consensus.home?.spread_bet_pct != null && consensus.away?.spread_bet_pct != null && (
                        <span style={{ marginRight: 18 }}>
                          Spread: <strong>{consensus.away.spread_bet_pct}%</strong> {g.away?.abbr} ·{' '}
                          <strong>{consensus.home.spread_bet_pct}%</strong> {g.home?.abbr}
                        </span>
                      )}
                      {consensus.home?.total_bet_pct != null && consensus.away?.total_bet_pct != null && (
                        <span style={{ marginRight: 18 }}>
                          Total: <strong>{Math.max(consensus.home.total_bet_pct, consensus.away.total_bet_pct)}%</strong> O ·{' '}
                          <strong>{Math.min(consensus.home.total_bet_pct, consensus.away.total_bet_pct)}%</strong> U
                        </span>
                      )}
                      {consensus.home?.ml_bet_pct != null && consensus.away?.ml_bet_pct != null && (
                        <span>
                          ML: <strong>{consensus.away.ml_bet_pct}%</strong> {g.away?.abbr} ·{' '}
                          <strong>{consensus.home.ml_bet_pct}%</strong> {g.home?.abbr}
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
          ? 'Live odds via The Odds API (server-cached 24h to conserve free-tier quota).'
          : 'Sample lines (ESPN consensus + deterministic jitter). Football off-season → no live data; switch to MLB/NBA/NHL to see live multi-book lines.'}
      </p>
    </section>
  );
}
