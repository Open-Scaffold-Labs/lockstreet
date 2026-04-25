import { useMemo, useState } from 'react';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';
import { usePicks } from '../hooks/usePicks.js';
import { useSubscription } from '../hooks/useSubscription.js';
import GameCard from '../components/GameCard.jsx';

export default function ScoresRoute() {
  const { games, loading, error } = useEspnScoreboard();
  const { picks } = usePicks();
  const sub = useSubscription();
  const [sport, setSport] = useState('all');

  const filtered = useMemo(
    () => games.filter((g) => sport === 'all' || g.league === sport),
    [games, sport]
  );

  return (
    <section>
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

      {loading && <div className="empty">Loading scoreboard…</div>}
      {error   && <div className="empty">Couldn't reach ESPN right now. Retrying in 30 s.</div>}
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
