import { useMemo, useState } from 'react';
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

  const [q, setQ]            = useState('');
  const [league, setLeague]  = useState('all');     // all | nfl | cfb
  const [result, setResult]  = useState('all');     // all | win | loss | push | pending
  const [vis, setVis]        = useState('all');     // all | public | paid

  const allPicks = useMemo(() => Object.values(picks), [picks]);

  const filteredPicks = useMemo(() => {
    return allPicks.filter((p) => {
      if (league !== 'all' && p.league !== league) return false;
      if (result !== 'all' && p.result !== result) return false;
      if (vis    !== 'all' && p.visibility !== vis) return false;
      if (q && !p.side?.toLowerCase().includes(q.toLowerCase())
            && !p.reasoning?.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [allPicks, league, result, vis, q]);

  // Match filtered picks to ESPN games (so we can render GameCard)
  const cards = useMemo(() => {
    return filteredPicks.map((p) => ({
      pick: p,
      game: games.find((g) => g.id === p.gameId) || synthesizeGame(p),
    }));
  }, [filteredPicks, games]);

  if (loading || picksLoading) return <SkeletonCardGrid count={6} />;

  if (allPicks.length === 0) return <PicksEmptyState />;

  return (
    <section>
      <PicksFilterBar
        q={q} setQ={setQ}
        league={league} setLeague={setLeague}
        result={result} setResult={setResult}
        vis={vis} setVis={setVis}
        total={allPicks.length} shown={filteredPicks.length}
      />
      {cards.length === 0 ? (
        <div className="empty">No picks match those filters.</div>
      ) : (
        <div className="grid">
          {cards.map(({ game, pick }, i) => (
            <GameCard
              key={pick.id || pick.gameId}
              game={game}
              pick={pick}
              pickUnlocked={sub.active || pick.visibility === 'public'}
              delay={Math.min(i, 10) * 0.04}
            />
          ))}
        </div>
      )}
    </section>
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


function PicksFilterBar({ q, setQ, league, setLeague, result, setResult, vis, setVis, total, shown }) {
  const Btn = ({ active, onClick, children }) => (
    <button onClick={onClick} className={'filter-btn' + (active ? ' active' : '')}>{children}</button>
  );
  return (
    <div className="picks-filter">
      <input
        className="picks-search"
        type="search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${total} picks (team, side, reasoning)...`}
      />
      <div className="picks-filter-row">
        <div className="picks-filter-group">
          <span className="picks-filter-label">League</span>
          <Btn active={league === 'all'} onClick={() => setLeague('all')}>All</Btn>
          <Btn active={league === 'nfl'} onClick={() => setLeague('nfl')}>NFL</Btn>
          <Btn active={league === 'cfb'} onClick={() => setLeague('cfb')}>CFB</Btn>
        </div>
        <div className="picks-filter-group">
          <span className="picks-filter-label">Result</span>
          <Btn active={result === 'all'}     onClick={() => setResult('all')}>All</Btn>
          <Btn active={result === 'pending'} onClick={() => setResult('pending')}>Pending</Btn>
          <Btn active={result === 'win'}     onClick={() => setResult('win')}>Win</Btn>
          <Btn active={result === 'loss'}    onClick={() => setResult('loss')}>Loss</Btn>
          <Btn active={result === 'push'}    onClick={() => setResult('push')}>Push</Btn>
        </div>
        <div className="picks-filter-group">
          <span className="picks-filter-label">Tier</span>
          <Btn active={vis === 'all'}    onClick={() => setVis('all')}>All</Btn>
          <Btn active={vis === 'public'} onClick={() => setVis('public')}>Free</Btn>
          <Btn active={vis === 'paid'}   onClick={() => setVis('paid')}>Paid</Btn>
        </div>
      </div>
      <div className="picks-filter-count">{shown} of {total} picks</div>
    </div>
  );
}

/** Build a minimal "game" object from a pick when ESPN's current scoreboard doesn't have it (past games). */
function synthesizeGame(pick) {
  return {
    id: pick.gameId,
    league: pick.league || 'nfl',
    week: pick.week ? `Week ${pick.week}` : '',
    status: pick.result === 'pending' ? 'upcoming' : 'final',
    period: pick.result === 'pending' ? '' : 'Final',
    kickoff: pick.locksAt || pick.postedAt,
    home: { abbr: '?', city: '', name: '' },
    away: { abbr: '?', city: '', name: '' },
    score: null, spread: null, ou: null, move: null,
  };
}
