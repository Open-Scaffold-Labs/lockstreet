import { useEffect, useMemo, useState } from 'react';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';

/**
 * Player-prop board.
 * Fetches live props from /api/odds-props (server-side proxy to The Odds API),
 * which requires an event ID per game — so we first hit the scoreboard for
 * upcoming games, then look up matching events from /api/odds (cached) to get
 * Odds-API event IDs, then pull props for those events.
 *
 * Falls back to a small sample prop board when the API key isn't set or when
 * /api isn't running locally (plain `vite` without `vercel dev`).
 */

const SPORTS = [
  { k: 'nfl', label: 'NFL' },
  { k: 'cfb', label: 'NCAAF' },
  { k: 'mlb', label: 'MLB' },
  { k: 'nba', label: 'NBA' },
  { k: 'nhl', label: 'NHL' },
];

const STAT_LABELS = {
  // Football
  player_pass_yds:       'Passing Yds',
  player_rush_yds:       'Rushing Yds',
  player_reception_yds:  'Receiving Yds',
  player_anytime_td:     'Anytime TD',
  player_pass_tds:       'Passing TDs',
  // Baseball
  batter_hits:           'Hits',
  batter_total_bases:    'Total Bases',
  batter_home_runs:      'HR',
  pitcher_strikeouts:    'Strikeouts',
  // Basketball
  player_points:         'Points',
  player_rebounds:       'Rebounds',
  player_assists:        'Assists',
  player_threes:         '3-Pointers',
  // Hockey
  player_goals:          'Goals',
  player_shots_on_goal:  'Shots',
};

// Default to whatever sport is in season right now (April = MLB/NBA/NHL active).
const DEFAULT_SPORT = (() => {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 9 || month <= 1) return 'nfl';   // Sep-Jan: football
  if (month >= 4 && month <= 6) return 'nba';   // Apr-Jun: NBA playoffs / MLB early
  return 'mlb';                                  // Jul-Aug + fallback
})();

// ---------- mock fallback ----------
const MOCK_PROPS = [
  { sport: 'nfl', player: 'J. Hurts',     team: 'PHI', stat: 'Passing Yds',   line: 247.5, over: -110, under: -110 },
  { sport: 'nfl', player: 'A.J. Brown',   team: 'PHI', stat: 'Receiving Yds', line:  74.5, over: -115, under: -105 },
  { sport: 'nfl', player: 'S. Barkley',   team: 'PHI', stat: 'Rushing Yds',   line:  82.5, over: -120, under: +100 },
  { sport: 'nfl', player: 'D. Prescott',  team: 'DAL', stat: 'Passing Yds',   line: 268.5, over: -110, under: -110 },
  { sport: 'nfl', player: 'CeeDee Lamb',  team: 'DAL', stat: 'Receiving Yds', line:  88.5, over: -110, under: -110 },
  { sport: 'nfl', player: 'P. Mahomes',   team: 'KC',  stat: 'Passing TDs',   line:   2.5, over: +110, under: -130 },
  { sport: 'nfl', player: 'T. Kelce',     team: 'KC',  stat: 'Anytime TD',    line: null,  over: -150, under: +130 },
  { sport: 'cfb', player: 'J. Smith',     team: 'OSU', stat: 'Passing Yds',   line: 285.5, over: -115, under: -105 },
  { sport: 'cfb', player: 'M. Anderson',  team: 'MICH',stat: 'Rushing Yds',   line: 102.5, over: -110, under: -110 },
];

// ---------- live data: 2-step fetch (event IDs, then props) ----------
function useLiveProps(sport) {
  const [rows, setRows] = useState([]);     // normalized props
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading'); setError(null);

    (async () => {
      try {
        // 1) get event IDs from /api/odds for this sport
        const oddsRes = await fetch(`/api/odds?sport=${sport}`);
        if (!oddsRes.ok) {
          const j = await oddsRes.json().catch(() => ({}));
          throw new Error(j.error || `odds HTTP ${oddsRes.status}`);
        }
        const oddsJson = await oddsRes.json();
        const events = (oddsJson.events || []).slice(0, 6); // cap to first 6 to save API calls
        if (events.length === 0) { if (!cancelled) { setRows([]); setStatus('ready'); } return; }

        // 2) fetch props for those events (server caches 10min so reloads are cheap)
        const ids = events.map((e) => e.id).join(',');
        const propsRes = await fetch(`/api/odds-props?sport=${sport}&eventIds=${ids}`);
        if (!propsRes.ok) {
          const j = await propsRes.json().catch(() => ({}));
          throw new Error(j.error || `props HTTP ${propsRes.status}`);
        }
        const propsJson = await propsRes.json();

        // 3) flatten into per-player-per-market rows; pick the FIRST book per market
        const flat = [];
        for (const ev of propsJson.events || []) {
          const home = ev.home_team || '';
          const away = ev.away_team || '';
          const matchup = away && home ? `${shortTeam(away)}@${shortTeam(home)}` : '';
          for (const bk of ev.bookmakers || []) {
            for (const m of bk.markets || []) {
              const label = STAT_LABELS[m.key];
              if (!label) continue;
              // Pair Over/Under outcomes by description (player name)
              const byPlayer = new Map();
              for (const o of m.outcomes || []) {
                const player = o.description || o.name;
                if (!player) continue;
                const entry = byPlayer.get(player) || { player, line: o.point ?? null, over: null, under: null };
                if (o.name === 'Over' || o.name === 'Yes') entry.over = o.price;
                else if (o.name === 'Under' || o.name === 'No') entry.under = o.price;
                else if (entry.over == null) entry.over = o.price;
                if (o.point != null) entry.line = o.point;
                byPlayer.set(player, entry);
              }
              for (const e of byPlayer.values()) {
                flat.push({
                  sport,
                  player: e.player,
                  team: matchup,
                  stat: label,
                  line: e.line,
                  over: e.over,
                  under: e.under,
                  book: bk.title,
                });
              }
            }
            break; // only first book per event so the board isn't 5x duplicated
          }
        }

        if (!cancelled) {
          setRows(flat);
          setRemaining(oddsJson.remaining ?? null);
          setStatus('ready');
        }
      } catch (e) {
        if (!cancelled) { setError(String(e.message || e)); setStatus('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [sport]);

  return { rows, status, error, remaining };
}

function shortTeam(name) {
  if (!name) return '';
  // Last word as a quick visible team marker (e.g. "Eagles" from "Philadelphia Eagles")
  const parts = String(name).trim().split(/\s+/);
  return parts[parts.length - 1].slice(0, 4).toUpperCase();
}

export default function PropsRoute() {
  const [sport, setSport] = useState(DEFAULT_SPORT);
  const [stat, setStat]   = useState('all');
  const live = useLiveProps(sport);

  const usingLive = live.status === 'ready' && live.rows.length > 0;
  const sourceRows = usingLive ? live.rows : MOCK_PROPS.filter((p) => p.sport === sport);

  const stats = useMemo(
    () => Array.from(new Set(sourceRows.map((p) => p.stat))),
    [sourceRows]
  );

  const filtered = useMemo(
    () => sourceRows.filter((p) => stat === 'all' || p.stat === stat),
    [sourceRows, stat]
  );

  return (
    <section>
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Player props</div>
          <div className="trc-final">
            {filtered.length}<span className="trc-final-sub">
              props on the board · {usingLive ? 'live' : 'sample'}
              {usingLive && live.remaining != null ? ` · ${live.remaining} API calls left` : ''}
            </span>
          </div>
        </div>
        <div className="filter">
          {SPORTS.map((s) => (
            <button key={s.k} className={sport === s.k ? 'active' : ''} onClick={() => setSport(s.k)}>{s.label}</button>
          ))}
        </div>
      </div>

      {live.status === 'error' && (
        <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: -6, marginBottom: 12 }}>
          Live props unavailable ({live.error}). Showing sample data.
        </p>
      )}
      {live.status === 'loading' && (
        <p style={{ color: 'var(--ink-dim)' }}>Loading props...</p>
      )}

      <div className="filter" style={{ marginBottom: 14 }}>
        <button className={stat === 'all' ? 'active' : ''} onClick={() => setStat('all')}>ALL</button>
        {stats.map((s) => (
          <button key={s} className={stat === s ? 'active' : ''} onClick={() => setStat(s)}>{s.toUpperCase()}</button>
        ))}
      </div>

      <div className="bk-table">
        {filtered.map((p, i) => (
          <div key={i} className="bk-row res-pending">
            <div className="bk-row-main">
              <div className="bk-row-desc">
                <span className={'lg-badge ' + (p.sport === 'nfl' ? 'nfl' : 'cfb')}>{(SPORTS.find((s) => s.k === p.sport)?.label) || p.sport.toUpperCase()}</span>
                <strong>{p.player}</strong>
                <span className="bk-odds">{p.team}</span>
                <span className="bk-odds" style={{ color: 'var(--gold)' }}>{p.stat}</span>
              </div>
              <div className="bk-row-meta">
                {p.line != null ? `Line: ${p.line}` : 'Yes/No prop'}
                {p.book ? ` · ${p.book}` : ''}
              </div>
            </div>
            <div className="bk-row-pl" style={{ gap: 6 }}>
              <div className="prop-side">
                <span className="prop-label">{p.line != null ? 'O' : 'YES'}</span>
                <span className="prop-odd">{p.over == null ? '—' : (p.over > 0 ? '+' : '')}{p.over ?? ''}</span>
              </div>
              <div className="prop-side">
                <span className="prop-label">{p.line != null ? 'U' : 'NO'}</span>
                <span className="prop-odd">{p.under == null ? '—' : (p.under > 0 ? '+' : '')}{p.under ?? ''}</span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && live.status === 'ready' && (
          <div className="empty">No props available right now.</div>
        )}
      </div>

      <p className="footnote-disclaimer" style={{ maxWidth: 600 }}>
        {usingLive
          ? 'Live props via The Odds API (server-cached 10 min). Showing the first book per event to save quota.'
          : 'Sample prop board. Set ODDS_API_KEY (free 500/mo at the-odds-api.com) to enable live props.'}
      </p>
    </section>
  );
}
