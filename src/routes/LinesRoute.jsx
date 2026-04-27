// rebuild-marker: force Vercel to redeploy after stuck 5fa4ab9
import { useEffect, useMemo, useState } from 'react';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';
import { supabase } from '../lib/supabase.js';

/**
 * /lines — public splits + sharp consensus.
 *
 * Sources (all real, no mock fallbacks):
 *   1. ESPN scoreboard (via useEspnScoreboard) — schedule + current spread/total.
 *   2. SAO scrape (public_betting table, exposed via /api/team-intel?op=public-betting)
 *      — bets%/money% per market on each game.
 *   3. VSiN consensus (consensus_picks table, refreshed daily 8am ET) — sharp money %s.
 *
 * Phase 2 will add a per-sportsbook grid (7 books) sourced from a future
 * public_book_lines table populated by the same SAO scraper.
 */

const SPORTS = [
  { k: 'all', l: 'ALL' },
  { k: 'nfl', l: 'NFL' },
  { k: 'cfb', l: 'CFB' },
  { k: 'mlb', l: 'MLB' },
  { k: 'nba', l: 'NBA' },
  { k: 'nhl', l: 'NHL' },
];

// ---------- name → standard abbr -----------------------------------------
// ESPN's `g.away.abbr` / `g.home.abbr` come back as proper league abbrs
// (TOR / BOS / OKC etc.) so usually we can lookup directly. This map is the
// safety net for paths where the source returns full names instead.
const NAME_TO_ABBR = {
  // MLB
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
  'washington nationals': 'WSH',
  // NBA
  'atlanta hawks': 'ATL', 'boston celtics': 'BOS', 'brooklyn nets': 'BKN',
  'charlotte hornets': 'CHA', 'chicago bulls': 'CHI', 'cleveland cavaliers': 'CLE',
  'dallas mavericks': 'DAL', 'denver nuggets': 'DEN', 'detroit pistons': 'DET',
  'golden state warriors': 'GS', 'houston rockets': 'HOU', 'indiana pacers': 'IND',
  'los angeles clippers': 'LAC', 'los angeles lakers': 'LAL', 'memphis grizzlies': 'MEM',
  'miami heat': 'MIA', 'milwaukee bucks': 'MIL', 'minnesota timberwolves': 'MIN',
  'new orleans pelicans': 'NO', 'new york knicks': 'NYK', 'oklahoma city thunder': 'OKC',
  'orlando magic': 'ORL', 'philadelphia 76ers': 'PHI', 'phoenix suns': 'PHX',
  'portland trail blazers': 'POR', 'sacramento kings': 'SAC', 'san antonio spurs': 'SA',
  'toronto raptors': 'TOR', 'utah jazz': 'UTAH', 'washington wizards': 'WAS',
  // NHL
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
function nameToAbbr(name) {
  if (!name) return '';
  return NAME_TO_ABBR[String(name).trim().toLowerCase()] || '';
}
// CWS (SAO/Yahoo) ↔ CHW (ESPN) — Chicago White Sox is the only chronic
// abbreviation mismatch in current data. Aliases are league-agnostic.
const ABBR_ALIASES = { CHW: 'CWS', CWS: 'CHW' };

// ---------- public betting % (SAO scrape) --------------------------------
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
function findPublicRow(publicIdx, g) {
  if (!g) return null;
  const a = (g.away?.abbr || nameToAbbr(g.away?.name) || '').toUpperCase();
  const h = (g.home?.abbr || nameToAbbr(g.home?.name) || '').toUpperCase();
  if (!a || !h) return null;
  const tries = [`${a}|${h}`, `${h}|${a}`];
  if (ABBR_ALIASES[a]) tries.push(`${ABBR_ALIASES[a]}|${h}`, `${h}|${ABBR_ALIASES[a]}`);
  if (ABBR_ALIASES[h]) tries.push(`${a}|${ABBR_ALIASES[h]}`, `${ABBR_ALIASES[h]}|${a}`);
  for (const k of tries) { if (publicIdx.has(k)) return publicIdx.get(k); }
  return null;
}

// ---------- VSiN consensus picks -----------------------------------------
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
function indexConsensus(rows) {
  const idx = new Map();
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
    const k = `${away.team}|${home.team}`;
    idx.set(k, { home, away });
    idx.set(k.toLowerCase(), { home, away });
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
function findConsensus(idx, g) {
  if (!idx || !g) return null;
  const a = g.away?.name || '';
  const h = g.home?.name || '';
  return idx.get(`${a}|${h}`)
    || idx.get(`${a}|${h}`.toLowerCase())
    || idx.get(`${lastWord(a)}|${lastWord(h)}`)
    || null;
}

// ====================================================================
export default function LinesRoute() {
  const [sport, setSport] = useState('mlb');

  // ESPN covers all 5 sports — pull all upcoming games from the unified
  // scoreboard, then filter by selected sport.
  const { games, loading } = useEspnScoreboard({
    leagues: ['nfl', 'cfb', 'mlb', 'nba', 'nhl'],
  });
  const consensusRows = useConsensusPicks(sport);
  const consensusIdx  = useMemo(() => indexConsensus(consensusRows), [consensusRows]);
  const publicRows    = usePublicBetting(sport);
  const publicIdx     = useMemo(() => indexPublicBetting(publicRows), [publicRows]);

  const upcoming = useMemo(
    () => games.filter((g) =>
      g.status === 'upcoming' && (sport === 'all' || g.league === sport)
    ),
    [games, sport]
  );

  return (
    <section>
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Lines &amp; public splits</div>
          <div className="trc-final">
            {upcoming.length}
            <span className="trc-final-sub">
              upcoming game{upcoming.length === 1 ? '' : 's'}
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

      {!loading && upcoming.length === 0 && (
        <div className="empty">No upcoming {sport === 'all' ? '' : sport.toUpperCase() + ' '}games.</div>
      )}

      {upcoming.map((g) => {
        const pub = findPublicRow(publicIdx, g);
        const consensus = findConsensus(consensusIdx, g);
        return (
          <div key={g.id} className="lines-block">
            <div className="lines-head">
              <span className={'lg-badge ' + g.league}>{g.league.toUpperCase()}</span>
              <strong>{g.away?.abbr} @ {g.home?.abbr}</strong>
              {g.week && <span className="wk">{g.week}</span>}
              <span className="lines-time">
                {g.kickoff ? new Date(g.kickoff).toLocaleString([], { weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
              </span>
            </div>

            {/* Game-level numbers from ESPN. These are the consensus open
                line — when we ship Phase 2 of the SAO scraper this gets
                replaced with the per-sportsbook grid. */}
            <table className="lines-table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>{g.away?.abbr || 'Away'}</th>
                  <th>{g.home?.abbr || 'Home'}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="lines-market">Spread</td>
                  <td className="lines-cell">{spreadFor(g.spread, g.away?.abbr) || '—'}</td>
                  <td className="lines-cell">{spreadFor(g.spread, g.home?.abbr) || '—'}</td>
                </tr>
                <tr>
                  <td className="lines-market">Total</td>
                  <td className="lines-cell" colSpan={2}>{g.ou ? `O/U ${g.ou}` : '—'}</td>
                </tr>
                {pub && (
                  <tr>
                    <td className="lines-market" style={{ color: 'var(--orange)' }}>Public money</td>
                    <td className="lines-cell" colSpan={2} style={{ textAlign: 'left', paddingLeft: 14, color: 'var(--ink)', fontSize: 13 }}>
                      {pub.spreadHomePctBets != null && (
                        <span style={{ marginRight: 18 }}>
                          Spread: <strong>{pub.spreadHomePctBets}%</strong> bets ·{' '}
                          <strong>{pub.spreadHomePctMoney != null ? pub.spreadHomePctMoney + '%' : '—'}</strong> $ on home
                        </span>
                      )}
                      {pub.totalOverPctBets != null && (
                        <span style={{ marginRight: 18 }}>
                          Total: <strong>{pub.totalOverPctBets}%</strong> bets ·{' '}
                          <strong>{pub.totalOverPctMoney != null ? pub.totalOverPctMoney + '%' : '—'}</strong> $ on Over
                        </span>
                      )}
                      {pub.mlHomePctBets != null && (
                        <span>
                          ML: <strong>{pub.mlHomePctBets}%</strong> bets ·{' '}
                          <strong>{pub.mlHomePctMoney != null ? pub.mlHomePctMoney + '%' : '—'}</strong> $ on home
                        </span>
                      )}
                    </td>
                  </tr>
                )}
                {consensus && (
                  <tr>
                    <td className="lines-market" style={{ color: 'var(--gold)' }}>Sharp consensus</td>
                    <td className="lines-cell" colSpan={2} style={{ textAlign: 'left', paddingLeft: 14, color: 'var(--ink)', fontSize: 13 }}>
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
        Spreads/totals from ESPN. Public splits scraped daily from public sportsbook trend pages.
        Sharp consensus from VSiN refreshed at 8am ET.
        21+. Bet responsibly. 1-800-GAMBLER.
      </p>
    </section>
  );
}

// Pull the side-specific spread out of an ESPN spread string like
// "BOS -1.5" or "PIT -2½". Returns "-1.5" for the favored team and the
// inverse for the underdog. Falls back to dash if the string can't be
// parsed.
function spreadFor(spread, abbr) {
  if (!spread || !abbr) return '';
  const m = String(spread).match(/^([A-Z]+)\s*([+-]?\d+(?:\.\d+)?)/);
  if (!m) return '';
  const favored = m[1];
  const num = Number(m[2]);
  if (favored === abbr) return num > 0 ? `+${num}` : String(num);
  // Other side — flip sign.
  const inv = -num;
  return inv > 0 ? `+${inv}` : String(inv);
}
