import { useMemo } from 'react';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';
import { usePicks } from '../hooks/usePicks.js';
import { useSubscription } from '../hooks/useSubscription.js';
import GameCard from '../components/GameCard.jsx';

export default function PicksRoute() {
  const { games, loading } = useEspnScoreboard();
  const { picks, loading: picksLoading } = usePicks();
  const sub = useSubscription();

  const list = useMemo(
    () => games.filter((g) => picks[g.id]),
    [games, picks]
  );

  if (loading || picksLoading) return <div className="empty">Loading picks…</div>;
  if (list.length === 0) return (
    <div className="empty">
      No picks posted yet. Picks drop on game day — locked until kickoff.
    </div>
  );

  return (
    <div className="grid">
      {list.map((g, i) => (
        <GameCard
          key={g.id}
          game={g}
          pick={picks[g.id]}
          pickUnlocked={sub.active}
          delay={Math.min(i, 10) * 0.04}
        />
      ))}
    </div>
  );
}
