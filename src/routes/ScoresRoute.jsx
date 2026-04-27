import { useMemo, useState } from 'react';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';
import { ALL_LEAGUES } from '../lib/espn.js';
import { usePicks } from '../hooks/usePicks.js';
import { useSubscription } from '../hooks/useSubscription.js';
import { isFootballOffSeason } from '../lib/offseason.js';
import GameCard from '../components/GameCard.jsx';
import { SkeletonCardGrid } from '../components/Skeleton.jsx';

// Date helpers for the date-tab feature
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}
function diffDays(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / MS_PER_DAY);
}
// ESPN expects dates in YYYYMMDD
function espnDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
function formatDate(d, offset) {
  // For today/tomorrow/yesterday, swap the weekday for the human label.
  // e.g. "Today, Apr 26" instead of "Sun, Apr 26 · TODAY".
  const md = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (offset === 0)  return `Today, ${md}`;
  if (offset === 1)  return `Tomorrow, ${md}`;
  if (offset === -1) return `Yesterday, ${md}`;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ScoresRoute() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const offset = diffDays(selectedDate, today);  // -7..+7

  // Always pass an explicit YYYYMMDD date — ESPN's "no-date" default for
  // /scoreboard sometimes returns yesterday's late games alongside today's
  // games, making the Today and Yesterday tabs look identical. Pinning the
  // date param to the user's local date forces ESPN to return only that day.
  const espnDateParam = espnDate(selectedDate);

  const { games, loading, error } = useEspnScoreboard({
    leagues: ALL_LEAGUES,
    date: espnDateParam,
  });
  const { picks } = usePicks();
  const sub = useSubscription();
  const [sport, setSport] = useState('all');

  const filtered = useMemo(
    () => games.filter((g) => sport === 'all' || g.league === sport),
    [games, sport]
  );

  // When ALL is selected, group games by league and order playoff sports first
  // (NBA + NHL active in late spring), then regular-season sports. Leagues
  // with zero games on the day are dropped — no empty groups rendered.
  const LEAGUE_ORDER = ['nba', 'nhl', 'mlb', 'nfl', 'cfb'];
  const groupedByLeague = useMemo(() => {
    if (sport !== 'all') return null;
    const buckets = {};
    for (const g of filtered) {
      if (!buckets[g.league]) buckets[g.league] = [];
      buckets[g.league].push(g);
    }
    return LEAGUE_ORDER
      .filter((lg) => buckets[lg]?.length)
      .map((lg) => ({ league: lg, games: buckets[lg] }));
  }, [filtered, sport]);

  // Off-season detection — football has no current games. We only check
  // this against TODAY's slate (offset 0); on past/future dates the user is
  // explicitly browsing a specific day so the off-season fallback shouldn't
  // apply.
  const footballOffSeason = useMemo(
    () => offset === 0 && !loading && !error && isFootballOffSeason(games),
    [offset, games, loading, error]
  );

  // Show NFL schedule notice only when the user has explicitly filtered to NFL
  // (not on the All view) AND it's currently football off-season.
  const showNflScheduleNotice = sport === 'nfl' && footballOffSeason;

  // Hide the date tab when the active filter is a football league AND it's
  // off-season — those filters fall back to the placeholder content. For ALL,
  // MLB, NBA, NHL the date tab is always visible (those have year-round slates
  // or are currently in season).
  const hideDateTab = footballOffSeason && (sport === 'nfl' || sport === 'cfb');

  function shiftDate(delta) {
    const next = addDays(selectedDate, delta);
    const nextOffset = diffDays(next, today);
    if (nextOffset < -7 || nextOffset > 7) return;
    setSelectedDate(next);
  }

  return (
    <section>
      {!hideDateTab && (
        <div className="date-tab">
          <button
            type="button"
            className="date-tab-arrow"
            onClick={() => shiftDate(-1)}
            disabled={offset <= -7}
            aria-label="Previous day"
          >‹</button>
          <span className="date-tab-label">
            {formatDate(selectedDate, offset)}
          </span>
          <button
            type="button"
            className="date-tab-arrow"
            onClick={() => shiftDate(1)}
            disabled={offset >= 7}
            aria-label="Next day"
          >›</button>
        </div>
      )}

      <div className="filter">
        {[
          { k: 'all', label: 'ALL' },
          { k: 'nfl', label: 'NFL' },
          { k: 'cfb', label: 'CFB' },
          { k: 'mlb', label: 'MLB' },
          { k: 'nba', label: 'NBA' },
          { k: 'nhl', label: 'NHL' },
        ].map((s) => (
          <button key={s.k} className={sport === s.k ? 'active' : ''} onClick={() => setSport(s.k)}>
            {s.label}
          </button>
        ))}
      </div>

      {showNflScheduleNotice && (
        <div className="empty" style={{ padding: '14px 18px', marginBottom: 14, fontSize: 13 }}>
          <strong style={{ color: 'var(--orange)' }}>Projected 2026 NFL schedule release: May 13–14.</strong>{' '}
          <span style={{ color: 'var(--ink-dim)' }}>Last season's Super Bowl below.</span>
        </div>
      )}

      {loading && <SkeletonCardGrid count={6} />}
      {error   && <div className="empty">Couldn't reach ESPN right now. Retrying in 30s.</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="empty">No games on the slate.</div>
      )}

      {sport === 'all' && groupedByLeague ? (
        groupedByLeague.map((group) => (
          <div key={group.league} className="scores-group">
            <div className="scores-group-h">
              <span className={'lg-badge ' + group.league}>{group.league.toUpperCase()}</span>
              <span className="scores-group-count">{group.games.length} game{group.games.length === 1 ? '' : 's'}</span>
            </div>
            <div className="grid">
              {group.games.map((g, i) => (
                <GameCard
                  key={g.id}
                  game={g}
                  pick={picks[g.id]}
                  pickUnlocked={sub.active}
                  delay={Math.min(i, 10) * 0.04}
                  hideLeagueBadge
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="grid">
          {filtered.map((g, i) => (
            <GameCard
              key={g.id}
              game={g}
              pick={picks[g.id]}
              pickUnlocked={sub.active}
              delay={Math.min(i, 10) * 0.04}
            />
          ))}
        </div>
      )}
    </section>
  );
}
