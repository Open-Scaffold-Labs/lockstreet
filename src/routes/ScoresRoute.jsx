import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';
import { ALL_LEAGUES } from '../lib/espn.js';
import { usePicks } from '../hooks/usePicks.js';
import { useSubscription } from '../hooks/useSubscription.js';
import GameCard from '../components/GameCard.jsx';
import { SkeletonCardGrid } from '../components/Skeleton.jsx';

// Heuristic: if total football (NFL/CFB) games on the slate is small,
// treat as football off-season for a friendlier display. Other sports
// running daily means `games.length` could be 30+ even with no football,
// so we narrow the heuristic to the football leagues specifically.
function isFootballOffSeason(games) {
  const football = (games || []).filter((g) => g.league === 'nfl' || g.league === 'cfb');
  if (football.length === 0) return true;
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const soon = football.filter((g) => {
    const k = new Date(g.kickoff || 0).getTime();
    return k - now < sevenDays && k - now > -3 * 24 * 60 * 60 * 1000;
  });
  return soon.length < 3;
}
function nextSeasonStart(league) {
  // Hardcoded for the 2026 season — adjust each summer.
  if (league === 'nfl') return new Date('2026-09-10T20:00:00-04:00');
  if (league === 'cfb') return new Date('2026-08-23T12:00:00-04:00');
  return null;
}

function daysUntil(date) {
  if (!date) return null;
  const ms = date.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

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
function formatDate(d) {
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ScoresRoute() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const offset = diffDays(selectedDate, today);  // -7..+7

  // When the user is on today, pass null so ESPN returns its usual "today's
  // slate" + we get the live-polling refresh. Other days pass the explicit date.
  const espnDateParam = offset === 0 ? null : espnDate(selectedDate);

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

  // Off-season detection — football has no current games. We only check
  // this against TODAY's slate (offset 0); on past/future dates the user is
  // explicitly browsing a specific day so the off-season fallback shouldn't
  // apply.
  const footballOffSeason = useMemo(
    () => offset === 0 && !loading && !error && isFootballOffSeason(games),
    [offset, games, loading, error]
  );

  // Show NFL schedule notice when on TODAY + NFL/ALL filter + football off-season.
  const showNflScheduleNotice = (sport === 'all' || sport === 'nfl') && footballOffSeason;

  // Show off-season banner same gating.
  const offSeason = footballOffSeason && (sport === 'all' || sport === 'nfl' || sport === 'cfb');
  const nflStart = nextSeasonStart('nfl');
  const cfbStart = nextSeasonStart('cfb');
  const nflDays = daysUntil(nflStart);
  const cfbDays = daysUntil(cfbStart);

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
      {offSeason && (
        <div className="off-season-banner">
          <div className="osb-row">
            <div className="osb-label">OFF-SEASON</div>
            <div className="osb-stats">
              <span><strong>{cfbDays}</strong> days to CFB Week 1</span>
              <span className="osb-dot">·</span>
              <span><strong>{nflDays}</strong> days to NFL kickoff</span>
            </div>
          </div>
          <div className="osb-cta">
            Live picks return when the season does. Lock in annual now ($500/yr · ~$9.60/wk effective)
            to be ready for week 1.
            <Link to="/subscribe" className="osb-link">See pricing →</Link>
          </div>
        </div>
      )}

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
            {formatDate(selectedDate)}
            {offset === 0  && <span className="date-tab-pill date-tab-pill-today">TODAY</span>}
            {offset === 1  && <span className="date-tab-pill">TOMORROW</span>}
            {offset === -1 && <span className="date-tab-pill">YESTERDAY</span>}
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
    </section>
  );
}
