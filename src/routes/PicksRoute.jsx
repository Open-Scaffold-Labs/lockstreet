import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';
import { usePicks } from '../hooks/usePicks.js';
import { useSubscription } from '../hooks/useSubscription.js';
import GameCard from '../components/GameCard.jsx';
import { SkeletonCardGrid } from '../components/Skeleton.jsx';

export default function PicksRoute() {
  const { games, loading } = useEspnScoreboard();
  const { picks, loading: picksLoading } = usePicks();
  const sub = useSubscription();

  const list = useMemo(
    () => games.filter((g) => picks[g.id]),
    [games, picks]
  );

  if (loading || picksLoading) return <SkeletonCardGrid count={6} />;

  if (list.length === 0) return <PicksEmptyState />;

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

function PicksEmptyState() {
  // 3 sample matchups as visual teaser of what a paid pick card looks like.
  const samples = [
    { league: 'NFL', away: 'PHI', home: 'DAL', spread: '-3.5', total: 'O 47.5' },
    { league: 'CFB', away: 'OSU', home: 'MICH', spread: '+6',  total: 'U 51' },
    { league: 'NFL', away: 'BUF', home: 'KC',   spread: '+2.5', total: 'O 49.5' },
  ];

  return (
    <section className="picks-empty">
      <div className="picks-empty-hero">
        <span className="hero-eyebrow">Subscriber-only content</span>
        <h2>Picks drop game day. <span className="accent">Locked at kickoff.</span></h2>
        <p>
          4 NFL + 4 CFB picks against the spread, every week, with full reasoning
          and unit sizing. Paid picks never go public — your edge stays your edge.
        </p>
        <div className="hero-cta-row">
          <Link to="/subscribe" className="btn-gold btn-lg">Subscribe</Link>
          <Link to="/about" className="btn-ghost btn-lg">See track record</Link>
        </div>
      </div>

      <div className="sample-label">Preview · what a paid pick looks like</div>
      <div className="grid">
        {samples.map((s, i) => (
          <div key={i} className="card sample-card" style={{ animationDelay: `${i * 0.06}s` }}>
            <div className="card-top">
              <span className={'lg-badge ' + s.league.toLowerCase()}>{s.league}</span>
              <span className="wk">SAMPLE</span>
            </div>
            <div className="teams">
              <div className="team-row">
                <div className="orb">{s.away}</div>
                <div className="tcol"><div className="tabbr">{s.away}</div></div>
                <div className="score muted">—</div>
              </div>
              <div className="team-row">
                <div className="orb">{s.home}</div>
                <div className="tcol"><div className="tabbr">{s.home}</div></div>
                <div className="score muted">—</div>
              </div>
            </div>
            <div className="lines">
              <span className="pill"><span className="k">SPREAD</span>{s.home} {s.spread}</span>
              <span className="pill"><span className="k">TOTAL</span>{s.total}</span>
            </div>
            <div className="pick">
              <div className="pick-label">Lock Street pick</div>
              <div className="pick-side" style={{ filter: 'blur(6px)' }}>HIDDEN</div>
              <div className="pick-units" style={{ filter: 'blur(4px)' }}>?u</div>
              <Link to="/subscribe" className="pick-locked">SUBSCRIBE TO UNLOCK</Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
