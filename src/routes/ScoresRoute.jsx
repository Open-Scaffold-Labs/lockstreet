import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';
import { usePicks } from '../hooks/usePicks.js';
import { useSubscription } from '../hooks/useSubscription.js';
import GameCard from '../components/GameCard.jsx';

// Heuristic: if total games this week is small AND most kickoffs are > 7 days out,
// treat as off-season for a friendlier display.
function isOffSeason(games) {
  if (!games?.length) return true;
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const upcomingSoon = games.filter((g) => {
    const k = new Date(g.kickoff || 0).getTime();
    return k - now < sevenDays && k - now > -3 * 24 * 60 * 60 * 1000;
  });
  return upcomingSoon.length < 3;
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

export default function ScoresRoute() {
  const { games, loading, error } = useEspnScoreboard();
  const { picks } = usePicks();
  const sub = useSubscription();
  const [sport, setSport] = useState('all');

  const filtered = useMemo(
    () => games.filter((g) => sport === 'all' || g.league === sport),
    [games, sport]
  );

  const offSeason = useMemo(() => !loading && !error && isOffSeason(games), [games, loading, error]);
  const nflStart = nextSeasonStart('nfl');
  const cfbStart = nextSeasonStart('cfb');
  const nflDays = daysUntil(nflStart);
  const cfbDays = daysUntil(cfbStart);

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

      <div className="filter">
        {[
          { k: 'all', label: 'ALL' },
          { k: 'nfl', label: 'NFL' },
          { k: 'cfb', label: 'CFB' },
        ].map((s) => (
          <button key={s.k} className={sport === s.k ? 'active' : ''} onClick={() => setSport(s.k)}>
            {s.label}
          </button>
        ))}
      </div>

      {loading && <div className="empty">Loading scoreboard...</div>}
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
